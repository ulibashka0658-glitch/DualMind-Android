jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));
jest.mock('expo-crypto', () => ({ getRandomBytes: jest.fn(() => new Uint8Array(32).fill(7)) }));
jest.mock('../../lib/control-pairing-verifier', () => ({
  verifyDevicePairingProof: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { verifyDevicePairingProof } from '../../lib/control-pairing-verifier';
import {
  createPendingPairingChallenge, consumePendingPairingProof, cancelPendingPairingChallenge,
} from '../../lib/control-pending-pairing';

const get = SecureStore.getItemAsync as jest.Mock;
const set = SecureStore.setItemAsync as jest.Mock;
const del = SecureStore.deleteItemAsync as jest.Mock;
const verify = verifyDevicePairingProof as jest.Mock;
const now = 1795435200000;
const id = '0123456789abcdef0123456789abcdef';

describe('single-use pairing challenge', () => {
  let stored: string | null;
  beforeEach(() => {
    jest.clearAllMocks();
    stored = null;
    get.mockImplementation(async () => stored);
    set.mockImplementation(async (_key: string, value: string) => { stored = value; });
    del.mockImplementation(async () => { stored = null; });
    verify.mockResolvedValue(true);
  });
  it('creates a locally random challenge and persists it before returning', async () => {
    const challenge = await createPendingPairingChallenge(id, now);
    expect(challenge.nonce).toHaveLength(44);
    expect(challenge.expiresAt - challenge.createdAt).toBe(300000);
    expect(stored).toBe(JSON.stringify(challenge));
  });
  it('accepts proof once and rejects replay', async () => {
    const challenge = await createPendingPairingChallenge(id, now);
    expect(await consumePendingPairingProof(challenge, 'signature', now)).toBe(true);
    expect(await consumePendingPairingProof(challenge, 'signature', now)).toBe(false);
    expect(del).toHaveBeenCalledTimes(1);
  });
  it('retains the challenge during finalization until grant persistence', async () => {
    const challenge = await createPendingPairingChallenge(id, now);
    expect(await consumePendingPairingProof(challenge, 'signature', now, true)).toBe(true);
    expect(stored).toBe(JSON.stringify(challenge));
    expect(del).not.toHaveBeenCalled();
    await cancelPendingPairingChallenge();
    expect(stored).toBeNull();
  });
  it('rejects invalid proof without deleting retained challenge', async () => {
    const challenge = await createPendingPairingChallenge(id, now);
    verify.mockResolvedValueOnce(false);
    expect(await consumePendingPairingProof(challenge, 'signature', now, true)).toBe(false);
    expect(stored).toBe(JSON.stringify(challenge));
    expect(del).not.toHaveBeenCalled();
  });
  it('rejects modified and expired challenges without verifying', async () => {
    const challenge = await createPendingPairingChallenge(id, now);
    expect(await consumePendingPairingProof({ ...challenge, nonce: 'tampered' }, 'signature', now)).toBe(false);
    expect(await consumePendingPairingProof(challenge, 'signature', now + 300000)).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
  it('fails closed if proof is invalid or deletion fails', async () => {
    const challenge = await createPendingPairingChallenge(id, now);
    verify.mockResolvedValueOnce(false);
    expect(await consumePendingPairingProof(challenge, 'signature', now)).toBe(false);
    del.mockRejectedValueOnce(new Error('locked'));
    expect(await consumePendingPairingProof(challenge, 'signature', now)).toBe(false);
  });
  it('can cancel a pending request', async () => {
    await createPendingPairingChallenge(id, now);
    await cancelPendingPairingChallenge();
    expect(stored).toBeNull();
  });
});
