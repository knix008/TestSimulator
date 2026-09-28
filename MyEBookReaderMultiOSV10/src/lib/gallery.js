// The gallery: every book that has been read, kept across sessions.
//
// The recent-files list is a menu — ten names, newest first, for reopening what
// you just had. The gallery is the other thing people ask for: a shelf you can
// look at. It holds many more books, keeps a cover thumbnail, the author, the
// format, how far the reading got and when, and it can be shown either as large
// covers or as a detailed list.
//
// It lives in the settings file (so it is restored on the next run) and is
// therefore kept deliberately small: a capped number of entries, each with a
// thumbnail no larger than a playing card. Everything here is a pure function
// over plain data except `makeThumbnail`, which needs a canvas.

/**
 * How many books the shelf will hold.
 *
 * It was sixty while the shelf lived in the settings file with its covers
 * inside it. Now that the index is a file of its own and the covers are files
 * of theirs, the only real limit is what can be sorted in a moment — and a
 * hundred thousand books sort in about eighty milliseconds.
 */
export const MAX_GALLERY = 100000;
export const GALLERY_VIEWS = ['icons', 'details'];
export const GALLERY_SORTS = ['recent', 'title', 'author', 'format', 'progress'];

export const THUMB_WIDTH = 180;
export const THUMB_HEIGHT = 260;

/** How long to wait for a cover to load before giving up on it. */
export const THUMB_TIMEOUT = 4000;

/** The identity of a shelved book: its path, or its name when there is none. */
export function galleryKey(entry) {
  return entry?.path || entry?.name || '';
}

/** Builds the entry for a book that has just been opened. */
export function galleryEntry(book, extra = {}) {
  return {
    path: book?.filePath || null,
    name: book?.fileName || '',
    dir: book?.dir || '',
    format: book?.format || '',
    formatLabel: book?.formatLabel || '',
    title: book?.meta?.title || stripExtension(book?.fileName || ''),
    author: book?.meta?.author || '',
    size: book?.fileSize || 0,
    sections: book?.sectionCount || 0,
    section: 0,
    cover: '',
    openedAt: Date.now(),
    reads: 1,
    ...extra,
  };
}

function stripExtension(name) {
  const at = String(name || '').lastIndexOf('.');
  return at > 0 ? name.slice(0, at) : String(name || '');
}

/**
 * Shelves a book. An entry that is already there keeps what it learned before —
 * its cover, how far the reading got — and counts one more reading.
 */
export function addToGallery(list, entry, cap = MAX_GALLERY) {
  const key = galleryKey(entry);
  if (!key) return list || [];
  const previous = (list || []).find((e) => galleryKey(e) === key);
  const rest = (list || []).filter((e) => galleryKey(e) !== key);
  const merged = {
    ...previous,
    ...entry,
    cover: entry.cover || previous?.cover || '',
    // A book that has just been opened reports section 0 — which is not news,
    // so the position the shelf already knew about wins.
    section: entry.section || previous?.section || 0,
    reads: (previous?.reads || 0) + 1,
    openedAt: entry.openedAt || Date.now(),
  };
  return [merged, ...rest].slice(0, cap);
}

/** Records a change to one shelved book — where the reading got to, its cover. */
export function updateGallery(list, key, patch) {
  return (list || []).map((e) => (galleryKey(e) === key ? { ...e, ...patch } : e));
}

export function removeFromGallery(list, key) {
  return (list || []).filter((e) => galleryKey(e) !== key);
}

/** How far through the book the reading got, 0..1. */
export function galleryProgress(entry) {
  const sections = Number(entry?.sections) || 0;
  if (sections <= 1) return entry?.section > 0 ? 1 : 0;
  const section = Math.min(Math.max(Number(entry?.section) || 0, 0), sections - 1);
  return section / (sections - 1);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Sorts a copy of the shelf. Unknown keys fall back to newest first. */
export function sortGallery(list, by = 'recent') {
  const out = [...(list || [])];
  const byName = (e) => e.title || e.name || '';
  switch (by) {
    case 'title':
      return out.sort((a, b) => collator.compare(byName(a), byName(b)));
    case 'author':
      // Books with no author go last, rather than sorting under the empty string.
      return out.sort((a, b) => {
        if (!a.author !== !b.author) return a.author ? -1 : 1;
        return collator.compare(a.author || '', b.author || '') || collator.compare(byName(a), byName(b));
      });
    case 'format':
      return out.sort((a, b) => collator.compare(a.format || '', b.format || '') || collator.compare(byName(a), byName(b)));
    case 'progress':
      return out.sort((a, b) => galleryProgress(b) - galleryProgress(a));
    default:
      return out.sort((a, b) => (Number(b.openedAt) || 0) - (Number(a.openedAt) || 0));
  }
}

/** Filters by title, author, file name or format — everything the shelf shows. */
export function searchGallery(list, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return list || [];
  return (list || []).filter((e) => [e.title, e.author, e.name, e.format, e.formatLabel]
    .some((field) => String(field || '').toLowerCase().includes(needle)));
}

/** The initials drawn on a book with no cover. */
export function coverInitials(entry) {
  const source = String(entry?.title || entry?.name || '?').trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  // Initials only make sense where words are made of letters: 몽테크리스토 백작
  // reads as 몽테, not as 몽백.
  const latin = /[A-Za-z0-9]/.test(words[0][0]);
  if (!latin || words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Shrinks an image to thumbnail size and returns it as a PNG data URL.
 *
 * The shelf is stored with the settings, so a full-size cover would fill the
 * storage after a handful of books; this keeps each one to a few kilobytes.
 * Anything that cannot be drawn — no canvas, a cross-origin image, a source
 * that never loads — resolves to '' rather than throwing, because a missing
 * thumbnail only costs the reader a placeholder.
 */
export function makeThumbnail(source, width = THUMB_WIDTH, height = THUMB_HEIGHT) {
  return new Promise((resolve) => {
    if (!source || typeof document === 'undefined') { resolve(''); return; }

    const draw = (image, naturalW, naturalH) => {
      try {
        const scale = Math.min(width / naturalW, height / naturalH, 1);
        const w = Math.max(1, Math.round(naturalW * scale));
        const h = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(''); return; }
        ctx.drawImage(image, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve('');
      }
    };

    // Already a canvas (a painted PDF page): no loading needed.
    if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
      draw(source, source.width, source.height);
      return;
    }

    const url = typeof source === 'string' ? source : source?.src;
    if (!url) { resolve(''); return; }
    // Some sources neither load nor fail — a blob URL whose owner has been
    // revoked, for one — so the wait is bounded.
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(''), THUMB_TIMEOUT);

    const image = new Image();
    image.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      draw(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
    };
    image.onerror = () => finish('');
    image.src = url;
  });
}
