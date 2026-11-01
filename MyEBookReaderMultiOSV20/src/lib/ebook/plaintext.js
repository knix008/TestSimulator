// Single-file books: plain text, Markdown and standalone HTML.
//
// These have no structure of their own, so one is invented: Markdown and HTML
// are split at their top-level headings, and plain text at its chapter lines
// ("Chapter 3", "제3장") or, failing that, into blocks of a readable size. That
// is what gives the reader a contents list, a page count and a position to
// remember.
import { sanitizeChapter, htmlToText, textToHtml } from './html.js';
import { renderMarkdown, markdownHeadings } from './markdown.js';

const MAX_BLOCK_CHARS = 20000;

/** Decodes text bytes, honouring a BOM and falling back to UTF-8. */
export function decodeText(bytes) {
  if (!bytes || !bytes.length) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  // A file that is actually CP949/EUC-KR decodes to replacement characters;
  // retrying in that encoding is what makes older Korean .txt books readable.
  const damage = (utf8.match(/�/g) || []).length;
  if (damage > Math.max(4, utf8.length / 200)) {
    for (const encoding of ['euc-kr', 'windows-1252', 'shift_jis']) {
      try {
        const alt = new TextDecoder(encoding).decode(bytes);
        if ((alt.match(/�/g) || []).length < damage) return alt;
      } catch { /* encoding unavailable in this runtime */ }
    }
  }
  return utf8;
}

const CHAPTER_LINE = /^\s*(?:(?:chapter|part|book|section)\s+[\dIVXLC]+|제\s*\d+\s*[장부편]|\d+\s*장|[IVXLC]+\.)\s*.{0,60}$/i;

/** Splits plain text into chapters at chapter headings, or by size. */
export function splitPlainText(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() && lines[i].trim().length <= 70 && CHAPTER_LINE.test(lines[i])) marks.push(i);
  }

  const chunks = [];
  if (marks.length >= 2) {
    if (marks[0] > 0) marks.unshift(0);
    for (let i = 0; i < marks.length; i++) {
      const from = marks[i];
      const to = i + 1 < marks.length ? marks[i + 1] : lines.length;
      const body = lines.slice(from, to).join('\n');
      if (body.trim()) chunks.push({ label: lines[from].trim().slice(0, 80) || `${chunks.length + 1}`, text: body });
    }
  }

  if (!chunks.length) {
    let buffer = [];
    let size = 0;
    for (const line of lines) {
      buffer.push(line);
      size += line.length + 1;
      if (size >= MAX_BLOCK_CHARS && !line.trim()) {
        chunks.push({ label: '', text: buffer.join('\n') });
        buffer = [];
        size = 0;
      }
    }
    if (buffer.length) chunks.push({ label: '', text: buffer.join('\n') });
  }

  return chunks.length ? chunks : [{ label: '', text: String(text ?? '') }];
}

/** Text a part would actually show, ignoring <head> and the tags themselves. */
function visibleText(html) {
  return String(html || '')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlChapters(markup) {
  // Split a standalone HTML book at its <h1>/<h2> boundaries. The preamble
  // before the first heading — doctype, <head>, the opening <body> tag — shows
  // nothing, so it does not become a chapter of its own.
  const parts = String(markup ?? '')
    .split(/(?=<h[12][\s>])/i)
    .filter((part) => visibleText(part));
  if (parts.length <= 1) return [{ label: '', html: markup }];
  return parts.map((html) => {
    const heading = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(html);
    return {
      label: heading ? heading[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '',
      html,
    };
  });
}

/**
 * Opens a text-shaped book.
 * @param {Uint8Array|string} input
 * @param {object} options `kind` is 'txt' | 'md' | 'html', `name` the file name
 */
export function openTextBook(input, { kind = 'txt', name = '' } = {}) {
  const source = typeof input === 'string' ? input : decodeText(input);
  let chapters;

  if (kind === 'md') {
    const headings = markdownHeadings(source).filter((h) => h.level <= 2);
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    if (headings.length >= 2) {
      chapters = headings.map((heading, i) => {
        const from = heading.line;
        const to = i + 1 < headings.length ? headings[i + 1].line : lines.length;
        return { label: heading.text.slice(0, 80), html: renderMarkdown(lines.slice(from, to).join('\n')) };
      });
      if (headings[0].line > 0) {
        chapters.unshift({ label: '', html: renderMarkdown(lines.slice(0, headings[0].line).join('\n')) });
      }
    } else {
      chapters = [{ label: '', html: renderMarkdown(source) }];
    }
  } else if (kind === 'html') {
    chapters = htmlChapters(source);
  } else {
    chapters = splitPlainText(source).map((chunk) => ({ label: chunk.label, html: textToHtml(chunk.text) }));
  }

  const sections = chapters.map((chapter, index) => ({
    index,
    id: `${kind}-${index}`,
    href: `#section-${index}`,
    kind: 'html',
    label: chapter.label || `${index + 1}`,
  }));

  // The first heading (or the file name) is the best title such a file offers.
  const firstHeading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(chapters[0]?.html || '');
  const title = (firstHeading?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    || String(name || '').replace(/\.[^.]+$/, '');

  return {
    format: kind,
    meta: { title, author: '', language: '' },
    sections,
    toc: chapters.map((chapter, index) => ({
      label: chapter.label || `${index + 1}`,
      section: index,
      anchor: '',
      children: [],
    })),
    coverPath: '',
    resource() { return null; },
    loadSection(index) {
      const chapter = chapters[index];
      if (!chapter) throw new Error(`This document has no section ${index + 1}.`);
      const cleaned = sanitizeChapter(chapter.html, { mime: 'text/html' });
      return { kind: 'html', ...cleaned, index, href: sections[index].href };
    },
    sectionText(index) {
      return chapters[index] ? htmlToText(chapters[index].html) : '';
    },
  };
}
