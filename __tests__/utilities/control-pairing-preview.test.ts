import { parsePairingRequest } from '../../lib/control-pairing-preview';

const now = Date.parse('2026-11-23T10:05:00Z');
const valid = {
  version: 1,
  pairingId: '0123456789abcdef0123456789abcdef',
  createdAt: '2026-11-23T10:00:00Z',
  expiresAt: '2026-11-23T11:00:00Z',
  requestedScopes: ['status:read', 'models:read'],
};

describe('pairing request preview', () => {
  it('parses a short-lived read-only request', () => {
    expect(parsePairingRequest(JSON.stringify(valid), now)).toEqual({
      pairingId: valid.pairingId,
      createdAt: valid.createdAt,
      expiresAt: valid.expiresAt,
      requestedScopes: valid.requestedScopes,
    });
  });
  it('rejects unknown and duplicate scopes', () => {
    expect(parsePairingRequest(JSON.stringify({ ...valid, requestedScopes: ['shell:exec'] }), now)).toBeNull();
    expect(parsePairingRequest(JSON.stringify({ ...valid, requestedScopes: ['status:read', 'status:read'] }), now)).toBeNull();
  });
  it('rejects expired, future and overlong requests', () => {
    expect(parsePairingRequest(JSON.stringify(valid), Date.parse('2026-11-23T11:00:00Z'))).toBeNull();
    expect(parsePairingRequest(JSON.stringify({ ...valid, createdAt: '2026-11-23T10:10:00Z' }), now)).toBeNull();
    expect(parsePairingRequest(JSON.stringify({ ...valid, expiresAt: '2026-11-25T11:00:00Z' }), now)).toBeNull();
  });
  it('rejects malformed input and unsafe pairing identifiers', () => {
    expect(parsePairingRequest('not-json', now)).toBeNull();
    expect(parsePairingRequest(JSON.stringify({ ...valid, pairingId: '../secret' }), now)).toBeNull();
  });
});
