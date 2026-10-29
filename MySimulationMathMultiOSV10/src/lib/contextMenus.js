// The context menu for every place that has no menu of its own: the
// browser's / WebView's built-in menu (no icons, Back / Reload / Inspect …)
// never shows. Installed once per window (main.jsx). What it offers depends
// on what was right-clicked:
//   code editor  — cut / copy / paste / select all, run selection, comment,
//                  uncomment, find (the editor actions come from App)
//   text fields  — cut / copy / paste / delete / select all
//   Command Window — copy, select all, paste into the prompt, clear
//   other text   — copy (when something is selected), select all
// Components with their own menu call e.preventDefault() first; those events
// are left alone.
import { EditorView } from '@codemirror/view';
import { openMenu } from './menu';
import { popupRoute } from './popups';
import { t } from './i18n';

let extras = {}; // { runSelection(text), editorCommand(name), clearCommandWindow(), pasteToPrompt(text) }

/** App registers the actions that need the app (running code, editor commands). */
export function setContextMenuActions(next) { extras = next || {}; }

const isField = (el) => !!el && ((el.tagName === 'INPUT' && /^(text|search|email|url|tel|password|number|)$/i.test(el.type || '')) || el.tagName === 'TEXTAREA' || el.isContentEditable);

async function readClipboard() {
  try { return await navigator.clipboard.readText(); } catch { return null; }
}
async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try { return document.execCommand('copy'); } catch { return false; }
}

function fieldMenu(el) {
  const ro = el.readOnly || el.disabled;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const hasSel = typeof start === 'number' ? end > start : !!String(window.getSelection() || '');
  const selText = () => (typeof start === 'number' ? el.value.slice(start, end) : String(window.getSelection() || ''));
  const insert = (text) => {
    el.focus();
    if (typeof start === 'number') el.setSelectionRange(start, end);
    document.execCommand('insertText', false, text);
  };
  return {
    items: [
      { id: 'cut', label: t('cm_cut'), icon: 'cut', keys: 'Ctrl+X', disabled: ro || !hasSel },
      { id: 'copy', label: t('copy'), icon: 'copy', keys: 'Ctrl+C', disabled: !hasSel },
      { id: 'paste', label: t('cm_paste'), icon: 'paste', keys: 'Ctrl+V', disabled: ro },
      { id: 'delete', label: t('cm_delete'), icon: 'trash', keys: 'Del', disabled: ro || !hasSel },
      { sep: true },
      { id: 'all', label: t('cm_select_all'), icon: 'selectAll', keys: 'Ctrl+A' },
    ],
    run: async (id) => {
      if (id === 'copy') await writeClipboard(selText());
      else if (id === 'cut') { await writeClipboard(selText()); insert(''); } else if (id === 'delete') insert('');
      else if (id === 'paste') { const text = await readClipboard(); if (text != null) insert(text); } else if (id === 'all') { el.focus(); if (el.select) el.select(); else document.execCommand('selectAll'); }
    },
  };
}

function editorMenu(view) {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  const ro = view.state.readOnly;
  const replace = (s) => { view.dispatch(view.state.replaceSelection(s)); view.focus(); };
  const cmd = (name) => () => { view.focus(); if (extras.editorCommand) extras.editorCommand(name); };
  return {
    items: [
      { id: 'cut', label: t('cm_cut'), icon: 'cut', keys: 'Ctrl+X', disabled: ro || !text },
      { id: 'copy', label: t('copy'), icon: 'copy', keys: 'Ctrl+C', disabled: !text },
      { id: 'paste', label: t('cm_paste'), icon: 'paste', keys: 'Ctrl+V', disabled: ro },
      { id: 'all', label: t('cm_select_all'), icon: 'selectAll', keys: 'Ctrl+A' },
      { sep: true },
      { id: 'runSel', label: t('cm_run_selection'), icon: 'play', keys: 'F9', disabled: !text || !extras.runSelection },
      { id: 'comment', label: t('rb_comment'), icon: 'comment', keys: 'Ctrl+R', disabled: ro || !extras.editorCommand },
      { id: 'uncomment', label: t('rb_uncomment'), icon: 'uncomment', keys: 'Ctrl+T', disabled: ro || !extras.editorCommand },
      { id: 'find', label: t('rb_find'), icon: 'search', keys: 'Ctrl+F', disabled: !extras.editorCommand },
    ],
    run: async (id) => {
      if (id === 'copy') { await writeClipboard(text); view.focus(); } else if (id === 'cut') { await writeClipboard(text); replace(''); } else if (id === 'paste') { const s = await readClipboard(); if (s != null) replace(s); } else if (id === 'all') { view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }); view.focus(); } else if (id === 'runSel') extras.runSelection(text);
      else if (id === 'comment') cmd('comment')();
      else if (id === 'uncomment') cmd('uncomment')();
      else if (id === 'find') cmd('find')();
    },
  };
}

function commandWindowMenu(root) {
  const sel = String(window.getSelection() || '');
  return {
    items: [
      { id: 'copy', label: t('copy'), icon: 'copy', keys: 'Ctrl+C', disabled: !sel },
      { id: 'all', label: t('cm_select_all'), icon: 'selectAll', keys: 'Ctrl+A' },
      { id: 'paste', label: t('cm_paste_prompt'), icon: 'paste', keys: 'Ctrl+V', disabled: !extras.pasteToPrompt },
      { sep: true },
      { id: 'clear', label: t('rb_clear_cmd'), icon: 'clearCmd', disabled: !extras.clearCommandWindow },
    ],
    run: async (id) => {
      if (id === 'copy') await writeClipboard(sel);
      else if (id === 'all') { const out = root.querySelector('.cw-out'); if (out) window.getSelection().selectAllChildren(out); } else if (id === 'paste') { const s = await readClipboard(); if (s != null) extras.pasteToPrompt(s); } else if (id === 'clear') extras.clearCommandWindow();
    },
  };
}

function textMenu(target) {
  const sel = String(window.getSelection() || '');
  const box = target.closest('.selectable, .guide-content, [role="log"], .dialog-body, .start-page, .pane-box') || document.body;
  return {
    items: [
      { id: 'copy', label: t('copy'), icon: 'copy', keys: 'Ctrl+C', disabled: !sel },
      { id: 'all', label: t('cm_select_all'), icon: 'selectAll', keys: 'Ctrl+A' },
    ],
    run: async (id) => {
      if (id === 'copy') await writeClipboard(sel);
      else if (id === 'all') window.getSelection().selectAllChildren(box);
    },
  };
}

/** Builds the menu for a right-clicked element (exported for tests). */
export function menuFor(target) {
  const el = target && target.nodeType === 1 ? target : target && target.parentElement;
  if (!el) return null;
  const cm = el.closest('.cm-editor');
  if (cm) { const view = EditorView.findFromDOM(cm); if (view) return editorMenu(view); }
  if (isField(el)) return fieldMenu(el);
  const cw = el.closest('.cw');
  if (cw) return commandWindowMenu(cw);
  return textMenu(el);
}

let installed = false;
/** Once per window: replaces the built-in context menu everywhere. */
export function installContextMenus() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return; // a component showed its own menu
    e.preventDefault();
    // Small dropdown windows (menus, lists, the theme picker): no room for a menu.
    const kind = (popupRoute() || {}).kind;
    if (kind === 'menu' || kind === 'select' || kind === 'themes' || kind === 'pool') return;
    const m = menuFor(e.target);
    if (!m) return;
    openMenu({ x: e.clientX, y: e.clientY }, m.items, (id) => { m.run(id); });
  });
}
