// Turning a book's markup into something safe to show.
//
// A chapter of an EPUB, an FB2 body or a MOBI record is arbitrary HTML from an
// untrusted file, and it is rendered inside the application's own document —
// so everything that could run, navigate or phone home is removed here, and
// what is left is re-pointed at the book's own resources.
//
// Author styling is dropped on purpose rather than for safety: the reader owns
// typography (font, size, line height, margins, theme), and a book's own CSS
// would fight every one of those settings.

const BLOCKED_TAGS = new Set([
  'script', 'style', 'link', 'meta', 'iframe', 'frame', 'frameset', 'object',
  'embed', 'applet', 'base', 'form', 'input', 'button', 'select', 'textarea',
  'noscript', 'template',
]);

// Kept because they carry meaning a reader needs: structure, emphasis, tables,
// ruby (Japanese), MathML-lite and images.
const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'id', 'colspan', 'rowspan', 'start', 'type',
  'dir', 'lang', 'datetime', 'cite', 'value',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr', 'col', 'source', 'track']);

// Presentational wrappers. A MOBI chapter arrives inside <mbp:pagebreak> and
// <font>, so the paragraphs are not the blocks of the page and never pick up
// the inset an EPUB paragraph gets. The text is kept; the wrapper is not.
const UNWRAP_TAGS = new Set([
  'font', 'center', 'big', 'tt', 'strike',
  'mbp:pagebreak', 'guide', 'reference',
]);

// The only class names that survive: the ones the app's own format converters
// emit (see fb2.js), which App.css styles.
const OWN_CLASS = /^(fb2-[a-z]+|comic-page)$/;

export function parseDocument(markup, mime = 'text/html') {
  if (typeof DOMParser === 'undefined') {
    throw new Error('This environment has no DOMParser, so book markup cannot be read.');
  }
  const parser = new DOMParser();
  let doc = parser.parseFromString(String(markup ?? ''), mime);
  // XHTML is strict: a single unescaped & in an EPUB kills the whole chapter,
  // so a failed parse is retried as HTML, which is what browsers do anyway.
  if (mime !== 'text/html' && doc.querySelector('parsererror')) {
    doc = parser.parseFromString(String(markup ?? ''), 'text/html');
  }
  return doc;
}

function isSafeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^(javascript|vbscript|data:text\/html)/i.test(value)) return false;
  return true;
}

/**
 * Cleans one chapter.
 *
 * @param {string}   markup      the chapter source
 * @param {object}   options
 *   - `mime`       'application/xhtml+xml' for EPUB, 'text/html' otherwise
 *   - `resolveSrc` (href) => url | null — maps a book-relative image to
 *     something the renderer can show (a blob: URL)
 *   - `linkTarget` (href) => { section, anchor } | null — maps an internal
 *     link to the section it points at, so the reader can follow it
 * @returns {{ html: string, title: string, headings: Array, text: string }}
 */
