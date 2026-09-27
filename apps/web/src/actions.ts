import { ATTACHMENT_ONLY_TEXT, withAttachments } from '@/attachments';
import { engine } from '@/engine';
import type { RpcError } from '@/rpc';
import type { Chat, ChatConfig, Device, SessionStatus, Space, Target } from '@/types';
import { uuid } from '@/uuid';

type Delivery = 'run' | 'queue' | 'steer';

export const CAPABILITY = {
  queue: 'message-queue-v1',
  queueAttachments: 'message-queue-attachments-v1',
  queueActions: 'message-queue-actions-v1',
  queueEditLease: 'message-queue-edit-lease-v1',
} as const;

export function supports(device: Device | undefined, capability: string): boolean {
  return device?.capabilities?.includes(capability) ?? false;
}

export function chooseDelivery(status: SessionStatus | undefined, host: Device | undefined, withAttachments = false): Delivery {
  if (status !== 'working') return 'run';
  const canQueue = supports(host, CAPABILITY.queue) && (!withAttachments || supports(host, CAPABILITY.queueAttachments));
  return canQueue ? 'queue' : 'steer';
}

export function targetFor(gatewayDeviceId: string | null, hostDeviceId: string): Target {
  return gatewayDeviceId && hostDeviceId !== gatewayDeviceId ? { targetDeviceId: hostDeviceId } : {};
}

function queueCommand(chatId: string, command: object) {
  return engine.call<{ commandId: string }>('QueueCommand', { chatId, command });
}

export interface WorktreeSpec {
  repoPath: string;
  base: string;
  spaceId?: string;
}

export async function deliver(
  chat: Chat,
  space: Space | undefined,
  delivery: Delivery,
  text: string,
  target: Target,
  options: { attachments?: string[]; worktree?: WorktreeSpec } = {},
): Promise<string> {
  const attachments = options.attachments ?? [];
  const prompt = withAttachments(text, attachments);
  const messageId = uuid();
  switch (delivery) {
    case 'run': {
      const config = chat.config;
      await queueCommand(chat.id, {
        kind: 'run',
        messageId,
        request: {
          prompt,
          harness: config?.harness ?? null,
          model: config?.model ?? null,
          reasoning: config?.reasoning ?? null,
          modelOptions: config?.modelOptions ?? {},
          cwd: chat.cwd ?? space?.path ?? '~',
          sandbox: config?.sandbox ?? 'workspace-write',
          autoApprove: false,
          resume: null,
          ...(attachments.length ? { attachments } : {}),
          ...(options.worktree ? { worktree: options.worktree } : {}),
        },
      });
      return messageId;
    }
    case 'steer':
      await queueCommand(chat.id, { kind: 'steer', prompt, messageId });
      return messageId;
    case 'queue': {
      const reply = await engine.call<{ id: string }>('QueueMessage', {
        chatId: chat.id,
        text: text || (attachments.length ? ATTACHMENT_ONLY_TEXT : ''),
        ...(attachments.length ? { attachments } : {}),
        holdForTurnEnd: true,
        ...target,
      });
      return reply.id;
    }
  }
}

export function interrupt(chatId: string) {
  return queueCommand(chatId, { kind: 'interrupt' });
}

export function respondInput(chatId: string, requestId: string, answers: { questionId: string; labels: string[] }[]) {
  return queueCommand(chatId, { kind: 'respondInput', requestId, answers });
}

export function retryDelivery(chatId: string) {
  return engine.call('RetryDelivery', { chatId });
}

export function mutate(params: { op: string } & Record<string, unknown>) {
  return engine.call('Mutate', params);
}

export function setPinned(chatId: string, pinned: boolean, after: string | null) {
  return mutate({
    op: 'changeSidebarPin',
    change: pinned ? { action: 'pin', sessionId: chatId, after, before: null } : { action: 'unpin', sessionId: chatId },
  });
}

export async function createChat(options: {
  space: Space | undefined;
  deviceId: string;
  config: ChatConfig;
  branch?: string | null;
  cwd?: string | null;
}): Promise<Chat> {
  const chatId = uuid();
  await mutate({
    op: 'createChat',
    chatId,
    deviceId: options.deviceId,
    config: options.config,
    ...(options.space ? { spaceId: options.space.id } : {}),
    ...(options.branch ? { branch: options.branch } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });
  return {
    id: chatId,
    deviceId: options.deviceId,
    title: null,
    archived: false,
    config: options.config,
    cwd: options.cwd ?? options.space?.path ?? '~',
    branch: options.branch ?? null,
    createdAt: new Date().toISOString(),
    spaceId: options.space?.id ?? null,
  };
}

export async function createSpace(spaces: Space[], deviceId: string, path: string, gitDetected: boolean): Promise<string> {
  const existing = spaces.find((s) => s.deviceId === deviceId && s.path === path);
  if (existing) return existing.id;
  const spaceId = uuid();
  await mutate({ op: 'createSpace', spaceId, deviceId, path, gitDetected });
  return spaceId;
}

export async function switchRef(repoPath: string, refName: string, target: Target): Promise<string | null> {
  try {
    await engine.call('SwitchRef', { repoPath, refName, ...target });
    return null;
  } catch (e) {
    return (e as RpcError).reason;
  }
}
