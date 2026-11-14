// Project files (*.mccp): 새 프로젝트, 프로젝트 열기, 다른 이름으로 저장.
import React, { useEffect, useMemo, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call, isDesktop, pickFolder, pickFile, pickSavePath } from '../lib/backend';
import { Icon, Dialog } from '../components/Chrome';
import { Btn, BtnGroup, Empty, errorText, useApi } from './common';
import { ask } from '../lib/ui';
import { useEditorDirty } from '../lib/dirty';
import { draftOf, fieldsOfDraft, gitError, useProjectLanguages, Section, Field, LanguagesSection, EnginesSection, RulesSection, ScopeSection, LanguageOptionsSection, CoverageSection, NewCodeSection, GitSection } from './ProjectSettings';

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

// New project: the source folder and the project file, plus every project
// setting of Project settings (ProjectSettings.jsx sections) in tabs, so the
// first analysis already uses the languages, engines and rules chosen here.
const NEW_TABS = [
  ['basic', 'folder', 'ps_basic'],
  ['langs', 'code', 'np_tab_langs'],
  ['rules', 'gate', 'ps_rules'],
  ['scope', 'filter', 'ps_scope'],
  ['langopts', 'cpu', 'np_tab_build'],
  ['newcode', 'clock', 'new_code_mode'],
  ['git', 'branch', 'ps_git'],
];
const KEY_OK = /^[A-Za-z0-9_.:-]{1,190}$/;

