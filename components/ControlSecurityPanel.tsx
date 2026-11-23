import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { disconnectControlPairing } from '@/lib/control-lifecycle';
import { getControlConnectionStatus, type ControlConnectionStatus } from '@/lib/control-status';
import ControlPairingPreview from '@/components/ControlPairingPreview';
import { inspectPairingRecoveryState, type PairingRecoveryState } from '@/lib/control-pairing-recovery-state';

export default function ControlSecurityPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ControlConnectionStatus | null>(null);
  const [recovery, setRecovery] = useState<PairingRecoveryState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setStatus(null);
    setRecovery(null);
    try {
      const [connection, restartState] = await Promise.all([
        getControlConnectionStatus(), inspectPairingRecoveryState(),
      ]);
      setStatus(connection);
      setRecovery(restartState);
      if (restartState.state === 'storage-unavailable') {
        setError('Хранилище безопасности недоступно. Не создавайте новую привязку до восстановления доступа.');
      }
    } catch {
      setError('Не удалось прочитать состояние безопасности.');
      setStatus(null);
      setRecovery(null);
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
              setStatus(null);
              setRecovery(null);
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
        {recovery && <Text style={recovery.state === 'cleanup-required' || recovery.state === 'storage-unavailable' ? styles.error : styles.text}>
          Восстановление после перезапуска: {{
            unpaired: 'подключения нет',
            pending: 'подтверждение не завершено',
            paired: 'разрешения сохранены',
            'cleanup-required': 'обнаружены незавершённые записи, требуется ручная очистка',
            'storage-unavailable': 'хранилище недоступно или данные повреждены',
          }[recovery.state]}
        </Text>}
        {status && <>
          <Text style={styles.text}>Привязка: {status.paired ? 'есть' : 'нет'}</Text>
          <Text style={styles.text}>Локальное разрешение: {status.active ? 'действует' : 'неактивно'}</Text>
          <Text style={styles.text}>Криптография: {status.cryptoAvailable ? 'доступна' : 'недоступна'} ({status.cryptoReason})</Text>
          <Text style={styles.text}>Срок доступа: {status.expiresAt ?? 'не задан'}</Text>
          <Text style={styles.text}>Разрешения: {status.scopes.length ? status.scopes.join(', ') : 'нет'}</Text>
          {(status.paired || recovery?.state === 'pending' || recovery?.state === 'cleanup-required') && recovery?.state !== 'storage-unavailable' && <Pressable accessibilityRole="button" disabled={loading} onPress={disconnect}>
            <Text style={styles.danger}>Отключить привязку и удалить ключ</Text>
          </Pressable>}
        </>}
        {!loading && !error && recovery?.state === 'unpaired' && status?.paired === false && <ControlPairingPreview />}
        {recovery?.state === 'storage-unavailable' && <Text style={styles.error}>Проверьте доступность защищённого хранилища и повторите проверку. Автоматическое удаление отключено.</Text>}
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
