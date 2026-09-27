const MARKS: Record<string, string> = {
  'claude-code': 'claude-mark',
  codex: 'openai-mark',
  cursor: 'cursor-mark',
  devin: 'devin-mark',
  grok: 'grok-mark',
  hermes: 'hermes-mark',
  pi: 'pi-mark',
  opencode: 'opencode-mark',
};

export function HarnessMark({ harness, size = 14, dim }: { harness: string | null | undefined; size?: number; dim?: boolean }) {
  const mark = harness ? MARKS[harness] : undefined;
  if (!mark) return null;
  const url = `url(/icons/${mark}.svg)`;
  return (
    <span
      className={`harness-mark ${harness === 'claude-code' ? 'claude' : ''} ${dim ? 'dim' : ''}`}
      style={{ width: size, height: size, WebkitMaskImage: url, maskImage: url }}
      aria-hidden
    />
  );
}

export function ZeronMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  const url = 'url(/icons/zeron-logo.svg)';
  return (
    <span
      className={`zeron-mark ${className}`}
      style={{ width: size, height: size * 1.15, WebkitMaskImage: url, maskImage: url }}
      aria-hidden
    />
  );
}

const HARNESS_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  devin: 'Devin',
  grok: 'Grok',
  hermes: 'Hermes',
  pi: 'Pi',
  opencode: 'opencode',
  antigravity: 'Antigravity',
  mock: 'Mock',
};

export function harnessLabel(id: string): string {
  return HARNESS_LABELS[id] ?? id;
}
