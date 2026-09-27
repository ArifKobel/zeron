import { useEffect } from 'react';

const DISMISS_DISTANCE_PX = 110;
const DISMISS_VELOCITY = 0.45;
const FLICK_MIN_PX = 20;
const SETTLE_MS = 220;
const BACKDROP_ALPHA = 0.5;

export function useDragToDismiss(
  panel: React.RefObject<HTMLDivElement | null>,
  backdrop: React.RefObject<HTMLDivElement | null>,
  dismiss: () => void,
) {
  useEffect(() => {
    const el = panel.current;
    const shade = backdrop.current;
    if (!el || !shade) return;
    let start: { y: number; t: number; fromBody: boolean } | null = null;
    let dy = 0;
    let last = { y: 0, t: 0 };
    let velocity = 0;

    const apply = (offset: number, animate: boolean) => {
      el.style.transition = animate ? `transform ${SETTLE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)` : 'none';
      el.style.transform = offset ? `translateY(${offset}px)` : '';
      shade.style.transition = animate ? `background-color ${SETTLE_MS}ms ease-out` : 'none';
      shade.style.backgroundColor = `rgba(0, 0, 0, ${BACKDROP_ALPHA * Math.max(0, 1 - offset / el.offsetHeight)})`;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as Element;
      if (target.closest('input, textarea, select')) return;
      const body = el.querySelector('.sheet-body');
      const fromBody = !!body?.contains(target);
      if (fromBody && body && body.scrollTop > 0) return;
      start = { y: e.touches[0].clientY, t: e.timeStamp, fromBody };
      last = { y: start.y, t: start.t };
      dy = 0;
      velocity = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const y = e.touches[0].clientY;
      const next = y - start.y;
      if (next <= 0 && dy === 0) {
        if (start.fromBody) start = null;
        return;
      }
      e.preventDefault();
      dy = Math.max(0, next);
      const dt = e.timeStamp - last.t;
      if (dt > 0) velocity = (y - last.y) / dt;
      last = { y, t: e.timeStamp };
      apply(dy, false);
    };
    const onEnd = () => {
      if (!start) return;
      start = null;
      if (dy > DISMISS_DISTANCE_PX || (dy > FLICK_MIN_PX && velocity > DISMISS_VELOCITY)) {
        apply(el.offsetHeight, true);
        setTimeout(dismiss, SETTLE_MS);
      } else if (dy > 0) {
        apply(0, true);
      }
      dy = 0;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [panel, backdrop, dismiss]);
}
