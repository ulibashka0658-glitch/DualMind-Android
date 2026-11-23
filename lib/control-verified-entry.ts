import type { ControlGrant } from './control-policy';
import { verifyControlHmac } from './control-hmac';
import { authorizeSignedControlRequest, type SignedControlEnvelope } from './control-signed-request';

/**
 * Production entry point for future trusted transport. Unlike the injectable
 * unit-test gate, this always uses the device-bound HMAC verifier.
 * This module does not expose any network listener or command dispatcher.
 */
export async function verifyDeviceControlRequest(
  envelope: SignedControlEnvelope,
  grant: ControlGrant | null,
  now: number = Date.now(),
): Promise<{ allowed: boolean; reason: string }> {
  return authorizeSignedControlRequest(envelope, grant, now, verifyControlHmac);
}
