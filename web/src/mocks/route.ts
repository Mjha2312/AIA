import { NextResponse } from 'next/server';

import { apiErrorEnvelopeSchema, chainEventBatchSchema } from '@/lib/schemas';
import { mockApi } from './store';

/**
 * One catch-all route handler standing in for the whole SPEC REST API.
 * Mounted at `/api-mock/api/...`, which is exactly where `NEXT_PUBLIC_USE_MOCKS`
 * points the client, so no call site changes between mock and real mode.
 */

const NOT_FOUND = { code: 'not_found', message: 'Resource not found.' } as const;

function json(body: unknown): NextResponse {
  return NextResponse.json(body);
}

function error(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(apiErrorEnvelopeSchema.parse({ error: { code, message } }), { status });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `[...path]` arrives as `['api', 'elections', '1', 'turnout']`. */
type Path = string[];

export async function GET(request: Request, context: { params: { path?: Path } }): Promise<NextResponse> {
  const path = (context.params.path ?? []).filter((segment) => segment !== 'api');

  if (path[0] === 'elections' && path.length === 1) {
    return json(mockApi.listElections());
  }

  if (path[0] === 'elections' && path.length === 2) {
    const election = mockApi.getElection(path[1] ?? '');
    return election ? json(election) : error(NOT_FOUND.code, 'Election not found.', 404);
  }

  if (path[0] === 'elections' && path[2] === 'turnout' && path.length === 3) {
    const turnout = mockApi.getTurnout(path[1] ?? '');
    return turnout ? json(turnout) : error(NOT_FOUND.code, 'Election not found.', 404);
  }

  if (path[0] === 'elections' && path[2] === 'votes' && path.length === 3) {
    const url = new URL(request.url);
    const page = mockApi.getVotes(path[1] ?? '', url.searchParams.get('cursor') ?? undefined, Number(url.searchParams.get('limit')));
    return page ? json(page) : error(NOT_FOUND.code, 'Election not found.', 404);
  }

  if (path[0] === 'elections' && path[2] === 'group' && path.length === 3) {
    const group = mockApi.getGroup(path[1] ?? '');
    return group ? json(group) : error(NOT_FOUND.code, 'Election not found.', 404);
  }

  if (path[0] === 'receipts' && path.length === 2) {
    return json(mockApi.getReceipt(decodeURIComponent(path[1] ?? '')));
  }

  if (path[0] === 'ws' && path.length === 1) {
    const url = new URL(request.url);
    const since = Number(url.searchParams.get('since') ?? '0');
    const batch = chainEventBatchSchema.parse(mockApi.pollEvents(url.searchParams.get('electionId') ?? undefined, since));
    return json(batch);
  }

  if (path[0] === 'kyc' && path[1] === 'mock-provider' && path.length === 2) {
    const sessionId = new URL(request.url).searchParams.get('session') ?? '';
    return json({
      provider: 'DigiLocker (mock)',
      sessionId,
      consent: 'Prototype: consent screen is simulated. No Aadhaar data is requested or stored.',
      submit: '/api-mock/api/kyc/complete'
    });
  }

  return error(NOT_FOUND.code, `No mock route for GET /${path.join('/')}.`, 404);
}

export async function POST(request: Request, context: { params: { path?: Path } }): Promise<NextResponse> {
  const path = (context.params.path ?? []).filter((segment) => segment !== 'api');
  const body = await readJson(request);

  if (!body) {
    return error('invalid_body', 'A JSON body is required.', 400);
  }

  if (path[0] === 'kyc' && path[1] === 'start' && path.length === 2) {
    const session = mockApi.startKyc(String(body.electionId ?? ''));
    return session ? json(session) : error(NOT_FOUND.code, 'Election not found.', 404);
  }

  if (path[0] === 'kyc' && path[1] === 'complete' && path.length === 2) {
    const token = mockApi.completeKyc(String(body.sessionId ?? ''));
    return token ? json(token) : error('invalid_session', 'Unknown or expired KYC session.', 400);
  }

  if (path[0] === 'register' && path.length === 1) {
    const registration = mockApi.register(String(body.electionId ?? ''), String(body.identityCommitment ?? ''));
    if (!registration) return error(NOT_FOUND.code, 'Election not found.', 404);
    if (!registration.ok) return error(registration.error, registration.message, 409);
    return json({ txHash: registration.value.txHash });
  }

  if (path[0] === 'relay' && path[1] === 'vote' && path.length === 2) {
    const relayed = mockApi.relayVote(String(body.electionId ?? ''), Number(body.candidateIndex));
    if (!relayed) return error(NOT_FOUND.code, 'Election not found.', 404);
    if (!relayed.ok) return error(relayed.error, relayed.message, 409);
    return json({ txHash: relayed.value.txHash, voteHash: relayed.value.voteHash });
  }

  if (path[0] === 'elections' && path[2] === 'audit' && path.length === 3) {
    const booths = Array.isArray(body.booths) ? (body.booths as { boothId: string; counts: number[] }[]) : [];
    const result = mockApi.audit(path[1] ?? '', booths);
    return result ? json(result) : error(NOT_FOUND.code, 'Election not found.', 404);
  }

  return error(NOT_FOUND.code, `No mock route for POST /${path.join('/')}.`, 404);
}