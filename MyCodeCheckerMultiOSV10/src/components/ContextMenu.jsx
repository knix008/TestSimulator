// The right-click menu everywhere the app has no menu of its own: the
// WebView's built-in one has no icons and offers developer items. In a text
// box: undo, redo, cut, copy, paste, delete and select all. Elsewhere: on a
// row about a source file (an issue, a defect, a hotspot, a line of code) open
// it in the code view and copy its location or the row; copy the selected
// text; open or copy a link; select all; refresh. The app's own menus
// (document tabs …) call preventDefault first and are left alone. The menu is
// drawn in the page so the text box keeps its focus and selection.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call, isDesktop } from '../lib/backend';

const emit = (id) => window.dispatchEvent(new CustomEvent('mcc-action', { detail: id }));
import { Icon, menuIcon } from './Chrome';

function editableOf(el) {
  const node = el && el.closest ? el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') : null;
  if (!node) return null;
  if (node.tagName === 'INPUT' && !/^(text|search|url|email|password|number|tel|)$/i.test(node.type || '')) return null;
  if (node.disabled) return null;
  return node;
}

function selectedText(box) {
  if (box && (box.tagName === 'INPUT' || box.tagName === 'TEXTAREA')) {
    try { return box.value.slice(box.selectionStart || 0, box.selectionEnd || 0); } catch { return ''; }
  }
  return String(window.getSelection ? window.getSelection() : '');
}

// Puts text into a text box at its selection the way typing does, so React sees the change.
function insertText(box, text) {
  box.focus();
  if (document.execCommand && document.execCommand('insertText', false, text)) return;
  if (box.tagName === 'INPUT' || box.tagName === 'TEXTAREA') {
    const start = box.selectionStart || 0;
    const end = box.selectionEnd || 0;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), 'value').set;
    setter.call(box, box.value.slice(0, start) + text + box.value.slice(end));
    box.setSelectionRange(start + text.length, start + text.length);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* fall back */ }
  document.execCommand('copy');
}

// The page may not read the clipboard (WebView permission): the desktop
// service reads it from the system instead.
async function readClipboard() {
  try { return await navigator.clipboard.readText(); } catch { /* fall back */ }
  if (isDesktop) {
    try { const r = await call('clipboard.read'); return (r && r.text) || ''; } catch { /* none */ }
  }
  return null;
}

function itemsFor(target) {
  const box = editableOf(target);
  const sel = selectedText(box);
  const link = target && target.closest ? target.closest('a[href]') : null;
  if (box) {
    const readOnly = box.readOnly || box.getAttribute('aria-readonly') === 'true';
    return {
      box,
      items: [
        { id: 'undo', label: t('cm_undo'), icon: 'undo', keys: 'Ctrl+Z', disabled: readOnly },
        { id: 'redo', label: t('cm_redo'), icon: 'redo', keys: 'Ctrl+Y', disabled: readOnly },
        { sep: true },
        { id: 'cut', label: t('cm_cut'), icon: 'cut', keys: 'Ctrl+X', disabled: readOnly || !sel || box.type === 'password' },
        { id: 'copy', label: t('cm_copy'), icon: 'copy', keys: 'Ctrl+C', disabled: !sel || box.type === 'password' },
        { id: 'paste', label: t('cm_paste'), icon: 'paste', keys: 'Ctrl+V', disabled: readOnly },
        { id: 'delete', label: t('cm_delete'), icon: 'trash', keys: 'Del', disabled: readOnly || !sel },
        { sep: true },
        { id: 'selectAll', label: t('cm_select_all'), icon: 'selectAll', keys: 'Ctrl+A' },
      ],
    };
  }
  const items = [];
  const at = target && target.closest ? target.closest('[data-open-file]') : null;
  const row = target && target.closest ? target.closest('tr, .row, .insp-row, .recent-item') : null;
  const where = at ? { file: at.getAttribute('data-open-file'), line: Number(at.getAttribute('data-open-line')) || 0 } : null;
  if (where) {
    items.push({ id: 'openCode', label: t('cm_open_code'), icon: 'code' });
    items.push({ id: 'copyWhere', label: t('cm_copy_location'), icon: 'file' });
  }
  if (row && row.innerText && row.innerText.trim()) items.push({ id: 'copyRow', label: t('cm_copy_row'), icon: 'list' });
  if (where || (row && row.innerText && row.innerText.trim())) items.push({ sep: true });
  items.push({ id: 'copy', label: t('cm_copy'), icon: 'copy', keys: 'Ctrl+C', disabled: !sel.trim() });
  if (link) {
    items.push({ id: 'openLink', label: t('cm_open_link'), icon: 'external' });
    items.push({ id: 'copyLink', label: t('cm_copy_link'), icon: 'link' });
  }
  items.push({ id: 'selectArea', label: t('cm_select_all'), icon: 'selectAll', keys: 'Ctrl+A' });
  items.push({ sep: true });
  items.push({ id: 'refresh', label: t('cm_refresh'), icon: 'refresh', keys: 'F5' });
  return { box: null, sel, link, where, row, target, items };
}

