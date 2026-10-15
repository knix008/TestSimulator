// Drop-down and context menus (in the page).
//   item: { label, icon, shortcut, action, disabled, checked, danger, submenu: [items], remove } | 'separator'
import { h } from './dom.js';
import { icon } from './icons.js';

let open = null;

export function closeMenus() {
  if (!open) return;
  for (const el of open.elements) el.remove();
  document.removeEventListener('pointerdown', open.outside, true);
  document.removeEventListener('keydown', open.keys, true);
  window.removeEventListener('blur', closeMenus);
  open.onClose?.();
  open = null;
}

export const menuOpen = () => Boolean(open);

function build(items, level, owner) {
  const el = h('div.menu', { role: 'menu', dataset: { level: String(level) } });
  for (const item of items) {
    if (!item) continue;
    if (item === 'separator') { el.append(h('div.menu-separator')); continue; }
    if (item.header) { el.append(h('div.menu-header', item.header)); continue; }
    // Every row has an icon: a choice without its own icon shows its state there
    // (radio dot or check box) instead of an empty column.
    const toggle = 'checked' in item || item.radio;
    const stateIcon = item.radio ? (item.checked ? 'radioOn' : 'circle') : item.checked ? 'checkSquare' : 'square';
    const row = h(`button.menu-item${item.danger ? '.danger' : ''}`, { type: 'button', role: 'menuitem', disabled: Boolean(item.disabled), dataset: { id: item.id ?? '' } },
      h('span.menu-check', { html: item.icon && item.checked ? icon('check') : '' }),
      h('span.menu-icon', { html: item.icon ? icon(item.icon) : toggle && !item.swatch ? icon(stateIcon) : '' }),
      h('span.menu-label', item.label),
      h('span.menu-shortcut', item.submenu ? '' : item.shortcut ?? ''),
      item.submenu ? h('span.menu-arrow', { html: icon('chevronRight') }) : null,
      // item.remove: a × at the end of the row (e.g. forget one recent folder); the row goes away.
      item.remove ? h('span.menu-remove', { role: 'button', title: item.removeTitle ?? '', html: icon('close'), onclick: (event) => { event.stopPropagation(); item.remove(); row.remove(); } }) : null);
    if (item.swatch) row.querySelector('.menu-icon').innerHTML = `<span class="swatch" style="background:${item.swatch}"></span>`;
    if (item.submenu) {
      row.addEventListener('pointerenter', () => openSub(row, item.submenu, level + 1, owner));
      row.addEventListener('click', () => openSub(row, item.submenu, level + 1, owner));
    } else {
      row.addEventListener('pointerenter', () => closeFrom(level + 1));
      row.addEventListener('click', () => {
        if (item.disabled) return;
        closeMenus();
        item.action?.();
      });
    }
    el.append(row);
  }
  return el;
}

function closeFrom(level) {
  if (!open) return;
  open.elements = open.elements.filter((el) => {
    if (Number(el.dataset.level) >= level) { el.remove(); return false; }
    return true;
  });
}

function place(el, x, y, { alignRight = false, flipX = null } = {}) {
  document.body.append(el);
  const rect = el.getBoundingClientRect();
  let left = alignRight ? x - rect.width : x;
  let top = y;
  if (left + rect.width > window.innerWidth - 4) left = flipX != null ? flipX - rect.width : window.innerWidth - rect.width - 4;
  if (top + rect.height > window.innerHeight - 4) top = Math.max(4, window.innerHeight - rect.height - 4);
  el.style.left = `${Math.max(4, left)}px`;
  el.style.top = `${Math.max(4, top)}px`;
}

function openSub(row, items, level, owner) {
  closeFrom(level);
  const el = build(items, level, owner);
  const rect = row.getBoundingClientRect();
  place(el, rect.right - 2, rect.top - 4, { flipX: rect.left + 2 });
  open.elements.push(el);
}

/** Shows a menu at (x, y). */
export function showMenu(items, x, y, { onClose, alignRight = false, ignore = null } = {}) {
  closeMenus();
  const el = build(items, 0);
  open = { elements: [el], onClose, ignore };
  place(el, x, y, { alignRight });
  open.outside = (event) => {
    if (open?.elements.some((menu) => menu.contains(event.target))) return;
    if (open?.ignore?.contains(event.target)) return;
    closeMenus();
  };
  open.keys = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenus(); return; }
    const menu = open.elements[open.elements.length - 1];
    const rows = [...menu.querySelectorAll('.menu-item:not(:disabled)')];
    const index = rows.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
      next?.focus();
    } else if (event.key === 'ArrowRight' && document.activeElement?.querySelector('.menu-arrow')) {
      event.preventDefault();
      document.activeElement.click();
      open.elements[open.elements.length - 1].querySelector('.menu-item')?.focus();
    } else if (event.key === 'ArrowLeft' && open.elements.length > 1) {
      event.preventDefault();
      open.elements.pop().remove();
    }
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', open?.outside, true);
    document.addEventListener('keydown', open?.keys, true);
    window.addEventListener('blur', closeMenus);
  });
  return el;
}

/** Context menu at the pointer. */
export function contextMenu(event, items) {
  event.preventDefault();
  event.stopPropagation();
  return showMenu(items, event.clientX, event.clientY);
}

/**
 * Menu bar: [{ id, label, items: () => items }]. Clicking a title opens its menu;
 * moving over another title while one is open switches.
 */
export function menuBar(menus) {
  const bar = h('nav.menubar', { role: 'menubar' });
  let active = null;
  const openTitle = (button, menu) => {
    const rect = button.getBoundingClientRect();
    showMenu(menu.items(), rect.left, rect.bottom + 2, { onClose: () => { button.classList.remove('active'); if (active === button) active = null; } });
    open.ignore = bar;
    button.classList.add('active');
    active = button;
    requestAnimationFrame(() => open?.elements[0]?.querySelector('.menu-item:not(:disabled)')?.focus({ preventScroll: true }));
  };
  for (const menu of menus) {
    const button = h('button.menubar-title', { type: 'button', role: 'menuitem', dataset: { menu: menu.id } }, menu.icon ? h('span.menubar-icon', { html: icon(menu.icon) }) : '', h('span.menubar-label', menu.label));
    button.addEventListener('click', () => {
      if (active === button) { closeMenus(); return; }
      closeMenus();
      openTitle(button, menu);
    });
    button.addEventListener('pointerenter', () => {
      if (active && active !== button) { closeMenus(); openTitle(button, menu); }
    });
    bar.append(button);
  }
  bar.relabel = (labels) => { for (const button of bar.children) { const label = button.querySelector('.menubar-label'); if (label) label.textContent = labels[button.dataset.menu] ?? label.textContent; } };
  return bar;
}
