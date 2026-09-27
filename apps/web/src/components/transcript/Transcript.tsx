import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { Entry } from '@/types';
import { Lightbox } from '@/components/Lightbox';
import { EntryView } from '@/components/transcript/EntryView';
import { UserBubble } from '@/components/transcript/UserBubble';
import type { TargetOf } from '@/components/transcript/types';

const STICK_BAND_PX = 70;
const JUMP_BUTTON_PX = 140;

export function Transcript({
  entries,
  pending,
  hostDeviceId,
  targetOf,
  scrollKey,
}: {
  entries: Entry[];
  pending: { id: string; text: string }[];
  hostDeviceId: string;
  targetOf: TargetOf;
  scrollKey: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; name?: string } | null>(null);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distance < STICK_BAND_PX;
    setShowJump(distance > JUMP_BUTTON_PX);
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    stick.current = true;
  }, [pending.length, scrollKey]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const jump = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <div className="transcript-wrap">
      <div className="transcript" ref={scroller} onScroll={onScroll}>
        <div className="transcript-inner">
          {entries.map((entry) => (
            <EntryView key={entry.id} entry={entry} hostDeviceId={hostDeviceId} targetOf={targetOf} onOpenImage={setLightbox} />
          ))}
          {pending.map((p) => (
            <UserBubble key={p.id} content={p.text} unsent hostTarget={targetOf(hostDeviceId)} onOpenImage={setLightbox} />
          ))}
        </div>
      </div>
      {showJump && (
        <button className="jump-latest" aria-label="Jump to latest" onClick={jump}>
          <ArrowDown size={16} />
        </button>
      )}
      {lightbox && <Lightbox src={lightbox.src} name={lightbox.name} onClose={() => setLightbox(null)} />}
    </div>
  );
}
