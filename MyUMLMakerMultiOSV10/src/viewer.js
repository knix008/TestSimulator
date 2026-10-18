// Document and video windows: the user's guide, the tutorial document and the
// tutorial video, each in a window of its own.
//
// Desktop: an OS window labelled "doc-guide" / "doc-tutorial" / "doc-video"
// (lib.rs open_doc_window) with the system title bar; re-selecting a document
// brings its window back. Web: a browser tab at index.html?viewer=<kind>.
// While the tutorial runs, a frame in the main window (so a recording shows it).
//
// Documents: the HTML pages of docs/ in a frame, with a bar for chapters, the
// document language, find in page (Ctrl+F), print and "open in browser", in the
// app's theme colours. Video: docs/video/MyUMLMaker-Tutorial.mp4 with play/pause,
// seek, speed, full screen and chapter marks from the sidecar JSON.
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { loadSettings, STORAGE_KEY } from './domain/settings.js';
import {
  chapterEntries, currentChapter, DOC_KINDS, docFile, docUrl, docWindowTitle, entryAt, findOffsets, formatTime, isDocKind,
  markOffsets, parseVideoChapters, stepMatch, VIDEO_CHAPTERS_FILE, VIDEO_FILE, VIDEO_SPEEDS,
} from './domain/helpdocs.js';
import { setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';

const params = new URLSearchParams(location.search);
const desktop = native.isDesktop();
/** An OS window of its own (desktop, label doc-<kind>), not a browser tab or a frame. */
const osWindow = desktop && !params.has('viewer');
const appWindow = osWindow ? getCurrentWindow() : null;
const requested = params.get('viewer') ?? (appWindow?.label ?? '').replace(/^doc-/, '');
const kind = isDocKind(requested) ? requested : 'guide';
const info = DOC_KINDS[kind];
const inFrame = window.parent !== window;
const root = document.querySelector('#app');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const storageGet = (key) => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } };
const storageSet = (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { /* not kept */ } };

let settings = loadSettings(globalThis.localStorage);
const state = {
  lang: params.get('lang') === 'en' || params.get('lang') === 'ko' ? params.get('lang') : settings.language === 'en' ? 'en' : 'ko',
  chapters: [],
  find: { query: '', ranges: [], index: -1 },
  video: { src: null, missing: false, error: null, data: null, speed: Number(storageGet('myumlmaker.video.speed')) || 1 },
};

document.documentElement.classList.add('is-viewer', `viewer-kind-${kind}`);

function theme() {
  return resolveTheme(settings.theme, prefersDark(), settings.customTheme);
}

function applyLook() {
  setLanguage(settings.language);
  applyTheme(theme());
  applyFont(settings);
  const title = docWindowTitle(t(info.title));
  document.title = osWindow ? `doc-${kind}` : title;
  if (appWindow) {
    appWindow.setTitle(title).catch(() => {});
    appWindow.setTheme(theme().dark ? 'dark' : 'light').catch(() => {});
  }
}

/** Messages to the main window when shown as a frame there (tutorial). */
function toHost(type, data) {
  if (inFrame) globalThis.parent?.postMessage({ myumlmaker: true, kind: `doc-${kind}`, type, data }, location.origin);
}

// ───────────────────────── page

