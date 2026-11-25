import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useChat } from '@/context';
import { usageEntriesFromMessages } from '@/lib/usage-from-messages';
import { summarizeUsage, usageInPeriod } from '@/lib/usage-summary';

type Period = 'day' | 'month' | 'all';
const periods: { key: Period; label: string }[] = [
  { key: 'day', label: 'День' },
  { key: 'month', label: 'Месяц' },
  { key: 'all', label: 'Всего' },
];

/** Aggregates saved message metadata, so restarts do not reset the counters. */
export default function UsageSummaryView() {
  const { mappings } = useChat();
  const [period, setPeriod] = useState<Period>('all');
  const entries = useMemo(() => usageEntriesFromMessages(mappings), [mappings]);
  const totals = useMemo(() => summarizeUsage(usageInPeriod(entries, period, new Date().toISOString())), [entries, period]);
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.heading}>Статистика токенов</Text>
        {periods.map(item => (
          <Pressable key={item.key} accessibilityRole="button"
            accessibilityState={{ selected: period === item.key }}
            onPress={() => setPeriod(item.key)}>
            <Text style={[styles.period, period === item.key && styles.selected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Ответов: {totals.messages} · Вход: {totals.inputTokens} · Выход: {totals.outputTokens}</Text>
      <Text style={styles.label}>Известная стоимость: ${totals.knownUsd.toFixed(6)} · {totals.knownRub.toFixed(4)} ₽</Text>
      {(totals.unknownUsdMessages > 0 || totals.unknownRubMessages > 0 || totals.unknownTokenMessages > 0) && (
        <Text style={styles.warning}>Неполные данные: токены {totals.unknownTokenMessages}, USD {totals.unknownUsdMessages}, RUB {totals.unknownRubMessages}. Сумма может быть неполной.</Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingVertical: 10, gap: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  heading: { fontSize: 13, fontWeight: '600', color: '#999' },
  period: { fontSize: 12, color: '#999' },
  selected: { color: '#5B9FFF', fontWeight: '700' },
  label: { fontSize: 12, color: '#999' },
  warning: { fontSize: 11, color: '#B68B42' },
});
