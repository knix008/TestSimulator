import { describe, it, expect } from 'vitest';
import {
  serializeLibrary, parseLibrary, libraryNameFor, isLibraryPath, EMPTY_READING,
  addBookmark, addHighlight, addNote, addClip, removeById, marksForSection,
  readingIsEmpty, bookmarkLabel, highlightCss, HIGHLIGHT_COLORS, LIBRARY_VERSION,
} from '../src/lib/library.js';

const book = {
  filePath: 'C:\\books\\sample.epub',
  fileName: 'sample.epub',
  fileSize: 1234,
  format: 'epub',
  sectionCount: 3,
  meta: { title: '샘플 책', author: 'SHKWON' },
};

describe('serializeLibrary / parseLibrary', () => {
  it('round-trips the reading state', () => {
    const reading = addHighlight(addBookmark(EMPTY_READING, { section: 1, label: 'mark' }), {
      section: 2, text: 'highlighted words',
    });
    const text = serializeLibrary({ book, reading, view: { fontScale: 1.4 } });
    const parsed = parseLibrary(text);

    expect(parsed.bookPath).toBe(book.filePath);
    expect(parsed.bookTitle).toBe('샘플 책');
    expect(parsed.view.fontScale).toBe(1.4);
    expect(parsed.reading.bookmarks[0].label).toBe('mark');
    expect(parsed.reading.highlights[0].text).toBe('highlighted words');
  });

  it('writes readable JSON with the format version', () => {
    const text = serializeLibrary({ book, reading: EMPTY_READING, view: {} });
    const raw = JSON.parse(text);
    expect(raw.magic).toBe('MyEBookReader');
    expect(raw.version).toBe(LIBRARY_VERSION);
    expect(text).toContain('\n');
  });

  it('keeps the last reading position', () => {
    const reading = { ...EMPTY_READING, lastPosition: { section: 2, fracY: 0.5 } };
    const parsed = parseLibrary(serializeLibrary({ book, reading, view: {} }));
    expect(parsed.reading.lastPosition).toEqual({ section: 2, fracY: 0.5 });
  });

  it('rejects a file that is not JSON', () => {
    expect(() => parseLibrary('not json')).toThrow(/not valid JSON/i);
  });

  it('rejects a JSON file written by something else', () => {
    expect(() => parseLibrary('{"hello":1}')).toThrow(/not written by MyEBookReader/i);
  });

  it('rejects a file from a newer version of the app', () => {
    expect(() => parseLibrary(JSON.stringify({ magic: 'MyEBookReader', version: 99 })))
      .toThrow(/newer version/i);
  });

  it('tolerates missing lists', () => {
    const parsed = parseLibrary(JSON.stringify({ magic: 'MyEBookReader', version: 1, reading: {} }));
    expect(parsed.reading.bookmarks).toEqual([]);
    expect(parsed.reading.notes).toEqual([]);
  });
});

describe('reading-file names', () => {
  it('derives the name from the book', () => {
    expect(libraryNameFor('Some Book.epub')).toBe('Some Book.ebkr');
    expect(libraryNameFor('')).toBe('book.ebkr');
  });

  it('recognises a reading file by its extension', () => {
    expect(isLibraryPath('x/y.ebkr')).toBe(true);
    expect(isLibraryPath('x/y.EBKR')).toBe(true);
    expect(isLibraryPath('x/y.epub')).toBe(false);
  });
});

describe('editing the reading state', () => {
  it('adds a bookmark with an id and a timestamp', () => {
    const next = addBookmark(EMPTY_READING, { section: 1, label: 'here' });
    expect(next.bookmarks).toHaveLength(1);
    expect(next.bookmarks[0].id).toBeTruthy();
    expect(next.bookmarks[0].at).toBeGreaterThan(0);
    expect(EMPTY_READING.bookmarks).toHaveLength(0);   // never mutated
  });

  it('adds a highlight with a default colour', () => {
    expect(addHighlight(EMPTY_READING, { section: 0, text: 'x' }).highlights[0].color).toBe('yellow');
  });

  it('adds a note', () => {
    expect(addNote(EMPTY_READING, { section: 0, note: 'thought' }).notes[0].note).toBe('thought');
  });

  it('adds a clip, newest first, and caps the list', () => {
    let state = EMPTY_READING;
    for (let i = 0; i < 5; i++) state = addClip(state, { section: 0, content: `c${i}` }, 3);
    expect(state.clips).toHaveLength(3);
    expect(state.clips[0].content).toBe('c4');
  });

  it('removes an entry by id', () => {
    const state = addBookmark(EMPTY_READING, { section: 0, label: 'a' });
    expect(removeById(state.bookmarks, state.bookmarks[0].id)).toEqual([]);
  });

  it('collects the marks of one section', () => {
    let state = addHighlight(EMPTY_READING, { section: 1, text: 'a' });
    state = addHighlight(state, { section: 2, text: 'b' });
    state = addNote(state, { section: 1, note: 'n' });
    const marks = marksForSection(state, 1);
    expect(marks.highlights).toHaveLength(1);
    expect(marks.notes).toHaveLength(1);
  });

  it('knows when nothing has been marked', () => {
    expect(readingIsEmpty(EMPTY_READING)).toBe(true);
    expect(readingIsEmpty(addNote(EMPTY_READING, { section: 0, note: 'x' }))).toBe(false);
    expect(readingIsEmpty(null)).toBe(true);
  });
});

describe('labels and colours', () => {
  it('uses the selected text, trimmed, as a bookmark label', () => {
    expect(bookmarkLabel('  some   selected words  ', 'fallback')).toBe('some selected words');
  });

  it('falls back when there is no selection', () => {
    expect(bookmarkLabel('', '3장')).toBe('3장');
  });

  it('caps a long label', () => {
    expect(bookmarkLabel('x'.repeat(200), 'f')).toHaveLength(70);
  });

  it('maps a colour id to CSS, defaulting to the first', () => {
    expect(highlightCss('green')).toBe(HIGHLIGHT_COLORS[1].css);
    expect(highlightCss('nope')).toBe(HIGHLIGHT_COLORS[0].css);
  });
});
