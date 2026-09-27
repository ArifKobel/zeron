import { useEffect, useState } from 'react';
import { defaultReasoning } from '@/catalog';
import type { ChatConfig, HarnessInfo, Model } from '@/types';

const STICKY = { harness: 'zeron-web.newSessionHarness', model: 'zeron-web.newSessionModel', reasoning: 'zeron-web.newSessionReasoning' };
const DEFAULT_HARNESS = 'claude-code';

function remember(key: string, value: string | null) {
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

export function useStickyConfig(harnesses: HarnessInfo[] | null, models: Record<string, Model[]> | null) {
  const [config, setConfigState] = useState<ChatConfig>(() => ({
    harness: localStorage.getItem(STICKY.harness) ?? DEFAULT_HARNESS,
    model: localStorage.getItem(STICKY.model),
    reasoning: localStorage.getItem(STICKY.reasoning),
    modelOptions: {},
    sandbox: 'workspace-write',
  }));
  const setConfig = (next: ChatConfig) => {
    setConfigState(next);
    remember(STICKY.harness, next.harness);
    remember(STICKY.model, next.model ?? null);
    remember(STICKY.reasoning, next.reasoning ?? null);
  };

  useEffect(() => {
    if (!harnesses?.length) return;
    let next = config;
    if (!harnesses.some((h) => h.id === next.harness)) {
      next = { ...next, harness: harnesses[0].id, model: null, reasoning: null, modelOptions: {} };
    }
    const list = models?.[next.harness];
    if (list?.length && !list.some((m) => m.id === next.model)) {
      next = { ...next, model: list[0].id, reasoning: defaultReasoning(list[0]), modelOptions: {} };
    } else if (list?.length && next.reasoning) {
      const model = list.find((m) => m.id === next.model);
      if (model && !model.reasoningLevels.includes(next.reasoning)) next = { ...next, reasoning: defaultReasoning(model) };
    }
    if (next !== config) setConfig(next);
  }, [harnesses, models]); // eslint-disable-line react-hooks/exhaustive-deps

  return [config, setConfig] as const;
}
