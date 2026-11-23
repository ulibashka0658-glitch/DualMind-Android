import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { Buffer } from 'buffer';
import { validatePairingChallenge, type PairingChallenge } from './control-pairing-proof';
import { verifyDevicePairingProof } from './control-pairing-verifier';

const PENDING_KEY = 'dualmind-control-pending-challenge-v1';
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const task = queue.catch(() => undefined).then(operation);
  queue = task;
  return task;
}

/**
 * Only one pending challenge per device. Generate a cryptographically random
 * nonce locally; never accept a remote-supplied challenge as authoritative.
 * This is NOT a key exchange and does not activate remote control.
 */
export function createPendingPairingChallenge(
  pairingId: string,
  now = Date.now(),
): Promise<PairingChallenge> {
  return serialize(async () => {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(pairingId) || !Number.isSafeInteger(now)) {
      throw new Error('Invalid pairing request');
    }
    const nonce = Buffer.from(getRandomBytes(32)).toString('base64');
    const challenge: PairingChallenge = {
      version: 1, pairingId, nonce, createdAt: now, expiresAt: now + 5 * 60 * 1000,
    };
    if (!validatePairingChallenge(challenge, now)) throw new Error('Invalid challenge');
    await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(challenge), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return challenge;
  });
}

/**
 * Compare against the stored challenge, authenticate possession of the
 * previously provisioned key, then DELETE the pending challenge before
 * returning success. A failed deletion fails closed.
 */
export function consumePendingPairingProof(
  challenge: PairingChallenge,
  signature: string,
  now = Date.now(),
  retainChallenge = false,
): Promise<boolean> {
  return serialize(async () => {
    try {
      const raw = await SecureStore.getItemAsync(PENDING_KEY);
      if (!raw || !validatePairingChallenge(challenge, now)) return false;
      const saved: unknown = JSON.parse(raw);
      if (!validatePairingChallenge(saved, now) ||
          JSON.stringify(saved) !== JSON.stringify(challenge)) return false;
      if (!await verifyDevicePairingProof(challenge, signature, challenge.pairingId, now)) return false;
      // Finalization keeps the identity durable until the grant is saved.
      if (!retainChallenge) await SecureStore.deleteItemAsync(PENDING_KEY);
      return true;
    } catch {
      return false;
    }
  });
}

export function cancelPendingPairingChallenge(): Promise<void> {
  return serialize(() => SecureStore.deleteItemAsync(PENDING_KEY));
}
