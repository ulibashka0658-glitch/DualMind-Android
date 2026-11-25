import { inspectControlCrypto } from './control-lifecycle';
import { loadControlGrant } from './control-secure-store';

export type ControlConnectionStatus = {
  paired: boolean;
  active: boolean;
  expiresAt: string | null;
  scopes: readonly string[];
  cryptoAvailable: boolean;
  cryptoReason: string;
};

/**
 * Local, read-only status for a future settings screen.
 * Never returns pairing secrets, authentication signatures, or chat data.
 */
export async function getControlConnectionStatus(now = Date.now()): Promise<ControlConnectionStatus> {
  const [grant, crypto] = await Promise.all([loadControlGrant(), inspectControlCrypto()]);
  const expires = grant ? Date.parse(grant.expiresAt) : NaN;
  return {
    paired: !!grant,
    active: !!grant && !grant.revoked && Number.isFinite(expires) && expires > now && crypto.available,
    expiresAt: grant?.expiresAt ?? null,
    scopes: grant ? [...grant.scopes] : [],
    cryptoAvailable: crypto.available,
    cryptoReason: crypto.reason,
  };
}
