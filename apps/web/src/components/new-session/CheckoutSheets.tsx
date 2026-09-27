import type { RepoRef } from '@/types';
import { PickRow, Sheet, SheetLabel } from '@/ui/Sheet';
import type { useCheckout } from '@/components/new-session/useCheckout';

type Checkout = ReturnType<typeof useCheckout>;

export function CheckoutSheet({ checkout, onClose }: { checkout: Checkout; onClose: () => void }) {
  const worktree = checkout.picked?.worktreePath;
  return (
    <Sheet title="Checkout" onClose={onClose}>
      <SheetLabel>Checkout</SheetLabel>
      <div className="pick-list">
        <PickRow
          title={worktree ? 'Current worktree' : 'Current checkout'}
          subtitle={worktree ? "Reuse the picked ref's existing worktree" : "Run in the project's folder as-is"}
          selected={checkout.mode === 'local'}
          onClick={() => {
            checkout.pickMode('local');
            onClose();
          }}
        />
        <PickRow
          title="New worktree"
          subtitle="A fresh isolated worktree created off the picked base ref"
          selected={checkout.mode === 'worktree'}
          onClick={() => {
            checkout.pickMode('worktree');
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}

export function RefSheet({ checkout, onClose }: { checkout: Checkout; onClose: () => void }) {
  const pick = async (r: RepoRef) => {
    if (await checkout.pickRef(r)) onClose();
  };
  return (
    <Sheet title="Select ref" onClose={onClose}>
      <SheetLabel>Ref</SheetLabel>
      {checkout.refs === null && <p className="sheet-note">Loading refs from the device…</p>}
      <div className="pick-list">
        {checkout.refs?.map((r) => (
          <PickRow
            key={r.name}
            title={r.name}
            subtitle={r.current ? 'Current checkout' : r.worktreePath ? 'Checked out in a worktree' : undefined}
            selected={checkout.ref === r.name}
            busy={checkout.switching === r.name}
            disabled={!!checkout.switching}
            onClick={() => pick(r)}
          />
        ))}
      </div>
      {checkout.error && <div className="error-text">{checkout.error}</div>}
    </Sheet>
  );
}
