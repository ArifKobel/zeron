import { useEffect, useState, useSyncExternalStore } from 'react';
import { engine } from '@/engine';
import { isUnknownMethod, type StreamEnd } from '@/rpc';
import { applyFrame, TranscriptDesync, type TranscriptFrame } from '@/transcript';
import type { Entry } from '@/types';

const RESUBSCRIBE_DELAY_MS = 300;
const RETRY_DELAY_MS = 2000;

export function useConnection() {
  const subscribe = (cb: () => void) => engine.onStateChange(cb);
  const state = useSyncExternalStore(subscribe, () => engine.state);
  const epoch = useSyncExternalStore(subscribe, () => engine.epoch);
  return { state, epoch };
}

function useResilientStream<T>(
  method: string,
  params: object | null,
  onItem: (item: T, restart: () => void) => void,
  onError: (message: string | null) => void,
  reset: () => void,
) {
  const { epoch } = useConnection();
  const key = params === null ? null : JSON.stringify(params);
  useEffect(() => {
    reset();
    if (key === null) return;
    let alive = true;
    let cancel = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      cancel = engine.subscribe<T>(
        method,
        JSON.parse(key),
        (item) => alive && onItem(item, restart),
        (end: StreamEnd) => {
          if (!alive || end.kind === 'disconnected') return;
          if (end.kind === 'error') {
            onError(end.message);
            if (isUnknownMethod(end.message)) return;
          }
          timer = setTimeout(open, end.kind === 'error' ? RETRY_DELAY_MS : RESUBSCRIBE_DELAY_MS);
        },
      );
    };
    const restart = () => {
      cancel();
      open();
    };
    open();
    return () => {
      alive = false;
      clearTimeout(timer);
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, key, epoch]);
}

export function useWatch<T>(method: string, params: object | null): T | undefined {
  const [value, setValue] = useState<T>();
  useResilientStream<T>(method, params, (item) => setValue(item), () => {}, () => setValue(undefined));
  return value;
}

export function useTranscript(chatId: string) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useResilientStream<TranscriptFrame>(
    'WatchDocMessages',
    { chatId },
    (frame, restart) => {
      setEntries((current) => {
        try {
          return applyFrame(current ?? [], frame);
        } catch (e) {
          if (!(e instanceof TranscriptDesync)) throw e;
          queueMicrotask(restart);
          return current;
        }
      });
      setError(null);
    },
    setError,
    () => {
      setEntries(null);
      setError(null);
    },
  );
  return { entries, error };
}

export function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}

export function useAsync<T>(load: (() => Promise<T>) | null, deps: unknown[]): { value: T | null; error: string | null } {
  const [state, setState] = useState<{ value: T | null; error: string | null }>({ value: null, error: null });
  useEffect(() => {
    setState({ value: null, error: null });
    if (!load) return;
    let alive = true;
    load().then(
      (value) => alive && setState({ value, error: null }),
      (e: Error) => alive && setState({ value: null, error: e.message }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useHashRoute(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => location.hash.replace(/^#/, '') || '/',
  );
}
