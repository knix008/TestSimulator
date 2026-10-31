// MyPhotoManager — user guide window.
//
//   • text: UsersGuide.md / UsersGuide.en.md (guide-content.js, made by
//     scripts/build-guide.mjs), turned into HTML here.
//   • theme and language: the app's. It leaves them in localStorage
//     (myphoto-guide-appearance) and the `storage` event brings changes.
//   • language: 한국어 / English buttons with flags (also ?lang=).
//   • text size: − / 14px / + (10–24 px), kept between visits.
//   • left: the headings of the guide; a click jumps, scrolling marks.
(function () {
  'use strict';
  const root = document.documentElement;
  const doc = document.getElementById('doc');
  const side = document.getElementById('side');
  const content = document.getElementById('content');
  const APPEARANCE_KEY = 'myphoto-guide-appearance';
  const SIZE_KEY = 'myphoto-guide-size';
  const LANG_KEY = 'myphoto-guide-lang';
  const SIZE_MIN = 10;
  const SIZE_MAX = 24;
  const SIZE_DEFAULT = 14;
  const guide = window.__MYPHOTO_GUIDE__ || { ko: '', en: '' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ── markdown (the subset the guide uses) ──
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function inline(text) {
    const codes = [];
    let s = text.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = escape(s);
    // Pictures of the guide (docs/guide/images/…) are copied next to this page, in img/ (scripts/build-guide.mjs).
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => `<img alt="${alt}" src="${/^https?:/.test(src) ? src : `img/${src.split('/').pop()}`}" loading="lazy">`);
    // Links: page anchors work; files of the repository and the web are shown as text (the window would leave the guide).
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => (href.startsWith('#') ? `<a href="${href}">${label}</a>` : `<span class="link" title="${href}">${label}</span>`));
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<i>$2</i>');
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${escape(codes[Number(i)])}</code>`);
  }
  function render(md) {
    const lines = md.split('\n');
    const out = [];
    const lists = []; // [{ type, indent }]
    let para = [];
    const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
    const closeLists = (indent = -1) => {
      while (lists.length && lists.at(-1).indent > indent) out.push(`</li></${lists.pop().type}>`);
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        flush(); closeLists();
        const body = [];
        for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
        out.push(`<pre><code>${escape(body.join('\n'))}</code></pre>`);
        continue;
      }
      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) { flush(); closeLists(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }
      if (/^\s*\|.*\|\s*$/.test(line)) {
        flush(); closeLists();
        const rows = [];
        for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(lines[i]);
        i--;
        const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const hasHead = rows.length > 1 && /^[\s|:-]+$/.test(rows[1]);
        const head = hasHead ? `<thead><tr>${cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
        const bodyRows = (hasHead ? rows.slice(2) : rows).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
        out.push(`<table>${head}<tbody>${bodyRows}</tbody></table>`);
        continue;
      }
      if (/^>\s?/.test(line)) {
        flush(); closeLists();
        const quote = [];
        for (; i < lines.length && /^>\s?/.test(lines[i]); i++) quote.push(lines[i].replace(/^>\s?/, ''));
        i--;
        out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
        continue;
      }
      const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (item) {
        flush();
        const indent = item[1].length;
        const type = /\d/.test(item[2]) ? 'ol' : 'ul';
        closeLists(indent);
        if (lists.length && lists.at(-1).indent === indent && lists.at(-1).type === type) out.push(`</li><li>${inline(item[3])}`);
        else {
          if (lists.length && lists.at(-1).indent === indent) out.push(`</li></${lists.pop().type}>`);
          out.push(`<${type}><li>${inline(item[3])}`);
          lists.push({ type, indent });
        }
        continue;
      }
      if (!line.trim()) { flush(); continue; }
      const picture = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
      if (picture) { flush(); closeLists(); out.push(`<figure>${inline(line.trim())}<figcaption>${escape(picture[1])}</figcaption></figure>`); continue; }
      if (lists.length && /^\s+/.test(line)) { out.push(` ${inline(line.trim())}`); continue; }
      closeLists();
      para.push(line.trim());
    }
    flush(); closeLists();
    return out.join('\n');
  }

  // ── theme ──
  function applyAppearance(a, fromApp) {
    if (!a) return;
    if (a.vars) for (const [k, v] of Object.entries(a.vars)) root.style.setProperty(k, v);
    if (a.mode) root.style.colorScheme = a.mode;
    if (fromApp && (a.language === 'ko' || a.language === 'en')) setLang(a.language);
  }
  let initial = null;
  try { initial = JSON.parse(store.get(APPEARANCE_KEY) || 'null'); } catch { initial = null; }
  const params = new URLSearchParams(location.search);
  let lang = params.get('lang') === 'en' || params.get('lang') === 'ko' ? params.get('lang') : (initial && initial.language) || store.get(LANG_KEY) || 'ko';

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
    ko: { title: 'MyPhotoManager 사용 설명서', smaller: '글자 작게', larger: '글자 크게', size: '글자 크기', contents: '목차' },
    en: { title: 'MyPhotoManager User Guide', smaller: 'Smaller text', larger: 'Larger text', size: 'Text size', contents: 'Contents' },
  };
  function setLang(next) {
    if (next !== 'ko' && next !== 'en') return;
    const keep = content.scrollTop / Math.max(1, content.scrollHeight - content.clientHeight);
    const changed = next !== lang || !doc.childElementCount;
    lang = next;
    store.set(LANG_KEY, lang);
    root.lang = lang;
    const tx = TEXT[lang];
    document.title = tx.title;
    document.getElementById('doc-title').textContent = tx.title;
    sizeDown.title = tx.smaller; sizeUp.title = tx.larger; sizeNow.title = tx.size;
    sizeDown.setAttribute('aria-label', tx.smaller); sizeUp.setAttribute('aria-label', tx.larger);
    side.setAttribute('aria-label', tx.contents);
    for (const b of document.querySelectorAll('.lang-group button')) {
      const on = b.dataset.lang === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (!changed) return;
    doc.innerHTML = render(guide[lang] || guide.ko || '');
    buildSide();
    content.scrollTop = keep * (content.scrollHeight - content.clientHeight);
  }
  for (const b of document.querySelectorAll('.lang-group button')) b.addEventListener('click', () => setLang(b.dataset.lang));

  // ── contents (left) ──
  let entries = [];
  function link(target, text) {
    const a = document.createElement('a');
    a.href = `#${target.id}`;
    a.textContent = text;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      target.scrollIntoView({ block: 'start' });
      history.replaceState(null, '', `${location.search}#${target.id}`);
    });
    entries.push({ el: target, link: a });
    return a;
  }
  function buildSide() {
    entries = [];
    const list = document.createElement('ol');
    let sub = null;
    doc.querySelectorAll('h2, h3').forEach((heading, i) => {
      heading.id = `s-${i + 1}`;
      const li = document.createElement('li');
      li.appendChild(link(heading, heading.textContent));
      if (heading.tagName === 'H2') { list.appendChild(li); sub = null; return; }
      if (!sub) {
        sub = document.createElement('ol');
        (list.lastElementChild || list).appendChild(sub);
      }
      sub.appendChild(li);
    });
    side.replaceChildren(list);
    spy();
  }
  function spy() {
    const top = content.getBoundingClientRect().top + 24;
    let current = entries[0];
    for (const e of entries) if (e.el.getBoundingClientRect().top <= top) current = e;
    for (const e of entries) e.link.classList.toggle('on', e === current);
    if (current) {
      const r = current.link.getBoundingClientRect();
      const s = side.getBoundingClientRect();
      if (r.top < s.top || r.bottom > s.bottom) current.link.scrollIntoView({ block: 'nearest' });
    }
  }
  content.addEventListener('scroll', () => requestAnimationFrame(spy), { passive: true });
  doc.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ block: 'start' });
  });

  // ── follow the app ──
  window.addEventListener('storage', (e) => {
    if (e.key !== APPEARANCE_KEY || !e.newValue) return;
    try { applyAppearance(JSON.parse(e.newValue), true); } catch { /* ignore */ }
  });

  applyAppearance(initial, false);
  applySize();
  setLang(lang);
  window.__myphotoGuide = { render, get lang() { return lang; }, get size() { return size; }, setLang };
})();
