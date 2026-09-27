import { ArrowRight, ChevronDown, ChevronUp, Ellipsis, Pencil, Trash2, X } from 'lucide-react';
import { readImage } from '@/attachments';
import { useAsync } from '@/hooks';
import type { QueuedMessage, Target } from '@/types';
import { Menu } from '@/ui/Menu';

interface QueueRowState {
  pending: boolean;
  editingHere: boolean;
}

export function QueuePanel({
  items,
  rowState,
  deviceName,
  myDeviceId,
  canAct,
  canEdit,
  hostTarget,
  onEdit,
  onStopEditing,
  onSendNow,
  onMove,
  onRemove,
  onPreview,
}: {
  items: QueuedMessage[];
  rowState: (id: string) => QueueRowState;
  deviceName: (id: string) => string;
  myDeviceId: string;
  canAct: boolean;
  canEdit: boolean;
  hostTarget: Target;
  onEdit: (row: QueuedMessage) => void;
  onStopEditing: () => void;
  onSendNow: (row: QueuedMessage) => void;
  onMove: (row: QueuedMessage, toIndex: number) => void;
  onRemove: (row: QueuedMessage) => void;
  onPreview: (paths: string[]) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="queue-panel" aria-label="Queued messages">
      <div className="queue-caption">{items.length} queued</div>
      <div className="queue-rows">
        {items.map((row, index) => {
          const { pending, editingHere } = rowState(row.id);
          const gate = row.deliveryGate;
          const lockedElsewhere = gate?.kind === 'editing' && gate.ownerDeviceId !== myDeviceId;
          const gated = !!gate;
          let text = row.text;
          if (pending) text = 'Updating…';
          else if (editingHere) text = 'Editing below';
          else if (gate?.kind === 'editing') text = `Editing on ${deviceName(gate.ownerDeviceId ?? '')}`;
          else if (gate) text = 'Needs review';
          const attachments = row.attachments ?? [];
          return (
            <div key={row.id} className={`queue-row ${pending ? 'pending' : ''}`}>
              <span className="queue-index">{index + 1}</span>
              {attachments.length > 0 && (
                <QueueThumb path={attachments[0]} more={attachments.length - 1} target={hostTarget} onClick={() => onPreview(attachments)} />
              )}
              <span className="queue-text-block">
                <span className="queue-text">{text}</span>
                {attachments.length > 0 && <span className="queue-sources">{attachments.map(() => 'Image').join(' · ')}</span>}
              </span>
              {canEdit &&
                (editingHere ? (
                  <button className="queue-btn" aria-label="Stop editing" onClick={onStopEditing}>
                    <X size={16} />
                  </button>
                ) : (
                  <button className="queue-btn" aria-label="Edit" disabled={pending || lockedElsewhere || !canAct} onClick={() => onEdit(row)}>
                    <Pencil size={15} />
                  </button>
                ))}
              <button
                className="queue-btn"
                aria-label="Send now, interrupting the response"
                disabled={pending || gated || !canAct}
                onClick={() => onSendNow(row)}
              >
                <ArrowRight size={16} />
              </button>
              <Menu
                label="More"
                align="end"
                items={[
                  {
                    label: 'Move up',
                    icon: <ChevronUp size={16} />,
                    disabled: index === 0 || gated || pending,
                    onSelect: () => onMove(row, index - 1),
                  },
                  {
                    label: 'Move down',
                    icon: <ChevronDown size={16} />,
                    disabled: index === items.length - 1 || gated || pending,
                    onSelect: () => onMove(row, index + 1),
                  },
                  { label: 'Remove', icon: <Trash2 size={16} />, destructive: true, disabled: pending || !canAct, onSelect: () => onRemove(row) },
                ]}
              >
                <span className="queue-btn">
                  <Ellipsis size={16} />
                </span>
              </Menu>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QueueThumb({ path, more, target, onClick }: { path: string; more: number; target: Target; onClick: () => void }) {
  const image = useAsync(() => readImage(path, target), [path, target.targetDeviceId]);
  return (
    <button className="queue-thumb" aria-label="Queued images" onClick={onClick}>
      {image.value && <img src={image.value} alt="" />}
      {more > 0 && <span>+{more}</span>}
    </button>
  );
}
