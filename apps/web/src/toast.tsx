import { useSyncExternalStore } from 'react';

interface Toast {
  id: number;
  message: string;
}

const TOAST_MS = 6000;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function reportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const id = nextId++;
  toasts = [...toasts, { id, message }];
  emit();
  setTimeout(() => dismiss(id), TOAST_MS);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toasts() {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
  return (
    <div className="toasts" role="status">
      {current.map((t) => (
        <button key={t.id} className="toast" onClick={() => dismiss(t.id)}>
          {t.message}
        </button>
      ))}
    </div>
  );
}
