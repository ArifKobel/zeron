import { useEffect, useRef, useState } from 'react';
import type { InputPart } from '@/types';

type Answer = { questionId: string; labels: string[] };

const AUTO_ADVANCE_MS = 220;

export function QuestionPanel({ input, onSubmit }: { input: InputPart; onSubmit: (answers: Answer[]) => Promise<void> }) {
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(advance.current), []);

  useEffect(() => {
    setPage(0);
    setPicked({});
    setOther({});
    setError(null);
  }, [input.requestId]);

  const total = input.questions.length;
  const question = input.questions[Math.min(page, total - 1)];

  const labelsFor = (id: string) => {
    const typed = other[id]?.trim();
    return [...(picked[id] ?? []), ...(typed ? [typed] : [])];
  };
  const complete = input.questions.every((q) => labelsFor(q.id).length > 0);

  const submit = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(input.questions.map((q) => ({ questionId: q.id, labels: labelsFor(q.id) })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choose = (option: string) => {
    if (!question) return;
    if (question.multiSelect) {
      const current = picked[question.id] ?? [];
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      setPicked({ ...picked, [question.id]: next });
      return;
    }
    setPicked({ ...picked, [question.id]: [option] });
    setOther({ ...other, [question.id]: '' });
    if (page < total - 1) {
      clearTimeout(advance.current);
      advance.current = setTimeout(() => setPage((p) => Math.min(p + 1, total - 1)), AUTO_ADVANCE_MS);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (question && n >= 1 && n <= 9 && question.options[n - 1] !== undefined) {
        e.preventDefault();
        choose(question.options[n - 1]);
      } else if (e.key === 'Enter' && complete) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!question) return null;
  return (
    <div className="question-panel">
      <div className="question-top">
        <span className="input-header">{question.header}</span>
        {total > 1 && (
          <span className="question-pager">
            {page + 1} / {total}
          </span>
        )}
      </div>
      <div className="question-text">{question.question}</div>
      {question.multiSelect && <div className="question-hint">Select one or more options.</div>}
      <div className="question-options" role={question.multiSelect ? 'group' : 'radiogroup'}>
        {question.options.map((option, i) => {
          const selected = (picked[question.id] ?? []).includes(option);
          return (
            <button
              key={option}
              className={`option ${selected ? 'selected' : ''}`}
              role={question.multiSelect ? 'checkbox' : 'radio'}
              aria-checked={selected}
              onClick={() => choose(option)}
            >
              {i < 9 && <span className="option-key">{i + 1}</span>}
              {option}
            </button>
          );
        })}
        <input
          className="option-other"
          placeholder="Or type your own answer"
          value={other[question.id] ?? ''}
          onChange={(e) => {
            setOther({ ...other, [question.id]: e.target.value });
            if (!question.multiSelect) setPicked({ ...picked, [question.id]: [] });
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="question-actions">
        {total > 1 && (
          <>
            <button className="btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Back
            </button>
            <button className="btn ghost" disabled={page === total - 1} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </>
        )}
        <button className="btn primary" disabled={!complete || busy} onClick={submit}>
          {busy ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
