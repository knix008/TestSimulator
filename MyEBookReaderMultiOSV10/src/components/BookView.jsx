import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { markHtml } from '../lib/search.js';
import { highlightCss } from '../lib/library.js';
import {
  computePageScale, readingStyle, columnPageAt, columnPageCount, normalizeRotation,
  viewLayoutOf, effectiveZoomMode, textColumnsOf, screenColumnsOf,
  ebookSheet, ebookFitScale, spreadTurnTarget, pageChoiceOf,
} from '../lib/view.js';
import { chapterFrame, freezePage, visibleClip } from '../lib/freezePage.js';

// The reading pane.
//
// Three kinds of content reach it and each is laid out differently:
//   • reflowable HTML (EPUB, MOBI, FB2, Markdown, HTML, text) — the chapter is
//     poured into a column whose width, font, line height and alignment come
//     from the reading settings, either scrolling continuously or paginated with
//     CSS columns;
//   • pictures — a comic page, or a photo, scan or DICOM image;
//   • PDF pages — painted by pdf.js, with their selectable text layer on top.
//
// The last two are fixed-layout and can be shown one page at a time or as a
// two-page spread, and turning a page runs the chosen page-turn effect.
//
// Everything the reader marks (highlights, notes, search hits) is painted by
// wrapping occurrences of the marked text in the rendered HTML. Reflowed text
// has no stable coordinates — the same passage lands somewhere else at a
// different font size — so a mark has to be anchored to the words themselves.

const HIGHLIGHT_ATTR = 'data-highlight';
// Long enough to be seen — a turn that is over in a blink reads as a flicker
// rather than as a page turning. The same length as MyPDFViewer's leaf, and
// kept in step with --turn-ms in the CSS.
const TURN_MS = 640;

/**
 * The page already on screen, held as the lines that were painted there.
 *
 * The leaf is those lines. It is not the chapter poured out again: that
 * breaks the lines again, and the page the reader is looking at changes
 * before it has turned. A page that could not be measured falls back to the
 * chapter node itself.
 */
function FrozenPaint({ frozen, shift = 0 }) {
  if (!frozen?.pieces?.length) return null;
  return (
    <div
      className="frozen-page"
      data-testid="frozen-page"
      style={shift ? { transform: `translate(${-shift}px, 0)` } : undefined}
    >
      {frozen.pieces.map((piece, i) => (
        piece.kind === 'img'
          ? (
            <img
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              alt=""
              src={piece.src}
              draggable={false}
              style={{
                left: piece.left,
                top: piece.top,
                width: piece.width,
                height: piece.height,
              }}
            />
          )
          : (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className="frozen-bit"
              style={{
                left: piece.left,
                top: piece.top,
                height: piece.height,
                color: piece.color,
                font: piece.font,
                letterSpacing: piece.letterSpacing,
                background: piece.background,
                lineHeight: `${piece.height}px`,
              }}
            >
              {piece.text}
            </span>
          )
      ))}
    </div>
  );
}

/** The column box the page underneath is poured into, the same one the chapter already has. */
function framedStyle(frame, fallbackWidth) {
  if (!frame) return { width: fallbackWidth ? `${fallbackWidth}px` : undefined };
  const columnWidth = frame.columnWidth
    && frame.columnWidth !== 'auto'
    && frame.columnWidth !== '0px'
    ? frame.columnWidth
    : undefined;
  return {
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    boxSizing: 'border-box',
    ...(columnWidth ? { columnWidth } : {}),
    ...(frame.columnGap ? { columnGap: frame.columnGap } : {}),
    ...(frame.columnFill ? { columnFill: frame.columnFill } : {}),
  };
}

/**
 * The page being landed on. It is drawn under the leaf, and only there: the
 * page being left is the paint already on screen, not this.
 */
function LeavingChapter({ node, markup, style }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    if (node) {
      const copy = node.cloneNode(true);
      const kids = copy.nodeName === 'ARTICLE' ? [...copy.childNodes] : [copy];
      host.replaceChildren(...kids);
      return;
    }
    host.innerHTML = markup || '';
  }, [node, markup]);
  return <article ref={ref} className="chapter leaving" style={style} />;
}
// How long after the animation *should* have finished the turn is torn down
// anyway. Only a browser that never reports the end of an animation — or one
// that never started it — ever gets this far.
const TURN_GRACE = 400;

/** How long a selection has to hold still before the rest of the app hears. */
export const SELECTION_SETTLE = 120;

// What the page furniture costs a fixed-layout page: the padding of the pane it
// sits in, left and right, and the same again top and bottom with a little room
// for its shadow. Taken off the pane before a page is fitted to it, which is why
// "fit the page" leaves the whole page visible instead of its edges cut off.
export const PAGE_PAD_X = 88;
export const PAGE_PAD_Y = 64;

// How far a wheel has to travel before it turns a page, and how long a turn
// then ignores the rest of the gesture. One notch of a mouse wheel is about 100
// and a trackpad flick is hundreds spread over many events — so the first number
// keeps a nudge from turning a page, and the second keeps one flick from turning
// a dozen.
export const WHEEL_TO_TURN = 60;
export const WHEEL_SETTLE = 320;

// How many pages either side of the one being read are actually drawn in a
// continuous run. The rest hold their place open without being painted, which is
// what lets a thousand-page PDF be scrolled at all.
export const FLOW_WINDOW = 2;

/**
 * Where a column page of a chapter begins.
 *
 * Every page but the last starts a whole page along. The page is the sheet,
 * which sits inside the pane's margin, so the step is that sheet and not the
 * whole pane: stepping by the pane would land in the margin. The last page
 * starts where the pane can actually reach, which is short of a whole step
 * when there is nothing beyond the end of the chapter to scroll into.
 */
export function sheetWidth(el) {
  if (!el) return 0;
  const pad = (side) => {
    const value = parseFloat(getComputedStyle(el).getPropertyValue(side));
    return Number.isFinite(value) ? value : 0;
  };
  return Math.max(0, (el.clientWidth || 0) - pad('padding-left') - pad('padding-right'));
}

export function columnLeft(el, page, step) {
  const sheet = sheetWidth(el);
  const width = step > 0 ? step : sheet;
  const limit = Math.max(0, (el?.scrollWidth || 0) - (el?.clientWidth || 0));
  return Math.max(0, Math.min(page * width, limit));
}

/** How wide one column of a reflowable chapter is.
 *
 * Two facing pages share the sheet, so each of them is half of it. One page —
 * including a page split into two columns — is the whole sheet. A turn in
 * two-page view moves two of these columns; see {@link spreadTurnTarget}. */
export function pageStep(el, layout) {
  const sheet = sheetWidth(el);
  if (layout === 'double' && sheet > 0) return sheet / 2;
  return sheet;
}

/** Wraps every occurrence of each mark's text so it can be painted. */
export function paintMarks(html, marks) {
  let out = String(html || '');
  for (const mark of marks || []) {
    const needle = String(mark.text || '').trim();
    if (needle.length < 2) continue;
    out = wrapFirst(out, needle, mark);
  }
  return out;
}

// The handful of named entities that actually turn up in a book, plus the
// numeric forms. Anything else is left as it stands, which only costs that one
// character its chance to match.
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', shy: '­',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', middot: '·', bull: '•',
};

function decodeEntity(body) {
  if (!body) return null;
  if (body[0] === '#') {
    const code = body[1] === 'x' || body[1] === 'X'
      ? parseInt(body.slice(2), 16)
      : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code <= 0) return null;
    try { return String.fromCodePoint(code); } catch { return null; }
  }
  return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : null;
}

/**
 * The markup flattened the way the browser reads it, with every character
 * mapped back to where it came from.
 *
 * A highlight is a plain string taken from the reader's selection: it has no
 * tags in it, its entities are already characters, and the line breaks and
 * indentation of the source have become single spaces. Looking for that string
 * in the markup verbatim therefore missed most real highlights — any passage
 * that ran through an `<em>`, over a source line break or past an `&amp;`.
 * Flattening first and mapping back is what makes those match.
 */
export function flattenHtml(html) {
  const source = String(html);
  const chars = [];
  const from = [];
  const to = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '<') {
      const close = source.indexOf('>', i);
      i = close === -1 ? source.length : close + 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') {
      let j = i;
      while (j < source.length && /\s/.test(source[j])) j += 1;
      // A run of whitespace is one space — and none at all at the very start,
      // where the browser shows nothing either.
      if (chars.length) { chars.push(' '); from.push(i); to.push(j); }
      i = j;
      continue;
    }
    if (ch === '&') {
      const semi = source.indexOf(';', i);
      if (semi !== -1 && semi - i <= 12) {
        const decoded = decodeEntity(source.slice(i + 1, semi));
        if (decoded !== null) {
          for (const piece of decoded) { chars.push(piece); from.push(i); to.push(semi + 1); }
          i = semi + 1;
          continue;
        }
      }
    }
    chars.push(ch);
    from.push(i);
    to.push(i + 1);
    i += 1;
  }
  return { text: chars.join(''), from, to };
}

// Wraps the first occurrence outside of any tag. Only the first: a highlight is
// one passage, and painting every repetition of a common phrase would be wrong.
function wrapFirst(html, needle, mark) {
  const source = String(html);
  const flat = flattenHtml(source);
  const target = needle.replace(/\s+/g, ' ').trim().toLowerCase();
  if (target.length < 2) return source;
  const at = flat.text.toLowerCase().indexOf(target);
  if (at < 0) return source;
  return wrapRange(source, flat.from[at], flat.to[at + target.length - 1], mark);
}

/**
 * Paints one stretch of the markup.
 *
 * The stretch may run through tags — a highlight that starts in the middle of a
 * sentence and ends inside an `<em>` is ordinary. One span around the whole of
 * it would cross the `<em>` and tear the markup, so each run of text inside the
 * stretch gets its own span and the tags between them are left where they are.
 */
function wrapRange(html, start, end, mark) {
  const tag = mark.kind === 'note' ? 'note' : 'highlight';
  const open = `<span class="mark mark-${tag}" ${HIGHLIGHT_ATTR}="${mark.id}" style="background:${highlightCss(mark.color)}">`;
  let stop = end;
  let out = '';
  let runStart = start;
  let i = start;
  const flush = (upto) => {
    if (upto > runStart) out += open + html.slice(runStart, upto) + '</span>';
  };
  while (i < stop) {
    if (html[i] !== '<') { i += 1; continue; }
    flush(i);
    const close = html.indexOf('>', i);
    const next = close === -1 ? html.length : close + 1;
    out += html.slice(i, next);
    i = next;
    // A tag is never cut in half, even if the stretch ended inside one.
    if (i > stop) stop = i;
    runStart = i;
  }
  flush(stop);
  return html.slice(0, start) + out + html.slice(stop);
}

/**
 * One PDF page: its canvas and the invisible text layer that makes the words
 * selectable. Each page renders itself, which is what lets a two-page spread be
 * two of these side by side.
 */
