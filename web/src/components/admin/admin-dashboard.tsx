'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { decodeEventLog, type Address, type Hex } from 'viem';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';

import { ecimultisig } from '@/abi/ecimultisig';
import { api } from '@/lib/api';
import { encodeAdvancePhase, encodeCreateElection } from '@/lib/admin-tx';
import { ELECTION_MANAGER_ADDRESS, MULTISIG_ADDRESS } from '@/lib/chain';
import { isDemoWalletOffered } from '@/lib/demo-connector';
import { CHAIN_ID, RPC_URL } from '@/lib/env';
import type { ElectionContext } from '@/lib/multisig';
import { PendingTransactions, type PendingTx } from './pending-transactions';
import { ProposeForms } from './propose-forms';

const MAX_LISTED_TXS = 100;

/**
 * ECI multi-sig control panel. Reads pending transactions, decodes them into
 * plain language, and lets owners submit/approve/execute. Voters never see
 * this page — it lives under the admin-only wallet provider.
 */
export function AdminDashboard() {
  const t = useTranslations();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [busyId, setBusyId] = useState<number | null>(null);
  const [proposing, setProposing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [switchFailed, setSwitchFailed] = useState(false);

  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  const multisig = { address: MULTISIG_ADDRESS, abi: ecimultisig } as const;

  const thresholdQuery = useReadContract({
    ...multisig,
    functionName: 'threshold',
    query: { enabled: isConnected && !wrongNetwork }
  });
  const txCountQuery = useReadContract({
    ...multisig,
    functionName: 'txCount',
    query: { enabled: isConnected && !wrongNetwork }
  });
  const ownerQuery = useReadContract({
    ...multisig,
    functionName: 'isOwner',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: isConnected && !wrongNetwork && address != null }
  });

  const txCount = txCountQuery.data == null ? 0 : Number(txCountQuery.data);
  const txIds = useMemo(() => {
    const start = Math.max(0, txCount - MAX_LISTED_TXS);
    return Array.from({ length: txCount - start }, (_, index) => txCount - 1 - index);
  }, [txCount]);

  const txsQuery = useReadContracts({
    contracts: txIds.flatMap((id) => [
      { ...multisig, functionName: 'transactions', args: [BigInt(id)] },
      {
        ...multisig,
        functionName: 'approved',
        args: [BigInt(id), address ?? '0x0000000000000000000000000000000000000000']
      }
    ]),
    query: { enabled: isConnected && !wrongNetwork && txIds.length > 0 }
  });

  const electionsQuery = useQuery({
    queryKey: ['elections'],
    queryFn: ({ signal }) => api.getElections(signal),
    enabled: isConnected && !wrongNetwork
  });

  const electionsById = useMemo(() => {
    const map = new Map<string, ElectionContext>();
    for (const election of electionsQuery.data ?? []) {
      map.set(election.id, { constituencyId: election.constituencyId, phase: election.phase });
    }
    return map;
  }, [electionsQuery.data]);

  const txs: PendingTx[] = useMemo(
    () =>
      txIds.flatMap((id, index) => {
        const txn = txsQuery.data?.[index * 2];
        const approved = txsQuery.data?.[index * 2 + 1];
        if (txn?.status !== 'success') return [];
        const [target, data, approvals, executed] = txn.result as unknown as [Address, Hex, bigint, boolean];
        return [
          {
            id,
            target,
            data,
            approvals,
            executed,
            approvedByMe: approved?.status === 'success' ? (approved.result as unknown as boolean) : false
          }
        ];
      }),
    [txIds, txsQuery.data]
  );

  const { writeContract, data: txHash, reset: resetWrite } = useWriteContract();
  const receiptQuery = useWaitForTransactionReceipt({ hash: txHash });

  // After each confirmed wallet transaction, refresh the on-chain reads and,
  // for proposals, announce the new transaction id from the Submitted event.
  useEffect(() => {
    if (receiptQuery.status !== 'success' || !receiptQuery.data) return;
    void thresholdQuery.refetch();
    void txCountQuery.refetch();
    void txsQuery.refetch();
    for (const log of receiptQuery.data.logs) {
      try {
        const event = decodeEventLog({ abi: ecimultisig, data: log.data, topics: log.topics });
        if (event.eventName === 'Submitted' && 'txId' in event.args) {
          setNotice(t('admin.proposeSuccess', { id: String((event.args as { txId: bigint }).txId) }));
        }
      } catch {
        // Not a multi-sig log — ignore.
      }
    }
    setBusyId(null);
    setProposing(false);
    resetWrite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptQuery.status]);

  useEffect(() => {
    if (receiptQuery.status === 'error') {
      setTxError(t('admin.txFailed', { message: t('explorer.loadError') }));
      setBusyId(null);
      setProposing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptQuery.status]);

  const readError = thresholdQuery.isError || txCountQuery.isError;
  const isOwner = ownerQuery.data === true;
  const threshold = thresholdQuery.data == null ? 0 : Number(thresholdQuery.data);

  // The `mock` connector below is the Hardhat demo account's implementation
  // detail — it gets its own labelled button, never the generic wallet list.
  const injectedConnectors = connectors.filter((connector) => connector.id !== 'mock');
  const demoConnector = connectors.find((connector) => connector.id === 'mock');

  function fail(message: string): void {
    setNotice(null);
    setTxError(message);
    setBusyId(null);
    setProposing(false);
  }

  function propose(target: Address, data: Hex): void {
    setTxError(null);
    setProposing(true);
    try {
      writeContract({ ...multisig, functionName: 'submit', args: [target, data] });
    } catch (error) {
      fail(t('admin.txFailed', { message: error instanceof Error ? error.message : String(error) }));
    }
  }

  function approve(id: number): void {
    if (!isOwner) return;
    setTxError(null);
    setBusyId(id);
    writeContract({ ...multisig, functionName: 'approve', args: [BigInt(id)] });
  }

  function execute(id: number): void {
    setTxError(null);
    setBusyId(id);
    writeContract({ ...multisig, functionName: 'execute', args: [BigInt(id)] });
  }

  function proposeCreate(constituencyId: string, candidates: string[]): void {
    if (!isOwner) return;
    const data = encodeCreateElection(constituencyId, candidates);
    const existing = txs.find(
      (tx) => !tx.executed && tx.target.toLowerCase() === ELECTION_MANAGER_ADDRESS.toLowerCase() && tx.data === data
    );
    if (existing) {
      setNotice(t('admin.alreadyPending', { id: existing.id }));
      return;
    }
    setNotice(null);
    propose(ELECTION_MANAGER_ADDRESS, data);
  }

  function proposeAdvance(electionId: string): void {
    if (!isOwner) return;
    const data = encodeAdvancePhase(electionId);
    const existing = txs.find(
      (tx) => !tx.executed && tx.target.toLowerCase() === ELECTION_MANAGER_ADDRESS.toLowerCase() && tx.data === data
    );
    if (existing) {
      setNotice(t('admin.alreadyPending', { id: existing.id }));
      return;
    }
    setNotice(null);
    propose(ELECTION_MANAGER_ADDRESS, data);
  }

  if (!isConnected) {
    return (
      <div>
        <div className="page-hero">
          <h1>{t('admin.title')}</h1>
          <p className="prose-civic mt-2 max-w-prose">{t('admin.connectBody')}</p>
        </div>
        <div className="card mt-4 max-w-md">
          <h2 className="text-lg font-bold text-navy-900">{t('admin.connectTitle')}</h2>
          <div className="mt-3 flex flex-col gap-2">
            {injectedConnectors
              .filter((connector) => connector.id !== 'hardhat-demo')
              .map((connector) => (
                <button
                  key={connector.id}
                  type="button"
                  className="btn-primary"
                  disabled={isConnecting}
                  onClick={() => connect({ connector, chainId: CHAIN_ID })}
                >
                  {isConnecting ? t('admin.connecting') : `${t('admin.connectInjected')} (${connector.name})`}
                </button>
              ))}
            {isDemoWalletOffered() && demoConnector && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isConnecting}
                  onClick={() => connect({ connector: demoConnector, chainId: CHAIN_ID })}
                >
                  {t('admin.connectDemo')}
                </button>
                <p className="prose-civic text-sm">{t('admin.demoNotice')}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-hero">
        <h1>{t('admin.title')}</h1>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="prose-civic">{t('admin.connectedAs', { address: shortAddress(address ?? '') })}</p>
        {isOwner && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-sm font-bold text-green-800">
            {t('admin.ownerBadge')}
          </span>
        )}
        <button type="button" className="btn-secondary" onClick={() => disconnect()}>
          {t('admin.disconnect')}
        </button>
      </div>

      {wrongNetwork && (
        <div className="card mt-4" role="alert">
          <p className="prose-civic">
            {t('admin.wrongNetwork', { expected: CHAIN_ID, actual: chainId ?? '?' })}
          </p>
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={() => {
              setSwitchFailed(false);
              try {
                switchChain({ chainId: CHAIN_ID });
              } catch {
                setSwitchFailed(true);
              }
            }}
          >
            {t('admin.switchNetwork')}
          </button>
          {switchFailed && <p className="prose-civic mt-2 text-sm">{t('admin.noSwitch', { expected: CHAIN_ID })}</p>}
        </div>
      )}

      {!wrongNetwork && readError && (
        <div className="card mt-4" role="alert">
          <p className="prose-civic">{t('admin.noNode', { url: RPC_URL })}</p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => {
              void thresholdQuery.refetch();
              void txCountQuery.refetch();
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {!wrongNetwork && !readError && (
        <>
          {!isOwner && (
            <p className="mt-4 rounded-md border border-navy-200 bg-navy-50 px-4 py-3 text-base text-navy-800">
              {t('admin.notOwner')}
            </p>
          )}
          <h2 className="mt-6 text-lg font-bold text-navy-900">{t('admin.pendingTitle')}</h2>
          <PendingTransactions
            txs={txs}
            threshold={threshold}
            isOwner={isOwner}
            elections={electionsById}
            busyId={busyId}
            onApprove={approve}
            onExecute={execute}
          />
          {isOwner && (
            <>
              <h2 className="mt-6 text-lg font-bold text-navy-900">{t('admin.proposeTitle')}</h2>
              <ProposeForms
                elections={(electionsQuery.data ?? []).map((election) => ({
                  id: election.id,
                  constituencyId: election.constituencyId
                }))}
                busy={proposing}
                notice={notice}
                onProposeCreate={proposeCreate}
                onProposeAdvance={proposeAdvance}
              />
            </>
          )}
          {txError && (
            <p className="prose-civic mt-4" role="alert">
              {txError}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
