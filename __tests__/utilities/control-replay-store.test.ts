jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

import * as SecureStore from 'expo-secure-store';
import { consumeAuthenticatedNonce } from '../../lib/control-replay-store';

const get = SecureStore.getItemAsync as jest.Mock;
const set = SecureStore.setItemAsync as jest.Mock;
const now = 1795435200000;

describe('persistent replay nonce storage', () => {
  beforeEach(() => {
    get.mockReset();
    set.mockReset();
    let stored: string | null = null;
    get.mockImplementation(async () => stored);
    set.mockImplementation(async (_key: string, value: string) => { stored = value; });
  });
  it('persists the nonce before allowing a command and rejects the replay', async () => {
    const nonce = '0123456789abcdef0123456789abcdef';
    expect(await consumeAuthenticatedNonce('pair-a', nonce, now, now))
      .toEqual({ allowed: true, reason: 'accepted' });
    expect(set).toHaveBeenCalledTimes(1);
    expect(await consumeAuthenticatedNonce('pair-a', nonce, now, now))
      .toEqual({ allowed: false, reason: 'replayed' });
  });
  it('fails closed if secure storage cannot be read', async () => {
    get.mockRejectedValueOnce(new Error('locked'));
    expect(await consumeAuthenticatedNonce('pair-a', 'abcdef0123456789', now, now))
      .toEqual({ allowed: false, reason: 'storage-unavailable' });
  });
  it('fails closed if the nonce cannot be persisted', async () => {
    set.mockRejectedValueOnce(new Error('disk error'));
    expect(await consumeAuthenticatedNonce('pair-a', 'abcdef0123456789', now, now))
      .toEqual({ allowed: false, reason: 'storage-unavailable' });
  });
  it('rejects malformed stored state', async () => {
    get.mockResolvedValueOnce('[]');
    expect(await consumeAuthenticatedNonce('pair-a', 'abcdef0123456789', now, now))
      .toEqual({ allowed: false, reason: 'invalid-storage' });
  });
});
