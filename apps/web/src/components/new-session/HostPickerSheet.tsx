import { usePresence } from '@/connectivity';
import { PickRow, Sheet } from '@/ui/Sheet';
import { useWorkspace } from '@/workspace';

export function HostPickerSheet({
  selected,
  onPick,
  onClose,
}: {
  selected: string | null;
  onPick: (deviceId: string) => void;
  onClose: () => void;
}) {
  const ws = useWorkspace();
  const { isOnline } = usePresence();
  return (
    <Sheet title="Select a device" onClose={onClose}>
      {ws.devices.length === 0 ? (
        <p className="sheet-note">Connect a desktop device to start a session. No project is required.</p>
      ) : (
        <>
          <div className="pick-list">
            {ws.devices.map((d) => (
              <PickRow
                key={d.id}
                title={d.name}
                subtitle={isOnline(d.id) ? 'Online' : 'Offline — sends are saved'}
                selected={d.id === selected}
                onClick={() => onPick(d.id)}
              />
            ))}
          </div>
          <p className="sheet-note">Runs in the selected device’s home folder without a project.</p>
        </>
      )}
    </Sheet>
  );
}
