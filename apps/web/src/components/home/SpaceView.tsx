import { ChevronLeft, Folder, MessagesSquare, Plus } from 'lucide-react';
import { partitionChats } from '@/chats';
import { back, go } from '@/route';
import type { Space } from '@/types';
import { spaceName } from '@/util';
import { useWorkspace } from '@/workspace';
import { SessionList } from '@/components/home/SessionList';

export function SpaceView({ space }: { space: Space }) {
  const ws = useWorkspace();
  const device = ws.devices.find((d) => d.id === space.deviceId);
  const { active, archived } = partitionChats(ws.chats ?? [], ws.spaces, space.id);
  const start = () => go({ kind: 'newSession', spaceId: space.id });

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="circle-btn back-btn" aria-label="Back" onClick={back}>
          <ChevronLeft size={22} />
        </button>
        <div className="screen-heading">
          <div className="screen-title">{spaceName(space)}</div>
          <div className="screen-subtitle">
            <Folder size={11} />
            <span className="head-truncate">
              <bdi>
                {space.path}
                {device && ` · ${device.name}`}
              </bdi>
            </span>
          </div>
        </div>
        <button className="circle-btn" aria-label={`New session in ${spaceName(space)}`} onClick={start}>
          <Plus size={20} />
        </button>
      </header>
      <div className="home-scroll">
        {ws.chats === undefined ? (
          <div className="list-empty">Loading…</div>
        ) : (
          <SessionList
            chats={active}
            archived={archived}
            selectedId={null}
            empty={
              <div className="space-empty">
                <MessagesSquare size={28} strokeWidth={1.25} />
                <span>No sessions in this project</span>
                <button className="glass-button" onClick={start}>
                  Start a session
                </button>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
