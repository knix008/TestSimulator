// The reading file: MyEBookReader's own document type (.ebkr).
//
// A book file is read-only as far as this app is concerned — nobody wants their
// EPUB rewritten — so everything the reader produces (bookmarks, highlights,
// notes, the last reading position, the view settings that go with the book) is
// kept beside it in a small JSON file. That file is what the title bar's "•"
// refers to, what the installer registers with its own icon, and what "unsaved
// changes" on exit is about.
import { newId } from './history.js';

export const LIBRARY_EXT = 'ebkr';
export const LIBRARY_VERSION = 1;
export const LIBRARY_MAGIC = 'MyEBookReader';

export const EMPTY_READING = {
  bookmarks: [],     // { id, section, anchor, label, fracY, spot, at }
  highlights: [],    // { id, section, text, color, at, note }
  notes: [],         // { id, section, text, at }
  clips: [],         // { id, kind: 'text', section, content, at }
  lastPosition: null, // { section, fracY }
};

export function isLibraryPath(name) {
  return new RegExp(`\\.${LIBRARY_EXT}$`, 'i').test(String(name || ''));
}

/** Serializes the reading state for a book into the text of an .ebkr file. */
export function serializeLibrary({ book, reading, view }) {
  const payload = {
    magic: LIBRARY_MAGIC,
    version: LIBRARY_VERSION,
    savedAt: new Date().toISOString(),
    book: {
      path: book?.filePath || '',
      name: book?.fileName || '',
      size: book?.fileSize || 0,
      format: book?.format || '',
      title: book?.meta?.title || '',
      author: book?.meta?.author || '',
      sections: book?.sectionCount || 0,
    },
    view: view || {},
    reading: {
      bookmarks: reading?.bookmarks || [],
      highlights: reading?.highlights || [],
      notes: reading?.notes || [],
      clips: reading?.clips || [],
      lastPosition: reading?.lastPosition || null,
    },
  };
  return JSON.stringify(payload, null, 2);
}

/** Parses an .ebkr file. Throws with a readable message on anything unexpected. */
export function parseLibrary(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch (err) {
    throw new Error(`This reading file is not valid JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('This reading file is empty.');
  if (parsed.magic !== LIBRARY_MAGIC) {
    throw new Error('This file was not written by MyEBookReader, so its reading data cannot be restored.');
  }
  if (Number(parsed.version) > LIBRARY_VERSION) {
    throw new Error(`This reading file was written by a newer version of MyEBookReader (file format ${parsed.version}, this build reads ${LIBRARY_VERSION}).`);
  }

  const reading = { ...EMPTY_READING, ...(parsed.reading || {}) };
  for (const key of ['bookmarks', 'highlights', 'notes', 'clips']) {
    reading[key] = Array.isArray(reading[key]) ? reading[key].filter(Boolean) : [];
  }
  return {
    bookPath: parsed.book?.path || '',
    bookName: parsed.book?.name || '',
    bookTitle: parsed.book?.title || '',
    view: parsed.view || {},
    reading,
    savedAt: parsed.savedAt || '',
  };
}

/** The .ebkr name that goes with a book file. */
export function libraryNameFor(bookName) {
  const base = String(bookName || 'book').replace(/\.[^.]+$/, '');
  return `${base}.${LIBRARY_EXT}`;
}

// ── Editing the reading state (all of it undoable through history.js) ──
export function addBookmark(reading, entry) {
  return {
    ...reading,
    bookmarks: [...reading.bookmarks, { id: newId(), at: Date.now(), ...entry }],
  };
}

export function removeById(list, id) {
  return (list || []).filter((item) => item.id !== id);
}

export function addHighlight(reading, entry) {
  return {
    ...reading,
    highlights: [...reading.highlights, { id: newId(), at: Date.now(), color: 'yellow', ...entry }],
  };
}

export function addNote(reading, entry) {
  return {
    ...reading,
    notes: [...reading.notes, { id: newId(), at: Date.now(), ...entry }],
  };
}

export function addClip(reading, entry, limit = 200) {
  return {
    ...reading,
    clips: [{ id: newId(), at: Date.now(), kind: 'text', ...entry }, ...reading.clips].slice(0, limit),
  };
}

/** Everything the reader has marked in one section, for the view to paint. */
export function marksForSection(reading, section) {
  return {
    highlights: (reading?.highlights || []).filter((h) => h.section === section),
    notes: (reading?.notes || []).filter((n) => n.section === section),
    bookmarks: (reading?.bookmarks || []).filter((b) => b.section === section),
  };
}

export function readingIsEmpty(reading) {
  if (!reading) return true;
  return !reading.bookmarks.length && !reading.highlights.length
    && !reading.notes.length && !reading.clips.length;
}

/** A short label for a bookmark: the selected text, or the position. */
export function bookmarkLabel(text, fallback) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 70) || fallback;
}

export const HIGHLIGHT_COLORS = [
  { id: 'yellow', css: 'rgba(255, 214, 0, 0.42)' },
  { id: 'green', css: 'rgba(80, 220, 120, 0.38)' },
  { id: 'blue', css: 'rgba(90, 170, 255, 0.38)' },
  { id: 'pink', css: 'rgba(255, 120, 190, 0.38)' },
  { id: 'orange', css: 'rgba(255, 150, 60, 0.4)' },
];

export function highlightCss(id) {
  return (HIGHLIGHT_COLORS.find((c) => c.id === id) || HIGHLIGHT_COLORS[0]).css;
}
