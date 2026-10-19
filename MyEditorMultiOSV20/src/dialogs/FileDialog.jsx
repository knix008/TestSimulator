// File dialog for the web version (the desktop app uses the native ones):
// browses the server's file system through fs.list / fs.drives.
//   kind = 'open'        multi-select files → resolve(paths[])
//   kind = 'save'        pick a folder + type a name → resolve(path)
//   kind = 'openFolder'  pick a folder → resolve(path)
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Icons';
import { Dialog, ConfirmDialog } from './Dialogs';

const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '');

export function FileDialog({ kind, startPath, defaultName, sep, onResult }) {
  useLanguage();
  const [dir, setDir] = useState(null);
  const [entries, setEntries] = useState([]);
  const [parent, setParent] = useState(null);
  const [drives, setDrives] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [name, setName] = useState(defaultName || '');
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState(null);
  const [overwrite, setOverwrite] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const bodyRef = useRef(null);
  const join = (a, b) => (a.endsWith(sep) || a.endsWith('/') ? a + b : a + sep + b);

  const go = async (p) => {
    try {
      const l = await call('fs.list', { path: p, showHidden });
      setDir(l.path); setPathInput(l.path); setParent(l.parent); setEntries(l.entries); setSelected(new Set()); setError(null);
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { call('fs.drives').then(setDrives).catch(() => {}); }, []);
  useEffect(() => { go(startPath || ''); }, [showHidden]);   // eslint-disable-line react-hooks/exhaustive-deps

  const title = kind === 'save' ? t('fd_save') : kind === 'openFolder' ? t('fd_folder') : t('fd_open');
  const pickable = (e) => (kind === 'openFolder' ? e.isDir : true);

  const finish = async () => {
    if (kind === 'openFolder') { onResult([...selected].find((p) => entries.find((e) => e.path === p && e.isDir)) || dir); return; }
    if (kind === 'save') {
      const n = name.trim();
      if (!n) return;
      const full = /^([a-zA-Z]:[\\/]|\/)/.test(n) ? n : join(dir, n);
      if (entries.some((e) => !e.isDir && e.name === n)) { setOverwrite(full); return; }
      onResult(full);
      return;
    }
    const files = [...selected].filter((p) => entries.find((e) => e.path === p && !e.isDir));
    if (files.length) onResult(files);
  };

  const onRowClick = (e, ent) => {
    if (kind === 'openFolder' && !ent.isDir) return;
    const next = new Set(e.ctrlKey || e.metaKey ? selected : []);
    if (next.has(ent.path)) next.delete(ent.path); else next.add(ent.path);
    if (kind !== 'open') { next.clear(); next.add(ent.path); }
    setSelected(next);
    if (kind === 'save' && !ent.isDir) setName(ent.name);
  };
  const onRowDouble = (ent) => {
    if (ent.isDir) go(ent.path);
    else if (kind === 'open') onResult([ent.path]);
    else if (kind === 'save') { setName(ent.name); setOverwrite(ent.path); }
  };
  const onPathKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(pathInput.trim()); } };

  return (
    <>
      <Dialog title={title} icon={kind === 'save' ? 'fileSave' : 'folderOpen'} kind="info" width={720} className="file-dialog" onClose={() => onResult(null)}
        footer={<>
          {kind === 'save' && <label className="fd-name"><span className="muted small">{t('fd_name')}</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finish(); } }} spellCheck={false} /></label>}
          <span className="spacer" />
          <button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button>
          <button className="btn primary" onClick={finish} disabled={kind === 'save' ? !name.trim() : kind === 'open' ? !selected.size : false}>{kind === 'save' ? t('save') : kind === 'openFolder' ? t('fd_select') : t('fd_open')}</button>
        </>}>
        <div className="fd-top">
          <button className="icon-btn" title={t('fd_up')} disabled={!parent} onClick={() => parent && go(parent)}><Icon name="folderUp" size={16} /></button>
          <input className="fd-path mono" value={pathInput} onChange={(e) => setPathInput(e.target.value)} onKeyDown={onPathKey} spellCheck={false} />
          <button className={`icon-btn ${showHidden ? 'on' : ''}`} title={t('sb_hidden')} onClick={() => setShowHidden(!showHidden)}><Icon name={showHidden ? 'eye' : 'eyeOff'} size={15} /></button>
        </div>
        <div className="fd-main">
          <div className="fd-drives">
            <div className="muted small">{t('fd_drives')}</div>
            {drives.map((d) => <button key={d.path} className={`fd-drive ${dir && dir.toLowerCase().startsWith(d.path.toLowerCase()) ? 'on' : ''}`} onClick={() => go(d.path)}><Icon name={d.name === '~' ? 'home' : 'drive'} size={14} /><span className="ellipsis">{d.name}</span></button>)}
          </div>
          <div className="fd-list" ref={bodyRef}>
            {error && <div className="danger small" style={{ padding: 8 }}>{error}</div>}
            {!error && !entries.length && <div className="muted small" style={{ padding: 8 }}>{t('fd_empty')}</div>}
            <table className="file-table">
              <tbody>
                {entries.map((e) => (
                  <tr key={e.path} className={`${selected.has(e.path) ? 'selected' : ''} ${!pickable(e) ? 'dim' : ''}`} onClick={(ev) => onRowClick(ev, e)} onDoubleClick={() => onRowDouble(e)}>
                    <td className="c-name"><Icon name={e.isDir ? 'folder' : 'fileText'} className={e.isDir ? 'ic-folder' : 'ic-file'} />{e.name}</td>
                    <td className="c-size muted">{e.isDir ? '' : fmtSize(e.size)}</td>
                    <td className="c-date muted">{fmtDate(e.mtime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Dialog>
      {overwrite && (
        <ConfirmDialog title={t('fd_save')} message={t('fd_overwrite', { name: name.trim() })} icon="warning" kind="danger"
          buttons={[{ id: 'yes', label: t('yes'), kind: 'danger' }, { id: 'cancel', label: t('cancel') }]}
          onResult={(r) => { const p = overwrite; setOverwrite(null); if (r === 'yes') onResult(p); }} />
      )}
    </>
  );
}

export default FileDialog;
