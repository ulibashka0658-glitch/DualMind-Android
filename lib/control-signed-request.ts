import { authorizeControlCommand, type ControlGrant } from './control-policy';
import { consumeAuthenticatedNonce } from './control-replay-store';

export type SignedControlEnvelope = {
  version: 1;
  pairingId: string;
  command: string;
  nonce: string;
  issuedAt: number;
  signature: string;
};

/**
 * A verifier must authenticate the canonical envelope using a key bound to
 * pairingId. A caller-supplied boolean is NOT authentication.
 * No transport is enabled until a concrete cryptographic verifier exists.
 */
export type VerifyControlSignature = (
  signedFields: string,
  signature: string,
  pairingId: string,
) => Promise<boolean>;

export type ControlRequestResult = {
  allowed: boolean;
  reason: string;
};

/** Unambiguous fixed-order serialization, with signature excluded. */
export function canonicalControlRequest(envelope: SignedControlEnvelope): string {
  return JSON.stringify([
    envelope.version,
    envelope.pairingId,
    envelope.command,
    envelope.nonce,
    envelope.issuedAt,
  ]);
}

/**
 * Authenticate first, then check the local grant, then durably consume nonce.
 * Do not execute commands from here. The transport must only dispatch on
 * allowed=true, and must never bypass this gate.
 */
export async function authorizeSignedControlRequest(
  envelope: SignedControlEnvelope,
  grant: ControlGrant | null,
  now: number,
  verifySignature: VerifyControlSignature,
  consumeNonce: typeof consumeAuthenticatedNonce = consumeAuthenticatedNonce,
): Promise<ControlRequestResult> {
  if (!envelope || envelope.version !== 1 ||
      typeof envelope.pairingId !== 'string' || !envelope.pairingId.trim() ||
      typeof envelope.command !== 'string' ||
      typeof envelope.nonce !== 'string' || envelope.nonce.length < 16 || envelope.nonce.length > 256 ||
      typeof envelope.signature !== 'string' || !envelope.signature ||
      !Number.isSafeInteger(envelope.issuedAt) || !Number.isSafeInteger(now)) {
    return { allowed: false, reason: 'invalid-request' };
  }
  if (!grant || grant.pairingId !== envelope.pairingId) {
    return { allowed: false, reason: 'unpaired' };
  }
  const policy = authorizeControlCommand(envelope.command, grant, new Date(now).toISOString());
  if (!policy.allowed) return { allowed: false, reason: policy.reason };

  let authenticated = false;
  try {
    authenticated = await verifySignature(
      canonicalControlRequest(envelope), envelope.signature, envelope.pairingId,
    );
  } catch {
    return { allowed: false, reason: 'authentication-failed' };
  }
  if (authenticated !== true) return { allowed: false, reason: 'authentication-failed' };
  return consumeNonce(envelope.pairingId, envelope.nonce, envelope.issuedAt, now);
}
