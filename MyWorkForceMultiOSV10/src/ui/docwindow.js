// The user guide, the tutorial document and the query language, each in a window
// of its own (index.html?viewer=<kind>), the way the modelling app opens its guides.
import guideEn from '../../UsersGuide.en.md?raw';
import guideKo from '../../UsersGuide.md?raw';
import wqlEn from '../../docs/WQL.en.md?raw';
import wqlKo from '../../docs/WQL.md?raw';
import tutorialEn from '../../docs/Tutorial.en.md?raw';
import tutorialKo from '../../docs/Tutorial.md?raw';
import { renderMarkdown } from '../domain/markdown.js';
import { getLanguage, setLanguage } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, L } from './bits.js';
import { illustrate } from './figures.js';
import { openToolWindow } from '../platform/native.js';
import { PRINT_CONTENT_KEY } from './printwin.js';

const SIZE_KEY = 'myworkforce-doc-size';
const SIZES = [12, 13, 14, 15, 16, 18, 20, 22];
function savedSize() {
  try { const value = Number(localStorage.getItem(SIZE_KEY)); return SIZES.includes(value) ? value : 15; } catch { return 15; }
}

export const DOC_KINDS = {
  guide: { glyph: 'book', ko: '사용 설명서', en: "User's guide" },
  tutorial: { glyph: 'play', ko: '튜토리얼 문서', en: 'Tutorial document' },
  wql: { glyph: 'filter', ko: 'WQL 설명서', en: 'WQL guide' },
};

const MARKDOWN = { guide: { ko: guideKo, en: guideEn }, tutorial: { ko: tutorialKo, en: tutorialEn }, wql: { ko: wqlKo, en: wqlEn } };

/** Illustrated HTML for one document in one language. */
export function documentHtml(kind, language) {
  const lang = language === 'en' ? 'en' : 'ko';
  setLanguage(lang);
  const source = MARKDOWN[kind]?.[lang];
  if (!source) return '';
  return illustrate(renderMarkdown(source), kind);
}

/** Opens the document in its own window. Returns false when the window did not open. */
export function openDocument(kind) {
  if (!DOC_KINDS[kind]) return false;
  const lang = getLanguage() === 'en' ? 'en' : 'ko';
  const url = `${location.pathname}?viewer=${encodeURIComponent(kind)}&lang=${lang}`;
  const opened = globalThis.open?.(url, `myworkforce-${kind}`, 'popup=yes,width=1100,height=820');
  if (!opened) return false;
  opened.focus?.();
  return true;
}

/** The same document, drawn in the current window, with no sign-in required. */
export function readingHtml(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return '';
  const lang = getLanguage() === 'en' ? 'en' : 'ko';
  return `<div class="doc-window">
    <header class="viewer-bar">
      <h1>${icon(info.glyph)}<span>${esc(L(info.ko, info.en))}</span></h1>
      <select data-doc-chapter title="${esc(L('장', 'Chapter'))}" aria-label="${esc(L('장', 'Chapter'))}"></select>
      <span class="grow"></span>
      <span class="viewer-find">${icon('search')}<input type="search" data-doc-find placeholder="${esc(L('찾기', 'Find'))}" aria-label="${esc(L('문서에서 찾기', 'Find in the document'))}"><output data-doc-count></output>
        <button type="button" class="icon-button" data-doc="find-prev" title="${esc(L('이전 찾기', 'Previous match'))}">${icon('undo')}</button>
        <button type="button" class="icon-button" data-doc="find-next" title="${esc(L('다음 찾기', 'Next match'))}">${icon('redo')}</button></span>
      <button type="button" class="button" data-action="reader-lang">${icon('globe')}<span>${lang === 'en' ? '한국어' : 'English'}</span></button>
      <button type="button" class="button" data-action="reader-print">${icon('printer')}<span>${L('인쇄', 'Print')}</span></button>
      <button type="button" class="button" data-action="close-reading">${icon('close')}<span>${L('닫기', 'Close')}</span></button>
    </header>
    <article class="md doc-read" id="doc-body">${documentHtml(kind, lang)}</article>
  </div>`;
}