function barHtml() {
  const L = state.lang;
  const languages = `<span class="segmented" role="radiogroup" title="${escapeHtml(t('reader.language'))}" aria-label="${escapeHtml(t('reader.language'))}">
      <button class="segment ${L === 'ko' ? 'active' : ''}" data-viewer="lang" data-value="ko" role="radio" aria-checked="${L === 'ko'}" title="한국어">한국어</button>
      <button class="segment ${L === 'en' ? 'active' : ''}" data-viewer="lang" data-value="en" role="radio" aria-checked="${L === 'en'}" title="English">English</button>
    </span>`;
  const close = inFrame ? `<button class="icon-button" data-viewer="close" title="${escapeHtml(t('common.close'))}" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button>` : '';
  const title = `<h1 class="viewer-title">${icon(info.glyph)}<span>${escapeHtml(t(info.title))}</span></h1>`;
  if (kind === 'video') {
    return `${title}
      <select class="viewer-chapters" data-video-chapter title="${escapeHtml(t('reader.videoChapters'))}" aria-label="${escapeHtml(t('reader.videoChapters'))}">${chapterOptions()}</select>
      <span class="grow"></span>
      <label class="viewer-speed" title="${escapeHtml(t('reader.speed'))}">${icon('speed')}<select data-video-speed aria-label="${escapeHtml(t('reader.speed'))}">${VIDEO_SPEEDS.map((s) => `<option value="${s}" ${s === state.video.speed ? 'selected' : ''}>${s}×</option>`).join('')}</select></label>
      <button class="button" data-viewer="fullscreen" title="${escapeHtml(t('reader.fullscreen'))}">${icon('fullscreen')}<span>${escapeHtml(t('reader.fullscreen').replace(/\s*\(.*\)$/, ''))}</span></button>
      ${languages}
      ${desktop ? `<button class="button" data-viewer="external" title="${escapeHtml(t('reader.videoExternalTip'))}">${icon('readerExternal')}<span>${escapeHtml(t('reader.videoExternal'))}</span></button>` : ''}
      ${close}`;
  }
  const q = state.find.query;
  return `${title}
    <select class="viewer-chapters" data-viewer-chapter title="${escapeHtml(t('reader.chapters'))}" aria-label="${escapeHtml(t('reader.chapters'))}">${chapterOptions()}</select>
    <span class="grow"></span>
    <span class="viewer-find" title="${escapeHtml(t('reader.find'))}">${icon('search')}<input type="search" data-viewer-find value="${escapeHtml(q)}" placeholder="${escapeHtml(t('reader.findPlaceholder'))}" aria-label="${escapeHtml(t('reader.find'))}" spellcheck="false" /><output data-find-count>${escapeHtml(findCountText())}</output>
      <button class="icon-button" data-viewer="find-prev" title="${escapeHtml(t('reader.findPrev'))}" aria-label="${escapeHtml(t('reader.findPrev'))}">${icon('chevronUp')}</button>
      <button class="icon-button" data-viewer="find-next" title="${escapeHtml(t('reader.findNext'))}" aria-label="${escapeHtml(t('reader.findNext'))}">${icon('chevronDown')}</button></span>
    ${languages}
    <button class="button" data-viewer="print" title="${escapeHtml(t('reader.printTip'))}">${icon('print')}<span>${escapeHtml(t('reader.print'))}</span></button>
    <button class="button" data-viewer="external" title="${escapeHtml(t('reader.externalTip'))}">${icon('readerExternal')}<span>${escapeHtml(t('reader.external'))}</span></button>
    ${close}`;
}

function chapterOptions() {
  const head = `<option value="">${escapeHtml(t(kind === 'video' ? 'reader.videoChapters' : 'reader.chapters'))}</option>`;
  if (kind === 'video') return head + videoChapters().map((c, i) => `<option value="${i}">${escapeHtml(`${formatTime(c.start)}  ${c.title}`)}</option>`).join('');
  return head + state.chapters.map((c) => `<option value="${escapeHtml(c.id)}">${c.level === 3 ? '   ' : ''}${escapeHtml(c.text)}</option>`).join('');
}

function renderBar() {
  const bar = root.querySelector('.viewer-bar');
  if (bar) bar.innerHTML = barHtml();
  if (kind === 'video') syncVideoUi(true);
}

function render() {
  root.innerHTML = `<div class="viewer viewer-${kind}">
    <header class="viewer-bar">${barHtml()}</header>
    ${kind === 'video' ? videoHtml() : `<iframe class="viewer-frame" title="${escapeHtml(t(info.title))}"></iframe>`}
  </div>`;
  if (kind === 'video') setupVideo(); else loadDoc();
}

// ───────────────────────── documents

