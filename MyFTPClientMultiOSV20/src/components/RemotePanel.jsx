// "서버 (Server)" — a flat listing of the current server folder with a [..]
// row to go up (the original's server tree). Double-click a folder to enter
// it, a file to download it. Multi-select with Ctrl / Shift. Rows drag to the
// local tree, into a server folder, or out of the window (lib/filedrag.js);
// Del deletes, F2 renames, Ctrl+C / X / V copy, cut and paste.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { formatSize, formatDate, iconFor } from '../lib/format';
import { armRowDrag } from '../lib/filedrag';
import { Icon } from './Icons';

// Ctrl+C / X / V by physical key, so a Korean IME layout works too.
export const CLIPBOARD_KEYS = { KeyC: 'copy', KeyX: 'cut', KeyV: 'paste' };

export function RemotePanel({ connected, path, parent, entries, loading, error, selection, onSelection, onNavigate, onOpenFile, onContextMenu, onRefresh, active, onActivate, onDelete, onRename, onClipboard, dropRow, dropOver, cutPaths }) {
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
    return next;
  };

  // A press on a row that is already selected keeps the selection, so several
  // rows can be dragged; it shrinks to that row only if no drag follows.
  const press = (row, e) => {
    if (row.up) { select(row, e); return; }
    const keep = !e.ctrlKey && !e.metaKey && !e.shiftKey && selection.has(row.path);
    let next = selection;
    if (keep) { onActivate(); setCursor(row.path); } else next = select(row, e);
    armRowDrag(e, () => ({ side: 'server', items: entries.filter((x) => next.has(x.path)) }), {
      onClick: keep ? () => select(row, { ctrlKey: false, metaKey: false, shiftKey: false }) : null,
      countLabel: (n) => t('items_count', { n }),
    });
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
    else if (e.code === 'KeyA' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSelection(new Set(entries.map((x) => x.path))); }
    else if (e.key === 'Delete' && selection.size) { e.preventDefault(); onDelete(); }
    else if (e.key === 'F2' && selection.size === 1) { e.preventDefault(); onRename(); }
    else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && CLIPBOARD_KEYS[e.code]) { e.preventDefault(); onClipboard(CLIPBOARD_KEYS[e.code]); }
  };

  const ctx = (e, row) => {
    e.preventDefault();
    onActivate();
    if (row && !row.up && !selection.has(row.path)) { onSelection(new Set([row.path])); anchor.current = row.path; setCursor(row.path); }
    onContextMenu(e.clientX, e.clientY, row && !row.up ? row : null);
  };

  return (
    <div className={`panel remote-panel ${active ? 'active' : ''} ${dropOver ? 'drop-over' : ''}`} onMouseDown={onActivate} data-drop-side={connected ? 'server' : undefined}>
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
                <tr key={row.up ? '..' : row.path} data-path={row.path} data-dir={row.isDir ? '1' : undefined}
                  className={`${selection.has(row.path) ? 'selected' : ''} ${cursor === row.path ? 'cursor' : ''} ${row.up ? 'up-row' : ''} ${dropRow === row.path ? 'drop-target' : ''} ${!row.up && cutPaths && cutPaths.has(row.path) ? 'cut' : ''}`}
                  onMouseDown={(e) => { if (e.button === 0) press(row, e); }}
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
