import type { ControlScope } from './control-policy';
import type { PairingRequest } from './control-pairing';
import type { PairingChallenge } from './control-pairing-proof';
import { preparePairingConsent } from './control-pairing-consent';
import { loadControlGrant } from './control-secure-store';
import { runPairingMutation } from './control-pairing-mutex';
import { getStoredPendingPairingId } from './control-pairing-recovery';
import { removeControlHmacKey } from './control-hmac';
import { createPendingPairingChallenge, cancelPendingPairingChallenge } from './control-pending-pairing';
import { storeLocalPairingConsent, clearBoundPairingConsent } from './control-pairing-consent-store';

/**
 * Called only from a local, explicit approval gesture.
 * Store the exact selected scopes bound to a fresh device-generated challenge.
 * No remote connection or access grant is created.
 */
export function prepareLocalPairingApproval(
  request: PairingRequest,
  selectedScopes: readonly ControlScope[],
  now = Date.now(),
): Promise<PairingChallenge> {
  return runPairingMutation(async () => {
  if (!Number.isSafeInteger(now)) throw new Error('Invalid approval time');
  const consent = preparePairingConsent(request, selectedScopes, new Date(now).toISOString());
  if (!consent) throw new Error('Invalid or expired pairing consent');
  // Never stage a second pairing over an existing grant. Require explicit
  // disconnection first, including for expired or revoked grants.
  if (await loadControlGrant()) throw new Error('Disconnect existing pairing first');
  // An interrupted earlier approval may have provisioned a key. Destroy it
  // BEFORE overwriting its only durable pairing identifier, even if expired.
  const previousPairingId = await getStoredPendingPairingId();
  if (previousPairingId) await removeControlHmacKey(previousPairingId);
  await clearBoundPairingConsent();
  const challenge = await createPendingPairingChallenge(consent.pairingId, now);
  try {
    await storeLocalPairingConsent(consent, challenge, now);
    return challenge;
  } catch (error) {
    // Keep the challenge identity until consent deletion succeeds.
    await clearBoundPairingConsent();
    await cancelPendingPairingChallenge();
    throw error;
  }
  });
}

/** Internal cleanup while the caller already owns the pairing lifecycle lock. */
export async function clearLocalPairingApprovalRecords(): Promise<void> {
  // Preserve the pending identity if consent deletion fails.
  await clearBoundPairingConsent();
  await cancelPendingPairingChallenge();
}

/** Cancel pending approval, revoking its secret before deleting its identity. */
export function cancelLocalPairingApproval(): Promise<void> {
  return runPairingMutation(async () => {
    const pendingId = await getStoredPendingPairingId();
    if (pendingId) await removeControlHmacKey(pendingId);
    await clearLocalPairingApprovalRecords();
  });
}
