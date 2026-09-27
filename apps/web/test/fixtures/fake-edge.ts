import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

type Org = { organizationId: string; name: string };
type Device = { id: string; name: string; platform?: string; engineUrl?: string; online?: boolean };
type User = { id: string; email: string; firstName?: string; lastName?: string };
type Claims = { sub: string; org_id?: string };

const RELAY_KIND = ' relay';

function encodeFrame(header: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const head = Buffer.from(header);
  const len: number[] = [];
  let n = head.length;
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n) byte |= 0x80;
    len.push(byte);
  } while (n);
  return Buffer.concat([Buffer.from(len), head, payload]);
}

function decodeFrame(buf: Buffer): { header: { k?: string }; payload: Buffer } {
  let offset = 0;
  let length = 0;
  let shift = 0;
  for (;;) {
    const byte = buf[offset++];
    length |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7;
  }
  return { header: JSON.parse(buf.subarray(offset, offset + length).toString()), payload: buf.subarray(offset + length) };
}

function fakeJwt(claims: Claims, ttlSeconds = 300): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds })}.sig`;
}

function claimsOf(token: string): Claims | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function bearer(req: http.IncomingMessage, url: URL): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return url.searchParams.get('token');
}

function readBody(req: http.IncomingMessage): Promise<Record<string, string | undefined>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

export function createFakeEdge(options: { orgs?: Org[]; devices?: Device[]; user?: User } = {}) {
  const user = options.user ?? { id: 'user_demo', email: 'demo@example.com', firstName: 'Demo', lastName: 'User' };
  const orgs = options.orgs ?? [{ organizationId: 'org_demo', name: 'Demo' }];
  const devices = options.devices ?? [];
  let refreshCounter = 0;
  const calls: string[] = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://edge');
    calls.push(`${req.method} ${url.pathname}`);
    if (req.method === 'POST' && url.pathname === '/auth/exchange') {
      const { code } = await readBody(req);
      if (code !== 'good-code') return json(res, 401, { error: 'invalid code' });
      return json(res, 200, { user, accessToken: fakeJwt({ sub: user.id }), refreshToken: `r${++refreshCounter}` });
    }
    if (req.method === 'POST' && url.pathname === '/auth/refresh') {
      const { refreshToken, organizationId } = await readBody(req);
      if (!/^r\d+$/.test(refreshToken ?? '')) return json(res, 401, { error: 'invalid refresh token' });
      if (organizationId && !orgs.some((o) => o.organizationId === organizationId)) {
        return json(res, 401, { error: 'not a member' });
      }
      const claims = organizationId ? { sub: user.id, org_id: organizationId } : { sub: user.id };
      return json(res, 200, { accessToken: fakeJwt(claims), refreshToken: `r${++refreshCounter}` });
    }
    if (url.pathname === '/auth/orgs') {
      if (!claimsOf(bearer(req, url) ?? '')) return json(res, 401, { error: 'invalid or missing bearer token' });
      return json(res, 200, { orgs: orgs.map((o, i) => ({ id: `om_${i}`, ...o })) });
    }
    json(res, 404, { error: 'not_found' });
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://edge');
    const claims = claimsOf(bearer(req, url) ?? '');
    if (!claims) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }
    const registry = url.pathname.match(/^\/registry\/([^/]+)\/ws$/);
    if (registry) {
      if (claims.org_id !== registry[1]) {
        socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => serveRegistry(ws));
      return;
    }
    const device = url.pathname.match(/^\/device\/([^/]+)\/ws$/);
    if (device) {
      wss.handleUpgrade(req, socket, head, (ws) => serveRelay(ws, device[1], url.searchParams.get('connId') ?? 'c'));
      return;
    }
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
  });

  function serveRegistry(ws: WebSocket) {
    ws.on('message', (data) => {
      const text = data.toString();
      if (text === 'ping') return ws.send('pong');
      const frame = JSON.parse(text);
      if (frame.t !== 'hello') return;
      const now = Date.now();
      ws.send(
        JSON.stringify({
          t: 'state',
          seq: 1,
          full: true,
          gcFloor: 0,
          rows: devices.map((d) => ({
            kind: 'devices',
            id: d.id,
            seq: 1,
            deleted: false,
            fields: { id: d.id, name: d.name, platform: d.platform ?? 'linux', lastSeenAt: now - 5_000 },
            clocks: {},
          })),
          presence: Object.fromEntries(devices.filter((d) => d.online !== false).map((d) => [d.id, now - 1_000])),
        }),
      );
    });
  }

  function serveRelay(client: WebSocket, deviceId: string, connId: string) {
    const host = devices.find((d) => d.id === deviceId);
    if (!host?.engineUrl || host.online === false) {
      client.send(encodeFrame(`{"s":"relay","k":"${RELAY_KIND}"}`, Buffer.from('{"error":"host_offline"}')));
      return;
    }
    const engine = new WebSocket(host.engineUrl);
    const backlog: string[] = [];
    engine.on('open', () => backlog.splice(0).forEach((m) => engine.send(m)));
    engine.on('message', (data) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(encodeFrame(`{"s":"rpc","k":"rpc","to":"${connId}"}`, Buffer.from(data.toString())));
      }
    });
    engine.on('close', () => client.close());
    engine.on('error', () => client.close());
    client.on('message', (data, isBinary) => {
      if (!isBinary) return client.send('pong');
      const { header, payload } = decodeFrame(Buffer.from(data as Buffer));
      if (header.k === 'echo') client.send(encodeFrame(`{"s":"echo","k":"echo","to":"${connId}"}`));
      else if (header.k === 'rpc') {
        const text = payload.toString();
        if (engine.readyState === WebSocket.OPEN) engine.send(text);
        else backlog.push(text);
      }
    });
    client.on('close', () => engine.close());
  }

  return {
    server,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of wss.clients) c.terminate();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [port = '4700', ...specs] = process.argv.slice(2);
  const devices = specs.map((spec) => {
    const [who, engineUrl] = spec.split('=');
    const [id, name = id] = who.split(':');
    return { id, name, engineUrl, online: Boolean(engineUrl) };
  });
  const edge = createFakeEdge({ devices });
  edge.server.listen(Number(port), '127.0.0.1', () => console.log(`fake edge on http://127.0.0.1:${port}`));
}
