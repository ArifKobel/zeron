import { describe, expect, it, vi } from 'vitest';
import { RpcClient, type SocketLike } from '@/rpc';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: any[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: any }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  reply(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function client() {
  const sockets: FakeSocket[] = [];
  const rpc = new RpcClient(() => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  });
  return { rpc, sockets };
}

describe('RpcClient', () => {
  it('queues frames until open, then resolves unary calls', async () => {
    const { rpc, sockets } = client();
    const reply = rpc.call('LocalDevice');
    sockets[0].open();
    expect(sockets[0].sent[0]).toMatchObject({ method: 'LocalDevice', params: {} });
    sockets[0].reply({ id: sockets[0].sent[0].id, ok: { deviceId: 'd' } });
    await expect(reply).resolves.toEqual({ deviceId: 'd' });
    expect(rpc.epoch).toBe(1);
  });

  it('prefixes errors with the method', async () => {
    const { rpc, sockets } = client();
    sockets[0].open();
    const reply = rpc.call('Mutate', { op: 'x' });
    sockets[0].reply({ id: sockets[0].sent[0].id, err: 'unknown op' });
    await expect(reply).rejects.toThrow('Mutate: unknown op');
  });

  it('takes the first item when a watch method is called as unary, and cancels it', async () => {
    const { rpc, sockets } = client();
    sockets[0].open();
    const reply = rpc.call('AuthStatus');
    const id = sockets[0].sent[0].id;
    sockets[0].reply({ id, item: { state: 'signedOut' } });
    await expect(reply).resolves.toEqual({ state: 'signedOut' });
    expect(sockets[0].sent[1]).toEqual({ id, cancel: true });
  });

  it('streams items until done, and cancel sends a cancel frame', () => {
    const { rpc, sockets } = client();
    sockets[0].open();
    const items: unknown[] = [];
    const end = vi.fn();
    rpc.subscribe('WatchChats', {}, (item) => items.push(item), end);
    const id = sockets[0].sent[0].id;
    sockets[0].onmessage?.({ data: `${JSON.stringify({ id, item: [1] })}\n${JSON.stringify({ id, item: [2] })}` });
    sockets[0].reply({ id, done: true });
    expect(items).toEqual([[1], [2]]);
    expect(end).toHaveBeenCalledWith({ kind: 'done' });

    const cancel = rpc.subscribe('WatchSessions', {}, () => {});
    cancel();
    expect(sockets[0].sent.at(-1)).toEqual({ id: sockets[0].sent.at(-2).id, cancel: true });
  });

  it('fails in-flight work on disconnect and redials', async () => {
    vi.useFakeTimers();
    try {
      const { rpc, sockets } = client();
      sockets[0].open();
      const reply = rpc.call('LocalDevice');
      const end = vi.fn();
      rpc.subscribe('WatchChats', {}, () => {}, end);
      sockets[0].close();
      await expect(reply).rejects.toThrow('connection to the engine closed');
      expect(end).toHaveBeenCalledWith({ kind: 'disconnected' });
      expect(rpc.state).toBe('closed');
      await vi.advanceTimersByTimeAsync(500);
      expect(sockets).toHaveLength(2);
      sockets[1].open();
      expect(rpc.epoch).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
