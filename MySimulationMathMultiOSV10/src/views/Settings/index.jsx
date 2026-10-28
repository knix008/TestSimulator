// The settings window: fixed size (no scrollbars anywhere), a vertical tab
// list, a draft kept until 확인 (OK), live previews of theme / language that
// 취소 (Cancel) undoes, and 초기화 (Reset) for the current tab after a
// confirm. Esc = 취소, Enter = 확인 (outside text fields).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage, setLanguage, getLanguage } from '../../lib/i18n';
import { applyTheme, setCustomThemes, themeById, baseColorsOf } from '../../themes';
import { Icon, Dialog } from '../../components/Chrome';
import { Btn, BtnGroup, Confirm, errorText } from '../common';
import { useEditorDirty } from '../../lib/dirty';
import { DEFAULTS } from '../../lib/settings';
import { GeneralTab, ThemeTab, CustomThemeTab, CommandTab, EditorTab, FiguresTab, SimulationTab, KeyboardTab, StartTab } from './tabs';

export const SETTINGS_TABS = [
  ['general', 'settings', 'st_tab_general'],
  ['start', 'home', 'st_tab_start'],
  ['theme', 'palette', 'st_tab_theme'],
  ['custom', 'edit', 'st_tab_custom'],
  ['cmd', 'terminal', 'st_tab_cmd'],
  ['editor', 'script', 'st_tab_editor'],
  ['figures', 'figure', 'st_tab_figures'],
  ['sim', 'model', 'st_tab_sim'],
  ['keyboard', 'key', 'st_tab_keyboard'],
];

const KEYS = ['language', 'theme', 'customThemes', 'startFolder', 'restoreFiles', 'confirmExit', 'mAssociation', 'cmd', 'editor', 'figures', 'sim', 'keyboard', 'showStartOnLaunch', 'startBackground', 'tutorial'];

function draftOf(s) {
  const out = {};
  for (const k of KEYS) out[k] = s[k] === undefined ? DEFAULTS[k] : s[k];
  out.cmd = { ...DEFAULTS.cmd, ...(s.cmd || {}) };
  out.editor = { ...DEFAULTS.editor, ...(s.editor || {}) };
  out.figures = { ...DEFAULTS.figures, ...(s.figures || {}) };
  out.sim = { ...DEFAULTS.sim, ...(s.sim || {}) };
  out.keyboard = { ...DEFAULTS.keyboard, ...(s.keyboard || {}) };
  out.customThemes = (s.customThemes || []).map((c) => ({ ...c, colors: { ...c.colors } }));
  out.showStartOnLaunch = s.showStartOnLaunch !== false;
  out.startBackground = { ...(s.startBackground || {}) };
  out.tutorial = { askOnLaunch: true, ...(s.tutorial || {}) };
  out.mAssociation = s.mAssociation === undefined ? null : s.mAssociation;
  return out;
}

export function SettingsDialog({ settings, onClose, onSave, initialTab, windowed, onPreview }) {
  useLanguage();
  const s = settings || DEFAULTS;
  const original = useRef({ theme: s.theme || 'midnight', language: getLanguage(), customRaw: s.customThemes || [] });
  const [tab, setTab] = useState(initialTab || 'general');
  const [d, setD] = useState(() => draftOf(s));
  const first = useRef(JSON.stringify(draftOf(s)));
  const [confirmReset, setConfirmReset] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const preview = (p) => { if (onPreview) onPreview(p); };
  const previewTheme = (id) => { set({ theme: id }); applyTheme(id); preview({ theme: id }); };
  const previewLanguage = (lang) => { set({ language: lang }); setLanguage(lang); preview({ language: lang }); };
  const applyCustom = (list) => {
    setCustomThemes(list);
    if (list.some((c) => c.id === d.theme)) applyTheme(d.theme);
    preview({ customThemes: list, theme: d.theme });
  };

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
    preview({ revert: true });
  };
  const cancel = () => { revert(); onClose(); };

  const isDirty = JSON.stringify(d) !== first.current;
  useEditorDirty('settings', isDirty, { label: t('settings'), save: () => ok() });

  const ok = async () => {
    if (saving) return false;
    setSaving(true);
    setError('');
    try {
      const theme = d.customThemes.some((c) => c.id === d.theme) || !d.theme.startsWith('custom-') ? d.theme : 'midnight';
      await onSave({ ...d, theme });
      first.current = JSON.stringify(d);
      onClose();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally { setSaving(false); }
  };

  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (confirmReset || document.querySelector('.ui-ask')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    else if (e.key === 'Enter' && !e.shiftKey) {
      const el = e.target;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.closest('.iselect-pop') || (el.tagName === 'BUTTON' && !el.closest('.st-foot')))) return;
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
    const def = draftOf({});
    if (tab === 'general') { previewLanguage('ko'); previewTheme('midnight'); set({ startFolder: '', restoreFiles: true, confirmExit: true }); }
    if (tab === 'start') set({ showStartOnLaunch: true, startBackground: { layout: (d.startBackground || {}).layout || null }, tutorial: { ...d.tutorial, askOnLaunch: true } });
    if (tab === 'theme') previewTheme('midnight');
    if (tab === 'custom') { set({ customThemes: [] }); applyCustom([]); if (d.theme.startsWith('custom-')) previewTheme('midnight'); }
    if (tab === 'cmd') set({ cmd: def.cmd });
    if (tab === 'editor') set({ editor: def.editor });
    if (tab === 'figures') set({ figures: def.figures });
    if (tab === 'sim') set({ sim: def.sim });
    if (tab === 'keyboard') set({ keyboard: def.keyboard });
    setConfirmReset(false);
  };

  const current = SETTINGS_TABS.find((x) => x[0] === tab) || SETTINGS_TABS[0];
  return (
    <Dialog title={t('settings')} icon="settings" onClose={cancel} className="settings-window settings-dialog" windowed={windowed}>
      <div className="st-wrap">
        <nav className="st-tabs" role="tablist" aria-orientation="vertical">
          {SETTINGS_TABS.map(([id, icon, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} data-stab={id} className={`st-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              <Icon name={icon} size={15} /><span>{t(label)}</span>
            </button>
          ))}
        </nav>
        <div className="st-pane" role="tabpanel" data-tab={tab}>
          <h3 className="st-pane-title"><Icon name={current[1]} size={16} />{t(current[2])}</h3>
          {tab === 'general' && <GeneralTab d={d} set={set} previewLanguage={previewLanguage} previewTheme={previewTheme} />}
          {tab === 'start' && <StartTab d={d} set={set} />}
          {tab === 'theme' && <ThemeTab d={d} previewTheme={previewTheme} goCustom={goCustom} />}
          {tab === 'custom' && <CustomThemeTab key={customSel} d={d} set={set} previewTheme={previewTheme} applyCustom={applyCustom} initialSel={customSel} />}
          {tab === 'cmd' && <CommandTab d={d} set={set} />}
          {tab === 'editor' && <EditorTab d={d} set={set} />}
          {tab === 'figures' && <FiguresTab d={d} set={set} />}
          {tab === 'sim' && <SimulationTab d={d} set={set} />}
          {tab === 'keyboard' && <KeyboardTab d={d} set={set} />}
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
