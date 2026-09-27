import { useState } from 'react';

const drafts = new Map<string, string>();

export function useDraft(chatId: string) {
  const [text, setText] = useState(() => drafts.get(chatId) ?? '');
  return {
    text,
    set(value: string) {
      setText(value);
      drafts.set(chatId, value);
    },
    show: setText,
    saved: () => drafts.get(chatId) ?? '',
  };
}