export function sanitizeChapter(markup, { mime = 'text/html', resolveSrc, linkTarget } = {}) {
  const doc = parseDocument(markup, mime);
  const body = doc.body || doc.documentElement;
  if (!body) return { html: '', title: '', headings: [], text: '' };

  const headings = [];
  let headingSeq = 0;

  const visit = (child) => {
      const tag = child.tagName.toLowerCase();

      if (BLOCKED_TAGS.has(tag)) { child.remove(); return; }

      // The words stay where they are. Only the wrapper goes, so a paragraph
      // of a MOBI chapter is a paragraph, the same as one of an EPUB chapter.
      if (UNWRAP_TAGS.has(tag)) {
        const moved = [...child.childNodes];
        const parent = child.parentNode;
        for (const node of moved) parent.insertBefore(node, child);
        child.remove();
        for (const node of moved) {
          if (node.nodeType === 1) visit(node);
        }
        return;
      }

      // Read before the attribute pass: a MOBI picture is
      // <img recindex="00001"> with no src, and recindex is not kept.
      const mobiRecindex = (tag === 'img' || tag === 'image') ? (child.getAttribute('recindex') || '') : '';

      // SVG images inside EPUB covers: keep the <image>, drop the wrapper.
      if (tag === 'svg') {
        const inner = child.querySelector('image, img');
        const href = inner?.getAttribute('xlink:href') || inner?.getAttribute('href') || inner?.getAttribute('src');
        const replacement = doc.createElement('img');
        const url = href && resolveSrc ? resolveSrc(href) : href;
        if (url) {
          replacement.setAttribute('src', url);
          replacement.setAttribute('alt', '');
          child.replaceWith(replacement);
        } else {
          child.remove();
        }
        return;
      }

      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        if (name === 'xlink:href' && tag === 'image') continue;
        // The reader's own converters (FB2 → HTML) mark up verse, epigraphs and
        // blank lines with `fb2-*` classes that App.css styles. A book's own
        // class names are dropped: its stylesheet is gone anyway, and a name
        // that collided with the reader's would style the app's furniture.
        if (name === 'class' && OWN_CLASS.test(attr.value)) continue;
        if (!ALLOWED_ATTRS.has(name)) child.removeAttribute(attr.name);
      }

      if (tag === 'img' || tag === 'image') {
        const raw = child.getAttribute('src') || child.getAttribute('xlink:href') || mobiRecindex;
        const url = raw && resolveSrc ? resolveSrc(raw) : raw;
        if (!url || !isSafeUrl(url)) {
          child.remove();
          return;
        }
        child.setAttribute('src', url);
        child.removeAttribute('width');
        child.removeAttribute('height');
      }

      if (tag === 'a') {
        const href = child.getAttribute('href') || '';
        if (!isSafeUrl(href)) {
          child.removeAttribute('href');
        } else if (/^(https?:|mailto:)/i.test(href)) {
          child.setAttribute('data-external', href);
          child.removeAttribute('href');
        } else {
          const target = linkTarget ? linkTarget(href) : null;
          if (target) {
            child.setAttribute('data-section', String(target.section));
            if (target.anchor) child.setAttribute('data-anchor', target.anchor);
          }
          child.removeAttribute('href');
        }
      }

      if (/^h[1-6]$/.test(tag)) {
        const text = (child.textContent || '').trim();
        if (text) {
          const id = child.getAttribute('id') || `ebk-h${++headingSeq}`;
          child.setAttribute('id', id);
          headings.push({ id, level: Number(tag[1]), text: text.slice(0, 160) });
        }
      }

      walk(child);
  };

  const walk = (node) => {
    // A live NodeList shifts under a walk that removes nodes.
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; }     // comment
      if (child.nodeType !== 1) continue;                          // text stays
      visit(child);
    }
  };

  walk(body);

  const title = (doc.querySelector('title')?.textContent || headings[0]?.text || '').trim();
  return {
    html: body.innerHTML,
    title,
    headings,
    text: (body.textContent || '').replace(/\s+/g, ' ').trim(),
  };
}

/** The text of one parsed document, with block elements kept apart. */
function textOf(doc) {
  const body = doc.body || doc.documentElement;
  if (!body) return '';
  for (const el of body.querySelectorAll('script, style')) el.remove();
  // Block elements should not run their text together.
  for (const el of body.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6, tr')) {
    el.insertAdjacentText?.('afterend', '\n');
  }
  return (body.textContent || '').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Plain text of a chapter, used by search, by "copy chapter", by exporting and
 * by counting the pages of a book.
 *
 * The markup may be a fragment the sanitiser produced or a whole document
 * straight out of a book, and the two have to be parsed differently. A full
 * XHTML document read as HTML can come out with an **empty body**: the HTML
 * parser is lenient about the head of a file that was never written for it, and
 * one element left open in there swallows the rest of the file. A real EPUB did
 * exactly that — no search hits anywhere in it, nothing in an export of it, and
 * nothing to count its pages with — while its chapters showed on screen
 * perfectly well, because the reading path parses them as XML.
 *
 * So the markup decides which parser to try first, and if one comes back with
 * nothing while the document plainly has text in it, the other one is tried.
 */
export function htmlToText(markup) {
  const source = String(markup ?? '');
  if (!source.trim()) return '';
  const looksXml = /^\s*<\?xml/i.test(source) || /<html[^>]*\sxmlns\s*=/i.test(source);
  const mimes = looksXml
    ? ['application/xhtml+xml', 'text/html']
    : ['text/html', 'application/xhtml+xml'];

  for (const mime of mimes) {
    try {
      const doc = parseDocument(source, mime);
      const text = textOf(doc);
      if (text) return text;
      // Nothing in the body, but something in the document: this parser has put
      // the text somewhere a reader would never look. Let the other one try.
      if (!(doc.documentElement?.textContent || '').trim()) return '';
    } catch { /* try the other way, and then the tags-stripped fallback */ }
  }
  return source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wraps plain text as paragraphs, keeping blank-line breaks. */
export function textToHtml(text) {
  const chunks = String(text ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p>${escapeHtml(chunk).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export { VOID_TAGS };
