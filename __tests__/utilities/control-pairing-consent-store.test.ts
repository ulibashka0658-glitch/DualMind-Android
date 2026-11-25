jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));
import * as SecureStore from 'expo-secure-store';
import { storeLocalPairingConsent, loadBoundPairingConsent, clearBoundPairingConsent } from '../../lib/control-pairing-consent-store';
import { Buffer } from 'buffer';

const now = 1795435200000;
const id = '0123456789abcdef0123456789abcdef';
const challenge = {
  version: 1 as const, pairingId: id,
  nonce: Buffer.alloc(32, 9).toString('base64'),
  createdAt: now - 1000, expiresAt: now + 60000,
};
const consent = {
  pairingId: id, approvedScopes: ['status:read'] as const,
  expiresAt: new Date(now + 60000).toISOString(),
};

describe('device-bound pairing consent', () => {
  let saved: string | null;
  beforeEach(() => {
    jest.clearAllMocks();
    saved = null;
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => saved);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (_key, value) => { saved = value; });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => { saved = null; });
  });
  it('stores and retrieves consent only for exact challenge', async () => {
    await storeLocalPairingConsent(consent, challenge, now);
    expect(await loadBoundPairingConsent(challenge, now)).toEqual(consent);
    expect(await loadBoundPairingConsent({ ...challenge, createdAt: now - 2000 }, now)).toBeNull();
  });
  it('rejects escalated and duplicate scopes', async () => {
    await expect(storeLocalPairingConsent({ ...consent, approvedScopes: ['shell:exec'] as any }, challenge, now)).rejects.toThrow();
    await expect(storeLocalPairingConsent({ ...consent, approvedScopes: ['status:read', 'status:read'] }, challenge, now)).rejects.toThrow();
  });
  it('rejects expired challenge and clears stored consent', async () => {
    await expect(storeLocalPairingConsent(consent, challenge, now + 60000)).rejects.toThrow();
    await storeLocalPairingConsent(consent, challenge, now);
    await clearBoundPairingConsent();
    expect(await loadBoundPairingConsent(challenge, now)).toBeNull();
  });
});
