import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useUsageRates } from '@/hooks/use-usage-rates';

export default function UsageRatesEditor() {
  const { rates, setRates, loaded } = useUsageRates();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [rub, setRub] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!loaded) return;
    setInput(rates.pricing?.inputUsdPerMillion.toString() ?? '');
    setOutput(rates.pricing?.outputUsdPerMillion.toString() ?? '');
    setRub(rates.fx?.rubPerUsd.toString() ?? '');
    setDate(rates.fx?.asOf ?? new Date().toISOString().slice(0, 10));
  }, [loaded]);
  const save = () => {
    const inputPrice = Number(input.replace(',', '.'));
    const outputPrice = Number(output.replace(',', '.'));
    const fxRate = Number(rub.replace(',', '.'));
    if (!input.trim() || !output.trim() || !Number.isFinite(inputPrice) || inputPrice < 0 ||
        !Number.isFinite(outputPrice) || outputPrice < 0) {
      setError('Укажите обе цены в USD за миллион токенов.');
      return;
    }
    if (rub.trim() && (!Number.isFinite(fxRate) || fxRate <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) {
      setError('Проверьте курс RUB за USD и дату ГГГГ-ММ-ДД.');
      return;
    }
    setRates({
      pricing: { inputUsdPerMillion: inputPrice, outputUsdPerMillion: outputPrice },
      fx: rub.trim() ? { rubPerUsd: fxRate, asOf: date, source: 'manual' } : null,
    });
    setError('');
    setOpen(false);
  };
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}>
        <Text style={styles.text}>{open ? 'Скрыть тарифы' : 'Настроить тарифы и курс'}</Text>
      </Pressable>
      {open && <View style={styles.fields}>
        <Text style={styles.text}>USD за 1 млн входных токенов</Text>
        <TextInput accessibilityLabel="Цена входных токенов" style={styles.input} value={input} onChangeText={setInput} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#888" />
        <Text style={styles.text}>USD за 1 млн выходных токенов</Text>
        <TextInput accessibilityLabel="Цена выходных токенов" style={styles.input} value={output} onChangeText={setOutput} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#888" />
        <Text style={styles.text}>RUB за 1 USD (необязательно)</Text>
        <TextInput accessibilityLabel="Курс RUB за USD" style={styles.input} value={rub} onChangeText={setRub} keyboardType="decimal-pad" placeholder="Не задан" placeholderTextColor="#888" />
        <Text style={styles.text}>Дата курса</Text>
        <TextInput accessibilityLabel="Дата курса" style={styles.input} value={date} onChangeText={setDate} placeholder="ГГГГ-ММ-ДД" placeholderTextColor="#888" />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={!loaded} onPress={save}><Text style={styles.action}>Сохранить</Text></Pressable>
        <Text style={styles.note}>Тарифы общие для облачных моделей. Исторические ответы не пересчитываются. Курс вводится вручную.</Text>
      </View>}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 6 },
  fields: { paddingTop: 8, gap: 4 },
  text: { color: '#999', fontSize: 12 },
  input: { borderWidth: 1, borderColor: '#666', borderRadius: 6, padding: 7, color: '#DDD' },
  action: { color: '#5B9FFF', fontWeight: '700', paddingVertical: 8 },
  error: { color: '#D77', fontSize: 12 },
  note: { color: '#999', fontSize: 11 },
});
