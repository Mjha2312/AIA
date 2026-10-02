import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityStep, KycStep, RegisterStep } from './vote-steps';
import { clearIdentityExport, loadIdentityExport } from '@/lib/vote-identity';
import { jsonResponse, renderWithI18n } from '@/test/render';

const fetchMock = vi.fn();

function routeFetch(url: unknown): Promise<Response> {
  const target = String(url);
  if (target.includes('/kyc/start')) {
    return Promise.resolve(jsonResponse({ sessionId: 's-1', redirectUrl: '/mock-kyc?sessionId=s-1' }));
  }
  if (target.includes('/kyc/complete')) {
    return Promise.resolve(jsonResponse({ kycToken: 'token-abc' }));
  }
  if (target.includes('/register')) {
    return Promise.resolve(
      jsonResponse({ txHash: '0x' + 'ab'.repeat(32) })
    );
  }
  return Promise.reject(new Error(`unexpected fetch ${target}`));
}

describe('KycStep', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a mistyped EPIC without calling the backend', async () => {
    renderWithI18n(<KycStep electionId="2" onVerified={() => undefined} />);

    await userEvent.type(screen.getByLabelText('Mock EPIC'), 'WRONG');
    await userEvent.click(screen.getByRole('button', { name: 'Verify identity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('does not look right');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges a valid EPIC for a token', async () => {
    fetchMock.mockImplementation(routeFetch);
    const onVerified = vi.fn();
    renderWithI18n(<KycStep electionId="2" onVerified={onVerified} />);

    await userEvent.type(screen.getByLabelText('Mock EPIC'), 'WB/12/345/678901');
    await userEvent.click(screen.getByRole('button', { name: 'Verify identity' }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('token-abc'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces backend failures instead of crashing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'x', message: 'KYC is down' } }, 501));
    renderWithI18n(<KycStep electionId="2" onVerified={() => undefined} />);

    await userEvent.type(screen.getByLabelText('Mock EPIC'), 'WB/12/345/678901');
    await userEvent.click(screen.getByRole('button', { name: 'Verify identity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('KYC is down');
  });
});

describe('IdentityStep', () => {
  beforeEach(() => {
    clearIdentityExport('7');
    clearIdentityExport('8');
  });

  it('creates an identity and keeps the export on this device', async () => {
    const onCreated = vi.fn();
    renderWithI18n(<IdentityStep electionId="7" onCreated={onCreated} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Create voting identity' }));

    expect(onCreated).toHaveBeenCalledTimes(1);
    const commitment = onCreated.mock.calls[0]?.[0] as string;
    expect(commitment).toMatch(/^\d+$/);
    expect(loadIdentityExport('7')).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('resumes the stored identity when one exists', async () => {
    const first = vi.fn();
    const { unmount } = renderWithI18n(<IdentityStep electionId="8" onCreated={first} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Create voting identity' }));
    const commitment = first.mock.calls[0]?.[0] as string;
    unmount();

    const second = vi.fn();
    renderWithI18n(<IdentityStep electionId="8" onCreated={second} />);
    await userEvent.click(
      await screen.findByRole('button', { name: "Continue with this device's identity" })
    );

    expect(second).toHaveBeenCalledWith(commitment);
  });
});

describe('RegisterStep', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers the commitment and reports the transaction', async () => {
    fetchMock.mockImplementation(routeFetch);
    const onDone = vi.fn();
    renderWithI18n(
      <RegisterStep electionId="2" kycToken="tok" commitment="12345" onDone={onDone} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Register anonymously' }));

    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ txHash: expect.any(String), alreadyRegistered: false })
    );
  });

  it('treats double registration as already done, not as a crash', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'ALREADY_REGISTERED', message: 'dup' } }, 409)
    );
    const onDone = vi.fn();
    renderWithI18n(
      <RegisterStep electionId="2" kycToken="tok" commitment="12345" onDone={onDone} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Register anonymously' }));

    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ txHash: null, alreadyRegistered: true })
    );
  });

  it('shows server errors inline', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'x', message: 'chain blew up' } }, 502));
    renderWithI18n(
      <RegisterStep electionId="2" kycToken="tok" commitment="12345" onDone={() => undefined} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Register anonymously' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('chain blew up');
  });
});
