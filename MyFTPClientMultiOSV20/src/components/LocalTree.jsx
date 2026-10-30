// "로컬 (Local)" — the hierarchical tree of the original: drives (with their
// volume labels) at the top, folders and files below, loaded lazily when a
// node is expanded. Selecting a node makes its folder the download target;
// double-clicking a file uploads it.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { call } from '../lib/backend';
import { t, useLanguage } from '../lib/i18n';
import { formatSize, iconFor, samePath, isUnder, dirName, getSeparator } from '../lib/format';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';

function rootIcon(kind) {
  if (kind === 'network') return 'driveNet';
  if (kind === 'removable') return 'driveUsb';
  if (kind === 'cdrom') return 'disc';
  if (kind === 'home') return 'home';
  return 'drive';
}

// Path prefix helpers: "C:\" and "C:\Users" must both split into their parts.
function splitParts(p) {
  const m = /^([a-zA-Z]:\\)(.*)$/.exec(p);
  if (m) return [m[1], ...m[2].split(/[\\/]+/).filter(Boolean)];
  if (p.startsWith('/')) return ['/', ...p.split('/').filter(Boolean)];
  return p.split(/[\\/]+/).filter(Boolean);
}

function joinParts(parts, upTo) {
  let acc = parts[0];
  for (let i = 1; i <= upTo; i++) acc = acc.endsWith('\\') || acc.endsWith('/') ? acc + parts[i] : acc + getSeparator() + parts[i];
  return acc;
}

