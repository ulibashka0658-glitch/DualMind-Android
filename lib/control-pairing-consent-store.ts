import * as SecureStore from 'expo-secure-store';
import type { PairingConsent } from './control-pairing-consent';
import type { PairingChallenge } from './control-pairing-proof';
import { validatePairingChallenge } from './control-pairing-proof';

const KEY = 'dualmind-control-pairing-consent-v1';
const SCOPES = ['status:read', 'models:read', 'downloads:read', 'diagnostics:read'];
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(action: () => Promise<T>): Promise<T> {
  const task = queue.catch(() => undefined).then(action);
  queue = task;
  return task;
}

function validConsent(value: unknown, challenge: PairingChallenge, now: number): value is PairingConsent {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !validatePairingChallenge(challenge, now)) return false;
  const data = value as Record<string, unknown>;
  const expiry = typeof data.expiresAt === 'string' ? Date.parse(data.expiresAt) : NaN;
  return data.pairingId === challenge.pairingId &&
    Number.isFinite(expiry) && expiry > now &&
    Array.isArray(data.approvedScopes) && data.approvedScopes.length > 0 &&
    data.approvedScopes.length <= SCOPES.length &&
    data.approvedScopes.every(scope => typeof scope === 'string' && SCOPES.includes(scope)) &&
    new Set(data.approvedScopes).size === data.approvedScopes.length;
}

/**
 * Only a local user gesture may call this. Bind consent to the exact
 * device-generated challenge. The caller must not expose it to remote input.
 */
export function storeLocalPairingConsent(
  consent: PairingConsent, challenge: PairingChallenge, now = Date.now(),
): Promise<void> {
  return serialized(async () => {
    if (!validConsent(consent, challenge, now)) throw new Error('Invalid consent');
    await SecureStore.setItemAsync(KEY, JSON.stringify({ consent, challenge }), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });
}

/** Returns only consent stored locally for the exact, still-valid challenge. */
export function loadBoundPairingConsent(
  challenge: PairingChallenge, now = Date.now(),
): Promise<PairingConsent | null> {
  return serialized(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const data = parsed as Record<string, unknown>;
      if (JSON.stringify(data.challenge) !== JSON.stringify(challenge) ||
          !validConsent(data.consent, challenge, now)) return null;
      return data.consent as PairingConsent;
    } catch {
      return null;
    }
  });
}

export function clearBoundPairingConsent(): Promise<void> {
  return serialized(() => SecureStore.deleteItemAsync(KEY));
}
