import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import { verifyPlatformControlMac } from './control-platform-mac';
import type { VerifyControlSignature } from './control-signed-request';
import { getLocalPairingApprovalStatus } from './control-pairing-recovery';
import { loadControlGrant } from './control-secure-store';
import { runPairingMutation } from './control-pairing-mutex';

const KEY_PREFIX = 'dualmind-control-hmac-v1-';
let provisionQueue: Promise<unknown> = Promise.resolve();

/**
 * HMAC-SHA256 verification using platform WebCrypto when available.
 * Uses platform SHA-256 HMAC when WebCrypto is absent. Both paths fail closed.
 * Keys must be generated via a trusted pairing ceremony, never accepted
 * from an untrusted command request.
 */
export const verifyControlHmac: VerifyControlSignature = async (message, signature, pairingId) => {
  if (!pairingId || !/^[a-zA-Z0-9_-]{1,128}$/.test(pairingId) ||
      !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const subtle = globalThis.crypto?.subtle;
  try {
    const storedKey = await SecureStore.getItemAsync(KEY_PREFIX + pairingId);
    if (!storedKey || !/^[A-Za-z0-9+/]{43}=$/.test(storedKey)) return false;
    const secret = Buffer.from(storedKey, 'base64');
    const supplied = Buffer.from(signature, 'base64');
    if (secret.length !== 32 || supplied.length !== 32) return false;
    if (!subtle) return await verifyPlatformControlMac(secret, message, supplied);
    const key = await subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await subtle.verify('HMAC', key, supplied, Buffer.from(message, 'utf8'));
  } catch {
    return false;
  }
};

/**
 * Called only after local approval and a trusted authenticated key exchange.
 * Do not expose this function to remote command dispatch.
 */
export async function provisionControlHmacKey(pairingId: string, base64Secret: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pairingId) ||
      !/^[A-Za-z0-9+/]{43}=$/.test(base64Secret) ||
      Buffer.from(base64Secret, 'base64').length !== 32) {
    throw new Error('Invalid pairing key');
  }
  // Serialize local provisioning so two callers cannot both observe an empty slot.
  return runPairingMutation(async () => {
    const task = provisionQueue.catch(() => undefined).then(async () => {
    // A secret may be provisioned only for an active, locally approved request.
    const pending = await getLocalPairingApprovalStatus();
    if (!pending || pending.consent.pairingId !== pairingId) {
      throw new Error('Local pairing approval required');
    }
    // A stale approval must never provision credentials over any saved grant.
    // Even expired/revoked grants require explicit disconnection first.
    if (await loadControlGrant()) throw new Error('Disconnect existing pairing first');
    const existing = await SecureStore.getItemAsync(KEY_PREFIX + pairingId);
    if (existing !== null) throw new Error('Pairing key already exists');
    await SecureStore.setItemAsync(KEY_PREFIX + pairingId, base64Secret, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });
    provisionQueue = task;
    await task;
  });
}

export async function removeControlHmacKey(pairingId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pairingId)) throw new Error('Invalid pairing ID');
  // Share the provisioning queue: a late provision cannot race key deletion.
  const task = provisionQueue.catch(() => undefined).then(() =>
    SecureStore.deleteItemAsync(KEY_PREFIX + pairingId),
  );
  provisionQueue = task;
  await task;
}

/**
 * Generate a fresh 256-bit secret on the device. This does NOT transfer the
 * secret to another device or establish a trusted channel by itself.
 * The caller must use a separate authenticated pairing ceremony.
 */
export async function generateDevicePairingSecret(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  if (bytes.length !== 32) throw new Error('Invalid secure random output');
  return Buffer.from(bytes).toString('base64');
}
