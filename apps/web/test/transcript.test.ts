import { describe, expect, it } from 'vitest';
import { applyFrame, foldContinuations, pendingInput, TranscriptDesync } from '@/transcript';
import type { Entry } from '@/types';

function entry(id: string, text = '', over: Partial<Entry> = {}): Entry {
  return {
    id,
    role: 'assistant',
    parts: [{ kind: 'text', id: 't', text }],
    createdAt: 1,
    deviceId: 'd',
    status: 'streaming',
    ...over,
  };
}

describe('applyFrame (port of apply_transcript_frame)', () => {
  it('resets, then upserts after anchors, removes, and appends', () => {
    let doc = applyFrame([], { reset: [entry('a'), entry('c')] });
    doc = applyFrame(doc, { upsert: [{ after: 'a', entry: entry('b') }], count: 3 });
    expect(doc.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    doc = applyFrame(doc, { upsert: [{ after: null, entry: entry('c', 'moved') }], remove: ['a'], count: 2 });
    expect(doc.map((e) => e.id)).toEqual(['c', 'b']);
    doc = applyFrame(doc, { append: [{ entry: 'b', part: 't', text: 'hé', len: 3 }], count: 2 });
    expect(doc[1].parts[0]).toMatchObject({ text: 'hé' });
  });

  it('checks append lengths in UTF-8 bytes, like the Rust String', () => {
    const doc = [entry('a', '€')];
    expect(applyFrame(doc, { append: [{ entry: 'a', part: 't', text: '!', len: 4 }], count: 1 })[0].parts[0]).toMatchObject({
      text: '€!',
    });
    expect(() => applyFrame(doc, { append: [{ entry: 'a', part: 't', text: '!', len: 2 }], count: 1 })).toThrow(
      TranscriptDesync,
    );
  });

  it('never mutates the previous transcript', () => {
    const doc = [entry('a', 'x')];
    applyFrame(doc, { append: [{ entry: 'a', part: 't', text: 'y', len: 2 }], count: 1 });
    expect(doc[0].parts[0]).toMatchObject({ text: 'x' });
  });

  it.each([
    ['missing anchor', { upsert: [{ after: 'nope', entry: entry('b') }], count: 2 }],
    ['missing append entry', { append: [{ entry: 'nope', part: 't', text: 'x', len: 1 }], count: 1 }],
    ['missing append part', { append: [{ entry: 'a', part: 'nope', text: 'x', len: 1 }], count: 1 }],
    ['count mismatch', { count: 5 }],
  ])('reports a desync on %s', (_, frame) => {
    expect(() => applyFrame([entry('a')], frame)).toThrow(TranscriptDesync);
  });
});

describe('foldContinuations', () => {
  it('joins continuation parts onto the root and keeps the live status', () => {
    const root = entry('a', 'first', { status: 'complete' });
    const cont = { ...entry('a2', 'second'), continuationOf: 'a', parts: [{ kind: 'text' as const, id: 't2', text: 'second' }] };
    const cont2 = { ...entry('a3', 'third'), continuationOf: 'a2', parts: [{ kind: 'text' as const, id: 't3', text: 'third' }] };
    const folded = foldContinuations([root, cont, cont2]);
    expect(folded).toHaveLength(1);
    expect(folded[0].parts.map((p) => (p as { text: string }).text)).toEqual(['first', 'second', 'third']);
    expect(folded[0].status).toBe('streaming');
  });

  it('keeps an orphaned continuation standalone', () => {
    expect(foldContinuations([{ ...entry('x'), continuationOf: 'gone' }]).map((e) => e.id)).toEqual(['x']);
  });
});

describe('pendingInput', () => {
  const q = [{ id: 'q', header: 'H', question: 'Which?', options: ['a', 'b'] }];

  it('finds the newest unresolved question', () => {
    const asked: Entry = {
      ...entry('a'),
      parts: [
        { kind: 'input', id: 'i1', requestId: 'r1', questions: q, resolved: true },
        { kind: 'input', id: 'i2', requestId: 'r2', questions: q },
      ],
    };
    expect(pendingInput([asked])?.requestId).toBe('r2');
    expect(pendingInput([entry('b')])).toBeNull();
  });

  it('ignores a request with no questions, which could never be answered', () => {
    const empty: Entry = { ...entry('a'), parts: [{ kind: 'input', id: 'i', requestId: 'r', questions: [] }] };
    expect(pendingInput([empty])).toBeNull();
  });
});
