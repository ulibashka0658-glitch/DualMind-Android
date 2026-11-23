import { checkAndRecordNonce } from '../../lib/control-replay';

const nonce = '0123456789abcdef0123456789abcdef';
const now = 1795435200000;

describe('authenticated control replay protection', () => {
  it('accepts a fresh nonce once and rejects replay', () => {
    const first = checkAndRecordNonce({}, 'pair-1', nonce, now, now);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(checkAndRecordNonce(first.state, 'pair-1', nonce, now, now))
      .toEqual({ ok: false, reason: 'replayed' });
  });
  it('scopes nonces to the pairing', () => {
    const first = checkAndRecordNonce({}, 'pair-1', nonce, now, now);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(checkAndRecordNonce(first.state, 'pair-2', nonce, now, now).ok).toBe(true);
  });
  it('rejects stale future and malformed requests', () => {
    expect(checkAndRecordNonce({}, 'pair-1', nonce, now - 600000, now))
      .toEqual({ ok: false, reason: 'stale' });
    expect(checkAndRecordNonce({}, 'pair-1', nonce, now + 600000, now))
      .toEqual({ ok: false, reason: 'stale' });
    expect(checkAndRecordNonce({}, 'pair-1', 'short', now, now))
      .toEqual({ ok: false, reason: 'invalid-request' });
  });
  it('prunes expired nonce entries', () => {
    const first = checkAndRecordNonce({ old: now - 1000000 }, 'pair-1', nonce, now, now);
    expect(first.ok).toBe(true);
    if (first.ok) expect(Object.keys(first.state)).toHaveLength(1);
  });
});
