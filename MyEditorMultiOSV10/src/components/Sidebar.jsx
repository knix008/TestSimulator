// Folder tree (보기 › 폴더 트리, Ctrl+B): the folder opened with 파일 › 폴더
// 열기 as a classic tree view with connecting guide lines. Only the root is
// listed at first; a folder loads and expands when it is clicked, stays
// expanded until it is clicked again, and expanded folders are left alone
// when others are toggled; 모두 펼치기 / 모두 접기 buttons expand or collapse
// the whole tree. Click opens a file; right-click gives new file /
// folder, rename, delete, reveal, copy path. The filter box narrows the
// loaded tree to matching names.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';

const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py|c|cpp|h|hpp|cs|java|go|rs|php|rb|sh|bat|ps1|sql|kt|swift|lua|pl|r|m|scala|dart|vue|svelte)$/i;
const MARKUP_EXT = /\.(html?|xml|svg|css|scss|less|json|ya?ml|toml|md|markdown|ini|cfg|conf|csv)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp|ico|icns|tiff?)$/i;
const ARCHIVE_EXT = /\.(zip|7z|rar|tar|gz|bz2|xz|tgz)$/i;
const BIN_EXT = /\.(exe|dll|so|dylib|bin|msi|dmg|deb|rpm|appimage|pdf|docx?|xlsx?|pptx?|mp[34]|mkv|avi|wav|flac|ogg)$/i;

// "Expand all" leaves these collapsed and stops after this many entries.
const HEAVY_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'release', 'build', 'out', 'target', 'bin', 'obj', '__pycache__', '.venv', 'venv', '.cache', '.smoke', '.idea', '.vs', 'vendor', 'bower_components', 'coverage', '.next', '.nuxt']);
const EXPAND_ALL_MAX_DEPTH = 12;
const EXPAND_ALL_MAX_NODES = 5000;

function fileIcon(name) {
  if (CODE_EXT.test(name)) return 'fileCode';
  if (MARKUP_EXT.test(name)) return 'fileMarkup';
  if (IMAGE_EXT.test(name)) return 'fileImage';
  if (ARCHIVE_EXT.test(name)) return 'fileArchive';
  if (BIN_EXT.test(name)) return 'fileExe';
  return 'fileText';
}