export const LocalTree = forwardRef(function LocalTree({ selection, onSelection, onCurrentDir, onOpenFile, onContextMenu, onError, active, onActivate }, ref) {
  useLanguage();
  const [roots, setRoots] = useState([]);
  // path → { children: entry[] | null, expanded, loading, error }
  const [nodes, setNodes] = useState({});
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const [cursor, setCursor] = useState(null);
  const [driveMenu, setDriveMenu] = useState(null);   // anchor element of the drive picker
  const anchor = useRef(null);
  const bodyRef = useRef(null);
  const rowsRef = useRef([]);

  // Reports the selection as paths + the matching entries (App needs isDir).
  const emit = useCallback((set) => {
    onSelection(set, rowsRef.current.filter((r) => r.entry && set.has(r.entry.path)).map((r) => r.entry));
  }, [onSelection]);

  const patch = useCallback((p, data) => setNodes((n) => ({ ...n, [p]: { ...(n[p] || { children: null, expanded: false, loading: false, error: '' }), ...data } })), []);

  const load = useCallback(async (p) => {
    patch(p, { loading: true, error: '' });
    try {
      const { entries } = await call('local.list', { path: p });
      patch(p, { children: entries, loading: false });
      return entries;
    } catch (err) {
      patch(p, { children: [], loading: false, error: err.code === 'EACCES' ? t('access_denied') : `[${err.message}]` });
      return [];
    }
  }, [patch]);

  const loadRoots = useCallback(async () => {
    try {
      const r = await call('local.roots');
      setRoots(r.roots);
      return r.roots;
    } catch (err) { onError(err); return []; }
  }, [onError]);

  useEffect(() => { loadRoots(); }, [loadRoots]);

  const expand = useCallback(async (p) => {
    const n = nodesRef.current[p];
    if (n && n.expanded) return;
    patch(p, { expanded: true });
    if (!n || n.children === null) await load(p);
  }, [load, patch]);

  const collapse = useCallback((p) => patch(p, { expanded: false }), [patch]);

  // Opens every folder down to `target` and selects it (used at start for the
  // remembered folder and after "탐색기…" style navigation).
  const expandTo = useCallback(async (target) => {
    if (!target) return;
    let rs = roots.length ? roots : await loadRoots();
    // Prefer the deepest root that contains the path (home before "/").
    const root = rs.filter((r) => isUnder(target, r.path)).sort((a, b) => b.path.length - a.path.length)[0];
    if (!root) return;
    const parts = splitParts(target);
    const rootParts = splitParts(root.path);
    let cur = root.path;
    await expand(cur);
    for (let i = rootParts.length; i < parts.length; i++) {
      cur = joinParts(parts, i);
      await expand(cur);
    }
    setCursor(cur);
    onSelection(new Set([cur]), [{ path: cur, name: cur === root.path ? root.name : parts[parts.length - 1], isDir: true, kind: cur === root.path ? root.kind : undefined }]);
    anchor.current = cur;
    onCurrentDir(cur);
    setTimeout(() => {
      const el = bodyRef.current && bodyRef.current.querySelector(`[data-path="${CSS.escape(cur)}"]`);
      if (el) el.scrollIntoView({ block: 'center' });
    }, 50);
  }, [roots, loadRoots, expand, onSelection, onCurrentDir]);

  // Reloads a folder that is already open (after a download, mkdir, delete…).
  const refresh = useCallback(async (p) => {
    const n = nodesRef.current[p];
    if (!n || n.children === null) return;
    await load(p);
  }, [load]);

  // The drive picker: collapses the other drives so the chosen one is in view
  // (a tree opened deep into C:\ pushes the other drives far above the fold).
  const switchRoot = useCallback(async (p) => {
    for (const r of roots) if (!samePath(r.path, p)) collapse(r.path);
    await expandTo(p);
    setTimeout(() => {
      const el = bodyRef.current && bodyRef.current.querySelector(`[data-path="${CSS.escape(p)}"]`);
      if (el) el.scrollIntoView({ block: 'start' });
    }, 60);
  }, [roots, collapse, expandTo]);

  useImperativeHandle(ref, () => ({ expandTo, refresh, reloadRoots: loadRoots, expand, switchRoot }), [expandTo, refresh, loadRoots, expand, switchRoot]);

  // ── Flatten for rendering ──
  const rows = [];
  const walk = (entry, depth) => {
    const n = nodes[entry.path] || { children: null, expanded: false };
    rows.push({ entry, depth, node: n });
    if (entry.isDir && n.expanded) {
      if (n.loading && n.children === null) rows.push({ info: t('loading'), depth: depth + 1, key: `${entry.path}#loading` });
      else if (n.error) rows.push({ info: n.error, depth: depth + 1, key: `${entry.path}#err` });
      else if (n.children) for (const c of n.children) walk(c, depth + 1);
    }
  };
  for (const r of roots) walk(r, 0);
  rowsRef.current = rows;

  const entryOf = (p) => { const r = rows.find((x) => x.entry && x.entry.path === p); return r ? r.entry : null; };

  const select = (entry, e) => {
    onActivate();
    const next = new Set(e.ctrlKey || e.metaKey ? selection : []);
    if (e.shiftKey && anchor.current) {
      const list = rows.filter((r) => r.entry).map((r) => r.entry.path);
      const a = list.indexOf(anchor.current), b = list.indexOf(entry.path);
      if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(list[i]);
    } else if (e.ctrlKey || e.metaKey) {
      if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path);
      anchor.current = entry.path;
    } else {
      next.add(entry.path);
      anchor.current = entry.path;
    }
    setCursor(entry.path);
    emit(next);
    onCurrentDir(entry.isDir ? entry.path : dirName(entry.path));
  };

  const toggle = (entry) => { if (nodes[entry.path] && nodes[entry.path].expanded) collapse(entry.path); else expand(entry.path); };

  const onKey = (e) => {
    const list = rows.filter((r) => r.entry);
    if (!list.length) return;
    const i = list.findIndex((r) => r.entry.path === cursor);
    const move = (j) => {
      const row = list[Math.max(0, Math.min(list.length - 1, j))];
      setCursor(row.entry.path);
      emit(new Set([row.entry.path]));
      anchor.current = row.entry.path;
      onCurrentDir(row.entry.isDir ? row.entry.path : dirName(row.entry.path));
      const el = bodyRef.current && bodyRef.current.querySelector(`[data-path="${CSS.escape(row.entry.path)}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    };
    const cur = i >= 0 ? list[i].entry : null;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(i - 1); }
    else if (e.key === 'ArrowRight' && cur && cur.isDir) { e.preventDefault(); if (nodes[cur.path] && nodes[cur.path].expanded) move(i + 1); else expand(cur.path); }
    else if (e.key === 'ArrowLeft' && cur) {
      e.preventDefault();
      if (cur.isDir && nodes[cur.path] && nodes[cur.path].expanded) collapse(cur.path);
      else { const parent = list.slice(0, i).reverse().find((r) => r.depth < list[i].depth); if (parent) move(list.indexOf(parent)); }
    }
    else if (e.key === 'Enter' && cur) { e.preventDefault(); if (cur.isDir) toggle(cur); else onOpenFile(cur); }
    else if (e.key === 'F5' && cur) { e.preventDefault(); refresh(cur.isDir ? cur.path : dirName(cur.path)); }
  };

  const ctx = (e, entry) => {
    e.preventDefault();
    onActivate();
    if (entry && !selection.has(entry.path)) { emit(new Set([entry.path])); anchor.current = entry.path; setCursor(entry.path); onCurrentDir(entry.isDir ? entry.path : dirName(entry.path)); }
    onContextMenu(e.clientX, e.clientY, entry || null);
  };

  return (
    <div className={`panel local-panel ${active ? 'active' : ''}`} onMouseDown={onActivate}>
      <div className="panel-head">
        <Icon name="explorer" />
        <span className="panel-title">{t('local')}</span>
        <DriveButton roots={roots} onOpen={(el) => { if (!driveMenu) loadRoots(); setDriveMenu(driveMenu ? null : el); }} />
        <LocalHeadPath />
        <span className="spacer" />
        <button className="icon-btn" title={t('ctx_refresh')} onClick={() => { const c = entryOf(cursor); loadRoots(); if (c) refresh(c.isDir ? c.path : dirName(c.path)); }}><Icon name="refresh" /></button>
      </div>
      <div className="table-wrap tree-wrap" tabIndex={0} onKeyDown={onKey} ref={bodyRef} onContextMenu={(e) => ctx(e, null)}>
        {rows.map((r) => r.info ? (
          <div key={r.key} className="tree-row info" style={{ paddingLeft: 8 + r.depth * 18 }}><span className="tree-expander" /><span className="muted">{r.info}</span></div>
        ) : (
          <div key={r.entry.path} data-path={r.entry.path}
            className={`tree-row ${selection.has(r.entry.path) ? 'selected' : ''} ${cursor === r.entry.path ? 'cursor' : ''}`}
            style={{ paddingLeft: 8 + r.depth * 18 }}
            onMouseDown={(e) => { if (e.button === 0) select(r.entry, e); }}
            onDoubleClick={(e) => { e.preventDefault(); if (r.entry.isDir) toggle(r.entry); else onOpenFile(r.entry); }}
            onContextMenu={(e) => { e.stopPropagation(); ctx(e, r.entry); }}>
            <span className="tree-expander" onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); if (r.entry.isDir) toggle(r.entry); }}>
              {r.entry.isDir ? <Icon name={r.node.expanded ? 'chevronDown' : 'chevronRight'} size={13} /> : null}
            </span>
            <Icon name={r.depth === 0 ? rootIcon(r.entry.kind) : r.entry.isDir ? (r.node.expanded ? 'folderOpen' : 'folder') : iconFor(r.entry.name, false)}
              className={r.depth === 0 ? 'ic-drive' : r.entry.isDir ? 'ic-folder' : 'ic-file'} />
            <span className="tree-name">{r.entry.name}</span>
            {!r.entry.isDir && <span className="tree-size muted">{formatSize(r.entry.size)}</span>}
          </div>
        ))}
      </div>
      <div className="panel-status">{selection.size ? t('selected_count', { n: selection.size }) : ''}</div>
      {driveMenu && (
        <ContextMenu anchorEl={driveMenu} x={0} y={0} onClose={() => setDriveMenu(null)}
          items={roots.map((r) => ({ id: r.path, label: r.name, icon: rootIcon(r.kind), checked: isUnder(currentDir, r.path) && !roots.some((o) => o.path.length > r.path.length && isUnder(currentDir, o.path) && isUnder(o.path, r.path)) }))}
          onPick={(id) => { setDriveMenu(null); switchRoot(id); }} />
      )}
    </div>
  );
});

// "OS (C:) ▾" — the drive / root that contains the current local folder.
function DriveButton({ roots, onOpen }) {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force((x) => x + 1); dirListeners.add(fn); return () => dirListeners.delete(fn); }, []);
  const root = roots.filter((r) => isUnder(currentDir, r.path)).sort((a, b) => b.path.length - a.path.length)[0];
  return (
    <button className="drive-btn" title={t('drives')} onClick={(e) => onOpen(e.currentTarget)}>
      <Icon name={rootIcon(root ? root.kind : 'fixed')} size={14} />
      <span className="ellipsis">{root ? root.name : '…'}</span>
      <Icon name="chevronDown" size={12} className="caret" />
    </button>
  );
}

// The current local folder shown next to the title — set by App through a
// tiny store so the tree itself does not re-render on every status change.
let currentDir = '';
const dirListeners = new Set();
export function setLocalHeadPath(p) { currentDir = p; for (const fn of dirListeners) fn(); }
function LocalHeadPath() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force((x) => x + 1); dirListeners.add(fn); return () => dirListeners.delete(fn); }, []);
  return currentDir ? <span className="panel-path mono" title={currentDir}>│&nbsp; {currentDir}</span> : null;
}

export default LocalTree;

// Exported for App: is `p` the same folder as `q`?
export { samePath };
