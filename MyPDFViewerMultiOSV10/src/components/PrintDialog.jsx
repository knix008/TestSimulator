import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconPrint, IconPrev, IconNext } from './Icons.jsx';
import { clampPreviewIndex, pagesForScope, renderPreviewPage } from '../lib/print.js';

// Chooses what to print: the whole document, just the page on screen, or a
// range the user types. A live preview of the selected pages sits beside the
// options so the user can see what will go to the printer.
export default function PrintDialog({
  open, doc, numPages, pageNumber, rotation = 0,
  settings, onChange, onPrint, onClose, busy,
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState(settings.printScope || 'all');
  const [custom, setCustom] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setScope(settings.printScope || 'all');
    setCustom((prev) => prev || `${pageNumber}`);
    setPreviewIndex(0);
  }, [open, settings.printScope, pageNumber]);

  const selection = useMemo(
    () => pagesForScope({ scope, custom, pageNumber, numPages }),
    [scope, custom, pageNumber, numPages]
  );

  const pages = selection.pages;
  const invalid = scope === 'custom' && !!selection.error;
  const count = pages.length;
  const safeIndex = clampPreviewIndex(previewIndex, count);
  const previewPage = count ? pages[safeIndex] : null;

  useEffect(() => {
    setPreviewIndex((i) => clampPreviewIndex(i, pages.length));
  }, [pages]);

  useEffect(() => {
    if (!open || !doc || !previewPage || !canvasRef.current) {
      setPreviewing(false);
      return undefined;
    }
    let cancelled = false;
    setPreviewing(true);
    (async () => {
      try {
        await renderPreviewPage({
          doc, pageNumber: previewPage, canvas: canvasRef.current, rotation,
        });
      } catch { /* the pane stays empty; printing still works */ }
      if (!cancelled) setPreviewing(false);
    })();
    return () => { cancelled = true; };
  }, [open, doc, previewPage, rotation]);

  if (!open) return null;

  const choose = (next) => {
    setScope(next);
    onChange({ ...settings, printScope: next });
  };

  const submit = () => {
    if (invalid || !count || busy) return;
    onPrint({ pages, scope });
  };

  const OPTIONS = [
    { id: 'all', label: t('print.all'), hint: t('print.allHint', { n: numPages }) },
    { id: 'current', label: t('print.current'), hint: t('print.currentHint', { n: pageNumber }) },
    { id: 'custom', label: t('print.custom'), hint: t('print.customHint') },
  ];

  return (
    <Modal
      open
      title={t('print.title')}
      icon={IconPrint}
      onClose={onClose}
      width={780}
      className="print-modal"
      closeLabel={t('common.cancel')}
      footer={(
        <>
          <span className="print-count">
            {invalid ? '' : t('print.willPrint', { n: count })}
          </span>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn primary"
            onClick={submit}
            disabled={invalid || !count || busy}
            data-autofocus
          >
            {busy ? t('print.working') : t('print.print')}
          </button>
        </>
      )}
    >
      <div className="print-layout">
        <div className="print-options">
          <div className="print-scopes" role="radiogroup" aria-label={t('print.range')}>
            {OPTIONS.map((opt) => (
              <label key={opt.id} className={`print-scope${scope === opt.id ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="print-scope"
                  checked={scope === opt.id}
                  onChange={() => choose(opt.id)}
                />
                <span className="print-scope-text">
                  <span className="print-scope-label">{opt.label}</span>
                  <span className="print-scope-hint">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {scope === 'custom' ? (
            <label className="field">
              <span className="field-label">{t('print.rangeLabel')}</span>
              <input
                className="input"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder={t('print.rangePlaceholder')}
                title={t('print.rangePlaceholder')}
              />
            </label>
          ) : null}

          {invalid ? <p className="field-error">{t(selection.error, { max: numPages })}</p> : null}

          <p className="capture-note">{t('print.note')}</p>
        </div>

        <aside className="print-preview" aria-label={t('print.preview')}>
          <div className="print-preview-label">{t('print.preview')}</div>
          <div className={`print-preview-sheet${previewing ? ' busy' : ''}`}>
            {previewPage ? (
              <canvas ref={canvasRef} className="print-preview-canvas" />
            ) : (
              <p className="print-preview-empty">{t('print.previewEmpty')}</p>
            )}
          </div>
          <div className="print-preview-nav">
            <button
              className="icon-btn"
              type="button"
              disabled={!count || safeIndex <= 0}
              onClick={() => setPreviewIndex((i) => clampPreviewIndex(i - 1, count))}
              title={t('toolbar.prevPage')}
              aria-label={t('toolbar.prevPage')}
            >
              <IconPrev size={16} />
            </button>
            <span className="print-preview-page">
              {count
                ? t('print.previewOf', { n: previewPage, index: safeIndex + 1, total: count })
                : '—'}
            </span>
            <button
              className="icon-btn"
              type="button"
              disabled={!count || safeIndex >= count - 1}
              onClick={() => setPreviewIndex((i) => clampPreviewIndex(i + 1, count))}
              title={t('toolbar.nextPage')}
              aria-label={t('toolbar.nextPage')}
            >
              <IconNext size={16} />
            </button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
