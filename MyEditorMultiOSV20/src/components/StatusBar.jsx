// Status bar: a transient message on the left; on the right the cursor
// position, selection, document size, indentation, line ending, encoding,
// language and zoom — each a button opening the matching picker. The size
// grip (desktop) resizes the frameless window.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { isElectron, getWindowSize, setWindowSize } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';

function SizeGrip() {
  const start = useRef(null);
  const onDown = async (e) => {
    e.preventDefault();
    const [w, h] = await getWindowSize();
    start.current = { x: e.screenX, y: e.screenY, w, h };
    const move = (ev) => { if (start.current) setWindowSize(start.current.w + (ev.screenX - start.current.x), start.current.h + (ev.screenY - start.current.y)); };
    const up = () => { start.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <span className="size-grip" title={t('win_resize')} onMouseDown={onDown}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="10" cy="2" r="1.2" /><circle cx="6" cy="6" r="1.2" /><circle cx="10" cy="6" r="1.2" /><circle cx="2" cy="10" r="1.2" /><circle cx="6" cy="10" r="1.2" /><circle cx="10" cy="10" r="1.2" /></svg>
    </span>
  );
}

const fmt = (n) => n.toLocaleString();

export function StatusBar({ message, cursor, doc, settings, zoom, pickers, onAction, lint }) {
  useLanguage();
  const [menu, setMenu] = useState(null);   // { kind, el }
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (!message) return; setFlash(true); const id = setTimeout(() => setFlash(false), 600); return () => clearTimeout(id); }, [message]);

  const open = (kind) => (e) => setMenu(menu && menu.kind === kind ? null : { kind, el: e.currentTarget });
  const items = menu ? pickers[menu.kind]() : null;
  const sel = cursor.selected
    ? (cursor.selLines > 1 ? t('st_sel_lines', { n: fmt(cursor.selected), l: cursor.selLines }) : t('st_sel', { n: fmt(cursor.selected) }))
    : null;

  return (
    <div className={`statusbar ${isElectron ? 'has-grip' : ''}`}>
      <span className={`status-text ellipsis ${flash ? 'flash' : ''}`}>{message || t('ready')}</span>
      <span className="st-field" title={t('st_pos', { line: cursor.line, col: cursor.col })}>{t('st_pos', { line: fmt(cursor.line), col: fmt(cursor.col) })}{cursor.ranges > 1 ? ` ×${cursor.ranges}` : ''}</span>
      {sel && <span className="st-field st-sel">{sel}</span>}
      <span className="st-field muted">{t('st_size', { chars: fmt(cursor.chars), lines: fmt(cursor.lines) })}</span>
      {settings.lint && doc && (
        <button className={`st-btn st-lint ${lint && lint.pending ? 'pending' : ''} ${lint && lint.error ? 'has-error' : lint && lint.warning ? 'has-warning' : ''}`} title={lint ? (lint.error_msg || (lint.tool ? t('st_lint_tool', { tool: lint.tool }) : t('st_lint_none'))) : t('st_lint_none')} onClick={() => onAction('lintPanel')}>
          <Icon name="lint" size={13} />
          {lint && lint.tool ? (lint.total ? `${lint.error ? `✕ ${lint.error}` : ''}${lint.error && lint.warning ? ' ' : ''}${lint.warning ? `⚠ ${lint.warning}` : ''}${lint.info ? ` ℹ ${lint.info}` : ''}` : '✓') : '—'}
        </button>
      )}
      <button className="st-btn" title={t('st_indent')} onClick={open('indent')}>{settings.insertSpaces ? t('st_spaces', { n: settings.tabSize }) : t('st_tabs', { n: settings.tabSize })}</button>
      <button className="st-btn" title={t('st_eol')} onClick={open('eol')}>{doc ? { crlf: 'CRLF', lf: 'LF', cr: 'CR' }[doc.eol] : '—'}</button>
      <button className="st-btn" title={t('st_enc')} onClick={open('encoding')}>{doc ? doc.encodingLabel : '—'}</button>
      <button className="st-btn" title={t('st_lang')} onClick={open('language')}><Icon name="code" size={13} />{doc ? (doc.langName || t('lang_plain')) : '—'}</button>
      <button className="st-btn" title={t('zoom_reset')} onClick={() => onAction('zoomReset')}>{t('st_zoom', { n: zoom })}</button>
      {isElectron && <SizeGrip />}
      {menu && items && (
        <ContextMenu anchorEl={menu.el} above x={0} y={0} items={items} className="st-menu" onClose={() => setMenu(null)}
          onPick={(id) => { setMenu(null); onAction(id); }} />
      )}
    </div>
  );
}

export default StatusBar;
