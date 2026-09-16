// One of the two file panels: path bar (home, side label → folder tree,
// breadcrumb), the sortable file table with multi-selection, keyboard
// navigation, a context menu and the per-panel status line.
//
// The panel owns its listing and selection; App drives it through the
// imperative handle (refresh / getSelectedEntries / …) and receives
// `onAction(name)` for everything that needs dialogs or the other panel.
//
// Keyboard follows Total Commander: Insert / Space toggle the entry under
// the cursor (Space on a folder also measures it), Num+ / Num- select or
// unselect by pattern, Num* inverts, Alt+Num+ selects the same extension,
// typing letters quick-searches the list, Backspace goes up.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { call, watchDir } from '../lib/backend';
import { t, useLanguage } from '../lib/i18n';
import { breadcrumbs, dirName, baseName, formatSize, sizeDisplay, typeDisplay, driveOf, globToRegExp } from '../lib/format';
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
  const { side, path, active, sort, showHidden, suspendWatch, onNavigate, onActivate, onSortChange, onSelectionChange, onOpenEntry, onAction, capabilities, history = [], hotlist = [], onHotlistChange, columns, quickSearch = true, spaceMeasures = true, tabs = [], tabIndex = 0, onTabSelect, onTabNew, onTabClose, onTabCloseOthers, onTabToOther } = props;
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
  const [historyMenu, setHistoryMenu] = useState(null);   // anchor element
  const [hotMenu, setHotMenu] = useState(null);           // anchor element
  const [tabMenu, setTabMenu] = useState(null);           // { x, y, i }
  const [dirSizes, setDirSizes] = useState(() => new Map());  // folder → measured size (Space)
  const [quick, setQuick] = useState('');                 // quick-search buffer
  const quickTimer = useRef(null);
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

  useEffect(() => { load(false); setCursor(-1); setAnchor(-1); setTreeOpen(false); setDirSizes(new Map()); setQuick(''); }, [path, showHidden]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const clearSelection = () => setSelected(new Set());
  const invertSelection = () => setSelected(new Set(sorted.filter((e) => !e.isUp && !selected.has(e.path)).map((e) => e.path)));
  // Num+ / Num-: add to or remove from the selection every file whose name matches the glob (folders too when `dirs`).
  const selectByPattern = (pattern, add = true, dirs = false) => {
    const re = globToRegExp(pattern || '*');
    const next = new Set(selected);
    for (const e of sorted) {
      if (e.isUp || (e.isDir && !dirs)) continue;
      if (re.test(e.name)) { if (add) next.add(e.path); else next.delete(e.path); }
    }
    setSelected(next);
    return next.size;
  };
  // Alt+Num+ / Alt+Num-: every file with the same extension as the one under the cursor.
  const selectSameExt = (add = true) => {
    const e = sorted[cursor] || selectedEntries[0];
    if (!e || e.isUp || e.isDir) return 0;
    return selectByPattern(e.ext ? `*${e.ext}` : '*', add);
  };
  // Space on a folder: measure it (TC shows the size in place of <DIR>).
  const measure = async (e) => {
    if (!e || !e.isDir || e.isUp) return;
    try {
      const st = await call('fs.stat', { path: e.path });
      setDirSizes((m) => new Map(m).set(e.path, st.size));
    } catch { /* unreadable */ }
  };

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
    clearSelection,
    invertSelection,
    selectByPattern,
    selectSameExt,
    // Selecting from the outside (after a rename, extraction, …) also moves the cursor there.
    selectPaths: (paths) => { setSelected(new Set(paths)); const i = paths.length ? sorted.findIndex((e) => e.path === paths[0]) : -1; if (i >= 0) { setCursor(i); setAnchor(i); scrollCursorIntoView(i); } },
    // The entry under the cursor (falls back to the single selected one) — F3 / F4 / Alt+Enter / Ctrl+← →.
    getCursorEntry: () => { const e = sorted[cursor]; return e && !e.isUp ? e : (selectedEntries.length === 1 ? selectedEntries[0] : null); },
    focus: () => bodyRef.current && bodyRef.current.focus(),
    isExtractable: () => extractable,
    openDrives: () => { const el = bodyRef.current && bodyRef.current.closest('.file-panel').querySelector('.drive-btn'); if (el) openDriveMenu(el); },
    openHistory: () => { const el = bodyRef.current && bodyRef.current.closest('.file-panel').querySelector('.hist-btn'); if (el) setHistoryMenu(el); },
    openHotlist: () => { const el = bodyRef.current && bodyRef.current.closest('.file-panel').querySelector('.hot-btn'); if (el) setHotMenu(el); },
    goUp: () => goUp(),
  }), [load, path, sorted, selectedEntries, extractable, cursor, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard ──
  const scrollCursorIntoView = (i) => {
    const row = bodyRef.current && bodyRef.current.querySelector(`tr[data-index="${i}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  };
  // Quick search: typed letters jump to the next name starting with them; the buffer clears after a pause.
  const quickSearchKey = (ch) => {
    const text = ch === '\b' ? quick.slice(0, -1) : quick + ch;
    if (!text) { setQuick(''); return; }
    if (quickTimer.current) clearTimeout(quickTimer.current);
    quickTimer.current = setTimeout(() => setQuick(''), 1200);
    const lower = text.toLowerCase();
    const start = quick ? cursor : cursor + 1;
    const n = sorted.length;
    for (let k = 0; k < n; k++) {
      const i = (Math.max(0, start) + k) % n;
      const e = sorted[i];
      if (!e.isUp && e.name.toLowerCase().startsWith(lower)) { setCursor(i); setAnchor(i); scrollCursorIntoView(i); setQuick(text); return; }
    }
    setQuick(text);
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
    // Numpad + - * (or the same keys on the main keyboard) — selection by pattern, as in TC.
    const pad = e.code === 'NumpadAdd' ? '+' : e.code === 'NumpadSubtract' ? '-' : e.code === 'NumpadMultiply' ? '*' : (['+', '-', '*'].includes(e.key) ? e.key : '');
    if (pad && !quick) {
      e.preventDefault();
      if (pad === '*') invertSelection();
      else if (ctrl) { if (pad === '+') selectAll(); else clearSelection(); }
      else if (e.altKey) selectSameExt(pad === '+');
      else onAction(pad === '+' ? 'selectPattern' : 'unselectPattern');
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(cursor + 1); break;
      case 'ArrowUp': e.preventDefault(); move(cursor - 1); break;
      case 'Home': e.preventDefault(); move(0); break;
      case 'End': e.preventDefault(); move(n - 1); break;
      case 'PageDown': e.preventDefault(); move(cursor + 20); break;
      case 'PageUp': e.preventDefault(); move(cursor - 20); break;
      case 'Enter': e.preventDefault(); if (e.altKey) onAction('properties'); else activate(sorted[cursor] || selectedEntries[0]); break;
      case 'Backspace': e.preventDefault(); if (quick) quickSearchKey('\b'); else goUp(); break;
      case 'Insert': if (cursor >= 0) { e.preventDefault(); selectIndex(cursor, { toggle: true }); move(cursor + 1); } break;
      case ' ': if (cursor >= 0) { e.preventDefault(); selectIndex(cursor, { toggle: true }); if (spaceMeasures) measure(sorted[cursor]); } break;
      case 'Delete': e.preventDefault(); onAction('delete'); break;
      case 'F2': e.preventDefault(); onAction('rename'); break;
      case 'a': case 'A': if (ctrl) { e.preventDefault(); selectAll(); break; } if (quickSearch) quickSearchKey(e.key); break;
      case 'c': case 'C': if (ctrl) { e.preventDefault(); onAction('clipCopy'); break; } if (quickSearch) quickSearchKey(e.key); break;
      case 'v': case 'V': if (ctrl) { e.preventDefault(); onAction('clipPaste'); break; } if (quickSearch) quickSearchKey(e.key); break;
      case 'Escape': setMenu(null); setQuick(''); break;
      default:
        if (quickSearch && e.key.length === 1 && !ctrl && !e.altKey) { e.preventDefault(); quickSearchKey(e.key); }
        break;
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
      for (const e of selectedEntries) { if (e.isDir) { d++; s += dirSizes.get(e.path) || 0; } else { f++; s += e.size; } }
      return t('panel_selected', { dirs: d, files: f, size: formatSize(s) });
    }
    let d = 0, f = 0, s = 0;
    for (const e of entries) { if (e.isUp) continue; if (e.isDir) { d++; s += dirSizes.get(e.path) || 0; } else { f++; s += e.size; } }
    return t('panel_counts', { dirs: d, files: f, size: formatSize(s) });
  }, [entries, selectedEntries, error, dirSizes]); // eslint-disable-line react-hooks/exhaustive-deps

  const crumbs = useMemo(() => breadcrumbs(path), [path]);
  const cols = COLUMNS.filter((c) => c.key === 'name' || !columns || columns[c.key] !== false);
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

  // Alt+↓: folders this panel visited; Ctrl+D: the directory hotlist (shared by both panels).
  const historyItems = history.length
    ? history.map((p) => ({ id: `go:${p}`, label: p, icon: 'folder', checked: p === path }))
    : [{ id: 'none', label: t('history_empty'), disabled: true }];
  const inHotlist = hotlist.includes(path);
  const hotItems = [
    ...hotlist.map((p) => ({ id: `go:${p}`, label: p, icon: 'star', checked: p === path })),
    ...(hotlist.length ? [{ sep: true }] : []),
    inHotlist ? { id: 'hot:remove', label: t('hot_remove'), icon: 'close' } : { id: 'hot:add', label: t('hot_add'), icon: 'plus' },
  ];
  const onHotPick = (id) => {
    setHotMenu(null);
    if (id === 'hot:add') onHotlistChange && onHotlistChange([...hotlist, path]);
    else if (id === 'hot:remove') onHotlistChange && onHotlistChange(hotlist.filter((p) => p !== path));
    else if (id.startsWith('go:')) onNavigate(id.slice(3));
  };

  const menuItems = [
    { id: 'open', label: t('ctx_open'), icon: 'open', disabled: !hasSel },
    { id: 'view', label: t('view_file'), icon: 'view', shortcut: 'F3', disabled: !(single && !selectedEntries[0].isDir) },
    { id: 'edit', label: t('edit_file'), icon: 'edit', shortcut: 'F4', disabled: !(single && !selectedEntries[0].isDir) },
    { sep: true },
    { id: 'copyOther', label: t('ctx_copy_other'), icon: 'copy', disabled: !hasSel },
    { id: 'moveOther', label: t('ctx_move_other'), icon: 'move', disabled: !hasSel },
    { sep: true },
    { id: 'clipCopy', label: t('ctx_copy'), icon: 'copy', disabled: !hasSel },
    { id: 'clipPaste', label: t('ctx_paste'), icon: 'paste' },
    { sep: true },
    { id: 'rename', label: t('ctx_rename'), icon: 'rename', disabled: !single },
    { id: 'multiRename', label: t('multi_rename'), icon: 'multiRename', shortcut: 'Ctrl+M', disabled: !hasSel },
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

  // Tab label: the folder's name, or the drive / root itself.
  const tabLabel = (p) => baseName(p) || p;
  const tabMenuItems = tabMenu ? [
    { id: 'new', label: t('tab_new'), icon: 'tabNew', shortcut: 'Ctrl+T' },
    { id: 'other', label: t('tab_to_other'), icon: 'tabs' },
    { sep: true },
    { id: 'close', label: t('tab_close'), icon: 'close', shortcut: 'Ctrl+W', disabled: tabs.length <= 1 },
    { id: 'others', label: t('tab_close_others'), icon: 'close', disabled: tabs.length <= 1 },
  ] : [];
  const onTabMenuPick = (id) => {
    const i = tabMenu.i; setTabMenu(null);
    if (id === 'new') onTabNew && onTabNew();
    else if (id === 'other') onTabToOther && onTabToOther(i);
    else if (id === 'close') onTabClose && onTabClose(i);
    else if (id === 'others') onTabCloseOthers && onTabCloseOthers(i);
  };

  return (
    <div className={`file-panel ${active ? 'active' : ''}`} onMouseDown={onActivate}>
      {/* Tabs (TC): click = switch, middle click / × = close, right click = menu, double-click on the empty part or + = new tab */}
      <div className="tab-bar" onDoubleClick={(e) => { if (e.target === e.currentTarget) onTabNew && onTabNew(); }}>
        {tabs.map((tb, i) => (
          <button key={`${i}:${tb.path}`} className={`tab ${i === tabIndex ? 'active' : ''}`} title={tb.path}
            onClick={() => onTabSelect && onTabSelect(i)}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onTabClose && onTabClose(i); } }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setTabMenu({ x: e.clientX, y: e.clientY, i }); }}>
            <Icon name="folder" size={13} className="ic-folder" /><span className="ellipsis">{tabLabel(tb.path)}</span>
            {tabs.length > 1 && <span className="tab-close" title={t('tab_close')} onClick={(e) => { e.stopPropagation(); onTabClose && onTabClose(i); }}><Icon name="close" size={11} /></span>}
          </button>
        ))}
        <button className="tab-add" title={t('tip_tab_new')} aria-label={t('tab_new')} onClick={() => onTabNew && onTabNew()}><Icon name="plus" size={14} /></button>
      </div>
      <div className="path-bar">
        <button className="drive-btn" title={t('drives')} onClick={(e) => openDriveMenu(e.currentTarget)}>
          <Icon name="drive" size={14} /><span>{currentDrive}</span><Icon name="chevronDown" size={12} className="caret" />
        </button>
        <button className="icon-btn" title={t('home')} onClick={() => onAction('home')}><Icon name="home" /></button>
        <button className="icon-btn hist-btn" title={t('tip_history')} onClick={(e) => { onActivate(); setHistoryMenu(historyMenu ? null : e.currentTarget); }}><Icon name="history" /></button>
        <button className={`icon-btn hot-btn ${inHotlist ? 'on' : ''}`} title={t('tip_hotlist')} onClick={(e) => { onActivate(); setHotMenu(hotMenu ? null : e.currentTarget); }}><Icon name="star" /></button>
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
              {cols.map((c) => (
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
                {(!columns || columns.perm !== false) && <td className="c-perm mono">{e.perm}</td>}
                {(!columns || columns.date !== false) && <td className="c-date">{e.date}</td>}
                {(!columns || columns.type !== false) && <td className="c-type">{e.isUp ? t('folder') : typeDisplay(e)}</td>}
                {(!columns || columns.size !== false) && <td className="c-size">{e.isUp ? '' : (e.isDir && dirSizes.has(e.path) ? formatSize(dirSizes.get(e.path)) : sizeDisplay(e))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="panel-empty">{t('panel_error', { msg: error })}</div>}
        {quick && <div className="quick-search"><Icon name="search" size={12} /><span>{quick}</span></div>}
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
      {historyMenu && (
        <ContextMenu anchorEl={historyMenu} x={0} y={0} items={historyItems} onClose={() => setHistoryMenu(null)}
          onPick={(id) => { setHistoryMenu(null); if (id.startsWith('go:')) onNavigate(id.slice(3)); }} />
      )}
      {hotMenu && (
        <ContextMenu anchorEl={hotMenu} x={0} y={0} items={hotItems} onClose={() => setHotMenu(null)} onPick={onHotPick} />
      )}
      {tabMenu && (
        <ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenuItems} onClose={() => setTabMenu(null)} onPick={onTabMenuPick} />
      )}
    </div>
  );
});

export default FilePanel;
