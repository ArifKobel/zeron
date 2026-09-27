import { useEffect, useRef, useState } from 'react';
import { engine } from '@/engine';
import { webDeviceId } from '@/session';
import { reportError } from '@/toast';
import type { QueuedMessage, Target } from '@/types';
import { uuid } from '@/uuid';

const LEASE_RENEW_MS = 20_000;
const EDITOR_INSTANCE = uuid();
const LEASE_LAPSED = 'Edit protection may have expired — review before sending.';
const SETTLED = ['committed', 'discarded', 'cancelled', 'released'];

interface QueueEdit {
  rowId: string;
  leaseId: string;
  baseTextHash: string;
  savedDraft: string;
  warning: string | null;
}

export function useQueueEdit({
  chatId,
  hostTarget,
  draft,
  onError,
}: {
  chatId: string;
  hostTarget: Target;
  draft: { text: string; set: (text: string) => void; show: (text: string) => void };
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<QueueEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const current = useRef(editing);
  current.current = editing;

  const finish = async (action: 'commit' | 'cancel' | 'discard', text?: string) => {
    const lease = current.current;
    if (!lease) return;
    const reply = await engine.call<{ outcome: string }>('FinishQueuedMessageEdit', {
      chatId,
      id: lease.rowId,
      leaseId: lease.leaseId,
      action,
      expectedTextHash: lease.baseTextHash,
      ...(text !== undefined ? { text } : {}),
      ...hostTarget,
    });
    return reply.outcome;
  };

  useEffect(() => {
    if (!editing) return;
    const lapsed = () => setEditing((e) => e && { ...e, warning: LEASE_LAPSED });
    const timer = setInterval(() => {
      engine
        .call<{ outcome: string }>('RenewQueuedMessageEdit', { chatId, id: editing.rowId, leaseId: editing.leaseId, ...hostTarget })
        .then((r) => r.outcome !== 'renewed' && lapsed(), lapsed);
    }, LEASE_RENEW_MS);
    return () => clearInterval(timer);
  }, [editing?.leaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => void finish('cancel').catch(() => {}), [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = async (row: QueuedMessage) => {
    try {
      const reply = await engine.call<{ outcome: string; leaseId?: string; text?: string; baseTextHash?: string }>(
        'BeginQueuedMessageEdit',
        { chatId, id: row.id, editorDeviceId: webDeviceId(), editorInstanceId: EDITOR_INSTANCE, ...hostTarget },
      );
      if (reply.outcome === 'acquired' && reply.leaseId && reply.baseTextHash) {
        setEditing({ rowId: row.id, leaseId: reply.leaseId, baseTextHash: reply.baseTextHash, savedDraft: draft.text, warning: null });
        draft.show(reply.text ?? row.text);
      } else if (reply.outcome === 'locked') onError('That queued message is being edited on another device.');
      else onError('That queued message is no longer available.');
    } catch {
      onError('Connect to the chat host to edit this message.');
    }
  };

  const stop = async () => {
    const lease = current.current;
    try {
      await finish('cancel');
    } catch {
      reportError(new Error("Couldn't cancel the protected edit."));
    }
    setEditing(null);
    if (lease) draft.set(lease.savedDraft);
  };

  const save = async () => {
    const lease = current.current;
    if (!lease) return;
    const text = draft.text.trim();
    setSaving(true);
    try {
      const outcome = await finish(text ? 'commit' : 'discard', text || undefined);
      if (outcome === 'conflict') onError('This message changed on another device; your edit is still here.');
      else if (outcome === 'missing') onError('Message removed. Stop editing to copy your text and restore your draft.');
      else if (outcome && !SETTLED.includes(outcome)) {
        onError('Edit protection changed. Stop editing to copy your text and restore your draft.');
      } else {
        setEditing(null);
        draft.set(lease.savedDraft);
      }
    } catch {
      onError("Couldn't save the protected edit.");
    } finally {
      setSaving(false);
    }
  };

  return { editing, saving, begin, stop, save };
}
