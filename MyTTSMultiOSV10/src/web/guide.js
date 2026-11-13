// The user guide / tutorial window (guide.html): renders doc/UsersGuide*.md and
// doc/Tutorial*.md in the program's theme, with a table of contents, Korean / English, the
// font size (kept in localStorage) and printing. Opened from Help › 사용 설명서 (F1), the start
// screen, or the tutorial entries; in the desktop program it is its own window.
import { render } from './ui/markdown.js';
import { icon } from './ui/icons.js';
import { applyTheme, resolveTheme } from './ui/themes.js';

const FILES = {
  guide: { ko: 'UsersGuide.md', en: 'UsersGuide.en.md' },
  tutorial: { ko: 'Tutorial.md', en: 'Tutorial.en.md' },
};
const LABELS = {
  ko: { guide: '사용 설명서', tutorial: '튜토리얼', toc: '목차', print: '인쇄', failed: '문서를 읽지 못했습니다' },
  en: { guide: "User's Guide", tutorial: 'Tutorial', toc: 'Contents', print: 'Print', failed: 'Could not load the document' },
};
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* no storage */ } },
};

const params = new URLSearchParams(location.search);
const view = {
  doc: FILES[params.get('doc')] ? params.get('doc') : 'guide',
  lang: params.get('lang') === 'en' ? 'en' : (store.get('tts-guide-lang') === 'en' ? 'en' : 'ko'),
  font: Math.max(11, Math.min(24, Number(store.get('tts-guide-font')) || 15)),
};

for (const el of document.querySelectorAll('i[data-i]')) el.outerHTML = icon(el.dataset.i);

/** The program's theme (same storage as the main window). */
function applyProgramTheme() {
  const settings = store.get('tts-ui-settings') || {};
  const dark = Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
  applyTheme(resolveTheme(settings.theme || 'light', dark, settings.customTheme || null));
}
applyProgramTheme();
window.addEventListener('storage', (event) => { if (event.key === 'tts-ui-settings') applyProgramTheme(); });

async function show() {
  const content = document.getElementById('guideContent');
  const toc = document.getElementById('guideToc');
  const file = FILES[view.doc][view.lang];
  const L = LABELS[view.lang];
  document.documentElement.lang = view.lang;
  document.title = `MyTTS — ${L[view.doc]}`;
  for (const el of document.querySelectorAll('[data-label]')) el.textContent = L[el.dataset.label];
  for (const b of document.querySelectorAll('[data-doc]')) { b.classList.toggle('active', b.dataset.doc === view.doc); b.setAttribute('aria-selected', String(b.dataset.doc === view.doc)); }
  for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('active', b.dataset.lang === view.lang);
  content.style.fontSize = `${view.font}px`;
  document.getElementById('guideFontSize').textContent = `${view.font}px`;
  try {
    const response = await fetch(`./doc/${file}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${response.status} ${file}`);
    const { html, headings } = render(await response.text(), { base: './doc/' });
    content.innerHTML = html;
    content.dataset.shownDoc = view.doc;
    content.dataset.shownLang = view.lang;
    toc.innerHTML = headings.filter((h) => h.level >= 2 && h.level <= 3 && !/^(목차|contents)$/i.test(h.text.trim()))
      .map((h) => `<a href="#${h.id}" class="toc-l${h.level}" data-toc="${h.id}">${h.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</a>`).join('');
    content.scrollTop = 0;
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch (error) {
    content.innerHTML = `<p class="guide-error">${L.failed}: ${String(error.message || error)}</p>`;
    toc.innerHTML = '';
  }
}

/** Called again when the window is already open and another document is asked for. */
window.__openGuide = ({ doc, lang } = {}) => {
  if (FILES[doc]) view.doc = doc;
  if (lang === 'ko' || lang === 'en') view.lang = lang;
  void show();
};

document.addEventListener('click', (event) => {
  const docButton = event.target.closest('button[data-doc]');
  if (docButton) { view.doc = docButton.dataset.doc; void show(); return; }
  const langButton = event.target.closest('button[data-lang]');
  if (langButton) { view.lang = langButton.dataset.lang; store.set('tts-guide-lang', view.lang); void show(); return; }
  const font = event.target.closest('[data-font]');
  if (font) {
    view.font = Math.max(11, Math.min(24, view.font + Number(font.dataset.font)));
    store.set('tts-guide-font', view.font);
    document.getElementById('guideContent').style.fontSize = `${view.font}px`;
    document.getElementById('guideFontSize').textContent = `${view.font}px`;
    return;
  }
  if (event.target.closest('[data-print]')) { window.print(); return; }
  const tocLink = event.target.closest('[data-toc]');
  if (tocLink) { event.preventDefault(); document.getElementById(tocLink.dataset.toc)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const docLink = event.target.closest('[data-doc-link]');
  if (docLink) {
    event.preventDefault();
    const href = docLink.dataset.docLink;
    if (href.startsWith('#')) { document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth' }); return; }
    const [file, hash] = href.split('#');
    view.doc = /Tutorial/i.test(file) ? 'tutorial' : 'guide';
    view.lang = /\.en\.md$/i.test(file) ? 'en' : 'ko';
    void show().then(() => { if (hash) document.getElementById(decodeURIComponent(hash))?.scrollIntoView(); });
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) { event.preventDefault(); document.querySelector('[data-font="1"]').click(); }
  if ((event.ctrlKey || event.metaKey) && event.key === '-') { event.preventDefault(); document.querySelector('[data-font="-1"]').click(); }
});

void show();
