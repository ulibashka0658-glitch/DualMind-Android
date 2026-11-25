import * as SecureStore from 'expo-secure-store';
import { checkAndRecordNonce, type ReplayState } from './control-replay';

const REPLAY_KEY = 'dualmind-control-replay-v1';
let queue: Promise<unknown> = Promise.resolve();

/**
 * Persist nonce consumption before returning success. Serialized within this
 * JS process. The future transport must authenticate requests first and must
 * not dispatch a command if secure storage fails.
 */
export function consumeAuthenticatedNonce(
  pairingId: string,
  nonce: string,
  issuedAt: number,
  now: number,
): Promise<{ allowed: boolean; reason: string }> {
  const task = queue.catch(() => undefined).then(async () => {
    let state: ReplayState = Object.create(null);
    try {
      const stored = await SecureStore.getItemAsync(REPLAY_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { allowed: false, reason: 'invalid-storage' };
        }
        const entries = Object.entries(parsed);
        if (entries.length > 20000 || entries.some(([key, value]) =>
          key.length > 600 || typeof value !== 'number' || !Number.isSafeInteger(value))) {
          return { allowed: false, reason: 'invalid-storage' };
        }
        state = parsed as ReplayState;
      }
      const decision = checkAndRecordNonce(state, pairingId, nonce, issuedAt, now);
      if (!decision.ok) return { allowed: false, reason: decision.reason };
      await SecureStore.setItemAsync(REPLAY_KEY, JSON.stringify(decision.state), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return { allowed: true, reason: 'accepted' };
    } catch (error) {
      console.error('Control replay storage unavailable:', error);
      return { allowed: false, reason: 'storage-unavailable' };
    }
  });
  queue = task;
  return task;
}

/**
 * Purge replay metadata only after the old authentication key is destroyed.
 * Use the same queue as nonce consumption to prevent local read/write races.
 * Re-pairing must always provision a NEW independent secret.
 */
export function clearControlReplayHistory(): Promise<void> {
  const task = queue.catch(() => undefined).then(() => SecureStore.deleteItemAsync(REPLAY_KEY));
  queue = task;
  return task;
}
