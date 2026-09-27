import { edgeSocketUrl } from '@/edge/url';

const PRESENCE_FRESH_MS = 45_000;
const PING_INTERVAL_MS = 15_000;
const HELLO_DEADLINE_MS = 15_000;
const BACKOFF_BASE_MS = 250;
const BACKOFF_CAP_MS = 16_000;

export interface EngineDevice {
  id: string;
  name: string;
  lastSeenAt: number | null;
}

interface Row {
  kind: string;
  id: string;
  deleted: boolean;
  fields: Record<string, unknown>;
}

export interface PresenceSnapshot {
  devices: EngineDevice[];
  beats: Record<string, number>;
  synced: boolean;
}

export function deviceFromRow(row: Row): EngineDevice | null {
  if (row.kind !== 'devices' || row.deleted) return null;
  const f = row.fields;
  const id = typeof f.id === 'string' ? f.id : row.id;
  return {
    id,
    name: typeof f.name === 'string' ? f.name : id,
    lastSeenAt: typeof f.lastSeenAt === 'number' ? f.lastSeenAt : null,
  };
}

export function registryUrl(edgeUrl: string, orgId: string, token: string, device: string): string {
  return edgeSocketUrl(edgeUrl, `registry/${encodeURIComponent(orgId)}/ws`, { token, device });
}

export class PresenceWatcher {
  snapshot: PresenceSnapshot = { devices: [], beats: {}, synced: false };
  private rows = new Map<string, Row>();
  private ws: WebSocket | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private backoff = BACKOFF_BASE_MS;
  private stopped = false;
  private listeners = new Set<() => void>();

  constructor(
    private url: () => Promise<string | null>,
    private device: string,
    private WebSocketImpl: typeof WebSocket = WebSocket,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isOnline(deviceId: string): boolean {
    const beat = this.snapshot.beats[deviceId];
    return beat !== undefined && Date.now() - beat < PRESENCE_FRESH_MS;
  }

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private emit() {
    const devices = [...this.rows.values()]
      .map(deviceFromRow)
      .filter((d): d is EngineDevice => d !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    this.snapshot = { ...this.snapshot, devices };
    for (const listener of this.listeners) listener();
  }

  private async connect() {
    if (this.stopped) return;
    const url = await this.url().catch(() => null);
    if (this.stopped) return;
    if (!url) return this.retry();
    const ws = new this.WebSocketImpl(url);
    this.ws = ws;
    let joined = false;
    const deadline = setTimeout(() => !joined && ws.close(), HELLO_DEADLINE_MS);
    this.timers.push(deadline);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', cursor: null, device: this.device }));
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data === 'pong') return;
      let frame: any;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (frame.t === 'state') {
        joined = true;
        this.backoff = BACKOFF_BASE_MS;
        this.rows.clear();
        for (const row of frame.rows ?? []) this.rows.set(`${row.kind}/${row.id}`, row);
        const beats: Record<string, number> = {};
        const now = Date.now();
        for (const [device, at] of Object.entries(frame.presence ?? {})) {
          if (typeof at === 'number') beats[device] = Math.min(at, now);
        }
        this.snapshot = { ...this.snapshot, beats, synced: true };
        this.emit();
        this.schedulePing(ws);
      } else if (frame.t === 'rows') {
        for (const row of frame.rows ?? []) this.rows.set(`${row.kind}/${row.id}`, row);
        this.emit();
      } else if (frame.t === 'presence' && typeof frame.device === 'string') {
        this.snapshot = { ...this.snapshot, beats: { ...this.snapshot.beats, [frame.device]: Date.now() } };
        this.emit();
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      this.retry();
    };
  }

  private schedulePing(ws: WebSocket) {
    const tick = setTimeout(() => {
      if (this.ws !== ws || ws.readyState !== 1) return;
      ws.send('ping');
      this.schedulePing(ws);
    }, PING_INTERVAL_MS);
    this.timers.push(tick);
  }

  private retry() {
    if (this.stopped) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, BACKOFF_CAP_MS);
    this.timers.push(setTimeout(() => void this.connect(), delay));
  }
}
