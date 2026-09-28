import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { markHtml } from '../lib/search.js';
import { highlightCss } from '../lib/library.js';
import { computePageScale, readingStyle, columnPageAt, columnPageCount } from '../lib/view.js';

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
const TURN_MS = 420;

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

// Wraps the first occurrence outside of any tag. Only the first: a highlight is
// one passage, and painting every repetition of a common phrase would be wrong.
function wrapFirst(html, needle, mark) {
  const source = String(html);
  const lower = source.toLowerCase();
  const target = needle.toLowerCase();
  let at = -1;
  let from = 0;
  for (;;) {
    const found = lower.indexOf(target, from);
    if (found === -1) break;
    // Refuse a hit that sits inside a tag.
    const openAt = source.lastIndexOf('<', found);
    const closeAt = source.lastIndexOf('>', found);
    if (openAt <= closeAt) { at = found; break; }
    from = found + 1;
  }
  if (at < 0) return source;
  const tag = mark.kind === 'note' ? 'note' : 'highlight';
  const open = `<span class="mark mark-${tag}" ${HIGHLIGHT_ATTR}="${mark.id}" style="background:${highlightCss(mark.color)}">`;
  return source.slice(0, at) + open + source.slice(at, at + needle.length) + '</span>' + source.slice(at + needle.length);
}

/**
 * One PDF page: its canvas and the invisible text layer that makes the words
 * selectable. Each page renders itself, which is what lets a two-page spread be
 * two of these side by side.
 */
export function PdfPage({ doc, page, zoomMode, zoom, rotation, viewport, onScale, onError }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);

  useEffect(() => {
    if (!doc || !canvasRef.current) return undefined;
    let cancelled = false;
    let task = null;

    (async () => {
      try {
        const { renderPage, renderTextLayer } = await import('../lib/pdf.js');
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const wanted = computePageScale({
          pageSize: { width: base.width, height: base.height },
          viewport,
          zoomMode,
          zoom,
          rotation,
        });
        const painted = await renderPage({ page: pdfPage, canvas: canvasRef.current, scale: wanted, rotation });
        task = painted.task;
        await painted.task.promise;
        if (cancelled) return;
        onScale?.(wanted);
        if (textLayerRef.current) {
          await renderTextLayer({ page: pdfPage, container: textLayerRef.current, viewport: painted.viewport });
        }
      } catch (err) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') onError?.(err, 'render');
      }
    })();

    return () => {
      cancelled = true;
      try { task?.cancel(); } catch { /* already finished */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, zoomMode, zoom, rotation, viewport.width, viewport.height]);

  return (
    <div className="pdf-page" data-page={page}>
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textLayerRef} className="textLayer" />
    </div>
  );
}

