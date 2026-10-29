// The settings window: fixed size (no scrollbars anywhere), a vertical tab
// list, a draft kept until 확인 (OK), live previews of theme / language /
// start background that 취소 (Cancel) undoes, and 초기화 (Reset) for the
// current tab after a confirm. Esc = 취소, Enter = 확인 (outside textareas).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage, setLanguage, getLanguage } from '../../lib/i18n';
import { applyTheme, setCustomThemes, getCustomThemes, themeById, baseColorsOf } from '../../themes';
import { call } from '../../lib/backend';
import { Icon, Dialog } from '../../components/Chrome';
import { Btn, BtnGroup, Confirm, errorText, emitAction } from '../common';
import { ask } from '../../lib/ui';
import { useEditorDirty } from '../../lib/dirty';
import { DEFAULT_START_BACKGROUND } from '../../lib/startBackground';
import { DEFAULT_PANELS, panelsOf } from '../../components/Layout';
import { refreshAiSettings } from '../AiFix';
import { TutorialSettings } from '../../components/TutorialSettings';
import { tutorialOf, TUTORIAL_DEFAULTS } from '../../lib/tutorialSettings';
import { GeneralTab, ThemeTab, CustomThemeTab, StartTab, AnalysisTab, GateTab, ReportsTab, NewCodeTab, AiTab, DbTab, IntegrationsTab, AdvancedTab, MASK } from './tabs';
import { defaultGateOf, DEFAULT_GATE_CONDITIONS } from '../../lib/gateDefaults';

const DEFAULT_EXCLUSIONS = ['**/*.min.js', '**/vendor/**', '**/node_modules/**', '**/dist/**', '**/build/**'];
const AI_DEFAULTS = { enabled: false, provider: 'anthropic', model: '', baseUrl: '', apiKey: '', effort: 'medium', maxTokens: 16000, contextLines: 40, timeoutMs: 120000, language: 'ko' };
const DB_DEFAULTS = { enabled: false, kind: 'sqlite', file: '', host: 'localhost', port: 5432, database: 'mycodechecker', user: '', password: '', ssl: false, schema: 'mcc', autoExport: false, includeIssues: true, perProject: true };
const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

export const SETTINGS_TABS = [
  ['general', 'settings', 'st_tab_general'],
  ['theme', 'palette', 'st_tab_theme'],
  ['custom', 'edit', 'st_tab_custom'],
  ['start', 'home', 'st_tab_start'],
  ['tutorial', 'graduation', 'st_tab_tutorial'],
  ['analysis', 'search', 'st_tab_analysis'],
  ['gate', 'gate', 'st_tab_gate'],
  ['reports', 'report', 'st_tab_reports'],
  ['newcode', 'sparkle', 'st_tab_newcode'],
  ['ai', 'ai', 'st_tab_ai'],
  ['db', 'database', 'st_tab_db'],
  ['integrations', 'link', 'st_tab_integrations'],
  ['advanced', 'wrench', 'st_tab_advanced'],
];

// Settings › Reports: Markdown pictures inside, and reports written after each analysis.
function reportsOf(r) {
  const v = r || {};
  const a = v.auto || {};
  return { mdEmbedImages: v.mdEmbedImages !== false, auto: { enabled: !!a.enabled, kinds: a.kinds && a.kinds.length ? [...a.kinds] : ['executive'], formats: a.formats && a.formats.length ? [...a.formats] : ['pdf'], folder: a.folder || '' } };
}

// gates: the workspace's gates; the tab edits the default one.
// Default analysis memory limit (GB); the dialog asks the service (system.memory).
let memoryDefault = 8;
const memoryDefaultGb = () => memoryDefault;

function draftOf(s, gates) {
  const gate = defaultGateOf(gates);
  return {
    checks: { ...(s.checks || {}) },
    reports: reportsOf(s.reports),
    gate: { ...gate, conditions: (gate.conditions || []).map((c) => ({ ...c })) },
    language: s.language || 'ko',
    theme: s.theme || 'midnight',
    showStartOnLaunch: s.showStartOnLaunch !== false,
    assignee: s.assignee || '',
    webhookUrl: s.webhookUrl || '',
    exclusionsText: (s.exclusions || DEFAULT_EXCLUSIONS).join('\n'),
    limits: { cognitive: 15, parameters: 7, ...(s.limits || {}) },
    newCode: s.newCode || 'previous',
    newCodeDays: s.newCodeDays ?? 30,
    newCodeRef: s.newCodeRef || '',
    newCodeVersion: s.newCodeVersion || '',
    maxFiles: s.maxFiles || 0,
    memoryLimitGb: s.memoryLimitGb || memoryDefaultGb(),
    analysisMode: s.analysisMode === 'parallel' ? 'parallel' : 'sequential',
    startBackground: { ...DEFAULT_START_BACKGROUND, ...(s.startBackground || {}) },
    panels: panelsOf(s),
    customThemes: (s.customThemes || []).map((c) => ({ ...c, colors: { ...c.colors } })),
    tutorial: { ...tutorialOf(s) },
  };
}

