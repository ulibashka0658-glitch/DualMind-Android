import { appendControlAudit, createControlAuditEvent } from '../../lib/control-audit';

describe('remote control audit', () => {
  it('records a rejected command without sensitive payloads', () => {
    expect(createControlAuditEvent('shell.exec', null,
      { allowed: false, reason: 'unknown-command' }, '2026-11-23T00:00:00Z')).toEqual({
      timestamp: '2026-11-23T00:00:00Z',
      pairingId: null,
      command: 'shell.exec',
      allowed: false,
      reason: 'unknown-command',
    });
  });
  it('retains only the newest bounded events', () => {
    const event = createControlAuditEvent('app.status', 'paired',
      { allowed: true, command: 'app.status' }, '2026-11-23T00:00:00Z');
    expect(appendControlAudit([event, event], event, 2)).toHaveLength(2);
  });
});
