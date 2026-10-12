import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Icon } from './Icons.jsx';
import { formatBytes } from '../lib/format.js';
import { HISTORY_WIDTH } from '../lib/settings.js';

const SOURCE_ICON = { screen: 'screen', window: 'window', region: 'region', recording: 'video' };

function dayKey(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Entries grouped by day, newest first: [{ key, label, items }]. */
function groupByDay(items, t, locale) {
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86400000);
  const groups = [];
  for (const e of items) {
    const key = dayKey(e.time);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const label = key === today ? t('history.today') : key === yesterday ? t('history.yesterday')
        : new Date(e.time).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
      g = { key, label, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }
  return groups;
}

function HistoryItem({ entry, active, missing, canReveal, locale, onOpen, onReveal, onRemove, onContextMenu }) {
  const { t } = useTranslation();
  const time = new Date(entry.time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const meta = [time, entry.width && entry.height ? `${entry.width}×${entry.height}` : '', entry.bytes ? formatBytes(entry.bytes) : ''].filter(Boolean).join(' · ');
  return (
    <div
      className={`hist-item${active ? ' active' : ''}${missing ? ' missing' : ''}`}
      onClick={() => onOpen(entry)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
      data-tip={missing ? `${entry.path}\n${t('history.missing')}` : entry.path || entry.name}
    >
      <div className="hist-thumb">
        {entry.thumb ? <img src={entry.thumb} alt="" draggable={false} /> : <Icon name={entry.kind === 'video' ? 'video' : 'image'} />}
        {entry.kind === 'video' ? <span className="hist-badge"><Icon name="play" /></span> : null}
      </div>
      <div className="hist-info">
        <div className="hist-name"><Icon name={SOURCE_ICON[entry.source] || 'image'} />{entry.name}</div>
        <div className="hist-meta">{missing ? <span className="hist-missing">{t('history.missing')}</span> : meta}</div>
      </div>
      <div className="hist-actions">
        {canReveal ? (
          <button type="button" data-tip={t('history.reveal')} aria-label={t('history.reveal')} disabled={missing} onClick={(e) => { e.stopPropagation(); onReveal(entry); }}>
            <Icon name="folder" />
          </button>
        ) : null}
        <button type="button" className="x" data-tip={t('history.remove')} aria-label={t('history.remove')} onClick={(e) => { e.stopPropagation(); onRemove(entry); }}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}

/**
 * The collapsible capture history on the right of the window. It only lists
 * files: removing an entry (or all of them) leaves the files where they are.
 */
export function HistoryPanel({ items, open, width, activePath, missing, canReveal, onToggle, onResize, onOpen, onReveal, onRemove, onClear, onOpenFolder, onContextMenu }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
  const groups = useMemo(() => groupByDay(items, t, locale), [items, t, locale]);
  const drag = useRef(null);

  if (!open) {
    return (
      <aside className="history collapsed">
        <button type="button" className="history-strip" onClick={onToggle} data-tip={t('history.expandTip')} aria-label={t('history.expand')}>
          <Icon name="chevronLeft" />
          <Icon name="recent" className="strip-icon" />
          <span className="history-strip-label">{t('history.title')}</span>
          {items.length ? <span className="history-count">{items.length}</span> : null}
        </button>
      </aside>
    );
  }

  const startResize = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width };
  };
  const moveResize = (e) => {
    if (!drag.current) return;
    const w = Math.min(HISTORY_WIDTH.max, Math.max(HISTORY_WIDTH.min, drag.current.w + drag.current.x - e.clientX));
    onResize(Math.round(w));
  };
  const endResize = () => { drag.current = null; };

  return (
    <aside className="history" style={{ width }}>
      <div className="history-resize" onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} />
      <header className="history-head">
        <Icon name="recent" />
        <span className="history-title" data-tip={t('history.title')}>{t('history.title')}</span>
        {items.length ? <span className="history-count">{items.length}</span> : null}
        <span className="history-spacer" />
        <span className="history-head-btns">
          {canReveal ? (
            <button type="button" data-tip={t('history.openFolderTip')} aria-label={t('history.openFolder')} onClick={onOpenFolder}><Icon name="folder" /></button>
          ) : null}
          <button type="button" data-tip={t('history.clearTip')} aria-label={t('history.clear')} disabled={!items.length} onClick={onClear}><Icon name="trash" /></button>
          <button type="button" data-tip={t('history.collapseTip')} aria-label={t('history.collapse')} onClick={onToggle}><Icon name="chevronRight" /></button>
        </span>
      </header>
      <div className="history-list">
        {groups.length ? groups.map((g) => (
          <section key={g.key} className="hist-group">
            <div className="hist-day">{g.label}</div>
            {g.items.map((e) => (
              <HistoryItem
                key={e.id}
                entry={e}
                active={!!activePath && e.path === activePath}
                missing={missing.has(e.id)}
                canReveal={canReveal && !!e.path}
                locale={locale}
                onOpen={onOpen}
                onReveal={onReveal}
                onRemove={onRemove}
                onContextMenu={onContextMenu}
              />
            ))}
          </section>
        )) : (
          <div className="history-empty">
            <Icon name="camera" />
            <div>{t('history.empty')}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