const BookView = forwardRef(function BookView({
  book, section, content, settings, marks, searchQuery, activeHit,
  onSelectionChange, onContextMenu, onFollowLink, onOpenExternal, onProgress,
  onZoomStep, onTextStep, onError, onPageInfo, onScaleChange, emptyState,
}, ref) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const imageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [columnPages, setColumnPages] = useState(1);
  const [columnPage, setColumnPage] = useState(0);
  const [turn, setTurn] = useState(null);

  const reflowable = !!book && book.reflowable;
  // Nothing is guessed while a section is still loading: rendering an <img>
  // with no source at that moment reported a broken page to the reader. Once
  // content is here, HTML is the safe default — every reflowable reader returns
  // markup, and only pictures and PDFs say otherwise.
  const kind = content ? (content.kind || 'html') : null;
  const paged = reflowable && settings.pageMode === 'paged';
  const spread = !reflowable && settings.spread === 'double';

  // ── Measure the pane ────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [book]);

  // ── The HTML actually shown: content + marks + search hits ──
  const html = useMemo(() => {
    if (kind !== 'html' || !content?.html) return '';
    let out = content.html;
    const list = [
      ...(marks?.highlights || []),
      ...(marks?.notes || []).map((note) => ({ ...note, kind: 'note' })),
    ];
    out = paintMarks(out, list);
    if (searchQuery) out = markHtml(out, searchQuery);
    return out;
  }, [kind, content, marks, searchQuery]);

  // ── The page beside this one, when two are shown ────────
  const facing = useMemo(() => {
    if (!spread || !book || kind !== 'image') return null;
    if (section + 1 >= book.sectionCount) return null;
    try { return book.loadSection(section + 1); } catch { return null; }
  }, [spread, book, kind, section]);

  // ── The page-turning effect ─────────────────────────────
  const place = `${section}:${columnPage}`;
  const previousPlace = useRef(place);
  useEffect(() => {
    const [wasSection, wasColumn] = previousPlace.current.split(':').map(Number);
    const forward = section > wasSection || (section === wasSection && columnPage > wasColumn);
    const moved = previousPlace.current !== place;
    previousPlace.current = place;
    if (!moved || settings.pageTurn === 'none') return undefined;
    setTurn({ dir: forward ? 'forward' : 'back', id: `${place}-${Date.now()}` });
    const timer = setTimeout(() => setTurn(null), TURN_MS);
    return () => clearTimeout(timer);
  }, [place, section, columnPage, settings.pageTurn]);

  const turnClass = turn ? ` turning turn-${settings.pageTurn} turn-${turn.dir}` : '';

  // ── Reflowable: report the pagination and the reading position ──
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || kind !== 'html') return;
    if (paged) {
      const pages = columnPageCount(el.scrollWidth, el.clientWidth);
      setColumnPages(pages);
      setColumnPage(columnPageAt(el.scrollLeft, el.clientWidth));
      onPageInfo?.({ pages, page: columnPageAt(el.scrollLeft, el.clientWidth) });
    } else {
      setColumnPages(1);
      setColumnPage(0);
      onPageInfo?.({ pages: 1, page: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, paged, viewport.width, viewport.height, settings.fontScale, settings.lineHeight, settings.readingWidth, settings.twoColumns]);

  // A new chapter always starts at its top (or its first column).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    setColumnPage(0);
  }, [section, book]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (paged) {
      const page = columnPageAt(el.scrollLeft, el.clientWidth);
      setColumnPage(page);
      onPageInfo?.({ pages: columnPages, page });
      onProgress?.(columnPages > 1 ? page / Math.max(1, columnPages - 1) : 0);
      return;
    }
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    onProgress?.(Math.min(1, Math.max(0, el.scrollTop / max)));
  }, [paged, columnPages, onPageInfo, onProgress]);

  // ── Scaling for pictures ────────────────────────────────
  const pageSize = content?.pageSize || null;
  useEffect(() => {
    // A PDF page reports its own scale once pdf.js has painted it.
    if (reflowable || kind === 'pdf') return;
    const next = computePageScale({
      pageSize: pageSize || { width: 800, height: 1130 },
      viewport,
      zoomMode: settings.zoomMode,
      zoom: settings.zoom,
      rotation: settings.rotation,
    });
    setScale(next);
  }, [reflowable, kind, pageSize, viewport, settings.zoomMode, settings.zoom, settings.rotation]);

  // What the status bar shows: the size a page is actually drawn at.
  useEffect(() => {
    if (!reflowable) onScaleChange?.(scale);
  }, [reflowable, scale, onScaleChange]);

  /** A picture follows the zoom mode the same way a PDF page does. */
  const imageStyle = () => {
    switch (settings.zoomMode) {
      case 'fit-width': return { width: '100%', maxWidth: '100%' };
      case 'fit-page': return { maxHeight: 'calc(100vh - 190px)', width: 'auto', maxWidth: '100%' };
      case 'actual': return { width: 'auto', maxWidth: 'none' };
      default: return { width: `${Math.round(scale * 100)}%`, maxWidth: 'none' };
    }
  };

  /** Once the page is decoded, report how big it ended up on screen. */
  const onImageLoad = () => {
    const image = imageRef.current;
    if (!image?.naturalWidth) return;
    const shown = image.clientWidth / image.naturalWidth;
    if (Number.isFinite(shown) && shown > 0) setScale(shown);
  };

  // ── Selection ───────────────────────────────────────────
  useEffect(() => {
    const onSelect = () => {
      const text = window.getSelection?.()?.toString() || '';
      onSelectionChange?.(text);
    };
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, [onSelectionChange]);

  // ── Ctrl+wheel: text size for reflowable text, zoom for pages ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      if (reflowable) onTextStep?.(dir);
      else onZoomStep?.(dir);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [reflowable, onTextStep, onZoomStep]);

  // ── Links inside the text ───────────────────────────────
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

  useImperativeHandle(ref, () => ({
    /** The reading position inside the current section, 0..1. */
    getFracY() {
      const el = scrollRef.current;
      if (!el) return 0;
      if (paged) return columnPages > 1 ? columnPage / Math.max(1, columnPages - 1) : 0;
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      return Math.min(1, Math.max(0, el.scrollTop / max));
    },
    scrollToFrac(frac) {
      const el = scrollRef.current;
      if (!el) return;
      if (paged) {
        const page = Math.round(frac * Math.max(0, columnPages - 1));
        el.scrollTo({ left: page * el.clientWidth });
        setColumnPage(page);
        return;
      }
      el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) * frac);
    },
    scrollToAnchor(anchor) {
      if (!anchor) return;
      const el = contentRef.current?.querySelector(`#${CSS.escape(anchor)}`);
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    /** Moves one screen: a column in paged mode, a viewport in scroll mode. */
    turnPage(dir) {
      const el = scrollRef.current;
      if (!el) return false;
      if (paged) {
        const next = columnPage + (dir < 0 ? -1 : 1);
        if (next < 0 || next >= columnPages) return false;
        el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
        setColumnPage(next);
        return true;
      }
      const before = el.scrollTop;
      const step = Math.max(80, el.clientHeight - 60);
      el.scrollTo({ top: before + (dir < 0 ? -step : step), behavior: 'smooth' });
      if (dir > 0) return before + el.clientHeight < el.scrollHeight - 4;
      return before > 4;
    },
    selectAll() {
      const el = contentRef.current;
      if (!el || typeof window.getSelection !== 'function') return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      onSelectionChange?.(selection.toString());
    },
    clearSelection() {
      window.getSelection?.()?.removeAllRanges();
      onSelectionChange?.('');
    },
    columnState() {
      return { pages: columnPages, page: columnPage };
    },
    scale,
  }), [paged, columnPage, columnPages, scale, onSelectionChange]);

  if (!book) {
    return <div className="bookview empty">{emptyState}</div>;
  }

  const style = {
    ...readingStyle(settings),
    ...(settings.backgroundImage ? { '--bg-image': `url("${settings.backgroundImage}")` } : {}),
    '--bg-opacity': String((settings.backgroundOpacity || 0) / 100),
  };

  const classes = [
    'bookview',
    reflowable ? 'reflow' : 'fixed',
    paged ? 'paged' : 'scrolling',
    spread ? 'spread' : 'one-up',
    settings.twoColumns && reflowable ? 'twocol' : '',
    settings.invertPages ? 'inverted' : '',
    settings.backgroundImage ? `has-bg bg-${settings.backgroundFit}` : '',
  ].filter(Boolean).join(' ');

  const pdfPages = kind === 'pdf'
    ? [content.page, ...(spread && content.page < book.sectionCount ? [content.page + 1] : [])]
    : [];

  return (
    <div
      className={classes}
      style={style}
      ref={scrollRef}
      onScroll={onScroll}
      onClick={onClick}
      onContextMenu={onContextMenu}
      data-testid="bookview"
      tabIndex={-1}
    >
      {settings.backgroundImage ? <div className="bookview-bg" aria-hidden="true" /> : null}

      {kind === 'html' ? (
        <article
          className={`chapter${turnClass}`}
          key={turn?.id || 'page'}
          ref={contentRef}
          data-testid="chapter"
          // The markup has already been through sanitizeChapter: scripts, event
          // handlers, styles and unsafe URLs are gone, images point at the
          // book's own resources and links have become data attributes.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}

      {kind === 'image' ? (
        <div className="comic-wrap">
          <div className={`page-spread${turnClass}`} key={turn?.id || 'page'}>
            <img
              ref={imageRef}
              className="comic-page"
              src={content?.src || ''}
              alt={content?.title || ''}
              style={imageStyle()}
              onLoad={onImageLoad}
              onError={() => onError?.(new Error(`The page image "${content?.href || ''}" could not be decoded.`), 'render')}
            />
            {facing?.src ? (
              <img
                className="comic-page facing"
                src={facing.src}
                alt={facing.title || ''}
                style={imageStyle()}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {kind === 'pdf' ? (
        <div className="pdf-wrap">
          <div className={`page-spread${turnClass}`} key={turn?.id || 'page'}>
            {pdfPages.map((page, i) => (
              <PdfPage
                key={page}
                doc={book.pdf}
                page={page}
                zoomMode={settings.zoomMode}
                zoom={settings.zoom}
                rotation={settings.rotation}
                viewport={spread ? { width: viewport.width / 2, height: viewport.height } : viewport}
                onScale={i === 0 ? setScale : undefined}
                onError={onError}
              />
            ))}
          </div>
        </div>
      ) : null}

      {paged && columnPages > 1 ? (
        <div className="column-readout" aria-live="polite">
          {columnPage + 1} / {columnPages}
        </div>
      ) : null}

      {kind === 'html' && !content?.html ? (
        <p className="chapter-empty">{t('panel.empty')}</p>
      ) : null}
      {!kind ? <p className="chapter-empty">{t('progress.rendering')}</p> : null}
    </div>
  );
});

export default BookView;
