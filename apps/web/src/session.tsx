import { createContext, useContext, type ReactNode } from 'react';
import { Account, checkState, fetchConfig, type ServerConfig } from '@/edge/account';
import { Gateway } from '@/edge/gateway';
import { PresenceWatcher, registryUrl } from '@/edge/presence';
import { setEngine } from '@/engine';
import { RpcClient } from '@/rpc';
import { uuid } from '@/uuid';

const WEB_DEVICE_KEY = 'zeron-web.deviceId';

export type Session =
  | { status: 'signedIn'; config: ServerConfig; account: Account; gateway: Gateway; presence: PresenceWatcher }
  | { status: 'signIn'; config: ServerConfig; account: Account; error: string | null };

export function restart() {
  location.hash = '';
  location.reload();
}

export function webDeviceId(): string {
  let id = localStorage.getItem(WEB_DEVICE_KEY);
  if (!id) {
    id = `web-${uuid()}`;
    localStorage.setItem(WEB_DEVICE_KEY, id);
  }
  return id;
}

async function completeRedirect(account: Account): Promise<string | null> {
  if (location.pathname !== '/auth/callback') return null;
  const params = new URLSearchParams(location.search);
  history.replaceState(null, '', '/');
  const error = params.get('error_description') ?? params.get('error');
  if (error) return error;
  try {
    await account.exchange(checkState(params.get('state') ?? '', params.get('code') ?? ''));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export async function bootstrap(): Promise<Session> {
  const config = await fetchConfig();
  const account = new Account();
  let error = await completeRedirect(account);
  if (account.state.status === 'signedOut') {
    await account.restore().catch((e: Error) => {
      error ??= `Couldn't reach the sign-in service: ${e.message}`;
    });
  }
  const state = account.state;
  if (state.status !== 'signedIn') return { status: 'signIn', config, account, error };

  const token = () => account.token();
  const device = webDeviceId();
  const presence = new PresenceWatcher(async () => {
    const t = await token();
    return t ? registryUrl(config.edgeUrl, state.orgId, t, device) : null;
  }, device);
  presence.start();
  const gateway = new Gateway(config.edgeUrl, token, presence);
  setEngine(new RpcClient(gateway.openSocket));
  return { status: 'signedIn', config, account, gateway, presence };
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}

export function useSignedIn() {
  const session = useSession();
  if (session.status !== 'signedIn') throw new Error('useSignedIn outside a signed-in session');
  return session;
}
