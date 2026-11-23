jest.mock('../../lib/control-pending-pairing', () => ({
  consumePendingPairingProof: jest.fn(),
}));
jest.mock('../../lib/control-secure-store', () => ({
  loadControlGrant: jest.fn(),
  saveControlGrant: jest.fn(),
}));

import { consumePendingPairingProof } from '../../lib/control-pending-pairing';
import { loadControlGrant, saveControlGrant } from '../../lib/control-secure-store';
import { finalizeVerifiedPairing } from '../../lib/control-pairing-finalize';

const proof = consumePendingPairingProof as jest.Mock;
const load = loadControlGrant as jest.Mock;
const save = saveControlGrant as jest.Mock;
const now = 1795435200000;
const id = '0123456789abcdef0123456789abcdef';
const consent = { pairingId: id, approvedScopes: ['status:read'] as const, expiresAt: new Date(now + 60000).toISOString() };
const challenge = { version: 1 as const, pairingId: id, nonce: '0123456789abcdef0123456789abcdef', createdAt: now - 1000, expiresAt: now + 60000 };

describe('verified pairing finalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    proof.mockResolvedValue(true);
    load.mockResolvedValue(null);
    save.mockResolvedValue(undefined);
  });
  it('persists only approved scopes after successful proof', async () => {
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now)).toEqual({ ok: true, reason: 'paired' });
    expect(proof).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      pairingId: id, scopes: ['status:read'], expiresAt: consent.expiresAt, revoked: false,
    });
  });
  it('rejects invalid consent without consuming proof', async () => {
    expect(await finalizeVerifiedPairing({ ...consent, approvedScopes: [] }, challenge, 'signature', now))
      .toEqual({ ok: false, reason: 'invalid-consent' });
    expect(proof).not.toHaveBeenCalled();
  });
  it('rejects mismatched pairing and expired consent', async () => {
    expect((await finalizeVerifiedPairing({ ...consent, pairingId: 'other' }, challenge, 'signature', now)).ok).toBe(false);
    expect((await finalizeVerifiedPairing({ ...consent, expiresAt: new Date(now).toISOString() }, challenge, 'signature', now)).ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects proof failure and existing pairing', async () => {
    proof.mockResolvedValueOnce(false);
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now)).toEqual({ ok: false, reason: 'proof-rejected' });
    load.mockResolvedValueOnce({ pairingId: 'old' });
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now)).toEqual({ ok: false, reason: 'existing-pairing' });
    expect(save).not.toHaveBeenCalled();
  });
  it('fails closed if secure storage fails', async () => {
    save.mockRejectedValueOnce(new Error('locked'));
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now))
      .toEqual({ ok: false, reason: 'secure-storage-unavailable' });
  });
});
