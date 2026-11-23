import { preparePairingConsent } from '../../lib/control-pairing-consent';

const request = {
  pairingId: '0123456789abcdef0123456789abcdef',
  createdAt: '2026-11-23T10:00:00Z',
  expiresAt: '2026-11-23T11:00:00Z',
  requestedScopes: ['status:read', 'models:read'] as const,
};
const now = '2026-11-23T10:05:00Z';

describe('local pairing consent proposal', () => {
  it('only approves explicitly selected subset', () => {
    expect(preparePairingConsent(request, ['status:read'], now)).toEqual({
      pairingId: request.pairingId,
      approvedScopes: ['status:read'],
      expiresAt: request.expiresAt,
    });
  });
  it('rejects empty, unrequested and expired consent', () => {
    expect(preparePairingConsent(request, [], now)).toBeNull();
    expect(preparePairingConsent(request, ['downloads:read'], now)).toBeNull();
    expect(preparePairingConsent(request, ['status:read'], '2026-11-23T11:00:00Z')).toBeNull();
  });
  it('does not issue a grant or mark a pairing active', () => {
    const proposal = preparePairingConsent(request, ['models:read'], now);
    expect(proposal).not.toHaveProperty('revoked');
    expect(proposal).not.toHaveProperty('grant');
  });
});
