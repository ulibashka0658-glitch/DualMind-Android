import type { ControlDecision } from './control-policy';

export type ControlAuditEvent = {
  timestamp: string;
  pairingId: string | null;
  command: string;
  allowed: boolean;
  reason: string;
};

/** No API keys, request payloads, chat text, or diagnostic secrets in the audit. */
export function createControlAuditEvent(
  command: string,
  pairingId: string | null,
  decision: ControlDecision,
  timestamp: string,
): ControlAuditEvent {
  return {
    timestamp,
    pairingId,
    command,
    allowed: decision.allowed,
    reason: decision.allowed ? 'allowed' : decision.reason,
  };
}

/** Bound audit storage to avoid unbounded growth. */
export function appendControlAudit(
  previous: readonly ControlAuditEvent[],
  next: ControlAuditEvent,
  maxEntries = 200,
): ControlAuditEvent[] {
  const limit = Number.isSafeInteger(maxEntries) && maxEntries > 0 ? maxEntries : 200;
  return [...previous, next].slice(-limit);
}
