// Search window (툴바 검색 / F9): a separate, non-modal window that finds
// folders and files by name pattern (and files by content) under the active
// panel's folder and every folder below it. In the results:
//   • Enter / double-click on a folder opens it in the LEFT panel, on a file
//     runs the program the system has for it;
//   • Ctrl+C copies the selected items to the clipboard (as the panels do),
//     so they can be pasted into any panel folder with Ctrl+V; the context
//     menu also copies them straight into the left or right panel's folder.
// The window can be dragged by its title bar and stays open while the
// panels are used.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { runJob, cancelJob } from '../lib/backend';
import { Icon } from '../components/Icons';
import { ContextMenu } from '../components/ContextMenu';
import { baseName, dirName, formatSize, typeDisplay } from '../lib/format';

export function SearchDialog({ root, onClose, onOpenDir, onOpenFile, onClipCopy, onCopyTo, windowed = false, docked = false, onRoot }) {
  useLanguage();
  const [pattern, setPattern] = useState('*');
  const [matchContent, setMatchContent] = useState(false);
  const [content, setContent] = useState('');
  const [matchMode, setMatchMode] = useState('contains');   // contains | exact | regex
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState([]);      // [{ path, isDir, size }]
  const [status, setStatus] = useState(t('search_hint'));
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const [anchor, setAnchor] = useState(-1);
  const [menu, setMenu] = useState(null);           // { x, y }
  const [pos, setPos] = useState(null);             // dragged position { left, top }; null = centred
  const jobId = useRef(null);
  const patternRef = useRef(null);
  const listRef = useRef(null);
  const winRef = useRef(null);

  useEffect(() => { if (patternRef.current) patternRef.current.focus(); }, []);
  useEffect(() => { if (windowed && !docked) document.title = t('search_title', { root }); }, [windowed, docked, root]);
  useEffect(() => () => { if (jobId.current) cancelJob(jobId.current).catch(() => {}); }, []);

  const start = async (e) => {
    if (e) e.preventDefault();
    if (running) return;
    setResults([]); setSelected(new Set()); setCursor(-1); setAnchor(-1);
    setRunning(true);
    setStatus(t('searching', { n: 0, path: '' }));
    try {
      const final = await runJob('search.start', { root, pattern: pattern || '*', content, matchContent, matchMode, caseSensitive }, (snap) => {
        jobId.current = snap.id;
        if (snap.status === 'running') setStatus(t('searching', { n: (snap.result && snap.result.count) || 0, path: snap.detail || '' }));
      });
      jobId.current = null;
      const found = (final.result && final.result.found) || [];
      setResults(found);
      if (final.status === 'done') setStatus(t('search_done', { n: found.length }));
      else if (final.status === 'cancelled') setStatus(t('search_cancelled', { n: found.length }));
      else setStatus(t('panel_error', { msg: final.error }));
    } catch (err) {
      setStatus(t('panel_error', { msg: err.message }));
    } finally {
      setRunning(false);
    }
  };
  const stop = () => { if (jobId.current) cancelJob(jobId.current).catch(() => {}); };
  const clear = () => { setResults([]); setSelected(new Set()); setCursor(-1); setStatus(t('search_cleared')); };

  // ── Selection (as in the panels: click, Ctrl+click, Shift+click, keyboard) ──
  const selectIndex = (i, { toggle = false, range = false } = {}) => {
    const e = results[i];
    if (!e) return;
    setCursor(i);
    if (range && anchor >= 0) {
      const [a, b] = anchor < i ? [anchor, i] : [i, anchor];
      const next = new Set();
      for (let k = a; k <= b; k++) next.add(results[k].path);
      setSelected(next);
      return;
    }
    setAnchor(i);
    if (toggle) { const next = new Set(selected); if (next.has(e.path)) next.delete(e.path); else next.add(e.path); setSelected(next); return; }
    setSelected(new Set([e.path]));
  };
  const selectedEntries = useMemo(() => results.filter((e) => selected.has(e.path)), [results, selected]);
  const selectedPaths = selectedEntries.map((e) => e.path);

  // ── Actions ──
  const activate = (e) => { if (!e) return; if (e.isDir) onOpenDir(e.path); else onOpenFile(e.path); };
  const copyClip = () => { if (selectedPaths.length) onClipCopy(selectedPaths); };
  const openInLeft = () => { const e = selectedEntries[0]; if (e) onOpenDir(e.isDir ? e.path : dirName(e.path)); };

  const onListKey = (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowDown') { e.preventDefault(); const i = Math.min(results.length - 1, cursor + 1); selectIndex(i, { range: e.shiftKey }); scrollTo(i); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); const i = Math.max(0, cursor - 1); selectIndex(i, { range: e.shiftKey }); scrollTo(i); }
    else if (e.key === 'Home') { e.preventDefault(); selectIndex(0, { range: e.shiftKey }); scrollTo(0); }
    else if (e.key === 'End') { e.preventDefault(); selectIndex(results.length - 1, { range: e.shiftKey }); scrollTo(results.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); activate(results[cursor]); }
    else if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(results.map((r) => r.path))); }
    else if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copyClip(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const scrollTo = (i) => { const row = listRef.current && listRef.current.querySelector(`[data-index="${i}"]`); if (row) row.scrollIntoView({ block: 'nearest' }); };

  const onRowMouseDown = (ev, i) => {
    if (ev.button === 2) { if (!selected.has(results[i].path)) selectIndex(i); return; }
    if (ev.button !== 0) return;
    selectIndex(i, { toggle: ev.ctrlKey || ev.metaKey, range: ev.shiftKey });
  };
  const onContextMenu = (ev) => { ev.preventDefault(); if (results.length) setMenu({ x: ev.clientX, y: ev.clientY }); };
  const one = selectedEntries.length === 1, any = selectedEntries.length > 0;
  const menuItems = [
    { id: 'open', label: t('ctx_open'), icon: 'open', disabled: !one },
    { id: 'openLeft', label: t('search_open_left'), icon: 'folderOpen', disabled: !one },
    { sep: true },
    { id: 'clipCopy', label: t('ctx_copy'), icon: 'copy', disabled: !any, shortcut: 'Ctrl+C' },
    { id: 'copyLeft', label: t('search_copy_left'), icon: 'copy', disabled: !any },
    { id: 'copyRight', label: t('search_copy_right'), icon: 'copy', disabled: !any },
  ];
  const onMenuPick = (id) => {
    setMenu(null);
    if (id === 'open') activate(selectedEntries[0]);
    else if (id === 'openLeft') openInLeft();
    else if (id === 'clipCopy') copyClip();
    else if (id === 'copyLeft') onCopyTo('left', selectedPaths);
    else if (id === 'copyRight') onCopyTo('right', selectedPaths);
  };

  // ── Drag the window by its title bar ──
  const onTitleDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const r = winRef.current.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => setPos({ left: Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - dx)), top: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy)) });
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const rel = (p) => { const d = dirName(p); const r = root.replace(/[\\/]+$/, ''); return d.toLowerCase().startsWith(r.toLowerCase()) ? (d.slice(r.length).replace(/^[\\/]/, '') || '.') : d; };

  return (
    <div className={`search-window ${windowed || docked ? 'windowed' : ''} ${docked ? 'docked' : ''} ${pos ? 'dragged' : ''}`} ref={winRef} style={windowed || docked ? undefined : (pos || undefined)} role="dialog" aria-label={t('search_title', { root })}
      onKeyDown={(e) => { if (e.key === 'Escape' && e.target.tagName !== 'INPUT') onClose(); e.stopPropagation(); }}>
      {docked && (
        <div className="search-root"><Icon name="folder" size={13} /><span className="ellipsis" title={root}>{root}</span>{onRoot && <button type="button" className="btn small" onClick={onRoot} title={t('search_root_tip')}>{t('search_root_active')}</button>}</div>
      )}
      {/* This window's title bar, drawn in the page so it follows the theme (src/lib/titlebar.js).
          Without it the window had none at all: the native caption is hidden, and the window controls
          drawn in its place came down on the first row of the form. */}
      {windowed && !docked && (
        <div className="dlg-caption">
          <Icon name="search" />
          <span className="ellipsis" title={root}>{t('search_title', { root })}</span>
        </div>
      )}
      {!windowed && !docked && (
        <div className="dlg-title" onMouseDown={onTitleDown} style={{ cursor: 'move' }}>
          <Icon name="search" />
          <span className="ellipsis" title={root}>{t('search_title', { root })}</span>
          <button className="dlg-x" onClick={onClose} title={t('close')}><Icon name="close" /></button>
        </div>
      )}
      <div className="dlg-body">
        {/* Enter in either field starts the search: the form always has a submit button (a form with two
            text fields would not submit implicitly otherwise) — visible next to the name in the docked tab. */}
        {/* Row 1: the name and, in the docked tab, start / clear. Row 2 (under the name): the options as
            icon toggles with a label and a tooltip — content search + its text, whole-name, regex, match case.
            Enter in any field submits: the form always contains a submit button. */}
        <form onSubmit={start} className="search-form">
          <div className="search-row">
            <label>{t('lbl_pattern')}</label>
            <input ref={patternRef} value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} />
            {running
              ? <button type="button" className="btn" onClick={stop}>{t('search_stop')}</button>
              : <button type="submit" className="btn primary"><Icon name="search" size={14} /> {t('search_start')}</button>}
            <button type="button" className="btn" onClick={clear} disabled={running || !results.length}>{t('search_clear')}</button>
          </div>
          <div className="search-row search-opts">
            <button type="button" className={`opt-btn ${matchContent ? 'on' : ''}`} title={t('tip_opt_content')} aria-pressed={matchContent} onClick={() => setMatchContent(!matchContent)}><Icon name="contentSearch" size={14} /><span>{t('opt_content')}</span></button>
            <input value={content} onChange={(e) => setContent(e.target.value)} disabled={!matchContent} spellCheck={false} placeholder={t('search_content_hint')} />
            <button type="button" className={`opt-btn ${matchMode === 'exact' ? 'on' : ''}`} title={t('tip_opt_exact')} aria-pressed={matchMode === 'exact'} onClick={() => setMatchMode(matchMode === 'exact' ? 'contains' : 'exact')}><Icon name="exact" size={14} /><span>{t('opt_exact')}</span></button>
            <button type="button" className={`opt-btn ${matchMode === 'regex' ? 'on' : ''}`} title={t('tip_opt_regex')} aria-pressed={matchMode === 'regex'} onClick={() => setMatchMode(matchMode === 'regex' ? 'contains' : 'regex')}><Icon name="regex" size={14} /><span>{t('opt_regex')}</span></button>
            <button type="button" className={`opt-btn ${caseSensitive ? 'on' : ''}`} title={t('tip_opt_case')} aria-pressed={caseSensitive} onClick={() => setCaseSensitive(!caseSensitive)}><Icon name="caseAa" size={14} /><span>{t('opt_case')}</span></button>
            <span className="tb-spacer" />
            {/* result actions share this line */}
            <button type="button" className="btn" onClick={copyClip} disabled={!any} title={t('search_copy_tip')}><Icon name="copy" size={14} /> {t('ctx_copy')}</button>
            <button type="button" className="btn" onClick={() => onCopyTo('left', selectedPaths)} disabled={!any}>{t('search_copy_left')}</button>
            <button type="button" className="btn" onClick={() => onCopyTo('right', selectedPaths)} disabled={!any}>{t('search_copy_right')}</button>
          </div>
        </form>
        <div className="search-results" ref={listRef} tabIndex={0} onKeyDown={onListKey} onContextMenu={onContextMenu}
          onMouseDown={(e) => { if (e.target === listRef.current) { setSelected(new Set()); setCursor(-1); } }}>
          {results.map((e, i) => (
            <div key={e.path} data-index={i} className={`sr-row ${selected.has(e.path) ? 'selected' : ''} ${i === cursor ? 'cursor' : ''}`} title={e.path}
              onMouseDown={(ev) => onRowMouseDown(ev, i)} onDoubleClick={() => activate(e)}>
              <Icon name={e.isDir ? 'folder' : 'file'} size={14} className={e.isDir ? 'ic-folder' : 'ic-file'} />
              <span className="sr-name ellipsis">{baseName(e.path)}</span>
              <span className="sr-dir muted small ellipsis">{rel(e.path)}</span>
              <span className="sr-perm mono muted small">{e.perm || ''}</span>
              <span className="sr-date muted small">{e.date || ''}</span>
              <span className="sr-type muted small ellipsis">{e.isDir ? t('folder') : typeDisplay({ isDir: false, ext: e.ext || '' })}</span>
              <span className="sr-size muted small">{e.isDir ? t('dir_marker') : formatSize(e.size || 0)}</span>
            </div>
          ))}
          {!results.length && !running && <div className="dock-empty"><Icon name="search" size={24} /><p>{status}</p></div>}
        </div>
        <div className="search-status ellipsis" title={status}>{status}</div>
      </div>
      <div className="dlg-footer">
        <span className="muted small ellipsis">{t('search_footer_hint')}</span>
        <span className="spacer" />
        {!docked && <button className="btn close-btn" onClick={onClose}>{t('close')}</button>}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} onPick={onMenuPick} />}
    </div>
  );
}

export default SearchDialog;
