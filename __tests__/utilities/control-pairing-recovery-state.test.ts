jest.mock('../../lib/control-secure-store', () => ({ loadControlGrant: jest.fn() }));
jest.mock('../../lib/control-pairing-recovery', () => ({ getStoredPendingPairingId: jest.fn() }));

import { loadControlGrant } from '../../lib/control-secure-store';
import { getStoredPendingPairingId } from '../../lib/control-pairing-recovery';
import { inspectPairingRecoveryState } from '../../lib/control-pairing-recovery-state';

const load = loadControlGrant as jest.Mock;
const pending = getStoredPendingPairingId as jest.Mock;
const id = '0123456789abcdef0123456789abcdef';

describe('read-only pairing restart recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    load.mockResolvedValue(null);
    pending.mockResolvedValue(null);
  });

  it('recognizes an empty device without creating access', async () => {
    await expect(inspectPairingRecoveryState()).resolves.toEqual({ state: 'unpaired', pairingId: null });
  });

  it('identifies pending approval without treating it as paired', async () => {
    pending.mockResolvedValueOnce(id);
    await expect(inspectPairingRecoveryState()).resolves.toEqual({ state: 'pending', pairingId: id });
  });

  it('recognizes a persisted grant', async () => {
    load.mockResolvedValueOnce({ pairingId: id, scopes: ['status:read'], revoked: false });
    await expect(inspectPairingRecoveryState()).resolves.toEqual({ state: 'paired', pairingId: id });
  });

  it('requires cleanup if grant and pending challenge coexist', async () => {
    load.mockResolvedValueOnce({ pairingId: id });
    pending.mockResolvedValueOnce(id);
    await expect(inspectPairingRecoveryState()).resolves.toEqual({ state: 'cleanup-required', pairingId: id });
  });

  it('requires cleanup when pending and grant identities differ', async () => {
    load.mockResolvedValueOnce({ pairingId: id });
    pending.mockResolvedValueOnce('abcdef0123456789abcdef0123456789');
    await expect(inspectPairingRecoveryState()).resolves.toEqual({ state: 'cleanup-required', pairingId: id });
  });

  it('fails closed on corrupt or locked storage', async () => {
    load.mockRejectedValueOnce(new Error('corrupt grant'));
    await expect(inspectPairingRecoveryState()).resolves.toEqual({ state: 'storage-unavailable', pairingId: null });
    pending.mockRejectedValueOnce(new Error('locked'));
    await expect(inspectPairingRecoveryState()).resolves.toEqual({ state: 'storage-unavailable', pairingId: null });
  });
});
