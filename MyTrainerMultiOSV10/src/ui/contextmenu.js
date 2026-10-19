// Context menus with icons everywhere — the WebView's own menu (Back, Reload, Inspect …) never shows.
//   textMenuItems(target)  Cut · Copy · Paste · Select all (and Undo / Redo) for text fields
//   showContextMenu(items, at)  a small menu of [{ label, icon, key, action, disabled, danger }] or 'sep'
// The main window uses its own menu renderer (app.js showMenu) with these item lists; popup windows use
// showContextMenu directly.
import { icon } from '../icons.js';
import { escapeHtml } from './dom.js';

const editable = (el) => el && ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'button'].includes(el.type)) || el.tagName === 'TEXTAREA') && !el.readOnly && !el.disabled;

async function pasteInto(el) {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { return; }
  el.focus();
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.setRangeText(text, start, end, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Text editing items for an input / textarea, or Copy for selected page text. Empty when neither applies. */
export function textMenuItems(target, t) {
  const field = target?.closest?.('input, textarea');
  const selection = String(globalThis.getSelection?.() ?? '');
  if (field && (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT')) {
    const writable = editable(field);
    const selected = field.selectionStart !== field.selectionEnd;
    return [
      { label: t('ctx.undo'), icon: 'undo', key: 'Ctrl+Z', disabled: !writable, action: () => { field.focus(); document.execCommand('undo'); } },
      { label: t('ctx.redo'), icon: 'redo', key: 'Ctrl+Y', disabled: !writable, action: () => { field.focus(); document.execCommand('redo'); } },
      'sep',
      { label: t('ctx.cut'), icon: 'cut', key: 'Ctrl+X', disabled: !writable || !selected, action: async () => { const text = field.value.slice(field.selectionStart, field.selectionEnd); await navigator.clipboard.writeText(text).catch(() => {}); field.setRangeText('', field.selectionStart, field.selectionEnd, 'start'); field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); } },
      { label: t('ctx.copy'), icon: 'copy', key: 'Ctrl+C', disabled: !selected, action: () => navigator.clipboard.writeText(field.value.slice(field.selectionStart, field.selectionEnd)).catch(() => {}) },
      { label: t('ctx.paste'), icon: 'paste', key: 'Ctrl+V', disabled: !writable, action: () => pasteInto(field) },
      'sep',
      { label: t('ctx.selectAll'), icon: 'selectAll', key: 'Ctrl+A', action: () => { field.focus(); field.select(); } },
    ];
  }
  if (selection) return [{ label: t('ctx.copy'), icon: 'copy', key: 'Ctrl+C', action: () => navigator.clipboard.writeText(selection).catch(() => {}) }];
  return [];
}

/** A flat menu at a point (popup windows). Closes on a click outside, Escape or a choice. */
export function showContextMenu(items, at, host = document.body) {
  closeContextMenu();
  if (!items.length) return;
  const shield = document.createElement('div');
  shield.className = 'dropdown-shield ctx-shield';
  const menu = document.createElement('div');
  menu.className = 'dropdown popup-menu ctx-menu';
  menu.innerHTML = items.map((item, i) => (item === 'sep' ? '<div class="menu-sep"></div>' : `<button class="menu-item ${item.danger ? 'danger' : ''}" data-index="${i}" ${item.disabled ? 'disabled' : ''}>
    <span class="menu-icon">${icon(item.icon ?? 'dot')}</span><span>${escapeHtml(item.label)}</span><span class="menu-key">${escapeHtml(item.key ?? '')}</span><span class="menu-check"></span></button>`)).join('');
  host.append(shield, menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(at.x, innerWidth - r.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(at.y, innerHeight - r.height - 4))}px`;
  shield.addEventListener('pointerdown', closeContextMenu);
  shield.addEventListener('contextmenu', (event) => { event.preventDefault(); closeContextMenu(); });
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    const item = button && items[Number(button.dataset.index)];
    if (!item || item.disabled) return;
    closeContextMenu();
    item.action?.();
  });
  menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeContextMenu(); });
  menu.querySelector('.menu-item:not(:disabled)')?.focus({ preventScroll: true });
}

export function closeContextMenu() {
  for (const element of document.querySelectorAll('.ctx-shield, .ctx-menu')) element.remove();
}