const frame = () => root.querySelector('.viewer-frame');
const frameDoc = () => { try { return frame()?.contentDocument ?? null; } catch { return null; } };

function loadDoc() {
  const iframe = frame();
  const url = docUrl(kind, state.lang);
  iframe.dataset.url = url;
  iframe.onload = onDocLoad;
  iframe.src = url;
}

/** The document page in the app's colours (the page's own top bar is replaced by the viewer's). */
function docCss() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const surface = v('--surface', '#ffffff');
  const accent = v('--accent', '#2563eb');
  return `html:root {
  --bg: ${v('--bg', '#f5f6f8')}; --surface: ${surface}; --text: ${v('--text', '#1f2328')}; --muted: ${v('--muted', '#5b6472')};
  --border: ${v('--border', '#d9dde3')}; --accent: ${accent}; --accent-soft: color-mix(in srgb, ${accent} 15%, ${surface});
  --code-bg: ${v('--surface2', '#f0f2f5')}; --row-alt: color-mix(in srgb, ${v('--grid-alt', '#f3f4f6')} 70%, ${surface});
  --shadow: 0 1px 3px ${v('--shadow', 'rgba(0,0,0,.12)')}; color-scheme: ${theme().dark ? 'dark' : 'light'};
}
html:root body { font-family: ${v('--font-family', 'system-ui, sans-serif')}; }
.topbar { display: none !important; }
nav.toc { top: 16px !important; max-height: calc(100vh - 32px) !important; }
h1, h2, h3, h4 { scroll-margin-top: 16px !important; }
::highlight(mum-find) { background: #ffe36e; color: #111; }
::highlight(mum-find-current) { background: #ff9632; color: #111; }
@media print { .topbar { display: none !important; } }`;
}

function styleDoc() {
  const doc = frameDoc();
  if (!doc?.head) return;
  let style = doc.getElementById('myumlmaker-viewer-style');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'myumlmaker-viewer-style';
    doc.head.append(style);
  }
  style.textContent = docCss();
}

function onDocLoad() {
  const doc = frameDoc();
  const win = frame()?.contentWindow;
  if (!doc || !win) return;
  styleDoc();
  // A link inside the page to the other language version keeps the switch right.
  const href = String(win.location.href);
  if (/\.en\.html(?:$|[?#])/.test(href)) state.lang = 'en'; else if (/\.html(?:$|[?#])/.test(href)) state.lang = 'ko';
  state.chapters = chapterEntries(doc.querySelectorAll('h2[id], h3[id]'));
  state.find = { ...state.find, ranges: [], index: -1 };
  renderBar();
  if (state.find.query) runFind(state.find.query, false);
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    const target = link?.getAttribute('href') ?? '';
    if (/^(?:https?:|mailto:)/i.test(target)) {
      event.preventDefault();
      native.openExternal(target).catch(() => {});
    }
  });
  let ticking = false;
  win.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; syncChapter(); });
  }, { passive: true });
  syncChapter();
}

/** The chapter list shows the chapter being read. */
function syncChapter() {
  const doc = frameDoc();
  const select = root.querySelector('[data-viewer-chapter]');
  if (!doc || !select || document.activeElement === select) return;
  const tops = state.chapters.map((c) => doc.getElementById(c.id)?.getBoundingClientRect().top ?? null);
  select.value = currentChapter(state.chapters, tops, 40) ?? '';
}

function goChapter(id) {
  const target = frameDoc()?.getElementById(id);
  if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function switchLanguage(lang) {
  if (lang === state.lang && kind !== 'video') return;
  state.lang = lang === 'en' ? 'en' : 'ko';
  if (kind === 'video') { state.video.data = parseVideoChapters(state.video.raw, state.lang); renderBar(); renderChapterList(); return; }
  renderBar();
  loadDoc();
}

// find in page: every match highlighted (CSS Custom Highlight API), the current one in orange and scrolled to

function textRanges(doc, query) {
  const ranges = [];
  if (!doc?.body || !query) return ranges;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest('script, style, .topbar, nav.toc') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const at of findOffsets(node.data, query)) {
      const range = doc.createRange();
      range.setStart(node, at);
      range.setEnd(node, Math.min(node.data.length, at + query.length));
      ranges.push(range);
    }
  }
  return ranges;
}

