import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevron } from './Icons';
import { buildPrintPreview, cachedPrintPreview } from '../lib/platform';

const FALLBACK_W = 794;
const FALLBACK_H = 1123;

export function sheetGrid(n, landscape) {
  const count = Math.max(1, Number(n) || 1);
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return landscape ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return landscape ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: 4 };
}

// Live preview of the paginated document. Printer options that change how the
// sheet looks (orientation, scale, colour, pages per sheet) are applied here
// so the dialog matches what will be sent to the printer.
export default function PrintPreview({
  html, view, onView, included, landscape, scaleFactor, color, pagesPerSheet,
}) {
  const { t } = useTranslation();
  const stageRef = useRef(null);
  const [docs, setDocs] = useState(null);
  const [raw, setRaw] = useState(false);
  const [fit, setFit] = useState(0.32);

  useEffect(() => {
    if (!html) { setDocs(null); setRaw(false); return undefined; }
    const cached = cachedPrintPreview(html);
    if (cached) { setRaw(false); setDocs(cached); return undefined; }
    let cancel = false;
    setDocs(null);
    setRaw(false);
    buildPrintPreview(html).then((pages) => {
      if (cancel) return;
      if (!pages) {
        setRaw(true);
        setDocs([{ n: 1, w: FALLBACK_W, h: FALLBACK_H, srcdoc: html }]);
        return;
      }
      setDocs(pages);
    });
    return () => { cancel = true; };
  }, [html]);

  const pageW = docs?.[0]?.w || FALLBACK_W;
  const pageH = docs?.[0]?.h || FALLBACK_H;
  const sheetW = landscape ? pageH : pageW;
  const sheetH = landscape ? pageW : pageH;
  const per = Math.max(1, Number(pagesPerSheet) || 1);
  const total = raw ? 1 : (docs?.length || 0);
  const userScale = Math.min(2, Math.max(0.1, (Number(scaleFactor) || 100) / 100));

  useEffect(() => {
    if (!docs || raw) return;
    if ((view || 1) > docs.length) onView(Math.max(1, docs.length));
  }, [docs, raw, view, onView]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => {
      const availW = Math.max(40, el.clientWidth - 28);
      const availH = Math.max(40, el.clientHeight - 28);
      const s = Math.min(availW / sheetW, availH / sheetH);
      setFit(s > 0 && Number.isFinite(s) ? s : 0.3);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheetW, sheetH, docs, raw]);

  const safeView = total ? Math.min(Math.max(1, view || 1), total) : 1;
  const includedSet = included == null ? null : new Set(included);
  const isIn = (n) => includedSet == null || includedSet.has(n);
  const { cols, rows } = sheetGrid(raw ? 1 : per, landscape);
  const sheetIndex = Math.floor((safeView - 1) / (raw ? 1 : per));
  const slotStart = sheetIndex * (raw ? 1 : per) + 1;
  const slots = raw ? [1] : Array.from({ length: per }, (_, i) => slotStart + i);

  const visW = landscape ? pageH : pageW;
  const visH = landscape ? pageW : pageH;
  const pageScale = Math.min(
    (sheetW * fit) / cols / visW,
    (sheetH * fit) / rows / visH,
  ) * (raw ? 1 : userScale);

  const go = (n) => {
    if (!total) return;
    const next = Math.min(total, Math.max(1, n));
    if (next !== view) onView(next);
  };

  return (
    <aside className="print-preview">
      <div className="print-lab">
        <span>{t('print.preview')}</span>
        {total > 0 && !raw && (
          <span className="print-total">{t('print.previewPage', { page: safeView, total })}</span>
        )}
      </div>

      <div className="print-preview-stage" ref={stageRef}>
        {!html || !docs ? (
          <div className="print-preview-msg">{html ? t('print.previewLoading') : t('print.measuring')}</div>
        ) : raw ? (
          <iframe className="print-preview-raw" title={t('print.preview')} sandbox="" srcDoc={docs[0].srcdoc} />
        ) : (
          <div
            className="print-sheet"
            style={{
              width: sheetW * fit,
              height: sheetH * fit,
              filter: color ? 'none' : 'grayscale(1)',
            }}
          >
            <div
              className="print-sheet-grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                transform: landscape ? 'none' : undefined,
              }}
            >
              {slots.map((n) => {
                const doc = docs.find((p) => p.n === n);
                const active = n === safeView;
                const skip = !doc || !isIn(n);
                return (
                  <div
                    key={n}
                    className={`print-sheet-cell${active ? ' on' : ''}${skip ? ' skip' : ''}`}
                    onClick={() => doc && go(n)}
                    title={doc ? String(n) : ''}
                  >
                    {doc && (
                      <iframe
                        className="print-preview-frame"
                        title={t('print.previewPage', { page: n, total })}
                        sandbox=""
                        srcDoc={doc.srcdoc}
                        style={{
                          width: pageW,
                          height: pageH,
                          transform: `translate(-50%, -50%) scale(${pageScale}) rotate(${landscape ? -90 : 0}deg)`,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!raw && total > 1 && (
        <div className="print-preview-nav">
          <button type="button" className="iconbtn" title={t('print.previewPrev')}
            disabled={safeView <= 1} onClick={() => go(safeView - 1)}>
            <span className="chev-rot left"><IconChevron size={16} /></span>
          </button>
          <span className="pg">{safeView} / {total}</span>
          <button type="button" className="iconbtn" title={t('print.previewNext')}
            disabled={safeView >= total} onClick={() => go(safeView + 1)}>
            <span className="chev-rot right"><IconChevron size={16} /></span>
          </button>
        </div>
      )}

      {docs && !raw && !isIn(safeView) && <div className="print-skip">{t('print.previewSkip')}</div>}
      {raw && docs && <div className="print-preview-meta">{t('print.previewFail')}</div>}
      {docs && !raw && (
        <div className="print-preview-meta">
          {landscape ? t('print.landscape') : t('print.portrait')}
          {' · '}{Math.round(userScale * 100)}%
          {' · '}{t('print.previewSheet', { count: per })}
          {color ? '' : ` · ${t('print.colorOff')}`}
        </div>
      )}
    </aside>
  );
}
