import type { FxRate, TokenPricing, TokenUsage } from './token-usage';

export type StoredMessageUsage = {
  usage: TokenUsage;
  mode: 'local' | 'cloud';
  pricing: TokenPricing | null;
  fx: FxRate | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Only expose explicitly stored usage. Legacy messages without usage metadata
 * do not display a misleading estimate or a zero-cost cloud request.
 */
export function readMessageUsage(metadata: unknown): StoredMessageUsage | null {
  if (!isRecord(metadata) || !isRecord(metadata.tokenUsage)) return null;
  const data = metadata.tokenUsage;
  if (data.mode !== 'local' && data.mode !== 'cloud') return null;
  if (!isRecord(data.usage)) return null;
  const usage = data.usage;
  if (usage.source !== 'provider' && usage.source !== 'local-engine' &&
      usage.source !== 'estimate' && usage.source !== 'unknown') return null;
  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  if (inputTokens !== null && !isTokenCount(inputTokens)) return null;
  if (outputTokens !== null && !isTokenCount(outputTokens)) return null;

  let pricing: TokenPricing | null = null;
  if (isRecord(data.pricing) &&
      isNonNegative(data.pricing.inputUsdPerMillion) &&
      isNonNegative(data.pricing.outputUsdPerMillion)) {
    pricing = {
      inputUsdPerMillion: data.pricing.inputUsdPerMillion,
      outputUsdPerMillion: data.pricing.outputUsdPerMillion,
    };
  }

  let fx: FxRate | null = null;
  if (isRecord(data.fx) && isNonNegative(data.fx.rubPerUsd) &&
      data.fx.rubPerUsd > 0 && typeof data.fx.asOf === 'string' &&
      data.fx.asOf.length > 0 && typeof data.fx.source === 'string' &&
      data.fx.source.length > 0) {
    fx = { rubPerUsd: data.fx.rubPerUsd, asOf: data.fx.asOf, source: data.fx.source };
  }

  return {
    mode: data.mode,
    usage: { inputTokens: inputTokens as number | null, outputTokens: outputTokens as number | null, source: usage.source },
    pricing,
    fx,
  };
}
