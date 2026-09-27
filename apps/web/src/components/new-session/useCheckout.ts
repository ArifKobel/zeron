import { useEffect, useState } from 'react';
import { switchRef, type WorktreeSpec } from '@/actions';
import { engine } from '@/engine';
import type { RepoRef, Space, Target } from '@/types';

const LIST_REFS_TIMEOUT_MS = 30_000;

type CheckoutMode = 'local' | 'worktree';

export function useCheckout(space: Space | undefined, target: Target) {
  const git = !!space?.gitDetected;
  const [mode, setMode] = useState<CheckoutMode>('local');
  const [refs, setRefs] = useState<RepoRef[] | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRefs = async () => {
    if (!space || !git) return;
    try {
      const list = await engine.call<RepoRef[]>('ListRefs', { repoPath: space.path, ...target }, LIST_REFS_TIMEOUT_MS);
      setRefs(list);
      setRef((current) => (current && list.some((r) => r.name === current) ? current : (list.find((r) => r.current) ?? list[0])?.name ?? null));
    } catch {
      setRefs([]);
    }
  };
  useEffect(() => {
    void loadRefs();
  }, [space?.id, git]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = refs?.find((r) => r.name === ref);
  const reusesWorktree = mode === 'local' && !!picked?.worktreePath;

  const pickRef = async (r: RepoRef): Promise<boolean> => {
    setError(null);
    if (r.worktreePath) {
      setMode('local');
      setRef(r.name);
      return true;
    }
    if (mode === 'worktree' || r.current || !space) {
      setRef(r.name);
      return true;
    }
    setSwitching(r.name);
    const failure = await switchRef(space.path, r.name, target);
    setSwitching(null);
    if (failure) {
      setError(failure);
      return false;
    }
    setRef(r.name);
    await loadRefs();
    return true;
  };

  const pickMode = (next: CheckoutMode) => {
    if (next === 'local' && picked && !picked.current && !picked.worktreePath) {
      setRef(refs?.find((r) => r.current)?.name ?? ref);
    }
    setMode(next);
  };

  const run = (): { cwd: string | null; worktree?: WorktreeSpec } => {
    if (!space) return { cwd: '~' };
    if (mode === 'worktree') return { cwd: space.path, worktree: { repoPath: space.path, base: ref ?? 'HEAD', spaceId: space.id } };
    return { cwd: reusesWorktree && picked?.worktreePath ? picked.worktreePath : space.path };
  };

  return { git, mode, refs, ref, picked, reusesWorktree, switching, error, pickRef, pickMode, run };
}
