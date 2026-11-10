// The user's guide, in a window of its own. The first view uses the main
// window's language and theme. Font size and the guide's language are chosen here.
import './styles.css';
import './guide.css';
import { GUIDE } from './guide-content.js';
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
  current: GUIDE[0].id,
};

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const text = (value) => value[state.lang] ?? value.ko;

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
    <div class="guide-body">
      <nav class="guide-toc" aria-label="${esc(t('guide.contents'))}"><h2>${esc(t('guide.contents'))}</h2>
        ${GUIDE.map((chapter) => `<button type="button" data-guide="chapter" data-arg="${chapter.id}" class="${chapter.id === state.current ? 'current' : ''}">${esc(text(chapter.title))}</button>`).join('')}
      </nav>
      <article class="guide-article" style="font-size:${state.font}px">
        ${GUIDE.map((chapter) => `<section id="${chapter.id}"><h2>${esc(text(chapter.title))}</h2>${text(chapter.html)}</section>`).join('')}
      </article>
    </div>
  </div>`;
  root.querySelector(`#${CSS.escape(state.current)}`)?.scrollIntoView();
}

function setFont(next) {
  state.font = clamp(next);
  localStorage.setItem(FONT_KEY, String(state.font));
  const article = root.querySelector('.guide-article');
  const label = root.querySelector('[data-font-label]');
  if (article) article.style.fontSize = `${state.font}px`;
  if (label) label.textContent = `${state.font}px`;
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('[data-guide]');
  if (!button) return;
  if (button.dataset.guide === 'font') setFont(state.font + Number(button.dataset.arg));
  else if (button.dataset.guide === 'lang') {
    state.lang = state.lang === 'ko' ? 'en' : 'ko';
    render();
  } else if (button.dataset.guide === 'chapter') {
    state.current = button.dataset.arg;
    root.querySelectorAll('.guide-toc button').forEach((item) => item.classList.toggle('current', item.dataset.arg === state.current));
    root.querySelector(`#${CSS.escape(state.current)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

root.addEventListener('scroll', () => {}, true);
const articleScroll = () => {
  const article = root.querySelector('.guide-article');
  if (!article) return;
  const top = article.getBoundingClientRect().top + 24;
  let current = GUIDE[0].id;
  for (const chapter of GUIDE) {
    const head = root.querySelector(`#${CSS.escape(chapter.id)} h2`);
    if (head && head.getBoundingClientRect().top <= top) current = chapter.id;
  }
  if (current === state.current) return;
  state.current = current;
  root.querySelectorAll('.guide-toc button').forEach((item) => item.classList.toggle('current', item.dataset.arg === current));
};
root.addEventListener('scroll', (event) => { if (event.target?.classList?.contains('guide-article')) articleScroll(); }, true);

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
