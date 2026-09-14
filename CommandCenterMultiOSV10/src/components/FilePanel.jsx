// One of the two file panels: path bar (home, side label → folder tree,
// breadcrumb), the sortable file table with multi-selection, keyboard
// navigation, a context menu and the per-panel status line.
//
// The panel owns its listing and selection; App drives it through the
// imperative handle (refresh / getSelectedEntries / …) and receives
// `onAction(name)` for everything that needs dialogs or the other panel.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { call, watchDir } from '../lib/backend';
import { t, useLanguage } from '../lib/i18n';
import { breadcrumbs, dirName, formatSize, sizeDisplay, typeDisplay, driveOf } from '../lib/format';
import { Icon } from './Icons';
import { FolderTree } from './FolderTree';
import { ContextMenu } from './ContextMenu';

const COLUMNS = [
  { key: 'name', label: 'col_name', className: 'c-name' },
  { key: 'perm', label: 'col_perm', className: 'c-perm' },
  { key: 'date', label: 'col_date', className: 'c-date' },
  { key: 'type', label: 'col_type', className: 'c-type' },
  { key: 'size', label: 'col_size', className: 'c-size' },
];

function compareEntries(a, b, sort) {
  if (a.isUp) return -1;
  if (b.isUp) return 1;
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  let cmp = 0;
  switch (sort.column) {
    case 'size': cmp = (a.isDir ? -1 : a.size) - (b.isDir ? -1 : b.size); break;
    case 'date': cmp = a.mtime - b.mtime; break;
    case 'type': cmp = typeDisplay(a).localeCompare(typeDisplay(b), undefined, { sensitivity: 'base' }); break;
    case 'perm': cmp = a.perm.localeCompare(b.perm); break;
    default: break;
  }
  if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  return sort.asc ? cmp : -cmp;
}

