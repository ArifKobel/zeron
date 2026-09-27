import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, FolderGit2, Monitor } from 'lucide-react';
import { createSpace, targetFor } from '@/actions';
import { usePresence } from '@/connectivity';
import { engine } from '@/engine';
import { useAsync } from '@/hooks';
import type { FolderListing } from '@/types';
import { Sheet } from '@/ui/Sheet';
import { basename } from '@/util';
import { useWorkspace } from '@/workspace';

const LIST_FOLDERS_TIMEOUT_MS = 20_000;

function parentOf(path: string): string | null {
  const trimmed = path.replace(/[/\\]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (cut < 0) return null;
  if (cut === 0) return trimmed === '/' ? null : '/';
  return trimmed.slice(0, cut) + (/^[A-Za-z]:$/.test(trimmed.slice(0, cut)) ? '\\' : '');
}

function join(path: string, name: string): string {
  const sep = path.includes('\\') && !path.includes('/') ? '\\' : '/';
  return path.endsWith(sep) ? path + name : path + sep + name;
}

export function NewSpaceSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (spaceId: string) => void }) {
  const ws = useWorkspace();
  const { isOnline } = usePresence();
  const devices = ws.devices;
  const [deviceId, setDeviceId] = useState<string | null>(
    () => devices.find((d) => isOnline(d.id))?.id ?? devices[0]?.id ?? null,
  );
  const [path, setPath] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [isRepo, setIsRepo] = useState(false);

  const device = devices.find((d) => d.id === deviceId);
  const folders = useAsync(
    deviceId
      ? () =>
          engine.call<FolderListing>(
            'ListFolders',
            { ...(path ? { path } : {}), ...targetFor(ws.gatewayDeviceId, deviceId) },
            LIST_FOLDERS_TIMEOUT_MS,
          )
      : null,
    [deviceId, path],
  );
  const [listing, setListing] = useState<FolderListing | null>(null);
  useEffect(() => {
    if (folders.value) setListing(folders.value);
  }, [folders.value]);
  const loading = !!deviceId && !folders.value && !folders.error;
  const browse = (next: string | null, repo: boolean) => {
    setPath(next);
    setIsRepo(repo);
    setCreateError(null);
  };
  const error = folders.error ? `Couldn't reach ${device?.name ?? 'the device'}. Make sure it's online.` : createError;

  const create = async () => {
    if (!deviceId || !listing) return;
    setCreating(true);
    try {
      onCreated(await createSpace(ws.spaces, deviceId, listing.path, isRepo));
    } catch (e) {
      setCreateError((e as Error).message);
      setCreating(false);
    }
  };

  if (!devices.length) {
    return (
      <Sheet title="New project" onClose={onClose} tall>
        <div className="sheet-empty">
          <Monitor size={32} strokeWidth={1.25} />
          <strong>No devices yet</strong>
          <span>Run Zeron on a computer first — its folders will show up here.</span>
        </div>
      </Sheet>
    );
  }

  const name = listing ? basename(listing.path) : '';
  const dirs = listing?.entries.filter((e) => e.isDir) ?? [];
  const parent = listing ? parentOf(listing.path) : null;

  return (
    <Sheet
      title="New project"
      onClose={onClose}
      tall
      footer={
        <button className="primary-capsule" disabled={loading || !listing || creating} onClick={create}>
          {creating ? 'Creating…' : name ? `Use “${name}”` : 'Use this folder'}
        </button>
      }
    >
      <div className="device-tabs" role="tablist">
        {devices.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === deviceId}
            className={`device-tab ${d.id === deviceId ? 'selected' : ''}`}
            onClick={() => {
              setDeviceId(d.id);
              setListing(null);
              browse(null, false);
            }}
          >
            <i className={isOnline(d.id) ? 'online' : ''} />
            {d.name}
          </button>
        ))}
      </div>
      <div className="breadcrumb">
        <button
          className="circle-btn small"
          aria-label="Up one folder"
          disabled={!parent || loading}
          onClick={() => parent && browse(parent, false)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="breadcrumb-path" title={listing?.path}>
          <bdi>{listing?.path ?? '…'}</bdi>
        </span>
        {loading && <span className="spinner" />}
      </div>
      {error && <div className="error-text">{error}</div>}
      {listing && !error && (
        <div className="sheet-card">
          {dirs.length === 0 ? (
            <div className="sheet-card-empty">No folders here</div>
          ) : (
            dirs.map((entry) => (
              <button
                key={entry.name}
                className="folder-row"
                onClick={() => browse(join(listing.path, entry.name), entry.isRepo)}
              >
                {entry.isRepo ? <FolderGit2 size={18} className="repo-icon" /> : <Folder size={18} className="folder-icon" />}
                <span className="folder-name">{entry.name}</span>
                {entry.isRepo && <span className="git-capsule">git</span>}
                <ChevronRight size={15} className="folder-chevron" />
              </button>
            ))
          )}
        </div>
      )}
      {listing?.truncated && <p className="sheet-note">Listing truncated — this folder has more entries.</p>}
    </Sheet>
  );
}
