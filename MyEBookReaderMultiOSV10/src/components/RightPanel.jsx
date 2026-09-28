import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconInfo, IconTextSize, IconNote, IconHighlight, IconTrash, IconCover, IconCopy,
} from './Icons.jsx';
import { READING_WIDTHS } from '../lib/view.js';
import { PANEL_WIDTH_MAX, PANEL_WIDTH_MIN } from '../lib/settings.js';
import { formatBytes } from '../lib/platform.js';
import { getSystemFonts } from '../lib/fonts.js';

// The right panel: the properties of what you are reading, and the knobs that
// change how it looks. Everything here is one row per item, so the panel reads
// as a list of settings rather than a form.

const TABS = [
  { id: 'properties', icon: IconInfo, label: 'panel.properties' },
  { id: 'reading', icon: IconTextSize, label: 'panel.reading' },
  { id: 'notes', icon: IconNote, label: 'panel.notes' },
];

function Resizer({ width, onResize }) {
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
        onResize(Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, d.w0 + (d.x0 - e.clientX))));
      }}
      onPointerUp={(e) => { drag.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); }}
      onPointerCancel={(e) => { drag.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); }}
    />
  );
}

function Row({ label, children, title }) {
  return (
    <div className="prop-row" title={title || label}>
      <span className="prop-label">{label}</span>
      <span className="prop-value">{children}</span>
    </div>
  );
}