function paintFind() {
  const win = frame()?.contentWindow;
  const highlights = win?.CSS?.highlights;
  if (!highlights || !win.Highlight) return;
  highlights.delete('mum-find');
  highlights.delete('mum-find-current');
  const { ranges, index } = state.find;
  if (ranges.length) highlights.set('mum-find', new win.Highlight(...ranges));
  if (ranges[index]) highlights.set('mum-find-current', new win.Highlight(ranges[index]));
}

function findCountText() {
  const { query, ranges, index } = state.find;
  if (!query) return '';
  return ranges.length ? `${index + 1}/${ranges.length}` : t('reader.noMatch');
}

function runFind(query, step = true, back = false) {
  const changed = query !== state.find.query || !state.find.ranges.length;
  state.find.query = query;
  if (changed) {
    state.find.ranges = textRanges(frameDoc(), query);
    state.find.index = -1;
  }
  if (step || changed) state.find.index = stepMatch(state.find.ranges.length, state.find.index, back);
  paintFind();
  const range = state.find.ranges[state.find.index];
  const win = frame()?.contentWindow;
  if (range && win) {
    const box = range.getBoundingClientRect();
    if (box.top < 60 || box.bottom > win.innerHeight - 20) win.scrollTo({ top: win.scrollY + box.top - win.innerHeight / 3, behavior: 'instant' });
  }
  const out = root.querySelector('[data-find-count]');
  if (out) {
    out.textContent = findCountText();
    out.title = state.find.ranges.length ? t('reader.matches', { n: state.find.ranges.length }) : '';
  }
}

function focusFind() {
  const input = root.querySelector('[data-viewer-find]');
  if (!input) return;
  window.focus();
  input.focus();
  input.select();
}

function printDoc() {
  frame()?.contentWindow?.print();
}

async function openExternal() {
  if (kind === 'video') {
    if (desktop) await native.openDocument(VIDEO_FILE).catch(() => {});
    return;
  }
  if (desktop) await native.openDocument(docFile(kind, state.lang)).catch(() => {});
  else globalThis.open(docUrl(kind, state.lang), '_blank', 'noopener');
}

// ───────────────────────── video

const videoEl = () => root.querySelector('video');
const videoChapters = () => state.video.data?.chapters ?? [];

function videoHtml() {
  return `<div class="video-body">
    <div class="video-main">
      <div class="video-stage" data-video-stage>
        <video controls preload="metadata" playsinline hidden></video>
        <div class="viewer-empty" data-video-message>${icon('tutorialVideo')}<p>${escapeHtml(t('reader.loading'))}</p></div>
      </div>
      <div class="video-marks" data-video-marks title="${escapeHtml(t('reader.videoChapters'))}"><b class="video-played"></b></div>
      <p class="video-keys muted">${escapeHtml(t('reader.videoKeys'))}</p>
    </div>
    <nav class="video-chapter-list" aria-label="${escapeHtml(t('reader.videoChapters'))}"></nav>
  </div>`;
}

function showVideoMessage(text) {
  const box = root.querySelector('[data-video-message]');
  const video = videoEl();
  if (video) video.hidden = Boolean(text);
  if (box) {
    box.hidden = !text;
    if (text) box.innerHTML = `${icon('tutorialVideo')}<p>${escapeHtml(text)}</p>`;
  }
  root.querySelector('.viewer-video')?.classList.toggle('no-video', Boolean(text));
}

