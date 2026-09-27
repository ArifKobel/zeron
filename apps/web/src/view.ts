import type { Chat, Session, ToolCall } from '@/types';
import { basename } from '@/util';

const SESSION_STALE_MS = 45_000;

type Indicator = 'none' | 'working' | 'awaitingInput' | 'errored';
export type ChatIndicator = 'working' | 'awaitingInput' | 'errored' | 'completed' | 'idle';

const ms = (iso: string) => Date.parse(iso);

export function effectiveIndicator(session: Session | undefined, now: number): Indicator {
  if (!session) return 'none';
  switch (session.status) {
    case 'idle':
      return 'none';
    case 'errored':
      return 'errored';
    case 'working':
    case 'awaitingInput':
      if (now - ms(session.updatedAt) > SESSION_STALE_MS) return 'none';
      return session.status;
  }
}

function unseen(chat: Chat): boolean {
  if (!chat.lastMessageAt) return false;
  if (!chat.lastSeenAt) return true;
  return ms(chat.lastMessageAt) > ms(chat.lastSeenAt);
}

export function displayStatus(chat: Chat, session: Session | undefined, now: number): ChatIndicator {
  const live = session && effectiveIndicator(session, now) !== 'none' ? session.status : undefined;
  if (live === 'working') return 'working';
  if (live === 'awaitingInput') return 'awaitingInput';
  if (live === 'errored' && unseen(chat)) return 'errored';
  if (unseen(chat)) return 'completed';
  return 'idle';
}

export function lastActivity(chat: Chat): number {
  return ms(chat.lastMessageAt ?? chat.createdAt);
}

export function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    const ka = lastActivity(a);
    const kb = lastActivity(b);
    if (ka !== kb) return kb - ka;
    const ca = ms(a.createdAt);
    const cb = ms(b.createdAt);
    if (ca !== cb) return cb - ca;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function formatTimeAgo(then: number, now: number): string {
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

export function projectLabel(cwd: string | null | undefined): string {
  const trimmed = cwd?.trim();
  if (!trimmed || trimmed === '~' || trimmed === '~/') return 'No project';
  return basename(trimmed);
}

export function singleLine(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ');
}

export function toolChipContent(call: ToolCall): { label: string; detail: string } {
  const [label, detail] = toolChipContentRaw(call);
  return { label, detail: singleLine(detail) };
}

function toolChipContentRaw(call: ToolCall): [string, string] {
  switch (call.kind) {
    case 'exec':
      return ['Run', call.command];
    case 'readFile':
      return ['Read', call.path];
    case 'writeFile':
      return ['Write', call.path];
    case 'editFile':
      return ['Edit', call.path];
    case 'applyPatch':
      return ['Patch', call.path ?? 'workspace'];
    case 'search':
      return ['Search', call.path ? `${call.pattern} in ${call.path}` : call.pattern];
    case 'glob':
      return ['Glob', call.pattern];
    case 'webFetch':
      return ['Fetch', call.url];
    case 'webSearch':
      return ['Web', call.query];
    case 'todo': {
      const done = call.items.filter((i) => i.done).length;
      return ['Todo', `${done}/${call.items.length} done`];
    }
    case 'mcp':
      return ['MCP', `${call.server} · ${call.tool}`];
    case 'unknown':
      if (call.name.startsWith('Agent: ')) return ['Agent', call.name.slice('Agent: '.length)];
      if (call.name === 'Agent') return ['Agent', ''];
      return ['Tool', call.name];
    default:
      return ['Tool', ''];
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function toolGroupSummary(tools: { call: ToolCall; isError: boolean }[]): string {
  let commands = 0;
  const edited = new Set<string>();
  let reads = 0;
  let searches = 0;
  let fetches = 0;
  let todos = 0;
  let other = 0;
  let failed = 0;
  for (const { call, isError } of tools) {
    if (isError) failed++;
    switch (call.kind) {
      case 'exec':
        commands++;
        break;
      case 'writeFile':
      case 'editFile':
        edited.add(call.path);
        break;
      case 'applyPatch':
        edited.add(call.path ?? 'patch');
        break;
      case 'readFile':
        reads++;
        break;
      case 'search':
      case 'glob':
      case 'webSearch':
        searches++;
        break;
      case 'webFetch':
        fetches++;
        break;
      case 'todo':
        todos++;
        break;
      default:
        other++;
    }
  }
  const segments: string[] = [];
  if (commands) segments.push(`ran ${plural(commands, 'command', 'commands')}`);
  if (edited.size) segments.push(`edited ${plural(edited.size, 'file', 'files')}`);
  if (reads) segments.push(`read ${plural(reads, 'file', 'files')}`);
  if (searches) segments.push(`searched ${plural(searches, 'time', 'times')}`);
  if (fetches) segments.push(`fetched ${plural(fetches, 'page', 'pages')}`);
  if (todos) segments.push('updated todos');
  if (other) segments.push(`called ${plural(other, 'tool', 'tools')}`);
  if (!segments.length) segments.push(plural(tools.length, 'tool', 'tools'));
  if (failed) segments.push(`${failed} failed`);
  const summary = segments.join(' · ');
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

export function activitySummary(tools: { call: ToolCall; isError: boolean }[], thoughts: number): string {
  const segments: string[] = [];
  if (thoughts === 1) segments.push('thought process');
  else if (thoughts > 1) segments.push(`thought ${thoughts} times`);
  if (tools.length) segments.push(toolGroupSummary(tools));
  const summary = segments.join(' · ');
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}
