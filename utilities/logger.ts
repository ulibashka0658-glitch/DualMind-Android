import { redactDiagnostics } from "@/utils/dualmind-control-protocol";

export interface LogEntry {
  level: "log" | "warn" | "error";
  message: string;
  time: number;
}

const buffer: LogEntry[] = [];
const listeners = new Set<() => void>();
const MAX = 300;
let installed = false;

function emit() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* one subscriber must not break logging */ }
  });
}

function serializeArg(arg: unknown): string {
  try {
    const safe = redactDiagnostics(arg);
    return typeof safe === "string" ? safe : JSON.stringify(safe);
  } catch {
    return "[unserializable]";
  }
}

function push(level: LogEntry["level"], args: unknown[]) {
  const message = args.map(serializeArg).join(" ").slice(0, 8192);
  buffer.push({ level, message, time: Date.now() });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  emit();
}

export function getLogs(): LogEntry[] {
  return buffer.map(entry => ({ ...entry }));
}

export function subscribeLogs(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function installConsoleCapture() {
  if (installed) return;
  installed = true;

  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  // Redact both the in-app ring buffer and forwarded console output.
  // Never log raw provider credentials from these intercepted methods.
  console.log = (...args: unknown[]) => {
    push("log", args);
    orig.log(...args.map(serializeArg));
  };
  console.warn = (...args: unknown[]) => {
    push("warn", args);
    orig.warn(...args.map(serializeArg));
  };
  console.error = (...args: unknown[]) => {
    push("error", args);
    orig.error(...args.map(serializeArg));
  };
}
