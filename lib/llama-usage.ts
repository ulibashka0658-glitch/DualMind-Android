import type { TokenUsage } from './token-usage';

/**
 * llama.rn completion timings expose prompt_n and predicted_n on supported
 * engines. Treat missing/invalid counts as unknown, never estimate from text.
 */
export function readLlamaCompletionUsage(timings: unknown): TokenUsage | null {
  if (!timings || typeof timings !== 'object' || Array.isArray(timings)) return null;
  const data = timings as Record<string, unknown>;
  const inputTokens = data.prompt_n;
  const outputTokens = data.predicted_n;
  if (typeof inputTokens !== 'number' || !Number.isSafeInteger(inputTokens) ||
      inputTokens < 0 || typeof outputTokens !== 'number' ||
      !Number.isSafeInteger(outputTokens) || outputTokens < 0) return null;
  return { inputTokens, outputTokens, source: 'local-engine' };
}
