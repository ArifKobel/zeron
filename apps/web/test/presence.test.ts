import { describe, expect, it } from 'vitest';
import { deviceFromRow, PresenceWatcher, registryUrl } from '@/edge/presence';

describe('presence', () => {
  it('projects device rows and skips tombstones', () => {
    expect(
      deviceFromRow({ kind: 'devices', id: 'd1', deleted: false, fields: { id: 'd1', name: 'studio', platform: 'linux', lastSeenAt: 5 } }),
    ).toEqual({ id: 'd1', name: 'studio', lastSeenAt: 5 });
    expect(deviceFromRow({ kind: 'devices', id: 'd1', deleted: true, fields: {} })).toBeNull();
    expect(deviceFromRow({ kind: 'chats', id: 'c', deleted: false, fields: {} })).toBeNull();
    expect(registryUrl('https://edge.x', 'org_1', 't', 'web-1')).toBe('wss://edge.x/registry/org_1/ws?token=t&device=web-1');
  });

  it('joins with a null cursor and tracks live beats by receipt time', async () => {
    class FakeWs {
      static last: FakeWs;
      readyState = 1;
      sent: string[] = [];
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      constructor() {
        FakeWs.last = this;
      }
      send(data: string) {
        this.sent.push(data);
      }
      close() {}
    }
    const watcher = new PresenceWatcher(async () => 'wss://x', 'web-1', FakeWs as unknown as typeof WebSocket);
    watcher.start();
    await new Promise((r) => setTimeout(r, 0));
    const ws = FakeWs.last;
    ws.onopen?.();
    expect(JSON.parse(ws.sent[0])).toEqual({ t: 'hello', cursor: null, device: 'web-1' });
    const now = Date.now();
    ws.onmessage?.({
      data: JSON.stringify({
        t: 'state',
        seq: 3,
        full: true,
        rows: [{ kind: 'devices', id: 'a', deleted: false, fields: { name: 'A' } }],
        presence: { a: now + 3_600_000, gone: now - 3_600_000 },
      }),
    });
    expect(watcher.snapshot.synced).toBe(true);
    expect(watcher.snapshot.devices.map((d) => d.name)).toEqual(['A']);
    expect(watcher.isOnline('a')).toBe(true);
    expect(watcher.isOnline('gone')).toBe(false);
    ws.onmessage?.({ data: JSON.stringify({ t: 'presence', device: 'gone', at: 0 }) });
    expect(watcher.isOnline('gone')).toBe(true);
    watcher.stop();
  });
});
