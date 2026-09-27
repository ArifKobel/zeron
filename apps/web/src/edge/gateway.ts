import type { SocketLike } from '@/rpc';
import type { EngineDevice, PresenceSnapshot } from '@/edge/presence';
import { RelaySocket, relayUrl, type RelayCloseReason } from '@/edge/relay';

const PREFERRED_KEY = 'zeron-web.gateway';
const COOLDOWN_MS = 30_000;
const HOST_FAILURES: RelayCloseReason[] = ['host_offline', 'host_closed', 'echo_timeout', 'silent'];
const PRESENCE_WAIT_MS = 5_000;

interface GatewayState {
  deviceId: string | null;
  preferred: string | null;
}

export function rankGateways(
  presence: PresenceSnapshot,
  preferred: string | null,
  cooldownUntil: Record<string, number>,
  now: number,
  isOnline: (id: string) => boolean,
): EngineDevice[] {
  const score = (d: EngineDevice) => {
    const cooling = (cooldownUntil[d.id] ?? 0) > now ? 1 : 0;
    const online = isOnline(d.id) ? 0 : 1;
    const pick = d.id === preferred && online === 0 ? 0 : 1;
    const recency = -(presence.beats[d.id] ?? d.lastSeenAt ?? 0);
    return [cooling, pick, online, recency] as const;
  };
  return [...presence.devices].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    return a.id < b.id ? -1 : 1;
  });
}

export class Gateway {
  state: GatewayState;
  private cooldownUntil: Record<string, number> = {};
  private listeners = new Set<() => void>();

  constructor(
    private edgeUrl: string,
    private token: () => Promise<string | null>,
    private presence: {
      snapshot: PresenceSnapshot;
      isOnline(id: string): boolean;
      subscribe(listener: () => void): () => void;
    },
  ) {
    this.state = { deviceId: null, preferred: localStorage.getItem(PREFERRED_KEY) };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(next: Partial<GatewayState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  prefer(deviceId: string | null) {
    if (deviceId) localStorage.setItem(PREFERRED_KEY, deviceId);
    else localStorage.removeItem(PREFERRED_KEY);
    if (deviceId) delete this.cooldownUntil[deviceId];
    this.set({ preferred: deviceId });
  }

  private whenSynced(): Promise<void> {
    if (this.presence.snapshot.synced) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, PRESENCE_WAIT_MS);
      const unsubscribe = this.presence.subscribe(() => this.presence.snapshot.synced && done());
      function done() {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  }

  private async choose(): Promise<string | null> {
    await this.whenSynced();
    const now = Date.now();
    const ranked = rankGateways(this.presence.snapshot, this.state.preferred, this.cooldownUntil, now, (id) =>
      this.presence.isOnline(id),
    );
    return ranked[0]?.id ?? null;
  }

  openSocket = (): SocketLike => {
    let target: string | null = null;
    return new RelaySocket(
      async () => {
        target = await this.choose();
        this.set({ deviceId: target });
        if (!target) return null;
        const token = await this.token();
        return token ? relayUrl(this.edgeUrl, target, token) : null;
      },
      (reason) => {
        if (target && HOST_FAILURES.includes(reason)) this.cooldownUntil[target] = Date.now() + COOLDOWN_MS;
      },
    );
  };
}
