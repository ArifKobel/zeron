import { useEffect, useSyncExternalStore } from 'react';
import type { Chat } from '@/types';

export interface PendingSend {
  chatId: string;
  messageId: string;
  text: string;
  at: number;
}

export type SendState = 'sending' | 'queued' | 'failed';

export const SEND_FAILED_MS = 120_000;

let sends: PendingSend[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const pendingSends = {
  add(send: PendingSend) {
    sends = [...sends, send];
    emit();
  },
  adopt(chatId: string, entryIds: Set<string>) {
    const next = sends.filter((s) => s.chatId !== chatId || !entryIds.has(s.messageId));
    if (next.length !== sends.length) {
      sends = next;
      emit();
    }
  },
  retry(chatId: string) {
    const now = Date.now();
    sends = sends.map((s) => (s.chatId === chatId ? { ...s, at: now } : s));
    emit();
  },
};

export function useSends(chatId?: string): PendingSend[] {
  const all = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sends,
  );
  return chatId ? all.filter((s) => s.chatId === chatId) : all;
}

export function sendState(mine: PendingSend[], now: number, degraded: boolean, hostOnline: boolean): SendState | null {
  if (!mine.length) return null;
  const oldest = Math.min(...mine.map((s) => s.at));
  if (now - oldest > SEND_FAILED_MS) return 'failed';
  if (degraded || !hostOnline) return 'queued';
  return 'sending';
}

export function useAdoptByActivity(chats: Chat[] | undefined) {
  useEffect(() => {
    if (!chats) return;
    for (const chat of chats) {
      if (!chat.lastMessageAt) continue;
      const at = Date.parse(chat.lastMessageAt);
      const mine = sends.filter((s) => s.chatId === chat.id && s.at <= at);
      if (mine.length) pendingSends.adopt(chat.id, new Set(mine.map((s) => s.messageId)));
    }
  }, [chats]);
}
