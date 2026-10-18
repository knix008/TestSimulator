// The help documents and the tutorial video, shown in their own windows
// (desktop: an OS window labelled "doc-<kind>"; web: a browser tab at
// index.html?viewer=<kind>; while the tutorial runs: a frame in the page).
// Pure helpers only: chapter lists, video chapter sidecar, time labels.

/** Document kinds: the HTML page (docs/<file>.html, docs/<file>.en.html) or the video. */
export const DOC_KINDS = {
  guide: { file: 'UsersGuide', title: 'action.userGuide', glyph: 'userGuide', width: 1180, height: 820 },
  tutorial: { file: 'Tutorial', title: 'action.tutorialDoc', glyph: 'tutorialDoc', width: 1180, height: 820 },
  video: { file: null, title: 'action.tutorialVideo', glyph: 'tutorialVideo', width: 1240, height: 860 },
};

export const isDocKind = (kind) => Object.hasOwn(DOC_KINDS, kind);

/** The video and its chapter sidecar (installed under docs/video/). */
export const VIDEO_FILE = 'video/MyUMLMaker-Tutorial.mp4';
export const VIDEO_CHAPTERS_FILE = 'video/MyUMLMaker-Tutorial.json';
export const VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Window label of a document kind. */
export const docLabel = (kind) => `doc-${kind}`;

/** "docs/UsersGuide.en.html" (relative to the app page). */
export function docUrl(kind, language) {
  const info = DOC_KINDS[kind];
  if (!info?.file) return null;
  return `docs/${info.file}${language === 'en' ? '.en' : ''}.html`;
}

/** File name of the page inside docs/ ("Tutorial.html"). */
export const docFile = (kind, language) => docUrl(kind, language)?.slice('docs/'.length) ?? null;

/** The OS window title: "MyUMLMaker — 사용 설명서". */
export const docWindowTitle = (name) => `MyUMLMaker — ${name}`;

/** Heading text without the "#" anchor the page builder adds. */
export const headingText = (text) => String(text ?? '').replace(/\s*#\s*$/, '').replace(/\s+/g, ' ').trim();

/**
 * The chapter list of a document page from its headings (h2 and h3 with an id):
 * [{ id, level, text }]. `nodes` are elements (or { tagName, id, textContent }).
 */
export function chapterEntries(nodes) {
  const out = [];
  for (const node of nodes ?? []) {
    const level = Number(/^h([23])$/i.exec(String(node?.tagName ?? ''))?.[1]);
    const id = String(node?.id ?? '');
    const text = headingText(node?.textContent);
    if (!level || !id || !text) continue;
    out.push({ id, level, text });
  }
  return out;
}

/** The chapter that contains a scroll position: the last heading at or above `top` (tops in document order). */
export function currentChapter(entries, tops, top) {
  let current = null;
  entries.forEach((entry, i) => { if (tops[i] != null && tops[i] <= top) current = entry.id; });
  return current;
}

/** Start offsets of every match of `query` in `text`, ignoring case (find in the document). */
export function findOffsets(text, query) {
  const needle = String(query ?? '').toLocaleLowerCase();
  if (!needle) return [];
  const hay = String(text ?? '').toLocaleLowerCase();
  const out = [];
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) out.push(at);
  return out;
}

/** The next match index after `current` (wrapping), backwards with `back`. */
export const stepMatch = (count, current, back = false) => (count ? (back ? (current <= 0 ? count - 1 : current - 1) : (current + 1) % count) : -1);

/** 65 → "1:05", 3723 → "1:02:03". */
export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const pick = (title, language) => {
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object') return String(title[language] ?? title.ko ?? title.en ?? Object.values(title)[0] ?? '');
  return '';
};

/**
 * The tutorial video's sidecar (written while recording): { duration, chapters: [{ id, start, title: { ko, en } }],
 * steps: [{ id, chapter, start, title }] }. Returns { duration, chapters, steps } with titles in `language`,
 * sorted by start time, bad entries dropped. Accepts the JSON text or the parsed object.
 */
export function parseVideoChapters(source, language = 'ko') {
  let data = source;
  if (typeof source === 'string') {
    try { data = JSON.parse(source); } catch { data = null; }
  }
  const list = (items) => (Array.isArray(items) ? items : [])
    .map((item, index) => ({ id: String(item?.id ?? index), chapter: item?.chapter != null ? String(item.chapter) : null, start: Number(item?.start), title: pick(item?.title, language).trim() }))
    .filter((item) => Number.isFinite(item.start) && item.start >= 0 && item.title)
    .sort((a, b) => a.start - b.start);
  const duration = Number(data?.duration);
  const steps = list(data?.steps);
  let chapters = list(data?.chapters);
  // Only steps: their chapters start at the first step of each.
  if (!chapters.length && steps.length) {
    const seen = new Set();
    chapters = steps.filter((step) => step.chapter && !seen.has(step.chapter) && seen.add(step.chapter)).map((step) => ({ ...step, id: step.chapter }));
  }
  return { duration: Number.isFinite(duration) && duration > 0 ? duration : null, chapters, steps };
}

/** Index of the entry playing at `time` (the last one that started), or -1. */
export function entryAt(entries, time) {
  let found = -1;
  entries.forEach((entry, i) => { if (entry.start <= time + 0.05) found = i; });
  return found;
}

/** Left offsets (0…100 %) of chapter marks on a timeline. */
export const markOffsets = (entries, duration) => (duration > 0 ? entries.map((entry) => Math.min(100, Math.max(0, (entry.start / duration) * 100))) : []);
