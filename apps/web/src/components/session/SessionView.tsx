import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { CAPABILITY, chooseDelivery, deliver, interrupt, mutate, respondInput, retryDelivery, supports, targetFor } from '@/actions';
import { readImage, uploadImages, withAttachments } from '@/attachments';
import { useModels } from '@/catalog';
import { useChangeRequest } from '@/changeRequest';
import { chatLocation } from '@/chats';
import { useConnectivity, usePresence } from '@/connectivity';
import { engine } from '@/engine';
import { useTick, useTranscript, useWatch } from '@/hooks';
import { usePins } from '@/pins';
import { pendingSends, sendState, useSends } from '@/sends';
import { webDeviceId } from '@/session';
import { reportError } from '@/toast';
import { foldContinuations, pendingInput } from '@/transcript';
import type { Chat, ChatConfig, QueuedMessage } from '@/types';
import { harnessLabel } from '@/ui/Brand';
import { ZeronPulse } from '@/ui/Loaders';
import { sessionFor } from '@/util';
import { displayStatus } from '@/view';
import { useWorkspace } from '@/workspace';
import { Lightbox } from '@/components/Lightbox';
import { PullRequestBadge } from '@/components/PullRequestBadge';
import { Composer } from '@/components/composer/Composer';
import { ConfigChips } from '@/components/composer/ConfigChips';
import { useStagedImages } from '@/components/composer/useStagedImages';
import { QuestionPanel } from '@/components/session/QuestionPanel';
import { QueuePanel } from '@/components/session/QueuePanel';
import { SessionHeader } from '@/components/session/SessionHeader';
import { StatusStrip } from '@/components/session/StatusStrip';
import { useDraft } from '@/components/session/useDraft';
import { useQueueActions } from '@/components/session/useQueueActions';
import { useQueueEdit } from '@/components/session/useQueueEdit';
import { Transcript } from '@/components/transcript/Transcript';

const CLOCK_MS = 1_000;

