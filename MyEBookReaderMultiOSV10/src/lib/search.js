// Searching a whole book.
//
// Every format can produce the plain text of a section, so one search works for
// all of them. It runs section by section and yields to the event loop between
// them, which keeps a search over a 900-page PDF from freezing the window, and
// can be cancelled by an AbortSignal when the user types the next letter.

export const MAX_HITS = 2000;

const SNIPPET_BEFORE = 44;
const SNIPPET_AFTER = 56;

/** Finds every occurrence of `needle` in one piece of text. */
export function findInText(text, needle, { limit = MAX_HITS } = {}) {
  const haystack = String(text || '');
  const query = String(needle || '');
  if (!query) return [];
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = query.toLowerCase();
  const hits = [];
  let from = 0;
  for (;;) {
    const at = lowerHay.indexOf(lowerNeedle, from);
    if (at === -1 || hits.length >= limit) break;
    hits.push({
      index: at,
      match: haystack.slice(at, at + query.length),
      snippet: haystack.slice(Math.max(0, at - SNIPPET_BEFORE), at + query.length + SNIPPET_AFTER)
        .replace(/\s+/g, ' ')
        .trim(),
    });
    from = at + Math.max(1, query.length);
  }
  return hits;
}

/**
 * Searches a book.
 *
 * @param {object} book      an opened book
 * @param {string} query     what to look for
 * @param {object} options   `onProgress({done,total})`, `signal`, `limit`
 * @returns {Promise<Array>} [{ section, index, snippet, match, label }]
 */
export async function searchBook(book, query, { onProgress, signal, limit = MAX_HITS } = {}) {
  const needle = String(query || '').trim();
  if (!book || !needle) return [];
  const total = book.sectionCount;
  const out = [];

  for (let section = 0; section < total; section++) {
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    onProgress?.({ done: section, total });

    let text = '';
    try {
      text = await book.readSectionText(section);
    } catch { text = ''; }

    for (const hit of findInText(text, needle, { limit: limit - out.length })) {
      out.push({
        ...hit,
        section,
        label: book.sections[section]?.label || String(section + 1),
      });
    }
    if (out.length >= limit) break;

    // Let the UI paint between sections; a tight loop would block the window.
    if (section % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  onProgress?.({ done: total, total });
  return out;
}

/** Which hit is "current" after moving `dir` through the result list. */
export function stepHit(results, activeIndex, dir) {
  if (!results?.length) return -1;
  if (activeIndex < 0) return dir < 0 ? results.length - 1 : 0;
  return (activeIndex + (dir < 0 ? -1 : 1) + results.length) % results.length;
}

/** Groups hits by section, for the panel's per-chapter counts. */
export function groupHits(results) {
  const out = new Map();
  for (const hit of results || []) {
    if (!out.has(hit.section)) out.set(hit.section, []);
    out.get(hit.section).push(hit);
  }
  return out;
}

/**
 * Wraps every occurrence of `query` in already-sanitized chapter HTML with a
 * <mark>, without touching anything inside a tag.
 */
export function markHtml(html, query) {
  const needle = String(query || '').trim();
  if (!needle) return html;
  const source = String(html || '');
  const lowerNeedle = needle.toLowerCase();
  let out = '';
  let i = 0;

  while (i < source.length) {
    if (source[i] === '<') {
      const close = source.indexOf('>', i);
      if (close === -1) { out += source.slice(i); break; }
      out += source.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    const nextTag = source.indexOf('<', i);
    const end = nextTag === -1 ? source.length : nextTag;
    const chunk = source.slice(i, end);
    const lower = chunk.toLowerCase();
    let from = 0;
    let piece = '';
    for (;;) {
      const at = lower.indexOf(lowerNeedle, from);
      if (at === -1) break;
      piece += chunk.slice(from, at) + '<mark class="find-hit">' + chunk.slice(at, at + needle.length) + '</mark>';
      from = at + needle.length;
    }
    out += piece + chunk.slice(from);
    i = end;
  }

  return out;
}
