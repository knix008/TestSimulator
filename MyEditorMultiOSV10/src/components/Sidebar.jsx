// Folder tree (보기 › 폴더 트리, Ctrl+B): the folder opened with 파일 › 폴더
// 열기, expanded recursively so every file is visible as a tree (build /
// dependency folders such as node_modules and .git stay collapsed, and very
// large trees stop expanding after a few thousand entries). Click opens a
// file; right-click gives new file / folder, rename, delete, reveal, copy
// path. The filter box narrows the loaded tree to matching names.
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

// Folders that are not expanded automatically (they are still expandable by hand).
const HEAVY_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'release', 'build', 'out', 'target', 'bin', 'obj', '__pycache__', '.venv', 'venv', '.cache', '.smoke', '.idea', '.vs', 'vendor', 'bower_components', 'coverage', '.next', '.nuxt']);
const AUTO_EXPAND_MAX_DEPTH = 12;
const AUTO_EXPAND_MAX_NODES = 5000;

function fileIcon(name) {
  if (CODE_EXT.test(name)) return 'fileCode';
  if (MARKUP_EXT.test(name)) return 'fileMarkup';
  if (IMAGE_EXT.test(name)) return 'fileImage';
  if (ARCHIVE_EXT.test(name)) return 'fileArchive';
  if (BIN_EXT.test(name)) return 'fileExe';
  return 'fileText';
}

// A node: { path, name, isDir, children: null | [], open, loading, error }
export function Sidebar({ folder, activePath, openPaths, onOpenFile, onOpenFolder, onCloseFolder, onError, onAction, width, showHidden, onToggleHidden, refreshKey }) {
  useLanguage();
  const [root, setRoot] = useState(null);
  const [filter, setFilter] = useState('');
  const [ctx, setCtx] = useState(null);      // { node, x, y }
  const [selected, setSelected] = useState(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const version = useRef(0);

  const load = useCallback(async (node) => {
    node.loading = true; node.error = null;
    setRoot((r) => (r ? { ...r } : r));
    try {
      const l = await call('fs.list', { path: node.path, showHidden });
      node.children = l.entries.map((e) => ({ path: e.path, name: e.name, isDir: e.isDir, children: null, open: false, hidden: e.hidden }));
    } catch (e) {
      node.children = [];
      node.error = e.message;
    }
    node.loading = false;
    version.current++;
    setRoot((r) => (r ? { ...r } : r));
  }, [showHidden]);

  // Expands every sub-folder of `node` (breadth first) so the whole tree is
  // visible, within the depth / size limits above.
  const expandAll = useCallback(async (node, token) => {
    let count = 0;
    let level = [node];
    for (let depth = 0; level.length && depth < AUTO_EXPAND_MAX_DEPTH; depth++) {
      const next = [];
      for (const n of level) {
        if (token.cancelled) return;
        if (!n.isDir) continue;
        if (n !== node && HEAVY_DIRS.has(n.name)) continue;
        if (n.children === null) await load(n);
        if (token.cancelled) return;
        n.open = true;
        count += n.children.length;
        if (count > AUTO_EXPAND_MAX_NODES) { setRoot((r) => (r ? { ...r } : r)); return; }
        for (const c of n.children) if (c.isDir) next.push(c);
      }
      level = next;
      setRoot((r) => (r ? { ...r } : r));
    }
  }, [load]);

  // (Re)build the root when the folder changes / refresh is requested.
  useEffect(() => {
    if (!folder) { setRoot(null); return undefined; }
    const node = { path: folder, name: folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folder, isDir: true, children: null, open: true };
    setRoot(node);
    const token = { cancelled: false };
    expandAll(node, token);
    return () => { token.cancelled = true; };
  }, [folder, expandAll, refreshKey, localRefresh]);

  const collapseAll = () => {
    if (!root) return;
    const walk = (n) => { if (n.isDir && n !== root) n.open = false; for (const c of n.children || []) walk(c); };
    walk(root);
    setRoot({ ...root });
  };

  const toggle = (node) => {
    if (!node.isDir) return;
    node.open = !node.open;
    if (node.open && node.children === null) load(node); else setRoot((r) => ({ ...r }));
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

  const rows = useMemo(() => {
    const out = [];
    const walk = (n, depth) => {
      if (n !== root && !matches(n)) return;
      out.push({ node: n, depth });
      if (n.isDir && (n.open || (filterLower && n.children))) for (const c of n.children || []) walk(c, depth + 1);
    };
    if (root) walk(root, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, filterLower, version.current]);

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sb-head">
        <span className="panel-title">{t('sb_title')}</span>
        <span className="spacer" />
        <button className="icon-btn" title={t('sb_open')} onClick={onOpenFolder}><Icon name="folderOpen" size={15} /></button>
        <button className="icon-btn" title={t('sb_refresh')} disabled={!root} onClick={() => setLocalRefresh((x) => x + 1)}><Icon name="refresh" size={15} /></button>
        <button className="icon-btn" title={t('sb_expand')} disabled={!root} onClick={() => root && expandAll(root, { cancelled: false })}><Icon name="chevronDown" size={15} /></button>
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
        {rows.map(({ node, depth }) => {
          const isActive = node.path === activePath;
          const isOpen = openPaths.has(node.path);
          return (
            <div key={node.path}
              className={`tree-row ${isActive ? 'active' : ''} ${selected === node.path ? 'selected' : ''} ${isOpen ? 'opened' : ''} ${node.hidden ? 'hidden-file' : ''}`}
              style={{ paddingLeft: 6 + depth * 14 }}
              title={node.path}
              onClick={() => { setSelected(node.path); if (node.isDir) toggle(node); else onOpenFile(node.path); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelected(node.path); setCtx({ node, x: e.clientX, y: e.clientY }); }}>
              <span className="tree-expander">{node.isDir ? (node.loading ? <Icon name="moreH" size={12} /> : <Icon name={node.open ? 'chevronDown' : 'chevronRight'} size={12} />) : null}</span>
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
