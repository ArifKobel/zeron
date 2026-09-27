import { useState } from 'react';
import { Copy, FilePlus, FileText, Folder, Globe, LayoutGrid, ListChecks, Pencil, Search, Terminal } from 'lucide-react';
import { engine } from '@/engine';
import type { ToolCall } from '@/types';
import { copyText } from '@/ui/clipboard';
import { MenuPopover } from '@/ui/Menu';
import { useContextMenu } from '@/ui/useContextMenu';
import { formatBytes } from '@/util';
import { singleLine, toolChipContent } from '@/view';
import type { ToolPart } from '@/components/transcript/types';

const TOOL_ICONS: Record<string, typeof Terminal> = {
  exec: Terminal,
  readFile: FileText,
  writeFile: FilePlus,
  editFile: Pencil,
  applyPatch: FileText,
  search: Search,
  glob: Folder,
  webFetch: Globe,
  webSearch: Globe,
  todo: ListChecks,
};

function shortDetail(call: ToolCall, detail: string): string {
  if (call.kind === 'readFile' || call.kind === 'writeFile' || call.kind === 'editFile') {
    return call.path.split(/[/\\]/).filter(Boolean).slice(-2).join('/');
  }
  return detail;
}

export function ToolRow({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const menu = useContextMenu();
  const { label, detail } = toolChipContent(part.call);
  const Icon = TOOL_ICONS[part.call.kind] ?? LayoutGrid;
  const call = part.call;
  const output = full ?? part.output ?? '';
  const fullDetail = call.kind === 'exec' ? call.command : 'path' in call && call.path ? call.path : detail;

  const loadFull = async () => {
    if (!part.outputRef) return;
    setLoading(true);
    try {
      setFull((await engine.call<{ text: string }>('FetchToolBlob', { blobRef: part.outputRef })).text);
    } catch (e) {
      setFull(`Couldn't load the full output: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`tool-row ${part.isError ? 'error' : ''}`} {...menu.handlers}>
      <span className="tool-rail" aria-hidden>
        <Icon size={14} />
      </span>
      <div className="tool-main">
        <button className="tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="tool-label">{label}</span>
          {part.isError ? <span className="tool-failed">Failed</span> : !part.resolved && <span className="tool-running">Running</span>}
          {part.diffStats?.map((d) => (
            <span key={d.path} className="diffstat">
              <span className="add">+{d.additions}</span> <span className="del">−{d.deletions}</span>
            </span>
          ))}
        </button>
        {(detail || open) && (
          <button className={`tool-detail ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
            {open ? fullDetail : shortDetail(call, detail)}
          </button>
        )}
        {part.subagentTail && <div className="tool-tail">{singleLine(part.subagentTail)}</div>}
        {open && (
          <div className="tool-expanded">
            {call.kind === 'todo' && (
              <ul className="todo">
                {call.items.map((item, i) => (
                  <li key={i} className={item.done ? 'done' : ''}>
                    {item.done ? '☑' : '☐'} {item.text}
                  </li>
                ))}
              </ul>
            )}
            {call.kind === 'editFile' && (call.oldString || call.newString) && (
              <pre className="code small diff">
                {call.oldString?.split('\n').map((line, i) => (
                  <div key={'o' + i} className="del">
                    - {line}
                  </div>
                ))}
                {call.newString?.split('\n').map((line, i) => (
                  <div key={'n' + i} className="add">
                    + {line}
                  </div>
                ))}
              </pre>
            )}
            {output && <pre className="code small">{output}</pre>}
            {part.outputRef && full === null && (
              <button className="link-btn" onClick={loadFull} disabled={loading}>
                {loading ? 'Loading…' : `Show full output${part.outputBytes ? ` (${formatBytes(part.outputBytes)})` : ''}`}
              </button>
            )}
          </div>
        )}
      </div>
      {menu.at && (
        <MenuPopover
          anchor={menu.at}
          align="start"
          items={[{ label: 'Copy details', icon: <Copy size={16} />, onSelect: () => copyText([fullDetail, output].filter(Boolean).join('\n\n')) }]}
          onClose={menu.close}
        />
      )}
    </div>
  );
}
