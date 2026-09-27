import { mutate, setPinned } from '@/actions';
import { useChangeRequest } from '@/changeRequest';
import { chatLocation } from '@/chats';
import { useConnectivity, usePresence } from '@/connectivity';
import { usePins } from '@/pins';
import { sendState, useSends, type PendingSend } from '@/sends';
import { go } from '@/route';
import { reportError } from '@/toast';
import type { Chat } from '@/types';
import { sessionFor } from '@/util';
import { displayStatus, sortChats } from '@/view';
import { useWorkspace } from '@/workspace';
import { ArchivedShelf } from '@/components/home/ArchivedShelf';
import { ChatRow } from '@/components/home/ChatRow';

export function SessionList({
  chats,
  archived,
  selectedId,
  empty,
}: {
  chats: Chat[];
  archived: Chat[];
  selectedId: string | null;
  empty: React.ReactNode;
}) {
  const ws = useWorkspace();
  const pins = usePins();
  const sends = useSends();
  const { isOnline } = usePresence();
  const connectivity = useConnectivity();
  const now = Date.now();

  const pinnedIds = pins.ids.filter((id) => chats.some((c) => c.id === id));
  const ordered = sortPinnedFirst(chats, pinnedIds);

  return (
    <div className="session-list">
      {ordered.length === 0 ? (
        <div className="list-empty">{empty}</div>
      ) : (
        ordered.map((chat) => (
          <Row
            key={chat.id}
            chat={chat}
            location={chatLocation(chat, ws.spaces, ws.devices)}
            selected={chat.id === selectedId}
            pinned={pinnedIds.includes(chat.id)}
            canPin={pins.ready}
            lastPinned={pins.ids[pins.ids.length - 1] ?? null}
            mySends={sends.filter((s) => s.chatId === chat.id)}
            now={now}
            degraded={connectivity !== 'connected'}
            hostOnline={isOnline(chat.deviceId)}
          />
        ))
      )}
      <ArchivedShelf chats={archived} />
    </div>
  );
}

function sortPinnedFirst(chats: Chat[], pinned: string[]) {
  const rank = new Map(pinned.map((id, i) => [id, i]));
  const pinnedChats = chats.filter((c) => rank.has(c.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...pinnedChats, ...sortChats(chats.filter((c) => !rank.has(c.id)))];
}

function Row({
  chat,
  location,
  selected,
  pinned,
  canPin,
  lastPinned,
  mySends,
  now,
  degraded,
  hostOnline,
}: {
  chat: Chat;
  location: string;
  selected: boolean;
  pinned: boolean;
  canPin: boolean;
  lastPinned: string | null;
  mySends: PendingSend[];
  now: number;
  degraded: boolean;
  hostOnline: boolean;
}) {
  const ws = useWorkspace();
  const pr = useChangeRequest(chat, ws.gatewayDeviceId);
  return (
    <ChatRow
      chat={chat}
      location={location}
      status={displayStatus(chat, sessionFor(ws.sessions, chat), now)}
      send={sendState(mySends, now, degraded, hostOnline)}
      pr={pr}
      selected={selected}
      actions={{
        pinned,
        canPin,
        onPin: () => setPinned(chat.id, !pinned, lastPinned).catch(reportError),
        onArchive: () => mutate({ op: 'setChatArchived', chatId: chat.id, archived: true }).catch(reportError),
      }}
      onOpen={() => go({ kind: 'chat', chatId: chat.id })}
    />
  );
}
