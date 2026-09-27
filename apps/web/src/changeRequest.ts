import { targetFor } from '@/actions';
import { useWatch } from '@/hooks';
import type { Chat, CheckoutChangeRequestStatus } from '@/types';

export function useChangeRequest(chat: Chat, gatewayDeviceId: string | null) {
  const cwd = chat.cwd?.trim();
  const branch = chat.branch?.trim();
  const params = !chat.archived && cwd && branch ? { cwd, branch, ...targetFor(gatewayDeviceId, chat.deviceId) } : null;
  const status = useWatch<CheckoutChangeRequestStatus>('WatchCheckoutChangeRequest', params);
  if (!status?.changeRequest || !cwd || !branch) return null;
  if (status.deviceId !== chat.deviceId || status.cwd !== cwd || status.branch !== branch) return null;
  if (chat.checkoutId && status.checkoutId !== chat.checkoutId) return null;
  return status.changeRequest;
}
