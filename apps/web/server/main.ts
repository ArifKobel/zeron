import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWebServer } from '#server/app.ts';
import { createApi } from '#server/auth.ts';

const env = process.env;
const host = env.HOST || '127.0.0.1';
const port = Number(env.PORT || 4600);
const edgeUrl = env.ZERON_EDGE_URL || 'https://edge.zeron.sh';
const extraOrigins = (env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const edgeSocketOrigin = new URL(edgeUrl);
edgeSocketOrigin.protocol = edgeSocketOrigin.protocol === 'http:' ? 'ws:' : 'wss:';

const { server, close } = createWebServer({
  distDir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'),
  connectSrc: [edgeSocketOrigin.origin],
  api: createApi({
    edgeUrl,
    workosClientId: env.ZERON_WORKOS_CLIENT_ID || 'client_01KWD0EAKZKD50YCQJNYSRE4BY',
    workosApiBase: env.ZERON_WORKOS_API_BASE || 'https://api.workos.com',
    redirectUri: env.ZERON_WEB_REDIRECT_URI || null,
    showMockHarness: env.ZERON_HARNESS?.trim() === 'mock',
    extraOrigins,
  }),
});

server.listen(port, host, () => {
  console.log(`zeron-web: http://${host}:${port} (edge: ${edgeUrl})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => close().then(() => process.exit(0)));
}
