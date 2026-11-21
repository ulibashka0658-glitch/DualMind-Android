import { NativeModules, Platform } from "react-native";

export type DownloadState = "pending" | "running" | "waiting" | "completed" | "failed" | "unknown";
export interface NativeDownloadSnapshot {
  id: string;
  status: number;
  reason: number;
  bytes: number;
  total: number;
}
interface DownloadBridge {
  enqueue(key: string, url: string, filename: string): Promise<string>;
  query(key: string): Promise<NativeDownloadSnapshot | null>;
  tracked(): Promise<Record<string, string>>;
  cancel(key: string): Promise<boolean>;
}
function bridge(): DownloadBridge {
  const module = NativeModules.DualMindDownload as DownloadBridge | undefined;
  if (Platform.OS !== "android" || !module) throw new Error("Android native downloader unavailable");
  return module;
}
export function nativeDownloaderAvailable(): boolean {
  return Platform.OS === "android" && !!NativeModules.DualMindDownload;
}
export function normalizeDownload(snapshot: NativeDownloadSnapshot) {
  const states: Record<number, DownloadState> = { 1: "pending", 2: "running", 4: "waiting", 8: "completed", 16: "failed" };
  const state = states[snapshot.status] ?? "unknown";
  const bytes = Number.isFinite(snapshot.bytes) ? Math.max(0, snapshot.bytes) : 0;
  const total = Number.isFinite(snapshot.total) && snapshot.total > 0 ? snapshot.total : null;
  const percent = state === "completed" ? 100 : total === null ? null : Math.min(99, Math.floor(bytes / total * 100));
  return { ...snapshot, state, bytes, total, percent };
}
export const nativeDownloads = {
  enqueue: (key: string, url: string, filename: string) => bridge().enqueue(key, url, filename),
  async query(key: string) {
    const snapshot = await bridge().query(key);
    return snapshot ? normalizeDownload(snapshot) : null;
  },
  tracked: () => bridge().tracked(),
  cancel: (key: string) => bridge().cancel(key),
};
