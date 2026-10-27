// Context menus and dropdown menus from anywhere:
//
//   openMenu({ x, y } | DOMRect, items, (id) => …)
//   items: [{ id, label, icon, keys?, disabled?, on?, sep? }]
//
// Desktop: a child window (it can go past the main window, lib/popups.js).
// Web: <MenuHost/> (mounted once in App) draws it in the page.
import { usePopupWindows, openPopupWindow, closePopups } from './popups';
import { menuSize } from './menuColumns';
import { getCustomThemesRaw } from '../themes';
import { getLanguage } from './i18n';

const subs = new Set();
let current = null;
const emit = () => subs.forEach((fn) => fn(current));

export function subscribeMenu(fn) {
  subs.add(fn);
  fn(current);
  return () => subs.delete(fn);
}

export function closeMenu() {
  if (!current) return;
  current = null;
  emit();
}

/** at: a point { x, y } or an element rectangle (the menu opens below it). */
export async function openMenu(at, items, onPick, { width = 260 } = {}) {
  const anchor = at && at.bottom != null
    ? { left: at.left, right: at.right, top: at.top, bottom: at.bottom }
    : { left: at.x, right: at.x, top: at.y, bottom: at.y };
  if (usePopupWindows()) {
    const list = items.map((it) => (it.sep ? { sep: true } : { id: it.id, label: it.label, icon: it.icon, keys: it.keys || '', disabled: !!it.disabled, on: !!it.on }));
    const size = menuSize(list, width);
    await closePopups('menu');
    await openPopupWindow({
      kind: 'menu', anchor, width: size.width, height: size.height,
      payload: { theme: document.documentElement.dataset.theme, language: getLanguage(), customThemes: getCustomThemesRaw(), items: list },
      onResult: (res) => { if (res && res.id) onPick(res.id); },
    });
    return;
  }
  current = { anchor, items, onPick, width };
  emit();
}
