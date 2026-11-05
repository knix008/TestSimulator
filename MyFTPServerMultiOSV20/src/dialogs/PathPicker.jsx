// Folder / file picker for the web version (the desktop app uses the OS
// dialogs): browses the file system of the machine the server runs on via
// local.roots / local.list. spec: { mode: 'folder'|'file'|'save', start,
// extensions?: ['.pem', …], defaultName? }
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { DialogFrame } from './Dialogs';
import { Icon } from '../components/Icons';

export function PathPicker({ spec, done }) {
  useLanguage();
  const mode = spec.mode || 'folder';
  const [roots, setRoots] = useState([]);
  const [dir, setDir] = useState(spec.start || '');
  const [listing, setListing] = useState({ path: '', parent: null, entries: [] });
  const [error, setError] = useState('');
  const [file, setFile] = useState(spec.defaultName || '');
  const [sep, setSep] = useState('/');

  const load = async (p) => {
    setError('');
    try {
      const r = await call('local.list', { path: p, filesToo: mode !== 'folder', extensions: mode === 'file' ? spec.extensions || null : null });
      setListing(r);
      setDir(r.path);
    } catch (err) {
      setError(err.code === 'EACCES' ? t('pick_denied') : err.message);
    }
  };

  useEffect(() => {
    (async () => {
      const info = await call('app.info');
      setSep(info.sep);
      const r = await call('local.roots');
      setRoots(r.roots);
      const start = spec.start || (r.roots[0] && r.roots[0].path) || info.home;
      load(start);
    })().catch((err) => setError(err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const join = (a, b) => (a.endsWith(sep) || a.endsWith('/') ? a + b : a + sep + b);
  const choose = () => {
    if (mode === 'folder') return done(dir);
    if (mode === 'save') return file.trim() ? done(join(dir, file.trim())) : undefined;
    return file ? done(join(dir, file)) : undefined;
  };
  const newFolder = async () => {
    const name = window.prompt(t('lbl_folder_name'), t('default_folder'));
    if (!name) return;
    try { await call('local.mkdir', { dir, name }); load(dir); } catch (err) { setError(err.message); }
  };

  const title = mode === 'folder' ? t('dlg_pick_folder') : mode === 'save' ? t('log_save') : t('dlg_pick_file');
  return (
    <DialogFrame title={title} onClose={() => done(null)} icon={mode === 'folder' ? 'folderOpen' : 'file'} width={640}
      footer={<>
        {mode === 'folder' && <button className="btn" onClick={newFolder}><Icon name="folderNew" size={14} /> {t('pick_new_folder')}</button>}
        <span className="spacer" />
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={choose} disabled={mode !== 'folder' && !file.trim()}>{t('pick_select')}</button>
      </>}>
      <div className="picker">
        <div className="picker-roots">
          <div className="muted small" style={{ padding: '2px 6px' }}>{t('pick_drives')}</div>
          {roots.map((r) => (
            <button key={r.path} className={`picker-root ${listing.path && listing.path.toLowerCase().startsWith(r.path.toLowerCase()) ? 'selected' : ''}`} onClick={() => load(r.path)}>
              <Icon name={r.kind === 'home' ? 'home' : r.kind === 'network' ? 'driveNet' : r.kind === 'removable' ? 'driveUsb' : 'drive'} size={14} /> <span className="ellipsis">{r.name}</span>
            </button>
          ))}
        </div>
        <div className="picker-main">
          <div className="row">
            <button className="icon-btn" title={t('pick_up')} disabled={!listing.parent} onClick={() => listing.parent && load(listing.parent)}><Icon name="folderUp" size={14} /></button>
            <input value={dir} spellCheck={false} onChange={(e) => setDir(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(dir); }} />
            <button className="icon-btn" title={t('ctx_refresh')} onClick={() => load(dir)}><Icon name="refresh" size={14} /></button>
          </div>
          <div className="picker-list">
            {error && <div className="danger small" style={{ padding: 8 }}>{error}</div>}
            {!error && listing.entries.length === 0 && <div className="muted small" style={{ padding: 8 }}>{t('pick_empty')}</div>}
            {listing.entries.map((e) => (
              <div key={e.path} className={`picker-item ${!e.isDir && file === e.name ? 'selected' : ''}`}
                onClick={() => { if (e.isDir) load(e.path); else setFile(e.name); }}
                onDoubleClick={() => { if (!e.isDir) done(e.path); }}>
                <Icon name={e.isDir ? 'folder' : 'file'} size={14} className={e.isDir ? 'ic-folder' : 'ic-file'} />
                <span className="ellipsis">{e.name}</span>
              </div>
            ))}
          </div>
          {mode !== 'folder' && (
            <div className="row">
              <span className="muted small">{t('pick_path')}</span>
              <input value={file} spellCheck={false} onChange={(e) => setFile(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') choose(); }} />
            </div>
          )}
        </div>
      </div>
    </DialogFrame>
  );
}
