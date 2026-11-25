import {
  authorizeSignedControlRequest, canonicalControlRequest, type SignedControlEnvelope,
} from '../../lib/control-signed-request';
import type { ControlGrant } from '../../lib/control-policy';

const now = 1795435200000;
const grant: ControlGrant = {
  pairingId: 'pair-a',
  scopes: ['status:read'],
  expiresAt: new Date(now + 600000).toISOString(),
  revoked: false,
};
const envelope: SignedControlEnvelope = {
  version: 1, pairingId: 'pair-a', command: 'app.status',
  nonce: '0123456789abcdef0123456789abcdef', issuedAt: now, signature: 'signed',
};
const verify = jest.fn(async () => true);
const consume = jest.fn(async () => ({ allowed: true, reason: 'accepted' }));

describe('signed control request gate', () => {
  beforeEach(() => { verify.mockClear(); consume.mockClear(); });
  it('uses deterministic canonical serialization', () => {
    expect(canonicalControlRequest(envelope)).toBe(
      JSON.stringify([1, 'pair-a', 'app.status', envelope.nonce, now]),
    );
  });
  it('authenticates and persists nonce before accepting', async () => {
    expect(await authorizeSignedControlRequest(envelope, grant, now, verify, consume))
      .toEqual({ allowed: true, reason: 'accepted' });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(1);
  });
  it('rejects a mismatched pairing before signature validation', async () => {
    expect(await authorizeSignedControlRequest({ ...envelope, pairingId: 'other' }, grant, now, verify, consume))
      .toEqual({ allowed: false, reason: 'unpaired' });
    expect(verify).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });
  it('never consumes a nonce if the signature is invalid', async () => {
    expect(await authorizeSignedControlRequest(envelope, grant, now, async () => false, consume))
      .toEqual({ allowed: false, reason: 'authentication-failed' });
    expect(consume).not.toHaveBeenCalled();
  });
  it('rejects unknown commands even with a valid signature', async () => {
    expect(await authorizeSignedControlRequest({ ...envelope, command: 'shell.exec' }, grant, now, verify, consume))
      .toEqual({ allowed: false, reason: 'unknown-command' });
    expect(consume).not.toHaveBeenCalled();
  });
  it('fails closed on revoked pairing and replay rejection', async () => {
    expect(await authorizeSignedControlRequest(envelope, { ...grant, revoked: true }, now, verify, consume))
      .toEqual({ allowed: false, reason: 'revoked' });
    const rejectReplay = jest.fn(async () => ({ allowed: false, reason: 'replayed' }));
    expect(await authorizeSignedControlRequest(envelope, grant, now, verify, rejectReplay))
      .toEqual({ allowed: false, reason: 'replayed' });
  });
});
