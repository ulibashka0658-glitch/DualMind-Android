import { createHash, createHmac } from 'crypto';
import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import { computeControlMac, verifyPlatformControlMac } from '../../lib/control-platform-mac';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
  (Crypto.digest as jest.Mock).mockImplementation(async (_algorithm, bytes) =>
    Uint8Array.from(createHash('sha256').update(Buffer.from(bytes)).digest()).buffer,
  );
});

it('matches the known HMAC-SHA256 vector for a zero key and empty message', async () => {
  const mac = await computeControlMac(new Uint8Array(32), new Uint8Array(0));
  expect(Buffer.from(mac).toString('hex')).toBe('b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad');
});

it.each(['message', 'Проверка подписи', ''])('matches independent HMAC for %s', async message => {
  const key = Buffer.alloc(32, 7);
  const signature = createHmac('sha256', key).update(message, 'utf8').digest();
  expect(await verifyPlatformControlMac(key, message, signature)).toBe(true);
  signature[0] ^= 1;
  expect(await verifyPlatformControlMac(key, message, signature)).toBe(false);
});

it('rejects invalid key and signature lengths', async () => {
  await expect(computeControlMac(new Uint8Array(31), new Uint8Array(0))).rejects.toThrow();
  expect(await verifyPlatformControlMac(new Uint8Array(32), '', new Uint8Array(31))).toBe(false);
});

it('fails closed on platform digest failure or malformed output', async () => {
  (Crypto.digest as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
  expect(await verifyPlatformControlMac(new Uint8Array(32), '', new Uint8Array(32))).toBe(false);
  (Crypto.digest as jest.Mock).mockResolvedValueOnce(new ArrayBuffer(16));
  expect(await verifyPlatformControlMac(new Uint8Array(32), '', new Uint8Array(32))).toBe(false);
});
