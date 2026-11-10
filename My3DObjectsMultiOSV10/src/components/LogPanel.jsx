import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconTerminal, IconCopy, IconSave, IconTrash, IconClose, IconDown, IconSearch } from './Icons.jsx';
import { filterLines, formatLines, timeText } from '../lib/logs.js';
import { clampLogHeight } from '../lib/settings.js';
import LinkText from './LinkText.jsx';

const SHOW_MAX = 1500;

// The bottom panel: everything the app, the desktop host and the engine log —
// installation, model loading, each conversion step — filterable, copyable
// and savable. Its top edge resizes it.
export default function LogPanel({ settings, onSettings, lines, onClear, onCopy, onSave, onLineMenu }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [src, setSrc] = useState('all');
  const bodyRef = useRef(null);
  const drag = useRef(null);
  const stick = useRef(true);

  const shown = useMemo(
    () => filterLines(lines, { level: settings.logLevel, text, src }),
    [lines, settings.logLevel, text, src],
  );
  const visible = shown.length > SHOW_MAX ? shown.slice(shown.length - SHOW_MAX) : shown;

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && settings.logAutoScroll && stick.current) el.scrollTop = el.scrollHeight;
  }, [visible, settings.logAutoScroll, settings.logPanel]);

  useEffect(() => { stick.current = true; }, [settings.logAutoScroll]);

  if (!settings.logPanel) return null;

  const onScroll = () => {
    const el = bodyRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { y: e.clientY, h: settings.logHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-log');
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const h = clampLogHeight(drag.current.h + (drag.current.y - e.clientY));
    onSettings((s) => ({ ...s, logHeight: h }));
  };
  const endDrag = (e) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
    document.body.classList.remove('resizing-log');
  };

  return (
    <section className="log-panel" style={{ height: settings.logHeight }} aria-label={t('log.title')}>
      <div
        className="log-splitter"
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="log-head">
        <span className="side-head-icon"><IconTerminal size={15} /></span>
        <span className="log-title">{t('log.title')}</span>
        <span className="log-count">{t('log.count', { shown: shown.length, total: lines.length })}</span>
        <span className="toolbar-spacer" />
        <label className="log-search" title={t('log.search')}>
          <IconSearch size={13} />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('log.search')} aria-label={t('log.search')} />
        </label>
        <select className="input log-select" value={src} onChange={(e) => setSrc(e.target.value)} title={t('log.source')}>
          {['all', 'app', 'host', 'engine'].map((s) => <option key={s} value={s}>{t(`log.src.${s}`)}</option>)}
        </select>
        <select
          className="input log-select"
          value={settings.logLevel}
          onChange={(e) => onSettings((s) => ({ ...s, logLevel: e.target.value }))}
          title={t('log.level')}
        >
          {['debug', 'info', 'warn', 'error'].map((l) => <option key={l} value={l}>{t(`log.lvl.${l}`)}</option>)}
        </select>
        <button
          className={`icon-btn${settings.logAutoScroll ? ' on' : ''}`}
          onClick={() => onSettings((s) => ({ ...s, logAutoScroll: !s.logAutoScroll }))}
          title={t('log.autoScroll')}
          aria-pressed={settings.logAutoScroll}
        >
          <IconDown size={15} />
        </button>
        <button className="icon-btn" onClick={() => onCopy(formatLines(shown))} title={t('log.copy')}><IconCopy size={15} /></button>
        <button className="icon-btn" onClick={() => onSave(formatLines(shown))} title={t('log.save')}><IconSave size={15} /></button>
        <button className="icon-btn" onClick={onClear} title={t('log.clear')}><IconTrash size={15} /></button>
        <button className="icon-btn" onClick={() => onSettings((s) => ({ ...s, logPanel: false }))} title={t('log.close')}><IconClose size={15} /></button>
      </div>
      <div
        className="log-body"
        ref={bodyRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        onContextMenu={(e) => {
          e.preventDefault();
          const row = e.target.closest('[data-line]');
          const line = row ? visible.find((l) => String(l.id) === row.dataset.line) : null;
          onLineMenu?.(e.clientX, e.clientY, line, formatLines(shown));
        }}
      >
        {visible.length === 0 ? <p className="log-empty">{t('log.empty')}</p> : visible.map((l) => (
          <div key={l.id} className={`log-line lvl-${l.level}`} data-line={l.id}>
            <span className="log-time">{timeText(l.t)}</span>
            <span className="log-lvl">{l.level.toUpperCase()}</span>
            <span className="log-src">{l.src}</span>
            <span className="log-msg"><LinkText text={l.msg} /></span>
          </div>
        ))}
      </div>
    </section>
  );
}
