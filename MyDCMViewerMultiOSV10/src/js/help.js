/* The help window: every feature explained with pictures (pages built from doc/help/*.md by
 * scripts/make-help.mjs into src/help/help-data.js — window.HELP_PAGES).
 *
 *   HelpUI.dialog(box, payload, ctx)   the 'help' dialog; payload { page?: id }
 *     ctx.send('tour', stepId)          start the tutorial at that step (the main window runs it)
 *   HelpUI.SIZE
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HelpUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STYLE = `
.help { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.help-body { display: flex; gap: 14px; min-height: 0; height: min(640px, 70vh); }
/* the help window: the page fills the window and follows its size (the article scrolls, nothing is cut off) */
.popup-box.help { width: auto !important; height: 100vh; box-sizing: border-box; overflow: hidden; }
.popup-box.help > h2, .popup-box.help > .modal-actions { flex: none; margin: 0; }
.popup-box.help .help-body { flex: 1; height: auto; }
.help-nav { flex: 0 0 250px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.help-search { background: var(--panel-bg2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; color: var(--text); }
.help-list { flex: 1; overflow: auto; border: 1px solid var(--border); border-radius: 8px; padding: 4px; }
.help-list button { display: flex; gap: 8px; width: 100%; text-align: left; background: none; border: 0; border-radius: 5px; padding: 6px 8px; color: var(--text); cursor: pointer; font-size: 13px; }
.help-list button:hover { background: var(--hover); }
.help-list button.on { background: var(--accent); color: var(--accent-text, #fff); }
.help-list .n { flex: 0 0 22px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.help-list button.on .n { color: inherit; }
.help-list .sub { padding-left: 38px; font-size: 12px; color: var(--text-dim); }
.help-list .hit { font-size: 11px; color: var(--text-dim); display: block; margin-top: 2px; }
.help-article { flex: 1; min-width: 0; overflow-x: hidden; overflow-y: auto; overflow-wrap: anywhere; border: 1px solid var(--border); border-radius: 8px; padding: 6px 22px 22px; line-height: 1.65; font-size: 13.5px; }
.help-article h1 { font-size: 21px; margin: 14px 0 10px; }
.help-article h2 { font-size: 16px; margin: 22px 0 8px; padding-top: 10px; border-top: 1px solid var(--border); }
.help-article h3 { font-size: 14px; margin: 16px 0 6px; }
.help-article p { margin: 6px 0 10px; }
.help-article figure { margin: 12px 0 16px; text-align: center; }
.help-article figure img { max-width: 100%; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,.25); cursor: zoom-in; }
.help-article figcaption { font-size: 12px; color: var(--text-dim); margin-top: 6px; }
.help-article table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 12.5px; }
.help-article th, .help-article td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; vertical-align: top; }
.help-article th { background: var(--panel-bg2); }
.help-article code, .help-article kbd { font-family: var(--mono, monospace); font-size: 12px; background: var(--panel-bg2); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
.help-article blockquote { margin: 10px 0; padding: 8px 12px; border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 0 6px 6px 0; }
.help-article pre { white-space: pre-wrap; }
.help-article ul, .help-article ol { margin: 6px 0 12px; padding-left: 22px; }
.help-tourbtn { display: inline-flex; align-items: center; gap: 6px; margin: 4px 0 10px; }
.help-zoom { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,.82); display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
.help-zoom img { max-width: 96vw; max-height: 94vh; border-radius: 6px; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
.help-empty { color: var(--text-dim); padding: 20px; }
`;

  const MIN_SIZE = { width: 920, height: 640 };
  // default: wide enough for the pictures next to the list, as tall as the screen allows
  const SIZE = { width: 1180, get height() { return typeof screen !== 'undefined' ? Math.max(MIN_SIZE.height, Math.min(920, screen.availHeight - 60)) : 900; } };

  function dialog(box, payload, ctx) {
    payload = payload || {};
    ctx = ctx || {};
    const I = window.I18n;
    const t = (k, fb) => { const v = I ? I.t(k) : k; return v === k ? fb : v; };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (!document.getElementById('helpStyle')) { const st = document.createElement('style'); st.id = 'helpStyle'; st.textContent = STYLE; document.head.append(st); }
    box.classList.add('help');
    // a window that can be made smaller, but never so small that the list and the article stop fitting side by side
    if (ctx.isPopup && typeof window !== 'undefined' && window.desktopAPI && window.desktopAPI.setMinSize) window.desktopAPI.setMinSize(MIN_SIZE.width, MIN_SIZE.height);
    // the pages in the main window's language (Korean pages for 'ko', English ones otherwise)
    const pagesFor = (lang) => { const L = window.HELP_LANGS; return (L && (L[lang] || L.en)) || window.HELP_PAGES || []; };
    let pages = pagesFor(I && I.lang);
    box.innerHTML = `<h2>${esc(t('helpwin.title', 'Help'))}</h2>
      <div class="help-body"><div class="help-nav"><input class="help-search" type="search" placeholder="${esc(t('helpwin.search', 'Search'))}"><div class="help-list"></div></div><article class="help-article"></article></div>`;
    const list = box.querySelector('.help-list'), art = box.querySelector('.help-article'), search = box.querySelector('.help-search');
    let current = pages.find((p) => p.id === payload.page) || pages[0];

    const tourButton = (step) => `<button type="button" class="btn help-tourbtn" data-tour="${esc(step)}">▶ ${esc(t('helpwin.tour', 'Show in the tutorial'))}</button>`;
    function show(page, anchor) {
      if (!page) { art.innerHTML = `<div class="help-empty">${esc(t('helpwin.none', 'No help pages.'))}</div>`; return; }
      current = page;
      art.innerHTML = page.html.replace('</h1>', `</h1>${page.tour ? tourButton(page.tour) : ''}`)
        .replace(/<div class="help-tour" data-tour="([\w-]+)"><\/div>/g, (m, id) => tourButton(id));
      art.scrollTop = 0;
      if (anchor) { const h = art.querySelector('#' + anchor); if (h) h.scrollIntoView(); }
      drawList();
    }
    function drawList() {
      const q = search.value.trim().toLowerCase();
      const hits = pages.filter((p) => !q || p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
      list.innerHTML = hits.length ? hits.map((p, i) => {
        const n = pages.indexOf(p) + 1;
        let extra = '';
        if (q && !p.title.toLowerCase().includes(q)) { const at = p.text.toLowerCase().indexOf(q); extra = `<span class="hit">…${esc(p.text.slice(Math.max(0, at - 18), at + q.length + 30))}…</span>`; }
        const subs = !q && p === current ? p.headings.filter((h) => h.level === 2).map((h) => `<button type="button" class="sub" data-page="${p.id}" data-anchor="${h.id}">${esc(h.text)}</button>`).join('') : '';
        return `<button type="button" data-page="${p.id}" class="${p === current ? 'on' : ''}"><span class="n">${n}</span><span>${esc(p.title)}${extra}</span></button>${subs}`;
      }).join('') : `<div class="help-empty">${esc(t('helpwin.noHits', 'Nothing found.'))}</div>`;
    }
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-page]');
      if (b) show(pages.find((p) => p.id === b.dataset.page), b.dataset.anchor);
    });
    art.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tour]');
      if (tb) { ctx.send('tour', tb.dataset.tour); return; }
      const a = e.target.closest('a[data-help]');
      if (a) { e.preventDefault(); show(pages.find((p) => p.id === a.dataset.help)); return; }
      const img = e.target.closest('figure img');
      if (img) {
        const z = document.createElement('div');
        z.className = 'help-zoom';
        z.innerHTML = `<img src="${img.getAttribute('src')}" alt="">`;
        z.addEventListener('click', () => z.remove());
        document.body.append(z);
      }
    });
    search.addEventListener('input', () => {
      drawList();
      const first = list.querySelector('button[data-page]');
      if (search.value.trim() && first) show(pages.find((p) => p.id === first.dataset.page));
    });
    show(current);
    if (ctx.onMessage) ctx.onMessage((event, data) => { if (event === 'page') show(pages.find((p) => p.id === data) || current); });
    const close = document.createElement('div');
    close.className = 'modal-actions';
    close.innerHTML = `<button type="button" class="btn primary">${esc(t('dlg.close', 'Close'))}</button>`;
    close.querySelector('button').addEventListener('click', () => ctx.close && ctx.close());
    box.append(close);
    // the language changed while the window is open: the same page (and words) in the new language
    const onLang = () => {
      if (!box.isConnected || !box.classList.contains('help')) { document.removeEventListener('langchange', onLang); return; }
      const id = current && current.id;
      pages = pagesFor(I && I.lang);
      box.querySelector('h2').textContent = t('helpwin.title', 'Help');
      search.placeholder = t('helpwin.search', 'Search');
      close.querySelector('button').textContent = t('dlg.close', 'Close');
      show(pages.find((p) => p.id === id) || pages[0]);
    };
    document.addEventListener('langchange', onLang);
  }

  return { dialog, SIZE, MIN_SIZE };
});
