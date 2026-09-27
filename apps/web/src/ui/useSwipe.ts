import { useRef, useState, type PointerEvent } from 'react';

const COMMIT_PX = 96;
const MAX_OFFSET_PX = 160;
const AXIS_LOCK_PX = 8;
const HORIZONTAL_BIAS = 1.2;

export function useSwipe({ left, right }: { left: (() => void) | null; right: (() => void) | null }) {
  const [dx, setDxState] = useState(0);
  const dxRef = useRef(0);
  const setDx = (value: number) => {
    dxRef.current = value;
    setDxState(value);
  };
  const start = useRef<{ x: number; y: number; id: number; locked: boolean | null } | null>(null);
  const swallowClick = useRef(false);

  const clamp = (value: number) => {
    if (value > 0 && !left) return 0;
    if (value < 0 && !right) return 0;
    return Math.max(-MAX_OFFSET_PX, Math.min(MAX_OFFSET_PX, value));
  };

  const handlers = {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType !== 'touch') return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: null };
    },
    onPointerMove(e: PointerEvent) {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (s.locked === null && Math.hypot(mx, my) > AXIS_LOCK_PX) {
        s.locked = Math.abs(mx) > Math.abs(my) * HORIZONTAL_BIAS;
        if (s.locked) {
          try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          } catch {
          }
        }
      }
      if (s.locked) setDx(clamp(mx));
    },
    onPointerUp() {
      const s = start.current;
      start.current = null;
      if (!s?.locked) return;
      swallowClick.current = true;
      const offset = dxRef.current;
      if (offset >= COMMIT_PX) left?.();
      else if (offset <= -COMMIT_PX) right?.();
      setDx(0);
    },
    onPointerCancel() {
      start.current = null;
      setDx(0);
    },
  };

  return {
    dx,
    revealed: dx > 0 ? 'reveal-left' : dx < 0 ? 'reveal-right' : null,
    handlers,
    consumeClick() {
      const swallow = swallowClick.current;
      swallowClick.current = false;
      return swallow;
    },
  };
}
