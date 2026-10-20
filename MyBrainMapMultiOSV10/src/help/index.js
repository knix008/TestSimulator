// The Help window's content: one Markdown file per chapter in ./<lang>/
// (ko, en — sorted by the number in front of the name; the same number is the
// same chapter in every language) and the screenshots in ./images/<lang>/,
// captured from the running app by scripts/make-help-media.mjs. Both are
// bundled, so the help works without a network or the source tree.
import { renderMarkdown } from '../lib/markdown';

const TEXTS = import.meta.glob('./*/*.md', { query: '?raw', import: 'default', eager: true });
const IMAGES = import.meta.glob('./images/*/*.png', { query: '?url', import: 'default', eager: true });

export const HELP_LANGUAGES = ['ko', 'en'];

const BY_LANG = {};
for (const key of Object.keys(TEXTS).sort()) {
  const [, lang, file] = /^\.\/([a-z]+)\/(.+)$/.exec(key);
  const text = TEXTS[key];
  const title = ((/^#\s+(.+)$/m.exec(text) || [])[1] || file).trim();
  const sections = [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  (BY_LANG[lang] = BY_LANG[lang] || []).push({ id: file.slice(0, 2), lang, file, title, text, sections });
}

/** The chapters in `lang`, or the Korean ones when that language has none. */
export function helpChapters(lang) {
  return BY_LANG[lang] || BY_LANG.ko || [];
}

/** A chapter by its number ("03"), file name ("03-파일.md" / "03-files.md") or nothing (the first). */
export function helpChapter(lang, id = '') {
  const list = helpChapters(lang);
  const key = String(id || '').slice(0, 2);
  return list.find((c) => c.id === key) || list[0];
}

function imageUrl(lang, name) {
  return IMAGES[`./images/${lang}/${name}`] || IMAGES[`./images/ko/${name}`] || '';
}

/** The chapter as HTML: images point at the bundled files (in its language), each ## heading gets an id (help-s0, help-s1 …). */
export function helpHtml(chapter) {
  let n = 0;
  return renderMarkdown(chapter.text)
    .replace(/src="(?:\.\/)?images\/([^"]+)"/g, (_, name) => `src="${imageUrl(chapter.lang, decodeURIComponent(name))}" loading="lazy"`)
    .replace(/<h2>/g, () => `<h2 id="help-s${n++}">`);
}

/** Chapters (of `lang`) whose text contains every word of the query, with how often the first word appears. */
export function searchHelp(lang, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const out = new Map();
  for (const c of helpChapters(lang)) {
    const hay = c.text.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    out.set(c.id, hay.split(words[0]).length - 1);
  }
  return out;
}
