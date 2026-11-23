/**
 * Local authorization policy for future ChatGPT-to-DualMind pairing.
 * This is deliberately NOT a transport or an authentication protocol.
 * The caller must verify pairing credentials before invoking this policy.
 */
export const READ_ONLY_COMMANDS = [
  'app.status',
  'models.list',
  'downloads.status',
  'diagnostics.summary',
] as const;
export type ReadOnlyCommand = typeof READ_ONLY_COMMANDS[number];

export type ControlScope = 'status:read' | 'models:read' | 'downloads:read' | 'diagnostics:read';
export type ControlGrant = {
  pairingId: string;
  scopes: readonly ControlScope[];
  expiresAt: string;
  revoked: boolean;
};

const SCOPES: Record<ReadOnlyCommand, ControlScope> = {
  'app.status': 'status:read',
  'models.list': 'models:read',
  'downloads.status': 'downloads:read',
  'diagnostics.summary': 'diagnostics:read',
};

export type ControlDecision =
  | { allowed: true; command: ReadOnlyCommand }
  | { allowed: false; reason: 'unknown-command' | 'unpaired' | 'revoked' | 'expired' | 'insufficient-scope' };

export function authorizeControlCommand(
  command: string,
  grant: ControlGrant | null,
  now: string,
): ControlDecision {
  if (!Object.prototype.hasOwnProperty.call(SCOPES, command)) {
    return { allowed: false, reason: 'unknown-command' };
  }
  if (!grant || !grant.pairingId.trim()) return { allowed: false, reason: 'unpaired' };
  if (grant.revoked) return { allowed: false, reason: 'revoked' };
  const expiration = Date.parse(grant.expiresAt);
  const current = Date.parse(now);
  if (!Number.isFinite(expiration) || !Number.isFinite(current) || expiration <= current) {
    return { allowed: false, reason: 'expired' };
  }
  const typed = command as ReadOnlyCommand;
  if (!grant.scopes.includes(SCOPES[typed])) {
    return { allowed: false, reason: 'insufficient-scope' };
  }
  return { allowed: true, command: typed };
}
