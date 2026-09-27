import { useRef, useState } from 'react';

const LONG_PRESS_MS = 500;

export function useContextMenu() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cancel = () => clearTimeout(timer.current);
  const handlers = {
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      setAt({ x: e.clientX, y: e.clientY });
    },
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType !== 'touch') return;
      const { clientX: x, clientY: y } = e;
      timer.current = setTimeout(() => setAt({ x, y }), LONG_PRESS_MS);
    },
    onPointerUp: cancel,
    onPointerMove: cancel,
    onPointerCancel: cancel,
  };
  return { at, close: () => setAt(null), handlers };
}
