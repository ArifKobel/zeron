import { useEffect, useSyncExternalStore } from 'react';
import { Home } from '@/components/home/Home';
import { NewSession } from '@/components/new-session/NewSession';
import { SessionView } from '@/components/session/SessionView';
import { SignIn } from '@/components/SignIn';
import { SpaceView } from '@/components/home/SpaceView';
import { useHashRoute } from '@/hooks';
import { parseRoute } from '@/route';
import { useSession } from '@/session';
import { Toasts } from '@/toast';
import { ZeronMark } from '@/ui/Brand';
import { ZeronPulse } from '@/ui/Loaders';
import { chatTitle } from '@/util';
import { WorkspaceProvider, useWorkspace } from '@/workspace';

const WIDE = '(min-width: 900px)';

function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const query = matchMedia(WIDE);
      query.addEventListener('change', cb);
      return () => query.removeEventListener('change', cb);
    },
    () => matchMedia(WIDE).matches,
  );
}

function Shell() {
  const route = parseRoute(useHashRoute());
  const ws = useWorkspace();
  const wide = useWide();

  const chat = route.kind === 'chat' ? ws.chats?.find((c) => c.id === route.chatId) : undefined;
  const space = route.kind === 'space' ? ws.spaces.find((s) => s.id === route.spaceId) : undefined;
  const selectedChatId = route.kind === 'chat' ? route.chatId : null;

  useEffect(() => {
    document.title = chat ? `${chatTitle(chat)} · Zeron` : 'Zeron';
  }, [chat]);

  let screen: React.ReactNode;
  switch (route.kind) {
    case 'home':
      screen = wide ? (
        <div className="pane-placeholder">
          <ZeronMark size={56} className="canvas-mark" />
          <span>Pick a session, or start one with +</span>
        </div>
      ) : (
        <Home selectedChatId={null} />
      );
      break;
    case 'space':
      screen = space ? (
        <SpaceView key={space.id} space={space} />
      ) : (
        <Missing loading={ws.chats === undefined} what="This project no longer exists." />
      );
      break;
    case 'chat':
      screen = chat ? (
        <SessionView key={chat.id} chat={chat} />
      ) : (
        <Missing loading={ws.chats === undefined} what="This session no longer exists." />
      );
      break;
    case 'newSession':
      screen = <NewSession key={route.spaceId} spaceId={route.spaceId} deviceId={null} />;
      break;
    case 'newProjectless':
      screen = <NewSession key={route.deviceId ?? 'none'} spaceId={null} deviceId={route.deviceId} />;
      break;
  }

  return (
    <div className={`app ${wide ? 'wide' : 'narrow'}`}>
      {wide ? (
        <>
          <aside className="pane-list">
            <Home selectedChatId={selectedChatId} />
          </aside>
          <main className="pane-main">{screen}</main>
        </>
      ) : (
        <main className="pane-main">{screen}</main>
      )}
      <Toasts />
    </div>
  );
}

function Missing({ loading, what }: { loading: boolean; what: string }) {
  return <div className="pane-placeholder">{loading ? <ZeronPulse label="Loading…" /> : what}</div>;
}

export function App() {
  const session = useSession();
  if (session.status === 'signIn') {
    return (
      <div className="app narrow">
        <SignIn />
      </div>
    );
  }
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
