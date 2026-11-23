import * as SecureStore from 'expo-secure-store';
import { type ControlGrant } from './control-policy';

const GRANT_KEY = 'dualmind-control-grant-v1';

/** Local device approval metadata only; no bearer credentials in AsyncStorage. */
export async function saveControlGrant(grant: ControlGrant): Promise<void> {
  await SecureStore.setItemAsync(GRANT_KEY, JSON.stringify(grant), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadControlGrant(): Promise<ControlGrant | null> {
  const raw = await SecureStore.getItemAsync(GRANT_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const allowed = ['status:read', 'models:read', 'downloads:read', 'diagnostics:read'];
    if (typeof record.pairingId !== 'string' || !record.pairingId.trim() ||
        typeof record.expiresAt !== 'string' || !Number.isFinite(Date.parse(record.expiresAt)) ||
        typeof record.revoked !== 'boolean' || !Array.isArray(record.scopes) ||
        !record.scopes.every(scope => typeof scope === 'string' && allowed.includes(scope))) return null;
    return {
      pairingId: record.pairingId,
      expiresAt: record.expiresAt,
      revoked: record.revoked,
      scopes: record.scopes,
    } as ControlGrant;
  } catch {
    return null;
  }
}

export async function clearControlGrant(): Promise<void> {
  await SecureStore.deleteItemAsync(GRANT_KEY);
}
