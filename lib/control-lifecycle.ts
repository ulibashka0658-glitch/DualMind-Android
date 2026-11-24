import { removeControlHmacKey } from './control-hmac';
import { clearControlGrant, loadControlGrant } from './control-secure-store';
import { clearLocalPairingApprovalRecords } from './control-pairing-local-approval';
import { clearControlReplayHistory } from './control-replay-store';
import { getStoredPendingPairingId } from './control-pairing-recovery';
import { runPairingMutation } from './control-pairing-mutex';

/**
 * Revoke device access locally. Delete the key FIRST so a storage failure
 * cannot leave an active cryptographic credential after reporting success.
 * If deletion fails, the operation rejects and the UI must show an error.
 */
export function disconnectControlPairing(): Promise<void> {
  return runPairingMutation(async () => {
  const grant = await loadControlGrant();
  // An interrupted pairing can leave a key without a saved grant. Revoke
  // that credential as well before clearing the pending approval records.
  const pendingId = await getStoredPendingPairingId();
  if (grant) await removeControlHmacKey(grant.pairingId);
  if (pendingId && pendingId !== grant?.pairingId) {
    await removeControlHmacKey(pendingId);
  }
  await clearControlGrant();
  // Also invalidate an unfinished approval so it cannot survive disconnect.
  // Cleanup failures are surfaced to the UI, never reported as success.
  await clearLocalPairingApprovalRecords();
  // Safe only after deleting the old HMAC key. New pairings require fresh keys.
  await clearControlReplayHistory();
  });
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
    // A known-answer test must accept a valid MAC and reject an altered one.
    // HMAC-SHA256 with 32 zero key bytes and an empty message.
    const expected = Uint8Array.from([0xb6,0x13,0x67,0x9a,0x08,0x14,0xd9,0xec,0x77,0x2f,0x95,0xd7,0x78,0xc3,0x5f,0xc5,0xff,0x16,0x97,0xc4,0x93,0x71,0x56,0x53,0xc6,0xc7,0x12,0x14,0x42,0x92,0xc5,0xad]);
    const valid = await subtle.verify('HMAC', key, expected, new Uint8Array(0));
    expected[0] ^= 1;
    const invalid = await subtle.verify('HMAC', key, expected, new Uint8Array(0));
    if (valid !== true || invalid !== false) return { available: false, reason: 'hmac-unavailable' };
    return { available: true, reason: 'available' };
  } catch {
    return { available: false, reason: 'hmac-unavailable' };
  }
}
