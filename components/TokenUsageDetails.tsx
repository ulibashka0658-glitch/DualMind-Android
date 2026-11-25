import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { calculateUsageCost, FxRate, TokenPricing, TokenUsage } from '../lib/token-usage';

export type TokenUsageDetailsProps = {
  usage: TokenUsage;
  mode: 'local' | 'cloud';
  pricing: TokenPricing | null;
  fx: FxRate | null;
  expanded: boolean;
  onToggle: () => void;
};

/** Optional per-answer footer; attach to the existing assistant message component. */
export function TokenUsageDetails({
  usage, mode, pricing, fx, expanded, onToggle,
}: TokenUsageDetailsProps) {
  const cost = calculateUsageCost(usage, mode, pricing, fx);
  const tokens = cost.totalTokens === null ? '—' : cost.totalTokens.toLocaleString('ru-RU');
  const usd = cost.usd === null ? '—' : '$' + cost.usd.toFixed(6);
  const rub = cost.rub === null ? '—' : cost.rub.toFixed(4) + ' ₽';

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel="Детали использования токенов"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.summary}>{tokens} токенов · {usd} · {rub}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.details}>
          <Text style={styles.detail}>Вход: {usage.inputTokens ?? '—'} · Выход: {usage.outputTokens ?? '—'}</Text>
          <Text style={styles.detail}>Источник: {usage.source}</Text>
          <Text style={styles.detail}>{mode === 'local' ? 'Локальная модель: плата за API отсутствует' : 'Облачный API: расчётная стоимость'}</Text>
          {mode === 'cloud' && fx && <Text style={styles.detail}>USD/RUB: {fx.rubPerUsd} · {fx.asOf} · {fx.source}</Text>}
          {mode === 'cloud' && !fx && <Text style={styles.detail}>Курс валют не указан</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 6, paddingVertical: 4 },
  summary: { fontSize: 12, color: '#8A8A8A' },
  details: { paddingTop: 6, gap: 3 },
  detail: { fontSize: 12, color: '#8A8A8A' },
});
