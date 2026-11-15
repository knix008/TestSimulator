// The user guide, the tutorial document and the query language, each in a window
// of its own (index.html?viewer=<kind>), the way the modelling app opens its guides.
import guideEn from '../../UsersGuide.en.md?raw';
import guideKo from '../../UsersGuide.md?raw';
import wqlEn from '../../docs/WQL.en.md?raw';
import wqlKo from '../../docs/WQL.md?raw';
import { renderMarkdown } from '../domain/markdown.js';
import { getLanguage, setLanguage } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, L } from './bits.js';
import { illustrate, tutorialDocument } from './figures.js';

export const DOC_KINDS = {
  guide: { glyph: 'book', ko: '사용 설명서', en: "User's guide" },
  tutorial: { glyph: 'play', ko: '튜토리얼 문서', en: 'Tutorial document' },
  wql: { glyph: 'filter', ko: 'WQL 설명서', en: 'WQL guide' },
};

const MARKDOWN = { guide: { ko: guideKo, en: guideEn }, wql: { ko: wqlKo, en: wqlEn } };

/** Illustrated HTML for one document in one language. */
export function documentHtml(kind, language) {
  const lang = language === 'en' ? 'en' : 'ko';
  setLanguage(lang);
  if (kind === 'tutorial') return tutorialDocument();
  const source = MARKDOWN[kind]?.[lang];
  if (!source) return '';
  return illustrate(renderMarkdown(source), kind === 'wql' ? 'wql' : 'guide');
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
export function startViewer(kind) {
  const info = DOC_KINDS[kind];
  const root = document.querySelector('#app');
  if (!info || !root) return false;
  const params = new URLSearchParams(location.search);
  let lang = params.get('lang') === 'en' ? 'en' : 'ko';
  let hits = [];
  let hit = -1;

  const title = () => L(info.ko, info.en);

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
        <button type="button" class="button" data-doc="lang" data-id="${lang === 'en' ? 'ko' : 'en'}">${icon('globe')}<span>${lang === 'en' ? '한국어' : 'English'}</span></button>
        <button type="button" class="button" data-doc="print">${icon('printer')}<span>${L('인쇄', 'Print')}</span></button>
      </header>
      <article class="md doc-read" id="doc-body">${documentHtml(kind, lang)}</article>
    </div>`;
    const select = root.querySelector('[data-doc-chapter]');
    select.innerHTML = chaptersOf();
    hits = [];
    hit = -1;
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
    const button = event.target.closest('[data-doc]');
    if (!button) return;
    if (button.dataset.doc === 'print') { window.print(); return; }
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
  root.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      root.querySelector('[data-doc-find]')?.focus();
    }
  });
  return true;
}
