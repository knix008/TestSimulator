// The webview's own context menu (Back, Reload, Inspect…) never shows: any
// right-click the app did not handle gets an app menu instead — editing items
// in text fields, Copy on selected text, or the window's general menu.

import { platform } from './platform.js';

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'email', 'tel', 'password', 'number', '']);

function editableOf(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (n.tagName === 'TEXTAREA') return n;
    if (n.tagName === 'INPUT') return TEXT_INPUTS.has((n.getAttribute('type') || '').toLowerCase()) ? n : null;
    if (n.isContentEditable) return n;
  }
  return null;
}

function rangeOf(el) {
  try { return el.selectionStart == null ? null : [el.selectionStart, el.selectionEnd]; } catch { return null; }   // number inputs throw
}

/** Cut / copy / paste … for a text field; acts on the selection it had when the menu opened. */
export function editMenuItems(el, t) {
  const field = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
  const readOnly = !!(el.readOnly || el.disabled);
  const range = field ? rangeOf(el) : null;
  const text = field ? (range ? el.value.slice(range[0], range[1]) : '') : String(window.getSelection() || '');
  const restore = () => {
    el.focus();
    if (range) { try { el.setSelectionRange(range[0], range[1]); } catch { /* ignore */ } }
  };
  const run = (fn) => async () => { restore(); await fn(); };
  return [
    { label: t('edit.undo'), icon: 'undo', shortcut: 'Ctrl+Z', disabled: readOnly, onClick: run(() => document.execCommand('undo')) },
    { label: t('edit.redo'), icon: 'redo', shortcut: 'Ctrl+Y', disabled: readOnly, onClick: run(() => document.execCommand('redo')) },
    'sep',
    { label: t('edit.cut'), icon: 'cut', shortcut: 'Ctrl+X', disabled: readOnly || !text, onClick: run(async () => { await platform.clipboard.writeText(text); restore(); document.execCommand('delete'); }) },
    { label: t('edit.copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !text, onClick: run(() => platform.clipboard.writeText(text)) },
    { label: t('edit.paste'), icon: 'paste', shortcut: 'Ctrl+V', disabled: readOnly, onClick: run(async () => {
      const clip = await platform.clipboard.readText().catch(() => '');
      if (clip) { restore(); document.execCommand('insertText', false, String(clip)); }
    }) },
    { label: t('edit.delete'), icon: 'trash', shortcut: 'Del', disabled: readOnly || !text, onClick: run(() => document.execCommand('delete')) },
    'sep',
    { label: t('edit.selectAll'), icon: 'region', shortcut: 'Ctrl+A', onClick: run(() => { if (field) el.select(); else document.execCommand('selectAll'); }) },
  ];
}

/** Copy / select all for text selected outside a field. */
function selectionMenuItems(t) {
  const text = String(window.getSelection() || '');
  if (!text.trim()) return null;
  return [
    { label: t('edit.copy'), icon: 'copy', shortcut: 'Ctrl+C', onClick: () => platform.clipboard.writeText(text) },
    { label: t('edit.selectAll'), icon: 'region', shortcut: 'Ctrl+A', onClick: () => document.execCommand('selectAll') },
  ];
}

/**
 * Replaces the webview menu for right-clicks no component handled (handlers
 * that open their own menu call preventDefault). `open(x, y, items)` shows a
 * menu; `generalItems(event)` is the window's own menu, or null for none.
 */
export function installFallbackMenu({ t, open, generalItems = null }) {
  const onMenu = (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    const field = editableOf(e.target);
    const items = field ? editMenuItems(field, t) : selectionMenuItems(t) || (generalItems ? generalItems(e) : null);
    if (items && items.length) open(e.clientX, e.clientY, items);
  };
  window.addEventListener('contextmenu', onMenu);
  return () => window.removeEventListener('contextmenu', onMenu);
}