export function SettingsDialog({ ws, onClose, onSave, initialTab, windowed, onPreview, onAction }) {
  useLanguage();
  const s = ws.settings || {};
  const original = useRef({ theme: s.theme || 'midnight', language: getLanguage(), custom: getCustomThemes().map((c) => ({ id: c.id })), customRaw: s.customThemes || [] });
  const [tab, setTab] = useState(initialTab || 'general');
  const [d, setD] = useState(() => draftOf(s, ws.gates));
  const firstDraft = useRef(null);
  if (firstDraft.current === null) firstDraft.current = JSON.stringify(draftOf(s, ws.gates));
  const [ai, setAi] = useState(null);
  const [aiErr, setAiErr] = useState('');
  const [aiDirty, setAiDirty] = useState(false);
  const [aiUi, setAiUiState] = useState({ customModel: false, customUrl: false });
  const [db, setDb] = useState(null);
  const [dbErr, setDbErr] = useState('');
  const [dbDirty, setDbDirty] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    call('system.memory').then((m) => { if (m && m.defaultGb > 0) memoryDefault = m.defaultGb; }).catch(() => {});
    call('ai.get').then((a) => {
      setAi({ ...AI_DEFAULTS, ...a });
      setAiUiState({ customModel: !!a.model && a.provider === 'anthropic' && !CLAUDE_MODELS.includes(a.model), customUrl: !!a.baseUrl && a.provider === 'anthropic' });
    }).catch((err) => { setAi({ ...AI_DEFAULTS }); setAiErr(errorText(err)); });
    call('db.get').then((x) => setDb({ ...DB_DEFAULTS, ...x })).catch((err) => { setDb({ ...DB_DEFAULTS }); setDbErr(errorText(err)); });
  }, []);
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  // Live previews: in this window and, for a settings child window, in the main window too.
  const preview = (p) => { if (onPreview) onPreview(p); };
  const setBg = (patch) => {
    const startBackground = { ...d.startBackground, ...patch };
    set({ startBackground });
    window.dispatchEvent(new CustomEvent('mcc-start-bg-preview', { detail: startBackground }));
    preview({ startBackground });
  };
  const setA = (patch) => { setAi((x) => ({ ...x, ...patch })); setAiDirty(true); };
  const setB = (patch) => { setDb((x) => ({ ...x, ...patch })); setDbDirty(true); };
  const setAiUi = (patch) => setAiUiState((x) => ({ ...x, ...patch }));
  const previewTheme = (id) => { set({ theme: id }); applyTheme(id); preview({ theme: id }); };
  const previewLanguage = (lang) => { set({ language: lang }); setLanguage(lang); preview({ language: lang }); };
  const applyCustom = (list) => {
    setCustomThemes(list);
    if (list.some((c) => c.id === d.theme)) applyTheme(d.theme);
    preview({ customThemes: list, theme: d.theme });
  };

  // 테마 tab › 새로 만들기 (from the current theme) / 편집.
  const [customSel, setCustomSel] = useState('');
  const goCustom = (create) => {
    if (create) {
      const th = themeById(d.theme);
      const item = { id: `custom-${Date.now().toString(36)}`, label: `${getLanguage() === 'ko' ? th.label : th.labelEn || th.label} ${t('ct_copy')}`, mode: th.mode, colors: { ...baseColorsOf(th) } };
      const next = [...d.customThemes, item];
      set({ customThemes: next });
      applyCustom(next);
      setCustomSel(item.id);
    } else if (d.theme.startsWith('custom-')) setCustomSel(d.theme);
    setTab('custom');
  };

  const revert = () => {
    setCustomThemes(original.current.customRaw);
    applyTheme(original.current.theme);
    setLanguage(original.current.language);
    window.dispatchEvent(new CustomEvent('mcc-start-bg-preview', { detail: null }));
    preview({ revert: true });
  };
  const cancel = () => { revert(); onClose(); };

  // Unsaved edits: the save-on-exit prompt and the shortcut buttons ask about them.
  const isDirty = aiDirty || dbDirty || JSON.stringify(d) !== firstDraft.current;
  useEditorDirty('settings', isDirty, { label: t('settings'), save: () => ok() });
  // Shortcut buttons (admin settings, links, required software): ask about
  // unsaved edits, close, then the main window runs the action.
  const goAction = async (action) => {
    if (isDirty) {
      const choice = await ask({ title: t('settings'), icon: 'save', body: t('st_unsaved_body'), buttons: [
        { id: 'save', label: t('cl_save'), icon: 'save', primary: true },
        { id: 'discard', label: t('cl_discard'), icon: 'trash', danger: true },
        { id: 'cancel', label: t('cancel'), icon: 'close' },
      ] });
      if (choice === 'cancel') return;
      if (choice === 'save') { if (!(await ok({ stay: true }))) return; }
      else revert();
    } else revert();
    if (onAction) onAction(action);
    else { onClose(); emitAction(action); }
  };

  const ok = async ({ stay = false } = {}) => {
    if (saving) return false;
    setSaving(true);
    setError('');
    try {
      if (aiDirty && ai) {
        try { refreshAiSettings(await call('ai.save', { ai })); } catch (err) { setTab('ai'); setAiErr(errorText(err)); throw err; }
      }
      if (dbDirty && db) {
        try { setDb({ ...DB_DEFAULTS, ...(await call('db.save', { db })) }); } catch (err) { setTab('db'); setDbErr(errorText(err)); throw err; }
      }
      // The gate is a workspace section of its own (gates), saved with the settings.
      const gateBefore = JSON.stringify(defaultGateOf(ws.gates));
      const extra = JSON.stringify(d.gate) !== gateBefore
        ? { gates: (ws.gates && ws.gates.length ? ws.gates : [d.gate]).map((g) => (g.id === d.gate.id ? d.gate : g)) }
        : undefined;
      await onSave({
        checks: d.checks,
        reports: { ...d.reports, auto: { ...d.reports.auto, folder: String(d.reports.auto.folder || '').trim() } },
        language: d.language,
        theme: d.customThemes.some((c) => c.id === d.theme) || !d.theme.startsWith('custom-') ? d.theme : 'midnight',
        showStartOnLaunch: d.showStartOnLaunch,
        assignee: d.assignee,
        webhookUrl: d.webhookUrl,
        exclusions: d.exclusionsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
        limits: d.limits,
        newCode: d.newCode,
        newCodeDays: d.newCodeDays,
        newCodeRef: String(d.newCodeRef || '').trim(),
        newCodeVersion: String(d.newCodeVersion || '').trim(),
        maxFiles: d.maxFiles,
        memoryLimitGb: d.memoryLimitGb,
        analysisMode: d.analysisMode,
        startBackground: d.startBackground,
        panels: d.panels,
        customThemes: d.customThemes,
        tutorial: d.tutorial,
      }, extra);
      window.dispatchEvent(new CustomEvent('mcc-start-bg-preview', { detail: null }));
      firstDraft.current = JSON.stringify(d);
      setAiDirty(false);
      setDbDirty(false);
      if (!stay) onClose();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally { setSaving(false); }
  };

  // Esc = 취소, Enter = 확인 (not inside a textarea or a dropdown list).
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (confirmReset || document.querySelector('.ui-ask')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    else if (e.key === 'Enter' && !e.shiftKey) {
      const el = e.target;
      if (el && (el.tagName === 'TEXTAREA' || el.closest('.iselect-pop') || (el.tagName === 'BUTTON' && !el.closest('.st-foot')))) return;
      e.preventDefault();
      ok();
    }
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, []);

  const resetTab = () => {
    const def = draftOf({}, ws.gates);
    if (tab === 'general') { previewLanguage('ko'); set({ showStartOnLaunch: true, assignee: '', panels: { ...DEFAULT_PANELS } }); }
    if (tab === 'theme') previewTheme('midnight');
    if (tab === 'custom') { set({ customThemes: [] }); applyCustom([]); if (d.theme.startsWith('custom-')) previewTheme('midnight'); }
    if (tab === 'start') { set({ showStartOnLaunch: true }); setBg({ ...DEFAULT_START_BACKGROUND }); }
    if (tab === 'tutorial') set({ tutorial: { ...TUTORIAL_DEFAULTS } });
    if (tab === 'analysis') set({ exclusionsText: def.exclusionsText, limits: def.limits, maxFiles: 0, memoryLimitGb: memoryDefaultGb(), analysisMode: 'sequential', checks: {} });
    if (tab === 'reports') set({ reports: reportsOf(null) });
    if (tab === 'gate') set({ gate: { ...d.gate, conditions: DEFAULT_GATE_CONDITIONS.map((c) => ({ ...c })) } });
    if (tab === 'newcode') set({ newCode: 'previous', newCodeDays: 30, newCodeRef: '', newCodeVersion: '' });
    if (tab === 'ai') { setAi((x) => ({ ...AI_DEFAULTS, apiKey: x && x.apiKey === MASK ? MASK : '' })); setAiDirty(true); setAiUi({ customModel: false, customUrl: false }); }
    if (tab === 'db') { setDb((x) => ({ ...DB_DEFAULTS, password: x && x.password === MASK ? MASK : '' })); setDbDirty(true); }
    if (tab === 'integrations') set({ webhookUrl: '' });
    if (tab === 'advanced') set({ panels: { ...DEFAULT_PANELS } });
    setConfirmReset(false);
  };

  const current = SETTINGS_TABS.find((x) => x[0] === tab) || SETTINGS_TABS[0];
  const close = cancel;
  void close;
  return (
    <Dialog title={t('settings')} icon="settings" onClose={cancel} className="settings-window settings-dialog" dataTour="settings-window" windowed={windowed}>
      <div className="st-wrap">
        <nav className="st-tabs" role="tablist" aria-orientation="vertical">
          {SETTINGS_TABS.map(([id, icon, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`st-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              <Icon name={icon} size={15} /><span>{t(label)}</span>
              {((id === 'ai' && aiDirty) || (id === 'db' && dbDirty)) && <span className="st-dot" title={t('st_changed')} />}
            </button>
          ))}
        </nav>
        <div className="st-pane" role="tabpanel" data-tab={tab}>
          <h3 className="st-pane-title"><Icon name={current[1]} size={16} />{t(current[2])}</h3>
          {tab === 'general' && <GeneralTab d={d} set={set} previewLanguage={previewLanguage} />}
          {tab === 'theme' && <ThemeTab d={d} previewTheme={previewTheme} goCustom={goCustom} />}
          {tab === 'custom' && <CustomThemeTab key={customSel} d={d} set={set} previewTheme={previewTheme} applyCustom={applyCustom} initialSel={customSel} />}
          {tab === 'start' && <StartTab d={d} set={set} setBg={setBg} />}
          {tab === 'tutorial' && <TutorialSettings settings={d} onPatch={(p) => set(p)} onStarted={cancel} />}
          {tab === 'analysis' && <AnalysisTab d={d} set={set} close={goAction} />}
          {tab === 'gate' && <GateTab gate={d.gate} setGate={(gate) => set({ gate })} />}
          {tab === 'reports' && <ReportsTab d={d} set={set} />}
          {tab === 'newcode' && <NewCodeTab d={d} set={set} />}
          {tab === 'ai' && <AiTab ai={ai} setA={setA} aiErr={aiErr} ui={aiUi} setUi={setAiUi} />}
          {tab === 'db' && <DbTab db={db} setB={setB} dbErr={dbErr} />}
          {tab === 'integrations' && <IntegrationsTab d={d} set={set} close={goAction} />}
          {tab === 'advanced' && <AdvancedTab set={set} close={goAction} resetPanels={() => set({ panels: { ...DEFAULT_PANELS } })} />}
        </div>
      </div>
      <div className="st-foot">
        {error ? <span className="small bad st-error" title={error}><Icon name="alert" size={12} /> {error}</span> : <span className="small st-foot-hint">{t('st_foot_hint')}</span>}
        <span className="spacer" />
        <BtnGroup>
          <Btn icon="refresh" label={t('st_reset')} onClick={() => setConfirmReset(true)} title={t('st_reset_tip')} />
          <Btn icon="check" label={saving ? t('st_saving') : t('ok')} primary disabled={saving} onClick={ok} />
          <Btn icon="close" label={t('cancel')} disabled={saving} onClick={cancel} />
        </BtnGroup>
      </div>
      {confirmReset && <Confirm title={t('st_reset')} body={t('st_reset_confirm', { tab: t(current[2]) })} okLabel={t('st_reset')} danger onOk={resetTab} onCancel={() => setConfirmReset(false)} />}
    </Dialog>
  );
}
