jest.mock('../../lib/control-pairing-local-approval', () => ({
  cancelLocalPairingApproval: jest.fn(),
}));
jest.mock('../../lib/control-hmac', () => ({ removeControlHmacKey: jest.fn() }));
jest.mock('../../lib/control-secure-store', () => ({
  loadControlGrant: jest.fn(),
  clearControlGrant: jest.fn(),
}));

import { cancelLocalPairingApproval } from '../../lib/control-pairing-local-approval';
import { removeControlHmacKey } from '../../lib/control-hmac';
import { clearControlGrant, loadControlGrant } from '../../lib/control-secure-store';
import { disconnectControlPairing, inspectControlCrypto } from '../../lib/control-lifecycle';

const cancelPending = cancelLocalPairingApproval as jest.Mock;
const load = loadControlGrant as jest.Mock;
const remove = removeControlHmacKey as jest.Mock;
const clear = clearControlGrant as jest.Mock;

describe('device control lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    load.mockResolvedValue({
      pairingId: 'pair-1', scopes: ['status:read'],
      expiresAt: '2026-11-24T00:00:00Z', revoked: false,
    });
    remove.mockResolvedValue(undefined);
    clear.mockResolvedValue(undefined);
    cancelPending.mockResolvedValue(undefined);
  });

  it('destroys cryptographic key before deleting the grant', async () => {
    const calls: string[] = [];
    remove.mockImplementation(async () => { calls.push('key'); });
    clear.mockImplementation(async () => { calls.push('grant'); });
    await disconnectControlPairing();
    expect(calls).toEqual(['key', 'grant']);
    expect(cancelPending).toHaveBeenCalledTimes(1);
  });

  it('does not claim disconnection if key deletion fails', async () => {
    remove.mockRejectedValueOnce(new Error('secure store locked'));
    await expect(disconnectControlPairing()).rejects.toThrow('secure store locked');
    expect(clear).not.toHaveBeenCalled();
    expect(cancelPending).not.toHaveBeenCalled();
  });

  it('clears orphaned grant metadata when no grant is present', async () => {
    load.mockResolvedValueOnce(null);
    await disconnectControlPairing();
    expect(remove).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(cancelPending).toHaveBeenCalledTimes(1);
  });

  it('surfaces pending approval cleanup failure instead of reporting success', async () => {
    cancelPending.mockRejectedValueOnce(new Error('secure storage locked'));
    await expect(disconnectControlPairing()).rejects.toThrow('secure storage locked');
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('reports cryptographic capability as a boolean without exporting keys', async () => {
    const result = await inspectControlCrypto();
    expect(typeof result.available).toBe('boolean');
    expect(['available', 'webcrypto-unavailable', 'hmac-unavailable']).toContain(result.reason);
  });
});
