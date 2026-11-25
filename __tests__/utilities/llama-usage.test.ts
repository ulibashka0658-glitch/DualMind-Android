import { readLlamaCompletionUsage } from '../../lib/llama-usage';

describe('readLlamaCompletionUsage', () => {
  it('reads engine-reported prompt and generated token counts', () => {
    expect(readLlamaCompletionUsage({ prompt_n: 32, predicted_n: 12, predicted_ms: 500 }))
      .toEqual({ inputTokens: 32, outputTokens: 12, source: 'local-engine' });
  });
  it('does not fabricate missing counts', () => {
    expect(readLlamaCompletionUsage({ prompt_n: 32 })).toBeNull();
    expect(readLlamaCompletionUsage(null)).toBeNull();
  });
  it('rejects invalid or fractional token counts', () => {
    expect(readLlamaCompletionUsage({ prompt_n: -1, predicted_n: 2 })).toBeNull();
    expect(readLlamaCompletionUsage({ prompt_n: 1.5, predicted_n: 2 })).toBeNull();
  });
});