export default function RightPanel({
  panel, width, onPanel, onResize,
  book, section, settings, onSettings, libraryPath, dirty,
  highlights, notes, onGoToMark, onRemoveMark, onCopyMark,
}) {
  const { t } = useTranslation();
  const [fonts, setFonts] = useState([]);
  const [cover, setCover] = useState('');

  useEffect(() => {
    if (panel !== 'reading') return;
    getSystemFonts().then(setFonts).catch(() => setFonts([]));
  }, [panel]);

  useEffect(() => {
    if (panel !== 'properties' || !book) { setCover(''); return; }
    try { setCover(book.cover() || ''); } catch { setCover(''); }
  }, [panel, book]);

  if (panel === 'none') return null;

  const set = (patch) => onSettings({ ...settings, ...patch });
  const meta = book?.meta || {};

  return (
    <aside className="side-panel right" style={{ width }} aria-label={t('panel.right')}>
      <Resizer width={width} onResize={onResize} />

      <div className="panel-tabs" role="tablist" aria-label={t('panel.right')}>
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

      <div className="panel-body">
        {panel === 'properties' ? (
          !book ? <p className="panel-note">{t('panel.empty')}</p> : (
            <>
              {cover ? (
                <div className="cover-wrap" title={t('props.cover')}>
                  <img className="cover-image" src={cover} alt={t('props.cover')} />
                </div>
              ) : (
                <div className="cover-wrap empty" title={t('props.cover')}>
                  <IconCover size={40} />
                </div>
              )}
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
            <Row label={t('reading.font')}>
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
            <Row label={`${t('reading.size')} · ${Math.round(settings.fontScale * 100)}%`}>
              <input
                type="range"
                className="range"
                min="60"
                max="300"
                step="5"
                value={Math.round(settings.fontScale * 100)}
                onChange={(e) => set({ fontScale: Number(e.target.value) / 100 })}
                title={t('reading.size')}
              />
            </Row>
            <Row label={`${t('reading.lineHeight')} · ${settings.lineHeight.toFixed(2)}`}>
              <input
                type="range"
                className="range"
                min="110"
                max="260"
                step="5"
                value={Math.round(settings.lineHeight * 100)}
                onChange={(e) => set({ lineHeight: Number(e.target.value) / 100 })}
                title={t('reading.lineHeight')}
              />
            </Row>
            <Row label={t('reading.width')}>
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
            <Row label={`${t('reading.gap')} · ${settings.paragraphGap.toFixed(1)}em`}>
              <input
                type="range"
                className="range"
                min="0"
                max="25"
                step="1"
                value={Math.round(settings.paragraphGap * 10)}
                onChange={(e) => set({ paragraphGap: Number(e.target.value) / 10 })}
                title={t('reading.gap')}
              />
            </Row>
            <Row label={`${t('reading.letter')} · ${settings.letterSpacing}px`}>
              <input
                type="range"
                className="range"
                min="-1"
                max="4"
                step="0.5"
                value={settings.letterSpacing}
                onChange={(e) => set({ letterSpacing: Number(e.target.value) })}
                title={t('reading.letter')}
              />
            </Row>
            <Row label={t('reading.style')}>
              <span className="seg-row">
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
            <Row label={t('reading.justify')}>
              <input
                type="checkbox"
                checked={settings.justify}
                onChange={(e) => set({ justify: e.target.checked })}
                title={t('reading.justify')}
              />
            </Row>
            <Row label={t('reading.indent')}>
              <input
                type="checkbox"
                checked={settings.paragraphIndent}
                onChange={(e) => set({ paragraphIndent: e.target.checked })}
                title={t('reading.indent')}
              />
            </Row>
            <Row label={t('reading.mode')}>
              <span className="seg-row">
                <button
                  type="button"
                  className={`btn seg${settings.pageMode === 'scroll' ? ' active' : ''}`}
                  onClick={() => set({ pageMode: 'scroll' })}
                  title={t('reading.scroll')}
                >{t('reading.scroll')}</button>
                <button
                  type="button"
                  className={`btn seg${settings.pageMode === 'paged' ? ' active' : ''}`}
                  onClick={() => set({ pageMode: 'paged' })}
                  title={t('reading.paged')}
                >{t('reading.paged')}</button>
              </span>
            </Row>
            <Row label={t('reading.columns')}>
              <input
                type="checkbox"
                checked={settings.twoColumns}
                onChange={(e) => set({ twoColumns: e.target.checked })}
                title={t('reading.columns')}
              />
            </Row>
            <Row label={t('reading.spread')}>
              <span className="seg-row">
                <button
                  type="button"
                  className={`btn seg${settings.spread === 'single' ? ' active' : ''}`}
                  onClick={() => set({ spread: 'single' })}
                  title={t('cmd.spreadSingle')}
                >{t('reading.single')}</button>
                <button
                  type="button"
                  className={`btn seg${settings.spread === 'double' ? ' active' : ''}`}
                  onClick={() => set({ spread: 'double' })}
                  title={t('cmd.spreadDouble')}
                >{t('reading.double')}</button>
              </span>
            </Row>
            <Row label={t('reading.turn')}>
              <select
                className="input small"
                value={settings.pageTurn}
                onChange={(e) => set({ pageTurn: e.target.value })}
                title={t('reading.turn')}
              >
                <option value="none">{t('reading.turnNone')}</option>
                <option value="slide">{t('reading.turnSlide')}</option>
                <option value="flip">{t('reading.turnFlip')}</option>
              </select>
            </Row>
            <Row label={t('reading.invert')}>
              <input
                type="checkbox"
                checked={settings.invertPages}
                onChange={(e) => set({ invertPages: e.target.checked })}
                title={t('reading.invert')}
              />
            </Row>
            <div className="reading-preview" style={{
              fontFamily: settings.readerFont ? `'${settings.readerFont}'` : undefined,
              fontSize: `${Math.round(17 * settings.fontScale)}px`,
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

        {panel === 'notes' ? (
          (!highlights?.length && !notes?.length)
            ? <p className="panel-note">{t('panel.noNotes')}</p>
            : (
              <ul className="mark-list">
                {(highlights || []).map((mark) => (
                  <li key={mark.id}>
                    <button
                      type="button"
                      className="mark-row"
                      onClick={() => onGoToMark(mark)}
                      title={mark.text}
                    >
                      <IconHighlight size={14} />
                      <span className="mark-label">{mark.text}</span>
                      <span className="mark-where">{(mark.section ?? 0) + 1}</span>
                    </button>
                    <button type="button" className="icon-btn" onClick={() => onCopyMark(mark)} title={t('cmd.copySelection')} aria-label={t('cmd.copySelection')}>
                      <IconCopy size={14} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => onRemoveMark(mark.id, 'highlight')} title={t('panel.remove')} aria-label={t('panel.remove')}>
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
                {(notes || []).map((mark) => (
                  <li key={mark.id}>
                    <button
                      type="button"
                      className="mark-row"
                      onClick={() => onGoToMark(mark)}
                      title={mark.note || mark.text}
                    >
                      <IconNote size={14} />
                      <span className="mark-label">{mark.note || mark.text}</span>
                      <span className="mark-where">{(mark.section ?? 0) + 1}</span>
                    </button>
                    <button type="button" className="icon-btn" onClick={() => onCopyMark(mark)} title={t('cmd.copySelection')} aria-label={t('cmd.copySelection')}>
                      <IconCopy size={14} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => onRemoveMark(mark.id, 'note')} title={t('panel.remove')} aria-label={t('panel.remove')}>
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )
        ) : null}
      </div>
    </aside>
  );
}
