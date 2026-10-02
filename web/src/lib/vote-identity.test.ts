import { describe, expect, it } from 'vitest';

import {
  clearIdentityExport,
  createVotingIdentity,
  importVotingIdentity,
  isValidMockEpic,
  loadIdentityExport,
  loadStoredCommitment,
  saveIdentityExport
} from './vote-identity';

describe('isValidMockEpic', () => {
  it('accepts the documented SS/DD/DDD/DDDDDD shape', () => {
    expect(isValidMockEpic('WB/12/345/678901')).toBe(true);
    expect(isValidMockEpic('  KER/01/002/000003  ')).toBe(true);
  });

  it('rejects typos before they reach the server', () => {
    expect(isValidMockEpic('')).toBe(false);
    expect(isValidMockEpic('wb/12/345/678901')).toBe(false);
    expect(isValidMockEpic('WB-12-345-678901')).toBe(false);
    expect(isValidMockEpic('WB/1/345/678901')).toBe(false);
  });
});

describe('voting identity storage', () => {
  it('round-trips create -> save -> load with the same commitment', () => {
    const created = createVotingIdentity();
    expect(created.commitment).toMatch(/^\d+$/);

    saveIdentityExport('42', created.identityExport);
    expect(loadIdentityExport('42')).toBe(created.identityExport);
    expect(loadStoredCommitment('42')).toBe(created.commitment);

    const restored = importVotingIdentity(created.identityExport);
    expect(restored?.commitment).toBe(created.commitment);
  });

  it('returns null for empty or missing exports', () => {
    expect(importVotingIdentity('')).toBeNull();
    expect(loadStoredCommitment('no-such-election')).toBeNull();
  });

  it('clears stored identities per election', () => {
    saveIdentityExport('44', createVotingIdentity().identityExport);
    clearIdentityExport('44');
    expect(loadIdentityExport('44')).toBeNull();
  });
});
