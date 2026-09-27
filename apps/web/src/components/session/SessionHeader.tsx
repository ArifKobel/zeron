import { ChevronLeft, Ellipsis } from 'lucide-react';
import { mutate, setPinned } from '@/actions';
import { back } from '@/route';
import { reportError } from '@/toast';
import type { Chat } from '@/types';
import { HarnessMark } from '@/ui/Brand';
import { Menu } from '@/ui/Menu';
import { chatTitle } from '@/util';

export function SessionHeader({
  chat,
  location,
  pins,
}: {
  chat: Chat;
  location: string;
  pins: { ids: string[]; ready: boolean };
}) {
  const pinned = pins.ids.includes(chat.id);
  return (
    <header className="screen-header session-header">
      <button className="circle-btn back-btn" aria-label="Back" onClick={back}>
        <ChevronLeft size={22} />
      </button>
      <div className="screen-heading">
        <div className="screen-title">
          <HarnessMark harness={chat.config?.harness} size={13} />
          <span>{chatTitle(chat)}</span>
        </div>
        <div className="screen-subtitle">{location}</div>
      </div>
      <Menu
        label="Session actions"
        align="end"
        items={[
          {
            label: pinned ? 'Unpin' : 'Pin',
            disabled: !pins.ready,
            onSelect: () => setPinned(chat.id, !pinned, pins.ids[pins.ids.length - 1] ?? null).catch(reportError),
          },
          {
            label: 'Rename…',
            onSelect: () => {
              const title = prompt('Session title', chat.title ?? '')?.trim();
              if (title) mutate({ op: 'renameChat', chatId: chat.id, title }).catch(reportError);
            },
          },
          {
            label: chat.archived ? 'Unarchive' : 'Archive',
            onSelect: () => mutate({ op: 'setChatArchived', chatId: chat.id, archived: !chat.archived }).catch(reportError),
          },
        ]}
      >
        <span className="circle-btn">
          <Ellipsis size={18} />
        </span>
      </Menu>
    </header>
  );
}