export function SessionView({ chat }: { chat: Chat }) {
  const ws = useWorkspace();
  const { isOnline } = usePresence();
  const connectivity = useConnectivity();
  useTick(CLOCK_MS);

  const { entries, error: transcriptError } = useTranscript(chat.id);
  const hostTarget = targetFor(ws.gatewayDeviceId, chat.deviceId);
  const targetOf = useCallback((deviceId: string) => targetFor(ws.gatewayDeviceId, deviceId), [ws.gatewayDeviceId]);
  const queue = useWatch<{ items: QueuedMessage[] }>('WatchQueue', { chatId: chat.id, ...hostTarget });
  const models = useModels(chat.config?.harness, hostTarget.targetDeviceId);
  const pr = useChangeRequest(chat, ws.gatewayDeviceId);
  const pins = usePins();
  const mySends = useSends(chat.id);

  const space = ws.spaces.find((s) => s.id === chat.spaceId);
  const host = ws.devices.find((d) => d.id === chat.deviceId);
  const session = sessionFor(ws.sessions, chat);
  const now = Date.now();
  const status = displayStatus(chat, session, now);
  const running = session?.status === 'working';

  const folded = useMemo(() => foldContinuations(entries ?? []), [entries]);
  const question = useMemo(() => pendingInput(folded), [folded]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<number | null>(null);
  const [queuePreview, setQueuePreview] = useState<string | null>(null);
  const draft = useDraft(chat.id);
  const staged = useStagedImages(setError);
  const edit = useQueueEdit({ chatId: chat.id, hostTarget, draft, onError: setError });
  const queueActions = useQueueActions(chat.id, hostTarget, setError);

  useEffect(() => {
    if (entries) pendingSends.adopt(chat.id, new Set(entries.map((e) => e.id)));
  }, [entries, chat.id]);

  useEffect(() => {
    engine.call('FocusChat', { chatId: chat.id }).catch(() => {});
    const seen = () => mutate({ op: 'markChatSeen', chatId: chat.id }).catch(() => {});
    seen();
    return () => void seen();
  }, [chat.id]);
  useEffect(() => {
    if (!chat.lastMessageAt || document.visibilityState !== 'visible') return;
    if (chat.lastSeenAt && Date.parse(chat.lastSeenAt) >= Date.parse(chat.lastMessageAt)) return;
    mutate({ op: 'markChatSeen', chatId: chat.id }).catch(() => {});
  }, [chat.id, chat.lastMessageAt, chat.lastSeenAt]);

  const send = async () => {
    if (edit.editing) return edit.save();
    const text = draft.text.trim();
    const images = staged.images;
    if (!text && !images.length) return;
    const delivery = chooseDelivery(session?.status, host, images.length > 0);
    setBusy(true);
    setError(null);
    let paths: string[];
    try {
      paths = await uploadImages(images, hostTarget, setUpload);
    } catch (e) {
      setError(`Attachment upload failed — ${(e as Error).message}`);
      setBusy(false);
      setUpload(null);
      return;
    }
    setUpload(null);
    try {
      const id = await deliver(chat, space, delivery, text, hostTarget, { attachments: paths });
      if (delivery !== 'queue') {
        pendingSends.add({ chatId: chat.id, messageId: id, text: withAttachments(text, paths), at: Date.now() });
      }
      if (draft.saved().trim() === text) draft.set('');
      staged.release(images);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openQueuedImages = (paths: string[]) => readImage(paths[0], hostTarget).then(setQueuePreview, reportError);
  const setConfig = (config: ChatConfig) => mutate({ op: 'setChatConfig', chatId: chat.id, config }).catch(reportError);

  const delivery = chooseDelivery(session?.status, host, staged.images.length > 0);
  const hasContent = !!draft.text.trim() || staged.images.length > 0;
  const editing = edit.editing;
  const working = busy || edit.saving;

  const captions = (
    <>
      {editing?.warning && <div className="composer-caption warn">{editing.warning}</div>}
      {error && (
        <div className="composer-caption error" role="alert">
          {error}
        </div>
      )}
      {editing && (
        <button className="composer-caption link" onClick={edit.stop}>
          Stop editing
        </button>
      )}
      {!editing && connectivity !== 'connected' && (
        <div className="composer-caption">
          {connectivity === 'offline' ? 'Offline — messages will send when you’re back online.' : 'Messages will send once the connection recovers.'}
        </div>
      )}
    </>
  );

  return (
    <div className="screen session-screen">
      <SessionHeader chat={chat} location={chatLocation(chat, ws.spaces, ws.devices)} pins={pins} />

      {entries === null ? (
        <div className="session-loading">
          {transcriptError ? (
            <span className="error-text">Couldn’t open the session: {transcriptError}</span>
          ) : (
            <ZeronPulse label="Opening session…" />
          )}
        </div>
      ) : (
        <Transcript
          entries={folded}
          pending={mySends.map((s) => ({ id: s.messageId, text: s.text }))}
          hostDeviceId={chat.deviceId}
          targetOf={targetOf}
          scrollKey={chat.id}
        />
      )}

      <div className="session-bottom">
        <StatusStrip
          chatId={chat.id}
          send={sendState(mySends, now, connectivity !== 'connected', isOnline(chat.deviceId))}
          upload={upload}
          connectivity={connectivity}
          status={status}
          session={session}
          now={now}
          onRetry={() => {
            pendingSends.retry(chat.id);
            retryDelivery(chat.id).catch(reportError);
          }}
        />
        <QueuePanel
          items={queue?.items ?? []}
          rowState={(id) => ({ pending: queueActions.pending.has(id), editingHere: editing?.rowId === id })}
          deviceName={(id) => ws.devices.find((d) => d.id === id)?.name ?? 'another device'}
          myDeviceId={webDeviceId()}
          canAct={supports(host, CAPABILITY.queueActions)}
          canEdit={supports(host, CAPABILITY.queueEditLease)}
          hostTarget={hostTarget}
          onEdit={edit.begin}
          onStopEditing={edit.stop}
          onSendNow={queueActions.sendNow}
          onMove={queueActions.move}
          onRemove={queueActions.remove}
          onPreview={openQueuedImages}
        />
        {question && !running && !editing ? (
          <QuestionPanel input={question} onSubmit={(answers) => respondInput(chat.id, question.requestId, answers).then(() => {})} />
        ) : (
          <Composer
            value={draft.text}
            onChange={draft.set}
            placeholder={editing ? 'Edit queued message' : 'Message'}
            images={staged.images}
            onAddImages={editing ? undefined : staged.add}
            onRemoveImage={staged.remove}
            onPreviewImage={staged.setPreview}
            action={working ? 'busy' : running && !hasContent && !editing ? 'stop' : 'send'}
            canSend={hasContent || !!editing}
            actionLabel={editing ? 'Save queued message' : delivery === 'queue' ? 'Queue message' : 'Send message'}
            onSend={send}
            onStop={() => interrupt(chat.id).catch(reportError)}
            above={captions}
            chips={
              <>
                {pr && <PullRequestBadge pr={pr} large />}
                {chat.branch && (
                  <span className="chip readonly">
                    <GitBranch size={13} />
                    <span className="chip-label">{chat.branch}</span>
                  </span>
                )}
                {chat.config && (
                  <ConfigChips
                    config={chat.config}
                    harnesses={[{ id: chat.config.harness, name: harnessLabel(chat.config.harness) }]}
                    models={models.value ? { [chat.config.harness]: models.value } : models.error ? { [chat.config.harness]: [] } : {}}
                    onChange={setConfig}
                  />
                )}
              </>
            }
          />
        )}
      </div>
      {staged.preview && (
        <Lightbox src={staged.preview.preview} name={staged.preview.name} onClose={() => staged.setPreview(null)} />
      )}
      {queuePreview && <Lightbox src={queuePreview} onClose={() => setQueuePreview(null)} />}
    </div>
  );
}
