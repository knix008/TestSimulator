// The folder tree of a panel: a pane beside the file list (View › folder
// tree, or the panel's side label) that stays open. Roots = home, /, /tmp,
// drives and mounts; children load lazily; the tree expands to the panel's
// current folder when opened and follows it as the panel moves. A click opens
// the folder in the panel (the pane stays), double-click / the chevron folds
// a branch.
import React, { useEffect, useRef, useState } from 'react';
import { call } from '../lib/backend';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

function isSamePath(a, b) {
  const n = (p) => p.replace(/[\\/]+$/, '').toLowerCase();
  return n(a) === n(b);
}

function isUnder(root, p) {
  const r = root.replace(/[\\/]+$/, '').toLowerCase();
  const q = p.replace(/[\\/]+$/, '').toLowerCase();
  if (r === '') return q.startsWith('/');
  return q === r || q.startsWith(r + '/') || q.startsWith(r + '\\');
}

export function FolderTree({ currentPath, onSelect, width }) {
  useLanguage();
  const [nodes, setNodes] = useState([]);     // top-level roots
  const [selected, setSelected] = useState(currentPath);
  const boxRef = useRef(null);

  const setChildren = (path, children) => {
    setNodes((prev) => patch(prev, path, (n) => ({ ...n, children, expanded: true, loading: false })));
  };
  const patch = (list, path, fn) => list.map((n) => {
    if (isSamePath(n.path, path)) return fn(n);
    if (n.children) return { ...n, children: patch(n.children, path, fn) };
    return n;
  });

  const load = async (path) => {
    try {
      const kids = await call('fs.subdirs', { path });
      const children = kids.map((k) => ({ name: k.name, path: k.path, children: null, expanded: false }));
      setChildren(path, children);
      return children;
    } catch {
      setChildren(path, []);
      return [];
    }
  };

  // Expand the tree down to `target` (loading what is not loaded yet) and select it. `top` is the root list
  // to start from; the loaded children of a node are reused, so following the panel costs one fs.subdirs
  // per new level only.
  const topRef = useRef([]);
  const expandTo = async (target, top, isAlive) => {
    const best = top.filter((n) => isUnder(n.path, target)).sort((a, b) => b.path.length - a.path.length)[0];
    if (!best) return;
    let node = best;
    let kids = node.children || await load(node.path);
    if (node.children) setNodes((prev) => patch(prev, node.path, (x) => ({ ...x, expanded: true })));
    const rel = target.slice(node.path.length).split(/[\\/]+/).filter(Boolean);
    for (const part of rel) {
      if (!isAlive()) return;
      const next = kids.find((k) => k.name.toLowerCase() === part.toLowerCase());
      if (!next) break;
      node = next;
      kids = node.children || await load(node.path);
      if (node.children) setNodes((prev) => patch(prev, node.path, (x) => ({ ...x, expanded: true })));
    }
    if (!isAlive()) return;
    setSelected(node.path);
    setTimeout(() => {
      const el = boxRef.current && boxRef.current.querySelector('.tree-row.selected');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, 30);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      let roots = [];
      try { roots = await call('fs.roots'); } catch { /* none */ }
      if (!alive) return;
      const top = roots.map((r) => ({
        name: r.kind === 'home' ? t('home') : r.label,
        path: r.path,
        kind: r.kind,
        children: null,
        expanded: false,
      }));
      topRef.current = top;
      setNodes(top);
      await expandTo(currentPath, top, () => alive);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The panel moved (double-click in the list, the path bar, a tab …): follow it.
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  useEffect(() => {
    if (!nodesRef.current.length || isSamePath(selected, currentPath)) return undefined;
    let alive = true;
    expandTo(currentPath, nodesRef.current, () => alive);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const toggle = async (n) => {
    if (n.expanded) { setNodes((prev) => patch(prev, n.path, (x) => ({ ...x, expanded: false }))); return; }
    if (n.children) { setNodes((prev) => patch(prev, n.path, (x) => ({ ...x, expanded: true }))); return; }
    setNodes((prev) => patch(prev, n.path, (x) => ({ ...x, loading: true })));
    await load(n.path);
  };

  const render = (list, depth) => list.map((n) => (
    <React.Fragment key={n.path}>
      <div className={`tree-row ${isSamePath(n.path, selected) ? 'selected' : ''}`} style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => { setSelected(n.path); onSelect(n.path); }}
        onDoubleClick={(e) => { e.stopPropagation(); toggle(n); }}
        title={n.path}>
        <span className="tree-expander" onClick={(e) => { e.stopPropagation(); toggle(n); }}>
          {n.children && n.children.length === 0 ? <span className="tree-leaf" /> : <Icon name={n.expanded ? 'chevronDown' : 'chevronRight'} size={14} />}
        </span>
        <Icon name={n.kind === 'drive' || n.kind === 'mount' ? 'drive' : n.kind === 'home' ? 'home' : n.expanded ? 'folderOpen' : 'folder'} size={14} className="tree-icon" />
        <span className="ellipsis">{n.name}</span>
        {n.loading && <span className="muted small"> …</span>}
      </div>
      {n.expanded && n.children && render(n.children, depth + 1)}
    </React.Fragment>
  ));

  return <div className="folder-tree" ref={boxRef} style={width ? { width } : undefined}>{render(nodes, 0)}</div>;
}
