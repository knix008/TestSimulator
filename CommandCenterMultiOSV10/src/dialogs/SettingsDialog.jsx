// Settings (⚙ on the toolbar) — general, panels, file opening, viewer/editor,
// windows and terminal. Values live in the session file; App applies them when
// the dialog is confirmed (also when it runs as a separate window, through
// the window message bus).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { THEMES, allThemes, setCustomThemes, baseColorsOf, themeById, CUSTOM_COLOR_KEYS } from '../themes';
import { DialogFrame } from './Dialogs';
import { SETTINGS_DEFAULTS } from '../lib/settings';
import { isElectron } from '../lib/backend';
import { Icon } from '../components/Icons';
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
  // Four tabs: general (+ panels, windows, terminal sections), theme, files (open + viewer / editor), prompt.
  const tabs = [['general', t('set_general')], ['theme', t('set_theme')], ['open', t('set_files')], ['prompt', t('set_prompt')]];
  const Section = ({ label }) => <div className="settings-section">{label}</div>;
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
  // ── custom themes (settings › theme) ──
  const customList = (v.customThemes || []).map((c) => ({ ...c, tokens: themeById(c.id).tokens, custom: true, labelEn: c.label }));
  const customCur = (v.customThemes || []).find((c) => c.id === v.theme) || null;
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  const setCustom = (list, theme) => { setCustomThemes(list); setV((s) => ({ ...s, customThemes: list, ...(theme ? { theme } : {}) })); };
  const addCustom = () => {
    const base = themeById(v.theme);
    const id = `custom-${Date.now().toString(36)}`;
    const list = [...(v.customThemes || []), { id, label: `${lang === 'ko' ? base.label : base.labelEn} ${t('set_custom_copy')}`, mode: base.mode, colors: baseColorsOf(base) }];
    setCustom(list, id);
  };
  const editCustom = (patch) => { const list = (v.customThemes || []).map((c) => (c.id === v.theme ? { ...c, ...patch } : c)); setCustom(list); };
  const removeCustom = () => { const list = (v.customThemes || []).filter((c) => c.id !== v.theme); setCustom(list, 'midnight'); };

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

            <Section label={t('set_panels')} />
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

            <Section label={t('set_windows')} />
            <Check k="separateWindows" label={t('set_separate_windows')} />
            <span />
            <span className="muted small">{t('set_separate_windows_hint')}</span>

            <Section label={t('set_terminal')} />
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
        {tab === 'theme' && (<>
          <div className="theme-grid">
            {[...THEMES, ...customList].map((th) => (
              <button type="button" key={th.id} className={`theme-card ${v.theme === th.id ? 'active' : ''}`} onClick={() => set('theme', th.id)}
                style={{ background: th.tokens['--bg'], color: th.tokens['--fg'], borderColor: v.theme === th.id ? th.tokens['--accent'] : th.tokens['--border'] || 'transparent' }}>
                <span className="theme-sample" style={{ background: th.tokens['--bg-panel'] }}>
                  <span className="theme-bar" style={{ background: th.tokens['--bg-elev'] }}><span style={{ background: th.tokens['--accent'] }} /></span>
                  <span className="theme-line" style={{ background: th.tokens['--bg-sel'] }} />
                  <span className="theme-line" style={{ background: th.tokens['--fg-muted'] }} />
                  <span className="theme-line short" style={{ background: th.tokens['--fg-muted'] }} />
                </span>
                <span className="theme-name">{th.custom && <span className="theme-badge">★</span>}{lang === 'ko' ? th.label : th.labelEn}</span>
              </button>
            ))}
          </div>
          <div className="settings-section">{t('set_custom_themes')}</div>
          <div className="pe-quick">
            <button type="button" className="btn small" onClick={addCustom}><Icon name="plus" size={13} /> {t('set_custom_add', { name: themeLabel(v.theme) })}</button>
            {customCur && <button type="button" className="btn small" onClick={removeCustom}><Icon name="close" size={13} /> {t('set_custom_remove')}</button>}
            {!customCur && <span className="muted small">{t('set_custom_hint')}</span>}
          </div>
          {customCur && (
            <div className="custom-theme">
              <div className="form-grid settings-grid custom-theme-head">
                <label>{t('set_custom_name')}</label>
                <div className="row">
                  <input value={customCur.label} onChange={(e) => editCustom({ label: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                  <select value={customCur.mode} onChange={(e) => editCustom({ mode: e.target.value })} style={{ flex: 'none', width: 160 }}>
                    <option value="dark">{t('set_custom_dark')}</option>
                    <option value="light">{t('set_custom_light')}</option>
                  </select>
                </div>
              </div>
              <div className="custom-colors">
                {CUSTOM_COLOR_KEYS.map((k) => (
                  <label key={k} className="custom-color">
                    <span className="muted small">{t(`set_color_${k}`)}</span>
                    <span className="pe-color">
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(customCur.colors[k] || '') ? customCur.colors[k] : '#888888'} onChange={(e) => editCustom({ colors: { ...customCur.colors, [k]: e.target.value } })} />
                      <input className="mono" value={customCur.colors[k] || ''} onChange={(e) => editCustom({ colors: { ...customCur.colors, [k]: e.target.value } })} spellCheck={false} />
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </>)}
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
            <textarea className="mono" rows={3} value={v.textExts} spellCheck={false} onChange={(e) => set('textExts', e.target.value)} style={{ resize: 'vertical' }} />
            <span />
            <span className="muted small">{t('set_text_exts_hint')}</span>

            <Section label={t('set_viewer')} />
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
        {tab === 'prompt' && (
          <PromptEditor value={v.prompt} onChange={(cfg) => set('prompt', cfg)} pickFile={spec.pickFile} />
        )}
        <button type="submit" hidden />
      </form>
    </DialogFrame>
  );
}

export default SettingsDialog;
