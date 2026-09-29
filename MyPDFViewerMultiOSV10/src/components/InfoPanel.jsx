import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconClose } from './Icons.jsx';
import { formatBytes } from '../lib/platform.js';
import { clampInfoPanelWidth } from '../lib/settings.js';
import { zoomModeLabelKey } from '../lib/view.js';

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd title={String(value)}>{String(value)}</dd>
    </div>
  );
}

export default function InfoPanel({
  open, width, onResize, onClose,
  file, numPages, pageNumber, scale, zoomMode, layout, rotation, info,
  bookmarkCount = 0, commentCount = 0, attachmentCount = 0, outlineCount = 0,
}) {
  const { t } = useTranslation();
  const drag = useRef(null);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-sidebar');
  }, [width]);

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return;
    const next = clampInfoPanelWidth(drag.current.w + (drag.current.x - e.clientX));
    onResize?.(next);
  }, [onResize]);

  const endDrag = useCallback((e) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
    document.body.classList.remove('resizing-sidebar');
  }, []);

  if (!open) return null;

  const zoomLabel = zoomMode === 'custom' || zoomMode === 'actual'
    ? `${Math.round((scale || 1) * 100)}%`
    : t(`toolbar.${zoomModeLabelKey(zoomMode)}`);
  const layoutLabel = layout === 'single'
    ? t('toolbar.layoutSingle')
    : layout === 'spread'
      ? t('toolbar.layoutTwoPage')
      : t('toolbar.layoutContinuous');

  return (
    <aside
      className="info-panel"
      style={{ '--info-width': `${width}px` }}
      aria-label={t('info.title')}
    >
      <div
        className="info-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('side.resize')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="info-main">
        <header className="side-head">
          <span className="side-head-title">{t('info.title')}</span>
          <div className="side-head-actions">
            <button
              type="button"
              className="icon-btn side-head-action"
              onClick={onClose}
              title={t('info.close')}
              aria-label={t('info.close')}
            >
              <IconClose size={15} />
            </button>
          </div>
        </header>
        <div className="side-body info-body">
          {!file ? (
            <p className="empty">{t('info.empty')}</p>
          ) : (
            <>
              <section className="info-section">
                <h4>{t('info.file')}</h4>
                <dl>
                  <Row label={t('props.file')} value={file.name} />
                  <Row label={t('props.path')} value={file.path || file.dir} />
                  <Row label={t('props.fileSize')} value={formatBytes(file.size)} />
                  <Row label={t('props.pages')} value={numPages} />
                </dl>
              </section>
              <section className="info-section">
                <h4>{t('info.document')}</h4>
                <dl>
                  <Row label={t('props.docTitle')} value={info?.title} />
                  <Row label={t('props.author')} value={info?.author} />
                  <Row label={t('props.subject')} value={info?.subject} />
                  <Row label={t('props.keywords')} value={info?.keywords} />
                  <Row label={t('props.creator')} value={info?.creator} />
                  <Row label={t('props.producer')} value={info?.producer} />
                  <Row label={t('props.created')} value={info?.creationDate} />
                  <Row label={t('props.modified')} value={info?.modDate} />
                  <Row label={t('props.pdfVersion')} value={info?.version} />
                  <Row
                    label={t('info.encrypted')}
                    value={info?.encrypted ? t('common.yes') : t('common.no')}
                  />
                </dl>
              </section>
              <section className="info-section">
                <h4>{t('info.view')}</h4>
                <dl>
                  <Row label={t('status.page')} value={`${pageNumber} / ${numPages || 0}`} />
                  <Row label={t('info.zoom')} value={zoomLabel} />
                  <Row label={t('info.layout')} value={layoutLabel} />
                  <Row label={t('info.rotation')} value={`${Number(rotation) || 0}°`} />
                </dl>
              </section>
              <section className="info-section">
                <h4>{t('info.contents')}</h4>
                <dl>
                  <Row label={t('toolbar.bookmarks')} value={bookmarkCount} />
                  <Row label={t('toolbar.comments')} value={commentCount} />
                  <Row label={t('info.attachments')} value={attachmentCount} />
                  <Row label={t('side.outline')} value={outlineCount} />
                </dl>
              </section>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
