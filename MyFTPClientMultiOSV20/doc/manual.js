// My FTP Client — user guide behaviour.
//
//   • theme: the main window's colours. The desktop shell puts them in
//     window.__MFC_DOC__ before the page loads and sends `dialog:appearance`
//     when they change; in a browser the app leaves them in localStorage
//     (mfc-doc-appearance) and the `storage` event brings changes.
//   • language: Korean / English buttons; follows the app when it switches.
//   • text size: − / current px / +, kept between visits.
//   • left: the guide's structure (sections and their sub-headings) built from
//     the headings of the language on screen; a click jumps, scrolling marks.
//   • desktop: the header is the title bar (drag, double-click maximizes),
//     with minimize / maximize / close and a resize grip.
(function () {
  'use strict';
  const body = document.body;
  const root = document.documentElement;
  const side = document.getElementById('side');
  const content = document.getElementById('content');
  const sections = Array.from(document.querySelectorAll('main section'));
  const tauri = window.__TAURI__ || null;
  const APPEARANCE_KEY = 'mfc-doc-appearance';
  const SIZE_KEY = 'mfc-doc-size';
  const LANG_KEY = 'mfc-doc-lang';
  const SIZE_MIN = 10;
  const SIZE_MAX = 24;
  const SIZE_DEFAULT = 14;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ── theme ──
  let lang = 'ko';
  function applyAppearance(a, fromApp) {
    if (!a) return;
    if (a.vars) for (const [k, v] of Object.entries(a.vars)) root.style.setProperty(k, v);
    if (a.mode) root.style.colorScheme = a.mode;
    if (fromApp && (a.language === 'ko' || a.language === 'en')) setLang(a.language);
  }
  let initial = window.__MFC_DOC__ || null;
  if (!initial) { try { initial = JSON.parse(store.get(APPEARANCE_KEY) || 'null'); } catch { initial = null; } }
  const params = new URLSearchParams(location.search);
  lang = params.get('lang') === 'en' || params.get('lang') === 'ko' ? params.get('lang')
    : (initial && initial.language) || store.get(LANG_KEY) || 'ko';

  // ── text size ──
  const sizeDown = document.getElementById('size-down');
  const sizeUp = document.getElementById('size-up');
  const sizeNow = document.getElementById('size-now');
  let size = Number(store.get(SIZE_KEY)) || SIZE_DEFAULT;
  if (!(size >= SIZE_MIN && size <= SIZE_MAX)) size = SIZE_DEFAULT;
  function applySize() {
    root.style.setProperty('--doc-size', `${size}px`);
    sizeNow.textContent = `${size}px`;
    sizeDown.disabled = size <= SIZE_MIN;
    sizeUp.disabled = size >= SIZE_MAX;
  }
  sizeDown.addEventListener('click', () => { size = Math.max(SIZE_MIN, size - 1); store.set(SIZE_KEY, String(size)); applySize(); });
  sizeUp.addEventListener('click', () => { size = Math.min(SIZE_MAX, size + 1); store.set(SIZE_KEY, String(size)); applySize(); });

  // ── language ──
  const TEXT = {
    ko: { title: 'My FTP Client 사용 설명서', smaller: '글자 작게', larger: '글자 크게', size: '글자 크기', min: '최소화', max: '최대화 / 이전 크기', close: '닫기', grip: '드래그하여 창 크기 조절' },
    en: { title: 'My FTP Client User Guide', smaller: 'Smaller text', larger: 'Larger text', size: 'Text size', min: 'Minimize', max: 'Maximize / restore', close: 'Close', grip: 'Drag to resize the window' },
  };
  function setLang(next) {
    if (next !== 'ko' && next !== 'en') return;
    lang = next;
    store.set(LANG_KEY, lang);
    body.classList.remove('ko', 'en');
    body.classList.add(lang);
    root.lang = lang;
    const tx = TEXT[lang];
    document.title = tx.title;
    sizeDown.title = tx.smaller; sizeUp.title = tx.larger; sizeNow.title = tx.size;
    sizeDown.setAttribute('aria-label', tx.smaller); sizeUp.setAttribute('aria-label', tx.larger);
    for (const [id, key] of [['win-min', 'min'], ['win-max', 'max'], ['win-close', 'close'], ['grip', 'grip']]) {
      const el = document.getElementById(id);
      if (el) { el.title = tx[key]; el.setAttribute('aria-label', tx[key]); }
    }
    for (const b of document.querySelectorAll('.lang-group button')) b.classList.toggle('on', b.dataset.lang === lang);
    buildSide();
  }
  for (const b of document.querySelectorAll('.lang-group button')) b.addEventListener('click', () => setLang(b.dataset.lang));

  // ── structure (left) ──
  let entries = []; // [{ el, link }] in page order
  function link(target, text) {
    const a = document.createElement('a');
    a.href = `#${target.id}`;
    a.textContent = text;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      target.scrollIntoView({ block: 'start' });
      history.replaceState(null, '', `#${target.id}`);
    });
    entries.push({ el: target, link: a });
    return a;
  }
  function buildSide() {
    entries = [];
    const list = document.createElement('ol');
    for (const sec of sections) {
      const li = document.createElement('li');
      const title = sec.querySelector(`h2 .${lang}`) || sec.querySelector('h2');
      li.appendChild(link(sec, title.textContent));
      // Scoped to the section: body carries the language class too.
      const subs = Array.from(sec.querySelectorAll(`:scope > div.${lang} h3`));
      if (subs.length) {
        const sub = document.createElement('ol');
        subs.forEach((h3, i) => {
          if (!h3.id) h3.id = `${sec.id}-${lang}-${i + 1}`;
          const item = document.createElement('li');
          item.appendChild(link(h3, h3.textContent));
          sub.appendChild(item);
        });
        li.appendChild(sub);
      }
      list.appendChild(li);
    }
    side.replaceChildren(list);
    spy();
  }
  // The entry of the heading nearest above the top of the content marks the place.
  function spy() {
    const top = content.getBoundingClientRect().top + 24;
    let current = entries[0];
    for (const e of entries) {
      if (e.el.getBoundingClientRect().top <= top) current = e;
    }
    for (const e of entries) e.link.classList.toggle('on', e === current);
    if (current) {
      const r = current.link.getBoundingClientRect();
      const s = side.getBoundingClientRect();
      if (r.top < s.top || r.bottom > s.bottom) current.link.scrollIntoView({ block: 'nearest' });
    }
  }
  content.addEventListener('scroll', () => requestAnimationFrame(spy), { passive: true });

  // ── follow the app ──
  window.addEventListener('storage', (e) => {
    if (e.key !== APPEARANCE_KEY || !e.newValue) return;
    try { applyAppearance(JSON.parse(e.newValue), true); } catch { /* ignore */ }
  });

  // ── desktop window ──
  if (tauri && tauri.window) {
    body.classList.add('desktop');
    const win = tauri.window.getCurrentWindow();
    document.getElementById('win-min').addEventListener('click', () => win.minimize());
    document.getElementById('win-max').addEventListener('click', () => win.toggleMaximize());
    document.getElementById('win-close').addEventListener('click', () => win.close());
    const head = document.querySelector('.doc-head');
    head.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('button, a, output')) return;
      if (e.detail === 2) win.toggleMaximize(); else win.startDragging();
    });
    document.getElementById('grip').addEventListener('mousedown', (e) => {
      if (e.button === 0) { e.preventDefault(); win.startResizeDragging('SouthEast'); }
    });
    if (tauri.webviewWindow) {
      tauri.webviewWindow.getCurrentWebviewWindow().listen('dialog:appearance', (e) => applyAppearance(e.payload, true));
    }
  }

  applyAppearance(initial, false);
  applySize();
  setLang(lang);
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start' });
  }
  body.classList.add('ready');
}());
