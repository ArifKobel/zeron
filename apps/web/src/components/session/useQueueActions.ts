import { useState } from 'react';
import { engine } from '@/engine';
import type { QueuedMessage, Target } from '@/types';

export function useQueueActions(chatId: string, hostTarget: Target, onError: (message: string) => void) {
  const [pending, setPending] = useState<Set<string>>(new Set());

  const act = async (row: QueuedMessage, method: string, what: string, params: object = {}) => {
    setPending((p) => new Set(p).add(row.id));
    try {
      await engine.call(method, { chatId, id: row.id, ...params, ...hostTarget });
    } catch {
      onError(`Couldn't complete ${what}. Check the connection to the chat host and the queue before retrying.`);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(row.id);
        return next;
      });
    }
  };

  return {
    pending,
    sendNow: (row: QueuedMessage) => act(row, 'SendQueuedMessageNow', 'send now'),
    move: (row: QueuedMessage, toIndex: number) => act(row, 'MoveQueuedMessage', 'the move', { toIndex }),
    remove: (row: QueuedMessage) => act(row, 'RemoveQueuedMessage', 'remove'),
  };
}
