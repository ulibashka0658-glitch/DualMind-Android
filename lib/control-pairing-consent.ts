import type { ControlScope } from './control-policy';
import type { PairingRequest } from './control-pairing';
import { approvePairing } from './control-pairing';

export type PairingConsent = {
  pairingId: string;
  approvedScopes: readonly ControlScope[];
  expiresAt: string;
};

/**
 * Local user consent is a proposal, NOT a grant. The caller must complete
 * authenticated key exchange and a one-time proof before persisting a grant.
 */
export function preparePairingConsent(
  request: PairingRequest,
  selectedScopes: readonly ControlScope[],
  now: string,
): PairingConsent | null {
  const decision = approvePairing(request, selectedScopes, now);
  if (!decision.ok) return null;
  return {
    pairingId: decision.grant.pairingId,
    approvedScopes: decision.grant.scopes,
    expiresAt: decision.grant.expiresAt,
  };
}