async function findVideo() {
  if (desktop) {
    const found = await native.invoke('tutorial_video').catch(() => null);
    return found?.path ? { src: convertFileSrc(found.path), chapters: found.chapters ?? null } : null;
  }
  // Web build: only when the video was copied to public/docs/video/ (npm run build:docs -- --with-video).
  const url = `docs/${VIDEO_FILE}`;
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!head?.ok || !/^video\//.test(head.headers.get('content-type') ?? '')) return null;
  const chapters = await fetch(`docs/${VIDEO_CHAPTERS_FILE}`).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  return { src: url, chapters };
}

async function setupVideo() {
  const found = await findVideo();
  const video = videoEl();
  if (!found) {
    state.video.missing = true;
    showVideoMessage(t('reader.videoMissing'));
    return;
  }
  state.video.raw = found.chapters;
  state.video.data = parseVideoChapters(found.chapters, state.lang);
  renderBar();
  renderChapterList();
  video.addEventListener('loadedmetadata', () => { showVideoMessage(null); video.playbackRate = state.video.speed; renderMarks(); });
  video.addEventListener('timeupdate', () => syncVideoUi());
  video.addEventListener('ratechange', () => { state.video.speed = video.playbackRate; const select = root.querySelector('[data-video-speed]'); if (select) select.value = String(video.playbackRate); });
  video.addEventListener('error', () => {
    state.video.error = video.error?.message || `code ${video.error?.code ?? '?'}`;
    showVideoMessage(t('reader.videoError', { message: state.video.error }));
  });
  video.src = found.src;
  state.video.src = found.src;
}

function renderChapterList() {
  const nav = root.querySelector('.video-chapter-list');
  if (!nav) return;
  const chapters = videoChapters();
  const steps = state.video.data?.steps ?? [];
  nav.innerHTML = chapters.length ? chapters.map((c, i) => {
    const next = chapters[i + 1]?.start ?? Infinity;
    const inner = steps.filter((s) => s.start >= c.start && s.start < next);
    return `<section>
      <button class="video-chapter" data-video-seek="${c.start}" data-chapter-index="${i}" title="${escapeHtml(c.title)}"><time>${formatTime(c.start)}</time><b>${escapeHtml(c.title)}</b></button>
      ${inner.map((s) => `<button class="video-step" data-video-seek="${s.start}" title="${escapeHtml(s.title)}"><time>${formatTime(s.start)}</time><span>${escapeHtml(s.title)}</span></button>`).join('')}
    </section>`;
  }).join('') : '';
  root.querySelector('.video-body')?.classList.toggle('no-chapters', !chapters.length);
  renderMarks();
}

function renderMarks() {
  const marks = root.querySelector('[data-video-marks]');
  const video = videoEl();
  if (!marks || !video) return;
  const duration = Number.isFinite(video.duration) ? video.duration : state.video.data?.duration ?? 0;
  const chapters = videoChapters();
  const offsets = markOffsets(chapters, duration);
  marks.innerHTML = `<b class="video-played"></b>${offsets.map((left, i) => `<i style="left:${left}%" data-video-seek="${chapters[i].start}" title="${escapeHtml(`${formatTime(chapters[i].start)} ${chapters[i].title}`)}"></i>`).join('')}`;
  syncVideoUi(true);
}

function syncVideoUi(force = false) {
  const video = videoEl();
  if (!video) return;
  const time = video.currentTime || 0;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const played = root.querySelector('.video-played');
  if (played) played.style.width = `${duration ? (time / duration) * 100 : 0}%`;
  const chapters = videoChapters();
  const current = entryAt(chapters, time);
  if (!force && current === state.video.current) return;
  state.video.current = current;
  const select = root.querySelector('[data-video-chapter]');
  if (select && document.activeElement !== select) select.value = current >= 0 ? String(current) : '';
  for (const button of root.querySelectorAll('.video-chapter')) button.classList.toggle('active', Number(button.dataset.chapterIndex) === current);
  root.querySelector('.video-chapter.active')?.scrollIntoView({ block: 'nearest' });
}

function seek(seconds) {
  const video = videoEl();
  if (!video || !state.video.src) return;
  video.currentTime = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : seconds, seconds));
  syncVideoUi(true);
}

