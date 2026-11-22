import { readMessageUsage } from '../../lib/message-usage';

describe('readMessageUsage', () => {
  it('does not fabricate usage for legacy messages', () => {
    expect(readMessageUsage(undefined)).toBeNull();
    expect(readMessageUsage({ provider: 'open-ai' })).toBeNull();
  });
  it('accepts explicitly persisted usage and pricing', () => {
    expect(readMessageUsage({ tokenUsage: {
      mode: 'cloud',
      usage: { inputTokens: 100, outputTokens: 25, source: 'provider' },
      pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
      fx: { rubPerUsd: 90, asOf: '2026-11-22', source: 'manual' },
    }})).toEqual({
      mode: 'cloud',
      usage: { inputTokens: 100, outputTokens: 25, source: 'provider' },
      pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
      fx: { rubPerUsd: 90, asOf: '2026-11-22', source: 'manual' },
    });
  });
  it('rejects missing counts rather than displaying NaN', () => {
    expect(readMessageUsage({ tokenUsage: { mode: 'cloud', usage: {
      inputTokens: 10, source: 'provider',
    } } })).toBeNull();
  });
  it('rejects negative or invalid counts', () => {
    expect(readMessageUsage({ tokenUsage: { mode: 'local', usage: {
      inputTokens: -1, outputTokens: 0, source: 'local-engine',
    } } })).toBeNull();
  });
});