export function PdfPage({ doc, page, zoomMode, zoom, rotation, room, onScale, onSize, onPainted, onError, onRegions }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  // The viewport the canvas was last painted with, so a text layer can be built
  // to match it without working the size out again.
  const paintedRef = useRef(null);
  // The paint that is in flight on this canvas, if any.
  //
  // The canvas stays where it is and is repainted for each page, rather than
  // being thrown away — which is what stopped the page blanking on every turn.
  // But pdf.js refuses to paint a canvas it is already painting, and that
  // refusal came back as a rejected render: the page kept the pixels of an
  // earlier one and, worse, never got its text layer, so there was nothing on it
  // to select. Cancelling the paint in flight and *waiting for it to let go*
  // before starting the next one is what makes repainting one canvas safe.
  const paintRef = useRef(null);
  // Where the next zoom or the next page is drawn, so the canvas on screen
  // is not cleared while that paint is still going.
  const scratchRef = useRef(null);

  useEffect(() => {
    if (!doc || !canvasRef.current) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const { renderPage, renderTextLayer } = await import('../lib/pdf.js');
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;

        if (paintRef.current) {
          const paint = paintRef.current;
          paintRef.current = null;
          try { paint.cancel(); } catch { /* already finished */ }
          try { await paint.promise; } catch { /* cancelling is how it ends */ }
        }
        if (cancelled) return;

        const base = pdfPage.getViewport({ scale: 1 });
        // `room` is what one page has to itself — the pane less its padding,
        // halved for a spread — so the fitting needs no padding of its own.
        const wanted = computePageScale({
          pageSize: { width: base.width, height: base.height },
          viewport: room,
          zoomMode,
          zoom,
          rotation,
          padX: 0,
          padY: 0,
        });
        // Painted off the page the reader is looking at. Putting the next
        // zoom or the next page straight onto that canvas clears it first,
        // so the page went blank and was drawn again before a turn had
        // anything to cover — the refresh, and then the effect. The canvas
        // on screen keeps the page already there until the new one is
        // finished, and then takes it in one step.
        if (!scratchRef.current) scratchRef.current = document.createElement('canvas');
        const scratch = scratchRef.current;
        const painted = await renderPage({ page: pdfPage, canvas: scratch, scale: wanted, rotation });
        paintRef.current = painted.task;
        try {
          await painted.task.promise;
        } finally {
          if (paintRef.current === painted.task) paintRef.current = null;
        }
        if (cancelled || !canvasRef.current) return;
        const live = canvasRef.current;
        live.width = scratch.width;
        live.height = scratch.height;
        live.style.width = scratch.style.width;
        live.style.height = scratch.style.height;
        try {
          live.getContext('2d', { alpha: false })?.drawImage(scratch, 0, 0);
        } catch { /* a canvas that cannot be copied keeps what it had */ }
        // What the page on screen was just painted with. A paint that was
        // overtaken never gets this far, so the text layer is not built for
        // a picture the reader never saw.
        paintedRef.current = painted.viewport;
        if (onPainted) {
          let shot = '';
          try { shot = canvasRef.current.toDataURL('image/png'); } catch { shot = ''; }
          if (shot) onPainted(shot);
        }
        onScale?.(wanted);
        onSize?.({ width: painted.width, height: painted.height });
        // Where the pictures on this page are, in the coordinates it was
        // just painted in. A PDF page is one canvas, so without this there
        // is nothing on the page for a reader to point at.
        if (onRegions) {
          try {
            const { getPageImageRegions } = await import('../lib/pdf.js');
            const found = await getPageImageRegions(pdfPage, painted.viewport);
            if (!cancelled) onRegions(found);
          } catch { if (!cancelled) onRegions([]); }
        }
        if (textLayerRef.current) {
          const { hasSelectableText } = await import('../lib/pdf.js');
          // Up to three goes at it. A page really can have no words on it — a
          // scan, a picture — but a page that has none because its render was
          // overtaken is a page with nothing to select for as long as the reader
          // stays on it, and nothing else would ever come back to it.
          for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
            try {
              await renderTextLayer({
                page: pdfPage,
                container: textLayerRef.current,
                viewport: painted.viewport,
                isCancelled: () => cancelled,
              });
            } catch (err) {
              if (cancelled || attempt === 2) throw err;
            }
            if (cancelled || hasSelectableText(textLayerRef.current)) break;
          }
        }
      } catch (err) {
        if (cancelled || err?.name === 'RenderingCancelledException') return;
        // Said out loud as well as shown: a page that fails to paint is worth
        // finding in a log, and the dialog the reader sees is a separate window.
        // eslint-disable-next-line no-console
        console.warn(`[pdf] page ${page} was not painted: ${err?.name || 'Error'}: ${err?.message || err}`);
        onError?.(err, 'render');
      }
    })();

    return () => {
      cancelled = true;
      try { paintRef.current?.cancel(); } catch { /* already finished */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, zoomMode, zoom, rotation, room.width, room.height]);

  // No size of its own. The canvas keeps the size and the pixels of the page it
  // last painted until it has painted the next one, so the page it sits in needs
  // nothing held open for it — and a box that disagreed with the canvas by a
  // pixel was itself a shake, once when the canvas grew into it and again when
  // the box caught up.
  // ── A last look at the text layer ───────────────────────
  //
  // Whatever happened above, a page must not be left with no words on it. A
  // paint that is overtaken is abandoned half way through by design — that is
  // what stops a stale page being drawn — and the reader is left on a page whose
  // text cannot be selected, with nothing in the app that would ever come back
  // to it. Chasing every way that can happen is a losing game; noticing that it
  // has happened is not. This costs nothing when the layer is fine.
  useEffect(() => {
    if (!doc) return undefined;
    let stop = false;
    const timer = setTimeout(async () => {
      const container = textLayerRef.current;
      if (stop || !container || container.childElementCount) return;
      try {
        const { renderTextLayer } = await import('../lib/pdf.js');
        const pdfPage = await doc.getPage(page);
        if (stop) return;
        // Whatever the page was last painted with. When *no* paint ever
        // finished there is nothing recorded, so the size is worked out the
        // same way the painting would have — otherwise the one case this is
        // here for, a page whose every paint was abandoned, is the one case it
        // would not help.
        const viewport = paintedRef.current || pdfPage.getViewport({
          scale: computePageScale({
            pageSize: (() => {
              const base = pdfPage.getViewport({ scale: 1 });
              return { width: base.width, height: base.height };
            })(),
            viewport: room,
            zoomMode,
            zoom,
            rotation,
            padX: 0,
            padY: 0,
          }),
          rotation: (pdfPage.rotate + rotation) % 360,
        });
        if (stop) return;
        await renderTextLayer({ page: pdfPage, container, viewport, isCancelled: () => stop });
      } catch { /* there is nothing further to try */ }
    }, 500);
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, zoomMode, zoom, rotation, room.width, room.height]);

  return (
    <div className="pdf-page" data-page={page}>
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textLayerRef} className="textLayer" />
      {/* One box per picture the page paints, over the canvas and under
          the words. They take no pointer events of their own — the pane
          hit-tests the click against the same rectangles — so pointing at
          a picture never costs the reader a text selection. */}
      <div className="pdf-figures" aria-hidden="true" />
    </div>
  );
}

/**
 * One DjVu page: the decoded picture, and the file's own text layer over it
 * when the page was scanned with words. It paints the same way a PDF page
 * does — off to the side, then onto the canvas in one step — so a turn does
 * not blank the page that is already there.
 */
export function DjvuPage({ doc, page, zoomMode, zoom, rotation, room, onScale, onSize, onPainted, onError }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const scratchRef = useRef(null);

  useEffect(() => {
    if (!doc || !canvasRef.current) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { djvuPageSize, djvuFitScale, paintDjvuPage } = await import('../lib/djvu.js');
        if (cancelled) return;
        const size = djvuPageSize(doc, page);
        const wanted = djvuFitScale(size, { room, zoomMode, zoom, rotation });
        if (!scratchRef.current) scratchRef.current = document.createElement('canvas');
        const painted = await paintDjvuPage({
          doc,
          pageNumber: page,
          canvas: scratchRef.current,
          scale: wanted,
          rotation,
          dpr: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1,
        });
        if (cancelled || !canvasRef.current) return;
        const live = canvasRef.current;
        const scratch = scratchRef.current;
        live.width = scratch.width;
        live.height = scratch.height;
        live.style.width = scratch.style.width;
        live.style.height = scratch.style.height;
        try {
          live.getContext('2d', { alpha: false })?.drawImage(scratch, 0, 0);
        } catch { /* a canvas that cannot be copied keeps what it had */ }
        const layer = textLayerRef.current;
        if (layer) {
          layer.replaceChildren();
          for (const zone of painted.zones) {
            const word = zone.t || '';
            if (!word) continue;
            const span = document.createElement('span');
            span.textContent = word;
            span.style.left = `${zone.x}px`;
            span.style.top = `${zone.y}px`;
            span.style.fontSize = `${Math.max(1, Math.round(zone.h || 0))}px`;
            layer.appendChild(span);
          }
        }
        onScale?.(wanted);
        onSize?.({ width: painted.width, height: painted.height });
        if (onPainted) {
          let shot = '';
          try { shot = live.toDataURL('image/png'); } catch { shot = ''; }
          if (shot) onPainted(shot);
        }
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn(`[djvu] page ${page} was not painted: ${err?.name || 'Error'}: ${err?.message || err}`);
        onError?.(err, 'render');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, zoomMode, zoom, rotation, room.width, room.height]);

  return (
    <div className="pdf-page djvu-page" data-page={page}>
      <canvas ref={canvasRef} className="pdf-canvas djvu-canvas" />
      <div ref={textLayerRef} className="textLayer" />
    </div>
  );
}

/**
 * What is worth saying about a picture that has just been picked: its own pixel
 * size, and what it is — a page of a comic, a PDF page, or a picture inside the
 * text. The reading pane hands this up so the status bar can say plainly that a
 * picture is selected, rather than leaving an outline to be noticed.
 */
export function describeImage(node) {
  if (!node) return null;
  if (node.tagName === 'CANVAS') {
    const host = node.closest?.('.djvu-page') || node.closest?.('.pdf-page');
    const page = host?.getAttribute?.('data-page') || '';
    return {
      kind: host?.classList?.contains('djvu-page') ? 'djvu' : 'pdf',
      page: Number(page) || 0,
      name: page ? `${page}` : '',
      width: node.width || 0,
      height: node.height || 0,
    };
  }
  const src = node.getAttribute?.('src') || '';
  const inText = !!node.closest?.('.chapter');
  return {
    kind: inText ? 'figure' : 'page',
    page: 0,
    name: node.getAttribute?.('alt') || src.split('/').pop()?.split('?')[0] || '',
    width: node.naturalWidth || node.width || 0,
    height: node.naturalHeight || node.height || 0,
  };
}

/**
 * One page of a comic, or a picture.
 *
 * It holds its own pixel size because it is the only thing that knows it: a
 * comic's pages are not all the same shape, and fitting page 7 to the window
 * with page 6's proportions is how a page ends up cut off or adrift. `styleFor`
 * turns a size into the width and height it should be drawn at.
 */
export function PicturePage({ src, alt, className, styleFor, onMeasure, onError, imgRef }) {
  const [size, setSize] = useState(null);
  // A new picture in the same element means the size that was measured belongs
  // to the previous one.
  useEffect(() => { setSize(null); }, [src]);

  const measure = (e) => {
    const image = e.currentTarget;
    if (!image?.naturalWidth) return;
    setSize({ width: image.naturalWidth, height: image.naturalHeight });
    onMeasure?.({ width: image.naturalWidth, height: image.naturalHeight }, image);
  };

  const { frame, image } = styleFor(size);
  // A page that has been turned needs the room the turned page takes, not the
  // room the picture takes: the frame is that room, and the picture is centred in
  // it and rotated about its own middle.
  //
  // The frame is always there, even before the picture has decoded and there is
  // no size to give it. Adding it once the size was known changed the shape of
  // the DOM, so React threw the picture away and built a new one — which fetched
  // and decoded the page a second time, and showed as a blink.
  return (
    <span className={`page-frame${frame ? ' sized' : ''}`} style={frame || undefined}>
      <img
        ref={imgRef}
        className={className}
        src={src || ''}
        alt={alt || ''}
        style={image}
        onLoad={measure}
        onError={() => onError?.(new Error(`The page image "${src || ''}" could not be decoded.`), 'render')}
      />
    </span>
  );
}

