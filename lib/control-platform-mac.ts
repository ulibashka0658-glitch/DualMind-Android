import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';

/** RFC 2104 HMAC using the platform SHA-256 primitive and a 256-bit key. */
export async function computeControlMac(secret: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  if (secret.length !== 32) throw new Error('Invalid HMAC key length');
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(96);
  for (let i = 0; i < 64; i++) {
    const byte = i < secret.length ? secret[i] : 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  inner.set(message, 64);
  const digest = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, inner));
  if (digest.length !== 32) throw new Error('Invalid SHA-256 output');
  outer.set(digest, 64);
  const mac = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, outer));
  if (mac.length !== 32) throw new Error('Invalid SHA-256 output');
  return mac;
}

export async function verifyPlatformControlMac(secret: Uint8Array, message: string, signature: Uint8Array): Promise<boolean> {
  if (signature.length !== 32) return false;
  try {
    const mac = await computeControlMac(secret, Buffer.from(message, 'utf8'));
    let difference = 0;
    for (let i = 0; i < 32; i++) difference |= mac[i] ^ signature[i];
    return difference === 0;
  } catch {
    return false;
  }
}
