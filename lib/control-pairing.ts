import type { ControlGrant, ControlScope } from './control-policy';

export type PairingRequest = {
  pairingId: string;
  requestedScopes: readonly ControlScope[];
  createdAt: string;
  expiresAt: string;
};

export type PairingDecision =
  | { ok: true; grant: ControlGrant }
  | { ok: false; reason: 'invalid-request' | 'expired' | 'invalid-duration' | 'invalid-scope' };

const ALLOWED_SCOPES: readonly ControlScope[] = [
  'status:read', 'models:read', 'downloads:read', 'diagnostics:read',
];

/** Requires an explicit local approval; does not authenticate remote requests. */
export function approvePairing(
  request: PairingRequest,
  approvedScopes: readonly ControlScope[],
  now: string,
): PairingDecision {
  const current = Date.parse(now);
  const created = Date.parse(request.createdAt);
  const expires = Date.parse(request.expiresAt);
  if (!request.pairingId || !request.pairingId.trim() ||
      !Number.isFinite(current) || !Number.isFinite(created) || !Number.isFinite(expires)) {
    return { ok: false, reason: 'invalid-request' };
  }
  if (expires <= current || created > current) return { ok: false, reason: 'expired' };
  if (expires <= created || expires - created > 24 * 60 * 60 * 1000) {
    return { ok: false, reason: 'invalid-duration' };
  }
  if (!request.requestedScopes.length || !approvedScopes.length ||
      request.requestedScopes.some(scope => !ALLOWED_SCOPES.includes(scope)) ||
      approvedScopes.some(scope => !ALLOWED_SCOPES.includes(scope) || !request.requestedScopes.includes(scope))) {
    return { ok: false, reason: 'invalid-scope' };
  }
  return {
    ok: true,
    grant: {
      pairingId: request.pairingId,
      scopes: [...new Set(approvedScopes)],
      expiresAt: request.expiresAt,
      revoked: false,
    },
  };
}

export function revokePairing(grant: ControlGrant): ControlGrant {
  return { ...grant, revoked: true };
}
