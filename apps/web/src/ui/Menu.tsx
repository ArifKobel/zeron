import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export type MenuItem =
  | {
      label: string;
      sublabel?: string;
      icon?: ReactNode;
      checked?: boolean;
      destructive?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { divider: true }
  | { section: string };

const MARGIN = 8;
const GAP = 6;

export function Menu({
  items,
  children,
  align = 'start',
  label,
}: {
  items: MenuItem[];
  children: ReactNode;
  align?: 'start' | 'end';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        className="menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
      >
        {children}
      </button>
      {open && trigger.current && (
        <MenuPopover anchor={trigger.current} align={align} items={items} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function MenuPopover({
  anchor,
  align,
  items,
  onClose,
}: {
  anchor: HTMLElement | { x: number; y: number };
  align: 'start' | 'end';
  items: MenuItem[];
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const box = 'getBoundingClientRect' in anchor ? anchor.getBoundingClientRect() : null;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    let left = box ? (align === 'end' ? box.right - width : box.left) : (anchor as { x: number }).x;
    let top = box ? box.bottom + GAP : (anchor as { y: number }).y;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));
    if (top + height > window.innerHeight - MARGIN && box) top = Math.max(MARGIN, box.top - height - GAP);
    setPosition({ left, top });
  }, [anchor, align]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target)) return;
      if ('contains' in anchor && anchor.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panel}
      className="menu"
      role="menu"
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden', left: 0, top: 0 }}
    >
      {items.map((item, i) => {
        if ('divider' in item) return <div key={i} className="menu-divider" role="separator" />;
        if ('section' in item) {
          return (
            <div key={i} className="menu-section">
              {item.section}
            </div>
          );
        }
        return (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${item.destructive ? 'destructive' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className="menu-item-check">{item.checked && <Check size={16} />}</span>
            <span className="menu-item-text">
              <span>{item.label}</span>
              {item.sublabel && <span className="menu-item-sublabel">{item.sublabel}</span>}
            </span>
            {item.icon && <span className="menu-item-icon">{item.icon}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
