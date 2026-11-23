import type { ControlScope } from './control-policy';
import type { PairingRequest } from './control-pairing';

const scopes: readonly ControlScope[] = [
  'status:read', 'models:read', 'downloads:read', 'diagnostics:read',
];

/**
 * Strictly decode a request for LOCAL PREVIEW ONLY. Parsing a QR or pasted
 * request never grants access or provisions a key.
 */
export function parsePairingRequest(input: string, now: number): PairingRequest | null {
  if (typeof input !== 'string' || input.length > 4096 || !Number.isSafeInteger(now)) return null;
  try {
    const value: unknown = JSON.parse(input);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    if (data.version !== 1 || typeof data.pairingId !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,128}$/.test(data.pairingId) ||
        typeof data.createdAt !== 'string' || typeof data.expiresAt !== 'string' ||
        !Array.isArray(data.requestedScopes) || data.requestedScopes.length === 0 ||
        data.requestedScopes.length > scopes.length ||
        !data.requestedScopes.every(scope => typeof scope === 'string' && scopes.includes(scope as ControlScope)) ||
        new Set(data.requestedScopes).size !== data.requestedScopes.length) return null;
    const created = Date.parse(data.createdAt);
    const expires = Date.parse(data.expiresAt);
    if (!Number.isFinite(created) || !Number.isFinite(expires) ||
        created > now || expires <= now || expires <= created ||
        expires - created > 24 * 60 * 60 * 1000) return null;
    return {
      pairingId: data.pairingId,
      requestedScopes: data.requestedScopes as ControlScope[],
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
    };
  } catch {
    return null;
  }
}
