import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconInfo, IconTextSize, IconCover, IconChevron,
} from './Icons.jsx';
import {
  READING_WIDTHS, viewLayoutOf, viewLayoutSettings, textColumnsOf, columnChoice, readingStyle,
  fontPixels, fontScaleOf, FONT_SCALE_MIN, FONT_SCALE_MAX,
  PAGE_PRESETS, PAGE_WIDTH_MIN, PAGE_WIDTH_MAX, PAGE_HEIGHT_MIN, PAGE_HEIGHT_MAX,
  ebookPageOf, pageChoiceOf, pagePresetSettings, pageCustomSettings,
} from '../lib/view.js';
import { PANEL_WIDTH_MAX } from '../lib/settings.js';
import { usePanelMinWidth, usePanelBodyMin, clampToPanelMin } from './panelWidth.js';
import { formatBytes } from '../lib/platform.js';
import { getSystemFonts } from '../lib/fonts.js';
import { coverPageOf } from '../lib/coverpage.js';

const PAGE_LABEL = {
  xs: 'reading.pageXs',
  sm: 'reading.pageSm',
  md: 'reading.pageMd',
  lg: 'reading.pageLg',
  xl: 'reading.pageXl',
};

// The right panel: the properties of what you are reading, and the knobs that
// change how it looks. Everything here is one row per item, so the panel reads
// as a list of settings rather than a form.

/**
 * The picture at the top of the properties panel: the book's cover, or — for
 * the many books that carry none — its first page, which is what a reader
 * opening it would see anyway.
 *
 * Three things can arrive from `coverPageOf`, and each is drawn its own way: a
 * picture is an <img>, a chapter of a reflowable book is its markup shrunk into
 * a page-shaped box, and a PDF page has to be painted on a canvas.
 */
