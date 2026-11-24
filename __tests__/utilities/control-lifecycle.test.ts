jest.mock('../../lib/control-pairing-recovery', () => ({ getStoredPendingPairingId: jest.fn() }));
jest.mock('../../lib/control-replay-store', () => ({ clearControlReplayHistory: jest.fn() }));
jest.mock('../../lib/control-pairing-local-approval', () => ({
  clearLocalPairingApprovalRecords: jest.fn(),
}));
jest.mock('../../lib/control-hmac', () => ({ removeControlHmacKey: jest.fn() }));
jest.mock('../../lib/control-secure-store', () => ({
  loadControlGrant: jest.fn(),
  clearControlGrant: jest.fn(),
}));

import { getStoredPendingPairingId } from '../../lib/control-pairing-recovery';
import { clearControlReplayHistory } from '../../lib/control-replay-store';
import { clearLocalPairingApprovalRecords } from '../../lib/control-pairing-local-approval';
import { removeControlHmacKey } from '../../lib/control-hmac';
import { clearControlGrant, loadControlGrant } from '../../lib/control-secure-store';
import { disconnectControlPairing, inspectControlCrypto } from '../../lib/control-lifecycle';

const pendingStatus = getStoredPendingPairingId as jest.Mock;
const clearReplay = clearControlReplayHistory as jest.Mock;
const cancelPending = clearLocalPairingApprovalRecords as jest.Mock;
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
    clearReplay.mockResolvedValue(undefined);
    pendingStatus.mockResolvedValue(null);
  });

  it('destroys cryptographic key before deleting the grant', async () => {
    const calls: string[] = [];
    remove.mockImplementation(async () => { calls.push('key'); });
    clear.mockImplementation(async () => { calls.push('grant'); });
    await disconnectControlPairing();
    expect(calls).toEqual(['key', 'grant']);
    expect(cancelPending).toHaveBeenCalledTimes(1);
    expect(clearReplay).toHaveBeenCalledTimes(1);
  });

  it('does not claim disconnection if key deletion fails', async () => {
    remove.mockRejectedValueOnce(new Error('secure store locked'));
    await expect(disconnectControlPairing()).rejects.toThrow('secure store locked');
    expect(clear).not.toHaveBeenCalled();
    expect(cancelPending).not.toHaveBeenCalled();
    expect(clearReplay).not.toHaveBeenCalled();
  });

  it('clears orphaned grant metadata when no grant is present', async () => {
    load.mockResolvedValueOnce(null);
    await disconnectControlPairing();
    expect(remove).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(cancelPending).toHaveBeenCalledTimes(1);
  });

  it('deletes orphaned key for pending approval even without a grant', async () => {
    load.mockResolvedValueOnce(null);
    pendingStatus.mockResolvedValueOnce('pending-2');
    await disconnectControlPairing();
    expect(remove).toHaveBeenCalledWith('pending-2');
    expect(cancelPending).toHaveBeenCalledTimes(1);
  });

  it('fails closed if the pending record cannot be read', async () => {
    pendingStatus.mockRejectedValueOnce(new Error('storage locked'));
    await expect(disconnectControlPairing()).rejects.toThrow('storage locked');
    expect(clear).not.toHaveBeenCalled();
  });

  it('does not delete the same key twice if grant and pending match', async () => {
    pendingStatus.mockResolvedValueOnce('pair-1');
    await disconnectControlPairing();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not clear a pending approval if its key cannot be deleted', async () => {
    load.mockResolvedValueOnce(null);
    pendingStatus.mockResolvedValueOnce('pending-2');
    remove.mockRejectedValueOnce(new Error('key deletion failed'));
    await expect(disconnectControlPairing()).rejects.toThrow('key deletion failed');
    expect(cancelPending).not.toHaveBeenCalled();
  });

  it('surfaces pending approval cleanup failure instead of reporting success', async () => {
    cancelPending.mockRejectedValueOnce(new Error('secure storage locked'));
    await expect(disconnectControlPairing()).rejects.toThrow('secure storage locked');
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('fails closed if replay history cannot be cleared', async () => {
    clearReplay.mockRejectedValueOnce(new Error('storage locked'));
    await expect(disconnectControlPairing()).rejects.toThrow('storage locked');
  });

  it('reports cryptographic capability as a boolean without exporting keys', async () => {
    const result = await inspectControlCrypto();
    expect(typeof result.available).toBe('boolean');
    expect(['available', 'webcrypto-unavailable', 'hmac-unavailable']).toContain(result.reason);
  });
});

describe('HMAC capability self-test', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else Reflect.deleteProperty(globalThis, 'crypto');
  });
  it.each([
    [true, false, true],
    [true, true, false],
    [false, false, false],
  ])('accepts only correct verification behavior (%s, %s)', async (valid, invalid, available) => {
    const verify = jest.fn().mockResolvedValueOnce(valid).mockResolvedValueOnce(invalid);
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { subtle: { importKey: jest.fn().mockResolvedValue({}), verify } },
    });
    expect((await inspectControlCrypto()).available).toBe(available);
    expect(verify).toHaveBeenCalledTimes(2);
  });
});
