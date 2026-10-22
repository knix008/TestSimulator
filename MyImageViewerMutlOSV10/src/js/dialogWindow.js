/* Dialogs in their own windows (desktop / Tauri).
 *
 * A page cannot draw past its window, so on the desktop every dialog (Settings, About,
 * Print, Resize, File Info, confirmations …) is lifted into a window of its own when it
 * opens, and can be moved anywhere on screen. Nothing about the dialogs changes: they
 * are still the .dialog-overlay elements of index.html, shown and hidden by app.js as
 * before. A MutationObserver sees one become visible, opens about:blank#dialog-<id>
 * (src-tauri main.rs builds an owned frameless window for it), moves the overlay's DOM
 * into that same-origin document — event listeners travel with the nodes — and asks
 * fit_dialog to size and show it. When app.js hides the dialog, the DOM comes back
 * and the window is closed.
 *
 * app.js looks dialog elements up on `document`; while a dialog is out, those lookups
 * also search the dialog windows (see _patchLookups). Esc pressed in a dialog window is
 * passed on to the main page, which owns the close logic. The main window is blocked
 * (like the in-page overlay did) while a dialog is out.
 */
(function initDialogWindows() {
  const T = window.__TAURI__;
  if (!T || !T.core || typeof T.core.invoke !== 'function') return;
  const invoke = (cmd, args) => T.core.invoke(cmd, args);

  // Kept in the page: the progress dialog is brief and sits over running work
  const IN_PAGE = new Set(['progress-overlay']);
  const open = new Map();   // overlay id → { win, label, overlay, home, boxStyle, ro }
  let blocker = null;

  const isShown = (el) => el.classList.contains('visible') || el.style.display === 'flex';

  /* ── document lookups that also see the dialogs that are out ── */
  function _patchLookups() {
    const byId = document.getElementById.bind(document);
    const qs = document.querySelector.bind(document);
    const qsa = document.querySelectorAll.bind(document);
    const docs = () => [...open.values()].map((o) => { try { return o.win.document; } catch { return null; } }).filter(Boolean);
    document.getElementById = (id) => {
      const hit = byId(id);
      if (hit || !open.size) return hit;
      for (const d of docs()) { const el = d.getElementById(id); if (el) return el; }
      return null;
    };
    document.querySelector = (sel) => {
      const hit = qs(sel);
      if (hit || !open.size) return hit;
      for (const d of docs()) { const el = d.querySelector(sel); if (el) return el; }
      return null;
    };
    document.querySelectorAll = (sel) => {
      const main = qsa(sel);
      if (!open.size) return main;
      const extra = docs().flatMap((d) => [...d.querySelectorAll(sel)]);
      return extra.length ? [...main, ...extra] : main;
    };
  }

  function _block(on) {
    if (on && !blocker) {
      blocker = document.createElement('div');
      blocker.id = 'dialog-window-blocker';
      // A click on the blocked main window brings the newest dialog forward
      blocker.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const last = [...open.values()].pop();
        try { last?.win.focus(); } catch { /* closed */ }
      });
      document.body.appendChild(blocker);
    } else if (!on && blocker) {
      blocker.remove();
      blocker = null;
    }
  }

  function _docHtml() {
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    return '<!doctype html><html class="dialog-window"><head><meta charset="utf-8">'
      + `<base href="${base}"><title>MyImageViewer</title>`
      + '<link rel="stylesheet" href="styles/main.css"></head><body class="dialog-window-body"></body></html>';
  }

  function _syncLook(doc) {
    const from = document.documentElement, to = doc.documentElement;
    for (const a of ['data-theme', 'data-theme-kind', 'lang', 'style']) {
      const v = from.getAttribute(a);
      if (v == null) to.removeAttribute(a); else to.setAttribute(a, v);
    }
    to.classList.add('dialog-window');
  }

  function _size(entry) {
    const box = entry.box;
    // Grow only: the box was frozen at its in-page size; content that arrives later
    // (Details, print preview) may need more, but shrinking would chase vh rules.
    const w = Math.ceil(Math.max(box.offsetWidth, box.scrollWidth));
    const h = Math.ceil(Math.max(box.offsetHeight, box.scrollHeight));
    if (w !== entry.w || h !== entry.h) {
      if (h > entry.h) box.style.height = `${h}px`;
      if (w > entry.w) box.style.width = `${w}px`;
      entry.w = w; entry.h = h;
      return invoke('fit_dialog', { label: entry.label, width: w, height: h, place: !entry.placed })
        .then(() => { entry.placed = true; })
        .catch(() => {});
    }
    return Promise.resolve();
  }

  async function _detach(overlay) {
    const id = overlay.id;
    const box = overlay.querySelector('.dialog-box') || overlay.firstElementChild;
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const label = `dialog-${id}`;
    const win = window.open(`about:blank#${label}`, label, `width=${Math.ceil(r.width)},height=${Math.ceil(r.height)}`);
    if (!win) return;   // no dialog windows (denied): it stays in the page
    const focused = overlay.contains(document.activeElement) ? document.activeElement : null;
    const sel = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
    const entry = { win, label, overlay, box, home: document.createComment(`dialog:${id}`), boxStyle: box.getAttribute('style'), w: 0, h: 0, placed: false };
    open.set(id, entry);
    _block(true);

    const doc = win.document;
    doc.open(); doc.write(_docHtml()); doc.close();
    _syncLook(doc);
    // Freeze the box at its in-page size (its CSS sizes ride the viewport)
    box.style.width = `${Math.ceil(r.width)}px`;
    box.style.height = `${Math.ceil(r.height)}px`;
    overlay.parentNode.insertBefore(entry.home, overlay);
    doc.body.appendChild(doc.adoptNode(overlay));
    // Wait for the stylesheet, else the first measure is of unstyled content
    const link = doc.querySelector('link[rel=stylesheet]');
    if (link && !link.sheet) await new Promise((res) => { link.onload = res; link.onerror = res; setTimeout(res, 800); });
    if (open.get(id) !== entry) return;   // closed meanwhile

    // Esc in the dialog: the main page owns closing (it also confirms unsaved changes)
    doc.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    });
    // The window closed some other way (Alt+F4): hide the dialog like its × would
    win.addEventListener('pagehide', () => {
      if (open.get(id) === entry && isShown(overlay)) { overlay.style.display = 'none'; overlay.classList.remove('visible'); }
    });
    // Title row moves the window (Windows: app-region in CSS; elsewhere ask the shell)
    doc.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || /Windows/i.test(navigator.userAgent)) return;
      if (!e.target.closest?.('.dialog-header') || e.target.closest('button, input, select, a, textarea')) return;
      e.preventDefault();
      invoke('dialog_start_dragging', { label }).catch(() => {});
    });

    entry.ro = new win.ResizeObserver(() => _size(entry));
    entry.ro.observe(box);
    await _size(entry);
    if (focused && overlay.contains(focused)) {
      try { focused.focus(); if (sel) focused.setSelectionRange(sel[0], sel[1]); } catch { /* not focusable any more */ }
    }
  }

  function _attach(id) {
    const entry = open.get(id);
    if (!entry) return;
    open.delete(id);
    try { entry.ro?.disconnect(); } catch { /* window gone */ }
    const { overlay, box, home } = entry;
    if (entry.boxStyle == null) box.removeAttribute('style'); else box.setAttribute('style', entry.boxStyle);
    if (home.parentNode) home.parentNode.replaceChild(document.adoptNode(overlay), home);
    else document.body.appendChild(document.adoptNode(overlay));
    invoke('close_dialog', { label: entry.label }).catch(() => { try { entry.win.close(); } catch { /* gone */ } });
    if (!open.size) _block(false);
  }

  function _watch(overlay) {
    if (IN_PAGE.has(overlay.id)) return;
    new MutationObserver(() => {
      const shown = isShown(overlay);
      if (shown && !open.has(overlay.id)) _detach(overlay).catch((err) => console.warn('dialog window:', err));
      else if (!shown && open.has(overlay.id)) _attach(overlay.id);
    }).observe(overlay, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function init() {
    _patchLookups();
    document.querySelectorAll('.dialog-overlay[id]').forEach(_watch);
    // Theme / language changes reach the dialogs that are out
    new MutationObserver(() => {
      for (const e of open.values()) { try { _syncLook(e.win.document); } catch { /* closed */ } }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-kind', 'lang', 'style'] });
    window.DialogWindows = { isOut: (id) => open.has(id), count: () => open.size };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
