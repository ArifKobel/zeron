import { useEffect, useState, useSyncExternalStore } from 'react';
import { useConnection } from '@/hooks';
import { useSignedIn } from '@/session';

export type Connectivity = 'connected' | 'connecting' | 'reconnecting' | 'offline';

const DEGRADED_GRACE_MS = 4_000;

export function useConnectivity(): Connectivity {
  const { state, epoch } = useConnection();
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
  const raw: Connectivity = !online ? 'offline' : state === 'open' ? 'connected' : epoch === 0 ? 'connecting' : 'reconnecting';
  const [shown, setShown] = useState<Connectivity>(raw);
  useEffect(() => {
    if (raw === 'connected' || raw === 'connecting') {
      setShown(raw);
      return;
    }
    const timer = setTimeout(() => setShown(raw), DEGRADED_GRACE_MS);
    return () => clearTimeout(timer);
  }, [raw]);
  return shown;
}

export function usePresence() {
  const { presence } = useSignedIn();
  const snapshot = useSyncExternalStore(
    (cb) => presence.subscribe(cb),
    () => presence.snapshot,
  );
  return { snapshot, isOnline: (deviceId: string) => presence.isOnline(deviceId) };
}
