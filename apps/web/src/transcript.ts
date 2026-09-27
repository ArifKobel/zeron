import type { Entry, InputPart } from '@/types';

interface ResetFrame {
  reset: Entry[];
}
interface DeltaFrame {
  upsert?: { after: string | null; entry: Entry }[];
  append?: { entry: string; part: string; text: string; len: number }[];
  remove?: string[];
  count: number;
}
export type TranscriptFrame = ResetFrame | DeltaFrame;

export class TranscriptDesync extends Error {}

const utf8 = new TextEncoder();
const byteLen = (s: string) => utf8.encode(s).length;

export function applyFrame(current: Entry[], frame: TranscriptFrame): Entry[] {
  if ('reset' in frame) return frame.reset;
  let next = current.slice();
  if (frame.remove?.length) {
    const gone = new Set(frame.remove);
    next = next.filter((e) => !gone.has(e.id));
  }
  for (const { after, entry } of frame.upsert ?? []) {
    const existing = next.findIndex((e) => e.id === entry.id);
    if (existing >= 0) next.splice(existing, 1);
    let at = 0;
    if (after != null) {
      const ix = next.findIndex((e) => e.id === after);
      if (ix < 0) throw new TranscriptDesync(`missing anchor ${after}`);
      at = ix + 1;
    }
    next.splice(at, 0, entry);
  }
  for (const { entry, part, text, len } of frame.append ?? []) {
    const ix = next.findIndex((e) => e.id === entry);
    if (ix < 0) throw new TranscriptDesync(`missing append entry ${entry}`);
    const target = next[ix];
    let found = false;
    const parts = target.parts.map((p) => {
      if ((p.kind === 'text' || p.kind === 'reasoning') && p.id === part) {
        found = true;
        const merged = p.text + text;
        if (byteLen(merged) !== len) throw new TranscriptDesync(`append length mismatch on ${entry}#${part}`);
        return { ...p, text: merged };
      }
      return p;
    });
    if (!found) throw new TranscriptDesync(`missing append part ${part}`);
    next[ix] = { ...target, parts };
  }
  if (next.length !== frame.count) throw new TranscriptDesync(`count ${next.length} != ${frame.count}`);
  return next;
}

export function foldContinuations(entries: Entry[]): Entry[] {
  const out: Entry[] = [];
  const byId = new Map<string, number>();
  for (const e of entries) {
    const parentIx = e.continuationOf ? byId.get(e.continuationOf) : undefined;
    if (parentIx !== undefined) {
      const parent = out[parentIx];
      out[parentIx] = {
        ...parent,
        parts: [...parent.parts, ...e.parts],
        status: e.status ?? parent.status,
        durationMs: e.durationMs ?? parent.durationMs,
      };
      byId.set(e.id, parentIx);
      continue;
    }
    byId.set(e.id, out.length);
    out.push(e);
  }
  return out;
}

export function pendingInput(entries: Entry[]) {
  for (let i = entries.length - 1; i >= 0; i--) {
    for (let j = entries[i].parts.length - 1; j >= 0; j--) {
      const p = entries[i].parts[j];
      if (p.kind === 'input' && !p.resolved && p.questions.length > 0) {
        return p as InputPart;
      }
    }
  }
  return null;
}