function Cover({ book, show, settings }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [page, setPage] = useState(null);
  // The first page, at the size the reading screen draws it, scaled down to
  // fit this panel. A page drawn at a different width would break its lines
  // in different places, and would not be the page on screen.
  const [fit, setFit] = useState(null);

  useEffect(() => {
    setPage(show && book ? coverPageOf(book) : null);
  }, [show, book]);

  useLayoutEffect(() => {
    if (page?.kind !== 'html') { setFit(null); return undefined; }
    const measure = () => {
      const pane = document.querySelector('[data-testid=bookview]');
      const wrap = wrapRef.current;
      if (!pane || !wrap || pane.clientWidth < 40 || pane.clientHeight < 40) return;
      const slot = parseFloat(getComputedStyle(pane).getPropertyValue('--col-slot'));
      const pageW = slot > 20 ? slot : pane.clientWidth;
      const pageH = pane.clientHeight;
      const room = Math.min(170, Math.max(80, wrap.clientWidth - 16));
      const next = { pageW, pageH, scale: room / pageW, paged: pane.classList.contains('paged') };
      setFit((prev) => (
        prev && prev.pageW === next.pageW && prev.pageH === next.pageH
          && prev.scale === next.scale && prev.paged === next.paged
          ? prev : next
      ));
    };
    measure();
    const watcher = new ResizeObserver(measure);
    const pane = document.querySelector('[data-testid=bookview]');
    if (pane) watcher.observe(pane);
    if (wrapRef.current) watcher.observe(wrapRef.current);
    return () => watcher.disconnect();
  }, [page]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (page?.kind !== 'pdf' && page?.kind !== 'djvu')) return undefined;
    if (page.kind === 'djvu') {
      if (!book?.djvu) return undefined;
      let cancelled = false;
      (async () => {
        try {
          const { paintDjvuPage, djvuPageSize } = await import('../lib/djvu.js');
          if (cancelled) return;
          const size = djvuPageSize(book.djvu, page.page || 1);
          const scale = Math.min(1.5, 320 / Math.max(1, size.width));
          await paintDjvuPage({
            doc: book.djvu, pageNumber: page.page || 1, canvas, scale, dpr: 1,
          });
          canvas.style.width = '';
          canvas.style.height = '';
        } catch {
          // A cover that will not paint is a cover the panel does without.
        }
      })();
      return () => { cancelled = true; };
    }
    if (!book?.pdf) return undefined;
    let cancelled = false;
    (async () => {
      try {
        // Imported here rather than at the top of the file. pdf.js pulls in
        // the whole of pdfjs-dist, and a static import of it from this panel
        // — which is in the main bundle — dragged that into the main chunk,
        // undoing the lazy loading the reading pane goes to such lengths for.
        // It is also what the build warned about: one module both statically
        // and dynamically imported cannot be split out.
        const { renderPage } = await import('../lib/pdf.js');
        if (cancelled) return;
        const pdfPage = await book.pdf.getPage(page.page || 1);
        if (cancelled) return;
        const full = pdfPage.getViewport({ scale: 1 });
        // Wide enough to read the title off, small enough to paint at once.
        const scale = Math.min(1.5, 320 / Math.max(1, full.width));
        await renderPage({ page: pdfPage, canvas, scale, dpr: 1 });
        // renderPage sizes the canvas in pixels, for a page that is to be read
        // at a known zoom. Here it is a thumbnail in a box of the panel's width,
        // and a fixed height against a width the box may have to shrink is what
        // stretched it. Cleared, the canvas keeps the shape of its own bitmap
        // and the box scales it whole.
        canvas.style.width = '';
        canvas.style.height = '';
      } catch {
        // A cover that will not paint is a cover the panel does without.
      }
    })();
    return () => { cancelled = true; };
  }, [page, book]);

  const label = t(page?.source === 'first' ? 'props.firstPage' : 'props.cover');

  if (!page) {
    return (
      <div className="cover-wrap empty" title={t('props.cover')}>
        <IconCover size={40} />
      </div>
    );
  }

  return (
    <div className={`cover-wrap${page.source === 'first' ? ' first' : ''}`} title={label} ref={wrapRef}>
      {page.kind === 'image' ? <img className="cover-image" src={page.src} alt={label} /> : null}
      {page.kind === 'pdf' || page.kind === 'djvu' ? <canvas className="cover-image" ref={canvasRef} aria-label={label} /> : null}
      {page.kind === 'html' && fit ? (
        <div className="cover-page live" style={{ height: `${fit.pageH * fit.scale}px` }} aria-label={label}>
          {/* The reading screen's own page, at its own size, then scaled to the
              panel. Same column, same type, same picture — the first page. */}
          <div
            className={`bookview reflow ${fit.paged ? 'paged view-single' : 'scrolling'} cover-sheet`}
            style={{
              width: `${fit.pageW}px`,
              height: `${fit.pageH}px`,
              transform: `scale(${fit.scale})`,
              ...readingStyle(settings),
              '--col-slot': `${fit.pageW}px`,
              '--col-visible': '1',
            }}
          >
            <article className="chapter" dangerouslySetInnerHTML={{ __html: page.html }} />
          </div>
        </div>
      ) : null}
      {page.kind === 'html' && !fit ? (
        <div className="cover-page" aria-label={label}>
          <div className="cover-page-ink" dangerouslySetInnerHTML={{ __html: page.html }} />
        </div>
      ) : null}
    </div>
  );
}

const TABS = [
  { id: 'properties', icon: IconInfo, label: 'panel.properties' },
  { id: 'reading', icon: IconTextSize, label: 'panel.reading' },
];

function Resizer({ width, onResize, min }) {
  const drag = useRef(null);
  return (
    <div
      className="panel-resizer right"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = { x0: e.clientX, w0: width };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // Never past the point where the panel's own tabs would be cut off.
        onResize(clampToPanelMin(d.w0 + (d.x0 - e.clientX), min));
      }}
      onPointerUp={(e) => { drag.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); }}
      onPointerCancel={(e) => { drag.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); }}
    />
  );
}