// A node: { path, name, isDir, children: null | [], open, loading, error }
// The tree is a mutable object graph; `tick` forces a re-render after a
// mutation (copying the root would freeze fields that later loads change).
export function Sidebar({ folder, activePath, openPaths, onOpenFile, onOpenFolder, onCloseFolder, onError, onAction, width, showHidden, onToggleHidden, refreshKey, searchOn, onToggleSearch }) {
  useLanguage();
  const [root, setRoot] = useState(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((x) => x + 1), []);
  const [filter, setFilter] = useState('');
  const [ctx, setCtx] = useState(null);      // { node, x, y }
  const [selected, setSelected] = useState(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  const load = useCallback(async (node) => {
    node.loading = true; node.error = null;
    refresh();
    try {
      const l = await call('fs.list', { path: node.path, showHidden });
      node.children = l.entries.map((e) => ({ path: e.path, name: e.name, isDir: e.isDir, children: null, open: false, hidden: e.hidden }));
    } catch (e) {
      node.children = [];
      node.error = e.message;
    }
    node.loading = false;
    refresh();
  }, [showHidden, refresh]);

  // (Re)build the root when the folder changes / refresh is requested. A
  // refresh re-reads the folders that are currently expanded and keeps them
  // expanded.
  const rootRef = useRef(null);
  useEffect(() => {
    if (!folder) { rootRef.current = null; setRoot(null); return; }
    const wasOpen = new Set();
    const collect = (n) => { if (n.isDir && n.open) wasOpen.add(n.path); for (const c of n.children || []) collect(c); };
    if (rootRef.current && rootRef.current.path === folder) collect(rootRef.current);
    const node = { path: folder, name: folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folder, isDir: true, children: null, open: true };
    rootRef.current = node;
    setRoot(node);
    (async () => {
      let level = [node];
      while (level.length) {
        const next = [];
        for (const n of level) {
          if (rootRef.current !== node) return;
          await load(n);
          for (const c of n.children) if (c.isDir && wasOpen.has(c.path)) { c.open = true; next.push(c); }
        }
        level = next;
      }
    })();
  }, [folder, load, refreshKey, localRefresh]);

  // Expands every folder under the root, loading as needed (breadth first).
  // Dependency / build folders are left collapsed and very large trees stop
  // after a few thousand entries — both can still be expanded by hand.
  const expandAll = async () => {
    const node = rootRef.current;
    if (!node) return;
    let count = 0;
    let level = [node];
    for (let depth = 0; level.length && depth < EXPAND_ALL_MAX_DEPTH; depth++) {
      const next = [];
      for (const n of level) {
        if (rootRef.current !== node) return;
        if (n !== node && HEAVY_DIRS.has(n.name)) continue;
        if (n.children === null) await load(n);
        n.open = true;
        count += n.children.length;
        if (count > EXPAND_ALL_MAX_NODES) { refresh(); return; }
        for (const c of n.children) if (c.isDir) next.push(c);
      }
      level = next;
      refresh();
    }
  };

  const collapseAll = () => {
    if (!root) return;
    const walk = (n) => { if (n.isDir && n !== root) n.open = false; for (const c of n.children || []) walk(c); };
    walk(root);
    refresh();
  };

  const toggle = (node) => {
    if (!node.isDir) return;
    node.open = !node.open;
    if (node.open && node.children === null) load(node); else refresh();
  };

  // Keep the tree in sync after our own file operations.
  const reloadParent = (p) => {
    const dir = p.replace(/[\\/][^\\/]*$/, '');
    const find = (n) => (n.path === dir ? n : (n.children || []).map(find).find(Boolean));
    const node = root && find(root);
    if (node) load(node);
  };

  const items = (node) => [
    ...(node.isDir ? [
      { id: 'newFile', label: t('sb_new_file'), icon: 'filePlus' },
      { id: 'newFolder', label: t('sb_new_folder'), icon: 'folderNew' },
      { sep: true },
    ] : [
      { id: 'open', label: t('open_file').replace('…', ''), icon: 'fileText' },
      { sep: true },
    ]),
    { id: 'rename', label: t('sb_rename'), icon: 'rename', disabled: node === root },
    { id: 'delete', label: t('sb_delete'), icon: 'trash', disabled: node === root },
    { sep: true },
    { id: 'reveal', label: t('reveal'), icon: 'explorer' },
    { id: 'copyPath', label: t('copy_path'), icon: 'copy' },
    { sep: true },
    { id: 'refresh', label: t('sb_refresh'), icon: 'refresh' },
  ];

  const pick = async (id, node) => {
    if (id === 'open') onOpenFile(node.path);
    else if (id === 'refresh') { if (node.isDir) load(node); else reloadParent(node.path); }
    else if (id === 'reveal' || id === 'copyPath') onAction(id, node.path);
    else if (id === 'newFile' || id === 'newFolder' || id === 'rename' || id === 'delete') {
      const done = await onAction(id, node.path, node);
      if (done) { if (id === 'rename' || id === 'delete') reloadParent(node.path); else { node.open = true; load(node); } }
    }
  };

  const filterLower = filter.trim().toLowerCase();
  const matches = (n) => !filterLower || n.name.toLowerCase().includes(filterLower) || (n.children || []).some(matches);

  // Rows in display order. `guides` says, for every ancestor level, whether
  // a vertical line continues past this row (the ancestor has later
  // siblings); `last` marks the last child of its parent (└ instead of ├).
  const rows = useMemo(() => {
    const out = [];
    const walk = (n, depth, guides, last) => {
      if (n !== root && !matches(n)) return;
      out.push({ node: n, depth, guides, last });
      if (n.isDir && (n.open || (filterLower && n.children))) {
        const kids = (n.children || []).filter((c) => matches(c));
        kids.forEach((c, i) => walk(c, depth + 1, depth === 0 ? [] : [...guides, !last], i === kids.length - 1));
      }
    };
    if (root) walk(root, 0, [], true);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, filterLower, tick]);

  return (
    <div className="sidebar" style={width ? { width } : undefined}>
      <div className="sb-head">
        <span className="panel-title">{t('sb_title')}</span>
        <span className="spacer" />
        <button className={`icon-btn ${searchOn ? 'on' : ''}`} title={t('search_title')} onClick={onToggleSearch}><Icon name="search" size={15} /></button>
        <button className="icon-btn" title={t('sb_open')} onClick={onOpenFolder}><Icon name="folderOpen" size={15} /></button>
        <button className="icon-btn" title={t('sb_refresh')} disabled={!root} onClick={() => setLocalRefresh((x) => x + 1)}><Icon name="refresh" size={15} /></button>
        <button className="icon-btn" title={t('sb_expand')} disabled={!root} onClick={expandAll}><Icon name="chevronDown" size={15} /></button>
        <button className="icon-btn" title={t('sb_collapse')} disabled={!root} onClick={collapseAll}><Icon name="chevronUp" size={15} /></button>
        <button className={`icon-btn ${showHidden ? 'on' : ''}`} title={t('sb_hidden')} onClick={onToggleHidden}><Icon name={showHidden ? 'eye' : 'eyeOff'} size={15} /></button>
        <button className="icon-btn" title={t('close_folder')} disabled={!root} onClick={onCloseFolder}><Icon name="close" size={15} /></button>
      </div>
      {root && (
        <div className="sb-filter">
          <Icon name="filter" size={13} />
          <input value={filter} placeholder={t('sb_filter')} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
          {filter && <button className="icon-btn" onClick={() => setFilter('')}><Icon name="close" size={12} /></button>}
        </div>
      )}
      <div className="sb-body" onContextMenu={(e) => { if (root && e.target === e.currentTarget) { e.preventDefault(); setCtx({ node: root, x: e.clientX, y: e.clientY }); } }}>
        {!root && (
          <div className="sb-empty">
            <Icon name="folderOpen" size={28} />
            <p>{t('sb_empty')}</p>
            <button className="btn" onClick={onOpenFolder}>{t('sb_open')}</button>
          </div>
        )}
        {rows.map(({ node, depth, guides, last }) => {
          const isActive = node.path === activePath;
          const isOpen = openPaths.has(node.path);
          return (
            <div key={node.path}
              className={`tree-row ${node.isDir ? 'dir' : 'file'} ${isActive ? 'active' : ''} ${selected === node.path ? 'selected' : ''} ${isOpen ? 'opened' : ''} ${node.hidden ? 'hidden-file' : ''}`}
              title={node.path}
              onClick={() => { setSelected(node.path); if (node.isDir) toggle(node); else onOpenFile(node.path); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelected(node.path); setCtx({ node, x: e.clientX, y: e.clientY }); }}>
              {depth > 0 && (
                <span className="tree-guides">
                  {guides.map((cont, i) => <span key={i} className={`guide ${cont ? 'v' : ''}`} />)}
                  <span className={`guide ${last ? 'end' : 'mid'}`} />
                </span>
              )}
              <span className="tree-expander">{node.isDir ? (node.loading ? <Icon name="moreH" size={12} /> : <Icon name={node.open ? 'minusBox' : 'plusBox'} size={13} />) : <span className="tree-leaf" />}</span>
              <Icon name={node.isDir ? (node.open ? 'folderOpen' : 'folder') : fileIcon(node.name)} size={15} className={node.isDir ? 'ic-folder' : 'ic-file'} />
              <span className="tree-name ellipsis">{node.name}</span>
              {node.error && <span className="tree-err" title={node.error}><Icon name="warning" size={12} /></span>}
            </div>
          );
        })}
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={items(ctx.node)} onClose={() => setCtx(null)}
          onPick={(id) => { const n = ctx.node; setCtx(null); pick(id, n); }} />
      )}
    </div>
  );
}

export default Sidebar;
