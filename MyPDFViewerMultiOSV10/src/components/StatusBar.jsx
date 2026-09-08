import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFolder, IconText, IconCheck, IconAlert, IconClip } from './Icons.jsx';
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
export default function StatusBar({ file, doc, pageNumber, scale, selectionChars, dirty, history, message, busy }) {
  const { t } = useTranslation();

  return (
    <footer className="statusbar">
      <span className="st-cell st-message" title={message || t('status.ready')}>
        {busy ? <span className="spinner" /> : <IconCheck size={14} />}
        {message || t('status.ready')}
      </span>

      <span className="st-sep" />

      <span className="st-cell st-file" title={file?.path || file?.name || t('status.noDoc')}>
        <IconText size={14} />
        <span className="st-ellipsis">{file?.name || t('status.noDoc')}</span>
      </span>

      {file?.dir ? (
        <span className="st-cell st-folder" title={`${t('status.dir')}: ${file.dir}`}>
          <IconFolder size={14} />
          <span className="st-dir">{file.dir}</span>
        </span>
      ) : null}

      <span className="toolbar-spacer" />

      {doc ? (
        <>
          <span className="st-cell st-fixed" title={`${t('status.page')} ${pageNumber} ${t('status.of')} ${doc.numPages}`}>
            {t('status.page')} {pageNumber} / {doc.numPages}
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.zoom')}>
            {t('status.zoom')} {Math.round(scale * 100)}%
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.size')}>
            {formatBytes(file?.size || 0)}
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.selection')}>
            <IconClip size={14} />
            {selectionChars > 0 ? t('status.chars', { n: selectionChars }) : t('status.noSelection')}
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.history', { n: history.depth })}>
            {t('status.history', { n: history.depth })}
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
