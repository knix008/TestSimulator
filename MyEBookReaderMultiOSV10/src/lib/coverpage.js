// The picture at the top of the properties panel.
//
// Most books carry a cover and that is the end of it. Plenty do not: a plain
// text file, a PDF nobody put a cover image in, a folder of scans. Those used
// to get a grey plate with an icon on it — a picture of nothing, which tells
// the reader less than the book itself does.
//
// So when there is no cover, the first page *is* the cover: it is what the
// reader would see on opening the book, which is exactly what a cover is for.
// This works out what that first page is; drawing it is the panel's job,
// because a page is a picture, a piece of markup or a PDF page to be painted,
// and each is drawn differently.

/**
 * The book's own cover, or failing that its first page.
 *
 * @returns {null | {source: 'cover'|'first', kind: 'image'|'html'|'pdf',
 *                   src?: string, html?: string, page?: object}}
 */
export function coverPageOf(book) {
  if (!book) return null;

  const own = safe(() => (typeof book.cover === 'function' ? book.cover() : ''));
  if (own) return { source: 'cover', kind: 'image', src: own };

  if (!book.sectionCount) return null;
  const first = safe(() => book.loadSection(0));
  if (!first) return null;

  if (first.src) return { source: 'first', kind: 'image', src: first.src };
  if (first.kind === 'pdf' && book.pdf) return { source: 'first', kind: 'pdf', page: first.page || 1 };
  // The whole first page, picture and words together. Taking only the picture
  // out of it showed a logo where the reading screen shows a page.
  if (first.html) return { source: 'first', kind: 'html', html: first.html };
  return null;
}

function safe(fn) {
  try { return fn(); } catch { return null; }
}
