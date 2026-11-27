// The reading view: puts the Rust renderer's HTML (crates/mdcore/src/render.rs) into an element, sanitized,
// and brings it to life — KaTeX math, Mermaid diagrams, highlighted code with copy / wrap buttons, ```chart
// blocks, callout icons and folding, clickable task boxes, links, tags, the hover page preview, images with a
// lightbox, embedded notes that fold and expand, and heading links. Also the editor ↔ preview line sync.
//
//   await renderPreview(element, html, ctx)      element gets the note (the host gives it .markdown-rendered)
//   scrollToLine(element, line, { smooth })      topLine(element)      setLineHighlight(element, line)
//   scrollToSubpath(element, '#Heading' | '#^block')                   setCodeWrap(element, on)
//   rerenderDiagrams(element, ctx)               destroyPreview(element)
//
// Mermaid, highlight.js and KaTeX are loaded on first use (dynamic import).
import createDOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import './reading.css';
import { registerTexts, t } from '../i18n.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import TEXTS from './texts.js';
import './render-icons.js';
import { alertIconSvg, alertType, calloutIconSvg, calloutType, FOLD_CHEVRON } from './callouts.js';
import { chartHtml } from './chart.js';

registerTexts(TEXTS);

// ───────────────────────── sanitizing

/** Link and source URLs the reading view keeps: the vault's own schemes, the web, Tauri's asset protocol,
 * blobs, images as data, in-page anchors and relative paths. */
