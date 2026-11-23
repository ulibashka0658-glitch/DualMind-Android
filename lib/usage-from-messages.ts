import type { MessageNode } from 'message-nodes';
import { readMessageUsage } from './message-usage';
import type { UsageEntry } from './usage-summary';

/** Read persisted assistant-message usage; no second mutable ledger to drift. */
export function usageEntriesFromMessages(mappings: Record<string, MessageNode<string>>): UsageEntry[] {
  const entries: UsageEntry[] = [];
  for (const [id, message] of Object.entries(mappings)) {
    if (message.role !== 'assistant') continue;
    const saved = readMessageUsage(message.metadata);
    if (!saved) continue;
    const metadata = message.metadata as Record<string, unknown>;
    const rawTimestamp = metadata.updateTime ?? metadata.createTime;
    const timestamp = typeof rawTimestamp === 'string' && !Number.isNaN(Date.parse(rawTimestamp))
      ? rawTimestamp : '';
    entries.push({ id, ...saved, timestamp });
  }
  return entries;
}
