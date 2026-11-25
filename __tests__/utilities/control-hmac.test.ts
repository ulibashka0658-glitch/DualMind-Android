import { createHash, createHmac } from 'crypto';
jest.mock('../../lib/control-secure-store', () => ({ loadControlGrant: jest.fn() }));
jest.mock('../../lib/control-pairing-recovery', () => ({ getLocalPairingApprovalStatus: jest.fn() }));
jest.mock('expo-crypto', () => ({ getRandomBytesAsync: jest.fn(), CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { getLocalPairingApprovalStatus } from '../../lib/control-pairing-recovery';
import { loadControlGrant } from '../../lib/control-secure-store';
import { runPairingMutation } from '../../lib/control-pairing-mutex';
import { generateDevicePairingSecret, provisionControlHmacKey, removeControlHmacKey, verifyControlHmac } from '../../lib/control-hmac';

const key = Buffer.alloc(32, 7).toString('base64');
const signature = Buffer.alloc(32, 9).toString('base64');

describe('device-bound HMAC verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (getLocalPairingApprovalStatus as jest.Mock).mockResolvedValue({ consent: { pairingId: 'pair-1' } });
    (loadControlGrant as jest.Mock).mockResolvedValue(null);
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

  it('serializes key deletion after an in-flight provision', async () => {
    let release!: () => void;
    (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(() =>
      new Promise<void>(resolve => { release = resolve; }),
    );
    const provisioning = provisionControlHmacKey('pair-1', key);
    // Wait for queued provisioning to enter the secure-store write.
    for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
    expect(release).toBeDefined();
    const deletion = removeControlHmacKey('pair-1');
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    release();
    await Promise.all([provisioning, deletion]);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('dualmind-control-hmac-v1-pair-1');
  });

  it('holds the lifecycle lock until provisioning finishes', async () => {
    let release!: () => void;
    const events: string[] = [];
    (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(() =>
      new Promise<void>(resolve => { release = resolve; }),
    );
    const provisioning = provisionControlHmacKey('pair-1', key);
    for (let i = 0; i < 40 && !release; i++) await Promise.resolve();
    expect(release).toBeDefined();
    const next = runPairingMutation(async () => { events.push('next'); });
    expect(events).toEqual([]);
    release();
    await Promise.all([provisioning, next]);
    expect(events).toEqual(['next']);
  });

  it('rejects provisioning without a live locally approved pairing', async () => {
    (getLocalPairingApprovalStatus as jest.Mock).mockResolvedValueOnce(null);
    await expect(provisionControlHmacKey('pair-1', key)).rejects.toThrow('Local pairing approval required');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('rejects provisioning for another pairing identity', async () => {
    (getLocalPairingApprovalStatus as jest.Mock).mockResolvedValueOnce({ consent: { pairingId: 'different' } });
    await expect(provisionControlHmacKey('pair-1', key)).rejects.toThrow('Local pairing approval required');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('rejects provisioning if any prior grant still exists', async () => {
    (loadControlGrant as jest.Mock).mockResolvedValueOnce({ pairingId: 'old-pair', revoked: true });
    await expect(provisionControlHmacKey('pair-1', key)).rejects.toThrow('Disconnect existing pairing first');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('fails closed when grant storage cannot be read', async () => {
    (loadControlGrant as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));
    await expect(provisionControlHmacKey('pair-1', key)).rejects.toThrow('storage locked');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
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

  it('generates a 32-byte base64 secret using platform secure randomness', async () => {
    (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValueOnce(new Uint8Array(32).fill(11));
    const secret = await generateDevicePairingSecret();
    expect(Buffer.from(secret, 'base64')).toEqual(Buffer.alloc(32, 11));
    expect(Crypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
  });

  it('rejects invalid random output rather than provisioning a weak key', async () => {
    (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValueOnce(new Uint8Array(16));
    await expect(generateDevicePairingSecret()).rejects.toThrow('Invalid secure random output');
  });

  it('rejects when platform cryptography or secure storage is unavailable', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    expect(await verifyControlHmac('message', signature, 'pair-1')).toBe(false);
  });
});

describe('secure-store HMAC without WebCrypto', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const digest = Crypto.digest as jest.Mock;
  const read = SecureStore.getItemAsync as jest.Mock;
  const message = 'Проверка подписи';
  const signed = createHmac('sha256', Buffer.from(key, 'base64')).update(message).digest('base64');
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    read.mockResolvedValue(key);
    digest.mockReset();
    digest.mockImplementation(async (_algorithm, bytes) =>
      Uint8Array.from(createHash('sha256').update(Buffer.from(bytes)).digest()).buffer,
    );
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else Reflect.deleteProperty(globalThis, 'crypto');
    digest.mockReset();
    read.mockReset();
  });
  it('accepts a valid signature using the pairing-specific stored key', async () => {
    expect(await verifyControlHmac(message, signed, 'pair-1')).toBe(true);
    expect(read).toHaveBeenCalledWith('dualmind-control-hmac-v1-pair-1');
  });
  it('rejects altered messages and signatures', async () => {
    expect(await verifyControlHmac(message + '!', signed, 'pair-1')).toBe(false);
    const altered = Buffer.from(signed, 'base64');
    altered[0] ^= 1;
    expect(await verifyControlHmac(message, altered.toString('base64'), 'pair-1')).toBe(false);
  });
  it('rejects a different stored key', async () => {
    read.mockResolvedValueOnce(Buffer.alloc(32, 8).toString('base64'));
    expect(await verifyControlHmac(message, signed, 'pair-1')).toBe(false);
  });
  it('fails closed when secure storage rejects', async () => {
    read.mockRejectedValueOnce(new Error('locked'));
    expect(await verifyControlHmac(message, signed, 'pair-1')).toBe(false);
    expect(digest).not.toHaveBeenCalled();
  });
  it('fails closed when native digest rejects', async () => {
    digest.mockRejectedValueOnce(new Error('unavailable'));
    expect(await verifyControlHmac(message, signed, 'pair-1')).toBe(false);
  });
});
