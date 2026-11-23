import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { disconnectControlPairing } from '@/lib/control-lifecycle';
import { getControlConnectionStatus, type ControlConnectionStatus } from '@/lib/control-status';

export default function ControlSecurityPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ControlConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await getControlConnectionStatus());
    } catch {
      setError('Не удалось прочитать состояние безопасности.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  const disconnect = () => {
    Alert.alert(
      'Отключить привязку?',
      'Ключ доступа будет удалён с устройства. Для нового подключения потребуется повторная привязка.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отключить', style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await disconnectControlPairing();
              await refresh();
            } catch {
              setError('Не удалось удалить ключ. Доступ не считается отозванным.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(value => !value)}>
        <Text style={styles.heading}>{open ? 'Скрыть безопасность подключения' : 'Безопасность подключения'}</Text>
      </Pressable>
      {open && <View style={styles.details}>
        <Text style={styles.text}>Удалённое управление пока не включено. Эта панель показывает только локальные настройки безопасности.</Text>
        {loading && <Text style={styles.text}>Проверка...</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {status && <>
          <Text style={styles.text}>Привязка: {status.paired ? 'есть' : 'нет'}</Text>
          <Text style={styles.text}>Локальное разрешение: {status.active ? 'действует' : 'неактивно'}</Text>
          <Text style={styles.text}>Криптография: {status.cryptoAvailable ? 'доступна' : 'недоступна'} ({status.cryptoReason})</Text>
          <Text style={styles.text}>Срок доступа: {status.expiresAt ?? 'не задан'}</Text>
          <Text style={styles.text}>Разрешения: {status.scopes.length ? status.scopes.join(', ') : 'нет'}</Text>
          {status.paired && <Pressable accessibilityRole="button" disabled={loading} onPress={disconnect}>
            <Text style={styles.danger}>Отключить привязку и удалить ключ</Text>
          </Pressable>}
        </>}
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void refresh()}>
          <Text style={styles.action}>Обновить состояние</Text>
        </Pressable>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 6 },
  heading: { color: '#5B9FFF', fontSize: 12, fontWeight: '600' },
  details: { paddingTop: 8, gap: 5 },
  text: { color: '#999', fontSize: 12 },
  error: { color: '#D77', fontSize: 12 },
  action: { color: '#5B9FFF', paddingVertical: 8, fontWeight: '700' },
  danger: { color: '#E66', paddingVertical: 8, fontWeight: '700' },
});
