// Settings (⚙ on the toolbar) — general, panels, file opening, viewer/editor,
// windows and terminal. Values live in the session file; App applies them when
// the dialog is confirmed (also when it runs as a separate window, through
// the window message bus).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { THEMES, allThemes, setCustomThemes, baseColorsOf, themeById, CUSTOM_COLOR_KEYS } from '../themes';
import { DialogFrame } from './Dialogs';
import { SETTINGS_DEFAULTS } from '../lib/settings';
import { isDesktop, revealWindow } from '../lib/backend';
import { Flag, Icon } from '../components/Icons';
import { RecentFolders, StartBackgroundControls } from '../components/StartPage';
import { PromptEditor } from './PromptEditor';

// A number with a − button on its left and a + button on its right; typing in it works as before.
function Num({ value, onChange, min = 1, max = 9999, step = 1, width = 78, unit }) {
  const clamp = (n) => Math.min(max, Math.max(min, n));
  const n = Number(value) || min;
  return (
    <div className="row num-field">
      <button type="button" className="num-btn" tabIndex={-1} disabled={n <= min} aria-label="−" title="−"
        onClick={() => onChange(clamp(n - step))}>−</button>
      <input value={value} inputMode="numeric" style={{ width }}
        onChange={(e) => onChange(clamp(parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || min))} />
      <button type="button" className="num-btn" tabIndex={-1} disabled={n >= max} aria-label="+" title="+"
        onClick={() => onChange(clamp(n + step))}>+</button>
      {unit && <span className="muted">{unit}</span>}
    </div>
  );
}

