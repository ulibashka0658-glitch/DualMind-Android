import type { TokenUsage } from './token-usage';

/** Mistral SDK uses camelCase, while compatible servers may return snake_case. */
export function readMistralUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const input = data.promptTokens ?? data.prompt_tokens;
  const output = data.completionTokens ?? data.completion_tokens;
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 ||
      typeof output !== 'number' || !Number.isSafeInteger(output) || output < 0) return null;
  return { inputTokens: input, outputTokens: output, source: 'provider' };
}
