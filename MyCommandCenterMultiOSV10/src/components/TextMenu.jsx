// The right-click menu for everything that has no menu of its own: text boxes, the terminal, the log,
// viewer text, dialogs. Without it WebView2 shows its own menu there — no icons, and a look of its own.
//
// One TextMenuHost per window listens on the document. A component that draws its own menu calls
// preventDefault() and this host stays out of it. A component that only wants to add items (the log's
// "Copy log", the terminal's "Clear screen") leaves the event alone and calls addTextMenuItems(e, …)
// in its onContextMenu: React runs that before the event reaches the document.
//
// Every item has an icon and the menu is the shared ContextMenu, so it looks like every other menu.
import React, { useEffect, useRef, useState } from 'react';
import { ContextMenu } from './ContextMenu';
import { t, useLanguage } from '../lib/i18n';
import { readClipboardText, writeClipboardText } from '../lib/backend';

const EXTRA = '__textMenuExtra';

// items: ContextMenu items (each with an icon); onPick(id) runs when one of them is picked.
export function addTextMenuItems(e, items, onPick) {
  const ev = e.nativeEvent || e;
  ev[EXTRA] = { items, onPick };
}

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number', '']);

// The text box the right-click landed on, or null.
function editableOf(target) {
  const el = target && target.closest ? target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') : null;
  if (!el) return null;
  if (el.tagName === 'INPUT' && !TEXT_INPUTS.has((el.getAttribute('type') || '').toLowerCase())) return null;
  return el;
}

// The block "Select all" selects when the right-click was on plain text.
function textBlockOf(target) {
  if (!target || !target.closest) return null;
  return target.closest('.selectable, pre, .viewer-text, [data-text-menu]');
}

function selectionIn(el) {
  try {
    const s = el.selectionStart, e = el.selectionEnd;
    if (typeof s === 'number' && typeof e === 'number') return { s, e, text: el.value.slice(s, e) };
  } catch { /* number inputs have no selection */ }
  return { s: null, e: null, text: el.isContentEditable ? String(window.getSelection() || '') : '' };
}

export function TextMenuHost() {
  useLanguage();
  const [menu, setMenu] = useState(null);
  const ctx = useRef(null);   // what the open menu acts on

  useEffect(() => {
    const onMenu = (e) => {
      if (e.defaultPrevented) return;   // the component drew its own menu
      e.preventDefault();               // never WebView2's menu
      const extra = e[EXTRA] || null;
      const field = editableOf(e.target);
      const items = [];
      if (field) {
        const sel = selectionIn(field);
        const ro = field.readOnly || field.disabled;
        const has = !!sel.text;
        items.push(
          { id: 'tm:undo', label: t('undo'), icon: 'undo', shortcut: 'Ctrl+Z', disabled: ro },
          { id: 'tm:redo', label: t('redo'), icon: 'redo', shortcut: 'Ctrl+Y', disabled: ro },
          { sep: true },
          { id: 'tm:cut', label: t('ctx_cut'), icon: 'cut', shortcut: 'Ctrl+X', disabled: ro || !has },
          { id: 'tm:copy', label: t('ctx_copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !has },
          { id: 'tm:paste', label: t('ctx_paste'), icon: 'paste', shortcut: 'Ctrl+V', disabled: ro },
          { id: 'tm:delete', label: t('ctx_delete'), icon: 'delete', shortcut: 'Del', disabled: ro || !has },
          { sep: true },
          { id: 'tm:selectAll', label: t('sel_all'), icon: 'select', shortcut: 'Ctrl+A', disabled: !(field.value || field.textContent) },
        );
        ctx.current = { field, sel, extra };
      } else {
        const text = String(window.getSelection() || '');
        const block = textBlockOf(e.target);
        if (text || block) {
          items.push({ id: 'tm:copy', label: t('ctx_copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !text });
          if (block) items.push({ id: 'tm:selectAll', label: t('sel_all'), icon: 'select', shortcut: 'Ctrl+A', disabled: !block.textContent });
        }
        ctx.current = { text, block, extra };
      }
      if (extra && extra.items.length) {
        if (items.length) items.push({ sep: true });
        items.push(...extra.items);
      }
      if (!items.length) { setMenu(null); return; }
      setMenu({ x: e.clientX, y: e.clientY, items });
    };
    document.addEventListener('contextmenu', onMenu);
    return () => document.removeEventListener('contextmenu', onMenu);
  }, []);

  const onPick = async (id) => {
    setMenu(null);
    const c = ctx.current;
    if (!c) return;
    if (!id.startsWith('tm:')) { if (c.extra) c.extra.onPick(id); return; }
    const cmd = id.slice(3);
    if (!c.field) {
      if (cmd === 'copy' && c.text) writeClipboardText(c.text);
      else if (cmd === 'selectAll' && c.block) {
        const range = document.createRange();
        range.selectNodeContents(c.block);
        const s = window.getSelection();
        s.removeAllRanges(); s.addRange(range);
      }
      return;
    }
    // Back to the text box with its selection as it was when the menu opened (the click on the menu took the focus).
    const { field, sel } = c;
    field.focus();
    if (sel.s !== null) { try { field.setSelectionRange(sel.s, sel.e); } catch { /* not a text field */ } }
    // execCommand edits as typing does: React sees the change and Ctrl+Z can take it back.
    if (cmd === 'undo' || cmd === 'redo' || cmd === 'delete') document.execCommand(cmd);
    else if (cmd === 'selectAll') { if (field.select) field.select(); else document.execCommand('selectAll'); }
    else if (cmd === 'copy') writeClipboardText(sel.text);
    else if (cmd === 'cut') { await writeClipboardText(sel.text); field.focus(); document.execCommand('delete'); }
    else if (cmd === 'paste') {
      const text = await readClipboardText();
      if (!text) return;
      field.focus();
      // A paste event first, so a field with its own paste handling (the terminal runs pasted lines) gets it.
      let handled = false;
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        handled = !field.dispatchEvent(ev);
      } catch { /* no synthetic clipboard events here */ }
      if (!handled) document.execCommand('insertText', false, text);
    }
  };

  if (!menu) return null;
  return <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} onPick={onPick} />;
}

export default TextMenuHost;