export function SettingsDialog({ spec, done }) {
  const lang = useLanguage();
  const [tab, setTab] = useState(spec.tab || 'general');
  const [v, setV] = useState({ ...SETTINGS_DEFAULTS, ...(spec.values || {}) });
  const shells = spec.shells || [];
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  // Every change is applied right away (spec.onChange); OK keeps it, Cancel lets the caller restore the old values.
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (spec.onChange) spec.onChange(v); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e) => { if (e) e.preventDefault(); done(v); };
  // Each page is short enough to sit in the window whole: nothing is covered and nothing scrolls.
  // Panels and the viewer used to share a page with general and file-opening, which pushed the last
  // rows and the buttons past the bottom of the dialog.
  const tabs = [
    ['general', t('set_general'), 'settings'],
    ['start', t('set_start'), 'image'],
    ['panels', t('set_panels'), 'grid'],
    ['theme', t('set_theme'), 'palette'],
    ['open', t('set_open'), 'file'],
    ['viewer', t('set_viewer'), 'eye'],
    ['terminal', t('set_terminal'), 'terminal'],
    ['prompt', t('set_prompt'), 'gitBranch'],
  ];
  const Section = ({ label }) => <div className="settings-section">{label}</div>;
  // Two of those tabs hold several pages of their own, shown one at a time under sub-tabs. That is what
  // keeps the window short: it is fitted to the tallest page there is (below), and the theme tab's two
  // colour grids stacked on the colour editor — and the terminal's two groups of settings — were the
  // tallest things in it by far.
  const SUBS = {
    theme: [['dark', t('set_themes_dark')], ['light', t('set_themes_light')], ['custom', t('set_custom_themes')]],
    terminal: [['shell', t('set_term_tab_shell')], ['output', t('set_term_output')]],
    prompt: [['presets', t('pe_tab_presets')], ['quick', t('pe_customize')], ['advanced', t('pe_advanced')]],
  };
  const [sub, setSub] = useState({ theme: themeById((spec.values || {}).theme).mode === 'light' ? 'light' : 'dark', terminal: 'shell', prompt: 'presets' });
  const [recent, setRecent] = useState(spec.recent || []);
  const changeRecent = (next) => { setRecent(next); if (spec.onRecent) spec.onRecent(next); };
  const shownTab = tab;
  const shownSub = (SUBS[tab] && sub[tab]) || '';
  // The window is created at the size the pages need and kept hidden until this first draw,
  // so it does not appear large and blank and then jump.
  useLayoutEffect(() => { if (spec.windowed) revealWindow(); }, [spec.windowed]);
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
  // The colours shown in the theme tab: a custom theme's own, else the built-in theme's (read-only).
  const themeColors = customCur ? customCur.colors : baseColorsOf(themeById(v.theme));
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
  // The row of sub-tabs at the top of a tab that has them.
  const SubTabs = ({ of: id }) => (
    <div className="settings-tabs sub">
      {SUBS[id].map(([s, label]) => (
        <button key={s} type="button" className={`settings-tab ${sub[id] === s ? 'active' : ''}`}
          onClick={() => setSub((m) => ({ ...m, [id]: s }))}>{label}</button>
      ))}
    </div>
  );

  // 960 × 540 is the window (src/lib/backend.js). At that width the tallest page, the viewer
  // tab, fits the height; narrower wraps the prompt presets onto more rows and the window
  // would have to grow again.
  return (
    <DialogFrame title={t('settings_title')} onClose={() => done(null)} icon="settings" width={960} windowed={spec.windowed} className="settings"
      footer={<>
        <button className="btn" onClick={() => setV({ ...SETTINGS_DEFAULTS, language: v.language })}>{t('set_defaults')}</button>
        <span className="spacer" />
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('ok')}</button>
      </>}>
      <div className="settings-layout">
      <div className="settings-nav" role="tablist">
        {tabs.map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`settings-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            <span className="settings-tab-icon"><Icon name={icon} size={16} /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="settings-pane">
        {shownTab === 'general' && (
          <div className="form-grid settings-grid">
            <div className="lang-line">
            <label>{t('set_language')}</label>
            <div className="lang-choice" role="group" aria-label={t('set_language')}>
              <button type="button" className={`lang-btn ${v.language === 'ko' ? 'on' : ''}`} aria-pressed={v.language === 'ko'} onClick={() => set('language', 'ko')}>
                <Flag country="kr" width={22} />
                <span>한국어</span>
              </button>
              <button type="button" className={`lang-btn ${v.language === 'en' ? 'on' : ''}`} aria-pressed={v.language === 'en'} onClick={() => set('language', 'en')}>
                <Flag country="gb" width={22} />
                <span>English</span>
              </button>
            </div>
            </div>

            <label>{t('set_font_size')}</label>
            <Num value={v.fontSize} onChange={(n) => set('fontSize', n)} min={9} max={24} unit="px" />

            <label>{t('set_split_size')}</label>
            <Num value={v.splitSizeMB} onChange={(n) => set('splitSizeMB', n)} unit="MB" />

            <label>{t('set_history_max')}</label>
            <Num value={v.historyMax} onChange={(n) => set('historyMax', n)} min={1} max={500} />

            <Check k="confirmDelete" label={t('set_confirm_delete')} />
            <Check k="restoreFolders" label={t('set_restore_folders')} />
            <Check k="autoRefresh" label={t('set_auto_refresh')} />
          </div>
        )}
        {shownTab === 'start' && (<>
          <StartBackgroundControls
            scene={v.startScene}
            transparency={v.startTransparency}
            motion={v.startMotion}
            showAtLaunch={v.startAtLaunch !== false}
            onChange={(patch) => setV((s) => ({ ...s, ...patch }))}
          />
          <RecentFolders
            recent={recent}
            onRemove={(path) => changeRecent(recent.filter((p) => p !== path))}
            onClear={() => changeRecent([])}
          />
        </>)}
        {shownTab === 'panels' && (
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

            <Section label={t('set_windows')} />
            <Check k="separateWindows" label={t('set_separate_windows')} />
            <span />
            <span className="muted small">{t('set_separate_windows_hint')}</span>
          </div>
        )}
        {/* Every built-in theme on one page, the dark ones and the light ones under a heading each:
            sorting them apart is what makes the grid readable — a sub-tab each was more than it needed.
            A custom theme joins the group its mode says it belongs to; the colour editor is its own
            sub-tab, which is where the height the window saves comes from. */}
        {shownTab === 'theme' && (<>
          <SubTabs of="theme" />
          {(shownSub === 'dark' || shownSub === 'light') && (
            <div className="theme-grid">
              {[...THEMES, ...customList].filter((th) => th.mode === shownSub).map((th) => (
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
          )}
          {shownSub === 'custom' && (<>
          <div className="settings-section">{t('set_custom_themes')}</div>
          <div className="pe-quick">
            <button type="button" className="btn small" onClick={addCustom}><Icon name="plus" size={13} /> {t('set_custom_add', { name: themeLabel(v.theme) })}</button>
            {customCur && <button type="button" className="btn small" onClick={removeCustom}><Icon name="close" size={13} /> {t('set_custom_remove')}</button>}
            {!customCur && <span className="muted small">{t('set_custom_hint')}</span>}
          </div>
          {/* The colours of the selected theme, always shown. A built-in theme's colours can be read but not
              changed — "복사본 추가" makes a custom copy of exactly these values, which is then editable. */}
          <div className="custom-theme">
            <div className="settings-section">{t(customCur ? 'set_custom_colors' : 'set_theme_colors', { name: themeLabel(v.theme) })}</div>
            <div className="form-grid settings-grid custom-theme-head">
              <label>{t('set_custom_name')}</label>
              <div className="row">
                <input value={customCur ? customCur.label : themeLabel(v.theme)} readOnly={!customCur} disabled={!customCur}
                  onChange={(e) => editCustom({ label: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                <select value={customCur ? customCur.mode : themeById(v.theme).mode} disabled={!customCur}
                  onChange={(e) => editCustom({ mode: e.target.value })} style={{ flex: 'none', width: 160 }}>
                  <option value="dark">{t('set_custom_dark')}</option>
                  <option value="light">{t('set_custom_light')}</option>
                </select>
              </div>
            </div>
            <div className="custom-colors">
              {CUSTOM_COLOR_KEYS.map((k) => (
                <label key={k} className="custom-color" title={customCur ? undefined : t('set_theme_colors_readonly')}>
                  <span className="muted small">{t(`set_color_${k}`)}</span>
                  <span className="pe-color">
                    <input type="color" disabled={!customCur} value={/^#[0-9a-fA-F]{6}$/.test(themeColors[k] || '') ? themeColors[k] : '#888888'}
                      onChange={(e) => editCustom({ colors: { ...themeColors, [k]: e.target.value } })} />
                    <input className="mono" readOnly={!customCur} disabled={!customCur} value={themeColors[k] || ''}
                      onChange={(e) => editCustom({ colors: { ...themeColors, [k]: e.target.value } })} spellCheck={false} />
                  </span>
                </label>
              ))}
            </div>
            {!customCur && <span className="muted small">{t('set_theme_colors_readonly')}</span>}
          </div>
          </>)}
        </>)}
        {shownTab === 'open' && (
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
              {isDesktop && spec.pickFile && <button type="button" className="btn" disabled={v.textOpen !== 'custom'} onClick={browseApp}>{t('set_browse')}</button>}
            </div>

            <label>{t('set_text_exts')}</label>
            <textarea className="mono" rows={3} value={v.textExts} spellCheck={false} onChange={(e) => set('textExts', e.target.value)} />
            <span />
            <span className="muted small">{t('set_text_exts_hint')}</span>
          </div>
        )}
        {shownTab === 'viewer' && (
          <div className="form-grid settings-grid">
            <label>{t('set_viewer_font')}</label>
            <select value={v.viewerFontSize} onChange={(e) => set('viewerFontSize', Number(e.target.value))}>
              {[10, 11, 12, 13, 14, 15, 16, 18, 20].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
            <Check k="viewerWrap" label={t('set_viewer_wrap')} />
            <Check k="syntax" label={t('set_syntax')} />
            <span />
            <span className="muted small">{t('set_syntax_hint')}</span>
            <Check k="imagePreview" label={t('set_image_preview')} />
            <span />
            <span className="muted small">{t('set_image_preview_hint')}</span>
            <label>{t('set_editor_font')}</label>
            <select value={v.editorFontSize} onChange={(e) => set('editorFontSize', Number(e.target.value))}>
              {[10, 11, 12, 13, 14, 15, 16, 18, 20].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
            <label>{t('set_editor_tab')}</label>
            <select value={v.editorTabSize} onChange={(e) => set('editorTabSize', Number(e.target.value))}>
              {[2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Check k="editorWrap" label={t('set_editor_wrap')} />
            <label>{t('set_print_font')}</label>
            <select value={v.printFontSize || 10} onChange={(e) => set('printFontSize', Number(e.target.value))}>
              {[7, 8, 9, 10, 11, 12, 14].map((n) => <option key={n} value={n}>{n} pt</option>)}
            </select>
            <span />
            <span className="muted small">{t('set_print_font_hint')}</span>
          </div>
        )}
        {/* The terminal itself: which shell starts where (셸) and how its output is shown (출력), a
            sub-tab each. The prompt drawn at the end of that output has a tab of its own — it needs the
            whole pane. */}
        {shownTab === 'terminal' && (<>
          <SubTabs of="terminal" />
          {shownSub === 'shell' && (
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
              {isDesktop && spec.pickFolder && <button type="button" className="btn" onClick={browseFolder}>{t('set_browse')}</button>}
            </div>
            <span />
            <span className="muted small">{t('set_term_cwd_hint')}</span>
            <span />
            <span className="muted small">{t('set_term_prompt_hint')}</span>
          </div>
          )}
          {shownSub === 'output' && (
          <div className="form-grid settings-grid">
            <Check k="termColor" label={t('set_term_color')} />
            <label>{t('set_term_cr')}</label>
            <select value={v.termCr} onChange={(e) => set('termCr', e.target.value)}>
              {[['overwrite', t('set_term_cr_overwrite')], ['newline', t('set_term_cr_newline')], ['strip', t('set_term_cr_strip')]].map(([x, l]) => <option key={x} value={x}>{l}</option>)}
            </select>
            <span />
            <span className="muted small">{t('set_term_cr_hint')}</span>
            <label>{t('set_term_eol')}</label>
            <select value={v.termEol} onChange={(e) => set('termEol', e.target.value)}>
              {[['auto', t('set_term_eol_auto')], ['lf', 'LF (\\n)'], ['crlf', 'CRLF (\\r\\n)']].map(([x, l]) => <option key={x} value={x}>{l}</option>)}
            </select>
            <span />
            <span className="muted small">{t('set_term_eol_hint')}</span>
            <label>{t('set_term_scrollback')}</label>
            <Num value={v.termScrollback} onChange={(n) => set('termScrollback', n)} min={200} max={200000} unit={t('set_term_lines')} />
            <span />
            <span className="muted small">{t('set_term_scrollback_hint')}</span>
          </div>
          )}
        </>)}
        {shownTab === 'prompt' && (<>
          <SubTabs of="prompt" />
          <PromptEditor page={shownSub} value={v.prompt} onChange={(cfg) => set('prompt', cfg)}
            custom={v.customPrompts || []} onCustomChange={(list, cfg) => setV((s) => ({ ...s, customPrompts: list, ...(cfg ? { prompt: cfg } : {}) }))} />
        </>)}
        <button type="submit" hidden />
      </form>
      </div>
    </DialogFrame>
  );
}

export default SettingsDialog;
