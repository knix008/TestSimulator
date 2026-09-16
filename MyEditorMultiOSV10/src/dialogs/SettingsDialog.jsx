// Settings dialog (Ctrl+,) — four tabs, each filling the (fixed-size)
// window: general (general · files · editor, in two columns), theme (one
// card per theme + custom themes), terminal (shell, line endings, the prompt
// theme editor) and formatting. Changes apply immediately (the editor
// reconfigures live) and are persisted.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES, themeById, baseColorsOf, setCustomThemes, CUSTOM_COLOR_KEYS } from '../themes';
import { PromptEditor } from './PromptEditor';
import { FontPicker } from '../components/FontPicker';
import { Icon } from '../components/Icons';
import { Dialog, ConfirmDialog } from './Dialogs';
import { InstallDialog } from './InstallDialog';
import { isElectron, nativeDialog, call } from '../lib/backend';
import { toolLabel } from '../lib/formatters';
import { resetPatch } from '../lib/settings';
import { FEATURED_LANGUAGES, PLAIN } from '../lib/languages';

// A number with − / + buttons at its sides (typing works too): value, step, min, max, digits after the point.
function Stepper({ value, onChange, step = 1, min = 0, max = 100, digits = 0, width = 70, unit }) {
  const clamp = (n) => Math.max(min, Math.min(max, Number(n.toFixed(digits))));
  const cur = Number(value) || min;
  return (
    <span className="row stepper">
      <button type="button" className="icon-btn" title="−" disabled={cur <= min} onClick={() => onChange(clamp(cur - step))}><Icon name="minus" size={14} /></button>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(clamp(n)); }} style={{ width }} />
      <button type="button" className="icon-btn" title="+" disabled={cur >= max} onClick={() => onChange(clamp(cur + step))}><Icon name="plus" size={14} /></button>
      {unit && <span className="muted small">{unit}</span>}
    </span>
  );
}

