// Drop-down menus inside the page: the menu bar's menus, submenus, split-button and context
// menus. An item is { id, label, icon, key, checked, disabled, danger, items (submenu), run }
// or 'sep'. Arrow keys move, Enter runs, Esc / a click outside closes.
import { escapeHtml, keyLabel } from './dom.js';
import { icon } from '../icons.js';

let layer = null;
let current = null; // { panels: [element], onClose, anchor }

function ensureLayer() {
  if (layer?.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'menu-layer';
  document.body.appendChild(layer);
  return layer;
}

function panelHtml(items) {
  return items.map((item, index) => {
    if (item === 'sep') return '<div class="menu-sep" role="separator"></div>';
    const check = item.checked === undefined ? '' : item.checked ? icon('check') : '';
    const glyph = item.flag ?? (item.icon ? icon(item.icon) : '');
    return `<button type="button" class="menu-item ${item.danger ? 'danger' : ''} ${item.items ? 'has-sub' : ''}" role="menuitem${item.checked !== undefined ? 'checkbox' : ''}" ${item.checked !== undefined ? `aria-checked="${Boolean(item.checked)}"` : ''} data-index="${index}" ${item.disabled ? 'disabled' : ''} ${item.items ? 'aria-haspopup="true"' : ''} title="${escapeHtml(item.tip ?? '')}">
      <span class="menu-check">${check}</span><span class="menu-icon">${glyph}</span><span class="menu-label">${escapeHtml(item.label)}</span><span class="menu-key">${item.items ? icon('caretRight', 'icon tiny') : escapeHtml(item.key ? keyLabel(item.key) : '')}</span>
    </button>`;
  }).join('');
}

function place(panel, rect, { side = false } = {}) {
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = side ? rect.right - 2 : rect.left;
  let top = side ? rect.top - 6 : rect.bottom + 2;
  if (left + width > vw - 4) left = side ? rect.left - width + 2 : vw - width - 4;
  if (top + height > vh - 4) top = side ? vh - height - 4 : Math.max(4, rect.top - height - 2);
  panel.style.left = `${Math.max(4, left)}px`;
  panel.style.top = `${Math.max(4, top)}px`;
  panel.style.maxHeight = `${vh - 8}px`;
}

function openPanel(items, rect, depth, side) {
  const host = ensureLayer();
  const panel = document.createElement('div');
  panel.className = 'popup-menu in-page';
  panel.setAttribute('role', 'menu');
  panel.dataset.depth = String(depth);
  panel.innerHTML = panelHtml(items);
  host.appendChild(panel);
  place(panel, rect, { side });
  panel.items = items;
  let hoverTimer = 0;
  panel.addEventListener('pointerover', (event) => {
    const button = event.target.closest('.menu-item');
    if (!button || !panel.contains(button)) return;
    clearTimeout(hoverTimer);
    button.focus({ preventScroll: true });
    const item = items[Number(button.dataset.index)];
    hoverTimer = setTimeout(() => {
      closeDeeper(depth);
      if (item?.items && !button.disabled) openSub(button, item, depth);
    }, item?.items ? 90 : 120);
  });
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('.menu-item');
    if (!button || button.disabled) return;
    const item = items[Number(button.dataset.index)];
    if (item.items) { closeDeeper(depth); openSub(button, item, depth); return; }
    activate(item);
  });
  current.panels.push(panel);
  return panel;
}

function openSub(button, item, depth) {
  button.classList.add('open');
  const panel = openPanel(item.items, button.getBoundingClientRect(), depth + 1, true);
  panel.owner = button;
  return panel;
}

function closeDeeper(depth) {
  while (current && current.panels.length > depth + 1) {
    const panel = current.panels.pop();
    panel.owner?.classList.remove('open');
    panel.remove();
  }
}

function activate(item) {
  closeMenu();
  // After the menu is gone: a command that opens a dialog should not see the menu's focus.
  setTimeout(() => item.run?.(), 0);
}

export function closeMenu() {
  if (!current) return;
  const done = current;
  current = null;
  for (const panel of done.panels) panel.remove();
  document.removeEventListener('pointerdown', onOutside, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('blur', closeMenu);
  window.removeEventListener('resize', closeMenu);
  done.onClose?.();
}

export const menuOpen = () => Boolean(current);
export const menuKey = () => current?.key ?? null;

function onOutside(event) {
  if (!current) return;
  if (event.target.closest?.('.menu-layer')) return;
  // The menu bar handles its own buttons (click another menu → that menu).
  if (current.anchor && event.target.closest?.('[data-menu]') && current.key) return;
  closeMenu();
}

function onKey(event) {
  if (!current) return;
  const panel = current.panels.find((p) => p.contains(document.activeElement)) ?? current.panels[current.panels.length - 1];
  const buttons = [...panel.querySelectorAll('.menu-item:not(:disabled)')];
  const index = buttons.indexOf(document.activeElement);
  const depth = Number(panel.dataset.depth);
  const stop = () => { event.preventDefault(); event.stopPropagation(); };
  if (event.key === 'Escape') { stop(); if (depth > 0) { const owner = panel.owner; closeDeeper(depth - 1); owner?.focus(); } else closeMenu(); return; }
  if (event.key === 'ArrowDown') { stop(); buttons[(index + 1) % buttons.length]?.focus(); return; }
  if (event.key === 'ArrowUp') { stop(); buttons[(index - 1 + buttons.length) % buttons.length]?.focus(); return; }
  if (event.key === 'Home') { stop(); buttons[0]?.focus(); return; }
  if (event.key === 'End') { stop(); buttons[buttons.length - 1]?.focus(); return; }
  const item = index >= 0 ? panel.items[Number(buttons[index].dataset.index)] : null;
  if (event.key === 'ArrowRight') {
    stop();
    if (item?.items) { closeDeeper(depth); openSub(buttons[index], item, depth).querySelector('.menu-item:not(:disabled)')?.focus(); } else current.onSide?.(1);
    return;
  }
  if (event.key === 'ArrowLeft') {
    stop();
    if (depth > 0) { const owner = panel.owner; closeDeeper(depth - 1); owner?.focus(); } else current.onSide?.(-1);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    stop();
    if (!item) return;
    if (item.items) { closeDeeper(depth); openSub(buttons[index], item, depth).querySelector('.menu-item:not(:disabled)')?.focus(); } else activate(item);
    return;
  }
  // Tab and other keys: the menu goes away, the key does its normal job.
  if (event.key === 'Tab') closeMenu();
}

/**
 * Opens a menu below (or beside) `anchor` (an element or a DOMRect / {left, top}).
 * options: key (which menu-bar menu), onClose, onSide(direction) for ← → between menu-bar menus, focus (first item).
 */
export function showMenu(items, anchor, options = {}) {
  closeMenu();
  const rect = anchor instanceof Element ? anchor.getBoundingClientRect()
    : anchor && 'width' in anchor ? anchor : { left: anchor.left, right: anchor.left, top: anchor.top, bottom: anchor.top, width: 0, height: 0 };
  current = { panels: [], onClose: options.onClose, onSide: options.onSide, key: options.key ?? null, anchor };
  const panel = openPanel(items, rect, 0, false);
  if (options.header) panel.insertAdjacentHTML('afterbegin', `<div class="menu-header">${icon(options.header.icon)}<span>${escapeHtml(options.header.title)}</span></div>`);
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  if (options.focus !== false) panel.querySelector('.menu-item:not(:disabled)')?.focus({ preventScroll: true });
  return panel;
}
