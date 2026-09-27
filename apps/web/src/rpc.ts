type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type Stream = { onItem: (item: any) => void; onEnd: (end: StreamEnd) => void };

type ConnectionState = 'connecting' | 'open' | 'closed';

export type StreamEnd = { kind: 'done' } | { kind: 'error'; message: string } | { kind: 'disconnected' };

interface ServerFrame {
  id: number;
  ok?: unknown;
  err?: string;
  item?: unknown;
  done?: boolean;
}

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: any) => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
  onclose: ((ev: any) => void) | null;
}

const OPEN = 1;
const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 8000;

export class RpcError extends Error {
  constructor(
    readonly method: string,
    readonly reason: string,
  ) {
    super(`${method}: ${reason}`);
  }
}

export function isUnknownMethod(message: string): boolean {
  return message.startsWith('unknown method');
}

export class RpcClient {
  private socket: SocketLike | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private streams = new Map<number, Stream>();
  private outbox: string[] = [];
  private retryMs = RETRY_MIN_MS;
  private listeners = new Set<() => void>();
  state: ConnectionState = 'connecting';
  epoch = 0;

  constructor(private openSocket: () => SocketLike) {
    this.connect();
  }

  private connect() {
    this.setState('connecting');
    const socket = this.openSocket();
    this.socket = socket;
    socket.onopen = () => {
      this.retryMs = RETRY_MIN_MS;
      this.epoch += 1;
      for (const frame of this.outbox.splice(0)) socket.send(frame);
      this.setState('open');
    };
    socket.onmessage = (ev) => {
      for (const line of String(ev.data).split('\n')) {
        if (!line.trim()) continue;
        try {
          this.dispatch(JSON.parse(line));
        } catch {
        }
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.outbox = [];
      for (const p of this.pending.values()) p.reject(new Error('connection to the engine closed'));
      this.pending.clear();
      const streams = [...this.streams.values()];
      this.streams.clear();
      for (const s of streams) s.onEnd({ kind: 'disconnected' });
      this.setState('closed');
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
    };
  }

  private setState(state: ConnectionState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  reconnect() {
    this.retryMs = RETRY_MIN_MS;
    this.socket?.close();
  }

  onStateChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dispatch(frame: ServerFrame) {
    const pending = this.pending.get(frame.id);
    if (pending) {
      this.pending.delete(frame.id);
      if (frame.err !== undefined) pending.reject(new Error(frame.err));
      else if (frame.item !== undefined) {
        pending.resolve(frame.item);
        this.send({ id: frame.id, cancel: true });
      } else pending.resolve(frame.ok ?? null);
      return;
    }
    const stream = this.streams.get(frame.id);
    if (!stream) return;
    if (frame.item !== undefined) stream.onItem(frame.item);
    else if (frame.err !== undefined) {
      this.streams.delete(frame.id);
      stream.onEnd({ kind: 'error', message: frame.err });
    } else if (frame.done) {
      this.streams.delete(frame.id);
      stream.onEnd({ kind: 'done' });
    }
  }

  private send(frame: object) {
    const text = JSON.stringify(frame);
    if (this.socket?.readyState === OPEN) this.socket.send(text);
    else this.outbox.push(text);
  }

  call<T = unknown>(method: string, params: object = {}, timeoutMs = 60_000): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new RpcError(method, 'timed out'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(new RpcError(method, error.message));
        },
      });
      this.send({ id, method, params });
    });
  }

  subscribe<T = unknown>(
    method: string,
    params: object,
    onItem: (item: T) => void,
    onEnd: (end: StreamEnd) => void = () => {},
  ): () => void {
    const id = this.nextId++;
    this.streams.set(id, { onItem, onEnd });
    this.send({ id, method, params });
    return () => {
      if (this.streams.delete(id)) this.send({ id, cancel: true });
    };
  }
}