export const ALLOWED_URI = /^(?:(?:https?|mailto|tel|mdvault|mdvault-new|asset|blob|tauri|obsidian):|data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;
const IFRAME_SRC = /^(?:$|#|asset:|blob:|tauri:|https?:\/\/asset\.localhost\/)/i;

let purifier = null;
function purify() {
  if (purifier) return purifier;
  purifier = createDOMPurify(window);
  return purifier;
}

const PURIFY_CONFIG = {
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['inert', 'controls', 'loading', 'align', 'allowfullscreen', 'target'],
  FORBID_TAGS: ['style', 'form', 'base', 'meta', 'link', 'object', 'embed'],
  ALLOWED_URI_REGEXP: ALLOWED_URI,
};

/** The note's HTML, sanitized (a string). Iframes survive only as PDF embeds with a local source. */
export function sanitizeHtml(html) {
  const clean = purify().sanitize(String(html ?? ''), PURIFY_CONFIG);
  if (!clean.includes('<iframe')) return clean;
  const box = document.createElement('template');
  box.innerHTML = clean;
  for (const frame of box.content.querySelectorAll('iframe')) {
    if (!frame.parentElement?.classList.contains('pdf-embed') || !IFRAME_SRC.test(frame.getAttribute('src') ?? '')) frame.remove();
  }
  return box.innerHTML;
}

// ───────────────────────── state per rendered element

const states = new WeakMap();
const INLINE_TAGS = new Set(['A', 'SPAN', 'CODE', 'STRONG', 'EM', 'B', 'I', 'DEL', 'S', 'MARK', 'SUP', 'SUB', 'BR', 'IMG', 'INPUT', 'KBD', 'U', 'SMALL']);

function scrollerOf(element, ctx = states.get(element)?.ctx) {
  if (ctx?.scroller) return ctx.scroller;
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return element.parentElement ?? element;
}

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const baseName = (path) => String(path ?? '').split('/').pop().replace(/\.(md|markdown)$/i, '');

async function copy(ctx, text, button) {
  try {
    if (ctx?.copyText) await ctx.copyText(text);
    else await navigator.clipboard.writeText(text);
    if (button) {
      const before = button.innerHTML;
      button.classList.add('is-done');
      button.innerHTML = icon('check');
      setTimeout(() => { button.classList.remove('is-done'); button.innerHTML = before; }, 1200);
    }
  } catch (error) {
    console.warn('copy failed', error);
  }
}

const button = (action, title, iconName, extra = '') => `<button type="button" class="md-btn" data-md-action="${action}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"${extra}>${icon(iconName)}</button>`;

// ───────────────────────── the entry point

/**
 * Puts `html` (render.rs output) into `element` and enhances it. Resolves when math, code, diagrams and media
 * are done. Calling it again on the same element replaces the previous rendering (listeners included).
 */
export async function renderPreview(element, html, ctx = {}) {
  destroyPreview(element);
  const state = { ctx, controller: new AbortController(), timers: new Set(), blocks: null, hoverLink: null, hoverTimer: 0 };
  states.set(element, state);
  const alive = () => states.get(element) === state;
  element.innerHTML = sanitizeHtml(html);
  element.classList.toggle('is-nested-preview', (ctx.depth ?? 0) > 0);

  enhanceCallouts(element);
  enhanceLinks(element);
  enhanceTasks(element, ctx);
  enhanceHeadings(element);
  enhanceEmbeds(element);
  const codeBlocks = prepareCode(element, ctx);
  attachEvents(element, state);

  await Promise.all([
    fillMedia(element, ctx, alive),
    renderMath(element, alive),
    highlightBlocks(codeBlocks, alive),
    renderDiagrams(element, ctx, alive),
  ]);
  if (!alive()) return element;
  measureEmbeds(element);
  state.blocks = null;
  return element;
}

/** Removes the element's listeners, timers and its page preview popovers (the content stays). */
export function destroyPreview(element) {
  const state = states.get(element);
  if (!state) return;
  state.controller.abort();
  for (const id of state.timers) clearTimeout(id);
  clearTimeout(state.hoverTimer);
  closePopovers((state.ctx.depth ?? 0) + 1);
  states.delete(element);
}

// ───────────────────────── callouts, alerts, links, tasks, headings, embeds

function enhanceCallouts(element) {
  for (const callout of element.querySelectorAll('.callout')) {
    const type = calloutType(callout.dataset.callout);
    callout.dataset.calloutType = type;
    const title = callout.querySelector(':scope > .callout-title');
    const iconBox = title?.querySelector(':scope > .callout-icon');
    if (iconBox && !iconBox.firstElementChild) iconBox.innerHTML = calloutIconSvg(type);
    const fold = title?.querySelector(':scope > .callout-fold');
    if (fold && !fold.firstElementChild) fold.innerHTML = FOLD_CHEVRON;
    if (title && callout.dataset.calloutFold) {
      title.setAttribute('role', 'button');
      title.tabIndex = 0;
      title.setAttribute('aria-expanded', String(!callout.classList.contains('is-collapsed')));
    }
  }
  for (const alert of element.querySelectorAll('.markdown-alert')) {
    const type = alertType(alert.className);
    alert.dataset.alertType = type;
    const title = alert.querySelector(':scope > .markdown-alert-title');
    if (title && !title.querySelector('.callout-svg')) title.insertAdjacentHTML('afterbegin', alertIconSvg(type));
  }
}

function enhanceLinks(element) {
  for (const a of element.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (a.classList.contains('is-unresolved')) a.title ||= t('render.unresolved');
    else if (/^(https?|mailto):/i.test(href) && !a.classList.contains('internal-link')) {
      a.classList.add('external-link');
      a.rel = 'noopener noreferrer';
      a.title ||= href;
    }
  }
}

function enhanceTasks(element, ctx) {
  for (const box of element.querySelectorAll('input.task-list-item-checkbox, li.task-list-item > input[type="checkbox"]')) {
    if (ctx.onTaskToggle) box.disabled = false;
    box.closest('li')?.classList.toggle('is-checked', box.checked);
  }
}

function enhanceHeadings(element) {
  for (const h of element.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (h.querySelector(':scope > .heading-copy')) continue;
    h.insertAdjacentHTML('beforeend', button('copy-heading', t('render.copyHeadingLink'), 'renderHeadingLink', ' tabindex="-1"').replace('class="md-btn"', 'class="md-btn heading-copy"'));
  }
}

function enhanceEmbeds(element) {
  for (const embed of element.querySelectorAll('.markdown-embed')) {
    const title = embed.querySelector(':scope > .markdown-embed-title');
    if (title && !title.querySelector(':scope > [data-md-action="embed-toggle"]')) {
      title.insertAdjacentHTML('afterbegin', button('embed-toggle', t('render.toggleEmbed'), 'chevronDown').replace('class="md-btn"', 'class="md-btn markdown-embed-toggle"'));
      title.querySelector('a.internal-link')?.setAttribute('title', t('render.openNote'));
    }
    if (!embed.querySelector(':scope > .markdown-embed-expand')) {
      embed.insertAdjacentHTML('beforeend', `<button type="button" class="markdown-embed-expand" data-md-action="embed-expand">${icon('renderExpand')}<span>${escapeHtml(t('render.expand'))}</span></button>`);
    }
  }
}

function measureEmbeds(element) {
  for (const embed of element.querySelectorAll('.markdown-embed')) {
    const content = embed.querySelector(':scope > .markdown-embed-content');
    if (!content || embed.classList.contains('is-expanded')) continue;
    embed.classList.toggle('is-overflowing', content.scrollHeight > content.clientHeight + 6);
  }
}

// ───────────────────────── code blocks, charts, diagrams

function prepareCode(element, ctx) {
  const blocks = [];
  const wrap = !!ctx.settings?.codeWrap;
  for (const pre of [...element.querySelectorAll('pre')]) {
    if (pre.dataset.mathStyle || pre.closest('.code-block, .md-diagram, .md-chart')) continue;
    const info = (pre.getAttribute('lang') ?? '').trim();
    const lang = info.split(/\s+/)[0].toLowerCase();
    const code = pre.querySelector('code');
    const source = (code ?? pre).textContent;
    const line = pre.dataset.line;
    if (lang === 'mermaid') {
      const box = document.createElement('div');
      box.className = 'md-diagram';
      if (line != null) box.dataset.line = line;
      box.dataset.source = source;
      box.innerHTML = `<div class="md-diagram-bar">${button('diagram-copy-svg', t('render.copySvg'), 'copy')}${button('diagram-copy-source', t('render.copySource'), 'codeBlock')}${button('diagram-zoom', t('render.zoom'), 'zoomIn')}</div><div class="md-diagram-view"><div class="md-diagram-loading">${escapeHtml(t('render.diagramLoading'))}</div></div>`;
      pre.replaceWith(box);
      continue;
    }
    if (lang === 'chart') {
      const box = document.createElement('div');
      box.innerHTML = chartHtml(source);
      const chart = box.firstElementChild;
      if (line != null) chart.dataset.line = line;
      chart.dataset.source = source;
      pre.replaceWith(chart);
      continue;
    }
    const block = document.createElement('div');
    block.className = 'code-block';
    if (wrap) block.classList.add('is-wrapped');
    if (line != null) { block.dataset.line = line; pre.removeAttribute('data-line'); }
    if (lang) block.dataset.lang = lang;
    const fileTitle = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(pre.dataset.meta ?? '');
    const titleText = fileTitle ? (fileTitle[1] ?? fileTitle[2] ?? fileTitle[3]) : '';
    block.innerHTML = `<div class="code-block-bar">${lang ? `<span class="code-block-lang">${escapeHtml(lang)}</span>` : ''}${titleText ? `<span class="code-block-title">${escapeHtml(titleText)}</span>` : ''}<span class="code-block-tools">${button('code-wrap', t('render.wrap'), 'renderWrap')}${button('code-copy', t('render.copyCode'), 'copy')}</span></div>`;
    pre.replaceWith(block);
    block.append(pre);
    if (lang && code) blocks.push({ code, lang });
  }
  return blocks;
}

/** Turns line wrapping of every code block on or off (the global "Code block wrap" setting). */
export function setCodeWrap(element, on) {
  for (const block of element.querySelectorAll('.code-block')) block.classList.toggle('is-wrapped', !!on);
  const state = states.get(element);
  if (state) state.ctx = { ...state.ctx, settings: { ...(state.ctx.settings ?? {}), codeWrap: !!on } };
}

let hljsPromise = null;
const loadHljs = () => (hljsPromise ??= import('highlight.js/lib/common').then((m) => m.default));

// Languages outside highlight.js's "common" set, loaded when a block uses them (one small chunk each).
const EXTRA_LANGUAGES = {
  powershell: () => import('highlight.js/lib/languages/powershell'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  nginx: () => import('highlight.js/lib/languages/nginx'),
  latex: () => import('highlight.js/lib/languages/latex'),
  haskell: () => import('highlight.js/lib/languages/haskell'),
  elixir: () => import('highlight.js/lib/languages/elixir'),
  erlang: () => import('highlight.js/lib/languages/erlang'),
  scala: () => import('highlight.js/lib/languages/scala'),
  dart: () => import('highlight.js/lib/languages/dart'),
  matlab: () => import('highlight.js/lib/languages/matlab'),
  julia: () => import('highlight.js/lib/languages/julia'),
  fortran: () => import('highlight.js/lib/languages/fortran'),
  ocaml: () => import('highlight.js/lib/languages/ocaml'),
  fsharp: () => import('highlight.js/lib/languages/fsharp'),
  clojure: () => import('highlight.js/lib/languages/clojure'),
  lisp: () => import('highlight.js/lib/languages/lisp'),
  scheme: () => import('highlight.js/lib/languages/scheme'),
  cmake: () => import('highlight.js/lib/languages/cmake'),
  protobuf: () => import('highlight.js/lib/languages/protobuf'),
  groovy: () => import('highlight.js/lib/languages/groovy'),
  vim: () => import('highlight.js/lib/languages/vim'),
  x86asm: () => import('highlight.js/lib/languages/x86asm'),
  armasm: () => import('highlight.js/lib/languages/armasm'),
  verilog: () => import('highlight.js/lib/languages/verilog'),
  vhdl: () => import('highlight.js/lib/languages/vhdl'),
  delphi: () => import('highlight.js/lib/languages/delphi'),
  http: () => import('highlight.js/lib/languages/http'),
  properties: () => import('highlight.js/lib/languages/properties'),
  apache: () => import('highlight.js/lib/languages/apache'),
  nix: () => import('highlight.js/lib/languages/nix'),
  prolog: () => import('highlight.js/lib/languages/prolog'),
  tcl: () => import('highlight.js/lib/languages/tcl'),
  zig: null,
};
const EXTRA_ALIASES = { ps: 'powershell', ps1: 'powershell', pwsh: 'powershell', docker: 'dockerfile', tex: 'latex', hs: 'haskell', ex: 'elixir', exs: 'elixir', erl: 'erlang', sc: 'scala', jl: 'julia', ml: 'ocaml', fs: 'fsharp', clj: 'clojure', proto: 'protobuf', asm: 'x86asm', v: 'verilog', pas: 'delphi', pascal: 'delphi' };
const PLAIN = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'output', 'console-output', 'dataview', 'dataviewjs', 'query', 'tasks']);

async function highlightBlocks(blocks, alive) {
  const wanted = blocks.filter((b) => !PLAIN.has(b.lang));
  if (!wanted.length) return;
  let hljs;
  try { hljs = await loadHljs(); } catch (error) { console.warn('highlight.js failed to load', error); return; }
  for (const { code, lang } of wanted) {
    if (!alive()) return;
    let name = lang;
    if (!hljs.getLanguage(name)) {
      const extra = EXTRA_ALIASES[name] ?? name;
      if (EXTRA_LANGUAGES[extra]) {
        try { hljs.registerLanguage(extra, (await EXTRA_LANGUAGES[extra]()).default); } catch { /* stays plain */ }
      }
      name = hljs.getLanguage(extra) ? extra : name;
    }
    if (!hljs.getLanguage(name)) continue;
    try {
      const result = hljs.highlight(code.textContent, { language: name, ignoreIllegals: true });
      code.innerHTML = result.value;
      code.classList.add('hljs', `language-${name}`);
    } catch { /* leave it plain */ }
  }
}

// Mermaid: one rendering at a time (it is not re-entrant); initialized again when the theme changes.
let mermaidPromise = null;
let mermaidTheme = null;
let mermaidQueue = Promise.resolve();
let diagramCounter = 0;
const loadMermaid = () => (mermaidPromise ??= import('mermaid').then((m) => m.default));

function renderDiagram(box, dark) {
  const job = mermaidQueue.then(async () => {
    const view = box.querySelector(':scope > .md-diagram-view');
    if (!view || !box.isConnected) return;
    const source = box.dataset.source ?? '';
    const id = `md-mermaid-${(diagramCounter += 1)}`;
    try {
      const mermaid = await loadMermaid();
      const theme = dark ? 'dark' : 'default';
      if (mermaidTheme !== theme) {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'inherit', suppressErrorRendering: true });
        mermaidTheme = theme;
      }
      const { svg } = await mermaid.render(id, source);
      view.innerHTML = svg;
      box.classList.remove('has-error');
      box.dataset.theme = theme;
    } catch (error) {
      box.classList.add('has-error');
      view.innerHTML = `<div class="md-diagram-error" role="alert"><strong>${escapeHtml(t('render.diagramError'))}</strong><pre>${escapeHtml(String(error?.message ?? error).trim())}</pre></div>`;
    } finally {
      // Mermaid's scratch elements left in <body> (the diagram itself carries the same id: keep that one).
      for (const leftover of [document.getElementById(id), document.getElementById(`d${id}`), document.getElementById(`i${id}`)]) {
        if (leftover && !view.contains(leftover)) leftover.remove();
      }
    }
  });
  mermaidQueue = job.catch(() => {});
  return job;
}

