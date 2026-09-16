// Settings (⚙ on the toolbar) — general, panels, file opening, viewer/editor,
// windows and terminal. Values live in the session file; App applies them when
// the dialog is confirmed (also when it runs as a separate window, through
// the window message bus).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { THEMES } from '../themes';
import { DialogFrame } from './Dialogs';
import { SETTINGS_DEFAULTS } from '../lib/settings';
import { isElectron } from '../lib/backend';
import { PromptEditor } from './PromptEditor';

function Num({ value, onChange, min = 1, max = 9999, width = 90, unit }) {
  return (
    <div className="row">
      <input value={value} inputMode="numeric" style={{ width }}
        onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || min)))} />
      {unit && <span className="muted">{unit}</span>}
    </div>
  );
}

export function SettingsDialog({ spec, done }) {
  const lang = useLanguage();
  const [tab, setTab] = useState('general');
  const [v, setV] = useState({ ...SETTINGS_DEFAULTS, ...(spec.values || {}) });
  const shells = spec.shells || [];
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  // Every change is applied right away (spec.onChange); OK keeps it, Cancel lets the caller restore the old values.
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (spec.onChange) spec.onChange(v); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e) => { if (e) e.preventDefault(); done(v); };
  const tabs = [['general', t('set_general')], ['panels', t('set_panels')], ['open', t('set_open')], ['viewer', t('set_viewer')], ['windows', t('set_windows')], ['terminal', t('set_terminal')], ['prompt', t('set_prompt')]];
  // Pickers are native dialogs on the desktop; in the browser the path is typed.
  const browseFolder = async () => {
    try { const p = await spec.pickFolder(v.termCwd || undefined); if (p) set('termCwd', p); } catch { /* cancelled */ }
  };
  const browseApp = async () => {
    try {
      const p = await spec.pickFile(v.textApp || undefined, spec.platform === 'win32' ? [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd'] }, { name: 'All files', extensions: ['*'] }] : undefined);
      if (p) set('textApp', p);
    } catch { /* cancelled */ }
  };
  const Check = ({ k, label }) => (<><span /><label className="check"><input type="checkbox" checked={!!v[k]} onChange={(e) => set(k, e.target.checked)} /> {label}</label></>);

  return (
    <DialogFrame title={t('settings_title')} onClose={() => done(null)} icon="settings" width={900} windowed={spec.windowed} className="settings"
      footer={<>
        <button className="btn" onClick={() => setV({ ...SETTINGS_DEFAULTS, language: v.language })}>{t('set_defaults')}</button>
        <span className="spacer" />
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('ok')}</button>
      </>}>
      <div className="settings-tabs">
        {tabs.map(([id, label]) => <button key={id} type="button" className={`settings-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <form onSubmit={submit} className="settings-pane">
        {tab === 'general' && (
          <div className="form-grid settings-grid">
            <label>{t('set_language')}</label>
            <select value={v.language} onChange={(e) => set('language', e.target.value)}>
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>

            <label>{t('set_theme')}</label>
            <select value={v.theme} onChange={(e) => set('theme', e.target.value)}>
              {THEMES.map((th) => <option key={th.id} value={th.id}>{lang === 'ko' ? th.label : th.labelEn}</option>)}
            </select>

            <label>{t('set_font_size')}</label>
            <select value={v.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>
              {[11, 12, 13, 14, 15, 16, 18].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>

            <label>{t('set_split_size')}</label>
            <Num value={v.splitSizeMB} onChange={(n) => set('splitSizeMB', n)} unit="MB" />

            <label>{t('set_history_max')}</label>
            <Num value={v.historyMax} onChange={(n) => set('historyMax', n)} min={1} max={500} />

            <Check k="confirmDelete" label={t('set_confirm_delete')} />
            <Check k="restoreFolders" label={t('set_restore_folders')} />
            <Check k="autoRefresh" label={t('set_auto_refresh')} />
          </div>
        )}
        {tab === 'panels' && (
          <div className="form-grid settings-grid">
            <label>{t('set_columns')}</label>
            <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
              {[['showPerm', 'col_perm'], ['showDate', 'col_date'], ['showType', 'col_type'], ['showSize', 'col_size']].map(([k, l]) => (
                <label key={k} className="check"><input type="checkbox" checked={!!v[k]} onChange={(e) => set(k, e.target.checked)} /> {t(l)}</label>
              ))}
            </div>
            <Check k="showHidden" label={t('show_hidden')} />
            <Check k="quickSearch" label={t('set_quick_search')} />
            <Check k="spaceMeasures" label={t('set_space_measures')} />
            <label>{t('set_compare_tol')}</label>
            <Num value={v.compareToleranceSec} onChange={(n) => set('compareToleranceSec', n)} min={0} max={3600} unit={t('set_seconds')} />
            <Check k="showToolbar" label={t('set_show_toolbar')} />
            <Check k="fnBar" label={t('fn_bar')} />
          </div>
        )}
        {tab === 'open' && (
          <div className="form-grid settings-grid">
            <label>{t('set_text_open')}</label>
            <select value={v.textOpen} onChange={(e) => set('textOpen', e.target.value)}>
              <option value="app">{t('set_text_open_app')}</option>
              <option value="viewer">{t('set_text_open_viewer')}</option>
              <option value="editor">{t('set_text_open_editor')}</option>
              <option value="custom">{t('set_text_open_custom')}</option>
            </select>

            <label>{t('set_text_app')}</label>
            <div className="row">
              <input type="text" className="mono" value={v.textApp || ''} placeholder={t('set_text_app_hint')} spellCheck={false} disabled={v.textOpen !== 'custom'}
                onChange={(e) => set('textApp', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              {isElectron && spec.pickFile && <button type="button" className="btn" disabled={v.textOpen !== 'custom'} onClick={browseApp}>{t('set_browse')}</button>}
            </div>

            <label>{t('set_text_exts')}</label>
            <textarea className="mono" rows={4} value={v.textExts} spellCheck={false} onChange={(e) => set('textExts', e.target.value)} style={{ resize: 'vertical' }} />
            <span />
            <span className="muted small">{t('set_text_exts_hint')}</span>
          </div>
        )}
        {tab === 'viewer' && (
          <div className="form-grid settings-grid">
            <label>{t('set_viewer_font')}</label>
            <select value={v.viewerFontSize} onChange={(e) => set('viewerFontSize', Number(e.target.value))}>
              {[10, 11, 12, 13, 14, 15, 16, 18, 20].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
            <Check k="viewerWrap" label={t('set_viewer_wrap')} />

            <label>{t('set_editor_font')}</label>
            <select value={v.editorFontSize} onChange={(e) => set('editorFontSize', Number(e.target.value))}>
              {[10, 11, 12, 13, 14, 15, 16, 18, 20].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
            <label>{t('set_editor_tab')}</label>
            <select value={v.editorTabSize} onChange={(e) => set('editorTabSize', Number(e.target.value))}>
              {[2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Check k="editorWrap" label={t('set_editor_wrap')} />
          </div>
        )}
        {tab === 'windows' && (
          <div className="form-grid settings-grid">
            <Check k="separateWindows" label={t('set_separate_windows')} />
            <span />
            <span className="muted small">{t('set_separate_windows_hint')}</span>
          </div>
        )}
        {tab === 'terminal' && (
          <div className="form-grid settings-grid">
            <label>{t('set_term_shell')}</label>
            <select value={v.termShell || ''} onChange={(e) => set('termShell', e.target.value)}>
              <option value="">{t('set_term_shell_default', { name: shells.length ? shells[0].label : '' })}</option>
              {shells.map((sh) => <option key={sh.id} value={sh.id}>{sh.label}</option>)}
            </select>

            <label>{t('set_term_cwd')}</label>
            <div className="row">
              <input type="text" className="mono" value={v.termCwd || ''} placeholder={t('set_term_cwd_default')} spellCheck={false}
                onChange={(e) => set('termCwd', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              {isElectron && spec.pickFolder && <button type="button" className="btn" onClick={browseFolder}>{t('set_browse')}</button>}
            </div>
            <span />
            <span className="muted small">{t('set_term_cwd_hint')}</span>
          </div>
        )}
        {tab === 'prompt' && (
          <PromptEditor value={v.prompt} onChange={(cfg) => set('prompt', cfg)} pickFile={spec.pickFile} />
        )}
        <button type="submit" hidden />
      </form>
    </DialogFrame>
  );
}

export default SettingsDialog;
