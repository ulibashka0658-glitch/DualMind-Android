jest.mock('../../lib/control-hmac', () => ({ removeControlHmacKey: jest.fn() }));
jest.mock('../../lib/control-pending-pairing', () => ({
  consumePendingPairingProof: jest.fn(),
  cancelPendingPairingChallenge: jest.fn(),
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
import { consumePendingPairingProof, cancelPendingPairingChallenge } from '../../lib/control-pending-pairing';
import { loadControlGrant, saveControlGrant } from '../../lib/control-secure-store';
import { finalizeVerifiedPairing } from '../../lib/control-pairing-finalize';
import { runPairingMutation } from '../../lib/control-pairing-mutex';
import { loadBoundPairingConsent, clearBoundPairingConsent } from '../../lib/control-pairing-consent-store';

const removeKey = removeControlHmacKey as jest.Mock;
const bound = loadBoundPairingConsent as jest.Mock;
const clear = clearBoundPairingConsent as jest.Mock;
const proof = consumePendingPairingProof as jest.Mock;
const cancelChallenge = cancelPendingPairingChallenge as jest.Mock;
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
    cancelChallenge.mockResolvedValue(undefined);
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
    expect(proof).toHaveBeenCalledWith(challenge, 'signature', now, true);
    expect(cancelChallenge).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      pairingId: id, scopes: ['status:read'], expiresAt: consent.expiresAt, revoked: false,
    });
  });
  it('persists grant, clears consent, then deletes challenge in order', async () => {
    const events: string[] = [];
    save.mockImplementationOnce(async () => { events.push('grant'); });
    clear.mockImplementationOnce(async () => { events.push('consent'); });
    cancelChallenge.mockImplementationOnce(async () => { events.push('challenge'); });
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now))
      .toEqual({ ok: true, reason: 'paired' });
    expect(events).toEqual(['grant', 'consent', 'challenge']);
  });
  it('keeps challenge identity if consent cleanup fails after grant save', async () => {
    clear.mockRejectedValueOnce(new Error('locked'));
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now))
      .toEqual({ ok: false, reason: 'pairing-cleanup-failed' });
    expect(cancelChallenge).not.toHaveBeenCalled();
    expect(removeKey).not.toHaveBeenCalled();
  });
  it('does not remove challenge when grant persistence fails', async () => {
    save.mockRejectedValueOnce(new Error('locked'));
    await finalizeVerifiedPairing(consent, challenge, 'signature', now);
    expect(cancelChallenge).not.toHaveBeenCalled();
  });
  it('reports challenge cleanup failure after saving grant', async () => {
    cancelChallenge.mockRejectedValueOnce(new Error('locked'));
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now))
      .toEqual({ ok: false, reason: 'pairing-cleanup-failed' });
    expect(save).toHaveBeenCalledTimes(1);
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
  it('preserves key when a rejected write actually persisted the grant', async () => {
    save.mockRejectedValueOnce(new Error('write interrupted'));
    load.mockResolvedValueOnce(null).mockResolvedValueOnce({
      pairingId: id, scopes: ['status:read'], expiresAt: consent.expiresAt, revoked: false,
    });
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now))
      .toEqual({ ok: false, reason: 'grant-write-uncertain' });
    expect(removeKey).not.toHaveBeenCalled();
    expect(cancelChallenge).not.toHaveBeenCalled();
  });
  it('preserves key when readback fails after rejected write', async () => {
    save.mockRejectedValueOnce(new Error('write interrupted'));
    load.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('storage locked'));
    expect(await finalizeVerifiedPairing(consent, challenge, 'signature', now))
      .toEqual({ ok: false, reason: 'grant-write-uncertain' });
    expect(removeKey).not.toHaveBeenCalled();
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
