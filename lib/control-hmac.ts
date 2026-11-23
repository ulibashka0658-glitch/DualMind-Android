import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import type { VerifyControlSignature } from './control-signed-request';

const KEY_PREFIX = 'dualmind-control-hmac-v1-';

/**
 * HMAC-SHA256 verification using platform WebCrypto when available.
 * Fails closed if WebCrypto is unavailable (no insecure hash fallback).
 * Keys must be generated via a trusted pairing ceremony, never accepted
 * from an untrusted command request.
 */
export const verifyControlHmac: VerifyControlSignature = async (message, signature, pairingId) => {
  if (!pairingId || !/^[a-zA-Z0-9_-]{1,128}$/.test(pairingId) ||
      !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return false;
  try {
    const storedKey = await SecureStore.getItemAsync(KEY_PREFIX + pairingId);
    if (!storedKey || !/^[A-Za-z0-9+/]{43}=$/.test(storedKey)) return false;
    const secret = Buffer.from(storedKey, 'base64');
    const supplied = Buffer.from(signature, 'base64');
    if (secret.length !== 32 || supplied.length !== 32) return false;
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
  await SecureStore.setItemAsync(KEY_PREFIX + pairingId, base64Secret, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function removeControlHmacKey(pairingId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pairingId)) throw new Error('Invalid pairing ID');
  await SecureStore.deleteItemAsync(KEY_PREFIX + pairingId);
}
