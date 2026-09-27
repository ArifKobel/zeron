import { uuid } from '@/uuid';

export interface ServerConfig {
  edgeUrl: string;
  workosClientId: string;
  workosApiBase: string;
  redirectUri: string | null;
  showMockHarness: boolean;
}

interface AccountUser {
  id: string;
  email: string | null;
  name: string | null;
}

interface Org {
  id: string;
  name: string;
}

export type AccountState =
  | { status: 'signedOut' }
  | { status: 'needsOrg'; user: AccountUser | null; orgs: Org[] }
  | { status: 'signedIn'; user: AccountUser | null; orgId: string };

interface SessionReply {
  signedOut?: boolean;
  accessToken: string | null;
  orgId: string | null;
  user: AccountUser | null;
  orgs?: Org[];
}

const EXPIRY_MARGIN_MS = 60_000;
const FALLBACK_TOKEN_TTL_MS = 5 * 60_000;
const STATE_KEY = 'zeron-web.signInState';

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: object = {}): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, json.error ?? `request failed (${response.status})`);
  return json as T;
}

export async function fetchConfig(): Promise<ServerConfig> {
  const response = await fetch('/api/config', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Couldn't load the server configuration (${response.status})`);
  return response.json();
}

export function jwtExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function authorizeUrl(config: ServerConfig, state: string): string {
  const url = new URL('/user_management/authorize', config.workosApiBase);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.workosClientId);
  url.searchParams.set('redirect_uri', config.redirectUri ?? `${config.edgeUrl.replace(/\/+$/, '')}/auth/cli/callback`);
  url.searchParams.set('provider', 'authkit');
  url.searchParams.set('state', state);
  return url.toString();
}

export function beginSignIn(config: ServerConfig): string {
  const state = uuid();
  sessionStorage.setItem(STATE_KEY, state);
  return authorizeUrl(config, state);
}

export function codeFromPaste(pasted: string): string {
  const trimmed = pasted.trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0) throw new Error('Paste the whole code shown after signing in (it contains a dot).');
  return checkState(trimmed.slice(0, dot), trimmed.slice(dot + 1));
}

export function checkState(state: string, code: string): string {
  const expected = sessionStorage.getItem(STATE_KEY);
  if (!expected || state !== expected) {
    throw new Error("This code belongs to a different sign-in. Start again from this tab.");
  }
  if (!code) throw new Error('The code is empty.');
  sessionStorage.removeItem(STATE_KEY);
  return code;
}

export class Account {
  state: AccountState = { status: 'signedOut' };
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<string | null> | null = null;

  private apply(reply: SessionReply) {
    if (reply.signedOut) return this.signedOut();
    this.accessToken = reply.accessToken;
    this.expiresAt = reply.accessToken ? (jwtExpiry(reply.accessToken) ?? Date.now() + FALLBACK_TOKEN_TTL_MS) : 0;
    this.state =
      reply.accessToken && reply.orgId
        ? { status: 'signedIn', user: reply.user, orgId: reply.orgId }
        : { status: 'needsOrg', user: reply.user, orgs: reply.orgs ?? [] };
  }

  private signedOut() {
    this.accessToken = null;
    this.expiresAt = 0;
    this.state = { status: 'signedOut' };
  }

  async restore(): Promise<AccountState> {
    try {
      this.apply(await post<SessionReply>('/api/auth/refresh'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) this.signedOut();
      else throw error;
    }
    return this.state;
  }

  async exchange(code: string): Promise<AccountState> {
    this.apply(await post<SessionReply>('/api/auth/exchange', { code }));
    return this.state;
  }

  async selectOrg(organizationId: string): Promise<AccountState> {
    this.apply(await post<SessionReply>('/api/auth/org', { organizationId }));
    return this.state;
  }

  async signOut() {
    await post('/api/auth/logout').catch(() => {});
    this.signedOut();
  }

  async token(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.expiresAt - EXPIRY_MARGIN_MS) return this.accessToken;
    if (this.state.status !== 'signedIn') return null;
    this.refreshing ??= post<SessionReply>('/api/auth/refresh')
      .then(
        (reply) => {
          this.apply(reply);
          return reply.accessToken;
        },
        (error) => {
          if (error instanceof ApiError && error.status === 401) this.signedOut();
          return null;
        },
      )
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }
}