const BookView = forwardRef(function BookView({
  book, section, content, settings, marks, searchQuery, activeHit,
  onSelectionChange, onContextMenu, onFollowLink, onOpenExternal, onProgress,
  onZoomStep, onTextStep, onError, onPageInfo, onScaleChange, onPickImage, onGoToPage, onTurnPage, emptyState,
}, ref) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const imageRef = useRef(null);
  // The picture the reader last pointed at, so "copy picture" copies that one
  // rather than guessing. Cleared when it leaves the document.
  const pickedImageRef = useRef(null);
  const [pickedImage, setPickedImage] = useState(null);
  const [pickedBox, setPickedBox] = useState(null);
  // Where the pictures of the PDF page on screen are, in the coordinates it
  // was painted in. A PDF page is one canvas: without these there is nothing
  // for the reader to point at, so a picture could be neither framed nor
  // copied on its own — "copy picture" took the whole page.
  const [figures, setFigures] = useState([]);
  // The crop, fetched with the PDF engine rather than imported beside it:
  // a plain import of anything in lib/pdf.js pulls the whole of pdfjs-dist
  // into the main bundle, which is what the reading pane loads lazily.
  const cropRef = useRef(null);
  const [hoverFigure, setHoverFigure] = useState(null);
  const [pickedFigure, setPickedFigure] = useState(null);
  // The rectangle the reader is dragging, and the one they settled on, both in
  // the pane's own coordinates. Only a page that is already a picture can have
  // a piece cut out of it, so this is for PDFs, comics and picture files.
  const [region, setRegion] = useState(null);
  const regionFrom = useRef(null);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // How far the fixed ebook page is enlarged to fit the window. The page
  // itself stays one size; only this factor follows the window.
  const [fitScale, setFitScale] = useState(1);
  const [columnPages, setColumnPages] = useState(1);
  const [columnPage, setColumnPage] = useState(0);
  // The column a turn is heading for. A click can arrive before React has
  // committed the last one, and reading the state then turned every click into
  // the same page — the spread jumped, and the leaf came down on a page that
  // had already changed.
  const pendingColumn = useRef(null);
  // Set while a turn is the thing moving the pane, so the scroll that follows
  // is not taken for the reader dragging the scrollbar.
  const ownColumnScroll = useRef(false);
  const [turn, setTurn] = useState(null);
  // A still copy of the chapter the reader was on, kept on screen for the
  // length of the turn. See `hold` below.
  //
  const [hold, setHold] = useState(null);
  // When the turn is over, whichever of the two set it going.
  const turnTimer = useRef(0);
  // Set by an intentional page turn, before the pane moves. A scrollbar drag
  // changes the column too, and that is scrolling, not a page being turned —
  // so only a turn that came through here gets a leaf.
  const pageTurnIntent = useRef(null);
  // Where an animated turn will put the live chapter, once the leaf that
  // covers it is actually in the document. Scrolling first is the refresh
  // the reader sees before the page has started to turn — and the same
  // thing at any zoom, because the enlarged page is the one that jumps.
  const revealLeft = useRef(null);
  // A leaf is on the book. A zoom that arrives while it is must not scroll
  // the live page out from under it.
  const leafOn = useRef(false);
  // The text size and the page zoom last seen by the turn. A change of
  // either one reflows the page; it must not be taken for a page turn.
  const layoutSeen = useRef(null);
  // The reading style last painted. A turn keeps it on the page being left,
  // so a zoom that arrives with the turn does not redraw that page first.
  const readStyle = useRef(null);
  // The whole pane's style, for the same reason: until the leaf is up, the
  // page on screen stays the one the reader is looking at.
  const shownStyle = useRef(null);
  // The copy that turns. It has to be pinned to the page on screen: the pane
  // scrolls, and a layer glued to its corner sits at the start of the chapter.
  const turnLayerRef = useRef(null);
  // The picture's own pixel size, learnt when it decodes. Until it is known a
  // page can only be fitted to the window; once it is known every zoom is in
  // terms of the real picture, which is what "100%" has to mean.
  const [natural, setNatural] = useState(null);
  // How big a page came out, so the pages that are not drawn yet can hold open
  // the right amount of room in a continuous run.
  const [slotSize, setSlotSize] = useState(null);

  const reflowable = !!book && book.reflowable;
  // Nothing is guessed while a section is still loading: rendering an <img>
  // with no source at that moment reported a broken page to the reader. Once
  // content is here, HTML is the safe default — every reflowable reader returns
  // markup, and only pictures and PDFs say otherwise.
  const kind = content ? (content.kind || 'html') : null;
  // One layout for every format: a single page, two facing pages, or a run to
  // scroll. A continuous run is scrolling, so there is no page to turn.
  const layout = viewLayoutOf(settings, book);
  // Two columns are one page of a reflowable book. Two-page view shows two
  // facing pages, each a single column, and a continuous run stays one column.
  // A PDF page does not reflow.
  const textColumns = reflowable ? textColumnsOf(settings) : 1;
  const screenColumns = reflowable ? screenColumnsOf(settings, layout) : 1;
  const onePage = layout !== 'continuous';
  const paged = reflowable && onePage;
  const flow = !reflowable && !!kind && layout === 'continuous';
  const spread = !reflowable && layout === 'double';
  const zoomMode = effectiveZoomMode(settings, layout);
  // How many pages are drawn beside each other: a spread is two, and the last
  // page of an odd book is still one.
  const across = spread ? 2 : 1;

  // ── Measure the pane ────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    // Only when it has really changed. Handing back a fresh object every time
    // the observer fired re-rendered the pane for nothing — and a page fitted to
    // the pane can make the scrollbar come and go, which fires the observer
    // again, so "for nothing" became a loop. Each of those renders cancelled the
    // PDF page's render, and a page whose text layer was cancelled part way
    // through had no selectable text at all until something else disturbed it.
    const stage = el.closest('.reflow-stage');
    const padOf = (node) => (side) => {
      const value = parseFloat(getComputedStyle(node).getPropertyValue(side));
      return Number.isFinite(value) ? value : 0;
    };
    const measure = () => {
      // A reflowable page has its own size. The window only decides how far
      // that page is enlarged. The pane's own width is the page, and it does
      // not change when the window does, so the chapter is not poured again.
      if (stage && reflowable && paged) {
        const pad = padOf(stage);
        const room = {
          width: Math.max(0, stage.clientWidth - pad('padding-left') - pad('padding-right')),
          height: Math.max(0, stage.clientHeight - pad('padding-top') - pad('padding-bottom')),
        };
        const next = ebookFitScale(ebookSheet(layout, pageChoiceOf(settings)), room);
        setFitScale((was) => (Math.abs(was - next) < 0.002 ? was : next));
      }
      // The sheet is the page. The pane's own padding is the margin around it,
      // and a column measured from the whole pane would run under that margin.
      const width = sheetWidth(el);
      const padY = ['padding-top', 'padding-bottom'].reduce((sum, side) => {
        const value = parseFloat(getComputedStyle(el).getPropertyValue(side));
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      const height = Math.max(0, (el.clientHeight || 0) - padY);
      setViewport((was) => (
        was.width === width && was.height === height ? was : { width, height }
      ));
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    // The margin lives on the frame around the sheet. Watching that frame is
    // what keeps the page fitted when the window is what changed size.
    if (stage) observer?.observe(stage);
    else if (el.parentElement?.classList.contains('reflow-stage')) observer?.observe(el.parentElement);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // Paged and continuous are different elements. The observer has to be put
    // on the one that is on screen, or a resized window leaves the page at the
    // size it had in the other view.
  }, [book, paged, layout, settings.pagePreset, settings.pageWidth, settings.pageHeight]);

  // ── Fitting a fixed-layout page to the window ───────────
  //
  // The room a page has is measured rather than guessed: the pane knows its own
  // size, and a spread shares it between two pages. Everything downstream — a
  // picture's width, a PDF page's render scale, the height a page that has not
  // been drawn yet reserves in a continuous run — is worked out from this, so
  // one page and two pages, a picture and a PDF, all fit the same way.
  const measuredRoom = useMemo(() => ({
    width: viewport.width ? Math.max(40, (viewport.width - PAGE_PAD_X) / across) : 0,
    height: viewport.height ? Math.max(40, viewport.height - PAGE_PAD_Y) : 0,
  }), [viewport.width, viewport.height, across]);

  // A page is not re-fitted while it is being turned.
  //
  // Re-fitting means painting the page again at another size, and a page that is
  // repainted in the middle of a turn — or the instant one ends — is a page that
  // twitches. Nothing that happens during those few hundred milliseconds is
  // worth that: the window has not been resized, the reader has not asked for
  // another zoom, it is the turn itself disturbing the measurement.
  const heldRoom = useRef(measuredRoom);
  if (!turn) heldRoom.current = measuredRoom;
  const room = turn ? heldRoom.current : measuredRoom;

  /** The factor a page of `size` is drawn at, for the current zoom mode. */
  const factorFor = useCallback((size) => computePageScale({
    pageSize: size,
    viewport: room,
    zoomMode,
    zoom: settings.zoom,
    rotation: settings.rotation,
    padX: 0,
    padY: 0,
  }), [room, zoomMode, settings.zoom, settings.rotation]);

  // ── The HTML actually shown: content + marks + search hits ──
  const html = useMemo(() => {
    if (kind !== 'html' || !content?.html) return '';
    let out = content.html;
    const list = [
      ...(settings.showHighlights === false ? [] : (marks?.highlights || [])),
      ...(marks?.notes || []).map((note) => ({ ...note, kind: 'note' })),
    ];
    out = paintMarks(out, list);
    if (searchQuery) out = markHtml(out, searchQuery);
    return out;
  }, [kind, content, marks, searchQuery, settings.showHighlights]);

  // ── The page beside this one, when two are shown ────────
  const facing = useMemo(() => {
    if (!spread || !book || kind !== 'image') return null;
    if (section + 1 >= book.sectionCount) return null;
    try { return book.loadSection(section + 1); } catch { return null; }
  }, [spread, book, kind, section]);

  // Any page of the book, for the pages a spread or a continuous run draws
  // beside the one being read. Loading one is cheap — the bytes are already in
  // hand and the picture's URL is cached with the book — so only the pages
  // actually drawn are ever asked for.
  const pageAt = useCallback((index) => {
    if (!book) return null;
    if (content && content.index === index) return content;
    try { return book.loadSection(index); } catch { return null; }
  }, [book, content]);

  // ── The page-turning effect ─────────────────────────────
  //
  // The effect used to be restarted by giving the page a new React key, which
  // meant every turn destroyed the element and built a new one: the images were
  // fetched again and the page blinked, twice — once when the turn began and
  // once when it ended. Now the element stays where it is and the animation is
  // restarted by hand, which is what the flicker was.
  const place = `${section}:${columnPage}`;
  const previousPlace = useRef(place);
  // What is on screen now, so that when the page changes the page being left can
  // still be drawn. Updated after the turn effect below, which is what makes it
  // the *previous* page at that moment.
  const shown = useRef({ src: '', facing: '' });
  // The same thing for a chapter of text: the markup that is on screen now and
  // how wide it laid out. A chapter is replaced wholesale when the reader moves
  // to the next one, so without a copy of the old one there is nothing left to
  // show while the new one arrives — and the reader sees the new chapter first
  // and the effect afterwards, which is the complaint this answers.
  const shownChapter = useRef({ html: '', width: 0 });
  // The rectangle the page on screen occupies, remembered rather than measured
  // when the turn begins. By then the DOM already holds the page that has
  // arrived, and a picture that has not loaded yet measures as almost nothing —
  // which is how the turning leaf came out a third of the size of the page.
  const shownBox = useRef(null);

  /**
   * The pages on screen at this instant, as pictures the held layer can be
   * drawn with.
   *
   * For a picture that is simply what was being shown: `shown` is updated by an
   * effect declared *after* the turn effect, so when the turn is being set up it
   * still holds the page being turned away from.
   *
   * A PDF page is painted on a canvas, so its picture has to be taken — and the
   * moment to take it is now, here, inside the effect that sets the turn up:
   * pdf.js paints the page that has just been turned to a frame or more later, so
   * the canvas still holds the outgoing one. Taking it any later caught the page
   * before the last one, which is why every turn after the first showed the wrong
   * page or none at all.
   */
  // Puts the live chapter on the page the turn is landing on. Not while the
  // leaf is still on its way: moving it then draws the new page first and
  // turns afterwards. It moves when the turn ends, or at once when no leaf
  // is going to be drawn.
  const flushReveal = useCallback(() => {
    if (revealLeft.current == null) return;
    const dest = revealLeft.current;
    revealLeft.current = null;
    leafOn.current = false;
    const el = scrollRef.current;
    if (!el) return;
    ownColumnScroll.current = true;
    el.scrollTo({ left: dest, behavior: 'auto' });
    ownColumnScroll.current = false;
  }, []);

  /** The turn is over: the page being landed on takes the pane, and the copy comes off. */
  const endTurn = useCallback(() => {
    clearTimeout(turnTimer.current);
    flushReveal();
    setTurn(null);
    setHold(null);
  }, [flushReveal]);

  // What actually ends a turn. The sheet and the leaf carry the animation, so
  // when theirs finishes the page has arrived — however long the browser took
  // to get round to starting it.
  const onTurnEnd = useCallback((e) => {
    // The paper's shading animates too, on a face inside the sheet. Only the
    // sheet's own animation finishing means the turn is done.
    if (e.target !== e.currentTarget) return;
    endTurn();
  }, [endTurn]);

  const facesNow = useCallback(() => {
    // The page's own rectangle, which is what the turning leaf is cut to. A
    // leaf the size of the whole pane is not a page: it is the reading area
    // being swept aside, and that is what it looked like.
    const box = shownBox.current;
    if (kind !== 'pdf' && kind !== 'djvu') return { ...shown.current, box };
    const canvases = [...(scrollRef.current?.querySelectorAll('canvas.pdf-canvas') || [])];
    const snap = (node) => {
      try { return node ? node.toDataURL('image/png') : ''; } catch { return ''; }
    };
    return { src: snap(canvases[0]), facing: snap(canvases[1]), box };
  }, [kind]);
  // A layout effect, not an ordinary one, and that is the whole of it: an
  // ordinary effect runs *after* the browser has painted, so the reader saw the
  // page that had been turned to for one frame, and only then the turn — the
  // arrival first and the journey afterwards. Set up before the paint, the copy
  // of the page being left is already covering the page that has arrived.
  useLayoutEffect(() => {
    const [wasSection, wasColumn] = previousPlace.current.split(':').map(Number);
    const forward = section > wasSection || (section === wasSection && columnPage > wasColumn);
    const moved = previousPlace.current !== place;
    // A new chapter's markup follows the section. Until it is here the page on
    // screen is still the one being left, and there is nothing new for the copy
    // to cover.
    if (kind === 'html' && section !== wasSection && content?.index !== section) return undefined;
    // Moving to the next chapter changes the chapter and puts the column back
    // to the first — two changes, one turn. Remembering where the chapter is
    // *about* to settle is what makes it one: the column going back to 0 a
    // render later is then no move at all. This used to be a time window, which
    // meant a reader turning pages quickly lost the effect on every other page.
    previousPlace.current = section === wasSection ? place : `${section}:0`;
    const intent = pageTurnIntent.current;
    pageTurnIntent.current = null;
    // A resize of the type, or of a fixed page, reflows the chapter and the
    // column can change with it. That is not a page being turned. Playing the
    // turn after the letters have already been drawn again is the refresh
    // the reader sees when they zoom.
    const layoutKey = `${settings.fontScale}:${settings.zoom}:${settings.zoomMode}:${settings.pageWidth}:${settings.pageHeight}:${fitScale}`;
    const layoutChanged = layoutSeen.current != null && layoutSeen.current !== layoutKey;
    layoutSeen.current = layoutKey;
    if (!moved || settings.pageTurn === 'none' || (layoutChanged && !intent)) {
      if (!leafOn.current) flushReveal();
      return undefined;
    }
    // Coming one screen at a time is what makes a turn a turn. Read as one
    // continuous thing — a run of pages, or a chapter poured into one column —
    // the reader is scrolling, and there is no page going away to animate.
    if (!onePage) {
      if (!leafOn.current) flushReveal();
      return undefined;
    }
    // A column that moved because the reader dragged the scrollbar is still
    // scrolling. A leaf is for a turn: the next-page key, the arrows, the wheel.
    // `chapter` marks a turn that already ran out of columns. It is waiting for
    // the next chapter, and must not be read as a turn of the column still
    // on screen — a scrollbar moving afterwards would flip a page that nobody
    // turned.
    // Several clicks can land in one commit. The intent is the last of them, so
    // its column is the one just left, which may be further along than the
    // column React had last committed. It is still one turn.
    const columnTurn = kind === 'html' && section === wasSection
      && intent && !intent.chapter
      && intent.section === wasSection;
    if (kind === 'html' && section === wasSection && !columnTurn) {
      if (!leafOn.current) flushReveal();
      return undefined;
    }

    const now = Date.now();
    const faces = facesNow();
    // The back of a spread's leaf is the page it lands on: going forward, the
    // new left-hand page; going back, the new right-hand one. A picture knows
    // that page already. A PDF page is painted a moment later — see onPainted.
    let back = '';
    if (settings.pageTurn === 'flip' && kind === 'image' && faces.facing) {
      if (forward) back = content?.src || '';
      else {
        try { back = book?.loadSection?.(section + 1)?.src || ''; } catch { back = ''; }
      }
    }
    setTurn({
      dir: forward ? 'forward' : 'back',
      id: `${place}-${now}`,
      // Whether the text under the effect is a different chapter altogether.
      // Either way the live chapter stays still: a column turn has already
      // jumped to the new column, and a new chapter has been put in place of
      // the old one. The copy is what turns.
      chapter: section !== wasSection,
      // A picture of the whole of what is on screen: one page, or both pages of
      // a spread, held still while the new one comes over it.
      leaf: faces.src,
      facing: faces.facing,
      back,
      to: section,
      box: faces.box,
      paper: !faces.src,
    });

    // A chapter of text turns the same way a PDF page does, slid or flipped
    // alike: the live chapter is already the page being landed on, and a copy
    // of the page being left is what moves away over it. It has to be a copy
    // rather than the live chapter, which is as wide as all its columns
    // together: moving that threw the columns out of the window.
    if (kind === 'html' && shownChapter.current.html && (section !== wasSection || columnTurn)) {
      const el = scrollRef.current;
      const chapterChange = section !== wasSection;
      const fromHere = intent?.section === wasSection;
      const sheet = sheetWidth(el);
      // A flip turns the one leaf the reader is holding. Going forward that is
      // the right-hand page, and its back is the left-hand page of the spread
      // being landed on — two pages on, the way a printed leaf reads. A slide
      // takes the whole spread with it, both pages at once.
      const half = layout === 'double' && settings.pageTurn === 'flip';
      const arrivedLeft = el ? el.scrollLeft : 0;
      // Where the chapter being left was. A turn that ran out of columns saved
      // it before the new chapter replaced the pane; the pane's own scroll by
      // then still belongs to the chapter that was left. The new chapter is
      // put at its first column after this, or at its last when turning back.
      const carried = (columnTurn || (chapterChange && fromHere)) ? intent : null;
      let toLeft = columnTurn && Number.isFinite(carried?.toLeft) ? carried.toLeft : arrivedLeft;
      if (chapterChange) {
        toLeft = 0;
        if (!forward && landing.current === 'end' && el) {
          const step = pageStep(el, layout);
          const span = sheetWidth(el);
          const pages = span > 0 ? columnPageCount(el.scrollWidth, span, step) : 1;
          toLeft = columnLeft(el, Math.max(0, pages - 1), step);
        }
      }
      leafOn.current = true;
      setHold({
        id: `${place}-${now}`,
        dir: forward ? 'forward' : 'back',
        // The page being left, and only that. A chapter of text turns exactly
        // as a PDF page does: the leaf is the page that is going away, and
        // what it uncovers is the page that has already arrived underneath.
        // Holding the *incoming* page and turning it down over a copy of the
        // old one — which is what this did — reads as a page appearing from
        // nowhere rather than as the page in front of the reader being turned.
        html: shownChapter.current.html,
        width: shownChapter.current.width,
        // The pane is still on the column being left. It moves to the one
        // being landed on only after this leaf is in the document, so the
        // reader never sees that page drawn before the turn. A new chapter
        // is still showing the old scroll: the effect that follows puts it
        // at its first column, or its last when turning back.
        left: carried ? carried.left : arrivedLeft,
        top: carried ? carried.top : (el ? el.scrollTop : 0),
        // Where the spread being landed on starts. Inside a chapter that was
        // saved with the turn. A new chapter opens at its first column, or at
        // its last when the reader turned back into it.
        toLeft,
        // The back of a flipped leaf is the page it comes down on. Inside a
        // chapter that page is further along the same text, so it is the same
        // chapter that was already on screen. A new chapter brings its own
        // first spread, which is the one just put in the pane — taken from
        // that node, not poured out of the markup a second time.
        backHtml: chapterChange ? html : shownChapter.current.html,
        shot: carried?.shot || null,
        backShot: chapterChange
          ? (contentRef.current?.cloneNode(true) || null)
          : (carried?.shot || null),
        // The type the page being left was drawn with. The page underneath
        // takes whatever the settings are now, including a zoom that arrived
        // with the turn, and the leaf does not.
        read: carried?.read || readStyle.current || null,
        half,
        sheet,
        // The lines that were already on the page. The leaf and the half
        // that stays are these, so neither page is drawn again as the turn
        // begins. The page being landed on is drawn under them.
        frozen: carried?.frozen || null,
        frame: carried?.frame || null,
      });
    } else if (!leafOn.current) {
      // No leaf is going to cover the chapter, so the page it is heading
      // for has to be shown now rather than left waiting.
      flushReveal();
    }

    // A backstop, and only that: the turn ends when its animation does — see
    // `endTurn`. A stopwatch started here cannot be what ends it, because it
    // begins running before the turning copy is even in the document, and the
    // animation does not begin until the browser has laid that copy out. A
    // whole chapter of markup takes long enough over that to eat a third of
    // the turn, which is the effect that was over before it had played.
    //
    // The timer is held in a ref, not returned as this effect's cleanup.
    //
    // As a cleanup it was cancelled every time the effect ran again — and it
    // runs again for any of half a dozen reasons while a turn is in flight, a
    // new chapter reporting its pagination among them. The re-run then took the
    // early exit above and set no new timer, so nothing ever cleared the turn
    // and the page that was turning away stayed lying across the book.
    clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(endTurn, TURN_MS + TURN_GRACE);
    return undefined;
  }, [place, section, columnPage, settings.pageTurn, settings.fontScale, settings.zoom, settings.zoomMode, settings.pageWidth, settings.pageHeight, fitScale, onePage, facesNow, kind, layout, content, endTurn, flushReveal]);

  // Nothing is left running when the pane goes away.
  useEffect(() => () => clearTimeout(turnTimer.current), []);

  const turnClass = turn
    ? ` turning turn-${settings.pageTurn} turn-${turn.dir}${turn.chapter ? ' turn-chapter' : ''}`
    : '';

  // The chapter on screen is the one this section asked for. The section
  // changes first and the markup follows a moment later; until then the pane
  // is still showing the chapter being left, and scrolling *that* to the start
  // or the end is what left the chapter that then arrived somewhere in its
  // middle — or on a blank page, when the old offset ran past its end.
  const chapterReady = kind !== 'html' || content?.index == null || content.index === section;

  // A new chapter starts at its top — except when the reader turned back into
  // it, which opens on the last page. This runs once that chapter is actually
  // in the pane, so the leaf is pinned to the page that will be on screen. A
  // continuous run is left alone: scrolling is how its page changes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || flow || !chapterReady) return;
    if (landing.current === 'end') return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    pendingTop.current = null;
    pendingColumn.current = null;
    setColumnPage(0);
    // A page is a whole thing: arriving at a page's top *is* arriving at that
    // page, so only a chapter of text has an end to be entered at.
    if (kind !== 'html') landing.current = 'start';
  }, [section, book, flow, kind, chapterReady]);

  // ── Reflowable: report the pagination and the reading position ──
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || kind !== 'html' || !chapterReady) return;
    if (paged) {
      const span = sheetWidth(el);
      const step = pageStep(el, layout);
      const pages = columnPageCount(el.scrollWidth, span, step);
      setColumnPages(pages);
      // Turning back into a chapter arrives at its last page, not its first.
      const page = landing.current === 'end'
        ? pages - 1
        : columnPageAt(el.scrollLeft, span, el.scrollWidth, step);
      // The last page of a chapter starts less than a page from the end, because
      // there is nothing to scroll past — so it is where the pane can reach, not
      // page × width.
      if (landing.current === 'end') el.scrollLeft = columnLeft(el, page, step);
      pendingColumn.current = page;
      setColumnPage(page);
      onPageInfo?.({ pages, page, atStart: page <= 0, atEnd: page >= pages - 1 });
    } else {
      setColumnPages(1);
      pendingColumn.current = null;
      setColumnPage(0);
      const atStart = el.scrollTop <= 4 && el.scrollLeft <= 4;
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
        && el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      onPageInfo?.({ pages: 1, page: 0, atStart, atEnd });
      if (landing.current === 'end') el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    }
    landing.current = 'start';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, chapterReady, paged, viewport.width, viewport.height, settings.fontScale, settings.lineHeight, settings.readingWidth, settings.twoColumns, settings.columns, screenColumns, layout]);

  // Pin the turning copy to the page the reader is looking at. The pane is the
  // thing that scrolls, so a layer with its corner at the pane's corner is at
  // the start of the chapter — a screen or more to the left once a page has
  // been turned — and the effect plays where it cannot be seen.
  useLayoutEffect(() => {
    const layer = turnLayerRef.current;
    const el = scrollRef.current;
    if (!layer || !el) return;
    const pad = (side) => {
      const value = parseFloat(getComputedStyle(el).getPropertyValue(side));
      return Number.isFinite(value) ? value : 0;
    };
    const left = pad('padding-left');
    const top = pad('padding-top');
    const width = sheetWidth(el);
    const height = Math.max(0, (el.clientHeight || 0) - top - pad('padding-bottom'));
    layer.style.left = `${el.scrollLeft + left}px`;
    layer.style.top = `${el.scrollTop + top}px`;
    layer.style.right = 'auto';
    layer.style.bottom = 'auto';
    if (width) layer.style.width = `${width}px`;
    if (height) layer.style.height = `${height}px`;
  });

  // ── A continuous run of fixed-layout pages ──────────────
  //
  // Every page of the book has its place in the run, but only the pages near the
  // one being read are painted: the rest hold their room open with a box of the
  // right size. That is what lets a PDF of any length be read by scrolling.
  const rows = useMemo(() => {
    if (!flow || !book) return [];
    const out = [];
    for (let first = 0; first < book.sectionCount; first += across) {
      const pages = [first];
      if (across === 2 && first + 1 < book.sectionCount) pages.push(first + 1);
      out.push(pages);
    }
    return out;
  }, [flow, book, across]);

  const rowOf = useCallback((index) => (across === 2 ? Math.floor(index / 2) : index), [across]);
  const currentRow = rowOf(section);

  // How much room a page that has not been painted yet holds open. Once one page
  // has been drawn every other page is assumed to be the same size, which for a
  // book — where the pages are all the same paper — is right.
  const slotStyle = useMemo(() => {
    // Height only. A width would be a floor the pane could not shrink below,
    // and it buys nothing: the page inside is what makes the row as wide as it
    // needs to be.
    const height = slotSize?.height || room.height || 0;
    return { minHeight: height ? `${Math.round(height)}px` : undefined };
  }, [slotSize, room.height]);

  // Which page the reader is on is read back from the scrolling, and the page
  // they jumped to is scrolled to. Keeping the last value the run itself
  // reported is what tells the two apart: without it, reporting a page would
  // scroll to the top of that page and the run could never be scrolled at all.
  // Where the next section should be entered.
  //
  // Turning back has to arrive at the *end* of the previous section. Arriving at
  // its top meant that pressing "previous" again went back another section
  // straight away — the whole of the section just reached was skipped, and a
  // reader could not read backwards through a book at all.
  const landing = useRef('start');
  // The place the pane was last asked to glide to. A smooth scroll takes a
  // moment, and until it is over `scrollTop` is somewhere in the middle of it, so
  // reading the live value is how two quick presses of "next page" used to turn
  // only one page.
  const pendingTop = useRef(null);

  const flowAt = useRef(-1);
  // Where the run was last put, so that the reader's own scrolling can be told
  // from ours.
  const flowTop = useRef(0);
  useEffect(() => { flowAt.current = -1; flowTop.current = 0; }, [flow, book, across]);

  useEffect(() => {
    if (!flow) return;
    const el = scrollRef.current;
    if (!el) return;
    const jumped = flowAt.current !== section;
    // A page that has not been painted holds open the best guess there is, and
    // the guess gets better as pages are drawn — so the run is lined up again
    // once it has. Only while the reader has not scrolled themselves, though:
    // otherwise their place would be taken away from them as they read.
    if (!jumped && el.scrollTop !== flowTop.current) return;
    flowAt.current = section;
    const slot = el.querySelector(`.page-slot[data-row="${rowOf(section)}"]`);
    if (!slot) return;
    if (el.scrollTop !== slot.offsetTop) el.scrollTop = slot.offsetTop;
    flowTop.current = el.scrollTop;
  }, [flow, section, rowOf, rows.length, slotSize, room.height]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (paged) {
      const span = sheetWidth(el);
      const step = pageStep(el, layout);
      const page = columnPageAt(el.scrollLeft, span, el.scrollWidth, step);
      if (!ownColumnScroll.current) pendingColumn.current = page;
      setColumnPage(page);
      onPageInfo?.({ pages: columnPages, page, atStart: page <= 0, atEnd: page >= columnPages - 1 });
      onProgress?.(columnPages > 1 ? page / Math.max(1, columnPages - 1) : 0);
      return;
    }
    // A glide that has arrived is no longer pending.
    if (pendingTop.current != null && Math.abs(el.scrollTop - pendingTop.current) < 2) {
      pendingTop.current = null;
    }
    if (flow) {
      // The page being read is the one that has come up past the top third of
      // the pane: it is the page the reader is looking at, not the one whose
      // last line is still disappearing off the top.
      const slots = el.querySelectorAll('.page-slot');
      if (!slots.length) return;
      const line = el.scrollTop + el.clientHeight * 0.3;
      let at = 0;
      for (let i = 0; i < slots.length; i += 1) {
        if (slots[i].offsetTop <= line) at = i; else break;
      }
      const slot = slots[at];
      const first = Number(slot.getAttribute('data-first')) || 0;
      const within = slot.offsetHeight
        ? Math.min(1, Math.max(0, (el.scrollTop - slot.offsetTop) / slot.offsetHeight))
        : 0;
      onProgress?.(within);
      if (first !== flowAt.current) {
        flowAt.current = first;
        onGoToPage?.(first);
      }
      return;
    }
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    onProgress?.(Math.min(1, Math.max(0, el.scrollTop / max)));
    onPageInfo?.({
      pages: 1,
      page: 0,
      atStart: el.scrollTop <= 4 && el.scrollLeft <= 4,
      atEnd: el.scrollTop + el.clientHeight >= el.scrollHeight - 4
        && el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, [paged, flow, columnPages, onPageInfo, onProgress, onGoToPage, layout]);

  // A picture's own pixel size is only known once it has decoded. Until then it
  // is fitted with CSS bounds — which cannot overflow the window — and from then
  // on with real pixels, so that "100%" means the picture's own size and not a
  // fraction of the pane.
  const pageSize = content?.pageSize || natural;
  useEffect(() => {
    if (reflowable || kind === 'pdf' || kind === 'djvu' || !pageSize) return;
    setScale(factorFor(pageSize));
  }, [reflowable, kind, pageSize, factorFor]);

  // A new picture is a new size: what the last one measured must not be reused,
  // or a tall page would be fitted as though it were the wide one before it.
  useEffect(() => { setNatural(null); }, [content?.src, book]);

  // What the status bar shows: the size a page is actually drawn at.
  useEffect(() => {
    if (!reflowable) onScaleChange?.(scale);
  }, [reflowable, scale, onScaleChange]);

  /**
   * How a picture meets the window — the same way a PDF page does.
   *
   * `frame` is the room the page takes on the screen and `image` is the picture
   * inside it. They differ when the page has been turned on its side: a picture
   * rotated by CSS keeps the room its unturned self took, which is what used to
   * leave a turned page overlapping whatever was beside it. Turning a picture at
   * all is new — the rotation only ever reached PDF pages, and a comic, a scan or
   * a photograph ignored it.
   */
  const imageStyle = (size = pageSize) => {
    if (size?.width && room.width) {
      const factor = factorFor(size);
      const quarters = Math.round(normalizeRotation(settings.rotation) / 90) % 4;
      const turned = quarters % 2 !== 0;
      const w = Math.round(size.width * factor);
      const h = Math.round(size.height * factor);
      return {
        frame: { width: `${turned ? h : w}px`, height: `${turned ? w : h}px` },
        image: {
          width: `${w}px`,
          height: `${h}px`,
          maxWidth: 'none',
          maxHeight: 'none',
          transform: `translate(-50%, -50%) rotate(${quarters * 90}deg)`,
        },
      };
    }
    // Nothing measured yet: bounds the picture cannot overflow, so the first
    // frame after it decodes is already inside the window.
    const maxW = room.width ? `${Math.floor(room.width)}px` : '100%';
    const maxH = room.height ? `${Math.floor(room.height)}px` : 'none';
    switch (zoomMode) {
      case 'fit-width': return { frame: null, image: { width: maxW, height: 'auto', maxWidth: maxW } };
      case 'fit-height': return { frame: null, image: { height: maxH, width: 'auto', maxWidth: maxW } };
      case 'actual': return { frame: null, image: { width: 'auto', maxWidth: 'none' } };
      default: return { frame: null, image: { width: 'auto', maxWidth: maxW, maxHeight: maxH } };
    }
  };

  /** Once the page being read is decoded, its own size is known — and every zoom. */
  const onImageMeasured = useCallback((size, image) => {
    setNatural((was) => (was && was.width === size.width && was.height === size.height ? was : size));
    if (image?.clientHeight) setSlotSize({ width: image.clientWidth, height: image.clientHeight });
    const shown = image && size.width ? image.clientWidth / size.width : 0;
    if (Number.isFinite(shown) && shown > 0) setScale(shown);
  }, []);

  // ── Selecting the words of a PDF page ───────────────────
  //
  // A PDF page has no text of its own: pdf.js lays a transparent span over every
  // run of glyphs, and the browser is left to work out what a drag across them
  // means. Between two spans there is empty space, and a pointer crossing it is
  // taken by the browser to be reaching for whatever span is nearest in the
  // document order — which is how dragging over one line came to select several
  // others, or the rest of the page.
  //
  // The cure is pdf.js's own: a page-sized, unselectable block that follows the
  // end of the selection that is moving, so that empty space belongs to
  // something harmless for as long as the drag lasts. `renderTextLayer` puts the
  // block in the layer; everything that moves it is here.
  //
  // It may only be armed between a press inside a text layer and the release
  // that ends it. Armed at rest it does the opposite harm — it is the last thing
  // in the layer, so the next press in empty space hit-tests onto it and the
  // caret lands at the end of the page. And `selectionchange` fires long after a
  // drag is over (a click settling its caret, Ctrl+A, the focus moving), so
  // whether a drag is happening has to be tracked, not guessed at.
  const dragging = useRef(false);
  const prevRange = useRef(null);
  const isGecko = useRef(null);

  const parkGuard = useCallback((layer) => {
    const guard = layer.querySelector('.endOfContent');
    if (guard) {
      // A descendant search, not a child one: parking puts the block back as a
      // direct child, but arming it moves it in beside the span the selection
      // ends at, which in a tagged PDF sits inside a wrapper. A block that can
      // no longer be found is a block left covering the page.
      if (guard.parentElement !== layer || guard.nextSibling) layer.append(guard);
      if (guard.style.width) guard.style.width = '';
      if (guard.style.height) guard.style.height = '';
    }
    layer.classList.remove('selecting');
  }, []);

  const parkAllGuards = useCallback(() => {
    for (const layer of scrollRef.current?.querySelectorAll('.textLayer') || []) parkGuard(layer);
  }, [parkGuard]);

  const syncGuards = useCallback(() => {
    if (!scrollRef.current?.querySelector('.textLayer')) return;
    if (!dragging.current) { parkAllGuards(); prevRange.current = null; return; }

    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) { parkAllGuards(); prevRange.current = null; return; }

    const range = selection.getRangeAt(0);
    const previous = prevRange.current;
    // Which end of the selection is on the move: if the far end has not shifted
    // since last time, it is the near end being dragged.
    const movingStart = !!previous
      && (range.compareBoundaryPoints(Range.END_TO_END, previous) === 0
        || range.compareBoundaryPoints(Range.START_TO_END, previous) === 0);
    const node = movingStart ? range.startContainer : range.endContainer;
    const anchor = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    prevRange.current = range.cloneRange();

    // The page holding the moving end. An anchor that is the layer itself — a
    // caret resting in empty space — resolves to nothing, and that page is left
    // unarmed rather than having the block put somewhere it does not belong.
    const layer = anchor?.nodeType === Node.ELEMENT_NODE
      ? anchor.parentElement?.closest('.textLayer') || null
      : null;

    // Every other page is parked. A page left armed while its block sits at the
    // foot of it has a page-sized catch-all as its last child.
    for (const other of scrollRef.current?.querySelectorAll('.textLayer') || []) {
      if (other !== layer) parkGuard(other);
    }
    if (!layer) return;

    const guard = layer.querySelector('.endOfContent');
    if (!guard || anchor === guard || !layer.contains(anchor) || !anchor.parentElement) {
      parkGuard(layer);
      return;
    }

    // Firefox places the caret in empty space by itself, and moving the block
    // there fights it. This is pdf.js's own test for it: only Gecko reports a
    // computed value for the -moz-user-select the block's own rule sets.
    if (isGecko.current === null) {
      isGecko.current = getComputedStyle(guard).getPropertyValue('-moz-user-select') === 'none';
    }
    if (isGecko.current) { parkGuard(layer); return; }

    if (guard.style.width !== layer.style.width) guard.style.width = layer.style.width;
    if (guard.style.height !== layer.style.height) guard.style.height = layer.style.height;

    // Beside the moving end, never inside the selection — so the block adds no
    // rectangle of its own to what is painted. Moving it changes the
    // selection's own container, which fires another selectionchange, so it is
    // left alone when it already sits where it belongs.
    const inPlace = movingStart ? guard.nextSibling === anchor : anchor.nextSibling === guard;
    if (!inPlace) {
      anchor.parentElement.insertBefore(guard, movingStart ? anchor : anchor.nextSibling);
    }
    layer.classList.add('selecting');
  }, [parkAllGuards, parkGuard]);

  // A drag that ends outside the window, or is interrupted, still has to let go.
  useEffect(() => {
    const release = () => {
      if (!dragging.current) return;
      dragging.current = false;
      parkAllGuards();
    };
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
    };
  }, [parkAllGuards]);

  // ── Selection ───────────────────────────────────────────
  //
  // selectionchange fires for every pixel of a drag. Reporting each one put the
  // whole application through a render — toolbar measurement included — while
  // the reader was still dragging, which is what made selecting text feel like
  // wading. The selection is now reported once the dragging settles.
  useEffect(() => {
    let timer = 0;
    const report = () => {
      timer = 0;
      onSelectionChange?.(window.getSelection?.()?.toString() || '');
    };
    const onSelect = () => {
      // The guard has to follow the selection as it is dragged, which is now,
      // not when the reporting settles.
      syncGuards();
      if (timer) clearTimeout(timer);
      timer = setTimeout(report, SELECTION_SETTLE);
    };
    document.addEventListener('selectionchange', onSelect);
    // Letting go always reports at once, so the menus are right the moment the
    // reader reaches for them.
    document.addEventListener('mouseup', report);
    document.addEventListener('pointerup', syncGuards);
    document.addEventListener('keyup', onSelect);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelect);
      document.removeEventListener('mouseup', report);
      document.removeEventListener('pointerup', syncGuards);
      document.removeEventListener('keyup', onSelect);
    };
  }, [onSelectionChange, syncGuards]);

  // ── The wheel ───────────────────────────────────────────
  //
  // Held with Ctrl it resizes — the text of a book, the zoom of a page. On its
  // own it scrolls, which is what a wheel does. But reading one page at a time
  // there is usually nothing to scroll: the chapter is laid out in columns
  // across a pane with no vertical overflow at all, and a page fitted to the
  // window fills it exactly. A wheel that does nothing on a page reads as a
  // broken wheel, so there it turns the page instead.
  //
  // A page taller than the window still scrolls first. The wheel only turns once
  // there is no more of that page to see, which is the same rule the keyboard
  // and the arrows follow.
  const wheelRef = useRef({ amount: 0, until: 0 });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        if (reflowable) onTextStep?.(dir);
        else onZoomStep?.(dir);
        return;
      }
      // Read as one continuous thing, the wheel scrolls. That is the whole point
      // of reading it that way.
      if (!onePage) return;

      // A notch of a mouse wheel, a nudge of a trackpad and a page key all
      // arrive in different units. A notch is three lines on most mice and about
      // 120 pixels, so a line counts for forty — that way one notch is one turn
      // whichever unit the wheel reports in.
      const step = e.deltaMode === 1 ? 40 : (e.deltaMode === 2 ? el.clientHeight : 1);
      const moved = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * step;
      if (!moved) return;
      const forward = moved > 0;

      // Still page to see: let the pane scroll it the ordinary way.
      const room = el.scrollHeight - el.clientHeight;
      if (room > 2) {
        const more = forward ? el.scrollTop < room - 2 : el.scrollTop > 2;
        if (more) return;
      }

      e.preventDefault();
      const now = Date.now();
      const state = wheelRef.current;
      // A turn just happened: the rest of this flick is the same gesture, not
      // another page. Without this a trackpad goes through a chapter at once.
      if (now < state.until) return;
      // A gesture that changes direction starts again.
      if ((state.amount > 0) !== forward) state.amount = 0;
      state.amount += moved;
      if (Math.abs(state.amount) < WHEEL_TO_TURN) return;
      state.amount = 0;
      state.until = now + WHEEL_SETTLE;
      onTurnPage?.(forward ? 1 : -1);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [reflowable, onePage, onTextStep, onZoomStep, onTurnPage]);

  // ── Links inside the text ───────────────────────────────
  // Clicking a picture picks it: it is outlined, and "copy picture" then means
  // that one. Clicking anywhere else lets it go, so the next copy is about
  // whatever the reader is looking at.
  // A picture is an image the reader pointed at: one in the text, or a comic
  // page. A PDF page is the page itself. Clicking it — on the words or on the
  // blank paper — is reading, and the whole page is not outlined as a picture.
  const imageUnder = useCallback((target) => {
    const direct = target?.closest?.('img');
    if (direct) return direct;
    return null;
  }, []);

  /**
   * The picture of a PDF page under a pointer, if any.
   *
   * A PDF page is a single canvas, so there is no element to hit: the click
   * is tested against the rectangles the page's own drawing operators give
   * (see getPageImageRegions). The rectangles are in the coordinates the
   * canvas was painted in, which is also the box it is laid out at, so the
   * pointer only has to be taken into that box.
   */
  /** One figure's rectangle, in the pane's own coordinates. */
  const figureStyle = useCallback((f) => {
    const pane = scrollRef.current;
    const canvas = pane?.querySelector('canvas.pdf-canvas');
    if (!pane || !canvas) return { display: 'none' };
    const box = canvas.getBoundingClientRect();
    const room = pane.getBoundingClientRect();
    const shown = parseFloat(canvas.style.width) || box.width;
    const k = shown ? box.width / shown : 1;
    return {
      left: `${Math.round(box.left - room.left + pane.scrollLeft + f.rect.x * k)}px`,
      top: `${Math.round(box.top - room.top + pane.scrollTop + f.rect.y * k)}px`,
      width: `${Math.round(f.rect.width * k)}px`,
      height: `${Math.round(f.rect.height * k)}px`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, settings.rotation, settings.zoom, viewport.width, viewport.height]);

  const figureAt = useCallback((clientX, clientY) => {
    if (!figures.length) return null;
    const canvas = scrollRef.current?.querySelector('canvas.pdf-canvas');
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    // The canvas is drawn at its CSS size; the regions were measured at the
    // viewport's size. One ratio takes a screen point into that space.
    const shown = parseFloat(canvas.style.width) || box.width;
    const k = shown ? box.width / shown : 1;
    const x = (clientX - box.left) / k;
    const y = (clientY - box.top) / k;
    return figures.find((f) => x >= f.rect.x && x <= f.rect.x + f.rect.width
      && y >= f.rect.y && y <= f.rect.y + f.rect.height) || null;
  }, [figures]);

  /**
   * Where the picked picture sits, in the pane's own coordinates.
   *
   * A picture is a replaced element and cannot carry a label of its own, and its
   * parent is not always its own shape — a picture in a chapter sits centred in
   * a paragraph far wider than itself. So the label is drawn as a layer of the
   * pane, over the box the picture actually occupies. Those are content
   * coordinates, which do not change as the pane scrolls.
   */
  const boxOf = useCallback((node) => {
    const pane = scrollRef.current;
    if (!pane || !node) return null;
    const box = node.getBoundingClientRect();
    const room = pane.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    // getBoundingClientRect answers in screen pixels, and a reflowable page
    // is drawn scaled — it has a size of its own and the window only decides
    // how far it is enlarged. The overlay that frames the picture lives
    // inside that same scaled box, so its numbers are the pane's own
    // unscaled pixels. Mixing the two is what put the frame in the wrong
    // place, at the wrong size, on every EPUB and MOBI.
    const k = pane.offsetWidth ? (room.width / pane.offsetWidth) || 1 : 1;
    return {
      left: (box.left - room.left) / k + pane.scrollLeft,
      top: (box.top - room.top) / k + pane.scrollTop,
      width: box.width / k,
      height: box.height / k,
    };
  }, []);

  /**
   * The element a spot on a page is measured against.
   *
   * A bookmark placed by pointing has to come back to the same place at another
   * window size, another zoom, another text size — so it is kept as a fraction
   * of the thing it was placed on: the chapter for text, the page itself for a
   * PDF page or a picture.
   */
  const spotHost = useCallback(() => {
    const pane = scrollRef.current;
    if (!pane) return null;
    if (kind === 'html') return contentRef.current;
    return pane.querySelector('.page-slot.here .pdf-page, .page-slot.here .page-frame')
      || pane.querySelector('.pdf-page, .page-frame');
  }, [kind]);

  /** Marks one picture as the picked one, or lets the last one go. */
  const pick = useCallback((image) => {
    const root = scrollRef.current;
    if (image && root?.contains(image)) {
      if (pickedImageRef.current === image) return;
      for (const other of root.querySelectorAll('.picked')) other.classList.remove('picked');
      image.classList.add('picked');
      pickedImageRef.current = image;
      setPickedImage(describeImage(image));
      setPickedBox(boxOf(image));
    } else if (pickedImageRef.current) {
      pickedImageRef.current.classList?.remove('picked');
      pickedImageRef.current = null;
      setPickedImage(null);
      setPickedBox(null);
    }
  }, [boxOf]);

  // ── Bookmarks placed by pointing at a spot ──────────────
  //
  // A bookmark that was put somewhere in particular is drawn there. It is kept
  // as a fraction of the chapter or page it was placed on, so it comes back to
  // the same words at another window size or text size, and it is drawn as a
  // layer of the pane in content coordinates — which do not move as the pane
  // scrolls.
  const [spots, setSpots] = useState([]);
  const placed = useMemo(
    () => (marks?.bookmarks || []).filter((b) => b.spot && Number.isFinite(b.spot.x)),
    [marks],
  );

  useLayoutEffect(() => {
    if (!placed.length) { setSpots((was) => (was.length ? [] : was)); return; }
    const host = spotHost();
    const box = host && boxOf(host);
    if (!box) { setSpots((was) => (was.length ? [] : was)); return; }
    const next = placed.map((b) => ({
      id: b.id,
      label: b.label || '',
      left: box.left + box.width * b.spot.x,
      top: box.top + box.height * b.spot.y,
    }));
    // A mark that has not moved keeps the array it was in, so the pane is not
    // repainted for nothing.
    setSpots((was) => (was.length === next.length
      && was.every((m, i) => m.id === next[i].id
        && Math.round(m.left) === Math.round(next[i].left)
        && Math.round(m.top) === Math.round(next[i].top))
      ? was
      : next));
  }, [placed, spotHost, boxOf, html, viewport.width, viewport.height, scale, columnPage,
    settings.fontScale, settings.readingWidth, settings.zoomMode, settings.rotation]);

  /**
   * Keeps the frame on the picture it belongs to.
   *
   * The box used to be recomputed from a written-out list of settings, and
   * the frame drifted off the picture whenever something moved it that the
   * list did not happen to mention: the zoom of a fixed page, the text size
   * or page margin of a reflowable one, the scale a reflowable page is
   * fitted to the window by. Watching the picture, the chapter it sits in
   * and the pane around it answers all of those, including the ones nobody
   * has added yet.
   */
  useEffect(() => {
    const node = pickedImageRef.current;
    if (!node) return undefined;
    const update = () => setPickedBox(boxOf(node));
    update();
    if (typeof ResizeObserver !== 'function') return undefined;
    const watcher = new ResizeObserver(update);
    watcher.observe(node);
    if (scrollRef.current) watcher.observe(scrollRef.current);
    if (contentRef.current) watcher.observe(contentRef.current);
    return () => watcher.disconnect();
    // The settings are kept as well: a picture can be moved by a reflow
    // that changes nothing's size — a wider margin on the page above it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxOf, pickedImage, viewport.width, viewport.height, scale, fitScale, columnPage,
    settings.rotation, settings.zoomMode, settings.zoom, settings.fontScale,
    settings.readingWidth, settings.pageMarginX, settings.pageMarginY, html]);

  useEffect(() => {
    if ((kind !== 'pdf' && kind !== 'djvu') || cropRef.current) return;
    import('../lib/pdf.js').then((m) => { cropRef.current = m.cropCanvas; }).catch(() => {});
  }, [kind]);

  // A new page has its own pictures, so what was picked on the last one is
  // gone. A *repaint* of the same page is not that: zooming or turning the
  // page on its side measures the rectangles again, and the picture the
  // reader chose has to stay chosen — it is matched again by its id.
  useEffect(() => { setPickedFigure(null); setHoverFigure(null); }, [section]);
  useEffect(() => {
    setHoverFigure(null);
    setPickedFigure((was) => (was ? figures.find((f) => f.id === was.id) || null : null));
  }, [figures]);

  const selectMode = settings.selectMode || 'text';

  /** An <img> as a canvas, so a rectangle can be cut out of it. */
  const toCanvas = useCallback((node) => {
    const width = node.getBoundingClientRect().width;
    const height = node.getBoundingClientRect().height;
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    canvas.style.width = `${Math.round(width)}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(node, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, []);

  /** A point in the pane's own coordinates, scroll and page scale included. */
  const paneAt = useCallback((clientX, clientY) => {
    const pane = scrollRef.current;
    if (!pane) return null;
    const room = pane.getBoundingClientRect();
    const k = pane.offsetWidth ? (room.width / pane.offsetWidth) || 1 : 1;
    return {
      x: (clientX - room.left) / k + pane.scrollLeft,
      y: (clientY - room.top) / k + pane.scrollTop,
    };
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    // A press on the words of a PDF page begins a drag over them, and the guard
    // block may only be armed for as long as that drag lasts.
    if (e.target?.closest?.('.textLayer')) {
      dragging.current = true;
      prevRange.current = null;
    }
    if (selectMode === 'region') {
      const at = paneAt(e.clientX, e.clientY);
      if (at) {
        regionFrom.current = at;
        setRegion({ left: at.x, top: at.y, width: 0, height: 0 });
        e.preventDefault();
      }
      return;
    }
    pick(imageUnder(e.target));
    if (kind === 'pdf') setPickedFigure(figureAt(e.clientX, e.clientY));
  }, [imageUnder, pick, kind, figureAt, selectMode, paneAt]);

  // Hovering a picture of a PDF page outlines it, so the reader can see
  // there is something there to take before they press.
  const onPointerMove = useCallback((e) => {
    if (regionFrom.current) {
      const at = paneAt(e.clientX, e.clientY);
      if (!at) return;
      const from = regionFrom.current;
      setRegion({
        left: Math.min(from.x, at.x),
        top: Math.min(from.y, at.y),
        width: Math.abs(at.x - from.x),
        height: Math.abs(at.y - from.y),
      });
      return;
    }
    if (kind !== 'pdf' || selectMode === 'region') return;
    if (dragging.current) return;
    const over = figureAt(e.clientX, e.clientY);
    setHoverFigure((was) => (was?.id === over?.id ? was : over));
  }, [kind, figureAt, selectMode, paneAt]);

  // A rectangle smaller than a few pixels is a click, not a selection.
  const onPointerUp = useCallback(() => {
    if (!regionFrom.current) return;
    regionFrom.current = null;
    setRegion((r) => (r && r.width > 6 && r.height > 6 ? r : null));
  }, []);

  // Leaving the mode, or turning the page, puts the rectangle away.
  useEffect(() => { setRegion(null); regionFrom.current = null; }, [selectMode, section]);

  // Telling the rest of the app which picture is picked is what puts it in the
  // status bar: an outline on its own is easy to miss on a busy page.
  // What is picked, for the rest of the app: a picture in the text, or a
  // picture inside a PDF page. Both are 'a picture is selected' as far as
  // the status bar and the copy command are concerned.
  useEffect(() => {
    if (kind === 'pdf') {
      onPickImage?.(pickedFigure
        ? { kind: 'figure', name: pickedFigure.name || '',
          width: Math.round(pickedFigure.rect.width),
          height: Math.round(pickedFigure.rect.height) }
        : null);
      return;
    }
    onPickImage?.(pickedImage);
  }, [kind, pickedImage, pickedFigure, onPickImage]);

  const onClick = useCallback((e) => {
    const link = e.target.closest?.('[data-section], [data-external]');
    if (!link) return;
    e.preventDefault();
    const external = link.getAttribute('data-external');
    if (external) { onOpenExternal?.(external); return; }
    const target = Number(link.getAttribute('data-section'));
    if (Number.isFinite(target)) onFollowLink?.({ section: target, anchor: link.getAttribute('data-anchor') || '' });
  }, [onFollowLink, onOpenExternal]);

  // ── Search: bring the active hit into view ──────────────
  useEffect(() => {
    if (!activeHit || kind !== 'html') return;
    const el = contentRef.current;
    if (!el) return;
    const hits = el.querySelectorAll('mark.find-hit');
    const target = hits[Math.max(0, Math.min(hits.length - 1, activeHit.pageHit || 0))];
    if (!target) return;
    for (const hit of hits) hit.classList.remove('current');
    target.classList.add('current');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeHit, kind, html]);

  // Which element a picture would be copied from: the one the reader pointed
  // at, or a page that is itself a picture. Never anything else.
  const currentImageNode = useCallback(() => {
    const picked = pickedImageRef.current;
    if (picked && picked.isConnected) return picked;
    pickedImageRef.current = null;
    // A page that *is* a picture — a comic page, a picture file — is the
    // picture, so it needs no picking.
    if (kind === 'image' && imageRef.current) return imageRef.current;
    // And nothing else. There used to be a fallback to the first canvas or
    // <img> in the pane, which meant "copy picture" with nothing picked
    // copied the whole rendered PDF page, or whichever picture happened to
    // come first in the chapter — never the one the reader meant.
    return null;
  }, [kind]);

  /** The reading position inside the current section, 0..1. */
  const fracY = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return 0;
    if (paged) return columnPages > 1 ? columnPage / Math.max(1, columnPages - 1) : 0;
    if (flow) {
      const slot = el.querySelector(`.page-slot[data-row="${rowOf(section)}"]`);
      if (!slot?.offsetHeight) return 0;
      return Math.min(1, Math.max(0, (el.scrollTop - slot.offsetTop) / slot.offsetHeight));
    }
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    return Math.min(1, Math.max(0, el.scrollTop / max));
  }, [paged, flow, columnPage, columnPages, rowOf, section]);

  // The page on screen, taken before anything about the turn touches it.
  // The leaf turns this paint. The chapter is not poured out again over it.
  const pagePaint = () => {
    const el = scrollRef.current;
    const chapter = contentRef.current;
    const clip = el ? visibleClip(el) : null;
    return {
      shot: chapter?.cloneNode(true) || null,
      frozen: clip ? freezePage(chapter, clip) : null,
      frame: chapterFrame(chapter),
    };
  };

  useImperativeHandle(ref, () => ({
    /** The reading position inside the current section, 0..1. */
    getFracY: fracY,
    scrollToFrac(frac) {
      const el = scrollRef.current;
      if (!el) return;
      if (paged) {
        const step = pageStep(el, layout);
        let page = Math.round(frac * Math.max(0, columnPages - 1));
        if (layout === 'double') page -= page % 2;
        el.scrollTo({ left: columnLeft(el, page, step) });
        pendingColumn.current = page;
        setColumnPage(page);
        return;
      }
      if (flow) {
        const slot = el.querySelector(`.page-slot[data-row="${rowOf(section)}"]`);
        if (slot) el.scrollTop = slot.offsetTop + slot.offsetHeight * Math.min(1, Math.max(0, frac));
        return;
      }
      el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) * frac);
    },
    scrollToAnchor(anchor) {
      if (!anchor) return;
      const root = contentRef.current;
      const pane = scrollRef.current;
      let el = null;
      try { el = root?.querySelector(`#${CSS.escape(anchor)}`); } catch { el = null; }
      if (!el || !pane) return;
      // A chapter read a page at a time is one wide strip of columns. Asking the
      // browser to bring a heading into view scrolls that strip by however far
      // the heading sits, which lands between two pages: the first letters of
      // the page are cut off and the next page shows through beside them.
      // The heading's page is a whole column, so that is where the pane goes.
      if (paged) {
        const first = el.getClientRects?.()[0];
          const span = sheetWidth(pane);
          const step = pageStep(pane, layout);
          if (first && span > 0) {
            const paneRect = pane.getBoundingClientRect();
            const x = first.left - paneRect.left + pane.scrollLeft;
            const pages = columnPageCount(pane.scrollWidth, span, step);
            let page = Math.max(0, Math.min(pages - 1, Math.floor(x / step)));
            if (layout === 'double') page -= page % 2;
            pane.scrollTo({ left: columnLeft(pane, page, step), behavior: 'auto' });
            pendingColumn.current = page;
            setColumnPage(page);
          return;
        }
      }
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    /**
     * Moves one page. In two-page view that is both facing pages, the way one
     * leaf of a book turns. Returns false when there is nowhere left to go
     * inside the section, which is what tells the caller to turn to the next one.
     */
    turnPage(dir) {
      const el = scrollRef.current;
      if (!el) return false;
      if (paged) {
        const step = pageStep(el, layout);
        const span = sheetWidth(el);
        // The stored count is whatever the last layout pass saw. A chapter
        // that has since grown — a picture finishing, a font arriving — is
        // still wider than that, and trusting the stored count left the rest
        // of the chapter unread.
        const measured = span > 0 ? columnPageCount(el.scrollWidth, span, step) : columnPages;
        // Where the last click was heading, when this one arrives before that
        // has been committed. Two quick clicks are two spreads.
        const here = pendingColumn.current == null ? columnPage : pendingColumn.current;
        const next = spreadTurnTarget(here, measured, dir, layout);
        if (next == null) {
          if (settings.pageTurn !== 'none') {
            const paint = pagePaint();
            pageTurnIntent.current = {
              section,
              fromColumn: here,
              left: revealLeft.current != null ? revealLeft.current : el.scrollLeft,
              top: el.scrollTop,
              chapter: true,
              read: readStyle.current,
              // The chapter node itself, taken before it is replaced. The turn
              // moves this page; it does not build another one from the markup.
              shot: paint.shot,
              // The lines already on screen. The leaf turns these. Pouring the
              // chapter again would draw them over before the page has gone.
              frozen: paint.frozen,
              frame: paint.frame,
            };
          }
          return false;
        }
        // The page being left stays where it is until the leaf covers it.
        // Scrolling now would draw the page being landed on first and turn
        // afterwards — and a zoomed page does the same, only larger. The
        // scroll waits for that leaf. With no effect chosen, the page just
        // goes.
        const animate = settings.pageTurn !== 'none';
        const dest = columnLeft(el, next, step);
        const origin = revealLeft.current != null ? revealLeft.current : el.scrollLeft;
        if (animate) {
          const paint = pagePaint();
          pageTurnIntent.current = {
            section,
            fromColumn: here,
            left: origin,
            top: el.scrollTop,
            toLeft: dest,
            read: readStyle.current,
            shot: paint.shot,
            frozen: paint.frozen,
            frame: paint.frame,
          };
          revealLeft.current = dest;
        }
        pendingColumn.current = next;
        if (!animate) {
          ownColumnScroll.current = true;
          el.scrollTo({ left: dest, behavior: 'smooth' });
          ownColumnScroll.current = false;
        } else {
          // The page number moves with the turn. The words on screen do not:
          // they stay until the leaf has gone, which is what keeps the page
          // from being drawn again before the effect.
          onPageInfo?.({
            pages: measured,
            page: next,
            atStart: next <= 0,
            atEnd: next >= measured - 1,
          });
          onProgress?.(measured > 1 ? next / Math.max(1, measured - 1) : 0);
        }
        setColumnPage(next);
        if (measured !== columnPages) setColumnPages(measured);
        return true;
      }
      const step = Math.max(80, el.clientHeight - 60);
      // Where the pane is really heading, which during a glide is not where it
      // is. Two quick presses have to turn two pages.
      const from = pendingTop.current != null ? pendingTop.current : el.scrollTop;
      const glide = (top) => {
        const limit = Math.max(0, el.scrollHeight - el.clientHeight);
        const want = Math.max(0, Math.min(limit, Math.round(top)));
        pendingTop.current = want;
        el.scrollTo({ top: want, behavior: 'smooth' });
      };
      if (flow) {
        // A page taller than the window is scrolled through first; only when
        // its last strip is on screen does the turn go to the next page, and it
        // lands on that page's top rather than part way down it.
        const slots = [...el.querySelectorAll('.page-slot')];
        const here = slots.findIndex((s) => Number(s.getAttribute('data-row')) === rowOf(section));
        const slot = slots[here] || null;
        if (dir > 0) {
          const bottom = slot ? slot.offsetTop + slot.offsetHeight : 0;
          if (slot && from + el.clientHeight < bottom - 8) {
            glide(Math.min(from + step, bottom - el.clientHeight));
            return true;
          }
          const next = slots[here + 1];
          if (!next) return false;
          glide(next.offsetTop);
          return true;
        }
        if (slot && from > slot.offsetTop + 8) {
          glide(Math.max(slot.offsetTop, from - step));
          return true;
        }
        const back = slots[here - 1];
        if (!back) return false;
        // Going back into a page taller than the window arrives at its foot,
        // which is where the reader left off reading it.
        glide(Math.max(back.offsetTop, back.offsetTop + back.offsetHeight - el.clientHeight));
        return true;
      }
      if (dir > 0) {
        if (from + el.clientHeight >= el.scrollHeight - 4) return false;
        glide(from + step);
        return true;
      }
      if (from <= 4) return false;
      glide(from - step);
      return true;
    },

    /**
     * The next section reached is to be entered at its end, not its start.
     *
     * Said by whoever turns back past the first page of a section, so that the
     * section they arrive in opens where they would have been reading it.
     */
    arriveAtEnd() {
      landing.current = 'end';
    },
    /**
     * Selects everything there is to select: the chapter for a reflowable book,
     * the pages' text layers for a PDF. A picture has no text, and says so
     * rather than appearing to do nothing.
     */
    selectAll() {
      if (typeof window.getSelection !== 'function') return false;
      const pageText = kind === 'pdf' || kind === 'djvu';
      const layers = pageText ? [...(scrollRef.current?.querySelectorAll('.textLayer') || [])] : [];
      const targets = pageText ? layers : [contentRef.current].filter(Boolean);
      if (!targets.length || !targets.some((el) => (el.textContent || '').trim())) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.setStartBefore(targets[0]);
      range.setEndAfter(targets[targets.length - 1]);
      selection.addRange(range);
      onSelectionChange?.(selection.toString());
      return true;
    },
    /**
     * What a point on the screen means as a place in the book.
     *
     * Used by "bookmark this spot": the right click says where, and this turns
     * that into something that can be written down and come back to.
     */
    placeAt(clientX, clientY) {
      const pane = scrollRef.current;
      const host = spotHost();
      if (!pane) return null;
      const clamp = (v) => Math.min(1, Math.max(0, v));
      const box = host ? host.getBoundingClientRect() : pane.getBoundingClientRect();
      const spot = {
        x: box.width ? clamp((clientX - box.left) / box.width) : 0,
        y: box.height ? clamp((clientY - box.top) / box.height) : 0,
      };
      // Where the pane is scrolled to as well as where on the page: the one
      // brings the right part of the section back, the other draws the mark.
      return { fracY: fracY(), spot };
    },

    /** Whether this book has text a reader could select at all. */
    hasText() {
      if (kind === 'pdf' || kind === 'djvu') {
        return [...(scrollRef.current?.querySelectorAll('.textLayer') || [])]
          .some((el) => (el.textContent || '').trim());
      }
      return !!(contentRef.current?.textContent || '').trim();
    },
    clearSelection() {
      window.getSelection?.()?.removeAllRanges();
      onSelectionChange?.('');
    },
    columnState() {
      return { pages: columnPages, page: columnPage };
    },

    /**
     * The picture on show, as a PNG data URL: the one that was right-clicked,
     * else the page itself for a picture, a comic or a PDF. Returns null when
     * there is nothing to copy, and never throws — a tainted canvas (an image
     * the browser will not let us read back) falls back to the source when that
     * is already a data URL, and to null otherwise.
     */
    pageImage() {
      // A picture inside a PDF page: cropped out of the painted canvas at
      // the rectangle the page's own drawing operators gave for it. The
      // whole page is one canvas, so there is nothing else to copy from.
      if (kind === 'pdf' && pickedFigure) {
        const canvas = scrollRef.current?.querySelector('canvas.pdf-canvas');
        if (canvas) {
          try {
            const out = cropRef.current?.(canvas, pickedFigure.rect);
            if (out?.dataUrl) return out;
          } catch { /* fall through to whatever else is pickable */ }
        }
      }
      const node = currentImageNode();
      if (!node) return null;
      try {
        if (node.tagName === 'CANVAS') {
          return { dataUrl: node.toDataURL('image/png'), width: node.width, height: node.height };
        }
        const width = node.naturalWidth || node.width;
        const height = node.naturalHeight || node.height;
        if (!width || !height) return null;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(node, 0, 0);
        return { dataUrl: canvas.toDataURL('image/png'), width, height };
      } catch {
        const src = node.getAttribute?.('src') || '';
        if (src.startsWith('data:')) {
          return { dataUrl: src, width: node.naturalWidth || 0, height: node.naturalHeight || 0 };
        }
        return null;
      }
    },

    /** The rectangle the reader drew, as a picture. */
    regionImage() {
      // A rectangle the reader drew: cut straight out of whatever the page
      // is drawn on. Only a page that is already a picture has pixels to
      // cut, which is why the mode is offered for those alone.
      if (region && region.width > 6 && region.height > 6) {
        const pane = scrollRef.current;
        const node = pane?.querySelector('canvas.pdf-canvas, img.comic-page, .page-image img, img');
        if (node && cropRef.current) {
          try {
            const spot = boxOf(node);
            const canvas = node.tagName === 'CANVAS' ? node : toCanvas(node);
            if (spot && canvas) {
              const out = cropRef.current(canvas, {
                x: region.left - spot.left,
                y: region.top - spot.top,
                width: region.width,
                height: region.height,
              });
              if (out?.dataUrl) return out;
            }
          } catch { /* fall through to whatever else is pickable */ }
        }
      }
      return null;
    },

    /** Whether a rectangle has been drawn and settled on. */
    hasRegion() {
      return !!(region && region.width > 6 && region.height > 6);
    },

    /** Whether `pageImage()` has something to give — for enabling the command. */
    hasImage() {
      // A drawn rectangle is not a picture: it has its own command, so
      // that "copy picture" and "copy the region" are never both offered
      // for the same thing.
      return !!(kind === 'pdf' && pickedFigure) || !!currentImageNode();
    },

    /** The picture of a PDF page the reader clicked, if any. */
    pickedFigure() {
      return pickedFigure;
    },

    /** The picture the reader picked with the mouse, if any. */
    pickedImage() {
      return pickedImage;
    },

    scale,
  }), [paged, flow, kind, section, rowOf, columnPage, columnPages, scale, fracY, spotHost,
    onSelectionChange, currentImageNode, pickedImage, pickedFigure, region, boxOf,
    settings.pageTurn, layout, onPageInfo, onProgress]);

  // The back of a spread's leaf, once the PDF page it lands on has been painted.
  // Until then the leaf shows blank paper rather than the page before last —
  // the canvas still held that one when the turn began.
  const onPagePainted = useCallback((index, shot) => {
    if (!shot) return;
    setTurn((cur) => {
      if (!cur || !cur.facing) return cur;
      const want = cur.dir === 'forward' ? cur.to : cur.to + 1;
      if (index !== want || cur.back === shot) return cur;
      return { ...cur, back: shot };
    });
  }, []);

  // An ordinary effect on purpose, and declared after the turn effect: every
  // layout effect of a commit runs before any ordinary one, so while the turn is
  // being set up this still holds what the reader was looking at — which is the
  // page the leaf has to be drawn with. It must stay above the early return
  // below — a hook that is only reached when a book is open would change the
  // hooks React sees from one render to the next, which it cannot survive.
  useEffect(() => {
    // A PDF page says for itself when it has been painted; see `onPainted`
    // below. A picture is simply its own source, which is known at once.
    if (kind === 'pdf' || kind === 'djvu') return;
    shown.current = { src: content?.src || '', facing: facing?.src || '' };
  }, [content, facing, kind]);

  // And the page's rectangle, recorded after every paint, so that when a turn
  // begins the shape of the page being left is already known. Declared after
  // the turn effect on purpose — every layout effect of a commit runs before
  // any ordinary one, so this still holds the page the reader was looking at.
  useEffect(() => {
    const root = scrollRef.current;
    const host = root?.querySelector('.page-spread');
    if (!root || !host) return;
    const rootBox = root.getBoundingClientRect();
    const rect = host.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) {
      // Where the page sits in the pane, so the leaf can be laid on top of it
      // rather than centred in the window and hoping the two coincide. Scroll
      // is part of it: the overlay is positioned in the pane's content.
      shownBox.current = {
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        top: Math.round(rect.top - rootBox.top + root.scrollTop),
        left: Math.round(rect.left - rootBox.left + root.scrollLeft),
      };
    }
  });

  // And the same for the chapter on screen, measured as it actually laid out so
  // that the copy held during a turn has the columns the reader was seeing.
  useEffect(() => {
    if (kind !== 'html') { shownChapter.current = { html: '', width: 0 }; return; }
    shownChapter.current = { html, width: contentRef.current?.offsetWidth || 0 };
  }, [html, kind, viewport.width, settings.fontScale, settings.readingWidth, settings.twoColumns, settings.columns]);

  // Restarting a CSS animation on an element that already carries its class
  // takes a reflow between removing it and putting it back. A page turned
  // again before the last one has finished is that case: the same classes are
  // still on the sheet, so without a restart it stays where the previous turn
  // left it — already off the page — and the new turn never plays.
  useLayoutEffect(() => {
    if (!turn && !hold) return;
    const root = scrollRef.current;
    if (!root) return;
    // The live chapter is not among these. Reading its size here lays it out
    // again, and the page the reader is still looking at changes before the
    // leaf has gone. Only the leaf itself is restarted.
    const nodes = [...root.querySelectorAll('.turn-sheet, .turn-leaf, .turn-stay')];
    for (const el of nodes) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    }
    // A window told not to animate has no animation to report the end of, so
    // waiting for one would leave the copy lying across the book until the
    // backstop timer caught it. Nothing is moving, so there is nothing to wait
    // for either: it comes off now.
    const mover = root.querySelector('.turn-sheet, .turn-leaf');
    // `null` where the browser cannot say — jsdom has no Web Animations, and
    // there the backstop timer is what ends the turn.
    const running = typeof mover?.getAnimations === 'function'
      ? mover.getAnimations().length > 0
      : null;
    if (running === false) endTurn();
  }, [turn?.id, hold?.id, endTurn]);

  if (!book) {
    return <div className="bookview empty">{emptyState}</div>;
  }

  // The page the reader was on, cut to the shape of the page and turned away.
  //
  // Ported from MyPDFViewer, whose turn reads right: a leaf the size of the
  // *page* (.flip-spread), in an overlay that does not clip it, hinged on the
  // binding and swept over. Underneath is the page that has arrived, and it
  // never moves — it is uncovered, not brought in.
  //
  // Turning a spread, only one leaf of it moves: going forward the right-hand
  // page lifts and comes down on the left, so the left-hand page stays where it
  // is (.turn-stay) until the leaf lands on it. Going back, the mirror of that.
  // Slid rather than turned, the whole sheet goes at once.
  const spreadTurn = !!(turn?.facing);
  const foldsAtGutter = spreadTurn && settings.pageTurn === 'flip';
  const leafShots = foldsAtGutter
    ? [turn.dir === 'forward' ? turn.facing : turn.leaf]
    : [turn?.leaf, turn?.facing].filter(Boolean);
  const stayShot = foldsAtGutter ? (turn.dir === 'forward' ? turn.leaf : turn.facing) : '';
  const leafPlaced = turn?.box && Number.isFinite(turn.box.top);
  const leaving = (turn && settings.pageTurn !== 'none' && kind !== 'html'
    && (turn.leaf || turn.paper)) ? (
    <div
      className={`flip-overlay${leafPlaced ? ' placed' : ''}`}
      aria-hidden="true"
      data-testid="turn-page"
      style={leafPlaced ? {
        top: `${turn.box.top}px`,
        left: `${turn.box.left}px`,
        width: `${turn.box.w}px`,
        height: `${turn.box.h}px`,
        right: 'auto',
        bottom: 'auto',
      } : undefined}
    >
      {/* Cut to the page. Where the page could not be measured — nothing painted
          yet — the pane is the next best shape to turn. */}
      <div
        className="flip-spread"
        style={leafPlaced ? undefined : {
          width: turn.box ? `${turn.box.w}px` : '100%',
          height: turn.box ? `${turn.box.h}px` : '100%',
        }}
      >
        <div
          key={turn.id}
          className={`turn-leaf turn-${settings.pageTurn} ${turn.dir} ${foldsAtGutter ? 'half' : 'whole'}`}
          onAnimationEnd={onTurnEnd}
        >
          <div className="leaf-face front">
            {leafShots.length
              ? leafShots.map((src, i) => <img key={i} src={src} alt="" draggable={false} />)
              : <span className="leaf-paper" />}
          </div>
          {foldsAtGutter ? (
            <div className="leaf-face back">
              {turn.back
                ? <img src={turn.back} alt="" draggable={false} />
                : <span className="leaf-paper" />}
            </div>
          ) : null}
        </div>
        {stayShot ? (
          <div className={`turn-stay ${turn.dir === 'forward' ? 'left' : 'right'}`}>
            <img src={stayShot} alt="" draggable={false} />
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  const sheet = reflowable && paged ? ebookSheet(layout, pageChoiceOf(settings)) : null;
  const style = {
    // A continuous chapter keeps the column width the reader chose. A page
    // has its own size — see `sheet` — and the window only scales it.
    ...readingStyle(layout === 'continuous' && settings.readingWidth
      ? settings
      : { ...settings, readingWidth: 0 }),
    ...(settings.backgroundImage ? { '--bg-image': `url("${settings.backgroundImage}")` } : {}),
    '--bg-opacity': String((settings.backgroundOpacity || 0) / 100),
    '--turn-ms': `${TURN_MS}ms`,
    '--page-column': viewport.width ? `${viewport.width}px` : '100%',
    '--col-count': String(textColumns),
    '--col-visible': String(screenColumns),
    '--col-gap': `${screenColumns > 1 ? 40 : 0}px`,
    // One column's share of the page, as a length. A percentage in
    // column-width is dropped, and a column that is even a pixel off the
    // page makes the next page start in the middle of a line.
    '--col-slot': sheet
      ? `${sheet.width / Math.max(1, screenColumns)}px`
      : (viewport.width
        ? `${viewport.width / Math.max(1, screenColumns)}px`
        : '0px'),
    ...(sheet ? {
      width: `${sheet.width}px`,
      height: `${sheet.height}px`,
      transform: `scale(${fitScale})`,
    } : {}),
  };
  // Until the leaf has gone, keep painting the page the reader is already
  // looking at. A zoom, or a new column width, that arrives while the leaf
  // is up would otherwise redraw that page — larger or smaller, the lines
  // broken again — and only then finish turning it.
  const leafing = !!pageTurnIntent.current || !!hold;
  if (!leafing) {
    shownStyle.current = style;
    readStyle.current = readingStyle(settings);
  }
  const paneStyle = (leafing && shownStyle.current) ? shownStyle.current : style;

  const classes = [
    `select-${selectMode}`,
    'bookview',
    reflowable ? 'reflow' : 'fixed',
    paged ? 'paged' : 'scrolling',
    flow ? 'flowing' : '',
    spread ? 'spread' : 'one-up',
    `view-${layout}`,
    reflowable && layout === 'single' && textColumns > 1 ? `cols-${textColumns} twocol` : '',
    settings.invertPages ? 'inverted' : '',
    settings.backgroundImage ? `has-bg bg-${settings.backgroundFit}` : '',
  ].filter(Boolean).join(' ');

  /**
   * One row of a fixed-layout book: a page on its own, or two facing pages.
   *
   * The same row is used whether the book is shown a page at a time or as a
   * continuous run, which is why one page and two pages, a comic and a PDF, all
   * end up the same size and in the same place. Only the row the reader is on is
   * the `primary` one: it is the row that reports the zoom, holds the turning
   * leaf and gives up its picture to "copy picture".
   */
  const renderRow = (first, primary) => {
    const pages = [first];
    if (spread && first + 1 < book.sectionCount) pages.push(first + 1);
    // A crease belongs where two pages meet. Drawn down a page shown on its own
    // — the last page of an odd book, or a single picture — it is just a smear.
    const rowClass = `page-spread${pages.length > 1 ? ' two-up' : ''}${primary ? turnClass : ''}`;

    return (
      <div className={rowClass}>
        {kind === 'djvu' ? pages.map((index, i) => (
          <DjvuPage
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            doc={book.djvu}
            page={index + 1}
            zoomMode={zoomMode}
            zoom={settings.zoom}
            rotation={settings.rotation}
            room={room}
            onScale={primary && i === 0 ? setScale : undefined}
            onSize={primary && i === 0 ? setSlotSize : undefined}
            onPainted={primary ? (shot) => onPagePainted(index, shot) : undefined}
            onError={onError}
          />
        )) : kind === 'pdf' ? pages.map((index, i) => (
          <PdfPage
            // Keyed by its place in the row, not by which page it holds: the
            // canvas then stays where it is and is repainted, instead of being
            // thrown away and built again — which blanked the page on every
            // turn and made the layout jump while the new one was drawn.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            doc={book.pdf}
            page={index + 1}
            zoomMode={zoomMode}
            zoom={settings.zoom}
            rotation={settings.rotation}
            room={room}
            onScale={primary && i === 0 ? setScale : undefined}
            onSize={primary && i === 0 ? setSlotSize : undefined}
            onPainted={primary ? (shot) => onPagePainted(index, shot) : undefined}
            onRegions={primary && i === 0 ? setFigures : undefined}
            onError={onError}
          />
        )) : pages.map((index, i) => {
          const page = pageAt(index);
          return (
            <PicturePage
              key={index}
              imgRef={primary && i === 0 ? imageRef : undefined}
              className={`comic-page${i > 0 ? ' facing' : ''}`}
              src={page?.src || ''}
              alt={page?.title || ''}
              styleFor={imageStyle}
              onMeasure={primary && i === 0 ? onImageMeasured : undefined}
              onError={onError}
            />
          );
        })}
      </div>
    );
  };

  const pane = (
    <div
      className={classes}
      style={paneStyle}
      ref={scrollRef}
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHoverFigure(null)}
      onClick={onClick}
      onContextMenu={(e) => {
        // Right-clicking a picture picks it too, and says so, so that "copy
        // picture" in the menu is plainly about the picture under the pointer.
        pick(imageUnder(e.target));
        onContextMenu?.(e);
      }}
      data-testid="bookview"
      data-layout={layout}
      // Which page-turn effect is chosen, so that it can be seen from outside
      // the component — the classes that carry it exist only while a page is
      // actually turning.
      data-turn={settings.pageTurn}
      tabIndex={-1}
    >
      {settings.backgroundImage ? <div className="bookview-bg" aria-hidden="true" /> : null}

      {kind === 'html' ? (
        <article
          className="chapter"
          ref={contentRef}
          data-testid="chapter"
          // The markup has already been through sanitizeChapter: scripts, event
          // handlers, styles and unsafe URLs are gone, images point at the
          // book's own resources and links have become data attributes.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}

      {/* A chapter of text turns exactly as a PDF page does. The leaf is a
          sheet of paper cut to the page (.leaf-face, the same one a PDF page
          is drawn on). It holds the page being *left* — the lines already
          painted there, not the chapter poured out again — and it is what
          moves. The page that has arrived is drawn underneath, and the leaf
          uncovers it. Nothing in the leaf can be clicked, selected or reached
          by the keyboard. */}
      {kind === 'html' && hold ? (() => {
        // Two facing pages turn one of them over, and it is the page the
        // reader is looking at: forward the right-hand page of the spread
        // being left, back its left-hand page. Slid rather than turned, the
        // spread goes as one, so the leaf starts at the spread's own edge.
        const flipHalf = settings.pageTurn === 'flip' && hold.half;
        const pageW = hold.sheet / 2;
        const leafShift = flipHalf && hold.dir === 'forward'
          ? hold.left + pageW
          : hold.left;
        // The other page of the spread — the one that is not turning. Only
        // half the book is covered while a leaf goes over, so without this the
        // live spread shows through beside it and that page changes the
        // instant the turn begins: the reader sees the new page first and the
        // turn afterwards. It is the same paint, held where it was, until the
        // leaf has come down.
        const stayShift = hold.dir === 'forward' ? hold.left : hold.left + pageW;
        // The back of the leaf is the page it lands on: going forward, the
        // left-hand page of the spread that has arrived (two pages on); going
        // back, that spread's right-hand page.
        const backShift = hold.dir === 'forward' ? hold.toLeft : hold.toLeft + pageW;
        const box = framedStyle(hold.frame, hold.width);
        const heldChapter = (shift, markup, node, read) => (
          <LeavingChapter
            node={node || null}
            markup={node ? '' : markup}
            style={{
              ...(read || readingStyle(settings)),
              ...box,
              transform: `translate(${-shift}px, ${-hold.top}px)`,
            }}
          />
        );
        // The page already on screen. Its lines stay where they were painted.
        // A spread's leaf is one half of that paint; the other half stays.
        const painted = hold.frozen?.pieces?.length ? hold.frozen : null;
        const halfW = (painted?.width || hold.sheet) / 2;
        const oldPage = (columnShift, paintShift) => (
          painted
            ? <FrozenPaint frozen={painted} shift={paintShift} />
            : heldChapter(columnShift, hold.html, hold.shot, hold.read)
        );
        return (
          <div
            ref={turnLayerRef}
            className={`turn-page turn-${settings.pageTurn} turn-${hold.dir}${turn?.chapter ? ' turn-chapter' : ''}`}
            aria-hidden="true"
            data-testid="turn-page"
          >
            {/* The window stays on the page the reader is looking at. The sheet
                inside it is what slides or turns. Moving the window itself is a
                transform, and a transform counts as something to scroll to: the
                pane grows a scrollbar, the columns reflow into it, and the page
                looks torn — which is what choosing a chapter from the contents
                did. The live chapter is still the page being left. The page
                being landed on is this layer, uncovered as the sheet moves,
                and the live chapter catches up only when the turn ends. */}
            <div className="turn-base">
              {heldChapter(hold.toLeft, hold.backHtml || hold.html, hold.backShot || hold.shot)}
            </div>
            {flipHalf ? (
              <div className={`turn-stay ${hold.dir === 'forward' ? 'left' : 'right'}`}>
                {oldPage(stayShift, hold.dir === 'forward' ? 0 : halfW)}
              </div>
            ) : null}
            <div
              key={hold.id}
              className={`turn-sheet turn-${settings.pageTurn} turn-${hold.dir}${hold.half ? ' turn-half' : ''}`}
              onAnimationEnd={onTurnEnd}
            >
              <div className="leaf-face front">
                {oldPage(leafShift, flipHalf && hold.dir === 'forward' ? halfW : 0)}
              </div>
              {/* The back of the leaf is the page being landed on, drawn for
                  the turn. The front stays the page that was already there, so
                  both are on the leaf as it goes over. */}
              {flipHalf ? (
                <div className="leaf-face back">{heldChapter(backShift, hold.backHtml || hold.html, hold.backShot)}</div>
              ) : null}
            </div>
          </div>
        );
      })() : null}

      {/* A fixed-layout book, one page (or spread) at a time, with the page
          being turned away drawn over it — beside the live one rather than
          inside it, because the live one must not move. */}
      {!flow && (kind === 'image' || kind === 'pdf' || kind === 'djvu') ? (
        <div className={kind === 'image' ? 'comic-wrap' : 'pdf-wrap'}>
          {renderRow(section, true)}
        </div>
      ) : null}

      {/* Outside the page's own wrapper, because that wrapper clips while a
          page is turning and a clipped sweep is a dark line across the book. */}
      {!flow ? leaving : null}

      {/* The same book as a continuous run. Every page keeps its place in the
          run; only the pages near the one being read are painted. */}
      {flow ? (
        <div className={`page-run ${kind === 'image' ? 'comic-wrap' : 'pdf-wrap'}`}>
          {rows.map((pages, r) => (
            <div
              key={pages[0]}
              className={`page-slot${r === currentRow ? ' here' : ''}`}
              data-row={r}
              data-first={pages[0]}
              style={slotStyle}
            >
              {Math.abs(r - currentRow) <= FLOW_WINDOW ? renderRow(pages[0], r === currentRow) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Bookmarks the reader put somewhere in particular, drawn there. */}
      {spots.length ? (
        <div className="bm-layer" aria-hidden="true">
          {spots.map((mark) => (
            <span
              key={mark.id}
              className="bm-pin"
              style={{ left: `${Math.round(mark.left)}px`, top: `${Math.round(mark.top)}px` }}
              data-testid="bookmark-pin"
            >
              <span className="bm-pin-label">{mark.label}</span>
            </span>
          ))}
        </div>
      ) : null}

      {/* The picture that was clicked, outlined where it is. The frame is the
          whole of it: a caption saying a picture is selected only repeated what
          the frame already shows, over the top of the page. What to do with it
          is in the right-click menu, where the reader is already pointing. */}
      {/* The pictures of a PDF page: the one under the pointer, and the one
          that was clicked. Drawn here rather than in the page component
          because they are a layer of the pane, like the frame round a
          picture in a chapter. */}
      {kind === 'pdf' && (hoverFigure || pickedFigure) ? (
        <div className="pdf-figures" aria-hidden="true" data-testid="pdf-figures">
          {[hoverFigure, pickedFigure].filter(Boolean)
            .filter((f, i, all) => all.findIndex((o) => o.id === f.id) === i)
            .map((f) => (
              <span
                key={f.id}
                className={`pdf-figure${pickedFigure?.id === f.id ? ' picked' : ''}`}
                style={figureStyle(f)}
              />
            ))}
        </div>
      ) : null}

      {/* The rectangle being dragged, or the one that was settled on. */}
      {region ? (
        <div
          className="region-mark"
          aria-hidden="true"
          data-testid="region-mark"
          style={{
            left: `${Math.round(region.left)}px`,
            top: `${Math.round(region.top)}px`,
            width: `${Math.round(region.width)}px`,
            height: `${Math.round(region.height)}px`,
          }}
        />
      ) : null}

      {pickedImage && pickedBox ? (
        <div
          className="picked-mark"
          style={{
            left: `${Math.round(pickedBox.left)}px`,
            top: `${Math.round(pickedBox.top)}px`,
            width: `${Math.round(pickedBox.width)}px`,
            height: `${Math.round(pickedBox.height)}px`,
          }}
          data-testid="picked-mark"
        />
      ) : null}

      {kind === 'html' && !content?.html ? (
        <p className="chapter-empty">{t('panel.empty')}</p>
      ) : null}
      {!kind ? <p className="chapter-empty">{t('progress.rendering')}</p> : null}
    </div>
  );

  if (reflowable && paged && sheet) {
    return (
      <div className="reflow-stage">
        {/* The window the scaled page occupies. The page inside keeps its own
            size and is enlarged from its top-left corner to fill this box. */}
        <div
          className="reflow-fit"
          style={{
            width: `${sheet.width * fitScale}px`,
            height: `${sheet.height * fitScale}px`,
          }}
        >
          {pane}
        </div>
      </div>
    );
  }
  return pane;
});

export default BookView;
