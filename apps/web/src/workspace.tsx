import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { engine } from '@/engine';
import { useConnection, useWatch } from '@/hooks';
import type { Chat, Device, Session, Space } from '@/types';

export interface Workspace {
  chats: Chat[] | undefined;
  spaces: Space[];
  devices: Device[];
  sessions: Session[];
  gatewayDeviceId: string | null;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { state, epoch } = useConnection();
  const chats = useWatch<Chat[]>('WatchChats', {});
  const spaces = useWatch<Space[]>('WatchSpaces', {});
  const devices = useWatch<Device[]>('WatchDevices', {});
  const sessions = useWatch<Session[]>('WatchSessions', {});
  const [info, setInfo] = useState<{ deviceId: string } | null>(null);

  useEffect(() => {
    if (state !== 'open') return;
    engine.call<{ deviceId: string }>('EngineInfo').then(setInfo, () => {});
  }, [state, epoch]);

  return (
    <WorkspaceContext.Provider
      value={{
        chats,
        spaces: spaces ?? [],
        devices: devices ?? [],
        sessions: sessions ?? [],
        gatewayDeviceId: info?.deviceId ?? null,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace outside WorkspaceProvider');
  return workspace;
}
