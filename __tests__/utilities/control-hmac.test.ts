jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));

import * as SecureStore from 'expo-secure-store';
import { provisionControlHmacKey, removeControlHmacKey, verifyControlHmac } from '../../lib/control-hmac';

const key = Buffer.alloc(32, 7).toString('base64');
const signature = Buffer.alloc(32, 9).toString('base64');

describe('device-bound HMAC verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it('rejects missing and invalid pairing identities', async () => {
    expect(await verifyControlHmac('message', signature, '../other')).toBe(false);
    await expect(provisionControlHmacKey('../other', key)).rejects.toThrow('Invalid pairing key');
    await expect(removeControlHmacKey('../other')).rejects.toThrow('Invalid pairing ID');
  });

  it('rejects malformed signatures and secrets', async () => {
    expect(await verifyControlHmac('message', 'bad', 'pair-1')).toBe(false);
    await expect(provisionControlHmacKey('pair-1', 'not-base64')).rejects.toThrow('Invalid pairing key');
  });

  it('provisions and revokes a key only in secure storage', async () => {
    await provisionControlHmacKey('pair-1', key);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'dualmind-control-hmac-v1-pair-1', key, { keychainAccessible: 'device-only' },
    );
    await removeControlHmacKey('pair-1');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('dualmind-control-hmac-v1-pair-1');
  });

  it('refuses to overwrite an existing key for the same pairing', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(key);
    await expect(provisionControlHmacKey('pair-1', signature)).rejects.toThrow('Pairing key already exists');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('fails closed if checking for an existing key fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    await expect(provisionControlHmacKey('pair-1', key)).rejects.toThrow('locked');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('rejects when platform cryptography or secure storage is unavailable', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    expect(await verifyControlHmac('message', signature, 'pair-1')).toBe(false);
  });
});
