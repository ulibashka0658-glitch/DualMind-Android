/** Token usage and transparent API pricing helpers. Pure functions, no network access. */
export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  source: 'provider' | 'local-engine' | 'estimate' | 'unknown';
};

export type TokenPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type FxRate = {
  rubPerUsd: number;
  asOf: string;
  source: string;
};

export type UsageCost = {
  totalTokens: number | null;
  usd: number | null;
  rub: number | null;
  actualApiCharge: boolean;
};

function validCount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function validPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Missing usage or pricing stays unknown, never silently turns into zero.
 * For local inference, actual per-token API charges are zero, but usage may
 * still be unavailable and must be represented as unknown.
 */
export function calculateUsageCost(
  usage: TokenUsage,
  mode: 'local' | 'cloud',
  pricing: TokenPricing | null,
  fx: FxRate | null,
): UsageCost {
  const knownTokens = validCount(usage.inputTokens) && validCount(usage.outputTokens);
  const totalTokens = knownTokens ? usage.inputTokens! + usage.outputTokens! : null;

  if (mode === 'local') {
    return { totalTokens, usd: 0, rub: 0, actualApiCharge: true };
  }

  if (
    !knownTokens ||
    !pricing ||
    !validPrice(pricing.inputUsdPerMillion) ||
    !validPrice(pricing.outputUsdPerMillion)
  ) {
    return { totalTokens, usd: null, rub: null, actualApiCharge: false };
  }

  const usd =
    (usage.inputTokens! * pricing.inputUsdPerMillion +
      usage.outputTokens! * pricing.outputUsdPerMillion) / 1_000_000;

  const rub =
    fx && validPrice(fx.rubPerUsd) && fx.rubPerUsd > 0 && fx.asOf.trim() && fx.source.trim()
      ? usd * fx.rubPerUsd
      : null;

  return { totalTokens, usd, rub, actualApiCharge: false };
}
