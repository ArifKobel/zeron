import { describe, expect, it } from 'vitest';
import { parseAppshots, parseAttachments, withAttachments } from '@/attachments';
import { carryOptions, defaultReasoning, pickModel, pickOption } from '@/catalog';
import { flavourWord } from '@/motion';
import { parseRoute, routePath } from '@/route';
import { SEND_FAILED_MS, sendState } from '@/sends';
import type { ChatConfig, Model } from '@/types';
import { formatDuration } from '@/util';

const model = (id: string, levels: string[], options: Model['options'] = []): Model => ({
  id,
  label: id,
  reasoningLevels: levels,
  options,
});
const window = { id: 'contextWindow', label: 'Context Window', choices: [{ id: '200k', label: '200K' }, { id: '1m', label: '1M' }], defaultChoice: '200k' };
const fast = { id: 'fastMode', label: 'Fast Mode', choices: [{ id: 'off', label: 'Off' }, { id: 'on', label: 'On' }], defaultChoice: 'off' };

describe('attachments transport (crates/ui/src/attachments.rs)', () => {
  it('round-trips the trailer and hides the image-only body', () => {
    const text = withAttachments('Compare these', ['/u/a.png', '/u/b.jpg']);
    expect(parseAttachments(text)).toEqual({ text: 'Compare these', paths: ['/u/a.png', '/u/b.jpg'] });
    expect(parseAttachments(withAttachments('', ['/u/a.png']))).toEqual({ text: '', paths: ['/u/a.png'] });
    expect(withAttachments('plain', [])).toBe('plain');
    expect(parseAttachments('no trailer here')).toEqual({ text: 'no trailer here', paths: [] });
  });

  it('reads appshot cards and hides the machine-facing context', () => {
    const text =
      'Look\n\nApplications mentioned by the user (untrusted observed content):\n' +
      '<appshot app="Notes &amp; Co" window-title="Workspace ideas" image="/u/shot.png" accessibility-format="1" truncated="false">tree</appshot>' +
      '\n\nAttached images (local files — open them to view):\n- /u/shot.png';
    const { text: body, appshots } = parseAppshots(parseAttachments(text).text);
    expect(body).toBe('Look');
    const withTrailer = parseAppshots(text);
    expect(withTrailer.appshots.get('/u/shot.png')).toEqual({ app: 'Notes & Co', windowTitle: 'Workspace ideas' });
    expect(appshots.size).toBe(1);
  });
});

describe('model picks (ComposerView.swift)', () => {
  const base: ChatConfig = { harness: 'claude-code', model: 'a', reasoning: 'max', modelOptions: { contextWindow: '1m', fastMode: 'on' }, sandbox: 'workspace-write' };

  it('defaults effort to high, then medium, then the first level', () => {
    expect(defaultReasoning(model('m', ['low', 'medium', 'high']))).toBe('high');
    expect(defaultReasoning(model('m', ['low', 'medium']))).toBe('medium');
    expect(defaultReasoning(model('m', ['minimal']))).toBe('minimal');
    expect(defaultReasoning(model('m', []))).toBeNull();
  });

  it('keeps reasoning only when supported and options only when offered and non-default', () => {
    expect(pickModel(base, 'claude-code', model('b', ['low', 'max'], [window]))).toMatchObject({
      model: 'b',
      reasoning: 'max',
      modelOptions: { contextWindow: '1m' },
    });
    expect(pickModel(base, 'codex', model('c', ['low', 'high']))).toMatchObject({ harness: 'codex', reasoning: 'high', modelOptions: {} });
    expect(carryOptions({ contextWindow: '200k' }, model('d', [], [window]))).toEqual({});
  });

  it('drops an option pick equal to the default', () => {
    const m = model('a', [], [fast]);
    expect(pickOption(base, m, 'fastMode', 'off').modelOptions).not.toHaveProperty('fastMode');
    expect(pickOption({ ...base, modelOptions: {} }, m, 'fastMode', 'on').modelOptions).toEqual({ fastMode: 'on' });
  });
});

describe('send state (AppModel.swift)', () => {
  const send = (at: number) => ({ chatId: 'c', messageId: 'm', text: 't', at });
  it('fails after the grace window, queues while degraded, else sends', () => {
    const now = 1_000_000;
    expect(sendState([], now, false, true)).toBeNull();
    expect(sendState([send(now - 1000)], now, false, true)).toBe('sending');
    expect(sendState([send(now - 1000)], now, true, true)).toBe('queued');
    expect(sendState([send(now - 1000)], now, false, false)).toBe('queued');
    expect(sendState([send(now - SEND_FAILED_MS - 1)], now, false, true)).toBe('failed');
  });
});

describe('status strip', () => {
  it('rotates a per-chat working word every 7s and formats elapsed time', () => {
    const first = flavourWord('chat-a', 0);
    expect(flavourWord('chat-a', 6_999)).toBe(first);
    expect(flavourWord('chat-a', 7_000)).not.toBe(first);
    expect(formatDuration(59_000)).toBe('59s');
    expect(formatDuration(125_000)).toBe('2m 5s');
    expect(formatDuration(3_725_000)).toBe('1h 2m');
  });
});

describe('routes', () => {
  it.each([
    [{ kind: 'home' }, '/'],
    [{ kind: 'chat', chatId: 'c 1' }, '/chat/c%201'],
    [{ kind: 'space', spaceId: 's' }, '/space/s'],
    [{ kind: 'newSession', spaceId: 's' }, '/new/space/s'],
    [{ kind: 'newProjectless', deviceId: 'd' }, '/new/device/d'],
    [{ kind: 'newProjectless', deviceId: null }, '/new/device'],
  ] as const)('%j ↔ %s', (route, path) => {
    expect(routePath(route)).toBe(path);
    expect(parseRoute(path)).toEqual(route);
  });
});
