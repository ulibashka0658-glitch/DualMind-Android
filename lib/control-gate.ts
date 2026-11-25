import type { ControlGrant } from './control-policy';
import { authorizeControlCommand } from './control-policy';
import { appendControlAudit, createControlAuditEvent, type ControlAuditEvent } from './control-audit';

export type ControlState = { grant: ControlGrant | null; audit: ControlAuditEvent[] };

/**
 * Pure command gate for a future authenticated transport.
 * No network listener is exposed and no command is executed here.
 */
export function checkControlRequest(
  state: ControlState,
  command: string,
  now: string,
): { state: ControlState; allowed: boolean; reason: string } {
  const decision = authorizeControlCommand(command, state.grant, now);
  const event = createControlAuditEvent(command, state.grant?.pairingId ?? null, decision, now);
  return {
    state: { ...state, audit: appendControlAudit(state.audit, event) },
    allowed: decision.allowed,
    reason: decision.allowed ? 'allowed' : decision.reason,
  };
}
