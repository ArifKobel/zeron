import { useMemo, useState } from 'react';
import { ChevronLeft, Folder, FolderGit2, GitBranch, Monitor } from 'lucide-react';
import { createChat, deliver, targetFor } from '@/actions';
import { uploadImages, withAttachments } from '@/attachments';
import { offeredHarnesses, useAllModels, useHarnesses } from '@/catalog';
import { usePresence } from '@/connectivity';
import { back, replace } from '@/route';
import { pendingSends } from '@/sends';
import { useSignedIn } from '@/session';
import { ZeronMark } from '@/ui/Brand';
import { spaceName } from '@/util';
import { useWorkspace } from '@/workspace';
import { Lightbox } from '@/components/Lightbox';
import { Composer } from '@/components/composer/Composer';
import { ConfigChips } from '@/components/composer/ConfigChips';
import { useStagedImages } from '@/components/composer/useStagedImages';
import { CheckoutSheet, RefSheet } from '@/components/new-session/CheckoutSheets';
import { HostPickerSheet } from '@/components/new-session/HostPickerSheet';
import { useCheckout } from '@/components/new-session/useCheckout';
import { useStickyConfig } from '@/components/new-session/useStickyConfig';

export function NewSession({ spaceId, deviceId: initialDevice }: { spaceId: string | null; deviceId: string | null }) {
  const ws = useWorkspace();
  const { config: server } = useSignedIn();
  const { isOnline } = usePresence();
  const space = spaceId ? ws.spaces.find((s) => s.id === spaceId) : undefined;
  const [projectlessDevice, setProjectlessDevice] = useState<string | null>(initialDevice);
  const deviceId = space?.deviceId ?? (spaceId ? null : projectlessDevice);
  const device = ws.devices.find((d) => d.id === deviceId);
  const target = deviceId ? targetFor(ws.gatewayDeviceId, deviceId) : {};

  const harnessCatalog = useHarnesses(target.targetDeviceId, !!deviceId);
  const harnesses = useMemo(
    () => (harnessCatalog.value ? offeredHarnesses(harnessCatalog.value, server.showMockHarness) : null),
    [harnessCatalog.value, server.showMockHarness],
  );
  const allModels = useAllModels(harnesses, target.targetDeviceId);
  const [config, setConfig] = useStickyConfig(harnesses, allModels.value);
  const checkout = useCheckout(space, target);

  const [sheet, setSheet] = useState<'checkout' | 'ref' | 'host' | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const staged = useStagedImages(setError);

  const send = async () => {
    if (!deviceId) return;
    const text = draft.trim();
    const images = staged.images;
    if (!text && !images.length) return;
    setBusy(true);
    setError(null);
    let paths: string[];
    try {
      paths = await uploadImages(images, target);
    } catch (e) {
      setError(`Attachment upload failed — ${(e as Error).message}`);
      setBusy(false);
      return;
    }
    try {
      const { cwd, worktree } = checkout.run();
      const chat = await createChat({ space, deviceId, config, branch: space ? checkout.ref : null, cwd });
      const messageId = await deliver(chat, space, 'run', text, target, { attachments: paths, worktree });
      pendingSends.add({ chatId: chat.id, messageId, text: withAttachments(text, paths), at: Date.now() });
      staged.release(images);
      replace({ kind: 'chat', chatId: chat.id });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const title = space ? spaceName(space) : spaceId ? 'Project unavailable' : 'No project';
  const checkoutLabel = checkout.mode === 'worktree' ? 'New worktree' : checkout.reusesWorktree ? 'Current worktree' : 'Current checkout';

  return (
    <div className="screen new-session">
      <header className="screen-header">
        <button className="circle-btn back-btn" aria-label="Back" onClick={back}>
          <ChevronLeft size={22} />
        </button>
        <div className="screen-heading">
          <div className="screen-title small">New session</div>
          <div className="screen-subtitle">
            {title} · {device?.name ?? 'no device'}
          </div>
        </div>
      </header>

      <div className="new-session-canvas" onClick={() => (document.activeElement as HTMLElement | null)?.blur?.()}>
        <ZeronMark size={84} className="canvas-mark" />
        <div className="canvas-prompt">What are we building?</div>
      </div>

      <div className="session-bottom">
        {deviceId && !isOnline(deviceId) && (
          <div className="offline-notice">{device?.name ?? 'The device'} is offline — the run will start when it reconnects.</div>
        )}
        {!space && !spaceId && (
          <div className="scope-row">
            <button className="chip" onClick={() => setSheet('host')}>
              <Monitor size={14} />
              <span className="chip-label">{device?.name ?? 'Select a device'}</span>
            </button>
          </div>
        )}
        {checkout.git && (
          <div className="scope-row">
            <button className="chip" onClick={() => setSheet('checkout')}>
              {checkout.mode === 'local' && !checkout.reusesWorktree ? <Folder size={14} /> : <FolderGit2 size={14} />}
              <span className="chip-label">{checkoutLabel}</span>
            </button>
            <button className="chip" onClick={() => setSheet('ref')}>
              <GitBranch size={14} />
              <span className="chip-label">
                {checkout.ref ? (checkout.mode === 'worktree' ? `From ${checkout.ref}` : checkout.ref) : 'Select ref'}
              </span>
            </button>
          </div>
        )}
        {harnessCatalog.value && harnesses?.length === 0 && (
          <div className="composer-caption error">No agent is installed on {device?.name ?? 'this device'}.</div>
        )}
        <Composer
          value={draft}
          onChange={setDraft}
          placeholder="Do anything…"
          images={staged.images}
          onAddImages={staged.add}
          onRemoveImage={staged.remove}
          onPreviewImage={staged.setPreview}
          action={busy ? 'busy' : 'send'}
          canSend={!!deviceId && !!harnesses?.length && (!!draft.trim() || staged.images.length > 0)}
          actionLabel="Send message"
          onSend={send}
          alwaysExpanded
          autoFocus
          above={error && <div className="composer-caption error" role="alert">{error}</div>}
          chips={
            harnesses?.length ? (
              <ConfigChips config={config} harnesses={harnesses} models={allModels.value ?? {}} onChange={setConfig} />
            ) : (
              <span className="chip readonly">
                <span className="chip-label">{deviceId ? 'Loading agents…' : 'Choose a device'}</span>
              </span>
            )
          }
        />
      </div>

      {sheet === 'host' && (
        <HostPickerSheet
          selected={projectlessDevice}
          onClose={() => setSheet(null)}
          onPick={(id) => {
            setProjectlessDevice(id);
            setSheet(null);
          }}
        />
      )}
      {sheet === 'checkout' && <CheckoutSheet checkout={checkout} onClose={() => setSheet(null)} />}
      {sheet === 'ref' && <RefSheet checkout={checkout} onClose={() => setSheet(null)} />}
      {staged.preview && (
        <Lightbox src={staged.preview.preview} name={staged.preview.name} onClose={() => staged.setPreview(null)} />
      )}
    </div>
  );
}
