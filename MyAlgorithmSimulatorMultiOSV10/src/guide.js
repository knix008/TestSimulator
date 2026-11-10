// The user's guide, in a window of its own. The first view uses the main
// window's language and theme. Font size and the guide's language are chosen here.
import './styles.css';
import './guide.css';
import { switchFlag } from './flags.js';
import { icon } from './icons.js';
import { setLanguage, t } from './i18n.js';
import { applyTheme, resolveTheme } from './themes.js';

const STORE = 'myalgorithmsimulator.settings';
const FONT_KEY = 'myalgorithmsimulator.guideFont';
const FONT_MIN = 13;
const FONT_MAX = 24;
const root = document.getElementById('guide');
document.documentElement.classList.add('is-guide');

const params = new URLSearchParams(location.search);
const boot = globalThis.__GUIDE__ ?? {};
const saved = readSettings();
const state = {
  lang: pickLang(params.get('lang') || boot.lang || saved.lang),
  themeId: String(params.get('theme') || boot.theme || saved.themeId || 'light'),
  font: clamp(Number(localStorage.getItem(FONT_KEY)) || 16),
};

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const docUrl = () => (state.lang === 'en' ? 'doc/UsersGuide.en.html' : 'doc/UsersGuide.html');

function readSettings() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
}
function pickLang(value) { return value === 'en' ? 'en' : 'ko'; }
function clamp(size) { return Math.min(FONT_MAX, Math.max(FONT_MIN, size)); }
function prefersDark() { return matchMedia('(prefers-color-scheme: dark)').matches; }

function applyLook() {
  setLanguage(state.lang);
  const theme = resolveTheme(state.themeId, prefersDark());
  applyTheme(theme);
  document.documentElement.lang = state.lang;
  document.title = `MyAlgorithmSimulator — ${t('cmd.guide')}`;
  styleDoc();
}

/** Paint the document in doc/ with this window's theme and font size. */
function styleDoc() {
  const doc = root.querySelector('.guide-frame')?.contentDocument;
  if (!doc?.documentElement) return;
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  let style = doc.getElementById('app-theme');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'app-theme';
    doc.head.appendChild(style);
  }
  const accent = v('--accent', '#0b6e8e');
  const surface = v('--surface', '#ffffff');
  style.textContent = `:root {
    --bg: ${v('--bg', '#f4f7fb')}; --surface: ${surface}; --text: ${v('--text', '#1d2330')}; --muted: ${v('--muted', '#5d6677')};
    --border: ${v('--border', '#dde2ea')}; --accent: ${accent}; --panel: ${v('--panel', surface)}; --toolbar: ${v('--toolbar', surface)};
    color-scheme: ${css.colorScheme || 'light'};
  }
  html, body { font-size: ${state.font}px !important; }
  .topbar { display: none !important; }`;
}

function render() {
  applyLook();
  root.innerHTML = `<div class="guide-shell">
    <header class="guide-bar">
      <h1 class="guide-title">${icon('book')}<span>${esc(t('cmd.guide'))}</span></h1>
      <span class="grow"></span>
      <span class="guide-font" title="${esc(t('guide.font'))}">
        <button type="button" class="button" data-guide="font" data-arg="-1" title="${esc(t('guide.smaller'))}" aria-label="${esc(t('guide.smaller'))}">A−</button>
        <output data-font-label>${state.font}px</output>
        <button type="button" class="button" data-guide="font" data-arg="1" title="${esc(t('guide.larger'))}" aria-label="${esc(t('guide.larger'))}">A+</button>
      </span>
      <button type="button" class="tool-button" data-guide="lang" title="${esc(t('start.langTip'))}" aria-label="${esc(state.lang === 'ko' ? 'English' : '한국어')}">${switchFlag(state.lang)}</button>
    </header>
    <iframe class="guide-frame" title="${esc(t('cmd.guide'))}" src="${docUrl()}"></iframe>
  </div>`;
  root.querySelector('.guide-frame').addEventListener('load', styleDoc);
}

function setFont(next) {
  state.font = clamp(next);
  localStorage.setItem(FONT_KEY, String(state.font));
  const label = root.querySelector('[data-font-label]');
  if (label) label.textContent = `${state.font}px`;
  styleDoc();
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('[data-guide]');
  if (!button) return;
  if (button.dataset.guide === 'font') setFont(state.font + Number(button.dataset.arg));
  else if (button.dataset.guide === 'lang') {
    state.lang = state.lang === 'ko' ? 'en' : 'ko';
    render();
  }
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORE || !event.newValue) return;
  try {
    const next = JSON.parse(event.newValue);
    if (next.themeId && next.themeId !== state.themeId) {
      state.themeId = next.themeId;
      applyLook();
    }
  } catch { /* the main window wrote something else */ }
});

function useTheme(themeId) {
  if (!themeId || themeId === state.themeId) return;
  state.themeId = themeId;
  applyLook();
}
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'guide-theme') return;
  useTheme(event.data.theme);
});
window.addEventListener('guide-theme', (event) => useTheme(event.detail));

render();
