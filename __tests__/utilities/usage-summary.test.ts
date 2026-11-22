import { summarizeUsage, usageInPeriod, type UsageEntry } from '../../lib/usage-summary';

const entry: UsageEntry = {
  id: 'answer-1',
  timestamp: '2026-11-22T10:00:00.000Z',
  mode: 'cloud',
  usage: { inputTokens: 1000, outputTokens: 500, source: 'provider' },
  pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
  fx: { rubPerUsd: 90, asOf: '2026-11-22', source: 'manual' },
};

describe('usage summary', () => {
  it('counts each response only once', () => {
    expect(summarizeUsage([entry, entry])).toEqual({
      messages: 1, inputTokens: 1000, outputTokens: 500,
      unknownTokenMessages: 0, knownUsd: 0.006, knownRub: 0.54,
      unknownUsdMessages: 0, unknownRubMessages: 0,
    });
  });
  it('keeps unknown cloud pricing separate from known totals', () => {
    const summary = summarizeUsage([{ ...entry, id: 'no-price', pricing: null }]);
    expect(summary.knownUsd).toBe(0);
    expect(summary.unknownUsdMessages).toBe(1);
    expect(summary.unknownRubMessages).toBe(1);
  });
  it('counts local inference as zero API charge', () => {
    const summary = summarizeUsage([{ ...entry, mode: 'local', pricing: null, fx: null }]);
    expect(summary.knownUsd).toBe(0);
    expect(summary.unknownUsdMessages).toBe(0);
  });
  it('filters day and month in UTC', () => {
    const entries = [entry, { ...entry, id: 'older', timestamp: '2026-10-20T10:00:00.000Z' }];
    expect(usageInPeriod(entries, 'day', '2026-11-22').length).toBe(1);
    expect(usageInPeriod(entries, 'month', '2026-11-01').length).toBe(1);
    expect(usageInPeriod(entries, 'all', '2026-11-22').length).toBe(2);
  });
});