export function ContextMenuHost() {
  useLanguage();
  const [menu, setMenu] = useState(null); // { x, y, items, box, sel, link }
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    // Bubble phase: a menu of the app's own called preventDefault already.
    const onMenu = (e) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      const found = itemsFor(e.target);
      setMenu(found ? { ...found, x: e.clientX, y: e.clientY } : null);
    };
    const close = () => setMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('contextmenu', onMenu);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(null); };
    const scrolled = () => setMenu(null);
    window.addEventListener('mousedown', away, true);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      window.removeEventListener('mousedown', away, true);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, [menu]);
  // Kept inside the window.
  useLayoutEffect(() => {
    if (!menu || !ref.current) { setPos(null); return; }
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)) });
  }, [menu]);

  const run = async (id) => {
    const m = menu;
    setMenu(null);
    if (!m) return;
    const box = m.box;
    if (box) box.focus();
    if (id === 'undo') document.execCommand('undo');
    else if (id === 'redo') document.execCommand('redo');
    else if (id === 'cut') { await writeClipboard(selectedText(box)); insertText(box, ''); }
    else if (id === 'copy') await writeClipboard(box ? selectedText(box) : m.sel);
    else if (id === 'paste') { const text = await readClipboard(); if (text != null) insertText(box, text); }
    else if (id === 'delete') insertText(box, '');
    else if (id === 'selectAll') { if (box.select) box.select(); else document.execCommand('selectAll'); }
    else if (id === 'openLink' && m.link) window.open(m.link.href, '_blank', 'noopener');
    else if (id === 'openCode' && m.where) emit(`openCode:${m.where.line}:${m.where.file}`);
    else if (id === 'copyWhere' && m.where) await writeClipboard(m.where.line ? `${m.where.file}:${m.where.line}` : m.where.file);
    else if (id === 'copyRow' && m.row) await writeClipboard(m.row.innerText.replace(/\t+/g, '\t').trim());
    else if (id === 'selectArea') {
      // The text of the pane under the pointer (the view, a panel, a dialog).
      const area = (m.target && m.target.closest && m.target.closest('.tab-pane, .dock, .bp-body, .dialog, .codepane, main')) || document.body;
      const range = document.createRange();
      range.selectNodeContents(area);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
    } else if (id === 'refresh') emit('refresh');
    else if (id === 'copyLink' && m.link) await writeClipboard(m.link.href);
  };

  if (!menu) return null;
  return (
    <div ref={ref} className="menu-pop ctx-menu" role="menu" data-testid="context-menu"
      style={{ position: 'fixed', left: pos ? pos.left : menu.x, top: pos ? pos.top : menu.y, visibility: pos ? 'visible' : 'hidden' }}
      onMouseDown={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, n) => (it.sep
        ? <div key={`sep-${n}`} className="menu-sep" />
        : (
          <button key={it.id} type="button" role="menuitem" className="menu-item" disabled={!!it.disabled} onClick={() => run(it.id)}>
            <Icon name={menuIcon(it)} size={14} /><span className="menu-item-label">{it.label}</span>{it.keys && <span className="menu-keys">{it.keys}</span>}
          </button>
        )))}
    </div>
  );
}