async function renderDiagrams(element, ctx, alive) {
  const boxes = [...element.querySelectorAll('.md-diagram')];
  for (const box of boxes) {
    if (!alive()) return;
    await renderDiagram(box, diagramDark(box, ctx.dark));
  }
}

// A reading theme with its own paper decides the diagram theme; otherwise the app theme does (ctx.dark).
const DARK_PAPERS = new Set(['dark', 'contrast']);
const LIGHT_PAPERS = new Set(['original', 'creamy', 'solarized']);
function diagramDark(box, appDark) {
  const paper = box.closest('[data-reading-theme]')?.dataset.readingTheme;
  if (DARK_PAPERS.has(paper)) return true;
  if (LIGHT_PAPERS.has(paper)) return false;
  return !!appDark;
}

/** Draws the Mermaid diagrams again (after a theme change: ctx.dark), the open page previews' too. */
export async function rerenderDiagrams(element, ctx = {}) {
  const state = states.get(element);
  if (state) state.ctx = { ...state.ctx, ...ctx };
  const dark = !!(ctx.dark ?? state?.ctx.dark);
  const roots = [element, ...popovers.map((p) => p.content)];
  for (const root of roots) for (const box of root.querySelectorAll('.md-diagram')) await renderDiagram(box, diagramDark(box, dark));
}

