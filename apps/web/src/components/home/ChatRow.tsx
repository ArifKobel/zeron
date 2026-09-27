import { Archive, Check, GitBranch, Pin, PinOff } from 'lucide-react';
import type { SendState } from '@/sends';
import type { ChangeRequest, Chat } from '@/types';
import { HarnessMark } from '@/ui/Brand';
import { MiniSpinner } from '@/ui/Loaders';
import { chatTitle } from '@/util';
import { formatTimeAgo, lastActivity, type ChatIndicator } from '@/view';
import { PullRequestBadge } from '@/components/PullRequestBadge';
import { SwipeRow } from '@/components/home/SwipeRow';

const STATUS: Partial<Record<ChatIndicator, string>> = {
  working: 'Working',
  awaitingInput: 'Input',
  errored: 'Failed',
  completed: 'Done',
};

interface RowActions {
  pinned: boolean;
  canPin: boolean;
  onPin: () => void;
  onArchive: () => void;
}

export function ChatRow({
  chat,
  location,
  status,
  send,
  pr,
  selected,
  actions,
  onOpen,
}: {
  chat: Chat;
  location: string;
  status: ChatIndicator;
  send: SendState | null;
  pr: ChangeRequest | null;
  selected: boolean;
  actions: RowActions;
  onOpen: () => void;
}) {
  const pinIcon = actions.pinned ? <PinOff size={20} /> : <Pin size={20} />;
  return (
    <SwipeRow
      chatId={chat.id}
      className={`chat-row ${selected ? 'selected' : ''}`}
      left={actions.canPin ? { icon: pinIcon, run: actions.onPin } : null}
      right={{ icon: <Archive size={20} />, run: actions.onArchive }}
      menu={[
        {
          label: actions.pinned ? 'Unpin' : 'Pin',
          icon: actions.pinned ? <PinOff size={16} /> : <Pin size={16} />,
          disabled: !actions.canPin,
          onSelect: actions.onPin,
        },
        { label: 'Archive', icon: <Archive size={16} />, onSelect: actions.onArchive },
      ]}
      onOpen={onOpen}
    >
      <div className="row-line1">
        <span className="row-location">{location}</span>
        <StatusCorner chat={chat} status={status} send={send} />
      </div>
      <div className="row-title">
        {actions.pinned && <Pin size={12} className="row-pin" aria-label="Pinned" />}
        <span>{chatTitle(chat)}</span>
      </div>
      <div className={`row-line3 ${pr ? 'has-pr' : ''}`}>
        <HarnessMark harness={chat.config?.harness} size={12} />
        {chat.branch && (
          <span className="row-branch">
            <GitBranch size={12} />
            <span>{chat.branch}</span>
          </span>
        )}
        {status === 'working' && !send && (
          <span className="row-spinner">
            <MiniSpinner />
          </span>
        )}
      </div>
      {pr && (
        <span className="row-pr">
          <PullRequestBadge pr={pr} />
        </span>
      )}
    </SwipeRow>
  );
}

function StatusCorner({ chat, status, send }: { chat: Chat; status: ChatIndicator; send: SendState | null }) {
  if (send === 'failed' || send === 'queued') {
    return (
      <span className={`status-corner send-${send}`}>
        <i />
        {send === 'failed' ? 'Failed' : 'Queued'}
      </span>
    );
  }
  if (status === 'idle') {
    return <span className="row-time">{formatTimeAgo(lastActivity(chat), Date.now())}</span>;
  }
  return (
    <span className={`status-corner ${status}`}>
      {status === 'completed' ? <Check size={11} strokeWidth={2.5} /> : <i />}
      {STATUS[status]}
    </span>
  );
}
