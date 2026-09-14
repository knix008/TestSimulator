// "서버 (Server)" — a flat listing of the current server folder with a [..]
// row to go up (the original's server tree). Double-click a folder to enter
// it, a file to download it. Multi-select with Ctrl / Shift.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { formatSize, formatDate, iconFor } from '../lib/format';
import { Icon } from './Icons';

export function RemotePanel({ connected, path, parent, entries, loading, error, selection, onSelection, onNavigate, onOpenFile, onContextMenu, onRefresh, active, onActivate }) {
  useLanguage();
  const [cursor, setCursor] = useState(null);   // path of the row with keyboard focus
  const anchor = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => { setCursor(null); anchor.current = null; }, [path, connected]);

  const rows = [];
  if (connected && parent !== null && parent !== undefined) rows.push({ up: true, name: t('parent_dir'), path: parent, isDir: true });
  for (const e of entries) rows.push(e);

  const select = (row, e) => {
    onActivate();
    if (row.up) { onSelection(new Set()); setCursor(row.path); anchor.current = null; return; }
    const next = new Set(e.ctrlKey || e.metaKey ? selection : []);
    if (e.shiftKey && anchor.current) {
      const a = rows.findIndex((r) => r.path === anchor.current);
      const b = rows.findIndex((r) => r.path === row.path);
      if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (!rows[i].up) next.add(rows[i].path);
    } else if (e.ctrlKey || e.metaKey) {
      if (next.has(row.path)) next.delete(row.path); else next.add(row.path);
      anchor.current = row.path;
    } else {
      next.add(row.path);
      anchor.current = row.path;
    }
    setCursor(row.path);
    onSelection(next);
  };

  const open = (row) => {
    if (row.isDir) onNavigate(row.path);
    else onOpenFile(row);
  };

  const onKey = (e) => {
    if (!rows.length) return;
    const i = rows.findIndex((r) => r.path === cursor);
    const move = (j) => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, j))];
      setCursor(row.path);
      if (!row.up) { onSelection(new Set([row.path])); anchor.current = row.path; } else onSelection(new Set());
      const el = bodyRef.current && bodyRef.current.querySelector(`[data-path="${CSS.escape(row.path)}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    };
    if (e.key === 'ArrowDown') { e.preventDefault(); move(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(rows.length - 1); }
    else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); open(rows[i]); }
    else if (e.key === 'Backspace' && parent) { e.preventDefault(); onNavigate(parent); }
    else if (e.key === 'F5') { e.preventDefault(); onRefresh(); }
    else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSelection(new Set(entries.map((x) => x.path))); }
  };

  const ctx = (e, row) => {
    e.preventDefault();
    onActivate();
    if (row && !row.up && !selection.has(row.path)) { onSelection(new Set([row.path])); anchor.current = row.path; setCursor(row.path); }
    onContextMenu(e.clientX, e.clientY, row && !row.up ? row : null);
  };

  return (
    <div className={`panel remote-panel ${active ? 'active' : ''}`} onMouseDown={onActivate}>
      <div className="panel-head">
        <Icon name="server" />
        <span className="panel-title">{t('server')}</span>
        {connected && <span className="panel-path mono" title={path}>│&nbsp; {path}</span>}
        <span className="spacer" />
        {connected && <button className="icon-btn" title={t('ctx_refresh')} onClick={onRefresh}><Icon name="refresh" /></button>}
      </div>
      <div className="table-wrap" tabIndex={0} onKeyDown={onKey} ref={bodyRef} onContextMenu={(e) => ctx(e, null)}>
        {!connected && <div className="panel-empty muted">{t('not_connected_hint')}</div>}
        {connected && error && <div className="panel-empty danger">{error}</div>}
        {connected && !error && (
          <table className="file-table">
            <thead>
              <tr><th className="c-name">{t('col_name')}</th><th className="c-size">{t('col_size')}</th><th className="c-date">{t('col_date')}</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.up ? '..' : row.path} data-path={row.path}
                  className={`${selection.has(row.path) ? 'selected' : ''} ${cursor === row.path ? 'cursor' : ''} ${row.up ? 'up-row' : ''}`}
                  onMouseDown={(e) => { if (e.button === 0) select(row, e); }}
                  onDoubleClick={() => open(row)}
                  onContextMenu={(e) => { e.stopPropagation(); ctx(e, row); }}>
                  <td className="c-name">
                    <Icon name={row.up ? 'folderUp' : iconFor(row.name, row.isDir)} className={row.isDir ? 'ic-folder' : 'ic-file'} />
                    <span>{row.name}</span>
                    {row.isLink && <Icon name="link" size={12} className="ic-link" />}
                  </td>
                  <td className="c-size">{row.up ? '' : row.isDir ? t('dir_marker') : formatSize(row.size)}</td>
                  <td className="c-date">{row.up ? '' : row.mtime ? formatDate(row.mtime) : (row.rawDate || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {loading && <div className="panel-loading">{t('loading')}</div>}
      </div>
      <div className="panel-status">
        {connected ? (selection.size ? t('selected_count', { n: selection.size }) : t('items_count', { n: entries.length })) : ''}
      </div>
    </div>
  );
}

export default RemotePanel;
