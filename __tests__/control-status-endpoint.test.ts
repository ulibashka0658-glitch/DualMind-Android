import { handleControlStatusRequest } from '../lib/control-status-endpoint';
import { verifyControlHmac } from '../lib/control-hmac';
import { loadControlGrant } from '../lib/control-secure-store';
import { getStoredPendingPairingId } from '../lib/control-pairing-recovery';
import { consumeAuthenticatedNonce } from '../lib/control-replay-store';
import type { ControlGrant } from '../lib/control-policy';

jest.mock('../lib/control-hmac', () => ({ verifyControlHmac: jest.fn() }));
jest.mock('../lib/control-secure-store', () => ({ loadControlGrant: jest.fn() }));
jest.mock('../lib/control-pairing-recovery', () => ({ getStoredPendingPairingId: jest.fn() }));
jest.mock('../lib/control-replay-store', () => ({ consumeAuthenticatedNonce: jest.fn() }));

const verify = jest.mocked(verifyControlHmac);
const load = jest.mocked(loadControlGrant);
const pending = jest.mocked(getStoredPendingPairingId);
const consume = jest.mocked(consumeAuthenticatedNonce);
const pairingId = 'test-pairing-123456';
let grant: ControlGrant;
const request = () => ({
  version: 1, pairingId, command: 'app.status',
  nonce: 'test-nonce-123456789', issuedAt: Date.now(), signature: 'test-signature',
});

beforeEach(() => {
  jest.resetAllMocks();
  grant = { pairingId, scopes: ['status:read'], revoked: false,
    expiresAt: new Date(Date.now() + 60000).toISOString() };
  load.mockResolvedValue(grant);
  pending.mockResolvedValue(null);
  verify.mockResolvedValue(true);
  consume.mockResolvedValue({ allowed: true, reason: 'accepted' });
});

test('returns minimal status only after authentication and nonce consumption', async () => {
  expect(await handleControlStatusRequest(request())).toEqual({
    ok: true, data: { protocolVersion: 1, status: 'ready' },
  });
  expect(verify).toHaveBeenCalledTimes(1);
  expect(consume).toHaveBeenCalledTimes(1);
});

test('rejects invalid signature without consuming nonce', async () => {
  verify.mockResolvedValue(false);
  expect(await handleControlStatusRequest(request())).toEqual({ ok: false, reason: 'authentication-failed' });
  expect(consume).not.toHaveBeenCalled();
});

test('rejects replay decision', async () => {
  consume.mockResolvedValue({ allowed: false, reason: 'replay' });
  expect(await handleControlStatusRequest(request())).toEqual({ ok: false, reason: 'replay' });
});

test('rejects incomplete pairing', async () => {
  pending.mockResolvedValue(pairingId);
  expect(await handleControlStatusRequest(request())).toEqual({ ok: false, reason: 'pairing-incomplete' });
  expect(verify).not.toHaveBeenCalled();
});

test('rejects revoked grant', async () => {
  load.mockResolvedValue({ ...grant, revoked: true });
  expect(await handleControlStatusRequest(request())).toEqual({ ok: false, reason: 'revoked' });
  expect(consume).not.toHaveBeenCalled();
});

test('rejects missing scope', async () => {
  load.mockResolvedValue({ ...grant, scopes: ['models:read'] });
  expect(await handleControlStatusRequest(request())).toEqual({ ok: false, reason: 'insufficient-scope' });
  expect(verify).not.toHaveBeenCalled();
});

test('fails closed on storage error', async () => {
  load.mockRejectedValue(new Error('locked'));
  expect(await handleControlStatusRequest(request())).toEqual({ ok: false, reason: 'security-unavailable' });
});

test('rejects other commands and malformed input', async () => {
  expect(await handleControlStatusRequest({ ...request(), command: 'models.list' })).toEqual({ ok: false, reason: 'unsupported-command' });
  expect(await handleControlStatusRequest(null)).toEqual({ ok: false, reason: 'invalid-request' });
  expect(verify).not.toHaveBeenCalled();
});
