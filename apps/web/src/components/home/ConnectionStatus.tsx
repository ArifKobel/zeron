import { useConnectivity } from '@/connectivity';
import { MiniSpinner } from '@/ui/Loaders';

export function ConnectionStatus() {
  const connectivity = useConnectivity();
  if (connectivity === 'connected') return <span className="connection-status" />;
  if (connectivity === 'connecting') {
    return (
      <span className="connection-status" role="status" aria-label="Connecting">
        <MiniSpinner />
      </span>
    );
  }
  return (
    <span className="connection-status" role="status">
      {connectivity === 'offline' ? <i className="warn-dot" /> : <MiniSpinner />}
      {connectivity === 'offline' ? 'Offline' : 'Reconnecting…'}
    </span>
  );
}
