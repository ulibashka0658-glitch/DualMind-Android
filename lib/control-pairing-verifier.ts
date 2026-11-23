import { verifyControlHmac } from './control-hmac';
import { verifyPairingProof, type PairingChallenge } from './control-pairing-proof';

/**
 * Production verifier for an already-established trusted pairing key.
 * Does not establish a key or activate a remote transport.
 */
export async function verifyDevicePairingProof(
  challenge: PairingChallenge,
  signature: string,
  expectedPairingId: string,
  now = Date.now(),
): Promise<boolean> {
  return verifyPairingProof(challenge, signature, expectedPairingId, now, verifyControlHmac);
}
