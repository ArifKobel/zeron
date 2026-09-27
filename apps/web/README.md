# Zeron Web

A browser client for Zeron with the iOS app's features and, on phones, its look. Sign in with
your Zeron account, then from any browser:

- **Home**: every session, or only one project's, pinned first then by activity, with status
  (Working, Input, Failed, Done), branch, pull request badge, and send state. Swipe or
  right-click to pin or archive. The archived shelf pages below.
- **Projects**: create one by browsing a device's folders; each project lists its own sessions.
- **Sessions**: a live transcript (markdown, tool activity with per-tool rows and copy, images
  and appshots, questions and errors). The composer sends, queues while a turn runs, stops, and
  attaches images. Chips switch the model, effort and model options. The queue can edit (under
  the host's lease), send now, reorder, and remove. Agent questions are answered in place. A
  status strip shows delivery, reconnects and the working clock.
- **New sessions**: in a project (current checkout, an existing worktree, or a new worktree off
  any ref; plain refs are checked out on the device) or without a project on a chosen device.
  The harness, model and effort picks are remembered.

Wide screens show the session list beside the open screen. Terminal, diff and file views are
desktop-only.

## How it reaches your agents

The browser reaches engines through the edge (`wss://edge.zeron.sh`):

- **Registry presence** (`/registry/{orgId}/ws`, read-only) shows which of the account's
  engines are online.
- **Device relay** (`/device/{id}/ws`, the relay the iOS app uses for host RPCs) connects to
  one online engine, the *gateway*, and speaks the ordinary engine RPC to it.

Every engine in a synced workspace serves its full RPC surface to relay clients of the same
account, and each can read the whole registry and any chat. So one reachable device is enough:
calls about chats hosted elsewhere carry `targetDeviceId`, and the gateway forwards them, exactly
as it does for its own desktop UI. The gateway is picked automatically (freshest online device)
or pinned under the account menu. When its host leg dies, the next dial moves to another device.

At least one of your devices must be online. Agents only run on online devices anyway.

## Run

Needs Node 22.18 or newer: the server is TypeScript that Node runs directly.

```bash
npm install
npm run build
npm start          # http://127.0.0.1:4600
```

Configuration is environment-only:

| Variable | Default | |
| --- | --- | --- |
| `HOST`, `PORT` | `127.0.0.1`, `4600` | listen address |
| `ZERON_EDGE_URL` | `https://edge.zeron.sh` | edge worker |
| `ZERON_WORKOS_CLIENT_ID`, `ZERON_WORKOS_API_BASE` | Zeron's | WorkOS AuthKit |
| `ZERON_WEB_REDIRECT_URI` | none | a WorkOS redirect URI registered for this deployment, ending in `/auth/callback` |
| `ZERON_HARNESS=mock` | off | offer the mock harness, like the desktop's dev switch |
| `ALLOWED_ORIGINS` | none | extra browser origins allowed to call `/api` |

For frontend work, run `npm start` and `npm run dev` side by side. Vite proxies `/api` to the
server at `ZERON_WEB_SERVER` (default `http://127.0.0.1:4600`).

## Signing in

WorkOS only redirects to registered URIs. Without `ZERON_WEB_REDIRECT_URI`, sign-in uses the
same flow as `zeron login`: AuthKit opens in a new tab, the edge's `/auth/cli/callback` page
shows `state.code`, and the user pastes it back. The tab checks `state` before exchanging the
code. With a registered URI, WorkOS returns to `/auth/callback` and no paste is needed.

The edge sends no CORS headers, so the code exchange and token refresh go through this server's
`/api/auth/*`. The WorkOS refresh token
stays in an `HttpOnly; SameSite=Strict` cookie. Page script only holds the short-lived access
token that edge WebSockets need (`?token=`, since browsers can't set headers on sockets). Refresh
tokens rotate on use, so concurrent refreshes of one cookie share a single edge call.

## Security

- The server only serves files, `/api/config` and `/api/auth`. Engine traffic goes from the browser to the edge,
  which authenticates every socket, so a signed-in tab can do exactly what the account can.
- `/api/auth/*` accepts only same-origin JSON POSTs (CSRF), and the session cookie is
  `SameSite=Strict`.
- Pages are served with a strict CSP. `connect-src` allows only the page's own origin and the
  edge. Transcript markdown is sanitized with DOMPurify.

## Layout

| Path | |
| --- | --- |
| `server/main.ts` | entry point and configuration |
| `server/app.ts` | static host with security headers |
| `server/auth.ts` | `/api/config` and the `/api/auth/*` proxy to the edge |
| `src/session.tsx` | startup: resume the account session or show sign-in |
| `src/edge/` | account session, registry presence, gateway choice, relay transport |
| `src/rpc.ts` | engine RPC client over any text-frame socket |
| `src/actions.ts` | writes: run, queue, steer, interrupt, answer, create chats and projects, pins, checkout |
| `src/catalog.ts` | harness and model catalogs of a device, and the pick rules for model, effort and options |
| `src/attachments.ts` | image staging, chunked upload, the prompt trailer, appshots, reading images back |
| `src/sends.ts`, `src/pins.ts`, `src/changeRequest.ts`, `src/connectivity.ts` | in-flight sends, pins, pull requests, connection and presence state |
| `src/view.ts` | port of `crates/proto/src/view.rs` (status, ordering, time, tool summaries) |
| `src/transcript.ts` | port of `apply_transcript_frame`, continuation folding |
| `src/route.ts` | the navigation stack (Home → Project → Session, New session) |
| `src/components/` | one folder per screen: `home`, `session`, `transcript`, `composer`, `new-session` |
| `src/ui/` | sheet, menu, loaders, brand marks, swipe and context-menu gestures |
| `src/styles/` | the iOS theme, one file per area |
| `test/` | Vitest suites (offline) and `fixtures/fake-edge.ts`, a stand-in edge for tests and manual runs |

## Tests

```bash
npm run typecheck
npm test
```

To try it end to end without a real account, run an isolated engine with the mock harness, a
fake edge that relays to it, and the server against the fake edge:

```bash
ZERON_DATA_DIR=/tmp/zeron-dev ZERON_IPC_PORT=27700 ZERON_HARNESS=mock zeron headless
node test/fixtures/fake-edge.ts 4700 "<engine device id>:studio=ws://127.0.0.1:27700"
ZERON_EDGE_URL=http://127.0.0.1:4700 ZERON_HARNESS=mock PORT=4602 npm start
```

The fake edge accepts the code `good-code`. To sign in, paste `<state>.good-code`, where
`<state>` is the `state` parameter of the sign-in URL.

## Not yet

- Reading chats while every device is offline. That needs the chat2 and registry sync protocols
  (Loro in the browser), as in the iOS app.
