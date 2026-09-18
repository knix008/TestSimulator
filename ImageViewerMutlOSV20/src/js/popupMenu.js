/* Detached context-menu window (Electron only).
 *
 * The main renderer serialises a menu (ContextMenu.show → electronAPI.popupMenu) and the
 * main process shows it in a transparent, frameless, always-above-the-app window that
 * covers the display's work area, so a menu opened near a window edge is no longer
 * clipped by the window. This page re-uses contextMenu.js to draw the same rows and
 * reports clicks back by item id ('popup-event'). Mouse events over the transparent
 * area are passed through to whatever is underneath (setIgnoreMouseEvents) — moving
 * over the menu turns them back on.
 */
(() => {
  const api = window.popupAPI;
  if (!api || !window.ContextMenu) return;
  ContextMenu.init();

  let ignoring = null;
  function setIgnore(v) {
    if (ignoring === v) return;
    ignoring = v;
    api.setIgnoreMouse(v);
  }
  const overMenu = (el) => !!(el && el.closest && el.closest('#context-menu, .ctx-submenu'));
  document.addEventListener('mousemove', (e) => setIgnore(!overMenu(e.target)));
  document.documentElement.addEventListener('mouseleave', () => setIgnore(true));

  // Serialized items → live items whose actions report back to the app window
  function wire(items, seq) {
    return (items || []).map((it) => {
      if (!it || it.separator) return it;
      const o = { ...it };
      if (it.id != null) o.action = () => api.event({ type: 'action', id: it.id, seq });
      else delete o.action;
      if (it.remove) o.remove = { title: it.remove.title, action: () => api.event({ type: 'remove', id: it.remove.id, seq }) };
      if (Array.isArray(it.submenu)) o.submenu = wire(it.submenu, seq);
      else delete o.submenu;
      return o;
    });
  }

  api.onShow(({ seq, x, y, items, theme, kind, lang }) => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    if (kind) document.documentElement.setAttribute('data-theme-kind', kind);
    if (lang) document.documentElement.setAttribute('lang', lang);
    ContextMenu.show(x, y, wire(items, seq), { onHide: () => api.event({ type: 'closed', seq }) });
    setIgnore(true);
  });
  api.onRefresh(({ seq, items }) => ContextMenu.replaceItems(wire(items, seq)));
  api.onHide(() => ContextMenu.hide());
})();