/**
 * A number the reader can type, with a step either side of it.
 *
 * A slider is quick but it cannot be told an exact value, and it cannot be read
 * either — "somewhere near the middle" is not a line height. So every number in
 * this panel is a box you can type into with a − and a + beside it, which is
 * also how the settings window does it.
 *
 * What is typed is held while it is being typed and only taken when the box is
 * left or Enter is pressed: clamping every keystroke makes "1" become the
 * minimum before the "2" of "12" has been typed.
 */
function Stepper({ value, min, max, step = 1, unit = '', decimals = 0, onChange, label, disabled = false }) {
  const { t } = useTranslation();
  const [typing, setTyping] = useState(null);
  const shown = typing != null ? typing : value.toFixed(decimals);

  const clamp = (n) => Math.min(max, Math.max(min, n));
  const round = (n) => Number(clamp(n).toFixed(decimals));
  const commit = (raw) => {
    setTyping(null);
    const next = Number(String(raw).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(next)) return;
    if (round(next) !== value) onChange(round(next));
  };
  const nudge = (by) => {
    setTyping(null);
    const next = round(value + by * step);
    if (next !== value) onChange(next);
  };

  return (
    <span className="stepper">
      <button
        type="button"
        className="stepper-btn"
        onClick={() => nudge(-1)}
        disabled={disabled || value <= min}
        title={`${label} − ${step}${unit}`}
        aria-label={`${label} ${t('common.less')}`}
      >
        −
      </button>
      <input
        className="input stepper-value"
        type="text"
        inputMode="decimal"
        value={typing != null ? typing : `${shown}${unit}`}
        onFocus={() => setTyping(String(value.toFixed(decimals)))}
        onChange={(e) => setTyping(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(e.currentTarget.value); e.currentTarget.blur(); }
          if (e.key === 'Escape') { setTyping(null); e.currentTarget.blur(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); }
        }}
        title={`${label} (${min}${unit} – ${max}${unit})`}
        aria-label={label}
        disabled={disabled}
      />
      <button
        type="button"
        className="stepper-btn"
        onClick={() => nudge(1)}
        disabled={disabled || value >= max}
        title={`${label} + ${step}${unit}`}
        aria-label={`${label} ${t('common.more')}`}
      >
        +
      </button>
    </span>
  );
}

function Row({ label, children, title, stack = false, fit = false }) {
  const kind = stack ? ' stack' : (fit ? ' fit' : '');
  return (
    <div className={`prop-row${kind}`} title={title || label}>
      <span className="prop-label">{label}</span>
      <span className="prop-value">{children}</span>
    </div>
  );
}

