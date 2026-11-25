import { calculateUsageCost, type FxRate, type TokenPricing, type TokenUsage } from './token-usage';

export type UsageEntry = {
  id: string;
  usage: TokenUsage;
  mode: 'local' | 'cloud';
  pricing: TokenPricing | null;
  fx: FxRate | null;
  timestamp: string;
};

export type UsageSummary = {
  messages: number;
  inputTokens: number;
  outputTokens: number;
  unknownTokenMessages: number;
  knownUsd: number;
  knownRub: number;
  unknownUsdMessages: number;
  unknownRubMessages: number;
};

/** Deduplicate by response id to avoid double counting re-renders and edits. */
export function summarizeUsage(entries: readonly UsageEntry[]): UsageSummary {
  const seen = new Set<string>();
  const summary: UsageSummary = {
    messages: 0, inputTokens: 0, outputTokens: 0, unknownTokenMessages: 0,
    knownUsd: 0, knownRub: 0, unknownUsdMessages: 0, unknownRubMessages: 0,
  };
  for (const entry of entries) {
    if (!entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    summary.messages++;
    const { inputTokens, outputTokens } = entry.usage;
    if (inputTokens === null || outputTokens === null ||
        !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
        !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
      summary.unknownTokenMessages++;
    } else {
      summary.inputTokens += inputTokens;
      summary.outputTokens += outputTokens;
    }
    const cost = calculateUsageCost(entry.usage, entry.mode, entry.pricing, entry.fx);
    if (cost.usd === null) summary.unknownUsdMessages++;
    else summary.knownUsd += cost.usd;
    if (cost.rub === null) summary.unknownRubMessages++;
    else summary.knownRub += cost.rub;
  }
  return summary;
}

/** UTC day/month buckets are stable across timezone changes and app restarts. */
export function usageInPeriod(entries: readonly UsageEntry[], period: 'day' | 'month' | 'all', isoDate: string): UsageEntry[] {
  if (period === 'all') return [...entries];
  const prefix = period === 'day' ? isoDate.slice(0, 10) : isoDate.slice(0, 7);
  return entries.filter(entry => entry.timestamp.startsWith(prefix));
}
