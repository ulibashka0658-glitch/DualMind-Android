jest.mock('../../lib/control-pairing-recovery', () => ({ getStoredPendingPairingId: jest.fn() }));
jest.mock('../../lib/control-hmac', () => ({ removeControlHmacKey: jest.fn() }));
jest.mock('../../lib/control-secure-store', () => ({
  loadControlGrant: jest.fn(),
}));
jest.mock('../../lib/control-pending-pairing', () => ({
  createPendingPairingChallenge: jest.fn(),
  cancelPendingPairingChallenge: jest.fn(),
}));
jest.mock('../../lib/control-pairing-consent-store', () => ({
  storeLocalPairingConsent: jest.fn(),
  clearBoundPairingConsent: jest.fn(),
}));

import { getStoredPendingPairingId } from '../../lib/control-pairing-recovery';
import { removeControlHmacKey } from '../../lib/control-hmac';
import { loadControlGrant } from '../../lib/control-secure-store';
import { createPendingPairingChallenge, cancelPendingPairingChallenge } from '../../lib/control-pending-pairing';
import { storeLocalPairingConsent, clearBoundPairingConsent } from '../../lib/control-pairing-consent-store';
import { prepareLocalPairingApproval, cancelLocalPairingApproval } from '../../lib/control-pairing-local-approval';

const pendingId = getStoredPendingPairingId as jest.Mock;
const removeKey = removeControlHmacKey as jest.Mock;
const loadGrant = loadControlGrant as jest.Mock;
const create = createPendingPairingChallenge as jest.Mock;
const cancel = cancelPendingPairingChallenge as jest.Mock;
const store = storeLocalPairingConsent as jest.Mock;
const clear = clearBoundPairingConsent as jest.Mock;
const now = Date.parse('2026-11-23T10:05:00Z');
const request = {
  pairingId: '0123456789abcdef0123456789abcdef',
  createdAt: '2026-11-23T10:00:00Z',
  expiresAt: '2026-11-23T11:00:00Z',
  requestedScopes: ['status:read', 'models:read'] as const,
};
const challenge = { version: 1, pairingId: request.pairingId, nonce: 'nonce', createdAt: now, expiresAt: now + 300000 };

describe('local pairing approval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadGrant.mockResolvedValue(null);
    pendingId.mockResolvedValue(null);
    removeKey.mockResolvedValue(undefined);
    create.mockResolvedValue(challenge);
    store.mockResolvedValue(undefined);
    clear.mockResolvedValue(undefined);
    cancel.mockResolvedValue(undefined);
  });
  it('saves only selected permissions bound to fresh challenge', async () => {
    expect(await prepareLocalPairingApproval(request, ['status:read'], now)).toEqual(challenge);
    expect(create).toHaveBeenCalledWith(request.pairingId, now);
    expect(store).toHaveBeenCalledWith({
      pairingId: request.pairingId,
      approvedScopes: ['status:read'],
      expiresAt: request.expiresAt,
    }, challenge, now);
  });
  it('destroys previous pending key before replacing the challenge', async () => {
    const events: string[] = [];
    pendingId.mockResolvedValueOnce('old-pairing-id-12345');
    removeKey.mockImplementationOnce(async () => { events.push('key'); });
    create.mockImplementationOnce(async () => { events.push('challenge'); return challenge; });
    await prepareLocalPairingApproval(request, ['status:read'], now);
    expect(removeKey).toHaveBeenCalledWith('old-pairing-id-12345');
    expect(events).toEqual(['key', 'challenge']);
  });
  it('does not replace challenge if old key cannot be removed', async () => {
    pendingId.mockResolvedValueOnce('old-pairing-id-12345');
    removeKey.mockRejectedValueOnce(new Error('key locked'));
    await expect(prepareLocalPairingApproval(request, ['status:read'], now)).rejects.toThrow('key locked');
    expect(clear).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it('does not replace challenge when pending storage cannot be read', async () => {
    pendingId.mockRejectedValueOnce(new Error('storage locked'));
    await expect(prepareLocalPairingApproval(request, ['status:read'], now)).rejects.toThrow('storage locked');
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects unrequested scopes before generating challenge', async () => {
    await expect(prepareLocalPairingApproval(request, ['downloads:read'], now)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it('invalidates pending records if consent storage fails', async () => {
    store.mockRejectedValueOnce(new Error('locked'));
    await expect(prepareLocalPairingApproval(request, ['status:read'], now)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(2);
  });
  it('rejects a second pairing while any grant exists', async () => {
    loadGrant.mockResolvedValueOnce({ pairingId: 'existing', revoked: false });
    await expect(prepareLocalPairingApproval(request, ['status:read'], now)).rejects.toThrow('Disconnect existing pairing first');
    expect(clear).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
  it('fails closed when reading existing grant fails', async () => {
    loadGrant.mockRejectedValueOnce(new Error('secure storage locked'));
    await expect(prepareLocalPairingApproval(request, ['status:read'], now)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it('cancels both pending records', async () => {
    await cancelLocalPairingApproval();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
