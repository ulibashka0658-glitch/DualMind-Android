import * as SecureStore from 'expo-secure-store';
import type { PairingChallenge } from './control-pairing-proof';
import type { PairingConsent } from './control-pairing-consent';
import { loadBoundPairingConsent } from './control-pairing-consent-store';
import { validatePairingChallenge } from './control-pairing-proof';

const PENDING_KEY = 'dualmind-control-pending-challenge-v1';

export type LocalPairingApprovalStatus = {
  challenge: PairingChallenge;
  consent: PairingConsent;
};

/**
 * Read-only recovery after app restart. Never assumes consent from UI state.
 * Both SecureStore records must match the exact live challenge.
 */
export async function getLocalPairingApprovalStatus(
  now = Date.now(),
): Promise<LocalPairingApprovalStatus | null> {
  if (!Number.isSafeInteger(now)) return null;
  try {
    const raw = await SecureStore.getItemAsync(PENDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!validatePairingChallenge(parsed, now)) return null;
    const challenge = parsed as PairingChallenge;
    const consent = await loadBoundPairingConsent(challenge, now);
    if (!consent) return null;
    return { challenge, consent };
  } catch {
    return null;
  }
}

/**
 * Disconnect-only lookup. Expired challenges still identify an orphaned key
 * that must be destroyed. Storage errors propagate so disconnect fails closed.
 * Never return the challenge nonce or treat this as active consent.
 */
export async function getStoredPendingPairingId(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(PENDING_KEY);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid pending pairing record');
  }
  const id = (parsed as Record<string, unknown>).pairingId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(id)) {
    throw new Error('Invalid pending pairing identity');
  }
  return id;
}
