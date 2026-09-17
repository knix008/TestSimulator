// Live Markdown preview next to the editor (Ctrl+Shift+M). The document is
// rendered block by block — every top-level node of the editor's Markdown
// syntax tree (paragraph, heading, list, code block, table …) becomes one
// element that remembers its source range; inside lists and tables the items
// / rows are mapped too — so the preview can be kept at the same place as
// the editor: the element under the cursor is scrolled to where the cursor's
// line is on screen (interpolated by line inside the element), scrolling
// the editor scrolls the preview to the element at its top — and scrolling
// the preview scrolls the editor to the line at the preview's top. Re-renders
// a moment after the document changes.
import React, { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { t } from '../lib/i18n';
import { ContextMenu } from './ContextMenu';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { renderMarkdown } from '../lib/markdown';
import { resolveImagesIn, copyImage } from '../lib/images';

// Top-level source blocks of the document: [{ from, to, name, items }] where
// items are the list items / table rows ({ from, to }). The editor parses
// lazily (the viewport first, the rest in idle time), so the parse is
// completed here, with a time budget; `complete` says whether it was — if
// not, the caller renders what there is and tries again a moment later.
function blocksOf(state, budget = 400) {
  const tree = ensureSyntaxTree(state, state.doc.length, budget) || syntaxTree(state);
  const out = [];
  out.complete = tree.length >= state.doc.length;
  if (tree.length < state.doc.length) { out.push({ from: 0, to: state.doc.length, name: 'Document', items: [] }); return out; }
  let n = tree.topNode.firstChild;
  while (n) {
    if (n.to > n.from) {
      const items = [];
      if (n.name === 'BulletList' || n.name === 'OrderedList') { let c = n.firstChild; while (c) { if (c.name === 'ListItem') items.push({ from: c.from, to: c.to }); c = c.nextSibling; } }
      else if (n.name === 'Table') { let c = n.firstChild; while (c) { if (c.name === 'TableHeader' || c.name === 'TableRow') items.push({ from: c.from, to: c.to }); c = c.nextSibling; } }
      out.push({ from: n.from, to: n.to, name: n.name, items });
    }
    n = n.nextSibling;
  }
  if (!out.length) out.push({ from: 0, to: state.doc.length, name: 'Document', items: [] });
  return out;
}

// After rendering: the list items / table rows get their source ranges when
// the rendered structure matches the parsed one.
function tagItems(blockEl, block) {
  if (!block.items.length) return;
  let els = [];
  if (block.name === 'Table') els = [...blockEl.querySelectorAll(':scope > table > thead > tr, :scope > table > tbody > tr')];
  else els = [...blockEl.querySelectorAll(':scope > ul > li, :scope > ol > li')];
  if (els.length !== block.items.length) return;
  els.forEach((e, i) => { e.dataset.from = block.items[i].from; e.dataset.to = block.items[i].to; });
}

export function Preview({ view, docVersion, cursorPos, width, base, onAction, onSaveImage, onMessage }) {
  const ref = useRef(null);
  const [ctx, setCtx] = useState(null);   // { x, y, img: src | null, hasSelection }
  const timer = useRef(null);
  const lock = useRef(0);          // > now: a programmatic scroll, ignore the scroll event
  const lastTarget = useRef(null);
  const cursorLock = useRef(0);    // > now: the editor is scrolling because the cursor moved — the cursor sync wins
  const editorLock = useRef(0);    // > now: the editor is scrolling because the preview was scrolled — not echoed back

  // The element for a source position: the block containing it (or the
  // nearest before), then the item / row inside it that contains it.
  const elementAt = (pos) => {
    const el = ref.current;
    if (!el) return null;
    let best = null;
    for (const b of el.children) {
      const from = Number(b.dataset.from), to = Number(b.dataset.to);
      if (pos >= from && pos < to) { best = b; break; }
      if (from <= pos) best = b;
    }
    if (!best) best = el.firstElementChild;
    if (!best) return null;
    for (const it of best.querySelectorAll('[data-from]')) {
      if (it === best) continue;
      if (pos >= Number(it.dataset.from) && pos < Number(it.dataset.to)) return { block: best, el: it };
    }
    return { block: best, el: best };
  };
  // Puts the element for `pos` — the part of it the position is in,
  // interpolated by line — at `ratio` of the preview's height (0 = top).
  const scrollTo = (pos, ratio) => {
    const el = ref.current;
    const hit = elementAt(pos);
    if (!el || !hit || !view) return;
    const { block, el: target } = hit;
    for (const c of el.querySelectorAll('.md-block.current')) c.classList.remove('current');
    block.classList.add('current');
    const doc = view.state.doc;
    const from = Number(target.dataset.from), to = Number(target.dataset.to);
    let anchor = target === block ? (block.firstElementChild || block) : target;   // the rendered element itself, not the wrapper's margin
    let l0 = doc.lineAt(from).number, l1 = doc.lineAt(Math.min(to, doc.length)).number;
    const lc = doc.lineAt(Math.min(Math.max(pos, from), to)).number;
    // A fenced code block: the fence lines are not part of the rendered <pre>; its code element is the measure.
    if (anchor.tagName === 'PRE') { anchor = anchor.querySelector('code') || anchor; if (l1 - l0 >= 2) { l0 += 1; l1 -= 1; } }
    const er = el.getBoundingClientRect();
    const mr = anchor.getBoundingClientRect();
    const f = l1 > l0 ? Math.max(0, Math.min(1, (lc - l0) / (l1 - l0 + 1))) : 0;
    const top = mr.top - er.top + el.scrollTop + f * mr.height;
    const first = block === el.firstElementChild && target === block && f === 0;
    lock.current = Date.now() + 300;
    el.scrollTop = first ? 0 : Math.max(0, top - ratio * el.clientHeight);
  };
  // The element under the cursor goes where the cursor's line is on the editor's screen.
  const syncCursor = () => {
    if (!view || !ref.current) return;
    const pos = view.state.selection.main.head;
    const c = view.coordsAtPos(pos);
    const r = view.scrollDOM.getBoundingClientRect();
    const ratio = c ? Math.max(0, Math.min(0.85, (c.top - r.top) / Math.max(1, r.height))) : 0;
    cursorLock.current = Date.now() + 300;
    scrollTo(pos, ratio);
  };

  // Renders the document; while the editor's parse of a long document is
  // still incomplete, renders what there is and comes back until it is done.
  const render = () => {
    timer.current = null;
    const el = ref.current;
    if (!el || !view) return;
    const text = view.state.doc.toString();
    const blocks = blocksOf(view.state);
    if (!blocks.complete) timer.current = setTimeout(render, 300);
    el.innerHTML = blocks.map((b) => `<div class="md-block" data-from="${b.from}" data-to="${b.to}">${renderMarkdown(text.slice(b.from, b.to))}</div>`).join('');
    [...el.children].forEach((b, i) => tagItems(b, blocks[i]));
    resolveImagesIn(el, base);
    syncCursor();
  };
  useEffect(() => {
    if (!view) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(render, ref.current && ref.current.innerHTML ? 150 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, docVersion, base]);

  // Cursor moved: follow it.
  useEffect(() => { if (cursorPos !== lastTarget.current) { lastTarget.current = cursorPos; syncCursor(); } }, [cursorPos]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Preview scrolled (by the user — not by the syncs above): the source line of what is at the preview's
  // top, interpolated by line inside that element, goes to the editor's top.
  useEffect(() => {
    const el = ref.current;
    if (!view || !el) return undefined;
    const posAtTop = () => {
      if (el.scrollTop <= 0) return 0;
      const y = el.getBoundingClientRect().top + 2;
      let block = null;
      for (const b of el.children) { if (b.getBoundingClientRect().bottom > y) { block = b; break; } }
      if (!block) return null;
      let target = block;
      for (const it of block.querySelectorAll('[data-from]')) { const r = it.getBoundingClientRect(); if (r.top <= y && r.bottom > y) { target = it; break; } }
      const doc = view.state.doc;
      const from = Number(target.dataset.from), to = Math.min(Number(target.dataset.to), doc.length);
      let anchor = target === block ? (block.firstElementChild || block) : target;
      let l0 = doc.lineAt(from).number, l1 = doc.lineAt(to).number;
      if (anchor.tagName === 'PRE') { anchor = anchor.querySelector('code') || anchor; if (l1 - l0 >= 2) { l0 += 1; l1 -= 1; } }
      const r = anchor.getBoundingClientRect();
      const f = r.height > 0 ? Math.max(0, Math.min(1, (y - r.top) / r.height)) : 0;
      return doc.line(Math.min(l1, l0 + Math.floor(f * (l1 - l0 + 1)))).from;
    };
    const onScroll = () => {
      if (Date.now() < lock.current) return;
      const pos = posAtTop();
      if (pos == null) return;
      editorLock.current = Date.now() + 300;
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [view]);

  // Editor scrolled: the element at the editor's top goes to the preview's top.
  useEffect(() => {
    if (!view) return undefined;
    const scroller = view.scrollDOM;
    const onScroll = () => {
      const el = ref.current;
      if (!el || Date.now() < cursorLock.current || Date.now() < editorLock.current) return;
      const r = scroller.getBoundingClientRect();
      const pos = view.posAtCoords({ x: r.left + 80, y: r.top + 2 }, false);
      if (pos == null) return;
      scrollTo(view.state.doc.lineAt(pos).from, 0);
    };
    scroller.addEventListener('scroll', onScroll);
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [view]);

  // Links open in the system browser (Electron denies window.open → shell) / a new tab.
  const onClick = (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    const img = e.target.closest('img');
    setCtx({ x: e.clientX, y: e.clientY, img: img ? img.currentSrc || img.src : null, alt: img ? img.alt : '', hasSelection: !!String(window.getSelection()).trim() });
  };
  const items = ctx ? [
    ...(ctx.img ? [{ id: 'copyImage', icon: 'fileImage', label: t('pv_copy_image') }, { id: 'saveImage', icon: 'fileSave', label: t('pv_save_image') }, { sep: true }] : []),
    { id: 'copy', icon: 'copy', label: t('copy'), disabled: !ctx.hasSelection },
    { id: 'selectAll', icon: 'selectAll', label: t('select_all') },
    { sep: true },
    { id: 'print', icon: 'print', label: t('print') },
  ] : [];
  const pick = async (id) => {
    const c = ctx; setCtx(null);
    if (id === 'copy') document.execCommand('copy');
    else if (id === 'selectAll') { const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(ref.current); sel.removeAllRanges(); sel.addRange(r); }
    else if (id === 'copyImage') { try { await copyImage(c.img); if (onMessage) onMessage(t('pv_image_copied')); } catch (e) { if (onMessage) onMessage(`${t('pv_image_copy_failed')}: ${e.message}`); } }
    else if (id === 'saveImage') { if (onSaveImage) onSaveImage(c.img, c.alt); }
    else if (id === 'print') { if (onAction) onAction('print'); }
  };
  return (
    <>
      <div className="md-preview selectable" ref={ref} style={{ width }} onClick={onClick} onContextMenu={onContextMenu} />
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={items} onClose={() => setCtx(null)} onPick={pick} />}
    </>
  );
}

export default Preview;
