import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDragToDismiss } from '@/ui/useDragToDismiss';

export function Sheet({
  title,
  onClose,
  children,
  footer,
  tall,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismiss = useRef(() => closeRef.current()).current;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [dismiss]);
  useDragToDismiss(panel, backdrop, dismiss);

  return createPortal(
    <div ref={backdrop} className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className={`sheet ${tall ? 'tall' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <div className="sheet-grabber" aria-hidden />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="circle-btn small" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function SheetLabel({ children }: { children: ReactNode }) {
  return <div className="sheet-label">{children}</div>;
}

export function PickRow({
  title,
  subtitle,
  selected,
  disabled,
  busy,
  onClick,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`pick-row ${selected ? 'selected' : ''}`}
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="pick-row-text">
        <span className="pick-row-title">{title}</span>
        {subtitle && <span className="pick-row-subtitle">{subtitle}</span>}
      </span>
      {busy ? <span className="spinner" /> : selected ? <span className="pick-row-check">✓</span> : null}
    </button>
  );
}