// ───────────────────────── math

let katexPromise = null;
const loadKatex = () => (katexPromise ??= import('katex').then((m) => m.default ?? m));

async function renderMath(element, alive) {
  const nodes = [...element.querySelectorAll('[data-math-style]')].filter((n) => !(n.tagName === 'CODE' && n.parentElement?.dataset.mathStyle));
  if (!nodes.length) return;
  let katex;
  try { katex = await loadKatex(); } catch (error) { console.warn('KaTeX failed to load', error); return; }
  if (!alive()) return;
  const macros = {};
  for (const node of nodes) {
    const display = node.dataset.mathStyle === 'display';
    const tex = node.textContent.trim();
    let target = node;
    if (node.tagName === 'PRE') {
      target = document.createElement('div');
      if (node.dataset.line != null) target.dataset.line = node.dataset.line;
      node.replaceWith(target);
    } else if (node.tagName === 'CODE') {
      target = document.createElement('span');
      if (node.dataset.line != null) target.dataset.line = node.dataset.line;
      node.replaceWith(target);
    }
    target.classList.add('math', display ? 'math-block' : 'math-inline');
    target.dataset.tex = tex;
    try {
      target.innerHTML = katex.renderToString(tex, { displayMode: display, throwOnError: false, errorColor: '#e5484d', strict: 'ignore', trust: false, macros, output: 'htmlAndMathml' });
      const error = target.querySelector('.katex-error');
      if (error) { target.classList.add('math-error'); target.title = `${t('render.mathError')}: ${error.title || ''}`; }
    } catch (error) {
      target.classList.add('math-error');
      target.title = `${t('render.mathError')}: ${error?.message ?? error}`;
      target.textContent = tex;
    }
  }
}

