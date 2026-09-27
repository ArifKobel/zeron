import { useState } from 'react';
import { Copy, Monitor } from 'lucide-react';
import { parseAppshots, parseAttachments, type AppshotPresentation } from '@/attachments';
import type { Target } from '@/types';
import { copyText } from '@/ui/clipboard';
import { MenuPopover } from '@/ui/Menu';
import { useContextMenu } from '@/ui/useContextMenu';
import { RemoteImage } from '@/components/transcript/RemoteImage';
import type { OpenImage } from '@/components/transcript/types';

const LONG_CHARS = 400;
const LONG_LINES = 5;

export function UserBubble({
  content,
  unsent,
  hostTarget,
  onOpenImage,
}: {
  content: string;
  unsent?: boolean;
  hostTarget: Target;
  onOpenImage: OpenImage;
}) {
  const { appshots } = parseAppshots(content);
  const { text, paths } = parseAttachments(content);
  const visible = parseAppshots(text).text;
  const long = visible.length > LONG_CHARS || visible.split('\n').length > LONG_LINES;
  const [expanded, setExpanded] = useState(false);
  const menu = useContextMenu();
  const shots = paths.filter((p) => appshots.has(p));
  const images = paths.filter((p) => !appshots.has(p));

  return (
    <div className={`msg user ${unsent ? 'unsent' : ''}`}>
      {shots.length > 0 && (
        <div className="appshot-strip">
          {shots.map((path) => (
            <AppshotCard key={path} path={path} info={appshots.get(path)!} target={hostTarget} onOpen={onOpenImage} />
          ))}
        </div>
      )}
      {images.length > 0 && (
        <div className="bubble-images">
          {images.map((path) => (
            <RemoteImage key={path} path={path} sources={[hostTarget]} className="bubble-thumb" onOpen={onOpenImage} />
          ))}
        </div>
      )}
      {visible.trim() && (
        <div className="bubble" {...menu.handlers}>
          <div className={long && !expanded ? 'clamped' : undefined}>{visible}</div>
          {long && (
            <button className="show-more" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
      {menu.at && (
        <MenuPopover
          anchor={menu.at}
          align="start"
          items={[{ label: 'Copy', icon: <Copy size={16} />, onSelect: () => copyText(visible) }]}
          onClose={menu.close}
        />
      )}
    </div>
  );
}

function AppshotCard({ path, info, target, onOpen }: { path: string; info: AppshotPresentation; target: Target; onOpen: OpenImage }) {
  return (
    <figure className="appshot-card">
      <RemoteImage path={path} sources={[target]} className="appshot-image" onOpen={onOpen} />
      <figcaption>
        <span className="appshot-app">
          <Monitor size={11} />
          {info.app} · Appshot
        </span>
        {info.windowTitle && <span className="appshot-title">{info.windowTitle}</span>}
      </figcaption>
    </figure>
  );
}
