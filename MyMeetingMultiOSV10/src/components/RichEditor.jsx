import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// A WYSIWYG-style editor: it renders the meeting notes Markdown as formatted
// HTML in a contentEditable surface, so the user edits the *interpreted* content
// directly (not raw Markdown). The stored model stays Markdown — on every edit
// the DOM is serialized back to Markdown via htmlToMarkdown() so the export
// pipeline and structure view keep working unchanged.
//
// The contentEditable is uncontrolled: innerHTML is only (re)set when a new
// document loads (docKey changes), never on keystrokes, so the caret is stable.

marked.setOptions({ gfm: true, breaks: false });

function renderMarkdown(md) {
  const html = marked.parse(md || '');
  return DOMPurify.sanitize(html, { ADD_ATTR: ['type', 'checked', 'disabled', 'id', 'align', 'target'] });
}

export default function RichEditor({ markdown, docKey, placeholder, onChange, apiRef, onContextMenu }) {
  const ref = useRef(null);
  const mdRef = useRef(markdown);
  mdRef.current = markdown;

  // (Re)load the document when its identity changes (new / open / template).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = renderMarkdown(mdRef.current);
    if (el.innerHTML !== html) el.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  const serialize = () => {
    const el = ref.current;
    if (!el) return;
    onChange(htmlToMarkdown(el));
  };

  // Expose an imperative API for the formatting toolbar / context menu.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      el: () => ref.current,
      focus: () => ref.current?.focus(),
      cmd: (command, value) => {
        const el = ref.current; if (!el) return;
        el.focus();
        try { document.execCommand(command, false, value); } catch { /* ignore */ }
        serialize();
      },
      insertHTML: (html) => {
        const el = ref.current; if (!el) return;
        el.focus();
        try { document.execCommand('insertHTML', false, html); } catch { /* ignore */ }
        serialize();
      },
      selection: () => (window.getSelection ? window.getSelection().toString() : ''),
      serialize,
    };
    return () => { if (apiRef) apiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefer <p> paragraphs on Enter for clean serialization.
  const onFocus = () => { try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ } };

  return (
    <div
      ref={ref}
      className="richeditor markdown-body"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder || ''}
      onInput={serialize}
      onBlur={serialize}
      onFocus={onFocus}
      onContextMenu={onContextMenu}
    />
  );
}

// ── HTML → Markdown serialization ─────────────────────────
const esc = (s) => String(s);

function htmlToMarkdown(root) {
  const blocks = [];
  root.childNodes.forEach((n) => {
    const b = serializeBlock(n, 0);
    if (b != null && b.trim() !== '') blocks.push(b);
  });
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function serializeBlock(node, depth) {
  if (node.nodeType === 3) {
    const t = node.textContent.replace(/\s+/g, ' ');
    return t.trim();
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return '#'.repeat(Number(tag[1])) + ' ' + inline(node);
    case 'p': case 'div': case 'section':
      return inline(node);
    case 'blockquote':
      return blockChildren(node).join('\n\n').split('\n').map((l) => '> ' + l).join('\n');
    case 'pre':
      return '```\n' + node.textContent.replace(/\n+$/, '') + '\n```';
    case 'ul': return serializeList(node, false, depth);
    case 'ol': return serializeList(node, true, depth);
    case 'hr': return '---';
    case 'table': return serializeTable(node);
    case 'br': return '';
    default: return inline(node);
  }
}

function blockChildren(node) {
  const out = [];
  node.childNodes.forEach((c) => {
    const b = serializeBlock(c, 0);
    if (b != null && b.trim() !== '') out.push(b);
  });
  return out;
}

function serializeList(listNode, ordered, depth) {
  const items = [];
  let n = 1;
  listNode.childNodes.forEach((li) => {
    if (li.nodeType !== 1 || li.tagName.toLowerCase() !== 'li') return;
    let text = '';
    let check = '';
    const nested = [];
    li.childNodes.forEach((c) => {
      if (c.nodeType === 1 && c.tagName.toLowerCase() === 'input' && c.getAttribute('type') === 'checkbox') {
        check = c.checked || c.getAttribute('checked') != null ? '[x] ' : '[ ] ';
      } else if (c.nodeType === 1 && /^(ul|ol)$/i.test(c.tagName)) {
        nested.push(c);
      } else {
        text += inlineNode(c);
      }
    });
    const indent = '  '.repeat(depth);
    const marker = ordered ? `${n}. ` : '- ';
    items.push(indent + marker + (check + text).trim());
    nested.forEach((nl) => items.push(serializeList(nl, nl.tagName.toLowerCase() === 'ol', depth + 1)));
    n += 1;
  });
  return items.join('\n');
}

function serializeTable(node) {
  const rows = Array.from(node.querySelectorAll('tr'));
  if (!rows.length) return '';
  const cellsOf = (tr) => Array.from(tr.querySelectorAll('th,td')).map((c) => inline(c).replace(/\|/g, '\\|') || ' ');
  const header = cellsOf(rows[0]);
  const cols = header.length || 1;
  const lines = [`| ${header.join(' | ')} |`, `| ${Array(cols).fill('---').join(' | ')} |`];
  for (let i = 1; i < rows.length; i++) {
    const cells = cellsOf(rows[i]);
    while (cells.length < cols) cells.push(' ');
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function inline(node) {
  let s = '';
  node.childNodes.forEach((c) => { s += inlineNode(c); });
  return s.replace(/\s+/g, ' ').trim();
}

function inlineNode(node) {
  if (node.nodeType === 3) return esc(node.textContent);
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  const inner = () => { let s = ''; node.childNodes.forEach((c) => { s += inlineNode(c); }); return s; };
  switch (tag) {
    case 'strong': case 'b': { const x = inner().trim(); return x ? `**${x}**` : ''; }
    case 'em': case 'i': { const x = inner().trim(); return x ? `*${x}*` : ''; }
    case 'del': case 's': case 'strike': { const x = inner().trim(); return x ? `~~${x}~~` : ''; }
    case 'code': return '`' + node.textContent + '`';
    case 'a': { const href = node.getAttribute('href') || ''; return `[${inner()}](${href})`; }
    case 'br': return '\n';
    case 'img': return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
    default: return inner();
  }
}
