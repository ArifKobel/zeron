import { describe, expect, it, vi } from 'vitest';
import { decodeFrame, encodeFrame, RelaySocket, relayUrl } from '@/edge/relay';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('device frame codec (crates/rpc/src/device_room.rs vectors)', () => {
  it('is byte-identical to the Rust encoder', () => {
    const frame = encodeFrame('{"s":"a","k":"rpc"}', new Uint8Array([1, 2]));
    const json = bytes('{"s":"a","k":"rpc"}');
    expect(frame[0]).toBe(json.length);
    expect([...frame.subarray(1, 1 + json.length)]).toEqual([...json]);
    expect([...frame.subarray(1 + json.length)]).toEqual([1, 2]);
  });

  it('uses a multi-byte length for long headers', () => {
    const header = JSON.stringify({ s: 'x'.repeat(200), k: 'rpc' });
    const frame = encodeFrame(header);
    expect(frame[0]).toBe((header.length & 0x7f) | 0x80);
    expect(frame[1]).toBe(header.length >> 7);
    expect(decodeFrame(frame)?.header).toEqual({ s: 'x'.repeat(200), k: 'rpc' });
  });

  it('rejects malformed frames', () => {
    expect(decodeFrame(new Uint8Array([]))).toBeNull();
    expect(decodeFrame(new Uint8Array([0x85]))).toBeNull();
    expect(decodeFrame(new Uint8Array([10, 0x7b]))).toBeNull();
    expect(decodeFrame(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0x01]))).toBeNull();
    const valid = new Uint8Array([17, ...bytes('{"s":"a","k":"b"}'), 9]);
    const decoded = decodeFrame(valid);
    expect(decoded?.header).toEqual({ s: 'a', k: 'b' });
    expect([...(decoded?.payload ?? [])]).toEqual([9]);
  });

  it('dials the device room as a client with a fresh connId', () => {
    const url = new URL(relayUrl('https://edge.example', 'dev-1', 'tok'));
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe('/device/dev-1/ws');
    expect(url.searchParams.get('role')).toBe('client');
    expect(url.searchParams.get('token')).toBe('tok');
    expect(url.searchParams.get('connId')).not.toBe(new URL(relayUrl('https://edge.example', 'dev-1', 'tok')).searchParams.get('connId'));
  });
});

class FakeWebSocket {
  static last: FakeWebSocket;
  readyState = 0;
  binaryType = '';
  sent: (string | Uint8Array)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.last = this;
  }
  send(data: string | Uint8Array) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(frame: Uint8Array) {
    this.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('RelaySocket', () => {
  it('wraps rpc text in frames, unwraps host replies, and echoes on open', async () => {
    const socket = new RelaySocket(async () => 'wss://edge/device/d/ws', () => {}, FakeWebSocket as unknown as typeof WebSocket);
    const received: string[] = [];
    socket.onmessage = (ev) => received.push(ev.data);
    const opened = vi.fn();
    socket.onopen = opened;
    await tick();
    const ws = FakeWebSocket.last;
    ws.open();
    expect(opened).toHaveBeenCalled();
    expect(decodeFrame(ws.sent[0] as Uint8Array)?.header).toEqual({ s: 'echo', k: 'echo' });

    socket.send('{"id":1,"method":"LocalDevice","params":{}}');
    const out = decodeFrame(ws.sent[1] as Uint8Array)!;
    expect(out.header).toEqual({ s: 'rpc', k: 'rpc' });
    expect(new TextDecoder().decode(out.payload)).toBe('{"id":1,"method":"LocalDevice","params":{}}');

    ws.receive(encodeFrame('{"s":"rpc","k":"rpc","to":"c1"}', bytes('{"id":1,"ok":{"deviceId":"d"}}')));
    expect(received).toEqual(['{"id":1,"ok":{"deviceId":"d"}}']);
  });

  it('reports host_offline control frames and closes', async () => {
    const down = vi.fn();
    const socket = new RelaySocket(async () => 'wss://x', down, FakeWebSocket as unknown as typeof WebSocket);
    const closed = vi.fn();
    socket.onclose = closed;
    await tick();
    FakeWebSocket.last.open();
    FakeWebSocket.last.receive(encodeFrame('{"s":"relay","k":" relay"}', bytes('{"error":"host_offline"}')));
    expect(down).toHaveBeenCalledWith('host_offline');
    expect(closed).toHaveBeenCalledWith({ reason: 'host_offline' });
    expect(socket.readyState).toBe(3);
  });

  it('closes without dialing when there is no token', async () => {
    const down = vi.fn();
    const socket = new RelaySocket(async () => null, down, FakeWebSocket as unknown as typeof WebSocket);
    const closed = vi.fn();
    socket.onclose = closed;
    await tick();
    expect(down).toHaveBeenCalledWith('no_token');
    expect(closed).toHaveBeenCalled();
  });

  it('drops a link whose host stopped echoing', async () => {
    vi.useFakeTimers();
    try {
      const down = vi.fn();
      new RelaySocket(async () => 'wss://x', down, FakeWebSocket as unknown as typeof WebSocket);
      await vi.advanceTimersByTimeAsync(0);
      const ws = FakeWebSocket.last;
      ws.open();
      ws.receive(encodeFrame('{"s":"echo","k":"echo"}'));
      for (let i = 0; i < 3; i++) {
        ws.onmessage?.({ data: 'pong' });
        await vi.advanceTimersByTimeAsync(10_000);
      }
      expect(down).toHaveBeenCalledWith('echo_timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});
