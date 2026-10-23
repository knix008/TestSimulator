import { t } from './i18n.js';

/**
 * In-page context menus with colourful icons (src/icons/*.svg).
 *
 * The menu is drawn inside the window, so it is kept within the viewport and scrolls when the
 * window is very small. Pressing on it never takes focus, so the editor keeps its selection and
 * Cut / Copy / Paste act on what the user had selected.
 *
 * An entry is either '-' (separator), { row: [...] } (a row of icon-only buttons), or
 * { icon, label, shortcut?, disabled?, danger?, action }.
 */

const isMac = /Mac/i.test(navigator.userAgent || '');
const MOD = isMac ? '⌘' : 'Ctrl+';

export function shortcut(key) {
  return `${MOD}${key}`;
}

let menuEl = null;
let cleanup = null;

function iconImg(name) {
  const img = document.createElement('img');
  img.className = 'icon';
  img.src = `icons/${name}.svg`;
  img.alt = '';
  img.draggable = false;
  return img;
}

export function closeContextMenu() {
  cleanup?.();
  cleanup = null;
  menuEl?.remove();
  menuEl = null;
}

function focusables() {
  return menuEl ? [...menuEl.querySelectorAll('.ctx-item:not([disabled]), .ctx-row-btn:not([disabled])')] : [];
}

function run(entry) {
  closeContextMenu();
  Promise.resolve()
    .then(() => entry.action?.())
    .catch((error) => console.error(error));
}

export function showContextMenu(x, y, entries) {
  closeContextMenu();
  const list = entries.filter(Boolean);
  if (!list.length) return;

  menuEl = document.createElement('div');
  menuEl.className = 'ctx-menu';
  menuEl.setAttribute('role', 'menu');

  for (const entry of list) {
    if (entry === '-') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      sep.setAttribute('role', 'separator');
      menuEl.appendChild(sep);
      continue;
    }
    if (entry.row) {
      const row = document.createElement('div');
      row.className = 'ctx-row';
      for (const btn of entry.row) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ctx-row-btn';
        b.setAttribute('role', 'menuitem');
        b.setAttribute('aria-label', btn.label);
        b.dataset.tooltip = btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label;
        b.disabled = Boolean(btn.disabled);
        b.appendChild(iconImg(btn.icon));
        b.addEventListener('click', () => run(btn));
        row.appendChild(b);
      }
      menuEl.appendChild(row);
      continue;
    }
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `ctx-item${entry.danger ? ' danger' : ''}`;
    item.setAttribute('role', 'menuitem');
    item.disabled = Boolean(entry.disabled);
    item.appendChild(iconImg(entry.icon));
    const label = document.createElement('span');
    label.className = 'ctx-label';
    label.textContent = entry.label;
    item.appendChild(label);
    const key = document.createElement('span');
    key.className = 'ctx-key';
    key.textContent = entry.shortcut || '';
    item.appendChild(key);
    item.addEventListener('click', () => run(entry));
    menuEl.appendChild(item);
  }

  // Keep focus (and the editor's selection) where it was.
  menuEl.addEventListener('mousedown', (e) => e.preventDefault());
  menuEl.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(menuEl);

  // Place inside the viewport: flip left / up when there is no room.
  const margin = 4;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  menuEl.style.maxHeight = `${vh - margin * 2}px`;
  const rect = menuEl.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > vw - margin) left = Math.max(margin, x - rect.width);
  if (top + rect.height > vh - margin) top = Math.max(margin, vh - margin - rect.height);
  menuEl.style.left = `${Math.round(left)}px`;
  menuEl.style.top = `${Math.round(top)}px`;

  const onDown = (e) => {
    if (menuEl && !menuEl.contains(e.target)) closeContextMenu();
  };
  const onKey = (e) => {
    const items = focusables();
    const index = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeContextMenu();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
      items[next].focus({ preventScroll: false });
    }
  };
  const onBlur = () => closeContextMenu();
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onBlur);
  cleanup = () => {
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onBlur);
  };
}

/** Clipboard text — through the app on the desktop (no permission prompt), the browser API on the web. */
export async function readClipboardText() {
  if (window.desktopAPI?.readText) return (await window.desktopAPI.readText()) || '';
  if (navigator.clipboard?.readText) return navigator.clipboard.readText();
  return '';
}

function hasSelection(el) {
  if (el && 'selectionStart' in el && typeof el.selectionStart === 'number') {
    return el.selectionEnd > el.selectionStart;
  }
  const sel = window.getSelection();
  return Boolean(sel && !sel.isCollapsed && sel.toString());
}

/** Cut / Copy / Paste / Select all for any text field or editable area. */
export function editEntries(target) {
  const readOnly = Boolean(target?.readOnly || target?.disabled);
  const selected = hasSelection(target);
  return [
    { icon: 'cut', label: t('ctx.cut'), shortcut: shortcut('X'), disabled: readOnly || !selected, action: () => document.execCommand('cut') },
    { icon: 'copy', label: t('ctx.copy'), shortcut: shortcut('C'), disabled: !selected, action: () => document.execCommand('copy') },
    {
      icon: 'paste',
      label: t('ctx.paste'),
      shortcut: shortcut('V'),
      disabled: readOnly,
      action: async () => {
        const text = await readClipboardText();
        if (!text) return;
        target?.focus?.();
        document.execCommand('insertText', false, text);
      }
    },
    {
      icon: 'select-all',
      label: t('ctx.selectAll'),
      shortcut: shortcut('A'),
      action: () => {
        target?.focus?.();
        if (typeof target?.select === 'function') target.select();
        else document.execCommand('selectAll');
      }
    }
  ];
}

/**
 * Replaces the browser's own context menu (Back / Reload / Inspect in a desktop window).
 * `resolve(event)` returns the entries for what was right-clicked, or null for nothing.
 */
export function initContextMenus(resolve) {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const field = e.target.closest?.('input[type="text"], input[type="number"], input:not([type]), textarea');
    const entries = field ? editEntries(field) : resolve(e);
    if (entries?.length) showContextMenu(e.clientX, e.clientY, entries);
    else closeContextMenu();
  });
}
