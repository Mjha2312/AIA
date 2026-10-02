# Besu dev node (optional, prototype only)

The default local chain for this prototype is `hardhat node`. This page shows how
to point the contracts at a Hyperledger Besu dev node instead, to preview what a
permissioned ECI chain would look like. No docker-compose needed. Skip this file
if you just want the Hardhat flow in `contracts/README.md`.

## Option A — single-node dev (simplest, Clique)

Good enough to test RPC compatibility (deploy, multisig flow, voting).

```bash
# with docker (single run, no compose):
docker run --rm -p 8545:8545 hyperledger/besu:latest \
  --network=dev \
  --miner-enabled --miner-coinbase=0x0000000000000000000000000000000000000000 \
  --rpc-http-enabled --rpc-http-host=0.0.0.0 --rpc-http-cors-origins="*" \
  --host-allowlist="*"

# or with the Besu binary:
besu --network=dev \
  --miner-enabled --miner-coinbase=0x0000000000000000000000000000000000000000 \
  --rpc-http-enabled --rpc-http-host=127.0.0.1 --host-allowlist="*"
```

Fund a deployer account: `--network=dev` pre-funds
`0xfe3b557e8fb62b89f4916b721be55ceb828dbd73` (key
`0x8f2a55949038a4bcf0df43472663efb95f06157b799fcf9c673a4f3fb4993d97`). Then:

```bash
cd contracts
BESU_RPC_URL=http://127.0.0.1:8545 \
BESU_PRIVATE_KEY=0x8f2a55949038a4bcf0df43472663efb95f06157b799fcf9c673a4f3fb4993d97 \
npm run deploy:besu   # writes contracts/deployments/besu.json
```

## Option B — 4-validator QBFT permissioned network (closer to ECI)

Models the target topology: known ECI validators, IBFT/QBFT proof-of-authority,
no anonymous miners.

```bash
# 1. Generate a QBFT config for 4 validators (Besu >= 23.x):
besu operator generate-blockchain-config \
  --config-file-path=qbft-config.json \
  --to=qbft-network --private-key-file-name=key

# 2. Run 4 nodes (binaries or plain `docker run`, one per validator):
besu --config-file=qbft-network/genesis.json \
  --data-path=data/node1 --rpc-http-enabled --rpc-http-host=127.0.0.1 \
  --rpc-http-port=8545 --p2p-port=30301 --host-allowlist="*"
# ... repeat for node2..4 with ports 8546/30302, 8547/30303, 8548/30304,
# pointing each at the others via --bootnodes (see qbft-network/README).

# 3. Deploy from any funded account on the network:
cd contracts
BESU_RPC_URL=http://127.0.0.1:8545 BESU_PRIVATE_KEY=0x<funded-key> npm run deploy:besu
```

## Hardhat network entry

`hardhat.config.ts` already defines `besu` (env-driven, optional):

- `BESU_RPC_URL` (default `http://127.0.0.1:8545`)
- `BESU_PRIVATE_KEY` (deployer key; empty = read-only, deploys will fail)

`npm run deploy:besu` reuses `scripts/deploy.ts`, so the output shape is the
same `contracts/deployments/besu.json` (`ECIMultiSig`, `ElectionManager`,
`Semaphore`, `chainId`) the backend expects.

## Notes / limits

- Besu is EVM-compatible, so no contract changes are needed; only gas behavior
  and block times differ from Hardhat.
- QBFT needs at least 4 validators to tolerate 1 faulty node; the generated
  dev keys above are public and must never be used beyond local testing.
- This is a connectivity preview only — it says nothing about national-scale
  throughput (see `docs/SCALE.md`).