/** Chapter jump and find for a reader painted into root. Safe to call after every paint. */
export function prepareReader(root) {
  if (!root) return;
  const select = root.querySelector('[data-doc-chapter]');
  const body = root.querySelector('#doc-body');
  if (select && body) {
    const heads = [...body.querySelectorAll('h2')];
    const nodes = heads.length ? heads : [...body.querySelectorAll('.doc-step')];
    const list = nodes.map((node, index) => {
      node.id = node.id || `chapter-${index}`;
      const text = (node.matches('h2') ? node.textContent : node.querySelector('b')?.textContent || '').trim();
      return text ? { id: node.id, text } : null;
    }).filter(Boolean);
    select.innerHTML = `<option value="">${esc(L('장', 'Chapter'))}</option>${list.map((item) => `<option value="${esc(item.id)}">${esc(item.text)}</option>`).join('')}`;
  }
  if (root.dataset.readerBound) return;
  root.dataset.readerBound = '1';
  let hits = [];
  let hit = -1;
  const clearMarks = () => {
    root.querySelectorAll('mark.find-hit').forEach((mark) => mark.replaceWith(document.createTextNode(mark.textContent)));
    root.querySelector('#doc-body')?.normalize();
    hits = [];
    hit = -1;
  };
  const showCount = () => {
    const out = root.querySelector('[data-doc-count]');
    if (out) out.textContent = hits.length ? `${hit + 1} / ${hits.length}` : '';
    hits.forEach((mark, index) => mark.classList.toggle('current', index === hit));
    hits[hit]?.scrollIntoView({ block: 'center' });
  };
  const find = (query, step = 0) => {
    const article = root.querySelector('#doc-body');
    const needle = String(query || '').trim();
    if (!article || !needle) { clearMarks(); showCount(); return; }
    if (!hits.length || step === 0) {
      clearMarks();
      const nodes = [];
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode);
      const q = needle.toLowerCase();
      for (const node of nodes) {
        const text = node.nodeValue || '';
        const lower = text.toLowerCase();
        if (!lower.includes(q)) continue;
        const parts = [];
        let from = 0;
        let at = lower.indexOf(q);
        while (at >= 0) {
          if (at > from) parts.push(document.createTextNode(text.slice(from, at)));
          const mark = document.createElement('mark');
          mark.className = 'find-hit';
          mark.textContent = text.slice(at, at + needle.length);
          parts.push(mark);
          hits.push(mark);
          from = at + needle.length;
          at = lower.indexOf(q, from);
        }
        if (from < text.length) parts.push(document.createTextNode(text.slice(from)));
        node.replaceWith(...parts);
      }
      hit = hits.length ? 0 : -1;
    } else if (hits.length) hit = (hit + step + hits.length) % hits.length;
    showCount();
  };
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-doc]');
    if (!button || !root.contains(button)) return;
    const query = root.querySelector('[data-doc-find]')?.value || '';
    if (button.dataset.doc === 'find-next') find(query, hits.length ? 1 : 0);
    if (button.dataset.doc === 'find-prev') find(query, hits.length ? -1 : 0);
  });
  root.addEventListener('change', (event) => {
    if (!event.target.matches('[data-doc-chapter]')) return;
    const id = event.target.value;
    if (id) root.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: 'start' });
  });
  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-doc-find]')) find(event.target.value);
  });
}

