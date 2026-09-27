import { useState } from 'react';
import { ArchiveRestore, ChevronDown, Plus } from 'lucide-react';
import { mutate } from '@/actions';
import { go } from '@/route';
import { reportError } from '@/toast';
import type { Chat } from '@/types';
import { HarnessMark } from '@/ui/Brand';
import { chatTitle } from '@/util';
import { formatTimeAgo, lastActivity, sortChats } from '@/view';
import { SwipeRow } from '@/components/home/SwipeRow';

const PAGE_FIRST = 10;
const PAGE_MORE = 25;

export function ArchivedShelf({ chats }: { chats: Chat[] }) {
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(PAGE_FIRST);
  if (!chats.length) return null;
  const ordered = sortChats(chats);
  const remaining = ordered.length - shown;
  return (
    <section className="archived-shelf">
      <button
        className="archived-header"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setShown(PAGE_FIRST);
        }}
      >
        <span>{open ? 'Archived' : `Archived (${chats.length})`}</span>
        <span className="archived-rule" />
        <ChevronDown size={14} className={open ? 'open' : ''} />
      </button>
      {open && (
        <>
          {ordered.slice(0, shown).map((chat) => (
            <ArchivedRow key={chat.id} chat={chat} />
          ))}
          {remaining > 0 && (
            <button className="archived-more" onClick={() => setShown(shown + PAGE_MORE)}>
              <Plus size={13} />
              Show {Math.min(remaining, PAGE_MORE)} more
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ArchivedRow({ chat }: { chat: Chat }) {
  const unarchive = () => mutate({ op: 'setChatArchived', chatId: chat.id, archived: false }).catch(reportError);
  return (
    <SwipeRow
      chatId={chat.id}
      className="archived-row"
      left={null}
      right={{ icon: <ArchiveRestore size={20} />, run: unarchive, className: 'unarchive' }}
      menu={[{ label: 'Unarchive', icon: <ArchiveRestore size={16} />, onSelect: unarchive }]}
      onOpen={() => go({ kind: 'chat', chatId: chat.id })}
    >
      <HarnessMark harness={chat.config?.harness} size={14} dim />
      <span className="archived-title">{chatTitle(chat)}</span>
      <span className="archived-time">{formatTimeAgo(lastActivity(chat), Date.now())}</span>
    </SwipeRow>
  );
}
