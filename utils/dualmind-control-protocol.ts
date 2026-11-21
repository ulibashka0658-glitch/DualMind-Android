/**
 * DualMind control protocol, v1.
 *
 * Pure validation and redaction helpers. This module does NOT expose a server,
 * execute commands, or grant access to the phone. An authenticated transport
 * and explicit user consent must be added before any remote control is enabled.
 */
export type ControlAction =
  | 'status.read'
  | 'diagnostics.read'
  | 'models.list'
  | 'models.select'
  | 'models.stop'
  | 'models.unload'
  | 'tasks.list'
  | 'tasks.cancel';

export type ControlCommand = {
  version: 1;
  id: string;
  action: ControlAction;
  params?: Record<string, unknown>;
};

export type ControlResult = {
  version: 1;
  id: string;
  ok: boolean;
  timestamp: string;
  data?: unknown;
  error?: string;
};

const allowedActions = new Set<ControlAction>([
  'status.read',
  'diagnostics.read',
  'models.list',
  'models.select',
  'models.stop',
  'models.unload',
  'tasks.list',
  'tasks.cancel',
]);

const sensitiveKey = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|credential|cookie|private[_-]?key)/i;
const bearerToken = /\bBearer\s+[^\s"',;]+/gi;
const apiKeyValue = /\b(sk-[a-zA-Z0-9_-]{8,})\b/g;
const urlCredential = /([?&](?:api_key|apikey|access_token|token|key|secret|password)=)[^&#\s]+/gi;
const assignmentSecret = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\b(\s*[:=]\s*)[^\s,;]+/gi;

export function redactDiagnostics(value: unknown): unknown {
  // A single shared WeakSet prevents infinite recursion on circular structures.
  const visited = new WeakSet<object>();
  const sanitize = (input: unknown, depth: number): unknown => {
    if (depth > 12) return '[truncated]';
    if (typeof input === 'string') {
      return input.slice(0, 8192)
        .replace(bearerToken, 'Bearer [REDACTED]')
        .replace(apiKeyValue, '[REDACTED]')
        .replace(urlCredential, '$1[REDACTED]')
        .replace(assignmentSecret, '$1$2[REDACTED]');
    }
    if (Array.isArray(input)) {
      if (visited.has(input)) return '[circular]';
      visited.add(input);
      return input.slice(0, 200).map(item => sanitize(item, depth + 1));
    }
    if (input && typeof input === 'object') {
      if (visited.has(input)) return '[circular]';
      visited.add(input);
      const safe: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(input).slice(0, 200)) {
        safe[key] = sensitiveKey.test(key) ? '[REDACTED]' : sanitize(item, depth + 1);
      }
      return safe;
    }
    return input;
  };
  return sanitize(value, 0);
}

export function parseControlCommand(input: unknown): ControlCommand {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid control command');
  }
  const cmd = input as Record<string, unknown>;
  if (cmd.version !== 1 || typeof cmd.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,80}$/.test(cmd.id) ||
      typeof cmd.action !== 'string' ||
      !allowedActions.has(cmd.action as ControlAction)) {
    throw new Error('Unsupported control command');
  }
  if (cmd.params !== undefined &&
      (!cmd.params || typeof cmd.params !== 'object' || Array.isArray(cmd.params))) {
    throw new Error('Invalid command parameters');
  }
  const params = cmd.params as Record<string, unknown> | undefined;
  let paramsSize = 0;
  try { paramsSize = params ? JSON.stringify(params).length : 0; }
  catch { throw new Error('Invalid command parameters'); }
  if (paramsSize > 8192) {
    throw new Error('Command parameters too large');
  }
  if (cmd.action === 'models.select' &&
      (typeof params?.modelId !== 'string' || params.modelId.length > 256)) {
    throw new Error('Missing modelId');
  }
  if (cmd.action === 'tasks.cancel' &&
      (typeof params?.taskId !== 'string' || params.taskId.length > 256)) {
    throw new Error('Missing taskId');
  }
  return {
    version: 1,
    id: cmd.id,
    action: cmd.action as ControlAction,
    ...(params ? { params } : {}),
  };
}

export function requiresUserConfirmation(action: ControlAction): boolean {
  return action === 'models.select' || action === 'models.stop' || action === 'models.unload' || action === 'tasks.cancel';
}
