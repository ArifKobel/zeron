import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { OPTION_HINTS, TRAITS, pickModel, pickOption } from '@/catalog';
import type { ChatConfig, HarnessInfo, Model } from '@/types';
import { HarnessMark, harnessLabel } from '@/ui/Brand';
import { PickRow, Sheet, SheetLabel } from '@/ui/Sheet';

type HarnessChoice = Pick<HarnessInfo, 'id' | 'name'>;

type Open = { kind: 'model' } | { kind: 'effort' } | { kind: 'option'; id: string } | null;

export function ConfigChips({
  config,
  harnesses,
  models,
  onChange,
}: {
  config: ChatConfig;
  harnesses: HarnessChoice[];
  models: Record<string, Model[]>;
  onChange: (config: ChatConfig) => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const model = models[config.harness]?.find((m) => m.id === config.model);
  const modelLabel = model?.label ?? config.model ?? (models[config.harness] ? 'Default model' : 'Loading…');
  const levels = model?.reasoningLevels ?? [];

  return (
    <>
      <button className="chip" onClick={() => setOpen({ kind: 'model' })} aria-label={`Model: ${modelLabel}`}>
        <HarnessMark harness={config.harness} size={15} />
        <span className="chip-label">{modelLabel}</span>
        <ChevronDown size={11} strokeWidth={3} />
      </button>
      {levels.length > 0 && (
        <button className="chip" onClick={() => setOpen({ kind: 'effort' })} aria-label="Effort">
          <span className="chip-label">{config.reasoning ? (TRAITS[config.reasoning]?.label ?? config.reasoning) : 'Effort'}</span>
          <ChevronDown size={11} strokeWidth={3} />
        </button>
      )}
      {model?.options.map((option) => {
        const choice = (config.modelOptions?.[option.id] as string | undefined) ?? option.defaultChoice;
        return (
          <button key={option.id} className="chip" onClick={() => setOpen({ kind: 'option', id: option.id })} aria-label={option.label}>
            <span className="chip-label">{option.choices.find((c) => c.id === choice)?.label ?? choice}</span>
            <ChevronDown size={11} strokeWidth={3} />
          </button>
        );
      })}

      {open?.kind === 'model' && (
        <ModelSheet
          config={config}
          harnesses={harnesses}
          models={models}
          onClose={() => setOpen(null)}
          onPick={(harness, picked) => {
            onChange(pickModel(config, harness, picked));
            setOpen(null);
          }}
        />
      )}
      {open?.kind === 'effort' && (
        <Sheet title="Traits" onClose={() => setOpen(null)}>
          <SheetLabel>Effort</SheetLabel>
          <div className="pick-list">
            {levels.map((level) => (
              <PickRow
                key={level}
                title={TRAITS[level]?.label ?? level}
                subtitle={TRAITS[level]?.hint}
                selected={config.reasoning === level}
                onClick={() => {
                  onChange({ ...config, reasoning: level });
                  setOpen(null);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}
      {open?.kind === 'option' &&
        (() => {
          const option = model?.options.find((o) => o.id === open.id);
          if (!option) return null;
          const current = (config.modelOptions?.[option.id] as string | undefined) ?? option.defaultChoice;
          return (
            <Sheet title={option.label} onClose={() => setOpen(null)}>
              <SheetLabel>{option.label}</SheetLabel>
              <div className="pick-list">
                {option.choices.map((choice) => (
                  <PickRow
                    key={choice.id}
                    title={choice.label}
                    subtitle={OPTION_HINTS[option.id]?.[choice.id]}
                    selected={current === choice.id}
                    onClick={() => {
                      onChange(pickOption(config, model, option.id, choice.id));
                      setOpen(null);
                    }}
                  />
                ))}
              </div>
            </Sheet>
          );
        })()}
    </>
  );
}

function ModelSheet({
  config,
  harnesses,
  models,
  onPick,
  onClose,
}: {
  config: ChatConfig;
  harnesses: HarnessChoice[];
  models: Record<string, Model[]>;
  onPick: (harness: string, model: Model | undefined) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string>(config.harness);
  const single = harnesses.length <= 1;
  return (
    <Sheet title="Select model" onClose={onClose} tall={!single}>
      <SheetLabel>Model</SheetLabel>
      {harnesses.map((h) => {
        const list = models[h.id];
        const isOpen = single || expanded === h.id;
        return (
          <section key={h.id} className="harness-section">
            {!single && (
              <button className="harness-section-header" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? '' : h.id)}>
                <HarnessMark harness={h.id} size={14} />
                <span className="harness-section-label">{h.name || harnessLabel(h.id)}</span>
                {!isOpen && list && <span className="harness-section-count">{list.length}</span>}
                <ChevronRight size={14} className={isOpen ? 'open' : ''} />
              </button>
            )}
            {isOpen && (
              <div className="pick-list">
                {!list && <p className="sheet-note">Loading models…</p>}
                {list?.length === 0 && (
                  <PickRow title="Default model" selected={config.harness === h.id && !config.model} onClick={() => onPick(h.id, undefined)} />
                )}
                {list?.map((m) => (
                  <PickRow
                    key={m.id}
                    title={m.label}
                    subtitle={m.description ?? undefined}
                    selected={config.harness === h.id && config.model === m.id}
                    onClick={() => onPick(h.id, m)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </Sheet>
  );
}