export const FilePanel = forwardRef(function FilePanel(props, ref) {
  const { side, path, active, sort, showHidden, suspendWatch, onNavigate, onActivate, onSortChange, onSelectionChange, onOpenEntry, onAction, capabilities } = props;
  useLanguage();

  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const [anchor, setAnchor] = useState(-1);
  const [treeOpen, setTreeOpen] = useState(false);
  const [menu, setMenu] = useState(null);       // { x, y }
  const [extractable, setExtractable] = useState(false);
  const [driveMenu, setDriveMenu] = useState(null);   // anchor element
  const [drives, setDrives] = useState([]);
  const bodyRef = useRef(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // ── Listing ──
  const load = useCallback(async (keepSelection = true) => {
    try {
      const r = await call('fs.list', { path, showHidden });
      const list = r.entries.map((e) => ({ ...e }));
      if (r.parent) list.unshift({ name: '..', path: r.parent, isDir: true, isUp: true, size: 0, mtime: 0, date: '', perm: '', ext: '' });
      setEntries(list);
      setError('');
      if (keepSelection) {
        const still = new Set();
        for (const e of list) if (!e.isUp && selectedRef.current.has(e.path)) still.add(e.path);
        setSelected(still);
      } else {
        setSelected(new Set());
      }
    } catch (err) {
      setEntries([]);
      setError(err.message || String(err));
      setSelected(new Set());
    }
  }, [path, showHidden]);

  useEffect(() => { load(false); setCursor(-1); setAnchor(-1); setTreeOpen(false); }, [path, showHidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // Directory watch (debounced refresh)
  useEffect(() => {
    if (suspendWatch) return undefined;
    let timer = null;
    const stop = watchDir(side, path, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => load(true), 250);
    });
    return () => { stop(); if (timer) clearTimeout(timer); };
  }, [side, path, suspendWatch, load]);

  const sorted = useMemo(() => [...entries].sort((a, b) => compareEntries(a, b, sort)), [entries, sort]);

  // ── Selection ──
  const selectedEntries = useMemo(() => sorted.filter((e) => !e.isUp && selected.has(e.path)), [sorted, selected]);

  useEffect(() => {
    onSelectionChange && onSelectionChange(selectedEntries);
    let alive = true;
    if (selectedEntries.length === 1) {
      call('archive.describe', { path: selectedEntries[0].path }).then((d) => { if (alive) setExtractable(!!d.isArchive); }).catch(() => {});
    } else {
      setExtractable(false);
    }
    return () => { alive = false; };
  }, [selectedEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectIndex = (i, { toggle = false, range = false } = {}) => {
    const e = sorted[i];
    if (!e) return;
    setCursor(i);
    if (range && anchor >= 0) {
      const [a, b] = anchor < i ? [anchor, i] : [i, anchor];
      const next = new Set();
      for (let k = a; k <= b; k++) if (!sorted[k].isUp) next.add(sorted[k].path);
      setSelected(next);
      return;
    }
    setAnchor(i);
    if (toggle) {
      const next = new Set(selected);
      if (e.isUp) return;
      if (next.has(e.path)) next.delete(e.path); else next.add(e.path);
      setSelected(next);
      return;
    }
    setSelected(e.isUp ? new Set() : new Set([e.path]));
  };

  const selectAll = () => setSelected(new Set(sorted.filter((e) => !e.isUp).map((e) => e.path)));

  // ── Navigation ──
  const activate = (e) => {
    if (!e) return;
    if (e.isDir) onNavigate(e.path);
    else onOpenEntry(e);
  };
  const goUp = () => { const parent = dirName(path); if (parent && parent !== path) onNavigate(parent); };

  useImperativeHandle(ref, () => ({
    refresh: () => load(true),
    getPath: () => path,
    getEntries: () => sorted.filter((e) => !e.isUp),
    getSelectedEntries: () => selectedEntries,
    getSelectedPaths: () => selectedEntries.map((e) => e.path),
    selectAll,
    selectPaths: (paths) => setSelected(new Set(paths)),
    focus: () => bodyRef.current && bodyRef.current.focus(),
    isExtractable: () => extractable,
  }), [load, path, sorted, selectedEntries, extractable]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard ──
  const scrollCursorIntoView = (i) => {
    const row = bodyRef.current && bodyRef.current.querySelector(`tr[data-index="${i}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  };
  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT') return;
    const ctrl = e.ctrlKey || e.metaKey;
    const n = sorted.length;
    const move = (to) => {
      const i = Math.max(0, Math.min(n - 1, to));
      selectIndex(i, { range: e.shiftKey });
      scrollCursorIntoView(i);
    };
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(cursor + 1); break;
      case 'ArrowUp': e.preventDefault(); move(cursor - 1); break;
      case 'Home': e.preventDefault(); move(0); break;
      case 'End': e.preventDefault(); move(n - 1); break;
      case 'PageDown': e.preventDefault(); move(cursor + 20); break;
      case 'PageUp': e.preventDefault(); move(cursor - 20); break;
      case 'Enter': e.preventDefault(); activate(sorted[cursor] || selectedEntries[0]); break;
      case 'Backspace': e.preventDefault(); goUp(); break;
      case ' ': if (cursor >= 0) { e.preventDefault(); selectIndex(cursor, { toggle: true }); } break;
      case 'Delete': e.preventDefault(); onAction('delete'); break;
      case 'F2': e.preventDefault(); onAction('rename'); break;
      case 'a': case 'A': if (ctrl) { e.preventDefault(); selectAll(); } break;
      case 'c': case 'C': if (ctrl) { e.preventDefault(); onAction('clipCopy'); } break;
      case 'v': case 'V': if (ctrl) { e.preventDefault(); onAction('clipPaste'); } break;
      case 'Escape': setMenu(null); break;
      default: break;
    }
  };

  // ── Mouse ──
  const onRowMouseDown = (e, i) => {
    onActivate();
    if (e.button === 2) {
      const entry = sorted[i];
      if (entry && !entry.isUp && !selected.has(entry.path)) selectIndex(i);
      else if (entry && entry.isUp) setSelected(new Set());
      return;
    }
    if (e.button !== 0) return;
    selectIndex(i, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
  };
  const onContextMenu = (e) => {
    e.preventDefault();
    onActivate();
    setMenu({ x: e.clientX, y: e.clientY });
  };
  const onEmptyClick = (e) => {
    if (e.target === bodyRef.current || e.target.tagName === 'TABLE' || e.target.tagName === 'TBODY') {
      setSelected(new Set());
      setCursor(-1);
    }
  };

  // ── Status line ──
  const status = useMemo(() => {
    if (error) return t('panel_error', { msg: error });
    if (selectedEntries.length) {
      let d = 0, f = 0, s = 0;
      for (const e of selectedEntries) { if (e.isDir) d++; else { f++; s += e.size; } }
      return t('panel_selected', { dirs: d, files: f, size: formatSize(s) });
    }
    let d = 0, f = 0, s = 0;
    for (const e of entries) { if (e.isUp) continue; if (e.isDir) d++; else { f++; s += e.size; } }
    return t('panel_counts', { dirs: d, files: f, size: formatSize(s) });
  }, [entries, selectedEntries, error]); // eslint-disable-line react-hooks/exhaustive-deps

  const crumbs = useMemo(() => breadcrumbs(path), [path]);
  const currentDrive = driveOf(path);

  // Drives are fetched ahead of time (the core caches them for a minute) so
  // the menu opens instantly; a refresh happens on every folder change.
  useEffect(() => {
    let alive = true;
    call('fs.drives').then((d) => { if (alive) setDrives(d); }).catch(() => {});
    return () => { alive = false; };
  }, [path]);
  const openDriveMenu = (el) => {
    if (driveMenu) { setDriveMenu(null); return; }
    onActivate();
    setDriveMenu(el);
    call('fs.drives').then(setDrives).catch(() => {});
  };
  const driveItems = drives.length
    ? drives.map((d) => ({
      id: `drive:${d.path}`,
      icon: d.type === 'cdrom' ? 'disc' : d.type === 'network' ? 'network' : d.type === 'removable' ? 'usb' : 'drive',
      label: d.label ? `${d.path}  ${d.label}` : d.path,
      shortcut: d.size ? `${formatSize(d.free)} / ${formatSize(d.size)}` : '',
      checked: currentDrive.toLowerCase() === d.path.toLowerCase(),
      disabled: d.ready === false,
    }))
    : [{ id: 'none', label: '…', disabled: true }];
  const hasSel = selectedEntries.length > 0;
  const single = selectedEntries.length === 1;

  const menuItems = [
    { id: 'open', label: t('ctx_open'), icon: 'open', disabled: !hasSel },
    { id: 'copyOther', label: t('ctx_copy_other'), icon: 'copy', disabled: !hasSel },
    { id: 'moveOther', label: t('ctx_move_other'), icon: 'move', disabled: !hasSel },
    { sep: true },
    { id: 'clipCopy', label: t('ctx_copy'), icon: 'copy', disabled: !hasSel },
    { id: 'clipPaste', label: t('ctx_paste'), icon: 'paste' },
    { sep: true },
    { id: 'rename', label: t('ctx_rename'), icon: 'rename', disabled: !single },
    { id: 'trash', label: t('ctx_trash'), icon: 'trash', disabled: !hasSel || !(capabilities && capabilities.trash) },
    { id: 'delete', label: t('ctx_delete'), icon: 'delete', disabled: !hasSel },
    { sep: true },
    { id: 'compress', label: t('ctx_compress'), icon: 'archive', disabled: !hasSel },
    { id: 'extract', label: t('ctx_extract'), icon: 'extract', disabled: !(single && extractable) },
    { sep: true },
    { id: 'newFolder', label: t('ctx_new_folder'), icon: 'folderNew' },
    { id: 'newFile', label: t('ctx_new_file'), icon: 'fileNew' },
    { sep: true },
    { id: 'properties', label: t('ctx_properties'), icon: 'properties', disabled: !single },
  ];

  return (
    <div className={`file-panel ${active ? 'active' : ''}`} onMouseDown={onActivate}>
      <div className="path-bar">
        <button className="drive-btn" title={t('drives')} onClick={(e) => openDriveMenu(e.currentTarget)}>
          <Icon name="drive" size={14} /><span>{currentDrive}</span><Icon name="chevronDown" size={12} className="caret" />
        </button>
        <button className="icon-btn" title={t('home')} onClick={() => onAction('home')}><Icon name="home" /></button>
        <button className={`side-label ${treeOpen ? 'open' : ''}`} title={t('folder_tree')} onClick={() => setTreeOpen((v) => !v)}>
          <Icon name="tree" size={14} /> {t(side)}
        </button>
        <div className="breadcrumb">
          {crumbs.map((c, i) => (
            <React.Fragment key={c.path}>
              {i > 0 && <span className="crumb-sep">›</span>}
              <button className={`crumb ${i === crumbs.length - 1 ? 'current' : ''}`} onClick={() => onNavigate(c.path)} title={c.path}>{c.label}</button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {treeOpen && <FolderTree currentPath={path} onSelect={(p) => { setTreeOpen(false); onNavigate(p); }} />}

      <div className="table-wrap" ref={bodyRef} tabIndex={0} onKeyDown={onKeyDown} onContextMenu={onContextMenu} onMouseDown={onEmptyClick}>
        <table className="file-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.className} onClick={() => onSortChange({ column: c.key, asc: sort.column === c.key ? !sort.asc : true })}>
                  <span>{t(c.label)}</span>
                  {sort.column === c.key && <span className="sort-arrow">{sort.asc ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => (
              <tr key={e.isUp ? '..' : e.path} data-index={i}
                className={`${selected.has(e.path) && !e.isUp ? 'selected' : ''} ${i === cursor ? 'cursor' : ''} ${e.hidden ? 'hidden-entry' : ''}`}
                onMouseDown={(ev) => onRowMouseDown(ev, i)}
                onDoubleClick={() => activate(e)}>
                <td className="c-name">
                  <Icon name={e.isUp ? 'up' : e.isDir ? 'folder' : e.isSymlink ? 'link' : 'file'} size={14} className={e.isDir ? 'ic-folder' : 'ic-file'} />
                  <span className="ellipsis" title={e.isUp ? e.path : e.name}>{e.name}</span>
                </td>
                <td className="c-perm mono">{e.perm}</td>
                <td className="c-date">{e.date}</td>
                <td className="c-type">{e.isUp ? t('folder') : typeDisplay(e)}</td>
                <td className="c-size">{e.isUp ? '' : sizeDisplay(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="panel-empty">{t('panel_error', { msg: error })}</div>}
      </div>

      <div className="panel-status ellipsis" title={status}>{status}</div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)}
          onPick={(id) => { setMenu(null); onAction(id); }} />
      )}
      {driveMenu && (
        <ContextMenu anchorEl={driveMenu} x={0} y={0} items={driveItems} onClose={() => setDriveMenu(null)}
          onPick={(id) => { setDriveMenu(null); if (id.startsWith('drive:')) onNavigate(id.slice(6)); }} />
      )}
    </div>
  );
});

export default FilePanel;
