jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
}));
jest.mock('../../lib/control-pairing-consent-store', () => ({
  loadBoundPairingConsent: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import { loadBoundPairingConsent } from '../../lib/control-pairing-consent-store';
import { getLocalPairingApprovalStatus } from '../../lib/control-pairing-recovery';

const now = 1795435200000;
const challenge = {
  version: 1 as const,
  pairingId: '0123456789abcdef0123456789abcdef',
  nonce: Buffer.alloc(32, 3).toString('base64'),
  createdAt: now - 1000,
  expiresAt: now + 60000,
};
const consent = {
  pairingId: challenge.pairingId,
  approvedScopes: ['status:read'] as const,
  expiresAt: new Date(now + 60000).toISOString(),
};

describe('local pairing recovery', () => {
  const get = SecureStore.getItemAsync as jest.Mock;
  const bound = loadBoundPairingConsent as jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    get.mockResolvedValue(JSON.stringify(challenge));
    bound.mockResolvedValue(consent);
  });
  it('restores only matching live challenge and consent', async () => {
    expect(await getLocalPairingApprovalStatus(now)).toEqual({ challenge, consent });
    expect(bound).toHaveBeenCalledWith(challenge, now);
  });
  it('rejects missing and expired challenges without reading consent', async () => {
    get.mockResolvedValueOnce(null);
    expect(await getLocalPairingApprovalStatus(now)).toBeNull();
    expect(await getLocalPairingApprovalStatus(now + 60000)).toBeNull();
    expect(bound).not.toHaveBeenCalled();
  });
  it('rejects missing bound consent and corrupt storage', async () => {
    bound.mockResolvedValueOnce(null);
    expect(await getLocalPairingApprovalStatus(now)).toBeNull();
    get.mockResolvedValueOnce('not-json');
    expect(await getLocalPairingApprovalStatus(now)).toBeNull();
  });
  it('fails closed on secure storage errors', async () => {
    get.mockRejectedValueOnce(new Error('locked'));
    expect(await getLocalPairingApprovalStatus(now)).toBeNull();
  });
});