async function toggleFullscreen() {
  const stage = root.querySelector('[data-video-stage]');
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  else await stage?.requestFullscreen?.().catch(() => {});
}

// ───────────────────────── input

function onKey(event) {
  const key = event.key;
  const ctrl = event.ctrlKey || event.metaKey;
  if (kind !== 'video') {
    if (ctrl && key.toLowerCase() === 'f') { event.preventDefault(); focusFind(); return; }
    if (ctrl && key.toLowerCase() === 'p') { event.preventDefault(); printDoc(); return; }
    if (key === 'F3') { event.preventDefault(); runFind(state.find.query, true, event.shiftKey); return; }
    return;
  }
  const typing = event.target?.closest?.('input, select, textarea, button');
  const video = videoEl();
  if (!video || typing || ctrl || event.altKey) return;
  if (key === ' ' || key === 'k') { event.preventDefault(); if (video.paused) video.play().catch(() => {}); else video.pause(); }
  else if (key === 'ArrowLeft' && event.target !== video) { event.preventDefault(); seek(video.currentTime - 5); }
  else if (key === 'ArrowRight' && event.target !== video) { event.preventDefault(); seek(video.currentTime + 5); }
  else if (key === 'f' || key === 'F') { event.preventDefault(); toggleFullscreen(); }
}

root.addEventListener('click', (event) => {
  const seekTo = event.target.closest('[data-video-seek]');
  if (seekTo) { seek(Number(seekTo.dataset.videoSeek)); return; }
  const marks = event.target.closest('[data-video-marks]');
  if (marks) {
    const video = videoEl();
    const box = marks.getBoundingClientRect();
    if (video && Number.isFinite(video.duration)) seek(((event.clientX - box.left) / box.width) * video.duration);
    return;
  }
  const button = event.target.closest('[data-viewer]');
  if (!button) return;
  switch (button.dataset.viewer) {
    case 'lang': switchLanguage(button.dataset.value); break;
    case 'find-next': runFind(root.querySelector('[data-viewer-find]')?.value ?? '', true, false); break;
    case 'find-prev': runFind(root.querySelector('[data-viewer-find]')?.value ?? '', true, true); break;
    case 'print': printDoc(); break;
    case 'external': openExternal(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'close': toHost('close'); break;
    default: break;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if ('viewerChapter' in target.dataset && target.value) goChapter(target.value);
  else if ('videoChapter' in target.dataset && target.value !== '') seek(videoChapters()[Number(target.value)]?.start ?? 0);
  else if ('videoSpeed' in target.dataset) {
    state.video.speed = Number(target.value) || 1;
    storageSet('myumlmaker.video.speed', String(state.video.speed));
    const video = videoEl();
    if (video) video.playbackRate = state.video.speed;
  }
});

root.addEventListener('input', (event) => {
  if ('viewerFind' in event.target.dataset) runFind(event.target.value, false);
});

root.addEventListener('keydown', (event) => {
  if (!('viewerFind' in (event.target.dataset ?? {}))) return;
  if (event.key === 'Enter') { event.preventDefault(); runFind(event.target.value, true, event.shiftKey); }
  else if (event.key === 'Escape') { event.preventDefault(); event.target.value = ''; runFind('', false); }
});

window.addEventListener('keydown', onKey);

document.addEventListener('fullscreenchange', () => {
  // The OS window goes full screen with the video (WebView2 only fills the page otherwise).
  if (appWindow) appWindow.setFullscreen(Boolean(document.fullscreenElement)).catch(() => {});
});

// Settings changed in another window: theme, font and interface language follow.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  settings = loadSettings(globalThis.localStorage);
  applyLook();
  renderBar();
  styleDoc();
});

globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyLook(); styleDoc(); });

window.__myumlmakerViewer = { kind, state, runFind, goChapter, switchLanguage, seek, chapters: () => state.chapters };

applyLook();
render();
toHost('ready');
if (osWindow) native.invoke('popup_ready').catch(() => {});