// ───────────────────────── images, audio, video, PDF

function mediaMissing(media, path) {
  const isImage = media.tagName === 'IMG';
  const box = document.createElement('span');
  box.className = `media-missing${isImage ? ' image-missing' : ''}`;
  box.dataset.srcPath = path ?? '';
  box.title = path ?? '';
  box.innerHTML = `${icon('renderImageBroken')}<span>${escapeHtml(t(isImage ? 'render.imageMissing' : 'render.mediaMissing', { path: path || media.getAttribute('alt') || '' }))}</span>`;
  media.replaceWith(box);
}

async function fillMedia(element, ctx, alive) {
  const jobs = [];
  for (const media of element.querySelectorAll('img, audio, video, iframe')) {
    const src = media.getAttribute('src') ?? '';
    let path = media.dataset.srcPath ?? '';
    if (!path && src.startsWith('mdvault:')) path = safeDecode(src.slice(8).split('#')[0]);
    if (media.tagName === 'IMG') {
      media.addEventListener('error', () => { if (media.complete && media.getAttribute('src')) mediaMissing(media, path || src); });
    } else if (media.tagName !== 'IFRAME') {
      media.addEventListener('error', () => { if (media.error && media.getAttribute('src')) mediaMissing(media, path || src); }, true);
    }
    const needs = path && (!src || src.startsWith('mdvault:') || src.startsWith('#'));
    if (!needs) continue;
    const hash = src.startsWith('#') ? src : '';
    jobs.push((async () => {
      let url = '';
      try { url = ctx.resourceUrl ? (await ctx.resourceUrl(path)) ?? '' : ''; } catch { url = ''; }
      if (!alive() || !media.isConnected) return;
      if (url) media.setAttribute('src', url + hash);
      else if (media.tagName !== 'IFRAME') mediaMissing(media, path);
    })());
  }
  await Promise.all(jobs);
}

// ───────────────────────── lightbox

let lightbox = null;

/** Shows an image (an <img> / URL) or an SVG (markup or element) over the window; Esc closes. */
export function openLightbox(content, { alt = '' } = {}) {
  closeLightbox();
  const overlay = document.createElement('div');
  overlay.className = 'md-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `<div class="md-lightbox-bar">${button('lightbox-actual', t('render.lightboxActual'), 'fitPage')}${button('lightbox-close', t('render.lightboxClose'), 'close')}</div><div class="md-lightbox-stage"></div>`;
  const stage = overlay.querySelector('.md-lightbox-stage');
  let item;
  if (typeof content === 'string' && content.trim().startsWith('<svg')) { stage.innerHTML = content; item = stage.firstElementChild; } else if (content instanceof Element && content.tagName.toLowerCase() === 'svg') { item = content.cloneNode(true); stage.append(item); } else {
    item = document.createElement('img');
    item.src = typeof content === 'string' ? content : content.currentSrc || content.src;
    item.alt = alt || content?.alt || '';
    stage.append(item);
  }
  item.classList.add('md-lightbox-item');
  let scale = 1;
  const apply = () => { item.style.transform = scale === 1 ? '' : `scale(${scale})`; };
  const controller = new AbortController();
  const close = () => closeLightbox();
  overlay.addEventListener('click', (event) => {
    const action = event.target.closest('[data-md-action]')?.dataset.mdAction;
    if (action === 'lightbox-close') return close();
    if (action === 'lightbox-actual' || event.target === item || item.contains(event.target)) {
      overlay.classList.toggle('is-actual');
      scale = 1; apply();
      return undefined;
    }
    if (event.target === overlay || event.target === stage) close();
    return undefined;
  }, { signal: controller.signal });
  overlay.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !overlay.classList.contains('is-actual')) return;
    event.preventDefault();
    scale = Math.min(8, Math.max(0.2, scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
    apply();
  }, { passive: false, signal: controller.signal });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  }, { capture: true, signal: controller.signal });
  document.body.append(overlay);
  lightbox = { overlay, controller };
  overlay.querySelector('[data-md-action="lightbox-close"]').focus({ preventScroll: true });
  return close;
}

export function closeLightbox() {
  if (!lightbox) return;
  lightbox.controller.abort();
  lightbox.overlay.remove();
  lightbox = null;
}

// ───────────────────────── hover page preview

const popovers = []; // [{ level, el, content, link, closeTimer }]
const MAX_POPOVER_LEVEL = 2;

function closePopovers(fromLevel = 1) {
  for (let i = popovers.length - 1; i >= 0; i -= 1) {
    const p = popovers[i];
    if (p.level < fromLevel) continue;
    clearTimeout(p.closeTimer);
    popovers.splice(i, 1);
    destroyPreview(p.content);
    p.el.remove();
    i = Math.min(i, popovers.length);
  }
}

