/**
 * Replay protection for a future authenticated control transport.
 * Invoke only AFTER cryptographic authentication of the entire request.
 * Nonces must be scoped to the authenticated pairing and persisted across
 * restarts by the transport layer.
 */
export type ReplayState = Readonly<Record<string, number>>;
export type ReplayDecision =
  | { ok: true; state: ReplayState }
  | { ok: false; reason: 'invalid-request' | 'stale' | 'replayed' };

export function checkAndRecordNonce(
  state: ReplayState,
  pairingId: string,
  nonce: string,
  issuedAt: number,
  now: number,
  maxSkewMs = 5 * 60 * 1000,
): ReplayDecision {
  if (!pairingId || !nonce || nonce.length < 16 || nonce.length > 256 ||
      !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(maxSkewMs) || maxSkewMs <= 0) {
    return { ok: false, reason: 'invalid-request' };
  }
  if (Math.abs(now - issuedAt) > maxSkewMs) return { ok: false, reason: 'stale' };
  const key = JSON.stringify([pairingId, nonce]);
  if (Object.prototype.hasOwnProperty.call(state, key)) return { ok: false, reason: 'replayed' };
  const next: Record<string, number> = Object.create(null);
  for (const [storedKey, timestamp] of Object.entries(state)) {
    if (Number.isSafeInteger(timestamp) && timestamp >= now - maxSkewMs * 2) {
      next[storedKey] = timestamp;
    }
  }
  next[key] = now;
  return { ok: true, state: next };
}
