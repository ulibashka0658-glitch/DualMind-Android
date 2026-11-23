import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parsePairingRequest } from '@/lib/control-pairing-preview';

const labels: Record<string, string> = {
  'status:read': 'Состояние приложения',
  'models:read': 'Список моделей',
  'downloads:read': 'Состояние загрузок',
  'diagnostics:read': 'Сводка диагностики',
};

/**
 * Preview only. A future authenticated exchange must prove the peer owns
 * the key and require a separate explicit confirmation before saving a grant.
 */
export default function ControlPairingPreview() {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof parsePairingRequest>>(null);
  const [error, setError] = useState('');
  const inspect = () => {
    const parsed = parsePairingRequest(input, Date.now());
    setPreview(parsed);
    setError(parsed ? '' : 'Неверный, просроченный или небезопасный запрос привязки.');
  };
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)}>
        <Text style={styles.heading}>{expanded ? 'Скрыть проверку привязки' : 'Проверить запрос привязки'}</Text>
      </Pressable>
      {expanded && <View style={styles.fields}>
        <Text style={styles.note}>Предварительный просмотр. Вставка запроса не создаёт подключение и не передаёт ключи.</Text>
        <TextInput
          accessibilityLabel="JSON запроса привязки"
          style={styles.input}
          value={input}
          onChangeText={value => { setInput(value); setPreview(null); setError(''); }}
          multiline
          maxLength={4096}
          placeholder="JSON запроса привязки"
          placeholderTextColor="#888"
        />
        <Pressable accessibilityRole="button" onPress={inspect}>
          <Text style={styles.action}>Проверить запрос</Text>
        </Pressable>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {preview && <>
          <Text style={styles.note}>Идентификатор: {preview.pairingId}</Text>
          <Text style={styles.note}>Действует до: {preview.expiresAt}</Text>
          <Text style={styles.note}>Запрошенные разрешения:</Text>
          {preview.requestedScopes.map(scope =>
            <Text key={scope} style={styles.note}>• {labels[scope] ?? scope}</Text>)}
          <Text style={styles.warning}>Подключение не активировано. Для подтверждения необходим защищённый обмен ключами.</Text>
        </>}
      </View>}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { paddingTop: 8 },
  heading: { color: '#5B9FFF', fontSize: 12, fontWeight: '600' },
  fields: { gap: 6, paddingTop: 6 },
  input: { borderWidth: 1, borderColor: '#666', borderRadius: 6, color: '#DDD', minHeight: 72, padding: 8, fontSize: 12 },
  action: { color: '#5B9FFF', fontWeight: '700', paddingVertical: 6 },
  note: { color: '#999', fontSize: 12 },
  warning: { color: '#DAA55B', fontSize: 12 },
  error: { color: '#E66', fontSize: 12 },
});
