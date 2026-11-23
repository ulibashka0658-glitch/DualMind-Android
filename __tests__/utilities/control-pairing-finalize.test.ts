jest.mock('../../lib/control-hmac', () => ({ removeControlHmacKey: jest.fn() }));
jest.mock('../../lib/control-pending-pairing', () => ({
  consumePendingPairingProof: jest.fn(),
}));
jest.mock('../../lib/control-pairing-consent-store', () => ({
  loadBoundPairingConsent: jest.fn(),
  clearBoundPairingConsent: jest.fn(),
}));
jest.mock('../../lib/control-secure-store', () => ({
  loadControlGrant: jest.fn(),
  saveControlGrant: jest.fn(),
}));

import { removeControlHmacKey } from '../../lib/control-hmac';
import { consumePendingPairingProof } from '../../lib/control-pending-pairing';
import { loadControlGrant, saveControlGrant } from '../../lib/control-secure-store';
import { finalizeVerifiedPairing } from '../../lib/control-pairing-finalize';
import { runPairingMutation } from '../../lib/control-pairing-mutex';
import { loadBoundPairingConsent, clearBoundPairingConsent } from '../../lib/control-pairing-consent-store';

const removeKey = removeControlHmacKey as jest.Mock;
const bound = loadBoundPairingConsent as jest.Mock;
const clear = clearBoundPairingConsent as jest.Mock;
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
    bound.mockResolvedValue(consent);
    clear.mockResolvedValue(undefined);
    load.mockResolvedValue(null);
    save.mockResolvedValue(undefined);
    removeKey.mockResolvedValue(undefined);
  });
  it('holds the shared lifecycle lock until the grant is persisted', async () => {
    let release!: () => void;
    const events: string[] = [];
    save.mockImplementationOnce(() => new Promise<void>(resolve => {
      release = () => { events.push('grant-saved'); resolve(); };
    }));
    const finalizing = finalizeVerifiedPairing(consent, challenge, 'signature', now);
    for (let i = 0; i < 30 && !release; i++) await Promise.resolve();
    expect(release).toBeDefined();
    const nextMutation = runPairingMutation(async () => { events.push('next-mutation'); });
    expect(events).toEqual([]);
    release();
    await Promise.all([finalizing, nextMutation]);
    expect(events).toEqual(['grant-saved', 'next-mutation']);
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
  it('rejects unbound or modified local consent', async () => {
    bound.mockResolvedValueOnce(null);
    expect((await finalizeVerifiedPairing(consent, challenge, 'signature', now)).reason).toBe('consent-not-bound');
    bound.mockResolvedValueOnce({ ...consent, approvedScopes: ['models:read'] });
    expect((await finalizeVerifiedPairing(consent, challenge, 'signature', now)).reason).toBe('consent-not-bound');
    expect(proof).not.toHaveBeenCalled();
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
      .toEqual({ ok: false, reason: 'grant-save-failed-key-removed' });
    expect(removeKey).toHaveBeenCalledWith(id);
  });
  it('reports orphaned key cleanup failure explicitly', async () => {
    save.mockRejectedValueOnce(new Error('locked'));
    removeKey.mockRejectedValueOnce(new Error('locked'));
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now))
      .toEqual({ ok: false, reason: 'orphaned-key-cleanup-failed' });
  });
  it('never removes key when proof fails or grant already exists', async () => {
    proof.mockResolvedValueOnce(false);
    await finalizeVerifiedPairing(consent, challenge, 'signature', now);
    load.mockResolvedValueOnce({ pairingId: 'old' });
    await finalizeVerifiedPairing(consent, challenge, 'signature', now);
    expect(removeKey).not.toHaveBeenCalled();
  });
});
