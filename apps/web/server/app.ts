import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

type Api = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean>;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function securityHeaders(connectSrc: string[]): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
      `connect-src 'self' ${connectSrc.join(' ')}; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  };
}

export function createWebServer({ distDir, connectSrc, api }: { distDir: string; connectSrc: string[]; api: Api }) {
  const root = path.resolve(distDir);
  const headers = securityHeaders(connectSrc);

  const server = http.createServer(async (req, res) => {
    if (await api(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    serveStatic(root, new URL(req.url ?? '/', 'http://web').pathname, req, res, headers);
  });

  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return { server, close };
}

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

function serveStatic(
  root: string,
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  headers: Record<string, string>,
) {
  let file: string;
  try {
    file = path.resolve(root, '.' + decodeURIComponent(pathname));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!isFile(file)) {
    if (pathname.startsWith('/assets/')) {
      res.writeHead(404, headers).end();
      return;
    }
    file = path.join(root, 'index.html');
    if (!isFile(file)) {
      res.writeHead(503, { 'content-type': 'text/plain' }).end('Not built yet: run `npm run build`.');
      return;
    }
  }
  const hashed = file.startsWith(path.join(root, 'assets') + path.sep);
  res.writeHead(200, {
    ...headers,
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
}
