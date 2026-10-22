/* Menu overlay window (desktop only): src/popup.html.
 *
 * The main page serialises a menu (ContextMenu.show → electronAPI.popupMenu) and
 * src-tauri main.rs shows it in this transparent, borderless window that never takes the
 * focus and covers the work area of the main window's monitor, so a menu opened near a
 * window edge runs past it instead of being clipped. contextMenu.js draws the same rows
 * here; clicks go back to the main page by item id:
 *   { type: 'action' | 'remove', id, seq }   a row (or its ×) was clicked
 *   { type: 'title', index, click, seq }     the pointer is over / pressed a menu bar title
 *   { type: 'closed', seq }                  the menu closed here (outside click, Esc)
 * While a menu is open the overlay takes every click on the screen, like a native menu:
 * a press outside the menu closes it (and is not passed on).
 */
(() => {
  const T = window.__TAURI__;
  if (!T || !T.core || !window.ContextMenu) return;
  const invoke = (cmd, args) => T.core.invoke(cmd, args);
  ContextMenu.init();

  let seq = null;          // menu on screen
  let offset = { x: 0, y: 0 };
  let hot = [];            // menu bar titles of the main window, in overlay coordinates
  let lastHot = -1;
  let swallowClick = false;

  const send = (ev) => invoke('popup_menu_event', { ev: { ...ev, seq } }).catch(() => {});
  const overMenu = (el) => !!(el && el.closest && el.closest('#context-menu, .ctx-submenu'));
  const hotAt = (x, y) => hot.find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);

  // Serialized items → live items whose actions report back to the app window
  function wire(items, s) {
    return (items || []).map((it) => {
      if (!it || it.separator) return it;
      const o = { ...it };
      if (it.id != null) o.action = () => invoke('popup_menu_event', { ev: { type: 'action', id: it.id, seq: s } }).catch(() => {});
      else delete o.action;
      if (it.remove) o.remove = { title: it.remove.title, action: () => invoke('popup_menu_event', { ev: { type: 'remove', id: it.remove.id, seq: s } }).catch(() => {}) };
      if (Array.isArray(it.submenu)) o.submenu = wire(it.submenu, s);
      else delete o.submenu;
      return o;
    });
  }

  function applyLook(p) {
    const root = document.documentElement;
    root.setAttribute('style', p.rootStyle || '');
    if (p.theme) root.setAttribute('data-theme', p.theme);
    if (p.kind) root.setAttribute('data-theme-kind', p.kind);
    if (p.lang) root.setAttribute('lang', p.lang);
  }

  async function show(msg) {
    const p = (msg && msg.payload) || {};
    offset = (msg && msg.offset) || { x: 0, y: 0 };
    seq = p.seq;
    const s = seq;
    applyLook(p);
    hot = (p.hot || []).map((h) => ({ ...h, x: h.x + offset.x, y: h.y + offset.y }));
    const open = (p.hot || []).find((h) => h.open);
    lastHot = open ? open.i : -1;
    ContextMenu.show(p.x + offset.x, p.y + offset.y, wire(p.items, s), {
      onHide: () => invoke('popup_menu_event', { ev: { type: 'closed', seq: s } }).catch(() => {}),
    });
    // Paint first, then appear — never flash the previous menu
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    invoke('popup_menu_shown', { seq: s }).catch(() => {});
  }

  // A press outside the menu: a menu bar title switches / toggles menus in the main window,
  // anything else closes the menu.
  window.addEventListener('mousedown', (e) => {
    if (overMenu(e.target)) return;
    e.preventDefault();
    const h = hotAt(e.clientX, e.clientY);
    if (h && e.button === 0) {
      swallowClick = true;   // the main page decides; contextMenu.js must not also close it here
      send({ type: 'title', index: h.i, click: true });
      return;
    }
    ContextMenu.hide();
  }, true);
  window.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopImmediatePropagation();
  }, true);
  window.addEventListener('mousemove', (e) => {
    if (overMenu(e.target)) return;
    const h = hotAt(e.clientX, e.clientY);
    const i = h ? h.i : -1;
    if (i !== lastHot) { lastHot = i; if (h) send({ type: 'title', index: h.i, click: false }); }
  });
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!overMenu(e.target)) ContextMenu.hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ContextMenu.hide(); });

  T.event.listen('popup-show', (e) => show(e.payload));
  T.event.listen('popup-refresh', (e) => {
    const p = e.payload || {};
    if (p.seq !== seq) return;
    ContextMenu.replaceItems(wire(p.items, seq));
  });
  T.event.listen('popup-hide', () => { seq = null; ContextMenu.hide(); });
  // A menu requested while this page was still loading
  invoke('popup_menu_ready').then((msg) => { if (msg) show(msg); }).catch(() => {});
})();
