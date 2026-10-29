// The manual's Markdown files, bundled by Vite (src/docs/<lang>/NN-name.md),
// and the tutorial document made from the tour's own texts. Images live in
// public/docs/images/<lang>/ and are written in the files as
// "images/<lang>/name.png" (resolved against DOC_BASE).
import { buildManual } from './guide';
import { tutorialMarkdown } from './tutorialSteps';

const FILES = import.meta.glob('../docs/*/*.md', { query: '?raw', import: 'default', eager: true });

export const DOC_BASE = 'docs/';
export const GUIDE_DOCS = [
  { id: 'manual', icon: 'book', ko: '사용 설명서', en: 'User manual' },
  { id: 'tutorial', icon: 'graduation', ko: '튜토리얼 문서', en: 'Tutorial document' },
];
export const GUIDE_LANGS = ['ko', 'en'];

const cache = new Map();
/** { lang, chapters, toc } of a document ('manual' | 'tutorial') in a language. */
export function guideDoc(doc = 'manual', lang = 'ko') {
  const l = lang === 'en' ? 'en' : 'ko';
  const d = doc === 'tutorial' ? 'tutorial' : 'manual';
  const key = `${d}:${l}`;
  if (!cache.has(key)) {
    const files = d === 'tutorial' ? { [`tutorial/${l}/00-tutorial.md`]: tutorialMarkdown(l) } : FILES;
    cache.set(key, buildManual(files, l, { base: DOC_BASE }));
  }
  return cache.get(key);
}
