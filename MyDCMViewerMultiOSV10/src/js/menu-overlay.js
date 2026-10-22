/* The menu overlay window (menu.html, desktop only).
 *
 * A web page cannot draw outside its window, so on the desktop every open drop-down / context menu of the
 * main window is shown here instead: a transparent, borderless window that never takes the focus and covers
 * the work area of the main window's monitor. The main page (MenuMirror in app.js) sends a copy of the open
 * panel with the screen position it has in the main window; this page draws it there, lets it run past the
 * main window's edges (shifted back only at the monitor's edges) and reports what the user does:
 *   { type: 'pick', index, remove }   a button of the panel (index among its buttons) was clicked
 *   { type: 'title', index, click }   the pointer is over / pressed a menu title of the main window
 *   { type: 'dismiss' }               pressed outside the menu, or Esc
 */
(function () {
  const T = window.__TAURI__;
  if (!T) return;
  const invoke = (cmd, args) => T.core.invoke(cmd, args);
  const root = document.getElementById('menuRoot');
  let panel = null, hot = [], lastHot = -1;

  const send = (data) => invoke('menu_event', { data }).catch(() => {});

  function render(msg) {
    const p = msg.payload || {}, off = msg.offset || { x: 0, y: 0 };
    document.documentElement.setAttribute('style', p.rootStyle || '');
    document.body.className = `menu-overlay-page ${p.bodyClass || ''}`;
    document.body.dataset.theme = p.theme || '';
    document.body.dataset.scheme = p.scheme || '';
    // the panel's ancestors are rebuilt as display:contents boxes, so selectors that depend on them still match
    let html = p.html || '';
    for (const a of (p.chain || []).slice().reverse()) html = `<${a.tag} class="${a.cls}" style="display:contents">${html}</${a.tag}>`;
    root.innerHTML = html;
    panel = root.querySelector('[data-mirror-panel]');
    hot = (p.hot || []).map((h) => ({ ...h, x: h.x + off.x, y: h.y + off.y }));
    lastHot = p.ownerIndex == null ? -1 : p.ownerIndex;
    if (!panel) return;
    const s = panel.style;
    s.position = 'fixed'; s.margin = '0'; s.right = 'auto'; s.bottom = 'auto';
    s.left = `${p.rect.x + off.x}px`; s.top = `${p.rect.y + off.y}px`;
    // keep it on the monitor: shift left / up only as far as needed
    const r = panel.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    if (r.right > W - 2) s.left = `${Math.max(2, W - r.width - 2)}px`;
    if (r.bottom > H - 2) {
      // a context menu opens upwards from the pointer; a drop-down is moved up just enough
      const y = p.kind === 'ctx' && p.rect.y + off.y - r.height >= 2 ? p.rect.y + off.y - r.height : Math.max(2, H - r.height - 2);
      s.top = `${y}px`;
    }
    if (r.height > H - 4) { s.maxHeight = `${H - 4}px`; s.overflowY = 'auto'; }
  }

  // sub-menus open to the left / move up when they would leave the monitor
  document.addEventListener('mouseover', (e) => {
    const sub = e.target.closest && e.target.closest('.menu-sub');
    if (!sub) return;
    const child = sub.querySelector(':scope > .menu-panel');
    if (!child) return;
    child.style.left = ''; child.style.right = ''; child.style.top = '';
    requestAnimationFrame(() => {
      const r = child.getBoundingClientRect();
      if (r.right > window.innerWidth - 2) { child.style.left = 'auto'; child.style.right = '100%'; }
      if (r.bottom > window.innerHeight - 2) child.style.top = `${-5 - (r.bottom - window.innerHeight + 4)}px`;
    });
  });

  const hotAt = (x, y) => hot.find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);

  document.addEventListener('mousedown', (e) => {
    // never left on screen without a menu: it would swallow every click meant for the windows below
    if (!panel) { invoke('menu_close').catch(() => {}); send({ type: 'dismiss' }); return; }
    if (panel.contains(e.target)) return;
    e.preventDefault();
    const h = hotAt(e.clientX, e.clientY);
    if (h && e.button === 0) send({ type: 'title', index: h.i, click: true });
    else send({ type: 'dismiss' });
  });
  document.addEventListener('mousemove', (e) => {
    if (panel && panel.contains(e.target)) return;
    const h = hotAt(e.clientX, e.clientY);
    const i = h ? h.i : -1;
    if (i !== lastHot) { lastHot = i; if (h) send({ type: 'title', index: h.i, click: false }); }
  });
  document.addEventListener('click', (e) => {
    if (!panel || !panel.contains(e.target)) return;
    const b = e.target.closest('button');
    if (!b || b.disabled || b.classList.contains('menu-sub-title')) return;
    const index = [...panel.querySelectorAll('button')].indexOf(b);
    if (index >= 0) send({ type: 'pick', index, remove: !!e.target.closest('.menu-remove') });
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') send({ type: 'dismiss' }); });

  async function show(msg) {
    render(msg);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    invoke('menu_shown', { serial: msg.serial }).catch(() => {});
  }
  T.event.listen('menu-open', (e) => show(e.payload));
  T.event.listen('menu-close', () => { root.innerHTML = ''; panel = null; hot = []; });
  // a menu opened while this window was still loading
  invoke('menu_overlay_ready').then((msg) => { if (msg) show(msg); }).catch(() => {});
  window.MenuOverlay = { get panel() { return panel; } };
})();
