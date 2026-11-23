import { removeControlHmacKey } from './control-hmac';
import { clearControlGrant, loadControlGrant } from './control-secure-store';
import { cancelLocalPairingApproval } from './control-pairing-local-approval';

/**
 * Revoke device access locally. Delete the key FIRST so a storage failure
 * cannot leave an active cryptographic credential after reporting success.
 * If deletion fails, the operation rejects and the UI must show an error.
 */
export async function disconnectControlPairing(): Promise<void> {
  const grant = await loadControlGrant();
  if (grant) await removeControlHmacKey(grant.pairingId);
  await clearControlGrant();
  // Also invalidate an unfinished approval so it cannot survive disconnect.
  // Cleanup failures are surfaced to the UI, never reported as success.
  await cancelLocalPairingApproval();
}

/** Report capability without creating, exporting, or storing a secret. */
export async function inspectControlCrypto(): Promise<{
  available: boolean;
  reason: 'available' | 'webcrypto-unavailable' | 'hmac-unavailable';
}> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { available: false, reason: 'webcrypto-unavailable' };
  try {
    const key = await subtle.importKey(
      'raw', new Uint8Array(32),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const result = await subtle.verify('HMAC', key, new Uint8Array(32), new Uint8Array(1));
    if (typeof result !== 'boolean') return { available: false, reason: 'hmac-unavailable' };
    return { available: true, reason: 'available' };
  } catch {
    return { available: false, reason: 'hmac-unavailable' };
  }
}
