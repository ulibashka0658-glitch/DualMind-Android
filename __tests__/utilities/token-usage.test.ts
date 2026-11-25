import { calculateUsageCost, TokenUsage } from '../../lib/token-usage';

const usage: TokenUsage = { inputTokens: 1000, outputTokens: 500, source: 'provider' };
const pricing = { inputUsdPerMillion: 2, outputUsdPerMillion: 8 };
const fx = { rubPerUsd: 90, asOf: '2026-11-22', source: 'manual' };

describe('calculateUsageCost', () => {
  it('calculates separate input and output pricing', () => {
    expect(calculateUsageCost(usage, 'cloud', pricing, fx)).toEqual({
      totalTokens: 1500,
      usd: 0.006,
      rub: 0.54,
      actualApiCharge: false,
    });
  });

  it('reports zero API charge for local models', () => {
    expect(calculateUsageCost(usage, 'local', null, null)).toEqual({
      totalTokens: 1500, usd: 0, rub: 0, actualApiCharge: true,
    });
  });

  it('does not invent token counts or cloud costs', () => {
    expect(calculateUsageCost({ inputTokens: null, outputTokens: 3, source: 'unknown' }, 'cloud', pricing, fx))
      .toEqual({ totalTokens: null, usd: null, rub: null, actualApiCharge: false });
  });

  it('keeps RUB unknown without a verified or manual FX rate', () => {
    const cost = calculateUsageCost(usage, 'cloud', pricing, null);
    expect(cost.usd).toBe(0.006);
    expect(cost.rub).toBeNull();
  });

  it('rejects invalid usage and pricing', () => {
    expect(calculateUsageCost({ inputTokens: -1, outputTokens: 5, source: 'estimate' }, 'cloud', pricing, fx).usd).toBeNull();
    expect(calculateUsageCost(usage, 'cloud', { inputUsdPerMillion: NaN, outputUsdPerMillion: 2 }, fx).usd).toBeNull();
  });
});
