import { Buffer } from 'buffer';
import { canonicalPairingChallenge, validatePairingChallenge, verifyPairingProof } from '../../lib/control-pairing-proof';

const now = 1795435200000;
const challenge = {
  version: 1 as const,
  pairingId: '0123456789abcdef0123456789abcdef',
  nonce: Buffer.alloc(32, 4).toString('base64'),
  createdAt: now - 1000,
  expiresAt: now + 60000,
};
const signature = Buffer.alloc(32, 8).toString('base64');

describe('pairing proof of possession', () => {
  it('validates a bounded challenge and domain-separated canonical data', () => {
    expect(validatePairingChallenge(challenge, now)).toBe(true);
    expect(canonicalPairingChallenge(challenge)).toContain('dualmind-pairing-proof-v1');
  });
  it('rejects expired and overly long challenges', () => {
    expect(validatePairingChallenge({ ...challenge, expiresAt: now }, now)).toBe(false);
    expect(validatePairingChallenge({ ...challenge, expiresAt: now + 360000 }, now)).toBe(false);
  });
  it('rejects wrong identity and malformed nonce', async () => {
    const verify = jest.fn(async () => true);
    expect(await verifyPairingProof(challenge, signature, 'different-pairing-id', now, verify)).toBe(false);
    expect(validatePairingChallenge({ ...challenge, nonce: 'bad' }, now)).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
  it('requires cryptographic verifier approval', async () => {
    const verify = jest.fn(async () => true);
    expect(await verifyPairingProof(challenge, signature, challenge.pairingId, now, verify)).toBe(true);
    expect(verify).toHaveBeenCalledWith(canonicalPairingChallenge(challenge), signature, challenge.pairingId);
    expect(await verifyPairingProof(challenge, signature, challenge.pairingId, now, async () => false)).toBe(false);
    expect(await verifyPairingProof(challenge, signature, challenge.pairingId, now, async () => { throw Error('locked'); })).toBe(false);
  });
});
