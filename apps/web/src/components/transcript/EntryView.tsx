import { memo } from 'react';
import { MessageCircleQuestion, TriangleAlert } from 'lucide-react';
import { href } from '@/route';
import type { Entry, MessagePart, Target } from '@/types';
import { formatDuration } from '@/util';
import { Markdown } from '@/components/Markdown';
import { Activity } from '@/components/transcript/Activity';
import { RemoteImage } from '@/components/transcript/RemoteImage';
import { UserBubble } from '@/components/transcript/UserBubble';
import type { ActivityPart, OpenImage, TargetOf, TextPart } from '@/components/transcript/types';

type Block =
  | { type: 'text'; part: TextPart }
  | { type: 'activity'; id: string; parts: ActivityPart[] }
  | { type: 'other'; part: MessagePart };

const MIN_SHOWN_DURATION_MS = 1000;

function blocksOf(parts: MessagePart[]): Block[] {
  const blocks: Block[] = [];
  for (const part of parts) {
    if (part.kind === 'tool' || part.kind === 'reasoning') {
      if (part.kind === 'reasoning' && !part.text.trim()) continue;
      const last = blocks[blocks.length - 1];
      if (last?.type === 'activity') last.parts.push(part);
      else blocks.push({ type: 'activity', id: part.id, parts: [part] });
    } else if (part.kind === 'text') {
      if (part.text.trim()) blocks.push({ type: 'text', part });
    } else {
      blocks.push({ type: 'other', part });
    }
  }
  return blocks;
}

export const EntryView = memo(function EntryView({
  entry,
  hostDeviceId,
  targetOf,
  onOpenImage,
}: {
  entry: Entry;
  hostDeviceId: string;
  targetOf: TargetOf;
  onOpenImage: OpenImage;
}) {
  if (entry.role === 'user') {
    const text = entry.parts
      .filter((p): p is TextPart => p.kind === 'text')
      .map((p) => p.text)
      .join('\n\n');
    return <UserBubble content={text} hostTarget={targetOf(hostDeviceId)} onOpenImage={onOpenImage} />;
  }
  const blocks = blocksOf(entry.parts);
  const streaming = entry.status === 'streaming';
  return (
    <div className={`msg ${entry.role}`}>
      {blocks.map((block, ix) => {
        if (block.type === 'text') return <Markdown key={block.part.id} text={block.part.text} />;
        if (block.type === 'activity') {
          return <Activity key={block.id} parts={block.parts} live={streaming && ix === blocks.length - 1} />;
        }
        return (
          <OtherPart
            key={block.part.id}
            part={block.part}
            sources={[targetOf(entry.deviceId), targetOf(hostDeviceId)]}
            onOpenImage={onOpenImage}
          />
        );
      })}
      {entry.status === 'aborted' && <div className="msg-meta">Interrupted</div>}
      {entry.status === 'complete' && entry.durationMs != null && entry.durationMs >= MIN_SHOWN_DURATION_MS && (
        <div className="msg-meta">{formatDuration(entry.durationMs)}</div>
      )}
    </div>
  );
});

function OtherPart({ part, sources, onOpenImage }: { part: MessagePart; sources: Target[]; onOpenImage: OpenImage }) {
  switch (part.kind) {
    case 'error':
      return (
        <div className="chip-row error-chip">
          <span className="chip-row-icon">
            <TriangleAlert size={14} />
          </span>
          <strong>Error</strong>
          <span className="chip-row-text">{part.message}</span>
        </div>
      );
    case 'image':
      return <RemoteImage path={part.path} sources={sources} className="generated-image" onOpen={onOpenImage} />;
    case 'fork':
      return (
        <div className="fork-divider">
          <span>
            Forked from <a href={href({ kind: 'chat', chatId: part.sourceChatId })}>{part.sourceChatId.slice(0, 8)}</a>
          </span>
        </div>
      );
    case 'input':
      return (
        <div className="chip-row input-chip">
          <span className="chip-row-icon">
            <MessageCircleQuestion size={14} />
          </span>
          <strong>Question</strong>
          <span className="chip-row-text">
            {part.resolved ? (part.questions[0]?.header ?? '') : 'Awaiting your answer…'}
          </span>
        </div>
      );
    default:
      return null;
  }
}
