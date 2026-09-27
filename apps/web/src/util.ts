import type { Chat, Device, Session, Space } from '@/types';

export function sessionFor(sessions: Session[] | undefined, chat: Chat): Session | undefined {
  const mine = (sessions ?? []).filter((s) => s.chatId === chat.id);
  return (
    mine.find((s) => s.deviceId === chat.deviceId) ??
    mine.reduce<Session | undefined>((best, s) => (!best || Date.parse(s.updatedAt) > Date.parse(best.updatedAt) ? s : best), undefined)
  );
}

export function basename(path: string): string {
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function spaceName(space: Space): string {
  return space.name?.trim() ? space.name : basename(space.path);
}

export function deviceName(devices: Device[], id: string): string {
  return devices.find((d) => d.id === id)?.name ?? 'unknown device';
}

export function chatTitle(chat: Chat): string {
  return chat.title?.trim() || 'New session';
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
