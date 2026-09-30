import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconBook, IconFolder, IconCheck, IconAlert, IconClip, IconContents, IconBookmark, IconImage } from './Icons.jsx';
import { api, isElectron, formatBytes } from '../lib/platform.js';

// The corner grip. A frameless window has no chrome of its own to grab, so the
// grip resizes the window itself: it follows the pointer in screen coordinates
// and asks the main process for the new size, one update per frame.
function ResizeGrip({ title }) {
  const drag = useRef(null);
  const frame = useRef(0);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return undefined;
    api.win.isMaximized().then(setMaximized).catch(() => {});
    return api.win.onMaximizeChange(setMaximized);
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    d.width = d.w0 + (e.screenX - d.x0);
    d.height = d.h0 + (e.screenY - d.y0);
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (drag.current) api.win.setSize({ width: drag.current.width, height: drag.current.height }).catch(() => {});
    });
  }, []);

  const stop = useCallback((e) => {
    drag.current = null;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Capture first, synchronously: after the await the event is spent and the
    // pointer would escape the grip on the first fast move.
    const grip = e.currentTarget;
    const { screenX, screenY, pointerId } = e;
    grip.setPointerCapture?.(pointerId);
    api.win.getSize().then((size) => {
      if (!size) { grip.releasePointerCapture?.(pointerId); return; }
      drag.current = { x0: screenX, y0: screenY, w0: size.width, h0: size.height };
    }).catch(() => { grip.releasePointerCapture?.(pointerId); });
  }, []);

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  if (!isElectron || maximized) return null;

  return (
    <span
      className="st-grip"
      role="separator"
      aria-label={title}
      title={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <path d="M12 4 4 12M12 8 8 12M12 12l0 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}

// Bottom status bar: what is open, where you are in it, and what the app is
// doing right now. Each cell has a tooltip explaining the value it shows.
export default function StatusBar({
  book, section, progress, scale, columns, selectionChars, pickedImage, dirty, history, message, busy, bookmarks,
  pageCount, pageNow, pagesEstimated,
}) {
  const { t } = useTranslation();

  return (
    <footer className="statusbar">
      <span className="st-cell st-message" title={message || t('status.ready')}>
        {busy ? <span className="spinner" /> : <IconCheck size={14} />}
        {message || t('status.ready')}
      </span>

      <span className="st-sep" />

      <span className="st-cell st-file" title={book?.filePath || book?.fileName || t('status.noBook')}>
        <IconBook size={14} />
        <span className="st-ellipsis">{book?.meta?.title || book?.fileName || t('status.noBook')}</span>
      </span>

      {book?.filePath ? (
        <span className="st-cell st-folder" title={`${t('status.dir')}: ${book.filePath}`}>
          <IconFolder size={14} />
          <span className="st-dir">{book.filePath.replace(/[^\\/]+$/, '')}</span>
        </span>
      ) : null}

      <span className="toolbar-spacer" />

      {book ? (
        <>
          {/* A book whose pages are its own — a PDF, a comic, a picture — has
              only pages, and its "section" *is* the page. Reflowable text has
              chapters of its own and pages that had to be worked out, so both
              are shown and the worked-out one says that it is an estimate. */}
          {book.reflowable ? (
            <>
              <span className="st-cell st-fixed" title={`${t('status.section')} ${section + 1} ${t('status.of')} ${book.sectionCount}`}>
                <IconContents size={14} />
                {t('status.section')} {section + 1} / {book.sectionCount}
              </span>
              <span className="st-sep" />
            </>
          ) : (
            <>
              {/* Pages of a PDF, a comic or a picture are the book's own pages.
                  An ebook's pages change with the window, so they are not numbered. */}
              <span
                className="st-cell st-fixed"
                title={pageCount
                  ? `${t('common.page')} ${pageNow} ${t('status.of')} ${pageCount}${pagesEstimated ? ` — ${t('status.pagesEstimated')}` : ''}`
                  : t('status.pagesCounting')}
                data-testid="page-readout"
              >
                {t('common.page')}{' '}
                {pageCount ? `${pageNow} / ${pageCount}${pagesEstimated ? '≈' : ''}` : '…'}
              </span>
              <span className="st-sep" />
              {columns?.pages > 1 ? (
                <>
                  <span className="st-cell st-fixed" title={t('status.inChapter')}>
                    {columns.page + 1} / {columns.pages}
                  </span>
                  <span className="st-sep" />
                </>
              ) : null}
            </>
          )}
          <span className="st-cell st-fixed" title={t('status.progress')}>
            {t('status.progress')} {Math.round((progress || 0) * 100)}%
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.format')}>
            {book.formatLabel}
          </span>
          <span className="st-sep" />
          {!book.reflowable ? (
            <>
              <span className="st-cell st-fixed" title={t('status.zoom')}>
                {t('status.zoom')} {Math.round((scale || 1) * 100)}%
              </span>
              <span className="st-sep" />
            </>
          ) : null}
          <span className="st-cell st-fixed" title={t('status.size')}>
            {formatBytes(book.fileSize || 0)}
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.selection')}>
            <IconClip size={14} />
            {selectionChars > 0 ? t('status.chars', { n: selectionChars }) : t('status.noSelection')}
          </span>
          <span className="st-sep" />
          {/* A picked picture. It is the only cell that appears and disappears
              with what the reader is doing, which is exactly what makes it
              noticeable: a picture is selected, and here is which one. */}
          {pickedImage ? (
            <>
              <span
                className="st-cell st-fixed st-picked"
                title={t('status.pickedImageOf', {
                  name: pickedImage.name || t('status.pickedImage'),
                  w: pickedImage.width || 0,
                  h: pickedImage.height || 0,
                })}
                data-testid="picked-image"
              >
                <IconImage size={14} />
                {pickedImage.width && pickedImage.height
                  ? t('status.pickedImageSize', { w: pickedImage.width, h: pickedImage.height })
                  : t('status.pickedImage')}
              </span>
              <span className="st-sep" />
            </>
          ) : null}
          <span className="st-cell st-fixed" title={t('status.history', { n: history.depth })}>
            {t('status.history', { n: history.depth })}
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.bookmarks', { n: bookmarks || 0 })}>
            <IconBookmark size={14} />
            {bookmarks || 0}
          </span>
          <span className="st-sep" />
          <span className={`st-cell st-fixed${dirty ? ' warn' : ''}`} title={dirty ? t('status.modified') : t('status.clean')}>
            {dirty ? <IconAlert size={14} /> : <IconCheck size={14} />}
            {dirty ? t('status.modified') : t('status.clean')}
          </span>
        </>
      ) : null}

      <ResizeGrip title={t('status.resize')} />
    </footer>
  );
}
