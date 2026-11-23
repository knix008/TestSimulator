// The user guide window: UserGuide.md (Korean) or UserGuide.en.md, rendered with the pictures in
// doc/images/. Both Markdown files and the pictures are bundled at build time, so the guide also
// works offline in the installed app.
//
// The header carries the guide's own tools: the document language (it starts in the program's
// language and can be switched for the guide alone), the text size (− / +, Ctrl+- / Ctrl+=,
// remembered) and Print (Ctrl+P), which opens the program's print window for the whole guide in
// the shown language and text size.
import guideKo from '../UserGuide.md?raw';
import guideEn from '../UserGuide.en.md?raw';
import { renderMarkdown } from './markdown.js';
import { getLanguage } from './i18n.js';
import { showDialog } from './popups.js';

const pictures = import.meta.glob('../doc/images/*.{png,jpg,svg}', { eager: true, query: '?url', import: 'default' });

export const GUIDE_FONT = { min: 11, max: 22, default: 14 };
const FONT_KEY = 'image2text.guideFont';

function resolveImage(src) {
  const key = `../${src.replace(/^\.?\//, '')}`;
  return pictures[key] ?? src;
}

export function clampGuideFont(value) {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size)) return GUIDE_FONT.default;
  return Math.min(GUIDE_FONT.max, Math.max(GUIDE_FONT.min, size));
}

function loadFont() {
  try {
    const stored = localStorage.getItem(FONT_KEY);
    return stored === null ? GUIDE_FONT.default : clampGuideFont(stored);
  } catch {
    return GUIDE_FONT.default;
  }
}

function saveFont(size) {
  try {
    localStorage.setItem(FONT_KEY, String(size));
  } catch {
    // Storage blocked: the size still applies until the window closes.
  }
}

/** The guide as HTML in one language, with its pictures resolved, and its title. */
export function guideDocument(language) {
  const lang = language === 'en' ? 'en' : 'ko';
  const { html, headings } = renderMarkdown(lang === 'en' ? guideEn : guideKo, { resolveImage });
  const source = lang === 'en' ? guideEn : guideKo;
  const title = source.match(/^#\s+(.+)$/m)?.[1].trim() ?? 'Image2Text';
  return { html, title, lang };
}

export function createGuide(dialog, { onPrint = () => {} } = {}) {
  const toc = dialog.querySelector('#guide-toc');
  const content = dialog.querySelector('#guide-content');
  const fontOut = dialog.querySelector('#guide-font-out');
  const printButton = dialog.querySelector('#guide-print');
  let shownLanguage = '';
  let appLanguage = getLanguage();
  let docLanguage = appLanguage;
  let fontSize = loadFont();

  function fill() {
    const language = docLanguage === 'en' ? 'en' : 'ko';
    for (const radio of dialog.querySelectorAll('input[name="guide-language"]')) radio.checked = radio.value === language;
    if (language === shownLanguage) return;
    shownLanguage = language;
    const { html, headings } = renderMarkdown(language === 'en' ? guideEn : guideKo, { resolveImage });
    content.innerHTML = html;
    content.lang = language;
    // The document's own contents list is a section too; the side panel already is one.
    const sections = headings.filter((heading) => !/^(목차|contents)$/i.test(heading.text));
    toc.replaceChildren(...sections.map((heading) => {
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.dataset.target = heading.id;
      link.className = `toc-l${heading.level}`;
      link.textContent = heading.text;
      return link;
    }));
    content.scrollTop = 0;
  }

  function applyFont() {
    content.style.setProperty('--guide-font', `${fontSize}px`);
    if (fontOut) fontOut.textContent = String(fontSize);
    for (const button of dialog.querySelectorAll('[data-guide-font]')) {
      const step = Number(button.dataset.guideFont);
      button.disabled = step < 0 ? fontSize <= GUIDE_FONT.min : fontSize >= GUIDE_FONT.max;
    }
  }

  function setFont(next) {
    const size = clampGuideFont(next);
    if (size === fontSize) return;
    // Keep the reading place: the heading at the top stays at the top.
    const ratio = content.scrollHeight > 0 ? content.scrollTop / content.scrollHeight : 0;
    fontSize = size;
    saveFont(size);
    applyFont();
    content.scrollTop = ratio * content.scrollHeight;
    markCurrent();
  }

  function setDocLanguage(language) {
    docLanguage = language === 'en' ? 'en' : 'ko';
    fill();
    markCurrent();
  }

  function print() {
    onPrint({ lang: shownLanguage || docLanguage, fontSize });
  }

  function jump(id) {
    const target = content.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!target) return;
    content.scrollTo({ top: target.offsetTop - content.offsetTop - 8 });
    markCurrent();
  }

  function markCurrent() {
    const top = content.scrollTop + 24;
    let current = null;
    for (const heading of content.querySelectorAll('h2[id], h3[id]')) {
      if (heading.offsetTop - content.offsetTop <= top) current = heading.id;
    }
    for (const link of toc.querySelectorAll('a')) link.classList.toggle('active', link.dataset.target === current);
  }

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
      return;
    }
    const nudge = event.target.closest('[data-guide-font]');
    if (nudge) {
      event.preventDefault();
      setFont(fontSize + Number(nudge.dataset.guideFont));
      return;
    }
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    jump(decodeURIComponent(link.getAttribute('href').slice(1)));
  });
  dialog.addEventListener('change', (event) => {
    if (event.target.name === 'guide-language') setDocLanguage(event.target.value);
  });
  printButton?.addEventListener('click', (event) => {
    event.preventDefault();
    print();
  });
  // Capture on the document: the focus may be on the body (popup window), and the main window's
  // own Ctrl+P (print the result) must not run while the guide is open.
  document.addEventListener('keydown', (event) => {
    if (!dialog.open || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'p') {
      event.preventDefault();
      event.stopPropagation();
      print();
    } else if (key === '=' || key === '+') {
      event.preventDefault();
      setFont(fontSize + 1);
    } else if (key === '-') {
      event.preventDefault();
      setFont(fontSize - 1);
    } else if (key === '0') {
      event.preventDefault();
      setFont(GUIDE_FONT.default);
    }
  }, true);
  content.addEventListener('scroll', markCurrent, { passive: true });
  applyFont();

  return {
    open(section) {
      fill();
      applyFont();
      showDialog(dialog);
      if (section) jump(section);
      else markCurrent();
    },
    // Settings were applied: when the program's language changed, the guide follows it;
    // otherwise the language picked in the guide stays.
    refreshLanguage() {
      if (getLanguage() === appLanguage) return;
      appLanguage = getLanguage();
      docLanguage = appLanguage;
      if (dialog.open) fill();
    },
    print,
    setFont,
    get fontSize() { return fontSize; },
    get language() { return shownLanguage; },
  };
}
