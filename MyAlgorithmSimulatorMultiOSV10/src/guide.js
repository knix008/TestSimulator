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
}

let loadToken = 0;

/** The pages live in doc/. They are inserted here, not framed: an iframe freezes the desktop window. */
async function loadDoc() {
  const token = ++loadToken;
  const host = root.querySelector('.guide-body');
  if (!host) return;
  host.style.fontSize = `${state.font}px`;
  try {
    const response = await fetch(docUrl());
    if (!response.ok) throw new Error(String(response.status));
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const layout = parsed.querySelector('.layout');
    if (!layout) throw new Error('empty');
    if (token !== loadToken) return;
    layout.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('images/')) img.setAttribute('src', `doc/${src}`);
    });
    host.replaceChildren(document.importNode(layout, true));
  } catch {
    if (token !== loadToken) return;
    const message = state.lang === 'en' ? 'The user\'s guide could not be opened.' : '사용 설명서를 열지 못했습니다.';
    host.replaceChildren(Object.assign(document.createElement('p'), { className: 'guide-status', textContent: message }));
  }
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
      <button type="button" class="button" data-guide="print" title="${esc(t('cmd.print'))}">${icon('print')}<span>${esc(t('cmd.print'))}</span></button>
      <button type="button" class="tool-button" data-guide="lang" title="${esc(t('start.langTip'))}" aria-label="${esc(state.lang === 'ko' ? 'English' : '한국어')}">${switchFlag(state.lang)}</button>
    </header>
    <div class="guide-body"></div>
  </div>`;
  loadDoc();
}

function setFont(next) {
  state.font = clamp(next);
  localStorage.setItem(FONT_KEY, String(state.font));
  const label = root.querySelector('[data-font-label]');
  if (label) label.textContent = `${state.font}px`;
  const host = root.querySelector('.guide-body');
  if (host) host.style.fontSize = `${state.font}px`;
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('[data-guide]');
  if (!button) return;
  if (button.dataset.guide === 'font') setFont(state.font + Number(button.dataset.arg));
  else if (button.dataset.guide === 'print') window.print();
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
