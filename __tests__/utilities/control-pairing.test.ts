import { approvePairing, revokePairing, type PairingRequest } from '../../lib/control-pairing';
import { authorizeControlCommand } from '../../lib/control-policy';

const request: PairingRequest = {
  pairingId: 'pair-1',
  requestedScopes: ['status:read', 'models:read'],
  createdAt: '2026-11-23T10:00:00.000Z',
  expiresAt: '2026-11-23T11:00:00.000Z',
};
const now = '2026-11-23T10:05:00.000Z';

describe('explicit device pairing approval', () => {
  it('grants only locally approved scopes', () => {
    const result = approvePairing(request, ['status:read'], now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(authorizeControlCommand('app.status', result.grant, now).allowed).toBe(true);
    expect(authorizeControlCommand('models.list', result.grant, now).allowed).toBe(false);
  });
  it('supports immediate revocation', () => {
    const result = approvePairing(request, ['status:read'], now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(authorizeControlCommand('app.status', revokePairing(result.grant), now))
      .toEqual({ allowed: false, reason: 'revoked' });
  });
  it('rejects unrequested permissions and long-lived grants', () => {
    expect(approvePairing(request, ['diagnostics:read'], now))
      .toEqual({ ok: false, reason: 'invalid-scope' });
    expect(approvePairing({ ...request, expiresAt: '2026-11-30T11:00:00.000Z' }, ['status:read'], now))
      .toEqual({ ok: false, reason: 'invalid-duration' });
  });
  it('rejects expired and malformed requests', () => {
    expect(approvePairing(request, ['status:read'], '2026-11-23T11:00:00.000Z'))
      .toEqual({ ok: false, reason: 'expired' });
    expect(approvePairing({ ...request, pairingId: '' }, ['status:read'], now))
      .toEqual({ ok: false, reason: 'invalid-request' });
  });
});