function scheduleClose(level, delay = 300) {
  const p = popovers.find((x) => x.level === level);
  if (!p) return;
  clearTimeout(p.closeTimer);
  p.closeTimer = setTimeout(() => closePopovers(level), delay);
}

function keepOpen(level) {
  for (const p of popovers) if (p.level <= level) clearTimeout(p.closeTimer);
}

function linkTarget(a) {
  const href = a.getAttribute('href') ?? '';
  let path = a.dataset.path ?? null;
  let subpath = '';
  if (href.startsWith('mdvault:')) {
    const rest = href.slice(8);
    const at = rest.indexOf('#');
    if (!path) path = safeDecode(at < 0 ? rest : rest.slice(0, at));
    subpath = at < 0 ? '' : safeDecode(rest.slice(at));
  } else if (a.dataset.href?.includes('#')) subpath = a.dataset.href.slice(a.dataset.href.indexOf('#'));
  return { path, subpath, href };
}

async function openPopover(link, ctx) {
  const level = (ctx.depth ?? 0) + 1;
  if (level > MAX_POPOVER_LEVEL || !ctx.preview) return;
  const existing = popovers.find((p) => p.level === level);
  if (existing?.link === link) { keepOpen(level); return; }
  closePopovers(level);
  const { path, subpath } = linkTarget(link);
  if (!path) return;
  const el = document.createElement('div');
  el.className = 'md-hover-popover';
  el.dataset.level = String(level);
  const themed = link.closest('[data-reading-theme], [data-reading-font]');
  el.innerHTML = '<div class="md-hover-popover-scroll"><div class="markdown-rendered md-popover-content"></div></div>';
  const content = el.querySelector('.md-popover-content');
  for (const name of ['readingTheme', 'readingFont']) if (themed?.dataset[name]) { el.dataset[name] = themed.dataset[name]; content.dataset[name] = themed.dataset[name]; }
  content.innerHTML = `<p class="md-popover-loading">${escapeHtml(t('render.previewLoading'))}</p>`;
  const entry = { level, el, content, link, closeTimer: 0 };
  popovers.push(entry);
  document.body.append(el);
  placePopover(el, link);
  el.addEventListener('mouseenter', () => keepOpen(level));
  el.addEventListener('mouseleave', (event) => {
    const into = popovers.find((p) => p.el.contains(event.relatedTarget));
    if (into && into.level > level) return; // into its own nested preview
    scheduleClose(into ? level : 1); // back into a parent preview: only this one; elsewhere: all of them
  });
  let html = null;
  try { html = await ctx.preview(path, subpath); } catch { html = null; }
  if (!popovers.includes(entry)) return;
  if (!html) { content.innerHTML = `<p class="md-popover-loading">${escapeHtml(t('render.previewFailed'))}</p>`; return; }
  await renderPreview(content, html, { ...ctx, depth: level, scroller: el.querySelector('.md-hover-popover-scroll'), path });
  if (popovers.includes(entry)) placePopover(el, link);
}

function placePopover(el, link) {
  const r = link.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(460, vw - 16);
  const h = Math.min(el.offsetHeight || 360, 360);
  let left = Math.min(Math.max(8, r.left), vw - w - 8);
  let top = r.bottom + 6;
  if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
  top = Math.max(8, Math.min(top, vh - h - 8));
  left = Math.max(8, left);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

// ───────────────────────── events

function attachEvents(element, state) {
  const { signal } = state.controller;
  const ctx = () => state.ctx;
  element.addEventListener('click', (event) => onClick(element, state, event), { signal });
  element.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    const a = event.target.closest('a[href]');
    if (a && element.contains(a)) { event.preventDefault(); handleLink(element, state, a, event, true); }
  }, { signal });
  element.addEventListener('mousedown', (event) => { if (event.button === 1 && event.target.closest('a.internal-link')) event.preventDefault(); }, { signal });
  element.addEventListener('change', (event) => {
    const box = event.target;
    if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox' || !box.closest('li')) return;
    const li = box.closest('li');
    li.classList.toggle('is-checked', box.checked);
    const line = Number(li.dataset.line);
    const embed = li.closest('.markdown-embed');
    ctx().onTaskToggle?.(Number.isFinite(line) ? line : null, box.checked, { path: embed && element.contains(embed) ? embed.dataset.path : (ctx().path ?? null), element: li });
  }, { signal });
  element.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('callout-title')) {
      event.preventDefault();
      toggleCallout(event.target.closest('.callout'));
    }
  }, { signal });
  // Embeds re-measure when their pictures arrive.
  let measure = 0;
  element.addEventListener('load', () => { cancelAnimationFrame(measure); measure = requestAnimationFrame(() => measureEmbeds(element)); }, { capture: true, signal });

  // Hover page preview
  const needsMod = () => ctx().settings?.hoverNeedsMod !== false;
  const level = () => (ctx().depth ?? 0) + 1;
  const show = (link) => { if (state.hoverLink === link) openPopover(link, ctx()); };
  element.addEventListener('mouseover', (event) => {
    const link = event.target.closest?.('a.internal-link:not(.is-unresolved)');
    const inside = link && element.contains(link) ? link : null;
    if (inside === state.hoverLink) return;
    state.hoverLink = inside;
    clearTimeout(state.hoverTimer);
    if (!inside) return;
    keepOpen(level());
    if (!needsMod()) state.hoverTimer = setTimeout(() => show(inside), ctx().settings?.hoverDelay ?? 600);
    else if (event.ctrlKey || event.metaKey) state.hoverTimer = setTimeout(() => show(inside), 60);
  }, { signal });
  element.addEventListener('mouseout', (event) => {
    const link = state.hoverLink;
    if (!link || link.contains(event.relatedTarget)) return;
    state.hoverLink = null;
    clearTimeout(state.hoverTimer);
    const p = popovers.find((x) => x.level === level());
    if (p && !p.el.contains(event.relatedTarget)) scheduleClose(level());
  }, { signal });
  window.addEventListener('keydown', (event) => {
    if ((event.key === 'Control' || event.key === 'Meta') && state.hoverLink && needsMod()) show(state.hoverLink);
    if (event.key === 'Escape' && popovers.length && (ctx().depth ?? 0) === 0) closePopovers(1);
  }, { signal });
}

