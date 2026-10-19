// Structure panel of a Markdown document (MarkdownBar › 구조): its headings
// as a tree — a heading's children are the deeper headings that follow it —
// drawn like the folder tree (connecting guide lines, ⊞ / ⊟ to fold a
// branch), the heading the cursor is in highlighted. A click puts the cursor
// on that heading and scrolls it to the top. ATX headings (# … ######) and
// setext ones (a line underlined with === or ---); fenced code blocks are
// skipped. Rebuilt from the document text on every change (docVersion).
import React, { useMemo, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

// [{ level, text, line, from }] in document order
export function markdownHeadings(doc) {
  const out = [];
  let fence = null;
  let prev = null;   // previous line (for setext), { text, from, number }
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const s = line.text;
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(s);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; prev = null; continue; }
    if (fence) { prev = null; continue; }
    const atx = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(s);
    if (atx) { out.push({ level: atx[1].length, text: atx[2] || '', line: n, from: line.from }); prev = null; continue; }
    const setext = /^\s{0,3}(=+|-+)\s*$/.exec(s);
    if (setext && prev && prev.text.trim() && !/^\s{0,3}([-*+]|\d+[.)])\s/.test(prev.text)) {
      out.push({ level: setext[1][0] === '=' ? 1 : 2, text: prev.text.trim(), line: prev.number, from: prev.from });
      prev = null; continue;
    }
    prev = { text: s, from: line.from, number: n };
  }
  return out;
}

// The headings as a tree: each heading owns the following headings of a deeper level.
export function headingTree(heads) {
  const root = { level: 0, children: [] };
  const stack = [root];
  heads.forEach((h, i) => {
    const node = { ...h, id: `${h.line}:${i}`, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  return root.children;
}

export function Outline({ view, docVersion, cursorPos, onClose, width }) {
  useLanguage();
  const [folded, setFolded] = useState(() => new Set());   // node ids whose branch is folded
  const doc = view ? view.state.doc : null;
  const heads = useMemo(() => (doc ? markdownHeadings(doc) : []), [doc, docVersion]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tree = useMemo(() => headingTree(heads), [heads]);
  // The heading the cursor is under: the last one that starts at or before the cursor.
  let currentFrom = -1;
  for (const h of heads) { if (h.from <= (cursorPos || 0)) currentFrom = h.from; else break; }

  // Rows in display order with, per ancestor level, whether its vertical line continues (as in Sidebar.jsx).
  const rows = [];
  const walk = (nodes, depth, guides) => {
    nodes.forEach((n, i) => {
      const last = i === nodes.length - 1;
      rows.push({ node: n, depth, guides, last });
      if (n.children.length && !folded.has(n.id)) walk(n.children, depth + 1, [...guides, !last]);
    });
  };
  walk(tree, 0, []);

  const toggle = (n) => setFolded((s) => { const next = new Set(s); if (next.has(n.id)) next.delete(n.id); else next.add(n.id); return next; });
  const go = (h) => {
    if (!view) return;
    view.dispatch({ selection: { anchor: h.from }, effects: EditorView.scrollIntoView(h.from, { y: 'start', yMargin: 24 }) });
    view.focus();
  };
  const foldAll = (fold) => setFolded(fold ? new Set(heads.map((h, i) => `${h.line}:${i}`)) : new Set());

  return (
    <div className="md-outline" style={width ? { width } : undefined}>
      <div className="md-outline-head">
        <Icon name="listTree" size={14} className="muted" /><span>{t('md_outline')}</span><span className="muted small">{heads.length ? heads.length : ''}</span>
        <span className="spacer" />
        <button className="icon-btn" title={t('unfold_all')} onClick={() => foldAll(false)}><Icon name="plusBox" size={13} /></button>
        <button className="icon-btn" title={t('fold_all')} onClick={() => foldAll(true)}><Icon name="minusBox" size={13} /></button>
        <button className="icon-btn" title={t('close')} onClick={onClose}><Icon name="close" size={13} /></button>
      </div>
      <div className="md-outline-list">
        {!heads.length && <div className="muted small md-outline-empty">{t('md_outline_empty')}</div>}
        {rows.map(({ node, depth, guides, last }) => (
          <div key={node.id} className={`tree-row ${node.children.length ? 'dir' : 'file'} ${node.from === currentFrom ? 'active' : ''}`}
            title={`${'#'.repeat(node.level)} ${node.text} — ${t('st_pos', { line: node.line, col: 1 })}`}
            onClick={() => go(node)}>
            {depth > 0 && (
              <span className="tree-guides">
                {guides.map((cont, i) => <span key={i} className={`guide ${cont ? 'v' : ''}`} />)}
                <span className={`guide ${last ? 'end' : 'mid'}`} />
              </span>
            )}
            <span className="tree-expander" onClick={(e) => { if (node.children.length) { e.stopPropagation(); toggle(node); } }}>
              {node.children.length ? <Icon name={folded.has(node.id) ? 'plusBox' : 'minusBox'} size={13} /> : <span className="tree-leaf" />}
            </span>
            <span className={`md-outline-level l${node.level}`}>H{node.level}</span>
            <span className="tree-name ellipsis">{node.text || t('md_outline_untitled')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Outline;
