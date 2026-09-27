import type { Chat, Device, Space } from '@/types';
import { deviceName, spaceName } from '@/util';
import { projectLabel } from '@/view';

export function partitionChats(chats: Chat[], spaces: Space[], spaceId: string | null) {
  const live = new Set(spaces.map((s) => s.id));
  const inScope = (c: Chat) => (spaceId ? c.spaceId === spaceId : !c.spaceId || live.has(c.spaceId));
  return {
    active: chats.filter((c) => !c.archived && !c.parentChatId && inScope(c)),
    archived: chats.filter((c) => c.archived && (!spaceId || c.spaceId === spaceId)),
  };
}

export function chatLocation(chat: Chat, spaces: Space[], devices: Device[]): string {
  const space = spaces.find((s) => s.id === chat.spaceId);
  const where = space ? spaceName(space) : chat.spaceId ? projectLabel(chat.cwd) : 'No project';
  return `${where} @ ${deviceName(devices, chat.deviceId)}`;
}