function Check({ id, label, settings, onChange }) {
  return (
    <label className="check settings-check">
      <input type="checkbox" checked={!!settings[id]} onChange={(e) => onChange({ [id]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
}

export function SettingsDialog({ settings, encodings, shells = [], formatDir = '', onChange, onClose, tools: knownTools = null, onTools, embedded = false, initialTab = '' }) {
  useLanguage();
  const [tab, setTab] = useState((initialTab || 'general').split(':')[0]);
  useEffect(() => { if (initialTab) setTab(initialTab.split(':')[0]); }, [initialTab]);   // "tab:stamp" — asked for again while open
  const lang = getLanguage();
  const tabs = [['general', t('set_general')], ['theme', t('set_theme')], ['terminal', t('set_terminal')], ['format', t('set_format')], ['lint', t('set_lint_tab')]];
  // ── custom themes (settings › theme) ──
  const customList = (settings.customThemes || []).map((c) => ({ ...c, tokens: themeById(c.id).tokens, custom: true, labelEn: c.label }));
  const customCur = (settings.customThemes || []).find((c) => c.id === settings.theme) || null;
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  const setCustom = (list, theme) => { setCustomThemes(list); onChange({ customThemes: list, ...(theme ? { theme } : {}) }); };
  const addCustom = () => {
    const base = themeById(settings.theme);
    const id = `custom-${Date.now().toString(36)}`;
    setCustom([...(settings.customThemes || []), { id, label: `${lang === 'ko' ? base.label : base.labelEn} ${t('set_custom_copy')}`, mode: base.mode, colors: baseColorsOf(base) }], id);
  };
  const editCustom = (patch) => setCustom((settings.customThemes || []).map((c) => (c.id === settings.theme ? { ...c, ...patch } : c)));
  const removeCustom = () => setCustom((settings.customThemes || []).filter((c) => c.id !== settings.theme), 'midnight');
  // The formatters per language and which are installed: the list the app
  // already holds (looked up once at start, for the toolbar) is shown as it
  // is; the backend is only asked when there is none yet, or to look again.
  const [tools, setTools] = useState(knownTools);
  const [linters, setLinters] = useState(null);   // { language: [{ id, label, available }] } for the code checkers
  useEffect(() => { if (tab === 'lint' && !linters) call('lint.tools', { dir: formatDir }).then(setLinters).catch(() => setLinters({})); }, [tab, linters, formatDir]);
  const setLinter = (lang, id) => onChange({ linters: { ...(settings.linters || {}), [lang]: id } });
  const [rescan, setRescan] = useState(false);   // the next listing looks again instead of using the cached lookups (다시 찾기, after an install)
  useEffect(() => { if (knownTools && !tools && !rescan) setTools(knownTools); }, [knownTools]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [job, setJob] = useState(null);        // { tool, id } while a tool is being (re)installed from here
  const [installMsg, setInstallMsg] = useState(null);
  const [askReinstall, setAskReinstall] = useState(null);   // { lang, tool } — the tool is installed already: the user decides
  const [askReset, setAskReset] = useState(false);          // 기본값으로 되돌리기 asked
  // (Re)installs the tool chosen for a language. An installed one is only
  // replaced when the user chooses so (remove + fresh install).
  const installTool = async (lang, decided = null) => {
    const id = (settings.formatters || {})[lang];
    const list = (tools || {})[lang] || [];
    const tool = list.find((x) => x.id === id) || (id === 'auto' || !id ? list.find((x) => x.installable) : null);
    if (!tool) { setInstallMsg(t('inst_pick_first')); return; }
    if (!tool.installable) { setInstallMsg(tool.hint || t('inst_no_recipe', { tool: tool.id })); return; }
    setInstallMsg(null);
    if (tool.available && decided == null) { setAskReinstall({ lang, tool }); return; }
    let st;
    try { st = await call('install.start', { tool: tool.id, reinstall: tool.available && decided === 'reinstall' }); } catch (e) { st = { error: e.message }; }
    if (st.error) { setInstallMsg(st.error); return; }
    if (st.manual) { setInstallMsg(st.manual); return; }
    if (st.missing) { setInstallMsg(t('inst_missing_pm', { pm: st.missing, tool: tool.id })); return; }
    setJob({ tool: tool.id, id: st.id });
  };
  // onTools lets the app refresh its own copy (the toolbar label) after a rescan or install.
  useEffect(() => { if (tab === 'format' && !tools) { const again = rescan; setRescan(false); call('format.tools', { dir: formatDir, refresh: again }).then((r) => { setTools(r); if (onTools) onTools(r); }).catch(() => setTools({})); } }, [tab, tools, formatDir]);   // eslint-disable-line react-hooks/exhaustive-deps
  const setFormatter = (lang, id) => onChange({ formatters: { ...(settings.formatters || {}), [lang]: id } });
  // The folder picker is a native dialog on the desktop; the web version's fallback dialog would replace this one, so there the path is typed.
  const browseTermCwd = async () => { try { const p = await nativeDialog('openFolder', { defaultPath: settings.termCwd || undefined }); if (p) onChange({ termCwd: p }); } catch { /* cancelled */ } };
  return (
    <Dialog modal={false} embedded={embedded} title={t('settings_title')} icon="settings" kind="info" className="settings" width={980} onClose={onClose} onEnter={onClose}
      footer={<><button className="btn" onClick={() => setAskReset(true)} title={t('set_reset_tip')}>{t('set_reset')}</button><span className="spacer" /><button className="btn primary" onClick={onClose}>{t('ok')}</button></>}>
      <div className="settings-tabs">
        {tabs.map(([id, label]) => <button key={id} className={`settings-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'general' && (
        <div className="settings-cols">
          <div className="settings-col">
            <fieldset className="settings-group">
              <legend>{t('set_grp_ui')}</legend>
              <div className="form-grid settings-grid">
            <label>{t('set_language')}</label>
            <select value={settings.language} onChange={(e) => onChange({ language: e.target.value })}>
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
            <label>{t('set_font')}</label>
            <FontPicker value={settings.fontFamily} onChange={(f) => onChange({ fontFamily: f })} />
            <label>{t('set_font_size')}</label>
            <Stepper value={settings.fontSize} onChange={(n) => onChange({ fontSize: n })} min={8} max={40} unit="px" />
            <label>{t('set_line_height')}</label>
            <Stepper value={settings.lineHeight || 1.55} onChange={(n) => onChange({ lineHeight: n })} step={0.05} min={1} max={3} digits={2} />
            <label>{t('set_layout')}</label>
            <span className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <Check id="sidebarVisible" label={t('sidebar')} settings={settings} onChange={onChange} />
              <Check id="toolbarVisible" label={t('toolbar')} settings={settings} onChange={onChange} />
              <Check id="statusBarVisible" label={t('statusbar')} settings={settings} onChange={onChange} />
            </span>
              </div>
            </fieldset>
            <fieldset className="settings-group">
              <legend>{t('set_grp_session')}</legend>
              <div className="form-grid settings-grid">
            <label />
            <Check id="restoreSession" label={t('set_restore')} settings={settings} onChange={onChange} />
            <label />
            <Check id="confirmClose" label={t('set_confirm_close')} settings={settings} onChange={onChange} />
            <label />
            <Check id="reloadChangedFiles" label={t('set_reload')} settings={settings} onChange={onChange} />
            <label>{t('set_auto_save')}</label>
            <span className="row">
              <select value={settings.autoSave || 'off'} onChange={(e) => onChange({ autoSave: e.target.value })}>
                <option value="off">{t('set_auto_save_off')}</option>
                <option value="blur">{t('set_auto_save_blur')}</option>
                <option value="delay">{t('set_auto_save_delay')}</option>
              </select>
              {settings.autoSave === 'delay' && <><input type="number" min={1} max={600} value={settings.autoSaveDelay || 5} onChange={(e) => onChange({ autoSaveDelay: Math.max(1, Math.min(600, Number(e.target.value) || 5)) })} style={{ width: 70 }} /><span className="muted small">{t('set_seconds')}</span></>}
            </span>
            <label />
            <span className="muted small">{t('set_auto_save_hint')}</span>
              </div>
            </fieldset>
            <fieldset className="settings-group">
              <legend>{t('set_files')}</legend>
              <div className="form-grid settings-grid">
            <label>{t('set_default_enc')}</label>
            <select value={settings.defaultEncoding} onChange={(e) => onChange({ defaultEncoding: e.target.value })}>
              {encodings.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
            <label>{t('set_default_lang')}</label>
            <select value={settings.defaultLanguage || 'auto'} onChange={(e) => onChange({ defaultLanguage: e.target.value })}>
              <option value="auto">{t('lang_auto')}</option>
              <option value={PLAIN}>{t('lang_plain')}</option>
              {FEATURED_LANGUAGES.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <label>{t('set_default_eol')}</label>
            <select value={settings.defaultEol} onChange={(e) => onChange({ defaultEol: e.target.value })}>
              <option value="crlf">{t('eol_crlf')}</option>
              <option value="lf">{t('eol_lf')}</option>
              <option value="cr">{t('eol_cr')}</option>
            </select>
            <label>{t('set_eol_on_save')}</label>
            <select value={settings.eolOnSave || 'keep'} onChange={(e) => onChange({ eolOnSave: e.target.value })} title={t('set_eol_on_save_hint')}>
              <option value="keep">{t('set_eol_keep')}</option>
              <option value="lf">{t('set_eol_always', { eol: t('eol_lf') })}</option>
              <option value="crlf">{t('set_eol_always', { eol: t('eol_crlf') })}</option>
            </select>
            <label />
            <span className="muted small">{t('set_eol_on_save_hint')}</span>
            <label />
            <Check id="trimTrailingOnSave" label={t('set_trim')} settings={settings} onChange={onChange} />
            <label />
            <Check id="finalNewlineOnSave" label={t('set_final_nl')} settings={settings} onChange={onChange} />
            </div></fieldset>
            <fieldset className="settings-group">
              <legend>{t('set_grp_tree')}</legend>
              <div className="form-grid settings-grid">
            <label />
            <Check id="treeShowHidden" label={t('set_tree_hidden')} settings={settings} onChange={onChange} />
              </div>
            </fieldset>
          </div>
          <div className="settings-col">
            <fieldset className="settings-group">
              <legend>{t('set_grp_indent')}</legend>
              <div className="form-grid settings-grid">
            <label>{t('set_indent_with')}</label>
            <span className="row">
              <label className="check"><input type="radio" name="indent-with" checked={!!settings.insertSpaces} onChange={() => onChange({ insertSpaces: true })} /><span>{t('set_indent_spaces')}</span></label>
              <label className="check"><input type="radio" name="indent-with" checked={!settings.insertSpaces} onChange={() => onChange({ insertSpaces: false })} /><span>{t('set_indent_tabs')}</span></label>
            </span>
            <label>{t('set_tab_size')}</label>
            <Stepper value={settings.tabSize} onChange={(n) => onChange({ tabSize: n })} min={1} max={16} unit={t('set_tab_size_hint')} />
            <label />
            <Check id="autoIndent" label={t('set_auto_indent')} settings={settings} onChange={onChange} />
              </div>
            </fieldset>
            <fieldset className="settings-group">
              <legend>{t('set_grp_display')}</legend>
              <div className="form-grid settings-grid">
            <label />
            <Check id="wordWrap" label={t('set_word_wrap')} settings={settings} onChange={onChange} />
            <label />
            <Check id="lineNumbers" label={t('set_line_numbers')} settings={settings} onChange={onChange} />
            <label />
            <Check id="minimap" label={t('set_minimap')} settings={settings} onChange={onChange} />
            <label />
            <Check id="showWhitespace" label={t('set_show_ws')} settings={settings} onChange={onChange} />
            <label />
            <Check id="highlightActiveLine" label={t('set_active_line')} settings={settings} onChange={onChange} />
            <label />
            <Check id="foldGutter" label={t('set_fold')} settings={settings} onChange={onChange} />
              </div>
            </fieldset>
            <fieldset className="settings-group">
              <legend>{t('set_grp_assist')}</legend>
              <div className="form-grid settings-grid">
            <label />
            <Check id="autocomplete" label={t('set_autocomplete')} settings={settings} onChange={onChange} />
            <label />
            <Check id="autoCloseBrackets" label={t('set_auto_close')} settings={settings} onChange={onChange} />
            <label />
            <Check id="bracketMatching" label={t('set_bracket_match')} settings={settings} onChange={onChange} />
            <label />
            <Check id="spellCheck" label={t('set_spell')} settings={settings} onChange={onChange} />
            <label />
            <Check id="spellCodeAll" label={t('set_spell_code_all')} settings={settings} onChange={onChange} />
            <label />
            <Check id="lint" label={t('set_lint')} settings={settings} onChange={onChange} />
            </div></fieldset>
          </div>
        </div>
      )}
      {tab === 'theme' && (<>
        {/* one card per theme, grouped: dark · light · custom (★) */}
        {[['set_theme_dark', THEMES.filter((th) => th.mode === 'dark')], ['set_theme_light', THEMES.filter((th) => th.mode === 'light')], ['set_custom_themes', customList]].map(([title, list]) => (list.length > 0 && (
          <React.Fragment key={title}>
            <div className="settings-section theme-section">{t(title)} <span className="muted small">({list.length})</span></div>
            <div className="theme-grid">
              {list.map((th) => (
                <button type="button" key={th.id} className={`theme-card ${settings.theme === th.id ? 'active' : ''}`} onClick={() => onChange({ theme: th.id })}
                  style={{ background: th.tokens['--bg'], color: th.tokens['--fg'], borderColor: settings.theme === th.id ? th.tokens['--accent'] : th.tokens['--border'] || 'transparent' }}>
                  <span className="theme-sample" style={{ background: th.tokens['--bg-panel'] }}>
                    <span className="theme-bar" style={{ background: th.tokens['--bg-elev'] }}><span style={{ background: th.tokens['--accent'] }} /></span>
                    <span className="theme-line" style={{ background: th.tokens['--bg-sel'] }} />
                    <span className="theme-line" style={{ background: th.tokens['--syn-keyword'] || th.tokens['--fg-muted'] }} />
                    <span className="theme-line short" style={{ background: th.tokens['--syn-string'] || th.tokens['--fg-muted'] }} />
                  </span>
                  <span className="theme-name">{th.custom && <span className="theme-badge">★</span>}{lang === 'ko' ? th.label : th.labelEn}</span>
                </button>
              ))}
            </div>
          </React.Fragment>
        )))}
        {/* the custom theme editor is always shown: "+" adds a theme (a copy of the current one, made active), the
            fields edit the custom theme chosen in the list — choosing one makes it the active theme */}
        <div className="settings-section">{t('set_custom_themes')}</div>
        <div className="custom-theme">
          <div className="pe-quick">
            <button type="button" className="btn small" onClick={addCustom}><Icon name="plus" size={13} /> {t('set_custom_add', { name: themeLabel(settings.theme) })}</button>
            <select value={customCur ? customCur.id : ''} disabled={!customList.length} onChange={(e) => { if (e.target.value) onChange({ theme: e.target.value }); }} style={{ minWidth: 200 }}>
              {!customList.length && <option value="">{t('set_custom_none')}</option>}
              {(settings.customThemes || []).map((c) => <option key={c.id} value={c.id}>★ {c.label}</option>)}
            </select>
            <button type="button" className="btn small" disabled={!customCur} onClick={removeCustom}><Icon name="close" size={13} /> {t('set_custom_remove')}</button>
            {!customCur && <span className="muted small">{t('set_custom_hint')}</span>}
          </div>
          <div className={`custom-theme-fields ${customCur ? '' : 'disabled'}`}>
            <div className="form-grid settings-grid custom-theme-head">
              <label>{t('set_custom_name')}</label>
              <div className="row">
                <input value={customCur ? customCur.label : ''} disabled={!customCur} onChange={(e) => editCustom({ label: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                <select value={customCur ? customCur.mode : 'dark'} disabled={!customCur} onChange={(e) => editCustom({ mode: e.target.value })} style={{ flex: 'none', width: 160 }}>
                  <option value="dark">{t('set_custom_dark')}</option>
                  <option value="light">{t('set_custom_light')}</option>
                </select>
              </div>
            </div>
            <div className="custom-colors">
              {CUSTOM_COLOR_KEYS.map((k) => { const v = customCur ? customCur.colors[k] || '' : themeById(settings.theme).tokens[{ bg: '--bg', panel: '--bg-panel', raised: '--bg-elev', hover: '--bg-hover', active: '--bg-sel-inactive', border: '--border', borderStrong: '--border-strong', text: '--fg', textDim: '--fg-muted', accent: '--accent', accentStrong: '--accent-strong', accentText: '--accent-text', folder: '--folder', file: '--file', danger: '--danger' }[k]] || ''; return (
                <label key={k} className="custom-color">
                  <span className="muted small">{t(`set_color_${k}`)}</span>
                  <span className="pe-color">
                    <input type="color" disabled={!customCur} value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#888888'} onChange={(e) => editCustom({ colors: { ...customCur.colors, [k]: e.target.value } })} />
                    <input className="mono" disabled={!customCur} value={v} onChange={(e) => editCustom({ colors: { ...customCur.colors, [k]: e.target.value } })} spellCheck={false} />
                  </span>
                </label>
              ); })}
            </div>
          </div>
        </div>
      </>)}
      {tab === 'format' && (
        <div className="settings-format">
          <label className="check settings-check"><input type="checkbox" checked={!!settings.formatOnSave} onChange={(e) => onChange({ formatOnSave: e.target.checked })} /><span>{t('set_format_on_save')}</span></label>
          <p className="muted small">{t('set_format_hint')} <button className="btn small" onClick={() => { setRescan(true); setTools(null); }}>{t('fmt_rescan')}</button></p>
          {installMsg && <div className="danger small">{installMsg}</div>}
          <div className="format-grid">
            {!tools && <span className="muted small">…</span>}
            {tools && Object.entries(tools).map(([lang, list]) => (
              <React.Fragment key={lang}>
                <label>{lang}</label>
                <span className="row fmt-row">
                <select value={(settings.formatters || {})[lang] || 'auto'} onChange={(e) => setFormatter(lang, e.target.value)}>
                  <option value="auto">{t('fmt_auto', { tool: list.some((x) => x.available) ? toolLabel(list.find((x) => x.available)) : t('fmt_indent') })}</option>
                  {list.map((x) => <option key={x.id} value={x.id}>{toolLabel(x)}{x.available ? '' : ` — ${x.installable ? t('fmt_not_installed_auto') : t('fmt_not_installed_manual')}`}</option>)}
                  <option value="indent">{t('fmt_indent')}</option>
                  <option value="none">{t('fmt_none_opt')}</option>
                </select>
                {(() => { const id = (settings.formatters || {})[lang]; const x = list.find((y) => y.id === id) || (id === 'auto' || !id ? list.find((y) => y.installable) : null); return x && x.installable ? <button className="icon-btn" title={x.available ? t('inst_reinstall', { tool: x.id }) : t('inst_install', { tool: x.id })} onClick={() => installTool(lang)}><Icon name={x.available ? 'refresh' : 'download'} size={14} /></button> : null; })()}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {askReinstall && (
        <ConfirmDialog title={t('inst_already_title', { tool: askReinstall.tool.id })} message={t('inst_already_msg', { tool: askReinstall.tool.id })} icon="download" kind="info"
          buttons={[{ id: 'reinstall', label: t('inst_already_reinstall'), kind: 'primary' }, { id: 'keep', label: t('inst_already_keep') }, { id: 'cancel', label: t('cancel') }]}
          onResult={(r) => { const a = askReinstall; setAskReinstall(null); if (r === 'reinstall' || r === 'keep') installTool(a.lang, r); }} />
      )}
      {askReset && (
        <ConfirmDialog title={t('set_reset_title')} message={t('set_reset_msg')} icon="refresh" kind="info"
          buttons={[{ id: 'yes', label: t('set_reset_yes'), kind: 'primary' }, { id: 'cancel', label: t('cancel') }]}
          onResult={(r) => { setAskReset(false); if (r === 'yes') onChange(resetPatch()); }} />
      )}
      {job && <InstallDialog tool={job.tool} jobId={job.id} onResult={() => { setJob(null); setRescan(true); setTools(null); }} />}
      {tab === 'lint' && (
        <div className="settings-format">
          <label className="check settings-check"><input type="checkbox" checked={!!settings.lint} onChange={(e) => onChange({ lint: e.target.checked })} /><span>{t('set_lint')}</span></label>
          {/* the code checkers (lint): one dropdown per language — auto (the first installed), a tool, or off */}
          <p className="muted small">{t('set_linters_hint')} <button className="btn small" onClick={() => setLinters(null)}>{t('fmt_rescan')}</button></p>
          <div className="format-grid">
            {!linters && <span className="muted small">…</span>}
            {linters && Object.entries(linters).map(([lang, list]) => (
              <React.Fragment key={lang}>
                <label>{lang}</label>
                <span className="row fmt-row">
                  <select value={(settings.linters || {})[lang] || 'auto'} onChange={(e) => setLinter(lang, e.target.value)}>
                    <option value="auto">{t('fmt_auto', { tool: list.some((x) => x.available) ? list.find((x) => x.available).label : t('lint_none_installed') })}</option>
                    {list.map((x) => <option key={x.id} value={x.id}>{x.label}{x.available ? '' : ` — ${t('fmt_not_installed')}`}</option>)}
                    <option value="none">{t('fmt_none_opt')}</option>
                  </select>
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {tab === 'terminal' && (<>
        <div className="form-grid settings-grid settings-term">
          <label>{t('set_term_shell')}</label>
          <select value={settings.termShell || ''} onChange={(e) => onChange({ termShell: e.target.value })}>
            <option value="">{shells.length ? t('set_term_shell_default', { name: shells[0].label }) : t('set_term_shell_default', { name: '' })}</option>
            {shells.map((sh) => <option key={sh.id} value={sh.id}>{sh.label}</option>)}
          </select>
          <label>{t('set_term_cwd')}</label>
          <span className="row">
            <input type="text" className="mono" title={t('set_term_cwd_hint')} value={settings.termCwd || ''} placeholder={t('set_term_cwd_default')} spellCheck={false} onChange={(e) => onChange({ termCwd: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
            {isElectron && <button className="btn" onClick={browseTermCwd} style={{ flex: 'none', whiteSpace: 'nowrap' }}>{t('set_browse')}</button>}
          </span>
        </div>
        <div className="settings-section">{t('set_prompt')}</div>
        <PromptEditor value={settings.prompt} onChange={(cfg) => onChange({ prompt: cfg })} custom={settings.customPrompts || []} onCustomChange={(list, cfg) => onChange({ customPrompts: list, ...(cfg ? { prompt: cfg } : {}) })} />
      </>)}
    </Dialog>
  );
}

export default SettingsDialog;
