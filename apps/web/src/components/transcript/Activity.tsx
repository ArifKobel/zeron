import { useState } from 'react';
import { ChevronRight, MessageCircleQuestion } from 'lucide-react';
import { activitySummary } from '@/view';
import { ToolRow } from '@/components/transcript/ToolRow';
import type { ActivityPart, ToolPart } from '@/components/transcript/types';

const THOUGHT_PREVIEW_CHARS = 280;

export function Activity({ parts, live }: { parts: ActivityPart[]; live: boolean }) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? live;
  const tools = parts.filter((p): p is ToolPart => p.kind === 'tool');
  const summary = activitySummary(
    tools.map((t) => ({ call: t.call, isError: !!t.isError })),
    parts.length - tools.length,
  );
  return (
    <div className={`activity ${open ? 'open' : ''}`}>
      <button className="activity-head" onClick={() => setToggled(!open)} aria-expanded={open}>
        <ChevronRight size={14} className="chev" />
        <span className={`activity-summary ${live ? 'shimmer' : ''}`}>{summary}</span>
      </button>
      {open && (
        <div className="activity-body">
          {parts.map((p) => (p.kind === 'tool' ? <ToolRow key={p.id} part={p} /> : <Thought key={p.id} text={p.text} />))}
        </div>
      )}
    </div>
  );
}

function Thought({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > THOUGHT_PREVIEW_CHARS;
  return (
    <div className="tool-row thought">
      <span className="tool-rail" aria-hidden>
        <MessageCircleQuestion size={14} />
      </span>
      <div className="tool-main">
        <div className="tool-label">Thought process</div>
        <div className="thought-text">{long && !open ? text.slice(0, THOUGHT_PREVIEW_CHARS) + '…' : text}</div>
        {long && (
          <button className="show-more small" onClick={() => setOpen(!open)}>
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  );
}
