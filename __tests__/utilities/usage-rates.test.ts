import { readUsageRates } from '../../lib/usage-rates';

describe('readUsageRates', () => {
  it('accepts valid manually configured rates', () => {
    expect(readUsageRates({ pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
      fx: { rubPerUsd: 91, asOf: '2026-11-23', source: 'manual' } })).toEqual({
      pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
      fx: { rubPerUsd: 91, asOf: '2026-11-23', source: 'manual' },
    });
  });
  it('never silently invents missing rates', () => {
    expect(readUsageRates(null)).toEqual({ pricing: null, fx: null });
    expect(readUsageRates({ pricing: { inputUsdPerMillion: 2 } })).toEqual({ pricing: null, fx: null });
  });
  it('rejects negative prices and invalid FX', () => {
    expect(readUsageRates({ pricing: { inputUsdPerMillion: -1, outputUsdPerMillion: 2 },
      fx: { rubPerUsd: 0, asOf: '2026-11-23', source: 'manual' } }))
      .toEqual({ pricing: null, fx: null });
  });
});
