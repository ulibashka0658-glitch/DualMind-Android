import { authorizeControlCommand, type ControlGrant } from '../../lib/control-policy';

const grant: ControlGrant = {
  pairingId: 'device-1',
  scopes: ['status:read', 'models:read'],
  expiresAt: '2026-12-01T00:00:00.000Z',
  revoked: false,
};
const now = '2026-11-23T12:00:00.000Z';

describe('read-only control authorization', () => {
  it('permits explicitly granted commands', () => {
    expect(authorizeControlCommand('app.status', grant, now)).toEqual({ allowed: true, command: 'app.status' });
  });
  it('denies commands without the required scope', () => {
    expect(authorizeControlCommand('downloads.status', grant, now)).toEqual({ allowed: false, reason: 'insufficient-scope' });
  });
  it('denies arbitrary and mutating commands', () => {
    for (const command of ['shell.exec', 'messages.delete', 'models.download', '__proto__', 'constructor']) {
      expect(authorizeControlCommand(command, grant, now)).toEqual({ allowed: false, reason: 'unknown-command' });
    }
  });
  it('denies missing pairing, revocation, and expiration', () => {
    expect(authorizeControlCommand('app.status', null, now)).toEqual({ allowed: false, reason: 'unpaired' });
    expect(authorizeControlCommand('app.status', { ...grant, revoked: true }, now)).toEqual({ allowed: false, reason: 'revoked' });
    expect(authorizeControlCommand('app.status', { ...grant, expiresAt: now }, now)).toEqual({ allowed: false, reason: 'expired' });
    expect(authorizeControlCommand('app.status', { ...grant, expiresAt: 'invalid' }, now)).toEqual({ allowed: false, reason: 'expired' });
  });
});
