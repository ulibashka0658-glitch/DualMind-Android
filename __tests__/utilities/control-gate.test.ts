import { checkControlRequest } from '../../lib/control-gate';

describe('remote command decision gate', () => {
  it('rejects every command without a pairing and audits the rejection', () => {
    const result = checkControlRequest({ grant: null, audit: [] }, 'app.status', '2026-11-23T10:00:00Z');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unpaired');
    expect(result.state.audit).toHaveLength(1);
    expect(result.state.audit[0].reason).toBe('unpaired');
  });
  it('permits a scoped read-only request and audits it', () => {
    const result = checkControlRequest({
      grant: { pairingId: 'pair-1', scopes: ['status:read'], expiresAt: '2026-11-24T00:00:00Z', revoked: false },
      audit: [],
    }, 'app.status', '2026-11-23T10:00:00Z');
    expect(result.allowed).toBe(true);
    expect(result.state.audit[0].allowed).toBe(true);
  });
});
