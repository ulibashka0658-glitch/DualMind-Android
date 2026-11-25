import { loadControlGrant } from './control-secure-store';
import { getStoredPendingPairingId } from './control-pairing-recovery';
import { runPairingMutation } from './control-pairing-mutex';

export type PairingRecoveryState =
  | { state: 'unpaired'; pairingId: null }
  | { state: 'pending'; pairingId: string }
  | { state: 'paired'; pairingId: string }
  | { state: 'cleanup-required'; pairingId: string | null }
  | { state: 'storage-unavailable'; pairingId: null };

/**
 * Read-only recovery classification after a process restart.
 * Never approves a challenge, deletes a key, or activates remote commands.
 * Serialize against in-process pairing mutations for a consistent snapshot.
 */
export function inspectPairingRecoveryState(): Promise<PairingRecoveryState> {
  return runPairingMutation(async () => {
    try {
      const grant = await loadControlGrant();
      const pendingId = await getStoredPendingPairingId();
      if (grant && pendingId) {
        return { state: 'cleanup-required', pairingId: grant.pairingId };
      }
      if (grant) return { state: 'paired', pairingId: grant.pairingId };
      if (pendingId) return { state: 'pending', pairingId: pendingId };
      return { state: 'unpaired', pairingId: null };
    } catch {
      // Corrupt or locked SecureStore data must never appear unpaired.
      return { state: 'storage-unavailable', pairingId: null };
    }
  });
}