export default function RightPanel({
  panel, width, onPanel, onResize,
  book, section, settings, onSettings, libraryPath, dirty,
}) {
  const { t, i18n } = useTranslation();
  const tabsRef = useRef(null);
  const bodyRef = useRef(null);
  // The panel is never narrower than its own tab strip, in any language.
  const bodyMin = usePanelBodyMin(bodyRef, [i18n.language, panel]);
  const minWidth = Math.max(usePanelMinWidth(tabsRef, [i18n.language]), bodyMin);
  const [fonts, setFonts] = useState([]);
  // The tab to open again after the panel is folded. A panel that starts
  // closed comes back on the properties.
  const restore = useRef(panel && panel !== 'none' ? panel : 'properties');
  if (panel && panel !== 'none') restore.current = panel;

  useEffect(() => {
    if (panel !== 'reading') return;
    getSystemFonts().then(setFonts).catch(() => setFonts([]));
  }, [panel]);

  const active = TABS.find((tab) => tab.id === (panel === 'none' ? restore.current : panel)) || TABS[0];
  const ActiveIcon = active.icon;

  if (panel === 'none') {
    return (
      <aside className="side-panel right collapsed" aria-label={t('panel.right')}>
        <div className="panel-foldbar">
          <button
            type="button"
            className="panel-fold"
            onClick={() => onPanel(restore.current)}
            title={t('panel.unfold')}
            aria-label={t('panel.unfold')}
          >
            <IconChevron className="point-left" size={16} />
          </button>
          <button
            type="button"
            className="panel-title"
            onClick={() => onPanel(restore.current)}
            title={t(active.label)}
          >
            <ActiveIcon size={16} />
            <span className="panel-title-text">{t(active.label)}</span>
          </button>
        </div>
      </aside>
    );
  }

  const set = (patch) => onSettings({ ...settings, ...patch });
  const meta = book?.meta || {};
  // A PDF page already has a size. These controls are the page of a book
  // whose text is poured — EPUB, MOBI and the other reflowable formats.
  const pageFixed = !!book && book.reflowable === false;
  const pageShown = ebookPageOf(viewLayoutOf(settings, book), pageChoiceOf(settings));
  const shown = Math.max(width, minWidth);

  return (
    <aside
      className="side-panel right"
      style={{ width: shown, minWidth }}
      aria-label={t('panel.right')}
    >
      <Resizer width={shown} onResize={onResize} min={minWidth} />

      <div className="panel-foldbar">
        <button
          type="button"
          className="panel-fold"
          onClick={() => onPanel('none')}
          title={t('panel.fold')}
          aria-label={t('panel.fold')}
        >
          <IconChevron size={16} />
        </button>
        <div className="panel-title">
          <ActiveIcon size={16} />
          <span className="panel-title-text">{t(active.label)}</span>
        </div>
      </div>

      <div className="panel-tabs" role="tablist" aria-label={t('panel.right')} ref={tabsRef}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={panel === tab.id}
            className={`panel-tab${panel === tab.id ? ' active' : ''}`}
            onClick={() => onPanel(tab.id)}
            title={t(tab.label)}
            aria-label={t(tab.label)}
          >
            <tab.icon size={16} />
            <span className="panel-tab-label">{t(tab.label)}</span>
          </button>
        ))}
      </div>

      <div className="panel-body" ref={bodyRef}>
        {panel === 'properties' ? (
          !book ? <p className="panel-note">{t('panel.empty')}</p> : (
            <>
              <Cover book={book} show={panel === 'properties'} settings={settings} />
              <Row label={t('props.title')}>{meta.title || '—'}</Row>
              <Row label={t('props.author')}>{meta.author || '—'}</Row>
              <Row label={t('props.publisher')}>{meta.publisher || '—'}</Row>
              <Row label={t('props.date')}>{meta.date || '—'}</Row>
              <Row label={t('props.language')}>{meta.language || '—'}</Row>
              <Row label={t('props.subject')}>{meta.subject || '—'}</Row>
              <Row label={t('props.format')}>{meta.format || book.formatLabel}</Row>
              {meta.pixels ? <Row label={t('props.pixels')}>{meta.pixels}</Row> : null}
              {meta.modality ? <Row label={t('props.modality')}>{meta.modality}</Row> : null}
              {meta.patient ? <Row label={t('props.patient')}>{meta.patient}</Row> : null}
              {meta.study ? <Row label={t('props.study')}>{meta.study}</Row> : null}
              <Row label={book.reflowable ? t('props.sections') : t('props.pages')}>{book.sectionCount}</Row>
              <Row label={t('panel.section')}>{section + 1}</Row>
              <Row label={t('props.file')} title={book.filePath || book.fileName}>{book.fileName || '—'}</Row>
              <Row label={t('props.fileSize')}>{formatBytes(book.fileSize)}</Row>
              <Row label={t('props.library')} title={libraryPath || t('props.notSaved')}>
                {libraryPath ? `${libraryPath.split(/[\\/]/).pop()}${dirty ? ' •' : ''}` : t('props.notSaved')}
              </Row>
              {meta.identifier ? <Row label={t('props.identifier')}>{meta.identifier}</Row> : null}
              {meta.description ? (
                <div className="prop-block" title={t('props.description')}>
                  <span className="prop-label">{t('props.description')}</span>
                  <p className="prop-text">{String(meta.description).slice(0, 600)}</p>
                </div>
              ) : null}
            </>
          )
        ) : null}

        {panel === 'reading' ? (
          <>
            <Row stack label={t('reading.font')}>
              <select
                className="input small"
                value={settings.readerFont}
                onChange={(e) => set({ readerFont: e.target.value })}
                title={t('reading.font')}
              >
                <option value="">{t('reading.defaultFont')}</option>
                {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
            </Row>
            <Row stack label={t('reading.size')}>
              <Stepper
                label={t('reading.size')}
                value={fontPixels(settings.fontScale)}
                min={fontPixels(FONT_SCALE_MIN)}
                max={fontPixels(FONT_SCALE_MAX)}
                step={1}
                unit="px"
                onChange={(v) => set({ fontScale: fontScaleOf(v) })}
              />
            </Row>
            <Row stack label={t('reading.lineHeight')}>
              <Stepper
                label={t('reading.lineHeight')}
                value={settings.lineHeight}
                min={1.1}
                max={2.6}
                step={0.05}
                decimals={2}
                onChange={(v) => set({ lineHeight: v })}
              />
            </Row>
            <Row stack label={t('reading.width')}>
              <select
                className="input small"
                value={String(settings.readingWidth)}
                onChange={(e) => set({ readingWidth: Number(e.target.value) })}
                title={t('reading.width')}
              >
                {READING_WIDTHS.map((w) => (
                  <option key={w} value={String(w)}>{w === 0 ? t('reading.widthFull') : `${w}px`}</option>
                ))}
              </select>
            </Row>
            <Row stack label={t('reading.gap')}>
              <Stepper
                label={t('reading.gap')}
                value={settings.paragraphGap}
                min={0}
                max={2.5}
                step={0.1}
                decimals={1}
                unit="em"
                onChange={(v) => set({ paragraphGap: v })}
              />
            </Row>
            <Row stack label={t('reading.letter')}>
              <Stepper
                label={t('reading.letter')}
                value={settings.letterSpacing}
                min={-1}
                max={4}
                step={0.5}
                decimals={1}
                unit="px"
                onChange={(v) => set({ letterSpacing: v })}
              />
            </Row>
            <Row stack label={t('reading.style')}>
              <span className="seg-row compact">
                <button
                  type="button"
                  className={`btn seg${settings.readerBold ? ' active' : ''}`}
                  style={{ fontWeight: 700 }}
                  onClick={() => set({ readerBold: !settings.readerBold })}
                  title={t('reading.bold')}
                >B</button>
                <button
                  type="button"
                  className={`btn seg${settings.readerItalic ? ' active' : ''}`}
                  style={{ fontStyle: 'italic' }}
                  onClick={() => set({ readerItalic: !settings.readerItalic })}
                  title={t('reading.italic')}
                >I</button>
                <button
                  type="button"
                  className={`btn seg${settings.readerUnderline ? ' active' : ''}`}
                  style={{ textDecoration: 'underline' }}
                  onClick={() => set({ readerUnderline: !settings.readerUnderline })}
                  title={t('reading.underline')}
                >U</button>
              </span>
            </Row>
            <Row fit label={t('reading.justify')}>
              <input
                type="checkbox"
                checked={settings.justify}
                onChange={(e) => set({ justify: e.target.checked })}
                title={t('reading.justify')}
              />
            </Row>
            <Row fit label={t('reading.indent')}>
              <input
                type="checkbox"
                checked={settings.paragraphIndent}
                onChange={(e) => set({ paragraphIndent: e.target.checked })}
                title={t('reading.indent')}
              />
            </Row>
            <Row
              stack
              label={t('reading.page')}
              title={pageFixed ? t('reading.pageFixed') : t('reading.pageHint')}
            >
              <select
                className="input small"
                value={settings.pagePreset || 'md'}
                disabled={pageFixed}
                aria-label={t('reading.page')}
                title={pageFixed ? t('reading.pageFixed') : t('reading.pageHint')}
                onChange={(e) => {
                  const id = e.target.value;
                  set(id === 'custom' ? pageCustomSettings(pageShown) : pagePresetSettings(id));
                }}
              >
                {PAGE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{t(PAGE_LABEL[preset.id])}</option>
                ))}
                <option value="custom">{t('reading.pageCustom')}</option>
              </select>
            </Row>
            <Row stack label={t('reading.pageWidth')}>
              <Stepper
                label={t('reading.pageWidth')}
                value={pageShown.width}
                min={PAGE_WIDTH_MIN}
                max={PAGE_WIDTH_MAX}
                step={10}
                unit="px"
                disabled={pageFixed}
                onChange={(n) => set(pageCustomSettings(pageShown, { width: n }))}
              />
            </Row>
            <Row stack label={t('reading.pageHeight')}>
              <Stepper
                label={t('reading.pageHeight')}
                value={pageShown.height}
                min={PAGE_HEIGHT_MIN}
                max={PAGE_HEIGHT_MAX}
                step={10}
                unit="px"
                disabled={pageFixed}
                onChange={(n) => set(pageCustomSettings(pageShown, { height: n }))}
              />
            </Row>
            <Row stack label={t('reading.layout')}>
              <span className="seg-row">
                {[['single', 'reading.single'], ['double', 'reading.double'], ['continuous', 'reading.scroll']].map(([layout, label]) => (
                  <button
                    key={layout}
                    type="button"
                    className={`btn seg${viewLayoutOf(settings, book) === layout ? ' active' : ''}`}
                    aria-pressed={viewLayoutOf(settings, book) === layout}
                    onClick={() => set(viewLayoutSettings(layout))}
                    title={t(`cmd.view${layout[0].toUpperCase()}${layout.slice(1)}`)}
                  >{t(label)}</button>
                ))}
              </span>
            </Row>
            <Row stack label={t('reading.columns')}>
              <span className="seg-row">
                {[1, 2].map((count) => {
                  const layout = viewLayoutOf(settings, book);
                  const onePage = layout === 'single';
                  const fixed = !!book && book.reflowable === false;
                  return (
                    <button
                      key={count}
                      type="button"
                      className={`btn seg${onePage && textColumnsOf(settings) === count ? ' active' : ''}`}
                      aria-pressed={onePage && textColumnsOf(settings) === count}
                      disabled={fixed || !onePage}
                      onClick={() => set(columnChoice(settings, book, count))}
                      title={fixed ? t('tip.columnsFixed') : layout === 'double' ? t('tip.columnsFacing') : onePage ? t(`cmd.columns${count}`) : t('tip.columnsFlow')}
                    >{t(`cmd.columns${count}`)}</button>
                  );
                })}
              </span>
            </Row>
            <Row stack label={t('reading.turn')}>
              <select
                className="input small"
                value={settings.pageTurn}
                onChange={(e) => set({ pageTurn: e.target.value })}
                title={t('reading.turn')}
                disabled={viewLayoutOf(settings, book) === 'continuous'}
              >
                <option value="none">{t('reading.turnNone')}</option>
                <option value="slide">{t('reading.turnSlide')}</option>
                <option value="flip">{t('reading.turnFlip')}</option>
              </select>
            </Row>
            <Row fit label={t('reading.invert')}>
              <input
                type="checkbox"
                checked={settings.invertPages}
                onChange={(e) => set({ invertPages: e.target.checked })}
                title={t('reading.invert')}
              />
            </Row>
            <div className="reading-preview" style={{
              fontFamily: settings.readerFont ? `'${settings.readerFont}'` : undefined,
              fontSize: `${fontPixels(settings.fontScale)}px`,
              lineHeight: settings.lineHeight,
              textAlign: settings.justify ? 'justify' : 'start',
              fontWeight: settings.readerBold ? 600 : 'normal',
              fontStyle: settings.readerItalic ? 'italic' : 'normal',
              textDecoration: settings.readerUnderline ? 'underline' : 'none',
              letterSpacing: `${settings.letterSpacing}px`,
            }}>
              {t('reading.preview')}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
