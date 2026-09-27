import { useState } from 'react';
import { ChevronDown, FolderPlus, Plus, X } from 'lucide-react';
import { partitionChats } from '@/chats';
import { usePresence } from '@/connectivity';
import { go } from '@/route';
import { useAdoptByActivity } from '@/sends';
import type { Space } from '@/types';
import { Menu, type MenuItem } from '@/ui/Menu';
import { deviceName, spaceName } from '@/util';
import { useWorkspace } from '@/workspace';
import { AccountMenu } from '@/components/home/AccountMenu';
import { ConnectionStatus } from '@/components/home/ConnectionStatus';
import { NewSpaceSheet } from '@/components/home/NewSpaceSheet';
import { SessionList } from '@/components/home/SessionList';
import { HostPickerSheet } from '@/components/new-session/HostPickerSheet';

const FILTER_KEY = 'zeron-web.homeSpaceFilter';

export function Home({ selectedChatId }: { selectedChatId: string | null }) {
  const ws = useWorkspace();
  const { isOnline } = usePresence();
  const [filter, setFilterState] = useState(() => localStorage.getItem(FILTER_KEY) ?? '');
  const [sheet, setSheet] = useState<'newSpace' | 'host' | null>(null);
  useAdoptByActivity(ws.chats);

  const space = ws.spaces.find((s) => s.id === filter);
  const setFilter = (id: string) => {
    setFilterState(id);
    localStorage.setItem(FILTER_KEY, id);
  };
  const { active, archived } = partitionChats(ws.chats ?? [], ws.spaces, space?.id ?? null);

  const deviceTag = (s: Space) => `@ ${deviceName(ws.devices, s.deviceId)}${isOnline(s.deviceId) ? '' : ' · offline'}`;
  const newProject: MenuItem = { label: 'New project…', icon: <FolderPlus size={17} />, onSelect: () => setSheet('newSpace') };

  const filterItems: MenuItem[] = [
    { label: 'All', checked: !space, onSelect: () => setFilter('') },
    ...ws.spaces.map((s) => ({
      label: spaceName(s),
      sublabel: deviceTag(s),
      checked: space?.id === s.id,
      onSelect: () => setFilter(s.id),
    })),
    { divider: true },
    newProject,
  ];

  const newSessionItems: MenuItem[] = space
    ? [{ label: `New session in ${spaceName(space)}`, onSelect: () => go({ kind: 'newSession', spaceId: space.id }) }]
    : ws.spaces.length
      ? [
          { section: 'New session in…' },
          ...ws.spaces.map((s) => ({
            label: spaceName(s),
            sublabel: deviceTag(s),
            onSelect: () => go({ kind: 'newSession', spaceId: s.id }),
          })),
          { divider: true },
        ]
      : [];
  const plusItems: MenuItem[] = [
    ...newSessionItems,
    { label: 'Session without a project…', icon: <X size={17} />, onSelect: () => setSheet('host') },
    newProject,
  ];

  return (
    <div className="home">
      <header className="home-bar">
        <Menu items={filterItems} label="Filter sessions by project">
          <span className="glass-pill filter-pill">
            <span className="filter-pill-label">{space ? spaceName(space) : 'All'}</span>
            <ChevronDown size={12} strokeWidth={3} />
          </span>
        </Menu>
        <ConnectionStatus />
        <div className="glass-pill pill-group">
          <Menu items={plusItems} align="end" label="New">
            <Plus size={22} />
          </Menu>
          <AccountMenu />
        </div>
      </header>
      <div className="home-scroll">
        {ws.chats === undefined ? (
          <div className="list-empty">Loading…</div>
        ) : (
          <SessionList chats={active} archived={archived} selectedId={selectedChatId} empty="No sessions yet — start one with +" />
        )}
      </div>
      {sheet === 'newSpace' && (
        <NewSpaceSheet
          onClose={() => setSheet(null)}
          onCreated={(spaceId) => {
            setSheet(null);
            go({ kind: 'space', spaceId });
          }}
        />
      )}
      {sheet === 'host' && (
        <HostPickerSheet
          selected={null}
          onClose={() => setSheet(null)}
          onPick={(deviceId) => {
            setSheet(null);
            go({ kind: 'newProjectless', deviceId });
          }}
        />
      )}
    </div>
  );
}
