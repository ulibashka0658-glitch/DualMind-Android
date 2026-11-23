/**
 * Process-local serialization for pairing lifecycle mutations.
 * Never nest runPairingMutation calls: the callback owns the lock.
 * This does not replace durable recovery after a process restart.
 */
let tail: Promise<unknown> = Promise.resolve();

export function runPairingMutation<T>(operation: () => Promise<T>): Promise<T> {
  const task = tail.catch(() => undefined).then(operation);
  tail = task;
  return task;
}
