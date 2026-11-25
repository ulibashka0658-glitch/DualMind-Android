jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));

import * as SecureStore from 'expo-secure-store';
import { loadControlGrant } from '../../lib/control-secure-store';

const get = SecureStore.getItemAsync as jest.Mock;
const valid = {
  pairingId: '0123456789abcdef0123456789abcdef',
  scopes: ['status:read'],
  expiresAt: '2026-12-01T00:00:00.000Z',
  revoked: false,
};

describe('persisted control grant validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('treats an absent grant as unpaired', async () => {
    get.mockResolvedValueOnce(null);
    await expect(loadControlGrant()).resolves.toBeNull();
  });

  it('loads a valid persisted grant', async () => {
    get.mockResolvedValueOnce(JSON.stringify(valid));
    await expect(loadControlGrant()).resolves.toEqual(valid);
  });

  it.each([
    '{broken',
    JSON.stringify({ ...valid, pairingId: '../bad' }),
    JSON.stringify({ ...valid, scopes: [] }),
    JSON.stringify({ ...valid, scopes: ['unknown:write'] }),
    JSON.stringify({ ...valid, revoked: 'false' }),
    'null',
  ])('fails closed on malformed stored grant: %s', async raw => {
    get.mockResolvedValueOnce(raw);
    await expect(loadControlGrant()).rejects.toThrow('Unreadable stored control grant');
  });

  it('propagates locked secure storage as an error', async () => {
    get.mockRejectedValueOnce(new Error('locked'));
    await expect(loadControlGrant()).rejects.toThrow('locked');
  });
});
