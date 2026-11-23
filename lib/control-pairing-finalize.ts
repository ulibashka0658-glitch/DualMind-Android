import type { ControlGrant } from './control-policy';
import type { PairingConsent } from './control-pairing-consent';
import type { PairingChallenge } from './control-pairing-proof';
import { consumePendingPairingProof, cancelPendingPairingChallenge } from './control-pending-pairing';
import { removeControlHmacKey } from './control-hmac';
import { runPairingMutation } from './control-pairing-mutex';
import { loadControlGrant, saveControlGrant } from './control-secure-store';
import { loadBoundPairingConsent, clearBoundPairingConsent } from './control-pairing-consent-store';


/**
 * Finalize ONLY after a trusted, out-of-band authenticated key exchange
 * provisioned the shared key and the user explicitly approved the scopes.
 * The UI preview must never call this directly.
 */
export function finalizeVerifiedPairing(
  consent: PairingConsent,
  challenge: PairingChallenge,
  signature: string,
  now = Date.now(),
): Promise<{ ok: boolean; reason: string }> {
  return runPairingMutation(async () => {
    if (!consent || !challenge || consent.pairingId !== challenge.pairingId ||
        !Number.isSafeInteger(now) || !Array.isArray(consent.approvedScopes) ||
        !consent.approvedScopes.length || typeof consent.expiresAt !== 'string' ||
        (!Number.isFinite(Date.parse(consent.expiresAt)) || Date.parse(consent.expiresAt) <= now) ||
        consent.approvedScopes.some(scope => ![
          'status:read', 'models:read', 'downloads:read', 'diagnostics:read',
        ].includes(scope))) {
      return { ok: false, reason: 'invalid-consent' };
    }
    try {
      const approved = await loadBoundPairingConsent(challenge, now);
      if (!approved || JSON.stringify(approved) !== JSON.stringify(consent)) {
        return { ok: false, reason: 'consent-not-bound' };
      }
      const existing = await loadControlGrant();
      if (existing) return { ok: false, reason: 'existing-pairing' };
      if (!await consumePendingPairingProof(challenge, signature, now, true)) {
        return { ok: false, reason: 'proof-rejected' };
      }
      const grant: ControlGrant = {
        pairingId: consent.pairingId,
        scopes: [...new Set(consent.approvedScopes)],
        expiresAt: consent.expiresAt,
        revoked: false,
      };
      try {
        await saveControlGrant(grant);
      } catch {
        // The proof was consumed but no grant could be saved. Remove the
        // provisioned secret so it cannot linger as an orphaned credential.
        try {
          await removeControlHmacKey(consent.pairingId);
        } catch {
          return { ok: false, reason: 'orphaned-key-cleanup-failed' };
        }
        return { ok: false, reason: 'grant-save-failed-key-removed' };
      }
      try {
        // The grant is durable before the challenge identity is removed.
        await clearBoundPairingConsent();
        await cancelPendingPairingChallenge();
      } catch {
        // Access has been saved, so report failure rather than silently
        // claiming that cleanup completed. A retry will reject existing grant.
        return { ok: false, reason: 'pairing-cleanup-failed' };
      }
      return { ok: true, reason: 'paired' };
    } catch {
      return { ok: false, reason: 'secure-storage-unavailable' };
    }
  });
}
