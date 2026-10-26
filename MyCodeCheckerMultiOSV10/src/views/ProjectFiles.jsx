// Project files (*.mccp): 새 프로젝트, 프로젝트 열기, 다른 이름으로 저장.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call, isDesktop, pickFolder, pickFile, pickSavePath } from '../lib/backend';
import { Icon, Dialog } from '../components/Chrome';
import { Btn, BtnGroup, Toggle, Empty, errorText, linesToList } from './common';
import { ask } from '../lib/ui';
import { useEditorDirty } from '../lib/dirty';

export const PROJECT_FILTER = { get name() { return t('pj_filter_name'); }, extensions: ['mccp'] };

function keyFrom(name) {
  return String(name || 'project').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}
function joinPath(dir, name) {
  if (!dir) return '';
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`;
}
function baseName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

export function projectErrorText(err) {
  const code = err && err.code;
  if (['NOT_FOUND', 'EXISTS', 'BAD_PROJECT'].includes(code)) return `${t(`pj_err_${code}`)} (${err.message})`;
  return errorText(err);
}

export function FileIcon({ size = 18 }) {
  return <img src="./project-file.svg" alt="" width={size} height={size} className="mccp-icon" draggable={false} />;
}

export function NewProjectDialog({ onClose, onDone, onOpenExisting }) {
  useLanguage();
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [file, setFile] = useState('');
  const [fileTouched, setFileTouched] = useState(false);
  const [mainBranch, setMainBranch] = useState('main');
  const [description, setDescription] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [scan, setScan] = useState(true);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [overwriteAsk, setOverwriteAsk] = useState(false);
  useEditorDirty('new-project', !!(name.trim() || source.trim()), { label: t('pj_new_title') });
  // The project file goes into the source folder as <key>.mccp unless chosen.
  useEffect(() => {
    if (fileTouched) return;
    setFile(source ? joinPath(source, `${keyFrom(name || baseName(source))}.mccp`) : '');
  }, [name, source, fileTouched]);
  const browse = async () => {
    const dir = await pickFolder();
    if (dir) { setSource(dir); if (!name) setName(baseName(dir)); }
  };
  const browseFile = async () => {
    const p = await pickSavePath({ defaultPath: file, filters: [PROJECT_FILTER] });
    if (p) { setFile(p); setFileTouched(true); }
  };
  // Created without analyzing; App then runs scan.start with the progress popup.
  const create = async (overwrite = false, replace = false) => {
    setBusy(true);
    setError('');
    try {
      const res = await call('project.create', {
        name: name.trim() || baseName(source), source: source.trim(), file: file.trim() || undefined, scan: false, overwrite, replace: replace || undefined,
        settings: { mainBranch: mainBranch.trim() || 'main', description: description.trim() || undefined, exclusions: linesToList(exclusions) },
      });
      onDone(res, { analyze: scan });
    } catch (err) {
      if (err.code === 'CONFLICT' && !replace) {
        setBusy(false);
        const existing = err.projectName || (err.data && err.data.projectName) || baseName(source);
        const choice = await ask({ title: t('pj_new_title'), icon: 'folder', body: t('pj_conflict_body', { name: existing }), buttons: [
          { id: 'replace', label: t('pj_conflict_replace'), icon: 'refresh', danger: true },
          { id: 'open', label: t('pj_conflict_open'), icon: 'folder', primary: true },
          { id: 'cancel', label: t('cancel'), icon: 'close' },
        ] });
        if (choice === 'replace') { create(overwrite, true); return; }
        if (choice === 'open' && onOpenExisting) { onOpenExisting(err.projectId || (err.data && err.data.projectId)); return; }
        return;
      }
      if (err.code === 'EXISTS' && !overwrite) setOverwriteAsk(true);
      setError(projectErrorText(err));
    } finally { setBusy(false); }
  };
  return (
    <Dialog dataTour="dialog-new-project" title={t('pj_new_title')} icon="plus" onClose={busy ? () => {} : onClose} wide>
      <div className="pj-head"><FileIcon size={44} /><p className="small">{t('pj_new_hint')}</p></div>
      <div className="form-grid">
        <label className="span2">{t('name')}<input autoFocus value={name} placeholder={t('pj_name_ph')} onChange={(e) => setName(e.target.value)} /></label>
        <label className="span2">{t('pj_source')}
          <span className="input-row">
            <input value={source} placeholder={t('pj_source_ph')} onChange={(e) => setSource(e.target.value)} />
            {isDesktop && <Btn icon="folder" label={t('pj_browse')} onClick={browse} />}
          </span>
        </label>
        <label className="span4">{t('pj_file')}
          <span className="input-row">
            <input className="mono" value={file} placeholder={t('pj_file_ph')} onChange={(e) => { setFile(e.target.value); setFileTouched(true); }} />
            {isDesktop && <Btn icon="save" label={t('pj_browse')} onClick={browseFile} />}
          </span>
        </label>
      </div>
      <Toggle icon="settings" label={t('pj_more')} checked={more} onChange={setMore} />
      {more && (
        <div className="form-grid">
          <label>{t('pj_main_branch')}<input value={mainBranch} onChange={(e) => setMainBranch(e.target.value)} /></label>
          <label className="span2">{t('pj_description')}<input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label className="span4">{t('exclusions')}<textarea className="mono" value={exclusions} placeholder={'**/generated/**\n**/*.test.js'} onChange={(e) => setExclusions(e.target.value)} /></label>
        </div>
      )}
      <Toggle icon="play" label={t('pj_scan_after')} checked={scan} onChange={setScan} />
      {error && <p className="small bad"><Icon name="alert" size={12} /> {error}</p>}
      <div className="dialog-actions">
        <BtnGroup>
          {overwriteAsk && <Btn icon="alert" label={t('pj_overwrite')} danger disabled={busy} onClick={() => create(true)} />}
          <Btn icon={busy ? 'hourglass' : 'check'} label={busy ? t('pj_creating') : scan ? t('pj_create_analyze') : t('pj_create')} primary disabled={busy || !source.trim()} onClick={() => create(false)} />
          <Btn icon="close" label={t('cancel')} disabled={busy} onClick={onClose} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

// Web (and fallback): type a path or pick a recent project file.
export function OpenProjectDialog({ onClose, onOpen }) {
  useLanguage();
  const [path, setPath] = useState('');
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('project.recentFiles').then(setRecent).catch(() => setRecent([])); }, []);
  const open = async (file) => {
    setBusy(true);
    setError('');
    try { await onOpen(file); } catch (err) { setError(projectErrorText(err)); } finally { setBusy(false); }
  };
  return (
    <Dialog title={t('pj_open_title')} icon="folder" onClose={onClose} wide>
      <div className="pj-head"><FileIcon size={44} /><p className="small">{t('pj_open_hint')}</p></div>
      <label className="form-row">{t('pj_file')}
        <span className="input-row">
          <input className="mono" autoFocus value={path} placeholder={t('pj_file_ph')} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && path.trim()) open(path.trim()); }} />
          <Btn icon="folder" label={t('pj_open')} primary disabled={busy || !path.trim()} onClick={() => open(path.trim())} />
        </span>
      </label>
      <h3 className="sub-title"><Icon name="history" size={15} />{t('pj_recent_files')}</h3>
      {recent && recent.length === 0 && <Empty icon="inbox" text={t('pj_recent_empty')} />}
      <div className="start-list">
        {(recent || []).map((r) => (
          <button key={r.file} type="button" className={`recent-item compact ${r.exists ? '' : 'missing'}`} disabled={!r.exists || busy} title={r.exists ? r.file : t('pj_missing')} onClick={() => open(r.file)}>
            <FileIcon size={18} /><span className="recent-text"><strong>{baseName(r.file)}</strong><span className="muted ellipsis mono">{r.file}</span></span>
            {!r.exists && <span className="status-pill tone-bad"><Icon name="xCircle" size={11} />{t('pj_missing')}</span>}
          </button>
        ))}
      </div>
      {error && <p className="small bad"><Icon name="alert" size={12} /> {error}</p>}
      <div className="dialog-actions"><Btn icon="close" label={t('cancel')} onClick={onClose} /></div>
    </Dialog>
  );
}

/** Desktop: native file dialog; web: null (the caller shows OpenProjectDialog). */
export async function pickProjectFile() {
  if (!isDesktop) return null;
  return pickFile({ filters: [PROJECT_FILTER] });
}
