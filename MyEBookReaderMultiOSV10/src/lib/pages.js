// How many pages a book has, and which one is being read.
//
// A PDF or a comic has pages: they are what the file is made of, and counting
// them is counting the sections. Reflowable text has none. A chapter of an EPUB
// is as many pages as the window, the font and the text size make it, so there
// is no page count that is true of the book itself — and a number that changes
// when the window is resized is no use for saying how far through a book you
// are, or for telling someone where to look.
//
// So a page here is a fixed amount of text, the way a printed page is, and a
// chapter begins on a new one, also the way a printed book does. That second
// part matters as much as the first: counting the characters of the whole book
// and counting the pages of each chapter must give the same answer, or the
// reader is told they are on page 2 of 3 at the very end of the book.

/** Characters to a page. About what a paperback page holds. */
export const CHARS_PER_PAGE = 1800;

/** How many sections are measured before letting the window breathe. */
const CHUNK = 12;

/** How many pages a section of `length` characters takes. Never fewer than one. */
function pagesIn(length, charsPerPage) {
  return Math.max(1, Math.ceil((Number(length) || 0) / charsPerPage));
}

/** The map, given each section's length in characters. */
function mapFrom(lengths, charsPerPage, estimated) {
  const spans = lengths.map((length) => pagesIn(length, charsPerPage));
  const first = [];
  let running = 1;
  for (const span of spans) {
    first.push(running);
    running += span;
  }
  return {
    pages: Math.max(0, running - 1),
    lengths,
    spans,
    first,
    total: lengths.reduce((sum, n) => sum + n, 0),
    charsPerPage,
    estimated,
  };
}

/**
 * Measures a book.
 *
 * Returns `{ pages, spans, first, lengths, total, estimated }`: `spans[i]` is
 * how many pages section i takes and `first[i]` the page it starts on, so the
 * count and the current page can never disagree. `estimated` is false for a book
 * whose pages are its own — a PDF, a comic, a picture — where the count is
 * exact.
 *
 * Measuring reflowable text means reading every section, so it is done a few at
 * a time with a breath in between: a book of six hundred chapters must not hold
 * the window while it is counted. `signal.cancelled` stops it.
 */
export async function measureBook(book, { charsPerPage = CHARS_PER_PAGE, signal } = {}) {
  const count = Number(book?.sectionCount) || 0;
  if (!book || count <= 0) return mapFrom([], charsPerPage, false);

  // Pages of its own: one section is one page, and nothing has to be read.
  if (book.reflowable === false) return mapFrom(new Array(count).fill(1), charsPerPage, false);

  const lengths = new Array(count).fill(0);
  for (let i = 0; i < count; i += 1) {
    if (signal?.cancelled) return null;
    let text = '';
    try { text = book.sectionText(i) || ''; } catch { text = ''; }
    lengths[i] = text.length;
    if ((i + 1) % CHUNK === 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (signal?.cancelled) return null;
  return mapFrom(lengths, charsPerPage, true);
}

/**
 * Which page of the book the reader is on.
 *
 * `fracY` is how far through the current section they have got, which is what
 * turns a section into a page: a chapter four pages long is page 1 at its top
 * and page 4 at its foot.
 */
export function pageAt(map, { section = 0, fracY = 0 } = {}) {
  if (!map?.pages) return 0;
  const last = map.first.length - 1;
  if (last < 0) return 0;
  const at = Math.min(Math.max(0, Math.round(section)), last);
  const span = map.spans[at] || 1;
  const through = Math.min(1, Math.max(0, Number(fracY) || 0));
  const within = Math.min(span - 1, Math.floor(through * span));
  return Math.min(map.pages, map.first[at] + within);
}

/**
 * A book with no pages counted yet still has sections, and saying "chapter 2 of
 * 3" is better than saying nothing while the counting is going on.
 */
export function pagesUnknown(book) {
  const count = Math.max(0, Number(book?.sectionCount) || 0);
  return { ...mapFrom(new Array(count).fill(0), CHARS_PER_PAGE, true), pages: 0 };
}
