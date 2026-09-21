// "폴더 트리" — the collapsible sidebar on the left: the tree clients see,
// the virtual root "/" with one node per shared folder, each opening lazily
// (local.list) into the real folders and files on disk — folders first,
// files as leaves with their size. Nodes fold and unfold with the chevron,
// double-click / Enter reveals the item in the file manager, ← → ↑ ↓ walk the
// tree. The whole panel hides completely with the button in its head or the
// toolbar's sidebar button (remembered in the session, like its width).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Icons';
import { formatSize } from '../lib/format';

const ROOT = '/';
const IMAGE = /\.(png|jpe?g|gif|bmp|webp|svg|ico|tiff?)$/i;
const fileIcon = (name) => (IMAGE.test(name) ? 'fileImage' : /\.(txt|md|log|json|xml|ya?ml|ini|cfg|csv)$/i.test(name) ? 'fileText' : 'file');

export function TreePanel({ shares, missing, collapsed, onToggle, width, onResizeStart, onReveal, canReveal, onSelect }) {
  useLanguage();
  const [expanded, setExpanded] = useState(() => new Set([ROOT]));
  const [loaded, setLoaded] = useState({});      // physical path → { children: [{ name, path }], error }
  const [selected, setSelected] = useState(ROOT);
  const [refreshTick, setRefreshTick] = useState(0);

  // Share roots: the virtual name is the label, the physical path the key.
  const roots = useMemo(() => shares.map((s, i) => ({ key: s.physicalPath, name: s.virtualName, path: s.physicalPath, missing: missing.has(i), root: true })), [shares, missing]);

  const load = useCallback(async (path) => {
    setLoaded((m) => ({ ...m, [path]: { ...(m[path] || {}), loading: true } }));
    try {
      const r = await call('local.list', { path, filesToo: true });
      setLoaded((m) => ({ ...m, [path]: { children: r.entries.map((e) => ({ key: e.path, name: e.name, path: e.path, file: !e.isDir, size: e.size })), error: null } }));
    } catch (err) {
      setLoaded((m) => ({ ...m, [path]: { children: [], error: err && err.code === 'EACCES' ? t('pick_denied') : (err && err.message) || 'error' } }));
    }
  }, []);

  // Refresh: forget every loaded folder; the expanded ones reload on render.
  const refresh = () => { setLoaded({}); setRefreshTick((n) => n + 1); };
  useEffect(() => {
    for (const p of expanded) if (p !== ROOT && !loaded[p]) load(p);
  }, [expanded, loaded, load, refreshTick]);

  const toggle = (key) => setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const select = (node) => { setSelected(node.key); if (onSelect) onSelect(node); };

  // Flat list of the visible rows for keyboard navigation. `guides` holds one
  // entry per indent level: true where an ancestor's vertical line continues
  // (it still has siblings below); `last` marks the final child (└ not ├).
  const rows = useMemo(() => {
    const out = [{ key: ROOT, name: ROOT, depth: 0, root: false, isRoot: true, path: '', guides: [], last: true }];
    const walk = (node, depth, guides, last) => {
      out.push({ ...node, depth, guides, last });
      if (node.file || !expanded.has(node.key) || node.missing) return;
      const below = [...guides, !last];
      const l = loaded[node.path];
      const info = (suffix, name, error) => out.push({ key: `${node.key}#${suffix}`, name, depth: depth + 1, info: true, error, guides: below, last: true });
      if (!l || l.loading) return info('loading', t('loading'));
      if (l.error) return info('err', l.error, true);
      if (!l.children.length) return info('empty', t('pick_empty'));
      return l.children.forEach((c, i) => walk(c, depth + 1, below, i === l.children.length - 1));
    };
    if (expanded.has(ROOT)) roots.forEach((r, i) => walk(r, 1, [], i === roots.length - 1));
    return out;
  }, [roots, expanded, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Indent cells: a vertical line for every ancestor that continues, then the
  // ├ / └ connector of the row itself.
  const indent = (r) => (
    <span className="tree-indent">
      {r.guides.map((line, i) => <span key={i} className={`tree-guide ${line ? 'line' : ''}`} />)}
      {r.depth > 0 && <span className={`tree-guide elbow ${r.last ? 'last' : ''}`} />}
    </span>
  );

  const onKey = (e) => {
    const i = rows.findIndex((r) => r.key === selected);
    const cur = rows[i];
    if (!cur) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); const n = rows.slice(i + 1).find((r) => !r.info); if (n) select(n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); const n = rows.slice(0, i).reverse().find((r) => !r.info); if (n) select(n); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (!cur.file && !expanded.has(cur.key) && !cur.missing) toggle(cur.key); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (expanded.has(cur.key)) toggle(cur.key); else { const p = rows.slice(0, i).reverse().find((r) => r.depth < cur.depth); if (p) select(p); } }
    else if (e.key === 'Enter' && cur.path && canReveal) onReveal(cur.path);
    else if (e.key === 'F5') { e.preventDefault(); refresh(); }
  };

  // Folded: nothing at all — the toolbar's sidebar button brings it back.
  if (collapsed) return null;
  return (
    <>
      <section className="panel tree-panel" style={{ width }}>
        <div className="panel-head">
          <Icon name="folder" /><span className="panel-title">{t('tree_title')}</span>
          <span className="spacer" />
          <button className="icon-btn" title={t('tree_collapse_all')} onClick={() => setExpanded(new Set([ROOT]))}><Icon name="collapseAll" size={14} /></button>
          <button className="icon-btn" title={t('tree_refresh')} onClick={refresh}><Icon name="refresh" size={14} /></button>
          <button className="icon-btn tree-toggle" title={t('tree_collapse')} onClick={onToggle}><Icon name="chevronLeft" size={14} /></button>
        </div>
        <div className="tree-body" tabIndex={0} role="tree" onKeyDown={onKey}>
          {rows.map((r) => {
            if (r.info) return <div key={r.key} className={`tree-row info ${r.error ? 'error' : ''}`}>{indent(r)}<span className="tree-chevron none" />{r.name}</div>;
            const isOpen = expanded.has(r.key);
            const canOpen = !r.missing && !r.file;
            return (
              <div key={r.key} role="treeitem" aria-expanded={canOpen ? isOpen : undefined} aria-selected={selected === r.key}
                className={`tree-row ${selected === r.key ? 'selected' : ''} ${r.missing ? 'missing' : ''} ${r.root ? 'root' : ''} ${r.file ? 'file' : ''}`}
                title={r.isRoot ? t('tree_root_tip') : r.missing ? `${r.path} — ${t('share_missing')}` : r.path}
                onClick={() => select(r)}
                onDoubleClick={() => { if (r.path && canReveal && !r.missing) onReveal(r.path); else if (canOpen) toggle(r.key); }}>
                {indent(r)}
                <span className={`tree-chevron ${canOpen ? '' : 'none'}`} onClick={(e) => { e.stopPropagation(); if (canOpen) toggle(r.key); }}>
                  {canOpen && <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />}
                </span>
                <Icon name={r.isRoot ? 'server' : r.file ? fileIcon(r.name) : isOpen ? 'folderOpen' : 'folder'} size={14} />
                <span className="tree-name ellipsis">{r.isRoot ? ROOT : r.root ? `/${r.name}` : r.name}</span>
                {r.file && <span className="tree-size">{formatSize(r.size)}</span>}
                {r.missing && <span className="tree-badge">{t('share_missing')}</span>}
              </div>
            );
          })}
          {!roots.length && <div className="tree-row info"><span className="tree-indent"><span className="tree-guide elbow last" /></span><span className="tree-chevron none" />{t('tree_empty')}</div>}
        </div>
      </section>
      <div className="v-splitter" onMouseDown={(e) => { if (e.button === 0) onResizeStart(e); }} />
    </>
  );
}

export default TreePanel;
