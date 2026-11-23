import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ControlScope } from '@/lib/control-policy';
import { prepareLocalPairingApproval, cancelLocalPairingApproval } from '@/lib/control-pairing-local-approval';
import { parsePairingRequest } from '@/lib/control-pairing-preview';
import { getLocalPairingApprovalStatus } from '@/lib/control-pairing-recovery';

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
  const [selected, setSelected] = useState<ControlScope[]>([]);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [challengeExpires, setChallengeExpires] = useState('');
  useEffect(() => {
    if (!expanded) return;
    let alive = true;
    void getLocalPairingApprovalStatus().then(saved => {
      if (!alive) return;
      setConsented(!!saved);
      setChallengeExpires(saved ? new Date(saved.challenge.expiresAt).toISOString() : '');
    }).catch(() => {
      if (!alive) return;
      setConsented(false);
      setChallengeExpires('');
      setError('Не удалось прочитать локальное согласие. Повторите проверку безопасности.');
    });
    return () => { alive = false; };
  }, [expanded]);
  const inspect = () => {
    const parsed = parsePairingRequest(input, Date.now());
    setPreview(parsed);
    setSelected([]);
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
          onChangeText={value => { setInput(value); setPreview(null); setSelected([]); setError(''); }}
          multiline
          maxLength={4096}
          placeholder="JSON запроса привязки"
          placeholderTextColor="#888"
        />
        <Pressable accessibilityRole="button" onPress={inspect}>
          <Text style={styles.action}>Проверить запрос</Text>
        </Pressable>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {consented ? (
          <View>
            <Text style={styles.warning}>На устройстве есть ожидающее согласие до {challengeExpires}. Удалённый доступ не включён.</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={async () => {
              setBusy(true);
              try {
                await cancelLocalPairingApproval();
                setConsented(false);
                setChallengeExpires('');
              } catch {
                setError('Не удалось отменить запрос в защищённом хранилище.');
              } finally {
                setBusy(false);
              }
            }}>
              <Text style={styles.action}>Отменить локальное согласие</Text>
            </Pressable>
          </View>
        ) : null}

        {preview && !consented ? (
          <View>
          <Text style={styles.note}>Идентификатор: {preview.pairingId}</Text>
          <Text style={styles.note}>Действует до: {preview.expiresAt}</Text>
          <Text style={styles.note}>Запрошенные разрешения:</Text>
          {preview.requestedScopes.map(scope =>
            <Pressable key={scope} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(scope) }} onPress={() => { setSelected(current => current.includes(scope) ? current.filter(item => item !== scope) : [...current, scope]); }}>
              <Text style={styles.note}>{selected.includes(scope) ? '☑' : '☐'} {labels[scope] ?? scope}</Text>
            </Pressable>)}
          <Pressable accessibilityRole="button" disabled={busy} onPress={async () => {
            setBusy(true);
            setError('');
            try {
              const challenge = await prepareLocalPairingApproval(preview, selected);
              setChallengeExpires(new Date(challenge.expiresAt).toISOString());
              setConsented(true);
            } catch {
              setError('Не удалось сохранить согласие. Проверьте разрешения и срок запроса.');
            } finally {
              setBusy(false);
            }
          }}>
            <Text style={styles.action}>{busy ? 'Сохранение...' : 'Подтвердить и сохранить разрешения на устройстве'}</Text>
          </Pressable>
          <Text style={styles.warning}>Подключение не активировано. Для подтверждения необходим защищённый обмен ключами.</Text>
          </View>
        ) : null}
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
