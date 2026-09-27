import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TLSSocket } from 'node:tls';

const REFRESH_COOKIE = 'zw_refresh';
const ORG_COOKIE = 'zw_org';
const USER_COOKIE = 'zw_user';
const COOKIE_PATH = '/api/auth';
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;
const MAX_BODY_BYTES = 16 * 1024;
const REFRESH_REUSE_MS = 10_000;

export interface AuthOptions {
  edgeUrl: string;
  workosClientId: string;
  workosApiBase: string;
  redirectUri: string | null;
  showMockHarness?: boolean;
  extraOrigins: string[];
}

type User = { id?: string; email: string | null; name: string | null } | null;
type Tokens = { accessToken: string; refreshToken: string };
type Call = { res: ServerResponse; secure: boolean; body: Record<string, unknown>; cookies: Record<string, string> };

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApi(options: AuthOptions) {
  const edge = options.edgeUrl.replace(/\/+$/, '');
  const inflight = new Map<string, Promise<Tokens>>();

  async function callEdge(path: string, { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {}) {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await fetch(`${edge}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new HttpError(502, 'The Zeron edge is unreachable');
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpError(response.status, json.error ?? `edge answered ${response.status}`);
    return json;
  }

  async function listOrgs(accessToken: string): Promise<{ id: string; name: string }[]> {
    const { orgs } = await callEdge('/auth/orgs', { token: accessToken });
    return Array.isArray(orgs) ? orgs.map((o) => ({ id: o.organizationId, name: o.name })) : [];
  }

  function refresh(refreshToken: string, organizationId: string | undefined): Promise<Tokens> {
    let pending = inflight.get(refreshToken);
    if (!pending) {
      pending = callEdge('/auth/refresh', {
        method: 'POST',
        body: organizationId ? { refreshToken, organizationId } : { refreshToken },
      }) as Promise<Tokens>;
      inflight.set(refreshToken, pending);
      pending.then(
        () => setTimeout(() => inflight.delete(refreshToken), REFRESH_REUSE_MS),
        () => inflight.delete(refreshToken),
      );
    }
    return pending;
  }

  async function refreshOrSignOut({ res, secure }: Call, refreshToken: string, orgId: string | undefined) {
    try {
      return await refresh(refreshToken, orgId);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        clearSession(res, secure);
        throw new HttpError(401, orgId ? 'Not a member of this organization, or the session expired' : 'Session expired');
      }
      throw error;
    }
  }

  async function exchange({ res, secure, body }: Call) {
    if (typeof body.code !== 'string' || !body.code) throw new HttpError(400, 'missing code');
    const signedIn = await callEdge('/auth/exchange', { method: 'POST', body: { code: body.code } });
    const user = {
      id: signedIn.user?.id,
      email: signedIn.user?.email ?? null,
      name: [signedIn.user?.firstName, signedIn.user?.lastName].filter(Boolean).join(' ') || null,
    };
    const orgs = await listOrgs(signedIn.accessToken);
    if (orgs.length === 1) {
      const scoped = await refresh(signedIn.refreshToken, orgs[0].id);
      setSession(res, secure, scoped.refreshToken, orgs[0].id, user);
      send(res, 200, { accessToken: scoped.accessToken, orgId: orgs[0].id, user, orgs });
    } else {
      setSession(res, secure, signedIn.refreshToken, null, user);
      send(res, 200, { accessToken: null, orgId: null, user, orgs });
    }
  }

  async function selectOrg(call: Call, refreshToken: string, user: User) {
    const orgId = call.body.organizationId;
    if (typeof orgId !== 'string' || !orgId) throw new HttpError(400, 'missing organizationId');
    const scoped = await refreshOrSignOut(call, refreshToken, orgId);
    setSession(call.res, call.secure, scoped.refreshToken, orgId, user);
    send(call.res, 200, { accessToken: scoped.accessToken, orgId, user });
  }

  async function refreshSession(call: Call, refreshToken: string, user: User) {
    const orgId = call.cookies[ORG_COOKIE] || undefined;
    const next = await refreshOrSignOut(call, refreshToken, orgId);
    setSession(call.res, call.secure, next.refreshToken, orgId ?? null, user);
    if (orgId) send(call.res, 200, { accessToken: next.accessToken, orgId, user });
    else send(call.res, 200, { accessToken: null, orgId: null, user, orgs: await listOrgs(next.accessToken) });
  }

  async function authOp(req: IncomingMessage, res: ServerResponse, op: string) {
    const sameOrigin = originAllowed({
      origin: req.headers.origin,
      host: req.headers.host,
      forwardedHost: headerValue(req.headers['x-forwarded-host']),
      extraOrigins: options.extraOrigins,
    });
    if (!sameOrigin) throw new HttpError(403, 'cross-origin request refused');
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      throw new HttpError(415, 'expected application/json');
    }
    const call: Call = { res, secure: isSecure(req), body: await readJson(req), cookies: parseCookies(req.headers.cookie) };
    if (op === 'exchange') return exchange(call);
    if (op === 'logout') {
      clearSession(res, call.secure);
      return send(res, 200, { ok: true });
    }
    const refreshToken = call.cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      if (op === 'refresh') return send(res, 200, { accessToken: null, orgId: null, user: null, signedOut: true });
      throw new HttpError(401, 'signed out');
    }
    const user = decodeUser(call.cookies[USER_COOKIE]);
    if (op === 'org') return selectOrg(call, refreshToken, user);
    if (op === 'refresh') return refreshSession(call, refreshToken, user);
    throw new HttpError(404, 'not found');
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const { pathname } = new URL(req.url ?? '/', 'http://web');
    if (!pathname.startsWith('/api/')) return false;
    try {
      if (pathname === '/api/config' && req.method === 'GET') {
        send(res, 200, {
          edgeUrl: options.edgeUrl,
          workosClientId: options.workosClientId,
          workosApiBase: options.workosApiBase,
          redirectUri: options.redirectUri,
          showMockHarness: options.showMockHarness ?? false,
        });
      } else if (pathname.startsWith(`${COOKIE_PATH}/`) && req.method === 'POST') {
        await authOp(req, res, pathname.slice(COOKIE_PATH.length + 1));
      } else {
        throw new HttpError(404, 'not found');
      }
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      send(res, status, { error: error instanceof Error ? error.message : 'internal error' });
    }
    return true;
  };
}

export function originAllowed({
  origin,
  host,
  forwardedHost,
  extraOrigins = [],
}: {
  origin?: string;
  host?: string;
  forwardedHost?: string;
  extraOrigins?: string[];
}): boolean {
  if (!origin) return false;
  if (extraOrigins.includes(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [host, forwardedHost]
    .flatMap((h) => (h ? h.split(',') : []))
    .map((h) => h.trim())
    .filter(Boolean);
  return hosts.includes(originHost);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(',') : value;
}

function isSecure(req: IncomingMessage): boolean {
  const proto = headerValue(req.headers['x-forwarded-proto'])?.split(',')[0].trim();
  return proto === 'https' || Boolean((req.socket as TLSSocket).encrypted);
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const value = text ? JSON.parse(text) : {};
        resolve(typeof value === 'object' && value !== null ? value : {});
      } catch {
        reject(new HttpError(400, 'invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    try {
      out[key] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {}
  }
  return out;
}

function decodeUser(raw: string | undefined): User {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cookie(name: string, value: string, secure: boolean, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function setSession(res: ServerResponse, secure: boolean, refreshToken: string, orgId: string | null, user: User) {
  res.setHeader('set-cookie', [
    cookie(REFRESH_COOKIE, refreshToken, secure, COOKIE_MAX_AGE_S),
    orgId ? cookie(ORG_COOKIE, orgId, secure, COOKIE_MAX_AGE_S) : cookie(ORG_COOKIE, '', secure, 0),
    cookie(USER_COOKIE, JSON.stringify(user ?? null), secure, COOKIE_MAX_AGE_S),
  ]);
}

function clearSession(res: ServerResponse, secure: boolean) {
  res.setHeader('set-cookie', [REFRESH_COOKIE, ORG_COOKIE, USER_COOKIE].map((name) => cookie(name, '', secure, 0)));
}

function send(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
