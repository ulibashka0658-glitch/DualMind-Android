import { readMistralUsage } from '../../lib/mistral-usage';

describe('readMistralUsage', () => {
  it('accepts SDK camelCase usage', () => {
    expect(readMistralUsage({ promptTokens: 17, completionTokens: 5 }))
      .toEqual({ inputTokens: 17, outputTokens: 5, source: 'provider' });
  });
  it('accepts compatible snake_case usage', () => {
    expect(readMistralUsage({ prompt_tokens: 9, completion_tokens: 3 }))
      .toEqual({ inputTokens: 9, outputTokens: 3, source: 'provider' });
  });
  it('does not fabricate absent or invalid counts', () => {
    expect(readMistralUsage(null)).toBeNull();
    expect(readMistralUsage({ promptTokens: 10 })).toBeNull();
    expect(readMistralUsage({ promptTokens: -1, completionTokens: 3 })).toBeNull();
    expect(readMistralUsage({ promptTokens: 1.5, completionTokens: 3 })).toBeNull();
  });
});
