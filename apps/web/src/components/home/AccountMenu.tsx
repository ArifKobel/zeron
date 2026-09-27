import { useSyncExternalStore } from 'react';
import { CircleUserRound } from 'lucide-react';
import { usePresence } from '@/connectivity';
import { engine } from '@/engine';
import { restart, useSignedIn } from '@/session';
import { Menu, type MenuItem } from '@/ui/Menu';

export function AccountMenu() {
  const { account, gateway } = useSignedIn();
  const { snapshot, isOnline } = usePresence();
  const gatewayState = useSyncExternalStore(
    (cb) => gateway.subscribe(cb),
    () => gateway.state,
  );
  const user = account.state.status === 'signedIn' ? account.state.user : null;
  const current = snapshot.devices.find((d) => d.id === gatewayState.deviceId);
  const pick = (deviceId: string | null) => {
    gateway.prefer(deviceId);
    engine.reconnect();
  };
  const items: MenuItem[] = [
    { section: user?.email ?? user?.name ?? 'Zeron account' },
    { section: 'Connect through' },
    {
      label: 'Automatic',
      sublabel: !gatewayState.preferred && gatewayState.deviceId ? `Now: ${current?.name ?? '…'}` : undefined,
      checked: !gatewayState.preferred,
      onSelect: () => pick(null),
    },
    ...snapshot.devices.map((d) => ({
      label: d.name,
      sublabel: isOnline(d.id) ? 'Online' : 'Offline',
      checked: gatewayState.preferred === d.id,
      onSelect: () => pick(d.id),
    })),
    { divider: true },
    {
      label: 'Sign out',
      destructive: true,
      onSelect: async () => {
        await account.signOut();
        restart();
      },
    },
  ];
  return (
    <Menu items={items} align="end" label="Account">
      <CircleUserRound size={22} />
    </Menu>
  );
}