/** Draws the document window when the page was opened with ?viewer=. Returns false for the main app. */
export function startViewer(asked) {
  let kind = asked;
  if (!kind) {
    const label = globalThis.window?.__TAURI_INTERNALS__?.metadata?.currentWindow?.label || '';
    if (label.startsWith('doc-')) kind = label.slice(4);
  }
  const info = DOC_KINDS[kind];
  const root = document.querySelector('#app');
  if (!info || !root) return false;
  const params = new URLSearchParams(location.search);
  let lang = params.get('lang') === 'en' ? 'en' : 'ko';
  let hits = [];
  let hit = -1;
  let size = savedSize();

  const title = () => L(info.ko, info.en);

  function setSize(step) {
    const at = SIZES.indexOf(size);
    size = SIZES[Math.max(0, Math.min(SIZES.length - 1, (at < 0 ? 3 : at) + step))];
    try { localStorage.setItem(SIZE_KEY, String(size)); } catch { /* storage off */ }
    const body = root.querySelector('#doc-body');
    if (body) body.style.fontSize = `${size}px`;
    const out = root.querySelector('[data-doc-size]');
    if (out) out.textContent = `${size}px`;
  }

  /** Print: the guide through the print window (printer, page setup and preview), like everything else. */
  function print() {
    const body = root.querySelector('#doc-body');
    const html = body ? body.innerHTML.replace(/<mark class="find-hit[^"]*">([\s\S]*?)<\/mark>/g, '$1') : '';
    try {
      localStorage.setItem(PRINT_CONTENT_KEY, JSON.stringify({ title: `MyWorkForce — ${title()}`, subtitle: '', html, at: Date.now(), lang }));
      openToolWindow('print', lang, `MyWorkForce — ${L('인쇄', 'Print')}`).catch(() => window.print());
    } catch {
      window.print();
    }
  }

  function chapters() {
    const body = root.querySelector('#doc-body');
    if (!body) return [];
    const heads = [...body.querySelectorAll('h2')];
    const nodes = heads.length ? heads : [...body.querySelectorAll('.doc-step')];
    return nodes.map((node, index) => {
      node.id = node.id || `chapter-${index}`;
      const text = (node.matches('h2') ? node.textContent : node.querySelector('b')?.textContent || '').trim();
      return { id: node.id, text };
    }).filter((item) => item.text);
  }

  function paint() {
    setLanguage(lang);
    document.title = `MyWorkForce — ${title()}`;
    root.innerHTML = `<div class="doc-window">
      <header class="viewer-bar">
        <h1>${icon(info.glyph)}<span>${esc(title())}</span></h1>
        <select data-doc-chapter title="${esc(L('장', 'Chapter'))}" aria-label="${esc(L('장', 'Chapter'))}"></select>
        <span class="grow"></span>
        <span class="viewer-find">${icon('search')}<input type="search" data-doc-find placeholder="${esc(L('찾기', 'Find'))}" aria-label="${esc(L('문서에서 찾기', 'Find in the document'))}"><output data-doc-count></output>
          <button type="button" class="icon-button" data-doc="find-prev" title="${esc(L('이전 찾기', 'Previous match'))}">${icon('undo')}</button>
          <button type="button" class="icon-button" data-doc="find-next" title="${esc(L('다음 찾기', 'Next match'))}">${icon('redo')}</button></span>
        <span class="viewer-size" title="${esc(L('글자 크기', 'Text size'))}"><button type="button" class="icon-button" data-doc="smaller" aria-label="${esc(L('글자 작게', 'Smaller text'))}">−</button><output data-doc-size>${size}px</output><button type="button" class="icon-button" data-doc="larger" aria-label="${esc(L('글자 크게', 'Larger text'))}">+</button></span>
        <button type="button" class="button" data-doc="lang" data-id="${lang === 'en' ? 'ko' : 'en'}">${icon('globe')}<span>${lang === 'en' ? '한국어' : 'English'}</span></button>
        <button type="button" class="button" data-doc="print">${icon('printer')}<span>${L('인쇄', 'Print')}</span></button>
      </header>
      <div class="doc-split">
        <nav class="doc-toc" aria-label="${esc(L('목차', 'Contents'))}"><b>${esc(L('목차', 'Contents'))}</b><ol data-doc-toc></ol></nav>
        <article class="md doc-read" id="doc-body" style="font-size:${size}px">${documentHtml(kind, lang)}</article>
      </div>
      <div class="shot-zoom" hidden><img alt=""><span class="shot-zoom-hint">${esc(L('누르거나 Esc로 닫기', 'Click or Esc to close'))}</span></div>
    </div>`;
    const select = root.querySelector('[data-doc-chapter]');
    select.innerHTML = chaptersOf();
    drawContents();
    hits = [];
    hit = -1;
  }

/** The contents panel: every chapter (h2) with its sections (h3); the one being read is marked. */
  function drawContents() {
    const body = root.querySelector('#doc-body');
    const list = root.querySelector('[data-doc-toc]');
    if (!body || !list) return;
    const heads = [...body.querySelectorAll('h2, h3')];
    heads.forEach((head, index) => { head.id = head.id || `part-${index}`; });
    list.innerHTML = heads.map((head) => `<li class="toc-${head.tagName.toLowerCase()}"><a href="#${esc(head.id)}" data-doc-go="${esc(head.id)}">${esc(head.textContent.trim())}</a></li>`).join('');
    const mark = () => {
      const top = body.getBoundingClientRect().top + 24;
      let current = heads[0]?.id || '';
      for (const head of heads) if (head.getBoundingClientRect().top <= top) current = head.id;
      for (const link of list.querySelectorAll('a')) link.classList.toggle('active', link.dataset.docGo === current);
    };
    body.addEventListener('scroll', mark, { passive: true });
    mark();
  }

  function chaptersOf() {
    const list = chapters();
    const head = `<option value="">${esc(L('장', 'Chapter'))}</option>`;
    return head + list.map((item) => `<option value="${esc(item.id)}">${esc(item.text)}</option>`).join('');
  }

  function clearMarks() {
    root.querySelectorAll('mark.find-hit').forEach((mark) => mark.replaceWith(document.createTextNode(mark.textContent)));
    root.querySelector('#doc-body')?.normalize();
    hits = [];
    hit = -1;
  }

  function showCount() {
    const out = root.querySelector('[data-doc-count]');
    if (out) out.textContent = hits.length ? `${hit + 1} / ${hits.length}` : '';
    hits.forEach((mark, index) => mark.classList.toggle('current', index === hit));
    hits[hit]?.scrollIntoView({ block: 'center' });
  }

  function find(query, step = 0) {
    const body = root.querySelector('#doc-body');
    const needle = String(query || '').trim();
    if (!body || !needle) { clearMarks(); showCount(); return; }
    if (!hits.length || step === 0) {
      clearMarks();
      const nodes = [];
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode);
      const q = needle.toLowerCase();
      for (const node of nodes) {
        const text = node.nodeValue || '';
        const lower = text.toLowerCase();
        if (!lower.includes(q)) continue;
        const parts = [];
        let from = 0;
        let at = lower.indexOf(q);
        while (at >= 0) {
          if (at > from) parts.push(document.createTextNode(text.slice(from, at)));
          const mark = document.createElement('mark');
          mark.className = 'find-hit';
          mark.textContent = text.slice(at, at + needle.length);
          parts.push(mark);
          hits.push(mark);
          from = at + needle.length;
          at = lower.indexOf(q, from);
        }
        if (from < text.length) parts.push(document.createTextNode(text.slice(from)));
        node.replaceWith(...parts);
      }
      hit = hits.length ? 0 : -1;
    } else if (hits.length) {
      hit = (hit + step + hits.length) % hits.length;
    }
    showCount();
  }

  paint();
  root.addEventListener('click', (event) => {
    const go = event.target.closest('[data-doc-go]');
    if (go) { event.preventDefault(); document.getElementById(go.dataset.docGo)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    // A screenshot: the whole window shows it; another click (or Esc) closes it.
    const shot = event.target.closest('[data-zoom-shot]');
    const zoom = root.querySelector('.shot-zoom');
    if (shot && zoom) { zoom.querySelector('img').src = shot.src; zoom.hidden = false; return; }
    if (zoom && !zoom.hidden && event.target.closest('.shot-zoom')) { zoom.hidden = true; return; }
    const button = event.target.closest('[data-doc]');
    if (!button) return;
    if (button.dataset.doc === 'print') { print(); return; }
    if (button.dataset.doc === 'smaller') { setSize(-1); return; }
    if (button.dataset.doc === 'larger') { setSize(1); return; }
    if (button.dataset.doc === 'lang') {
      lang = button.dataset.id === 'en' ? 'en' : 'ko';
      const next = new URL(location.href);
      next.searchParams.set('lang', lang);
      history.replaceState(null, '', next);
      paint();
      return;
    }
    const query = root.querySelector('[data-doc-find]')?.value || '';
    if (button.dataset.doc === 'find-next') find(query, hits.length ? 1 : 0);
    if (button.dataset.doc === 'find-prev') find(query, hits.length ? -1 : 0);
  });
  root.addEventListener('change', (event) => {
    if (!event.target.matches('[data-doc-chapter]')) return;
    const id = event.target.value;
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  });
  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-doc-find]')) find(event.target.value);
  });
  document.addEventListener('keydown', (event) => {
    const zoom = root.querySelector('.shot-zoom');
    if (event.key === 'Escape' && zoom && !zoom.hidden) { zoom.hidden = true; return; }
    if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) { event.preventDefault(); setSize(1); return; }
    if ((event.ctrlKey || event.metaKey) && event.key === '-') { event.preventDefault(); setSize(-1); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); print(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      root.querySelector('[data-doc-find]')?.focus();
    }
  });
  return true;
}
