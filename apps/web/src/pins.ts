import { useWatch } from '@/hooks';
import type { SidebarPreferences } from '@/types';

export function usePins(): { ids: string[]; ready: boolean } {
  const prefs = useWatch<SidebarPreferences>('WatchSidebarPreferences', {});
  return { ids: prefs?.pinnedSessionIds ?? [], ready: !!prefs && (prefs.synced || prefs.initialized) };
}
