import { parseControlCommand, redactDiagnostics, requiresUserConfirmation, ControlCommand, ControlResult } from "./dualmind-control-protocol";

export interface ControlHandlers {
  status: () => unknown;
  diagnostics: () => unknown;
  models: () => readonly string[];
  selectModel: (id: string) => void | Promise<void>;
  tasks: () => readonly string[];
  cancelTask: (id: string) => void | Promise<void>;
  confirm: (command: ControlCommand) => Promise<boolean>;
}

/** Session-local dispatcher. No network listener or authentication is implied. */
export function createControlDispatcher(handlers: ControlHandlers) {
  const seen = new Set<string>();
  let busy = false;
  return async (input: unknown): Promise<ControlResult> => {
    let id = "invalid";
    const result = (ok: boolean, data?: unknown, error?: string): ControlResult => ({
      version: 1, id, ok, timestamp: new Date().toISOString(),
      ...(ok ? { data: redactDiagnostics(data) } : { error }),
    });
    try {
      const cmd = parseControlCommand(input);
      id = cmd.id;
      if (seen.has(id)) return result(false, undefined, "duplicate_command");
      if (busy) return result(false, undefined, "dispatcher_busy");
      if (seen.size >= 4096) return result(false, undefined, "session_limit");
      seen.add(id);
      busy = true;
      try {
        const target = cmd.action === "models.select" ? cmd.params?.modelId : cmd.params?.taskId;
        if (requiresUserConfirmation(cmd.action)) {
          if (typeof target !== "string" || !target.trim()) return result(false, undefined, "invalid_target");
          const available = cmd.action === "models.select" ? handlers.models : handlers.tasks;
          if (!available().includes(target)) return result(false, undefined, "unknown_target");
          if (!await handlers.confirm(cmd)) return result(false, undefined, "user_denied");
          if (!available().includes(target)) return result(false, undefined, "target_changed");
          if (cmd.action === "models.select") await handlers.selectModel(target);
          else await handlers.cancelTask(target);
          return result(true, { accepted: true });
        }
        switch (cmd.action) {
          case "status.read": return result(true, handlers.status());
          case "diagnostics.read": return result(true, handlers.diagnostics());
          case "models.list": return result(true, handlers.models());
          case "tasks.list": return result(true, handlers.tasks());
          default: return result(false, undefined, "unsupported_action");
        }
      } finally { busy = false; }
    } catch { return result(false, undefined, "command_failed"); }
  };
}
