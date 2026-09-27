import { edgeSocketUrl } from '@/edge/url';
import type { SocketLike } from '@/rpc';
import { uuid } from '@/uuid';

const RPC_KIND = 'rpc';
const RELAY_KIND = ' relay';
const ECHO_KIND = 'echo';

const RPC_HEADER = '{"s":"rpc","k":"rpc"}';
const ECHO_HEADER = '{"s":"echo","k":"echo"}';

const PING_INTERVAL_MS = 10_000;
const SILENCE_LEASE_MS = 25_000;
const ECHO_DEADLINE_MS = 20_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface FrameHeader {
  s?: string;
  k?: string;
  to?: string;
  from?: string;
}

export function encodeFrame(header: string, payload: Uint8Array = new Uint8Array()): Uint8Array<ArrayBuffer> {
  const head = encoder.encode(header);
  const len: number[] = [];
  let n = head.length;
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) byte |= 0x80;
    len.push(byte);
  } while (n !== 0);
  const out = new Uint8Array(len.length + head.length + payload.length);
  out.set(len, 0);
  out.set(head, len.length);
  out.set(payload, len.length + head.length);
  return out;
}

export function decodeFrame(data: Uint8Array): { header: FrameHeader; payload: Uint8Array } | null {
  let offset = 0;
  let length = 0;
  let shift = 0;
  for (;;) {
    if (offset >= data.length) return null;
    const byte = data[offset++];
    length |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 28) return null;
  }
  if (offset + length > data.length) return null;
  let header: FrameHeader;
  try {
    header = JSON.parse(decoder.decode(data.subarray(offset, offset + length)));
  } catch {
    return null;
  }
  if (typeof header !== 'object' || header === null) return null;
  return { header, payload: data.subarray(offset + length) };
}

export function relayUrl(edgeUrl: string, deviceId: string, token: string): string {
  return edgeSocketUrl(edgeUrl, `device/${encodeURIComponent(deviceId)}/ws`, {
    role: 'client',
    connId: uuid(),
    token,
  });
}

export type RelayCloseReason = 'host_offline' | 'host_closed' | 'silent' | 'echo_timeout' | 'socket_closed' | 'no_token';

export class RelaySocket implements SocketLike {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { reason: RelayCloseReason }) => void) | null = null;

  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastInbound = Date.now();
  private lastHostProof = Date.now();
  private echoSeen = false;
  private closed = false;

  constructor(
    url: () => Promise<string | null>,
    private onLinkDown: (reason: RelayCloseReason) => void = () => {},
    WebSocketImpl: typeof WebSocket = WebSocket,
  ) {
    url().then(
      (resolved) => {
        if (this.closed) return;
        if (!resolved) return this.finish('no_token');
        this.open(new WebSocketImpl(resolved));
      },
      () => this.finish('no_token'),
    );
  }

  private open(ws: WebSocket) {
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      this.readyState = 1;
      this.lastInbound = this.lastHostProof = Date.now();
      this.sendRaw(encodeFrame(ECHO_HEADER));
      this.timer = setInterval(() => this.keepalive(), PING_INTERVAL_MS);
      this.onopen?.({});
    };
    ws.onmessage = (ev) => {
      this.lastInbound = Date.now();
      if (typeof ev.data === 'string') return;
      const frame = decodeFrame(new Uint8Array(ev.data as ArrayBuffer));
      if (!frame) return;
      switch (frame.header.k) {
        case RPC_KIND:
          this.lastHostProof = Date.now();
          this.echoSeen = true;
          this.onmessage?.({ data: decoder.decode(frame.payload) });
          break;
        case ECHO_KIND:
          this.lastHostProof = Date.now();
          this.echoSeen = true;
          break;
        case RELAY_KIND: {
          let code: RelayCloseReason = 'host_offline';
          try {
            const body = JSON.parse(decoder.decode(frame.payload));
            if (body?.error === 'host_closed') code = 'host_closed';
          } catch {
          }
          this.finish(code);
          break;
        }
      }
    };
    ws.onclose = () => this.finish('socket_closed');
    ws.onerror = () => this.finish('socket_closed');
  }

  private keepalive() {
    const now = Date.now();
    if (now - this.lastInbound > SILENCE_LEASE_MS) return this.finish('silent');
    if (this.echoSeen && now - this.lastHostProof > ECHO_DEADLINE_MS) return this.finish('echo_timeout');
    this.ws?.send('ping');
    this.sendRaw(encodeFrame(ECHO_HEADER));
  }

  private sendRaw(frame: Uint8Array<ArrayBuffer>) {
    if (this.ws?.readyState === 1) this.ws.send(frame);
  }

  send(data: string) {
    this.sendRaw(encodeFrame(RPC_HEADER, encoder.encode(data)));
  }

  close() {
    this.finish('socket_closed');
  }

  private finish(reason: RelayCloseReason) {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    clearInterval(this.timer);
    if (this.ws) {
      this.ws.onclose = this.ws.onmessage = this.ws.onerror = this.ws.onopen = null;
      if (this.ws.readyState <= 1) this.ws.close();
    }
    this.onLinkDown(reason);
    this.onclose?.({ reason });
  }
}
