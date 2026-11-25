import { authorizeSignedControlRequest, type SignedControlEnvelope } from './control-signed-request';
import { verifyControlHmac } from './control-hmac';
import { loadControlGrant } from './control-secure-store';
import { getStoredPendingPairingId } from './control-pairing-recovery';
import { runPairingMutation } from './control-pairing-mutex';

export type StatusCommandResponse =
  | { ok: true; data: { protocolVersion: 1; status: 'ready' } }
  | { ok: false; reason: string };

/**
 * Transport-independent endpoint. No listener or network access is enabled.
 * Serialize with revocation and pairing changes. Only a minimal status
 * response is exposed, never credentials, chat history or device identifiers.
 */
export function handleControlStatusRequest(input: unknown): Promise<StatusCommandResponse> {
  return runPairingMutation(async (): Promise<StatusCommandResponse> => {
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, reason: 'invalid-request' };
      }
      const request = input as SignedControlEnvelope;
      if (request.command !== 'app.status') {
        return { ok: false, reason: 'unsupported-command' };
      }
      if (await getStoredPendingPairingId()) {
        return { ok: false, reason: 'pairing-incomplete' };
      }
      const grant = await loadControlGrant();
      const decision = await authorizeSignedControlRequest(
        request, grant, Date.now(), verifyControlHmac,
      );
      if (!decision.allowed) return { ok: false, reason: decision.reason };
      if (!grant || Date.parse(grant.expiresAt) <= Date.now()) {
        return { ok: false, reason: 'expired' };
      }
      return { ok: true, data: { protocolVersion: 1, status: 'ready' } };
    } catch {
      return { ok: false, reason: 'security-unavailable' };
    }
  });
}
