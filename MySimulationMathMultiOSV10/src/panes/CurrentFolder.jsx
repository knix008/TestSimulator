// 현재 폴더 / Current Folder: the path bar (up, browse, refresh), a tree of
// the folder (folders first, expandable), double-click opens / runs /
// loads by file kind, a context menu for new / rename / delete / run, and the
// details of the selected file at the bottom.
import React, { useCallback, useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { fsApi, joinPath, dirName, baseName, isDesktop } from '../lib/backend';
import { openMenu } from '../lib/menu';
import { fileIcon, fileKind, getModelExts } from '../lib/files';
import { askText, chooseFile } from '../lib/prompt';
import { ask, showError } from '../lib/ui';
import { record } from '../lib/history';
import { M_EXT } from '../../core/lang/mext.js';
import { copyText } from '../views/common';

const sortEntries = (list) => [...list].sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.isDir ? -1 : 1));

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CurrentFolderPane({ cwd, refreshKey, onChdir, onOpen, onRun, onPathsChanged }) {
  useLanguage();
  const [tree, setTree] = useState({}); // dir -> entries
  const [open, setOpen] = useState({}); // dir -> true
  const [sel, setSel] = useState(null); // full path
  const [error, setError] = useState('');
  const [pathText, setPathText] = useState(cwd);
  useEffect(() => { setPathText(cwd); }, [cwd]);

  const load = useCallback(async (dir) => {
    try {
      const list = await fsApi.list(dir);
      setTree((x) => ({ ...x, [dir]: sortEntries(list.filter((e) => !e.name.startsWith('.'))) }));
      if (dir === cwd) setError('');
    } catch (e) {
      if (dir === cwd) setError(e.message);
    }
  }, [cwd]);

  const reload = useCallback(() => {
    load(cwd);
    for (const d of Object.keys(open)) if (open[d] && d.startsWith(cwd)) load(d);
  }, [cwd, open, load]);

  useEffect(() => { setOpen({}); setSel(null); if (cwd) load(cwd); }, [cwd]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cwd) reload(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (dir) => {
    const on = !open[dir];
    setOpen((x) => ({ ...x, [dir]: on }));
    if (on) load(dir);
  };

  const targetDir = () => {
    if (!sel) return cwd;
    const ent = findEntry(sel);
    return ent && ent.isDir ? sel : dirName(sel);
  };
  const findEntry = (p) => {
    const list = tree[dirName(p)] || [];
    return list.find((e) => e.name === baseName(p)) || null;
  };

  const newFile = async (kind) => {
    const dir = targetDir();
    const def = kind === 'folder' ? t('cf_new_folder_name') : kind === 'model' ? `untitled${getModelExts()[0]}` : `untitled${M_EXT}`;
    const name = await askText({ title: kind === 'folder' ? t('cf_new_folder') : kind === 'model' ? t('cf_new_model') : t('cf_new_script'), label: t('dlg_file_name'), value: def, icon: kind === 'folder' ? 'folder' : 'plus' });
    if (!name) return;
    const p = joinPath(dir, name.trim());
    try {
      if (await fsApi.exists(p)) { showError(new Error(t('cf_exists', { name }))); return; }
      if (kind === 'folder') await fsApi.mkdir(p);
      else if (kind === 'script') await fsApi.writeText(p, '');
      if (kind === 'model') { onOpen(p, { create: true }); return; }
      record({ label: t('hist_create', { name }), undo: () => fsApi.remove(p, true).then(reload), redo: () => (kind === 'folder' ? fsApi.mkdir(p) : fsApi.writeText(p, '')).then(reload) });
      await load(dir);
      setOpen((x) => ({ ...x, [dir]: true }));
      setSel(p);
      if (kind === 'script') onOpen(p);
    } catch (e) { showError(e); }
  };

  const rename = async (p) => {
    const name = await askText({ title: t('cf_rename'), label: t('dlg_file_name'), value: baseName(p), icon: 'edit' });
    if (!name || name === baseName(p)) return;
    const to = joinPath(dirName(p), name.trim());
    try {
      await fsApi.rename(p, to);
      onPathsChanged(p, to);
      record({ label: t('hist_rename', { name: baseName(p) }), undo: () => fsApi.rename(to, p).then(() => { onPathsChanged(to, p); reload(); }), redo: () => fsApi.rename(p, to).then(() => { onPathsChanged(p, to); reload(); }) });
      reload();
      setSel(to);
    } catch (e) { showError(e); }
  };

  const remove = async (p) => {
    const ent = findEntry(p);
    if (!(await ask({ title: t('cf_delete'), body: t('cf_delete_confirm', { name: baseName(p) }), okLabel: t('cf_delete'), danger: true }))) return;
    try {
      // Files can be put back with Undo; folders cannot.
      const bytes = ent && !ent.isDir && ent.size < 64 * 1024 * 1024 ? await fsApi.readBytes(p) : null;
      await fsApi.remove(p, true);
      onPathsChanged(p, null);
      if (bytes) record({ label: t('hist_delete', { name: baseName(p) }), undo: () => fsApi.writeBytes(p, bytes).then(reload), redo: () => fsApi.remove(p).then(reload) });
      reload();
      setSel(null);
    } catch (e) { showError(e); }
  };

  const menuFor = (e, ent, p) => {
    e.preventDefault();
    e.stopPropagation();
    if (p) setSel(p);
    const kind = ent ? (ent.isDir ? 'folder' : fileKind(ent.name)) : null;
    const items = [];
    if (ent && ent.isDir) items.push({ id: 'cd', label: t('cf_open_folder'), icon: 'folder' });
    if (ent && !ent.isDir) items.push({ id: 'open', label: t('open'), icon: 'file', keys: 'Enter' });
    if (kind === 'script') items.push({ id: 'run', label: t('cf_run'), icon: 'play', keys: 'F9' });
    if (ent) items.push({ id: 'copyPath', label: t('cf_copy_path'), icon: 'copy' }, { sep: true });
    items.push(
      { id: 'newScript', label: t('cf_new_script'), icon: 'script' },
      { id: 'newModel', label: t('cf_new_model'), icon: 'model' },
      { id: 'newFolder', label: t('cf_new_folder'), icon: 'folder' },
    );
    if (ent) items.push({ sep: true }, { id: 'rename', label: t('cf_rename'), icon: 'edit', keys: 'F2' }, { id: 'delete', label: t('cf_delete'), icon: 'trash', keys: 'Del' });
    items.push({ sep: true }, { id: 'refresh', label: t('refresh'), icon: 'refresh', keys: 'F5' });
    openMenu({ x: e.clientX, y: e.clientY }, items, (id) => {
      if (id === 'cd') onChdir(p);
      else if (id === 'open') onOpen(p);
      else if (id === 'run') onRun(p);
      else if (id === 'copyPath') copyText(p);
      else if (id === 'newScript') newFile('script');
      else if (id === 'newModel') newFile('model');
      else if (id === 'newFolder') newFile('folder');
      else if (id === 'rename') rename(p);
      else if (id === 'delete') remove(p);
      else if (id === 'refresh') reload();
    });
  };

  const renderDir = (dir, depth) => (tree[dir] || []).map((ent) => {
    const p = joinPath(dir, ent.name);
    const isOpen = !!open[p];
    return (
      <React.Fragment key={p}>
        <div className={`cf-row ${sel === p ? 'sel' : ''}`} role="treeitem" aria-selected={sel === p} aria-expanded={ent.isDir ? isOpen : undefined}
          style={{ paddingLeft: 6 + depth * 14 }} title={p}
          onClick={() => setSel(p)}
          onDoubleClick={() => (ent.isDir ? onChdir(p) : onOpen(p))}
          onContextMenu={(e) => menuFor(e, ent, p)}>
          {ent.isDir
            ? <button type="button" className={`cf-twisty ${isOpen ? 'open' : ''}`} aria-label={isOpen ? t('collapse') : t('expand')} onClick={(e) => { e.stopPropagation(); toggle(p); }}><Icon name="chevronRight" size={12} /></button>
            : <span className="cf-twisty-sp" />}
          <Icon name={ent.isDir ? 'folder' : fileIcon(ent.name)} size={14} className={ent.isDir ? 'cf-folder' : `cf-file cf-${fileKind(ent.name)}`} />
          <span className="cf-name ellipsis">{ent.name}</span>
        </div>
        {ent.isDir && isOpen && renderDir(p, depth + 1)}
      </React.Fragment>
    );
  });

  const selEnt = sel ? findEntry(sel) : null;
  return (
    <div className="pane cf-pane">
      <div className="pane-tools cf-bar">
        <button type="button" className="icon-btn" title={t('cf_up')} aria-label={t('cf_up')} disabled={!cwd || dirName(cwd) === cwd} onClick={() => onChdir(dirName(cwd))}><Icon name="arrowUp" size={14} /></button>
        <input className="cf-path mono" value={pathText} aria-label={t('cf_path')} title={cwd} onChange={(e) => setPathText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onChdir(pathText.trim()); else if (e.key === 'Escape') setPathText(cwd); }} onBlur={() => setPathText(cwd)} />
        <button type="button" className="icon-btn" title={t('cf_browse')} aria-label={t('cf_browse')} onClick={async () => { const p = await chooseFile({ mode: 'folder', start: cwd, title: t('cf_browse') }); if (p) onChdir(p); }}><Icon name="folder" size={14} /></button>
        <button type="button" className="icon-btn" title={t('refresh')} aria-label={t('refresh')} onClick={reload}><Icon name="refresh" size={14} /></button>
      </div>
      <div className="pane-scroll cf-tree" role="tree" aria-label={t('cf_title')} tabIndex={0} onContextMenu={(e) => menuFor(e, null, null)}
        onKeyDown={(e) => {
          if (!sel) return;
          const ent = findEntry(sel);
          if (e.key === 'Enter' && ent) { if (ent.isDir) onChdir(sel); else onOpen(sel); }
          else if (e.key === 'F2') { e.preventDefault(); rename(sel); }
          else if (e.key === 'Delete') remove(sel);
          else if (e.key === 'F9' && ent && fileKind(ent.name) === 'script') onRun(sel);
        }}>
        {error && <div className="pane-empty small bad">{error}</div>}
        {!error && renderDir(cwd, 0)}
        {!error && tree[cwd] && !tree[cwd].length && <div className="pane-empty small muted">{t('cf_empty')}</div>}
      </div>
      <div className="cf-details small">
        {selEnt
          ? <><Icon name={selEnt.isDir ? 'folder' : fileIcon(selEnt.name)} size={13} /><span className="ellipsis" title={sel}>{selEnt.name}</span><span className="spacer" />{!selEnt.isDir && <span>{fmtSize(selEnt.size)}</span>}<span>{fmtTime(selEnt.mtimeMs)}</span></>
          : <span className="muted ellipsis">{isDesktop ? t('cf_details_hint') : t('cf_details_hint_web')}</span>}
      </div>
    </div>
  );
}
