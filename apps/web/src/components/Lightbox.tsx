import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Lightbox({ src, name, onClose }: { src: string; name?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="lightbox" role="dialog" aria-label={name ?? 'Image'} onClick={onClose}>
      <button className="circle-btn lightbox-close" aria-label="Close" onClick={onClose}>
        <X size={18} />
      </button>
      <img src={src} alt={name ?? ''} />
      {name && <div className="lightbox-name">{name}</div>}
    </div>,
    document.body,
  );
}
