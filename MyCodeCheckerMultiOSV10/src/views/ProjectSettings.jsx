// Project settings: everything the next analysis of this project uses, in one
// page — name and key, the main branch, the quality gate, the profile per
// language and the defect policy, what is left out (patterns and folders),
// the C/C++ include folders and macros, coverage reports, the project's own
// new code definition, its languages (found in the code, plus the ones the
// user adds, minus the ones the user removes: their files are not analyzed) and its own
// choice of analysis engines (check groups) for them. Saving goes through the workspace (undo, history);
// "Save and analyze" runs the analysis with the new settings at once.
// The sections are shared with the New project dialog (ProjectFiles.jsx):
// draftOf / fieldsOfDraft, useProjectLanguages and the *Section components work
// on a draft and a target ({ projectId } of a project, { path } of a source folder).
import React, { useEffect, useMemo, useState } from 'react';
import { t, textOf, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { ExcludeDirsDialog } from '../components/ExcludeDirs';
import { ChecksBox } from '../components/ChecksBox';
import { Btn, BtnGroup, IconSelect, Stepper, Toggle, ViewHeader, NoProject, emitAction, useApi } from './common';

const lines = (text) => String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const definesText = (d) => Object.entries(d || {}).map(([k, v]) => (v === '' || v == null || v === true ? k : `${k}=${v}`)).join('\n');
function definesOf(text) {
  const out = {};
  for (const line of lines(String(text || '').replace(/,/g, '\n'))) {
    const i = line.indexOf('=');
    if (i < 0) out[line] = '1'; else out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** The form's draft of a project's settings ({} for a new project). */
export function draftOf(project) {
  const nc = project.newCode || null;
  return {
    name: project.name || '',
    key: project.key || '',
    description: project.description || '',
    tags: (project.tags || []).join(', '),
    mainBranch: project.mainBranch || 'main',
    gateId: project.gateId || '',
    policyId: project.policyId || '',
    profiles: { ...(project.profiles || {}) },
    exclusions: (project.exclusions || []).join('\n'),
    excludeDirs: [...(project.excludeDirs || [])],
    includeDirs: (project.includeDirs || []).join('\n'),
    defines: definesText(project.defines),
    coverageReports: (project.coverageReports || []).join('\n'),
    ownNewCode: !!nc,
    newCode: (nc && nc.newCode) || 'previous',
    newCodeDays: (nc && nc.newCodeDays) || 30,
    newCodeRef: (nc && nc.newCodeRef) || '',
    newCodeVersion: (nc && nc.newCodeVersion) || '',
    // The project's own engines (project.checks); a new choice starts with all on.
    ownChecks: !!(project.checks && typeof project.checks === 'object'),
    checks: { ...(project.checks || {}) },
    // Languages the user added to the ones found in the code.
    languages: [...(project.languages || [])],
    // Languages the user removed: their files are left out of the analysis.
    removedLanguages: [...(project.removedLanguages || [])],
  };
}

/** The project fields of a draft (what is saved in the workspace and the .mccp). */
export function fieldsOfDraft(d) {
  return {
    name: d.name.trim(),
    key: d.key.trim(),
    description: d.description.trim(),
    tags: d.tags.split(',').map((x) => x.trim()).filter(Boolean),
    mainBranch: d.mainBranch.trim() || 'main',
    gateId: d.gateId || undefined,
    policyId: d.policyId || undefined,
    profiles: Object.fromEntries(Object.entries(d.profiles).filter(([, v]) => v)),
    exclusions: lines(d.exclusions),
    excludeDirs: d.excludeDirs,
    includeDirs: lines(d.includeDirs),
    defines: definesOf(d.defines),
    coverageReports: lines(d.coverageReports),
    newCode: d.ownNewCode ? { newCode: d.newCode, newCodeDays: d.newCodeDays, newCodeRef: d.newCodeRef.trim(), newCodeVersion: d.newCodeVersion.trim() } : undefined,
    checks: d.ownChecks ? d.checks : undefined,
    languages: d.languages.length ? d.languages : undefined,
    removedLanguages: d.removedLanguages.length ? d.removedLanguages : undefined,
  };
}

// The survey of the analysis target: a project's (project.target) or a
// source folder's that is not a project yet (project.survey).
function surveyCall(target) {
  if (target && target.projectId) return ['project.target', { projectId: target.projectId }];
  if (target && target.path) return ['project.survey', { path: target.path }];
  return [null, {}];
}

/**
 * The project's languages: the ones found in the code (the last analysis's,
 * else a survey of the source folder), plus the added ones, minus the removed ones.
 * profileLangs also has the languages that already have a profile choice.
 */
export function useProjectLanguages(d, target, analysis) {
  const fromAnalysis = Object.keys((analysis && analysis.languages) || {});
  const [method, args] = surveyCall(target);
  const survey = useApi(method || 'project.target', { ...args, quiet: true }, [method, JSON.stringify(args)], !!method && fromAnalysis.length === 0);
  const detected = useMemo(() => (fromAnalysis.length ? fromAnalysis : Object.keys((survey.data && survey.data.languages) || {})).sort(), [fromAnalysis.join(','), survey.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const allLangs = useApi('languages.list', {}, []);
  const removed = (d && d.removedLanguages) || [];
  const projectLangs = useMemo(() => [...new Set([...detected, ...((d && d.languages) || [])])].filter((x) => !removed.includes(x)), [detected, d && d.languages, removed.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const profileLangs = useMemo(() => [...new Set([...projectLangs, ...Object.keys((d && d.profiles) || {})])].filter((x) => !removed.includes(x)).sort(), [projectLangs, d && d.profiles, removed.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return { detected, loading: !fromAnalysis.length && survey.loading, all: allLangs.data || [], projectLangs, profileLangs };
}

// The folders the next analysis leaves out, with why: always skipped (build
// output, dependencies, version control …), a workspace or project pattern, or
// the project's list of excluded folders (which can be removed here). Follows
// the patterns and folders being edited.
const SKIP_REASON = { skip: ['ps_skip_builtin', 'lock'], workspace: ['ps_skip_workspace', 'filter'], project: ['ps_skip_project', 'filter'], excludeDir: ['ps_skip_dir', 'folder'] };
function SkippedFolders({ target, exclusions, excludeDirs, onRemoveDir }) {
  useLanguage();
  const [args, setArgs] = useState({ exclusions, excludeDirs });
  const key = JSON.stringify({ exclusions, excludeDirs });
  useEffect(() => { const id = setTimeout(() => setArgs({ exclusions, excludeDirs }), 500); return () => clearTimeout(id); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [method, base] = surveyCall(target);
  const res = useApi(method || 'project.target', { ...base, ...args }, [method, JSON.stringify(base), JSON.stringify(args)], !!method);
  const list = (res.data && res.data.skipped) || [];
  const reasonOf = (s) => (s.reason === 'exclusion' ? (s.from === 'workspace' ? 'workspace' : 'project') : s.reason);
  if (!method) return null;
  return (
    <div className="ps-skipped" data-testid="ps-skipped">
      <div className="ps-sub">{t('ps_skipped', { n: list.length >= 50 ? '50+' : list.length })}{res.loading ? <span className="small muted"> · {t('ps_skipped_checking')}</span> : null}</div>
      {res.error && <p className="small bad">{res.error}</p>}
      {!res.loading && !res.error && list.length === 0 && <p className="small muted">{t('ps_skipped_none')}</p>}
      {list.length > 0 && (
        <div className="ps-skipped-list">
          {list.map((s) => {
            const r = reasonOf(s);
            const [label, icon] = SKIP_REASON[r] || SKIP_REASON.skip;
            return (
              <div key={s.dir} className="ps-skipped-row">
                <Icon name="folder" size={13} /><span className="mono ps-skipped-dir" title={s.dir}>{s.dir}</span>
                <span className={`chip ps-reason ps-reason-${r}`} title={t(`${label}_tip`)}><Icon name={icon} size={11} />{t(label)}</span>
                {r === 'excludeDir' && <button type="button" className="chip-x" aria-label={t('remove')} title={t('ps_skip_dir_remove')} onClick={() => onRemoveDir(s.dir)}><Icon name="close" size={10} /></button>}
              </div>
            );
          })}
        </div>
      )}
      {list.length >= 50 && <p className="small muted">{t('ps_skipped_more')}</p>}
    </div>
  );
}

// A panel of the grid: all one width, as high as the highest panel of its row.
export function Section({ icon, title, hint, children }) {
  return (
    <section className="panel ps-section">
      <h3 className="sub-title"><Icon name={icon} size={15} />{title}</h3>
      <div className="ps-body">
        {hint && <p className="small muted">{hint}</p>}
        {children}
      </div>
    </section>
  );
}

// The project's languages: the ones found in the code (automatic) and the
// ones the user added, plus a picker to add another. Any of them can be
// removed: a removed language stays as a crossed-out chip (its files are not
// analyzed) that can be put back.
function ProjectLanguages({ detected, added, removed, all, loading, onChange }) {
  const lang = getLanguage();
  const name = (id) => { const l = all.find((x) => x.id === id); return l ? (l.label[lang] || l.label.en) : id; };
  const auto = detected.filter((id) => !removed.includes(id));
  const extra = added.filter((id) => !detected.includes(id) && !removed.includes(id));
  const options = [{ value: '', label: t('ps_langs_add'), icon: 'plus' },
    ...all.filter((l) => !auto.includes(l.id) && !extra.includes(l.id)).map((l) => ({ value: l.id, label: `${l.label[lang] || l.label.en} (${(l.exts || []).join(' ') || l.id})`, icon: 'code' }))];
  const add = (id) => onChange({ languages: detected.includes(id) || added.includes(id) ? added : [...added, id], removedLanguages: removed.filter((x) => x !== id) });
  const remove = (id) => onChange({ languages: added.filter((x) => x !== id), removedLanguages: detected.includes(id) && !removed.includes(id) ? [...removed, id] : removed });
  return (
    <div className="ps-langs">
      <div className="ps-lang-chips">
        {loading && <span className="small muted">{t('ps_langs_finding')}</span>}
        {!loading && auto.length === 0 && extra.length === 0 && removed.length === 0 && <span className="small muted">{t('ps_langs_none')}</span>}
        {auto.map((id) => (
          <span key={id} className="chip ps-lang auto" title={t('ps_langs_detected')}>
            <Icon name="search" size={11} /> {name(id)}
            <button type="button" className="chip-x" aria-label={t('ps_langs_remove')} title={t('ps_langs_remove')} onClick={() => remove(id)}><Icon name="close" size={10} /></button>
          </span>
        ))}
        {extra.map((id) => (
          <span key={id} className="chip ps-lang added" title={t('ps_langs_added')}>
            <Icon name="plus" size={11} /> {name(id)}
            <button type="button" className="chip-x" aria-label={t('remove')} title={t('remove')} onClick={() => remove(id)}><Icon name="close" size={10} /></button>
          </span>
        ))}
        {removed.map((id) => (
          <span key={id} className="chip ps-lang removed" title={t('ps_langs_removed')}>
            <Icon name="ban" size={11} /> <s>{name(id)}</s>
            <button type="button" className="chip-x" aria-label={t('ps_langs_restore')} title={t('ps_langs_restore')} onClick={() => add(id)}><Icon name="undo" size={10} /></button>
          </span>
        ))}
      </div>
      {removed.length > 0 && <p className="small muted">{t('ps_langs_removed_note')}</p>}
      <IconSelect value="" width={260} ariaLabel={t('ps_langs_add')} options={options} columns={3} fit onChange={(v) => { if (v) add(v); }} />
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="ps-field">
      <span className="ps-label" title={hint || undefined}>{label}</span>
      <span className="ps-control">{children}</span>
    </label>
  );
}

// ── The sections, shared by Project settings and New project ──
// Each takes the draft d, set(patch) and what it needs besides.

// New code: what it is and where it counts, then the project's own definition
// (or which workspace definition it follows), with what each way means.
const NC_MODES = [['previous', 'history', 'previous_analysis'], ['days', 'calendar', 'number_of_days'], ['scm', 'branch', 'ad_nc_scm'], ['version', 'package', 'ad_nc_version']];
export function NewCodeSection({ ws, d, set }) {
  const modeOptions = NC_MODES.map(([value, icon, label]) => ({ value, label: t(label), icon }));
  const wsSettings = (ws && ws.settings) || {};
  const following = NC_MODES.find((m) => m[0] === (wsSettings.newCode || 'previous'));
  const mode = d.ownNewCode ? d.newCode : (wsSettings.newCode || 'previous');
  return (
    <Section icon="clock" title={t('new_code_mode')}>
      <div className="nc-explain">
        <p className="small"><strong>{t('nc_what_title')}</strong> {t('nc_what')}</p>
        <p className="small">{t('nc_where')}</p>
      </div>
      <p className="small muted">{t('ps_newcode_hint')}</p>
      {!d.ownNewCode && following && <p className="small"><Icon name="link" size={12} /> {t('nc_following', { mode: t(following[2]) })}{following[0] === 'days' ? ` (${wsSettings.newCodeDays || 30} ${t('days')})` : ''}</p>}
      <Field label={t('ad_nc_scope')}><Toggle checked={d.ownNewCode} label={t('ad_nc_project_only')} icon="folder" onChange={(v) => set({ ownNewCode: v })} /></Field>
      {d.ownNewCode && (
        <>
          <Field label={t('new_code_mode')}><IconSelect value={d.newCode} width={220} ariaLabel={t('new_code_mode')} options={modeOptions} onChange={(v) => set({ newCode: v })} /></Field>
          {d.newCode === 'days' && <Field label={t('number_of_days')}><Stepper value={d.newCodeDays} min={1} max={3650} ariaLabel={t('number_of_days')} onChange={(v) => set({ newCodeDays: v })} /></Field>}
          {d.newCode === 'scm' && <Field label={t('ad_nc_ref')}><input value={d.newCodeRef} placeholder="main / v1.2.0 / a1b2c3d" onChange={(e) => set({ newCodeRef: e.target.value })} /></Field>}
          {d.newCode === 'version' && <Field label={t('ad_nc_version_tag')}><input value={d.newCodeVersion} placeholder="v1.2.0" onChange={(e) => set({ newCodeVersion: e.target.value })} /></Field>}
        </>
      )}
      <div className="ps-sub">{t('nc_modes_title')}</div>
      <ul className="nc-modes">
        {NC_MODES.map(([value, icon, label]) => (
          <li key={value} className={value === mode ? 'on' : ''}>
            <Icon name={icon} size={13} /><span><strong>{t(label)}</strong> — {t(`nc_mode_${value}`)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function CFamilySection({ d, set }) {
  return (
    <Section icon="cpu" title={t('ad_cfamily')} hint={t('ps_cfamily_hint')}>
      <Field label={t('ad_include_dirs')}><textarea className="mono" rows={3} value={d.includeDirs} placeholder={'include\nthird_party/lib/include'} onChange={(e) => set({ includeDirs: e.target.value })} /></Field>
      <Field label={t('ad_defines')}><textarea className="mono" rows={3} value={d.defines} placeholder={'NDEBUG\nBOARD_REV=3'} onChange={(e) => set({ defines: e.target.value })} /></Field>
    </Section>
  );
}

// Settings per language. Only C/C++ needs any: the preprocessor (#include,
// #define) changes the code before it is analyzed. The other languages are
// analyzed from their source alone (a Go version, for one, comes from go.mod).
const C_LANGS = ['c', 'cpp', 'objc'];
export function LanguageOptionsSection({ d, set, langs }) {
  const hasC = langs.projectLangs.some((l) => C_LANGS.includes(l)) || (langs.detected.length === 0 && !langs.loading);
  return (
    <>
      <p className="small muted np-note"><Icon name="info" size={12} /> {t('ps_langopts_hint')}</p>
      {hasC ? <CFamilySection d={d} set={set} />
        : <p className="small muted np-note"><Icon name="check" size={12} /> {t('ps_langopts_none')}</p>}
    </>
  );
}

export function CoverageSection({ d, set }) {
  return (
    <Section icon="checkCircle" title={t('ad_coverage')} hint={t('ad_coverage_hint')}>
      <Field label={t('ad_coverage_paths')}><textarea className="mono" rows={3} value={d.coverageReports} placeholder={'coverage/lcov.info\ntarget/site/jacoco/jacoco.xml'} onChange={(e) => set({ coverageReports: e.target.value })} /></Field>
    </Section>
  );
}

export function LanguagesSection({ d, set, langs }) {
  return (
    <Section icon="code" title={t('ps_langs')} hint={t('ps_langs_hint')}>
      <ProjectLanguages detected={langs.detected} added={d.languages} removed={d.removedLanguages} loading={langs.loading} all={langs.all}
        onChange={(next) => set(next)} />
    </Section>
  );
}

export function EnginesSection({ ws, d, set, langs }) {
  const [autoChecks, setAutoChecks] = useState(false);
  return (
    <Section icon="cpu" title={t('ps_engines')} hint={t('ps_engines_hint')}>
      <Field label={t('ad_nc_scope')}><Toggle checked={d.ownChecks} label={t('ps_engines_own')} icon="folder"
        onChange={(v) => { set({ ownChecks: v }); if (v && !Object.keys(d.checks).length) setAutoChecks(true); }} /></Field>
      {!d.ownChecks && <p className="small muted">{t('ps_engines_following')}</p>}
      {d.ownChecks && <p className="small muted">{t('ps_engines_auto', { langs: langs.projectLangs.join(', ') || '—' })}</p>}
      <ChecksBox checks={d.ownChecks ? d.checks : (((ws && ws.settings) || {}).checks || {})} readOnly={!d.ownChecks} languages={langs.projectLangs}
        autoInit={autoChecks} onAutoDone={() => setAutoChecks(false)} onChange={(checks) => set({ checks })} />
    </Section>
  );
}

export function RulesSection({ ws, d, set, langs }) {
  const w = ws || {};
  const gateOptions = [{ value: '', label: t('ps_default'), icon: 'gate' }, ...(w.gates || []).map((g) => ({ value: g.id, label: `${textOf(g.name)}${g.isDefault ? ` (${t('ps_default_mark')})` : ''}`, icon: 'gate' }))];
  const policies = ((w.defectAnalysis || {}).policies) || [];
  const policyOptions = [{ value: '', label: t('ps_default'), icon: 'shield' }, ...policies.map((p) => ({ value: p.id, label: `${textOf(p.name)}${p.isDefault ? ` (${t('ps_default_mark')})` : ''}`, icon: 'shield' }))];
  const profileOptions = (lang) => [
    { value: '', label: t('ps_default'), icon: 'list' },
    { value: 'none', label: t('ps_profile_none'), icon: 'close' },
    ...(w.profiles || []).filter((p) => p.language === lang || p.language === '*').map((p) => ({ value: p.id, label: `${textOf(p.name)}${p.language === '*' ? ` · ${t('ps_all_languages')}` : ''}`, icon: 'list' })),
  ];
  return (
    <Section icon="gate" title={t('ps_rules')} hint={t('ps_rules_hint')}>
      <Field label={t('ps_gate')}><IconSelect value={d.gateId} width={260} ariaLabel={t('ps_gate')} options={gateOptions} onChange={(v) => set({ gateId: v })} /></Field>
      <Field label={t('ps_policy')}><IconSelect value={d.policyId} width={260} ariaLabel={t('ps_policy')} options={policyOptions} onChange={(v) => set({ policyId: v })} /></Field>
      <div className="ps-sub">{t('ps_profiles')}</div>
      {langs.profileLangs.length === 0 && <p className="small muted">{t('ps_profiles_none')}</p>}
      {langs.profileLangs.map((lang) => (
        <Field key={lang} label={lang}>
          <IconSelect value={d.profiles[lang] || ''} width={260} ariaLabel={`${t('ps_profiles')} ${lang}`} options={profileOptions(lang)}
            onChange={(v) => set({ profiles: { ...d.profiles, [lang]: v } })} />
        </Field>
      ))}
    </Section>
  );
}

// root: the source folder (the excluded folders are relative to it).
export function ScopeSection({ ws, d, set, target, root }) {
  const [pickDirs, setPickDirs] = useState(false);
  const globals = ((ws && ws.settings) || {}).exclusions || [];
  return (
    <Section icon="filter" title={t('ps_scope')} hint={t('ps_scope_hint')}>
      <Field label={t('ps_exclusions')} hint={t('ps_exclusions_hint')}>
        <textarea className="mono" rows={4} value={d.exclusions} placeholder={'**/generated/**\n**/*.pb.c'} onChange={(e) => set({ exclusions: e.target.value })} />
      </Field>
      {globals.length > 0 && <p className="small muted">{t('ps_exclusions_global', { list: globals.join(', ') })}</p>}
      <div className="ps-sub">{t('ad_exclude_dirs')}</div>
      <div className="chips">
        {d.excludeDirs.length ? d.excludeDirs.map((dir) => (
          <span key={dir} className="chip"><Icon name="folder" size={11} />{dir}
            <button type="button" className="chip-x" aria-label={t('remove')} title={t('remove')} onClick={() => set({ excludeDirs: d.excludeDirs.filter((x) => x !== dir) })}><Icon name="close" size={10} /></button>
          </span>
        )) : <span className="small muted">{root ? t('xd_none') : t('xd_need_source')}</span>}
      </div>
      <div><Btn icon="folder" label={t('xd_pick')} disabled={!root} title={root ? undefined : t('xd_need_source')} onClick={() => setPickDirs(true)} /></div>
      <SkippedFolders target={target} exclusions={lines(d.exclusions)} excludeDirs={d.excludeDirs}
        onRemoveDir={(dir) => set({ excludeDirs: d.excludeDirs.filter((x) => x !== dir && !dir.startsWith(`${x}/`)) })} />
      {pickDirs && <ExcludeDirsDialog root={root} value={d.excludeDirs} onClose={() => setPickDirs(false)} onSave={(dirs) => { set({ excludeDirs: dirs }); setPickDirs(false); }} />}
    </Section>
  );
}

export function ProjectSettings({ ws, project, analysis, busy, onSave }) {
  useLanguage();
  const [d, setD] = useState(() => (project ? draftOf(project) : null));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // The draft follows the saved settings: another project, a save or an undo. The
  // workspace being reloaded (issues loading, a job ending) keeps the edits.
  const savedKey = project ? `${project.id}|${JSON.stringify(draftOf(project))}` : '';
  useEffect(() => { if (project) setD(draftOf(project)); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNote(''); }, [project && project.id]);
  const target = useMemo(() => (project && project.path ? { projectId: project.id } : null), [project && project.id, project && project.path]); // eslint-disable-line react-hooks/exhaustive-deps
  const langs = useProjectLanguages(d, target, analysis);
  if (!project || !d) return <div className="view"><ViewHeader icon="settings" title={t('ps_title')} hint={t('ps_hint')} /><NoProject text={t('ps_no_project')} /></div>;

  const set = (patch) => setD((cur) => ({ ...cur, ...patch }));
  const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(project));
  const keyOk = /^[A-Za-z0-9_.:-]{1,190}$/.test(d.key.trim());
  const keyTaken = (ws.projects || []).some((p) => p.id !== project.id && p.key === d.key.trim());
  const branches = [...new Set([...Object.keys(project.branches || {}), d.mainBranch])].filter(Boolean);
  const part = { ws, d, set, langs, target };

  const save = async (andAnalyze) => {
    if (!keyOk || keyTaken || !d.name.trim()) { setNote(!d.name.trim() ? t('ps_name_needed') : keyTaken ? t('ps_key_taken') : t('ps_key_bad')); return; }
    setSaving(true);
    setNote('');
    const next = { ...project, ...fieldsOfDraft(d) };
    try {
      await onSave({ ...ws, projects: (ws.projects || []).map((p) => (p.id === project.id ? next : p)) });
      setNote(t('ps_saved'));
      if (andAnalyze) emitAction('analyze');
    } catch (err) {
      setNote(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view view-list project-settings">
      <ViewHeader icon="settings" title={t('ps_title')} hint={t('ps_hint')} />
      <div className="ps-scroll list-grow">
        <div className="ps-grid">
          {/* Panels one width, rows of one height: the ones whose content is set first, then the ones whose content grows (one row per language, the left-out folders). */}
          <Section icon="folder" title={t('ps_basic')}>
            <Field label={t('ps_name')}><input value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label={t('ps_key')} hint={t('ps_key_hint')}><input className="mono" value={d.key} onChange={(e) => set({ key: e.target.value })} /></Field>
            {(!keyOk || keyTaken) && <p className="small bad"><Icon name="alert" size={12} /> {keyTaken ? t('ps_key_taken') : t('ps_key_bad')}</p>}
            <Field label={t('ps_description')}><textarea rows={2} value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <Field label={t('ps_tags')} hint={t('ps_tags_hint')}><input value={d.tags} placeholder="backend, team-a" onChange={(e) => set({ tags: e.target.value })} /></Field>
            <Field label={t('ps_path')} hint={t('ps_path_hint')}><input className="mono" value={project.path || ''} readOnly title={t('ps_path_hint')} /></Field>
            <Field label={t('ps_main_branch')} hint={t('ps_main_branch_hint')}>
              <IconSelect value={d.mainBranch} width={220} ariaLabel={t('ps_main_branch')} onChange={(v) => set({ mainBranch: v })}
                options={branches.map((b) => ({ value: b, label: b, icon: 'branch' }))} />
            </Field>
          </Section>
          <NewCodeSection {...part} />
          <CFamilySection {...part} />
          <CoverageSection {...part} />
          <LanguagesSection {...part} />
          <EnginesSection {...part} />
          <RulesSection {...part} />
          <ScopeSection {...part} root={project.path} />
        </div>
      </div>
      <div className="ps-actions">
        {dirty ? <span className="small warn-text"><Icon name="edit" size={12} /> {t('ps_unsaved')}</span> : note ? <span className="small">{note}</span> : <span className="small muted">{t('ps_next_analysis')}</span>}
        <span className="spacer" />
        <BtnGroup>
          <Btn icon="refresh" label={t('ps_revert')} disabled={!dirty || saving} onClick={() => { setD(draftOf(project)); setNote(''); }} />
          <Btn icon="save" label={t('save')} disabled={!dirty || saving} onClick={() => save(false)} />
          <Btn icon="play" label={t('ps_save_analyze')} primary disabled={saving || busy} onClick={() => save(true)} />
        </BtnGroup>
      </div>
    </div>
  );
}
