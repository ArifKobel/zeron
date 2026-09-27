import { engine } from '@/engine';
import { useAsync } from '@/hooks';
import type { ChatConfig, HarnessInfo, Model } from '@/types';

const LIST_MODELS_TIMEOUT_MS = 110_000;

const modelCache = new Map<string, Promise<Model[]>>();
const harnessCache = new Map<string, Promise<HarnessInfo[]>>();

function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let pending = cache.get(key);
  if (!pending) {
    pending = load();
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

const target = (targetDeviceId?: string) => (targetDeviceId ? { targetDeviceId } : {});

function loadHarnesses(targetDeviceId?: string) {
  return cached(harnessCache, targetDeviceId ?? '', () => engine.call<HarnessInfo[]>('ListHarnesses', target(targetDeviceId)));
}

function loadModels(harness: string, targetDeviceId?: string) {
  return cached(modelCache, `${harness}@${targetDeviceId ?? ''}`, () =>
    engine.call<Model[]>('ListModels', { harness, ...target(targetDeviceId) }, LIST_MODELS_TIMEOUT_MS),
  );
}

export function offeredHarnesses(harnesses: HarnessInfo[], showMock = false): HarnessInfo[] {
  return harnesses.filter((h) =>
    h.id === 'mock' ? showMock : h.installed && (h.enabled ?? ['claude-code', 'codex'].includes(h.id)),
  );
}

export function useHarnesses(targetDeviceId: string | undefined, enabled: boolean) {
  return useAsync(enabled ? () => loadHarnesses(targetDeviceId) : null, [targetDeviceId, enabled]);
}

export function useModels(harness: string | null | undefined, targetDeviceId?: string) {
  return useAsync(harness ? () => loadModels(harness, targetDeviceId) : null, [harness, targetDeviceId]);
}

export function useAllModels(harnesses: HarnessInfo[] | null, targetDeviceId?: string) {
  const key = harnesses?.map((h) => h.id).join(',') ?? '';
  return useAsync(
    harnesses
      ? () =>
          Promise.all(
            harnesses.map((h) => loadModels(h.id, targetDeviceId).then((models) => [h.id, models] as const, () => [h.id, []] as const)),
          ).then((pairs) => Object.fromEntries(pairs) as Record<string, Model[]>)
      : null,
    [key, targetDeviceId],
  );
}

export const TRAITS: Record<string, { label: string; hint: string }> = {
  minimal: { label: 'Minimal', hint: 'Quickest, lightest touch' },
  low: { label: 'Low', hint: 'Fastest responses' },
  medium: { label: 'Medium', hint: 'Balanced speed and depth' },
  high: { label: 'High', hint: 'Thorough reasoning' },
  xhigh: { label: 'X-High', hint: 'Extended reasoning' },
  max: { label: 'Max', hint: 'Maximum reasoning budget' },
  ultra: { label: 'Ultra', hint: 'Highest Codex tier' },
  ultracode: { label: 'Ultracode', hint: 'X-High plus the ultracode setting' },
  ultrathink: { label: 'Ultrathink', hint: 'Deep-thinking prompt mode' },
};

export const OPTION_HINTS: Record<string, Record<string, string>> = {
  serviceTier: { standard: 'Standard response speed', fast: 'Faster responses with increased usage' },
};

export function defaultReasoning(model: Model | undefined): string | null {
  const levels = model?.reasoningLevels ?? [];
  if (!levels.length) return null;
  return levels.includes('high') ? 'high' : levels.includes('medium') ? 'medium' : levels[0];
}

export function carryOptions(options: Record<string, unknown> | undefined, model: Model | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, choice] of Object.entries(options ?? {})) {
    const option = model?.options.find((o) => o.id === id);
    if (!option || option.defaultChoice === choice) continue;
    if (option.choices.some((c) => c.id === choice)) out[id] = choice;
  }
  return out;
}

export function pickModel(config: ChatConfig, harness: string, model: Model | undefined): ChatConfig {
  const reasoning =
    config.reasoning && model?.reasoningLevels.includes(config.reasoning) ? config.reasoning : defaultReasoning(model);
  return {
    ...config,
    harness,
    model: model?.id ?? null,
    reasoning,
    modelOptions: carryOptions(config.modelOptions, model),
  };
}

export function pickOption(config: ChatConfig, model: Model | undefined, optionId: string, choice: string): ChatConfig {
  const option = model?.options.find((o) => o.id === optionId);
  const next = { ...(config.modelOptions ?? {}) };
  if (option && option.defaultChoice === choice) delete next[optionId];
  else next[optionId] = choice;
  return { ...config, modelOptions: next };
}
