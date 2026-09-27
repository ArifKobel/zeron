import type { Connectivity } from '@/connectivity';
import { flavourWord } from '@/motion';
import type { SendState } from '@/sends';
import type { Session } from '@/types';
import { WorkingSpinner } from '@/ui/Loaders';
import { formatDuration } from '@/util';
import type { ChatIndicator } from '@/view';

export function StatusStrip({
  chatId,
  send,
  upload,
  connectivity,
  status,
  session,
  now,
  onRetry,
}: {
  chatId: string;
  send: SendState | null;
  upload: number | null;
  connectivity: Connectivity;
  status: ChatIndicator;
  session: Session | undefined;
  now: number;
  onRetry: () => void;
}) {
  let content: React.ReactNode = null;
  if (send === 'failed') {
    content = (
      <button className="strip-retry" onClick={onRetry}>
        Not delivered — tap to retry
      </button>
    );
  } else if (send === 'queued') {
    content = (
      <>
        <i className="warn-dot" /> Queued — will send automatically
      </>
    );
  } else if (upload !== null) {
    content = `Uploading… ${Math.round(upload * 100)}%`;
  } else if (send === 'sending') {
    content = 'Sending…';
  } else if (connectivity === 'offline') {
    content = (
      <>
        <i className="warn-dot" /> Offline
      </>
    );
  } else if (connectivity === 'reconnecting') {
    content = 'Reconnecting…';
  } else if (status === 'working') {
    const since = Date.parse(session?.startedAt ?? session?.updatedAt ?? '') || now;
    content = (
      <>
        <WorkingSpinner />
        <span className="strip-word">{flavourWord(chatId, now - since)}…</span>
        <span className="strip-elapsed">{formatDuration(now - since)}</span>
      </>
    );
  } else if (session?.status === 'errored' && status === 'errored') {
    content = <span className="strip-error">Run failed</span>;
  }
  return (
    <div className="status-strip" aria-live="polite">
      {content}
    </div>
  );
}
