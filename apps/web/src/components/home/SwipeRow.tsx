import type { ReactNode } from 'react';
import { href } from '@/route';
import { MenuPopover, type MenuItem } from '@/ui/Menu';
import { useContextMenu } from '@/ui/useContextMenu';
import { useSwipe } from '@/ui/useSwipe';

type SwipeAction = { icon: ReactNode; run: () => void; className?: string };

export function SwipeRow({
  chatId,
  className,
  left,
  right,
  menu,
  onOpen,
  children,
}: {
  chatId: string;
  className: string;
  left: SwipeAction | null;
  right: SwipeAction;
  menu: MenuItem[];
  onOpen: () => void;
  children: ReactNode;
}) {
  const swipe = useSwipe({ left: left?.run ?? null, right: right.run });
  const contextMenu = useContextMenu();
  return (
    <div className={`chat-row-shell ${swipe.revealed ?? ''}`}>
      {left && (
        <div className={`swipe-action left ${left.className ?? ''}`} aria-hidden>
          {left.icon}
        </div>
      )}
      <div className={`swipe-action right ${right.className ?? ''}`} aria-hidden>
        {right.icon}
      </div>
      <a
        href={href({ kind: 'chat', chatId })}
        className={className}
        style={{ transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined }}
        onClick={(e) => {
          e.preventDefault();
          if (!swipe.consumeClick()) onOpen();
        }}
        onContextMenu={contextMenu.handlers.onContextMenu}
        {...swipe.handlers}
      >
        {children}
      </a>
      {contextMenu.at && <MenuPopover anchor={contextMenu.at} align="start" items={menu} onClose={contextMenu.close} />}
    </div>
  );
}
