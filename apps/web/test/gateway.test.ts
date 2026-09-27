import { describe, expect, it } from 'vitest';
import { rankGateways } from '@/edge/gateway';

describe('gateway choice', () => {
  const device = (id: string, lastSeenAt: number) => ({ id, name: id, lastSeenAt });
  const presence = {
    devices: [device('laptop', 900), device('vps', 500), device('old', 100)],
    beats: { laptop: 1000, vps: 990 } as Record<string, number>,
    synced: true,
  };
  const online = (id: string) => id in presence.beats;
  const rank = (preferred: string | null, cooldown: Record<string, number> = {}) =>
    rankGateways(presence, preferred, cooldown, 2000, online).map((d) => d.id);

  it('prefers the freshest online device, then the pinned one while it is online', () => {
    expect(rank(null)).toEqual(['laptop', 'vps', 'old']);
    expect(rank('vps')).toEqual(['vps', 'laptop', 'old']);
    expect(rank('old')).toEqual(['laptop', 'vps', 'old']);
  });

  it('moves devices that just failed to the back', () => {
    expect(rank(null, { laptop: 5000 })).toEqual(['vps', 'old', 'laptop']);
  });
});
