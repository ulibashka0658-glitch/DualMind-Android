import type { FxRate, TokenPricing } from './token-usage';

export type UsageRates = { pricing: TokenPricing | null; fx: FxRate | null };

function validNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Validate settings from untrusted device storage before using them for costs. */
export function readUsageRates(value: unknown): UsageRates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { pricing: null, fx: null };
  const data = value as Record<string, unknown>;
  const pricing = data.pricing && typeof data.pricing === 'object' && !Array.isArray(data.pricing)
    ? data.pricing as Record<string, unknown> : null;
  const fx = data.fx && typeof data.fx === 'object' && !Array.isArray(data.fx)
    ? data.fx as Record<string, unknown> : null;
  return {
    pricing: pricing && validNonnegative(pricing.inputUsdPerMillion) && validNonnegative(pricing.outputUsdPerMillion)
      ? { inputUsdPerMillion: pricing.inputUsdPerMillion, outputUsdPerMillion: pricing.outputUsdPerMillion } : null,
    fx: fx && validNonnegative(fx.rubPerUsd) && fx.rubPerUsd > 0 &&
      typeof fx.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fx.asOf) &&
      typeof fx.source === 'string' && fx.source.trim().length > 0
      ? { rubPerUsd: fx.rubPerUsd, asOf: fx.asOf, source: fx.source } : null,
  };
}