function toggleCallout(callout) {
  if (!callout?.dataset.calloutFold) return;
  const collapsed = callout.classList.toggle('is-collapsed');
  callout.querySelector(':scope > .callout-title')?.setAttribute('aria-expanded', String(!collapsed));
}

function onClick(element, state, event) {
  const ctx = state.ctx;
  const target = event.target;
  const actionEl = target.closest('[data-md-action]');
  if (actionEl && element.contains(actionEl)) { event.preventDefault(); event.stopPropagation(); runAction(element, state, actionEl); return; }
  const a = target.closest('a[href]');
  if (a && element.contains(a)) { handleLink(element, state, a, event, event.ctrlKey || event.metaKey); return; }
  const title = target.closest('.callout-title');
  if (title && element.contains(title)) { toggleCallout(title.closest('.callout')); return; }
  const img = target.closest('img');
  if (img && element.contains(img) && !img.closest('a') && img.complete && img.naturalWidth) { openLightbox(img); return; }
}

function runAction(element, state, el) {
  const ctx = state.ctx;
  const action = el.dataset.mdAction;
  if (action === 'code-copy') { const code = el.closest('.code-block')?.querySelector('pre'); if (code) copy(ctx, code.textContent.replace(/\n$/, ''), el); return; }
  if (action === 'code-wrap') { el.closest('.code-block')?.classList.toggle('is-wrapped'); return; }
  const diagram = el.closest('.md-diagram');
  if (action === 'diagram-copy-svg') { const svg = diagram?.querySelector('.md-diagram-view svg'); if (svg) copy(ctx, svg.outerHTML, el); return; }
  if (action === 'diagram-copy-source') { copy(ctx, diagram?.dataset.source ?? '', el); return; }
  if (action === 'diagram-zoom') { const svg = diagram?.querySelector('.md-diagram-view svg'); if (svg) openLightbox(svg); return; }
  if (action === 'copy-heading') {
    const h = el.closest('h1, h2, h3, h4, h5, h6');
    const clone = h.cloneNode(true);
    clone.querySelectorAll('button, .anchor').forEach((n) => n.remove());
    const text = clone.textContent.replace(/[#|^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    const embed = h.closest('.markdown-embed');
    const note = baseName(embed && element.contains(embed) ? embed.dataset.path : ctx.path);
    copy(ctx, `[[${note}#${text}]]`, el);
    return;
  }
  const embed = el.closest('.markdown-embed');
  if (action === 'embed-toggle' && embed) { embed.classList.toggle('is-collapsed'); return; }
  if (action === 'embed-expand' && embed) {
    const expanded = embed.classList.toggle('is-expanded');
    el.innerHTML = `${icon(expanded ? 'renderCollapse' : 'renderExpand')}<span>${escapeHtml(t(expanded ? 'render.collapse' : 'render.expand'))}</span>`;
    if (!expanded) { embed.classList.add('is-overflowing'); }
  }
}

function handleLink(element, state, a, event, newTab) {
  const ctx = state.ctx;
  const href = a.getAttribute('href') ?? '';
  event.preventDefault();
  if (a.classList.contains('tag')) { ctx.onTagClick?.(a.dataset.tag ?? a.textContent.trim()); return; }
  if (href.startsWith('#') && !a.classList.contains('internal-link')) {
    scrollToAnchor(element, safeDecode(href.slice(1)), { smooth: true });
    return;
  }
  const internal = a.classList.contains('internal-link') || href.startsWith('mdvault:') || href.startsWith('mdvault-new:');
  if (!internal && /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    if (ctx.onExternal) ctx.onExternal(href);
    else if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
    return;
  }
  const { path, subpath } = linkTarget(a);
  let create = null;
  if (href.startsWith('mdvault-new:')) create = safeDecode(href.slice(12).split('#')[0]);
  else if (!internal) create = safeDecode(href.split('#')[0]);
  closePopovers(1);
  if (ctx.onLinkClick) ctx.onLinkClick({ path: create != null ? null : path, href: a.dataset.href ?? href, subpath, newTab: !!newTab, create, event });
  else if (path && path === ctx.path && subpath) scrollToSubpath(element, subpath, { smooth: true });
}

// ───────────────────────── scrolling and line sync

function topOf(el, scroller) {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

function scrollToY(element, y, smooth) {
  const scroller = scrollerOf(element);
  scroller.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
}

function flash(el) {
  el.classList.remove('md-line-flash');
  void el.offsetWidth;
  el.classList.add('md-line-flash');
  setTimeout(() => el.classList.remove('md-line-flash'), 1600);
}

/** Scrolls to the element with this id inside the preview (heading ids, footnotes, ^block anchors). */
export function scrollToAnchor(element, id, { smooth = true, highlight = true } = {}) {
  let target = element.querySelector(`[id="${CSS.escape(id)}"]`);
  if (!target) return false;
  if (target.classList.contains('anchor') && /^H[1-6]$/.test(target.parentElement?.tagName)) target = target.parentElement;
  if (target.classList.contains('block-anchor')) target = target.closest('[data-line]') ?? target.parentElement;
  scrollToY(element, topOf(target, scrollerOf(element)) - 12, smooth);
  if (highlight) flash(target);
  return true;
}

const normalizeHeading = (s) => String(s ?? '').replace(/[#|^[\]]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Scrolls to a link's subpath: '#^block', '#Heading' or '#Parent#Child' (the last part counts). */
export function scrollToSubpath(element, subpath, options = {}) {
  const sub = String(subpath ?? '');
  if (sub.startsWith('#^')) return scrollToAnchor(element, sub.slice(1), options);
  const wanted = normalizeHeading(sub.split('#').filter(Boolean).pop());
  if (!wanted) return false;
  for (const h of element.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const embed = h.closest('.markdown-embed');
    if (embed && element.contains(embed)) continue;
    const clone = h.cloneNode(true);
    clone.querySelectorAll('button').forEach((n) => n.remove());
    if (normalizeHeading(clone.textContent) === wanted) {
      scrollToY(element, topOf(h, scrollerOf(element)) - 12, options.smooth ?? true);
      if (options.highlight !== false) flash(h);
      return true;
    }
  }
  return false;
}

/** The block elements that carry a source line (the note's own: not those of embeds or popovers), visible. */
function lineBlocks(element) {
  const state = states.get(element);
  let blocks = state?.blocks;
  if (!blocks) {
    blocks = [];
    for (const el of element.querySelectorAll('[data-line]')) {
      if (INLINE_TAGS.has(el.tagName)) continue;
      const foreign = el.parentElement?.closest('.markdown-embed-content, .md-hover-popover, .callout-title');
      if (foreign && element.contains(foreign)) continue;
      const line = Number(el.dataset.line);
      if (Number.isFinite(line)) blocks.push({ el, line });
    }
    if (state) state.blocks = blocks;
  }
  return blocks.filter((b) => b.el.isConnected && b.el.getClientRects().length);
}

function blockAt(blocks, line) {
  let best = -1;
  for (let i = 0; i < blocks.length; i += 1) if (blocks[i].line <= line && (best < 0 || blocks[i].line >= blocks[best].line)) best = i;
  return best;
}

/** Scrolls the preview so the source `line` is at the top (between blocks: proportionally). */
export function scrollToLine(element, line, { smooth = false } = {}) {
  const blocks = lineBlocks(element);
  if (!blocks.length) return;
  const scroller = scrollerOf(element);
  const i = blockAt(blocks, line);
  if (i < 0) { scroller.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' }); return; }
  const b = blocks[i];
  let y = topOf(b.el, scroller);
  const next = blocks.slice(i + 1).find((n) => n.line > b.line);
  if (next && line > b.line) {
    const ny = topOf(next.el, scroller);
    if (ny > y) y += ((line - b.line) / (next.line - b.line)) * (ny - y);
  }
  scroller.scrollTo({ top: Math.max(0, y - 8), behavior: smooth ? 'smooth' : 'auto' });
}

/** The source line at the top of the preview's scroll container. */
export function topLine(element) {
  const blocks = lineBlocks(element);
  if (!blocks.length) return 0;
  const scroller = scrollerOf(element);
  if (scroller.scrollTop <= 0) return 0;
  const y = scroller.scrollTop + 8;
  let i = -1;
  const tops = blocks.map((b) => topOf(b.el, scroller));
  for (let k = 0; k < blocks.length; k += 1) if (tops[k] <= y + 1) i = k;
  if (i < 0) return blocks[0].line;
  const b = blocks[i];
  let k = i + 1;
  while (k < blocks.length && !(blocks[k].line > b.line && tops[k] > tops[i])) k += 1;
  if (k >= blocks.length) return b.line;
  const fraction = Math.min(1, Math.max(0, (y - tops[i]) / (tops[k] - tops[i])));
  return Math.floor(b.line + fraction * (blocks[k].line - b.line));
}

/** Briefly highlights the block of the source `line`. */
export function setLineHighlight(element, line) {
  const blocks = lineBlocks(element);
  const i = blockAt(blocks, line);
  if (i >= 0) flash(blocks[i].el);
}

