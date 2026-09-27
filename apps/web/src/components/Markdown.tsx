import { memo, useMemo } from 'react';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { copyText } from '@/ui/clipboard';

for (const [name, language] of Object.entries({
  bash, css, diff, go, ini, javascript, json, markdown, python, rust, sql, swift, typescript, xml, yaml,
})) {
  hljs.registerLanguage(name, language);
}
hljs.registerAliases(['sh', 'shell', 'zsh', 'console'], { languageName: 'bash' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['js', 'jsx', 'mjs'], { languageName: 'javascript' });
hljs.registerAliases(['html', 'svg'], { languageName: 'xml' });
hljs.registerAliases(['rs'], { languageName: 'rust' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : undefined;
      const html = language ? hljs.highlight(text, { language }).value : escapeHtml(text);
      const header = `<div class="code-header"><span>${lang ? escapeHtml(lang) : ''}</span><button type="button" class="code-copy" data-copy-code="">Copy</button></div>`;
      return `<div class="code-block">${header}<pre class="code"><code class="hljs">${html}</code></pre></div>`;
    },
  },
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const COPIED_MS = 1500;

function onCodeCopy(e: React.MouseEvent) {
  const button = (e.target as Element).closest('[data-copy-code]');
  const code = button?.closest('.code-block')?.querySelector('code')?.textContent;
  if (!button || code == null) return;
  copyText(code).then(() => {
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy'), COPIED_MS);
  });
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(text, { async: false }) as string, { ADD_ATTR: ['target', 'data-copy-code'] }),
    [text],
  );
  return <div className="md" onClick={onCodeCopy} dangerouslySetInnerHTML={{ __html: html }} />;
});
