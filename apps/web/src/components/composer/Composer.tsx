import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Plus, X } from 'lucide-react';
import type { StagedImage } from '@/attachments';

const EXPAND_CHARS = 26;
const MAX_LINES = 7;
const FALLBACK_LINE_PX = 24;
const EDITOR_PADDING_PX = 4;
const BLUR_GRACE_MS = 200;

type ComposerAction = 'send' | 'stop' | 'busy';

export function Composer({
  value,
  onChange,
  placeholder,
  images,
  onAddImages,
  onRemoveImage,
  onPreviewImage,
  chips,
  action,
  canSend,
  actionLabel,
  onSend,
  onStop,
  alwaysExpanded,
  autoFocus,
  above,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  images: StagedImage[];
  onAddImages?: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  onPreviewImage: (image: StagedImage) => void;
  chips?: ReactNode;
  action: ComposerAction;
  canSend: boolean;
  actionLabel: string;
  onSend: () => void;
  onStop?: () => void;
  alwaysExpanded?: boolean;
  autoFocus?: boolean;
  above?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editor = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const expanded = alwaysExpanded || focused || images.length > 0 || value.includes('\n') || value.length > EXPAND_CHARS;

  useEffect(() => {
    if (autoFocus && matchMedia('(pointer: fine)').matches) editor.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = editor.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = parseFloat(getComputedStyle(el).lineHeight) || FALLBACK_LINE_PX;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_LINES + EDITOR_PADDING_PX)}px`;
  }, [value, expanded]);

  const actionButton =
    action === 'stop' ? (
      <button className="action-circle stop" aria-label="Stop response" onClick={onStop}>
        <span className="stop-square" />
      </button>
    ) : (
      <button
        className={`action-circle ${canSend && action === 'send' ? 'active' : ''}`}
        aria-label={actionLabel}
        disabled={!canSend || action === 'busy'}
        onClick={onSend}
      >
        {action === 'busy' ? <span className="spinner dark" /> : <ArrowUp size={18} strokeWidth={2.4} />}
      </button>
    );

  return (
    <div className="composer-wrap">
      {above}
      <div
        className={`composer ${expanded ? 'expanded' : 'collapsed'}`}
        onMouseDown={(e) => {
          const target = e.target as Element;
          if (target.closest('textarea')) return;
          e.preventDefault();
          if (!target.closest('button, a, input')) editor.current?.focus();
        }}
      >
        {images.length > 0 && (
          <div className="staged-images">
            {images.map((image) => (
              <div key={image.id} className="staged-image">
                <button className="staged-thumb" aria-label={`Preview ${image.name}`} onClick={() => onPreviewImage(image)}>
                  <img src={image.preview} alt="" />
                </button>
                <button className="staged-remove" aria-label={`Remove ${image.name}`} onClick={() => onRemoveImage(image.id)}>
                  <X size={11} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="composer-editor-row">
          <textarea
            ref={editor}
            rows={1}
            value={value}
            placeholder={placeholder}
            aria-label="Message"
            onFocus={() => {
              clearTimeout(blurTimer.current);
              setFocused(true);
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setFocused(false), BLUR_GRACE_MS);
            }}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
              if (files.length && onAddImages) {
                e.preventDefault();
                onAddImages(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              const hardware = matchMedia('(pointer: fine)').matches;
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (hardware && !e.shiftKey))) {
                e.preventDefault();
                if (canSend && action === 'send') onSend();
              } else if (e.key === 'Escape' && action === 'stop') onStop?.();
            }}
          />
          {!expanded && actionButton}
        </div>
        {expanded && (
          <div className="composer-toolbar">
            {onAddImages && (
              <>
                <button className="attach-circle" aria-label="Attach images" onClick={() => file.current?.click()}>
                  <Plus size={20} />
                </button>
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    onAddImages([...(e.target.files ?? [])]);
                    e.target.value = '';
                  }}
                />
              </>
            )}
            <div className="chip-scroller">{chips}</div>
            {actionButton}
          </div>
        )}
      </div>
    </div>
  );
}
