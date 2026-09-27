import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeEdge } from '#fixtures/fake-edge.ts';
import { createWebServer } from '#server/app.ts';
import { createApi, originAllowed } from '#server/auth.ts';

const listen = (server: http.Server) =>
  new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

describe('originAllowed (CSRF guard for /api/auth)', () => {
  it('accepts same-origin requests, including behind a proxy', () => {
    expect(originAllowed({ origin: 'http://127.0.0.1:4600', host: '127.0.0.1:4600' })).toBe(true);
    expect(originAllowed({ origin: 'https://w.example', host: 'localhost:4600', forwardedHost: 'w.example' })).toBe(true);
    expect(originAllowed({ origin: 'https://evil.example', host: '127.0.0.1:4600' })).toBe(false);
    expect(originAllowed({ origin: undefined, host: '127.0.0.1:4600' })).toBe(false);
    expect(originAllowed({ origin: 'https://app.example', host: 'x', extraOrigins: ['https://app.example'] })).toBe(true);
  });
});

describe('server', () => {
  let edge: ReturnType<typeof createFakeEdge>;
  let web: ReturnType<typeof createWebServer>;
  let base: string;

  beforeAll(async () => {
    edge = createFakeEdge();
    const edgePort = await listen(edge.server);
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'zeron-web-dist-'));
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>app</title>');
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
    web = createWebServer({
      distDir: dist,
      connectSrc: ['wss://edge.example'],
      api: createApi({
        edgeUrl: `http://127.0.0.1:${edgePort}`,
        workosClientId: 'client_x',
        workosApiBase: 'https://api.workos.com',
        redirectUri: null,
        extraOrigins: [],
      }),
    });
    base = `http://127.0.0.1:${await listen(web.server)}`;
  });

  afterAll(async () => {
    await web.close();
    await edge.close();
  });

  it('serves the app with a CSP that allows the edge, and SPA routes', async () => {
    const page = await fetch(`${base}/chat/anything`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>app</title>');
    expect(page.headers.get('content-security-policy')).toContain("connect-src 'self' wss://edge.example");
    expect(page.headers.get('content-security-policy')).toContain("img-src 'self' data: blob:");
    expect((await fetch(`${base}/assets/app.js`)).headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${base}/..%2f..%2fetc%2fpasswd`)).status).not.toBe(500);
  });

  const api = (op: string, body: object, cookie = '', origin = base) =>
    fetch(`${base}/api/auth/${op}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie },
      body: JSON.stringify(body),
    });
  const cookiesOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

  it('publishes the sign-in configuration', async () => {
    expect(await (await fetch(`${base}/api/config`)).json()).toEqual({
      edgeUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/),
      workosClientId: 'client_x',
      workosApiBase: 'https://api.workos.com',
      redirectUri: null,
      showMockHarness: false,
    });
  });

  it('signs in: exchange, auto-select the only workspace, keep the refresh token httpOnly', async () => {
    const signedIn = await api('exchange', { code: 'good-code' });
    expect(signedIn.status).toBe(200);
    const body = await signedIn.json();
    expect(body).toMatchObject({ orgId: 'org_demo', user: { email: 'demo@example.com', name: 'Demo User' } });
    expect(body.refreshToken).toBeUndefined();
    const raw = signedIn.headers.getSetCookie();
    expect(raw.find((c) => c.startsWith('zw_refresh='))).toMatch(/HttpOnly; SameSite=Strict/);

    const first = await api('refresh', {}, cookiesOf(signedIn));
    expect((await first.json()).orgId).toBe('org_demo');
    expect(cookiesOf(first)).not.toBe(cookiesOf(signedIn));
  });

  it('shares one edge refresh between concurrent requests with the same cookie', async () => {
    const signedIn = await api('exchange', { code: 'good-code' });
    const cookie = cookiesOf(signedIn);
    const before = edge.calls.filter((c) => c === 'POST /auth/refresh').length;
    const [a, b] = await Promise.all([api('refresh', {}, cookie), api('refresh', {}, cookie)]);
    expect((await a.json()).accessToken).toBe((await b.json()).accessToken);
    expect(edge.calls.filter((c) => c === 'POST /auth/refresh').length - before).toBe(1);
  });

  it('refuses cross-origin and non-JSON posts, answers no session plainly', async () => {
    expect((await api('exchange', { code: 'good-code' }, '', 'https://evil.example')).status).toBe(403);
    const form = await fetch(`${base}/api/auth/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: base },
      body: 'code=good-code',
    });
    expect(form.status).toBe(415);
    expect(await (await api('refresh', {})).json()).toMatchObject({ signedOut: true });
    expect((await api('org', { organizationId: 'org_demo' })).status).toBe(401);
    expect((await api('exchange', { code: 'bad' })).status).toBe(401);
  });

  it('signs out by clearing the cookies, and a rejected refresh token ends the session', async () => {
    const out = await api('logout', {});
    expect(out.headers.getSetCookie().every((c) => c.includes('Max-Age=0'))).toBe(true);
    const dead = await api('refresh', {}, 'zw_refresh=r-invalid; zw_org=org_demo');
    expect(dead.status).toBe(401);
    expect(dead.headers.getSetCookie().some((c) => c.startsWith('zw_refresh=;'))).toBe(true);
  });
});
