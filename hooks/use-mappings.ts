import { loadLocalMessages, saveLocalMessages } from '@/utilities/local-db';
import { MessageNode } from 'message-nodes';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

type Mappings = Record<string, MessageNode<string, Record<string, any>>>;

/**
 * Never write the initial empty state before the persisted messages have
 * finished loading. Serialize writes so older snapshots cannot finish last.
 */
function useMappings(): [Mappings, Dispatch<SetStateAction<Mappings>>] {
  const [mappings, setMappings] = useState<Mappings>({});
  const [hydrated, setHydrated] = useState(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadLocalMessages();
        if (!cancelled) {
          setMappings(prev => ({ ...loaded, ...prev }));
        }
      } catch (error) {
        console.error("Error loading mappings:", error);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => {
      const snapshot = mappings;
      writeQueue.current = writeQueue.current
        .catch(() => undefined)
        .then(() => saveLocalMessages(snapshot))
        .catch(error => console.error("Error saving mappings:", error));
    }, 500);
    return () => clearTimeout(timeout);
  }, [hydrated, mappings]);

  return [mappings, setMappings];
}

export default useMappings;
