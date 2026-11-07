// Drop-down menus, context menus and sub-menus. Items: { label, icon, shortcut, onClick, disabled, checked, items (sub-menu) }
// or null for a separator. Everything stays inside the window: one layer, closed by a click elsewhere or Esc.
import { h } from './dom.js';
import { icon } from './icons.js';

let layer = null;
let opener = null;
const stack = [];

function ensureLayer() {
  if (layer) return layer;
  layer = h('div', { className: 'menu-layer', dataset: { testid: 'menu-layer' } });
  document.querySelector('.app').append(layer);
  return layer;
}

export function closeMenus() {
  for (const m of stack.splice(0)) m.remove();
  opener?.classList.remove('open');
  opener = null;
  layer?.classList.remove('active');
}

export const menuOpen = () => stack.length > 0;

function place(el, x, y, sideways = null) {
  const r = el.getBoundingClientRect();
  const [W, H] = [window.innerWidth, window.innerHeight];
  let [left, top] = [x, y];
  if (left + r.width > W - 2) left = sideways ? sideways.left - r.width + 2 : Math.max(2, W - r.width - 2);
  if (top + r.height > H - 2) top = Math.max(2, H - r.height - 2);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  if (r.height > H - 4) { el.style.maxHeight = `${H - 4}px`; el.style.overflowY = 'auto'; }
}

function closeFrom(level) {
  for (const m of stack.splice(level)) m.remove();
}

function buildMenu(items, level) {
  const list = (typeof items === 'function' ? items() : items).filter((item, i, all) => item || (i > 0 && all[i - 1] && i < all.length - 1));
  const menu = h('div', { className: 'menu', role: 'menu', dataset: { level: String(level) } });
  for (const item of list) {
    if (!item) { menu.append(h('div', { className: 'menu-sep' })); continue; }
    if (item.heading) { menu.append(h('div', { className: 'menu-heading' }, item.heading)); continue; }
    const row = h('button', {
      type: 'button', role: 'menuitem', className: `menu-item${item.checked ? ' checked' : ''}`, disabled: item.disabled ?? false,
      dataset: { testid: item.testid ?? undefined, op: item.op ?? undefined },
      onMouseenter: () => {
        closeFrom(level + 1);
        menu.querySelectorAll('.menu-item.sub-open').forEach((x) => x.classList.remove('sub-open'));
        if (item.items && !item.disabled) {
          row.classList.add('sub-open');
          const r = row.getBoundingClientRect();
          openAt(item.items, r.right - 2, r.top - 3, level + 1, r);
        }
      },
      onClick: (e) => {
        e.stopPropagation();
        if (item.items) {
          if (!item.disabled) { closeFrom(level + 1); const r = row.getBoundingClientRect(); openAt(item.items, r.right - 2, r.top - 3, level + 1, r); }
          return;
        }
        closeMenus();
        item.onClick?.();
      },
    },
    h('span', { className: 'menu-icon' }, item.checked ? icon('check', 13) : item.icon ? icon(item.icon, 14) : null),
    h('span', { className: 'menu-label' }, item.label),
    item.items ? h('span', { className: 'menu-more' }, icon('right', 10)) : item.shortcut ? h('span', { className: 'menu-key' }, item.shortcut) : null);
    menu.append(row);
  }
  return menu;
}

function openAt(items, x, y, level, sideways) {
  const menu = buildMenu(items, level);
  ensureLayer().append(menu);
  layer.classList.add('active');
  stack.push(menu);
  place(menu, x, y, sideways);
  return menu;
}

/** Opens a menu at a page point (context menu). */
export function openMenu(items, x, y) {
  closeMenus();
  return openAt(items, x, y, 0);
}

/** Opens a menu below a header button; `button` stays highlighted while it is open. */
export function openMenuBelow(button, items) {
  closeMenus();
  const r = button.getBoundingClientRect();
  opener = button;
  button.classList.add('open');
  return openAt(items, r.left, r.bottom, 0);
}

/** Header menu titles: hovering another one while a menu is open moves to it. */
export function menuTitle(label, items, testid) {
  const el = h('button', {
    type: 'button', className: 'menu-title', dataset: { testid: testid ?? undefined },
    onClick: (e) => {
      e.stopPropagation();
      if (opener === el) closeMenus(); else openMenuBelow(el, items);
    },
    onMouseenter: () => { if (opener && opener !== el) openMenuBelow(el, items); },
  }, label);
  return el;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => {
    if (stack.length && !e.target.closest?.('.menu') && !e.target.closest?.('.menu-title')) closeMenus();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) { closeMenus(); e.stopPropagation(); e.preventDefault(); }
  }, true);
  window.addEventListener('blur', () => closeMenus());
}
