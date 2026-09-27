import { describe, expect, it } from 'vitest';
import type { Chat, Session, ToolCall } from '@/types';
import {
  activitySummary,
  displayStatus,
  effectiveIndicator,
  formatTimeAgo,
  projectLabel,
  singleLine,
  sortChats,
  toolChipContent,
  toolGroupSummary,
} from '@/view';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const ago = (s: number) => NOW - s * 1000;

function chat(id: string, over: Partial<Chat> = {}): Chat {
  return { id, deviceId: 'd', archived: false, createdAt: new Date(ago(3600)).toISOString(), ...over };
}

function session(status: Session['status'], ageSeconds: number): Session {
  return { chatId: 'c', deviceId: 'd', status, updatedAt: new Date(ago(ageSeconds)).toISOString() };
}

describe('formatTimeAgo (relative_times_match_zeron_format)', () => {
  it.each([
    [0, 'now'],
    [59, 'now'],
    [60, '1m'],
    [59 * 60, '59m'],
    [60 * 60, '1h'],
    [23 * 3600 + 3599, '23h'],
    [24 * 3600, '1d'],
    [6 * 86400, '6d'],
    [7 * 86400, '1w'],
    [30 * 86400, '4w'],
    [35 * 86400, '1mo'],
    [400 * 86400, '1y'],
  ])('%is ago reads %s', (seconds, label) => {
    expect(formatTimeAgo(ago(seconds), NOW)).toBe(label);
  });

  it('clamps clock skew to now', () => {
    expect(formatTimeAgo(NOW + 2 * 3600_000, NOW)).toBe('now');
  });
});

describe('projectLabel', () => {
  it('labels home and Windows paths like the desktop', () => {
    expect(projectLabel('~')).toBe('No project');
    expect(projectLabel(null)).toBe('No project');
    expect(projectLabel('C:\\Users\\me\\code\\comet\\')).toBe('comet');
  });
});

describe('status', () => {
  it('treats working and awaiting rows older than 45s as dead', () => {
    expect(effectiveIndicator(session('working', 10), NOW)).toBe('working');
    expect(effectiveIndicator(session('working', 46), NOW)).toBe('none');
    expect(effectiveIndicator(session('awaitingInput', 46), NOW)).toBe('none');
    expect(effectiveIndicator(session('errored', 3600), NOW)).toBe('errored');
    expect(effectiveIndicator(undefined, NOW)).toBe('none');
  });

  it('shows completed until the synced seen marker catches up', () => {
    const unseen = chat('c', { lastMessageAt: new Date(ago(10)).toISOString(), lastSeenAt: new Date(ago(60)).toISOString() });
    expect(displayStatus(unseen, undefined, NOW)).toBe('completed');
    expect(displayStatus({ ...unseen, lastSeenAt: new Date(ago(5)).toISOString() }, undefined, NOW)).toBe('idle');
    expect(displayStatus(unseen, session('working', 1), NOW)).toBe('working');
    expect(displayStatus(unseen, session('working', 120), NOW)).toBe('completed');
    expect(displayStatus({ ...unseen, lastSeenAt: new Date(ago(1)).toISOString() }, session('errored', 1), NOW)).toBe('idle');
    expect(displayStatus(unseen, session('errored', 1), NOW)).toBe('errored');
  });
});

describe('sortChats', () => {
  it('orders by activity, then creation, then id', () => {
    const a = chat('a', { lastMessageAt: new Date(ago(10)).toISOString() });
    const b = chat('b', { createdAt: new Date(ago(5)).toISOString() });
    const c = chat('c');
    const d = chat('d');
    expect(sortChats([d, c, a, b]).map((x) => x.id)).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('tool summaries', () => {
  const exec = (command: string): ToolCall => ({ kind: 'exec', command });

  it('names chips like describeTool', () => {
    expect(toolChipContent({ kind: 'unknown', name: 'Agent: scan repo' })).toEqual({ label: 'Agent', detail: 'scan repo' });
    expect(toolChipContent({ kind: 'unknown', name: 'Frobnicate' })).toEqual({ label: 'Tool', detail: 'Frobnicate' });
    expect(toolChipContent({ kind: 'applyPatch' })).toEqual({ label: 'Patch', detail: 'workspace' });
    expect(toolChipContent(exec('cargo\n  test'))).toEqual({ label: 'Run', detail: 'cargo test' });
    expect(singleLine('  a\tb\n c ')).toBe('a b c');
  });

  it('summarizes a group, counting edited files once', () => {
    const tools = [
      { call: exec('ls'), isError: false },
      { call: exec('cargo test'), isError: true },
      { call: { kind: 'editFile', path: 'a.rs' } as ToolCall, isError: false },
      { call: { kind: 'writeFile', path: 'a.rs' } as ToolCall, isError: false },
      { call: { kind: 'readFile', path: 'b.rs' } as ToolCall, isError: false },
      { call: { kind: 'glob', pattern: '*.rs' } as ToolCall, isError: false },
      { call: { kind: 'webSearch', query: 'loro' } as ToolCall, isError: false },
    ];
    expect(toolGroupSummary(tools)).toBe('Ran 2 commands · edited 1 file · read 1 file · searched 2 times · 1 failed');
  });

  it('names thoughts ahead of tools (transcript.rs tool_group_summary)', () => {
    const tools = [
      { call: exec('a'), isError: false },
      { call: exec('b'), isError: false },
    ];
    expect(activitySummary(tools, 2)).toBe('Thought 2 times · Ran 2 commands');
    expect(activitySummary([], 1)).toBe('Thought process');
    const reads = [
      { call: { kind: 'readFile', path: 'x' } as ToolCall, isError: false },
      { call: { kind: 'search', pattern: 'y' } as ToolCall, isError: false },
      { call: { kind: 'glob', pattern: 'z' } as ToolCall, isError: false },
    ];
    expect(activitySummary(reads, 0)).toBe('Read 1 file · searched 2 times');
  });
});