export function NewProjectDialog({ onClose, onDone, onOpenExisting }) {
  useLanguage();
  const [d, setD] = useState(() => draftOf({}));
  const set = (patch) => setD((cur) => ({ ...cur, ...patch }));
  const [tab, setTab] = useState('basic');
  const [source, setSource] = useState('');
  const [file, setFile] = useState('');
  const [fileTouched, setFileTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [overwriteAsk, setOverwriteAsk] = useState(false);
  const wsRes = useApi('workspace.load', { slim: true }, []);
  const ws = wsRes.data || null;
  useEditorDirty('new-project', !!(d.name.trim() || source.trim()), { label: t('pj_new_title') });
  // The project file goes into the source folder as <key>.mccp unless chosen.
  const autoKey = keyFrom(d.name || baseName(source));
  useEffect(() => {
    if (fileTouched) return;
    setFile(source ? joinPath(source, `${keyFrom(d.key.trim() || autoKey)}.mccp`) : '');
  }, [d.name, d.key, source, fileTouched]); // eslint-disable-line react-hooks/exhaustive-deps
  // Excluded folders and removed languages belong to a source folder; a new one starts empty.
  useEffect(() => { set({ excludeDirs: [], removedLanguages: [] }); }, [source]);
  // The languages of the source folder, surveyed once typing stops.
  const [surveyPath, setSurveyPath] = useState('');
  useEffect(() => { const id = setTimeout(() => setSurveyPath(source.trim()), 500); return () => clearTimeout(id); }, [source]);
  const target = useMemo(() => (surveyPath ? { path: surveyPath } : null), [surveyPath]);
  const langs = useProjectLanguages(d, target, null);
  const browse = async () => {
    const dir = await pickFolder();
    if (dir) { setSource(dir); if (!d.name) set({ name: baseName(dir) }); }
  };
  const browseFile = async () => {
    const p = await pickSavePath({ defaultPath: file, filters: [PROJECT_FILTER] });
    if (p) { setFile(p); setFileTouched(true); }
  };
  const key = d.key.trim();
  const keyBad = !!key && !KEY_OK.test(key);
  const keyTaken = !!key && !!ws && (ws.projects || []).some((p) => p.key === key);
  // Created without analyzing; App then runs scan.start with the progress popup.
  const create = async (scan, overwrite = false, replace = false) => {
    if (keyBad || keyTaken) { setTab('basic'); setError(keyTaken ? t('ps_key_taken') : t('ps_key_bad')); return; }
    const gitBad = gitError(d.git);
    if (gitBad) { setTab('git'); setError(t(gitBad)); return; }
    setBusy(true);
    setError('');
    try {
      const { name, key: k, ...settings } = fieldsOfDraft(d);
      const res = await call('project.create', {
        name: name || baseName(source), key: k || undefined, source: source.trim(), file: file.trim() || undefined, scan: false, overwrite, replace: replace || undefined,
        settings: { ...settings, description: settings.description || undefined, tags: settings.tags.length ? settings.tags : undefined },
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
        if (choice === 'replace') { create(scan, overwrite, true); return; }
        if (choice === 'open' && onOpenExisting) { onOpenExisting(err.projectId || (err.data && err.data.projectId)); return; }
        return;
      }
      if (err.code === 'EXISTS' && !overwrite) setOverwriteAsk(scan ? 'scan' : 'create');
      setError(projectErrorText(err));
    } finally { setBusy(false); }
  };
  const part = { ws, d, set, langs, target };
  return (
    <Dialog dataTour="dialog-new-project" title={t('pj_new_title')} icon="plus" onClose={busy ? () => {} : onClose} className="np-dialog">
      <div className="st-wrap">
        <nav className="st-tabs" role="tablist" aria-orientation="vertical">
          {NEW_TABS.map(([id, icon, label]) => (
            <button key={id} type="button" role="tab" data-tab-id={id} aria-selected={tab === id} className={`st-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              <Icon name={icon} size={15} /><span>{t(label)}</span>
              {id === 'basic' && (!source.trim() || keyBad || keyTaken) && <span className="st-dot" title={t('np_needs_source')} />}
            </button>
          ))}
        </nav>
        <div className="st-pane np-pane" role="tabpanel" data-tab={tab}>
          {tab === 'basic' && (
            <>
              <div className="pj-head"><FileIcon size={40} /><p className="small">{t('pj_new_hint')}</p></div>
              <Section icon="folder" title={t('ps_basic')}>
                <Field label={t('ps_name')}><input autoFocus value={d.name} placeholder={t('pj_name_ph')} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label={t('ps_key')} hint={t('ps_key_hint')}><input className="mono" value={d.key} placeholder={autoKey} onChange={(e) => set({ key: e.target.value })} /></Field>
                {(keyBad || keyTaken) && <p className="small bad"><Icon name="alert" size={12} /> {keyTaken ? t('ps_key_taken') : t('ps_key_bad')}</p>}
                <Field label={t('ps_description')}><textarea rows={2} value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field>
                <Field label={t('ps_tags')} hint={t('ps_tags_hint')}><input value={d.tags} placeholder="backend, team-a" onChange={(e) => set({ tags: e.target.value })} /></Field>
                <Field label={t('ps_main_branch')} hint={t('ps_main_branch_hint')}><input value={d.mainBranch} onChange={(e) => set({ mainBranch: e.target.value })} /></Field>
              </Section>
              <Section icon="save" title={t('np_location')}>
                <div data-tour="new-project-source">
                  <Field label={t('pj_source')}>
                    <span className="input-row">
                      <input value={source} placeholder={t('pj_source_ph')} onChange={(e) => setSource(e.target.value)} />
                      {isDesktop && <Btn icon="folder" label={t('pj_browse')} onClick={browse} />}
                    </span>
                  </Field>
                </div>
                <Field label={t('pj_file')}>
                  <span className="input-row">
                    <input className="mono" value={file} placeholder={t('pj_file_ph')} onChange={(e) => { setFile(e.target.value); setFileTouched(true); }} />
                    {isDesktop && <Btn icon="save" label={t('pj_browse')} onClick={browseFile} />}
                  </span>
                </Field>
              </Section>
            </>
          )}
          {tab === 'langs' && <><LanguagesSection {...part} /><EnginesSection {...part} /></>}
          {tab === 'rules' && <RulesSection {...part} />}
          {tab === 'scope' && <div data-tour="new-project-exclude"><ScopeSection {...part} root={source.trim()} /></div>}
          {tab === 'langopts' && <><LanguageOptionsSection {...part} /><CoverageSection {...part} /></>}
          {tab === 'newcode' && <NewCodeSection {...part} />}
          {tab === 'git' && <GitSection {...part} />}
        </div>
      </div>
      <div className="st-foot">
        {error ? <span className="small bad st-error" title={error}><Icon name="alert" size={12} /> {error}</span>
          : !source.trim() ? <span className="small muted st-foot-hint">{t('np_needs_source')}</span> : null}
        <span className="spacer" />
        <BtnGroup>
          {overwriteAsk && <Btn icon="alert" label={t('pj_overwrite')} danger disabled={busy} onClick={() => create(overwriteAsk === 'scan', true)} />}
          <Btn icon={busy ? 'hourglass' : 'check'} label={busy ? t('pj_creating') : t('pj_create')} title={t('pj_create_tip')} disabled={busy || !source.trim()} onClick={() => create(false)} />
          <Btn icon="play" label={t('pj_create_analyze')} title={t('pj_create_analyze_tip')} primary disabled={busy || !source.trim()} onClick={() => create(true)} />
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
