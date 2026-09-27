import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat, Device } from '@/types';

const calls: [string, any][] = [];
vi.mock('@/engine', async () => {
  const { RpcError } = await import('@/rpc');
  return {
    engine: {
      call: async (method: string, params: object) => {
        calls.push([method, params]);
        if (method === 'SwitchRef' && (params as { refName: string }).refName === 'dirty') {
          throw new RpcError('SwitchRef', 'your local changes would be overwritten');
        }
        return method === 'QueueMessage' ? { id: 'queued-1' } : { commandId: 'cmd-1' };
      },
    },
  };
});

const { chooseDelivery, createChat, createSpace, deliver, interrupt, respondInput, setPinned, switchRef, targetFor } = await import('@/actions');

const device = (capabilities: string[]): Device => ({ id: 'dev-1', name: 'studio', platform: 'linux', capabilities });

const chat: Chat = {
  id: 'chat-1',
  deviceId: 'dev-1',
  archived: false,
  createdAt: '2026-09-01T00:00:00Z',
  config: { harness: 'claude-code', model: 'opus', reasoning: 'high', modelOptions: { fastMode: 'on' }, sandbox: 'workspace-write' },
};
const space = { id: 's', deviceId: 'dev-1', path: '/repo/comet', gitDetected: true, createdAt: '2026-09-01T00:00:00Z' };

beforeEach(() => {
  calls.length = 0;
});

describe('delivery choice (iOS ComposerView)', () => {
  const queueing = device(['message-queue-v1']);
  const queueingImages = device(['message-queue-v1', 'message-queue-attachments-v1']);
  it.each([
    ['idle', queueing, false, 'run'],
    [undefined, queueing, false, 'run'],
    ['errored', queueing, false, 'run'],
    ['awaitingInput', queueing, false, 'run'],
    ['working', queueing, false, 'queue'],
    ['working', queueing, true, 'steer'],
    ['working', queueingImages, true, 'queue'],
    ['working', device([]), false, 'steer'],
  ] as const)('%s on a host with %j, images=%s → %s', (status, host, images, expected) => {
    expect(chooseDelivery(status, host, images)).toBe(expected);
  });

  it('addresses only chats hosted elsewhere', () => {
    expect(targetFor('dev-1', 'dev-1')).toEqual({});
    expect(targetFor('dev-1', 'dev-2')).toEqual({ targetDeviceId: 'dev-2' });
    expect(targetFor(null, 'dev-2')).toEqual({});
  });
});

describe('writes', () => {
  it('queues a run with the chat config and a client-minted message id', async () => {
    const id = await deliver(chat, space, 'run', 'hi', {});
    const [method, params] = calls[0];
    expect(method).toBe('QueueCommand');
    expect(params.command).toEqual({
      kind: 'run',
      messageId: id,
      request: {
        prompt: 'hi',
        harness: 'claude-code',
        model: 'opus',
        reasoning: 'high',
        modelOptions: { fastMode: 'on' },
        cwd: '/repo/comet',
        sandbox: 'workspace-write',
        autoApprove: false,
        resume: null,
      },
    });
  });

  it('carries attachments in the prompt trailer and the request, and a worktree spec', async () => {
    await deliver({ ...chat, cwd: '/wt/feature' }, space, 'run', 'look', {}, {
      attachments: ['/up/a.png'],
      worktree: { repoPath: '/repo/comet', base: 'main', spaceId: 's' },
    });
    const request = calls[0][1].command.request;
    expect(request.cwd).toBe('/wt/feature');
    expect(request.attachments).toEqual(['/up/a.png']);
    expect(request.prompt).toBe('look\n\nAttached images (local files — open them to view):\n- /up/a.png');
    expect(request.worktree).toEqual({ repoPath: '/repo/comet', base: 'main', spaceId: 's' });
  });

  it('steers, queues for turn end (text without the trailer), interrupts, and answers', async () => {
    const steerId = await deliver(chat, space, 'steer', 'also this', {});
    expect(calls[0][1].command).toEqual({ kind: 'steer', prompt: 'also this', messageId: steerId });
    expect(await deliver(chat, space, 'queue', 'later', { targetDeviceId: 'dev-2' }, { attachments: ['/up/b.png'] })).toBe('queued-1');
    expect(calls[1]).toEqual([
      'QueueMessage',
      { chatId: 'chat-1', text: 'later', attachments: ['/up/b.png'], holdForTurnEnd: true, targetDeviceId: 'dev-2' },
    ]);
    await interrupt('chat-1');
    expect(calls[2][1].command).toEqual({ kind: 'interrupt' });
    await respondInput('chat-1', 'req-1', [{ questionId: 'q', labels: ['a'] }]);
    expect(calls[3][1].command).toEqual({ kind: 'respondInput', requestId: 'req-1', answers: [{ questionId: 'q', labels: ['a'] }] });
  });

  it('creates a chat row with branch and checkout', async () => {
    const created = await createChat({ space, deviceId: 'dev-1', config: chat.config!, branch: 'main', cwd: '/wt/x' });
    expect(calls[0]).toEqual([
      'Mutate',
      { op: 'createChat', chatId: created.id, deviceId: 'dev-1', config: chat.config, spaceId: 's', branch: 'main', cwd: '/wt/x' },
    ]);
    expect(created).toMatchObject({ branch: 'main', cwd: '/wt/x', spaceId: 's' });
  });

  it('pins after the last pin, unpins, and dedupes spaces per device and path', async () => {
    await setPinned('chat-1', true, 'chat-0');
    await setPinned('chat-1', false, null);
    expect(calls.map((c) => c[1].change)).toEqual([
      { action: 'pin', sessionId: 'chat-1', after: 'chat-0', before: null },
      { action: 'unpin', sessionId: 'chat-1' },
    ]);
    calls.length = 0;
    expect(await createSpace([space], 'dev-1', '/repo/comet', true)).toBe('s');
    expect(calls).toEqual([]);
    const id = await createSpace([space], 'dev-2', '/repo/comet', true);
    expect(calls[0][1]).toEqual({ op: 'createSpace', spaceId: id, deviceId: 'dev-2', path: '/repo/comet', gitDetected: true });
  });

  it("reports git's error from a failed checkout", async () => {
    expect(await switchRef('/repo/comet', 'main', {})).toBeNull();
    expect(await switchRef('/repo/comet', 'dirty', {})).toBe('your local changes would be overwritten');
  });
});
