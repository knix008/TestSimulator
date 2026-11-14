// Settings (⚙ on the toolbar). Values live in the session file; App applies
// them when the dialog is confirmed. The window is a fixed size. The theme
// tab scrolls its own list; the other tabs fit without a scrollbar.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call, pickFolder, broadcastAppearance } from '../lib/backend';
import { appearanceOf } from '../lib/appearance';
import { themeById, themeSwatchStyle, applyTheme, setCustomThemes, buildCustomTheme, baseColorsOf, CUSTOM_COLOR_KEYS, DEFAULT_THEME } from '../themes';
import { DialogFrame } from './Dialogs';
import { Icon } from '../components/Icons';
import { ThemeColumns, ThemeItem, themeName } from '../components/ThemeGrid';
import { SETTINGS_DEFAULTS, DEFAULT_SHELL_PROMPTS, defaultPromptFor } from '../lib/settings';

const FALLBACK_PROMPT_SHELLS = [
  { id: 'cmd', kind: 'cmd', label: 'Command Prompt', labelKo: '명령 프롬프트' },
  { id: 'powershell', kind: 'powershell', label: 'Windows PowerShell', labelKo: 'Windows PowerShell' },
  { id: 'git-bash', kind: 'posix', label: 'Git Bash', labelKo: 'Git Bash' },
  { id: 'posix', kind: 'posix', label: 'POSIX', labelKo: 'POSIX' },
  { id: 'wsl', kind: 'wsl', label: 'WSL', labelKo: 'WSL' },
];

const TABS = [
  { id: 'general', label: 'set_tab_general' },
  { id: 'theme', label: 'set_tab_theme' },
  { id: 'terminal', label: 'set_tab_terminal' },
  { id: 'transfer', label: 'set_tab_transfer' },
];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** A new custom theme: the base colours of `base` under a fresh id. */
export function customFrom(base, lang) {
  return {
    id: `custom-${Date.now().toString(36)}`,
    label: `${themeName(base, lang)} ${t('set_custom_copy')}`,
    mode: base.mode,
    colors: baseColorsOf(base),
  };
}

function CustomThemeEditor({ customs, current, onPick, onChange, lang }) {
  const cards = customs.filter((c) => c && c.id && c.colors).map(buildCustomTheme);
  const cur = customs.find((c) => c.id === current) || null;
  const curTheme = cards.find((th) => th.id === current) || themeById(current);
  const shown = cur ? cur.colors : baseColorsOf(curTheme);
  const edit = (patch) => onChange(customs.map((c) => (c.id === cur.id ? { ...c, ...patch } : c)), cur.id);
  const add = () => { const c = customFrom(curTheme, lang); onChange([...customs, c], c.id); };
  const remove = () => onChange(customs.filter((c) => c.id !== cur.id), DEFAULT_THEME);
  const setColor = (k, value) => edit({ colors: { ...cur.colors, [k]: value } });
  return (
    <section className="theme-group custom-theme">
      <div className="theme-group-title"><Icon name="star" size={13} />{t('set_custom_themes')} <span className="muted">({customs.length})</span></div>
      <div className="custom-theme-row">
        <div className="theme-list custom">
          {customs.length
            ? cards.map((th) => <ThemeItem key={th.id} theme={th} active={th.id === current} onPick={onPick} />)
            : <span className="muted small">{t('set_custom_hint')}</span>}
        </div>
        <button type="button" className="btn small" onClick={add} title={t('tip_theme_new_custom')}><Icon name="plus" size={13} />{t('set_custom_add', { name: themeName(curTheme, lang) })}</button>
        <button type="button" className="btn small" disabled={!cur} onClick={remove}><Icon name="trash" size={13} />{t('set_custom_remove')}</button>
      </div>
      <div className={`custom-theme-fields ${cur ? '' : 'disabled'}`}>
        <div className="custom-theme-head">
          <label>{t('set_custom_name')}</label>
          <input type="text" value={cur ? cur.label : ''} disabled={!cur} maxLength={40} onChange={(e) => edit({ label: e.target.value })} />
          <select value={cur ? cur.mode : curTheme.mode} disabled={!cur} onChange={(e) => edit({ mode: e.target.value })}>
            <option value="dark">{t('set_theme_dark')}</option>
            <option value="light">{t('set_theme_light')}</option>
          </select>
        </div>
        <div className="custom-colors">
          {CUSTOM_COLOR_KEYS.map((k) => {
            const value = shown[k] || '';
            return (
              <label key={k} className="custom-color" title={t(`set_color_${k}`)}>
                <span className="custom-color-name">{t(`set_color_${k}`)}</span>
                <input type="color" disabled={!cur} value={HEX.test(value) ? value : '#888888'} onChange={(e) => setColor(k, e.target.value)} />
                <input type="text" className="mono" disabled={!cur} value={value} spellCheck={false} onChange={(e) => setColor(k, e.target.value)} />
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function SettingsDialog({ spec, done }) {
  const lang = useLanguage();
  const localDir = spec.localDir || '';
  const [tab, setTab] = useState(TABS.some((item) => item.id === spec.tab) ? spec.tab : 'general');
  const [promptShell, setPromptShell] = useState('powershell');
  const initialLook = useRef({
    theme: (spec.values && spec.values.theme) || DEFAULT_THEME,
    customs: Array.isArray(spec.values && spec.values.customThemes) ? spec.values.customThemes : [],
  });
  const [v, setV] = useState(() => {
    const s = {
      ...SETTINGS_DEFAULTS,
      ...(spec.values || {}),
      customThemes: Array.isArray(spec.values && spec.values.customThemes) ? spec.values.customThemes : [],
      lastLocalPath: localDir || (spec.values && spec.values.lastLocalPath) || '',
      shellPrompts: { ...DEFAULT_SHELL_PROMPTS, ...((spec.values && spec.values.shellPrompts) || {}) },
    };
    setCustomThemes(s.customThemes);
    if (spec.newCustom) {
      const made = customFrom(themeById(s.theme), lang);
      s.customThemes = [...s.customThemes, made];
      s.theme = made.id;
      setCustomThemes(s.customThemes);
    }
    return s;
  });
  const [shells, setShells] = useState(FALLBACK_PROMPT_SHELLS);
  const [fonts, setFonts] = useState([]);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const setPrompt = (id, val) => setV((s) => ({
    ...s,
    shellPrompts: { ...(s.shellPrompts || {}), [id]: val },
  }));
  const currentTheme = themeById(v.theme);
  const themeLabel = themeName(currentTheme, lang);
  const canPick = !!spec.canPickFolder;
  useEffect(() => {
    let alive = true;
    call('terminal.shells').then((r) => {
      if (!alive || !r || !Array.isArray(r.shells) || !r.shells.length) return;
      setShells(r.shells);
    }).catch(() => {});
    call('app.fonts').then((r) => {
      if (!alive || !r || !Array.isArray(r.fonts)) return;
      setFonts(r.fonts);
      setV((s) => {
        if (s.terminalFont) return s;
        return { ...s, terminalFont: r.defaultFamily || r.fonts[0] || '' };
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!shells.length) return;
    if (!shells.some((sh) => sh.id === promptShell)) setPromptShell(shells[0].id);
  }, [shells, promptShell]);
  const publishLook = (themeId, customs) => {
    setCustomThemes(customs);
    const theme = applyTheme(themeId);
    if (typeof spec.onPreviewTheme === 'function') spec.onPreviewTheme(theme.id, theme);
    const from = spec.values || {};
    broadcastAppearance({
      ...appearanceOf({ theme: theme.id, language: v.language || from.language, fontSize: v.fontSize || from.fontSize }),
      customThemes: customs,
    });
    return theme;
  };
  useEffect(() => {
    publishLook(v.theme, Array.isArray(v.customThemes) ? v.customThemes : []);
  }, [v.theme, v.customThemes]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = () => {
    publishLook(initialLook.current.theme, initialLook.current.customs);
    done(null);
  };
  const submit = (e) => {
    if (e) e.preventDefault();
    const shellPrompts = { ...DEFAULT_SHELL_PROMPTS, ...(v.shellPrompts || {}) };
    const ps = String(shellPrompts.powershell || '').trim() || DEFAULT_SHELL_PROMPTS.powershell;
    done({
      ...v,
      terminalStartDir: String(v.terminalStartDir || '').trim(),
      lastLocalPath: String(v.lastLocalPath || '').trim(),
      shellPrompts,
      powershellPrompt: ps,
      terminalFont: String(v.terminalFont || '').replace(/[\r\n"'\\;]/g, '').trim().slice(0, 80),
      terminalFontSize: Math.max(8, Math.min(32, Math.round(Number(v.terminalFontSize)) || 13)),
      terminalMaxLines: Math.max(500, Math.min(100000, Math.round(Number(v.terminalMaxLines)) || 10000)),
    });
  };

  const browseFolder = async (key) => {
    try {
      const picked = await pickFolder(v[key] || localDir);
      if (picked) set(key, picked);
    } catch { /* web host has no native picker */ }
  };
  const prompts = v.shellPrompts || {};
  const fontOptions = (() => {
    const cur = String(v.terminalFont || '').trim();
    const list = Array.isArray(fonts) ? fonts.slice() : [];
    if (cur && !list.some((n) => n.toLowerCase() === cur.toLowerCase())) list.unshift(cur);
    return list;
  })();
  const activeShell = shells.find((sh) => sh.id === promptShell) || shells[0];
  const activePrompt = activeShell
    ? (prompts[activeShell.id] != null ? prompts[activeShell.id] : defaultPromptFor(activeShell))
    : '';

  return (
    <DialogFrame title={t('settings_title')} onClose={cancel} icon="settings" width={540} fill
      className="settings-dlg"
      footer={<>
        <button className="btn" onClick={cancel}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('ok')}</button>
      </>}>
      <div className="settings-wrap">
        <div className="settings-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`settings-tab${tab === item.id ? ' active' : ''}`}
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="form-grid settings-grid settings-pane">
          {tab === 'general' && (
            <>
              <label>{t('set_language')}</label>
              <select value={v.language} onChange={(e) => set('language', e.target.value)}>
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>

              <label>{t('set_theme')}</label>
              <button type="button" className="theme-select-btn" title={t('set_theme')} onClick={() => setTab('theme')}>
                <span className="theme-swatch" style={themeSwatchStyle(currentTheme)} />
                <span className="ellipsis">{themeLabel}</span>
                <Icon name="chevronDown" size={14} />
              </button>

              <label>{t('set_font_size')}</label>
              <select value={v.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>
                {[11, 12, 13, 14, 15, 16, 18].map((n) => <option key={n} value={n}>{n} px</option>)}
              </select>

              <label>{t('set_panel_side')}</label>
              <select value={v.serverOnLeft === false ? 'right' : 'left'} title={t('set_panel_side_hint')} onChange={(e) => set('serverOnLeft', e.target.value === 'left')}>
                <option value="left">{t('set_server_left')}</option>
                <option value="right">{t('set_server_right')}</option>
              </select>

              <label>{t('set_local_cwd')}</label>
              <div className="path-pick">
                <input type="text" value={v.lastLocalPath || ''} placeholder={t('set_local_cwd_placeholder')}
                  onChange={(e) => set('lastLocalPath', e.target.value)} title={t('set_local_cwd_hint')} />
                {canPick && (
                  <button type="button" className="btn icon" title={t('set_local_cwd_browse')} onClick={() => browseFolder('lastLocalPath')}>
                    <Icon name="folder" size={14} />
                  </button>
                )}
              </div>

              <span />
              <label className="check"><input type="checkbox" checked={!!v.confirmDelete} onChange={(e) => set('confirmDelete', e.target.checked)} /> {t('set_confirm_delete')}</label>
              <span />
              <label className="check"><input type="checkbox" checked={!!v.restoreLocalPath} onChange={(e) => set('restoreLocalPath', e.target.checked)} /> {t('set_restore_local')}</label>
              <span />
              <label className="check"><input type="checkbox" checked={!!v.sounds} onChange={(e) => set('sounds', e.target.checked)} /> {t('set_sounds')}</label>
              <span />
              <label className="check"><input type="checkbox" checked={!!v.showConnectedDialog} onChange={(e) => set('showConnectedDialog', e.target.checked)} /> {t('set_connected_dialog')}</label>
              <span />
              <label className="check" title={t('set_show_start_hint')}><input type="checkbox" checked={v.showStartOnLaunch !== false} onChange={(e) => set('showStartOnLaunch', e.target.checked)} /> {t('set_show_start')}</label>
            </>
          )}

          {tab === 'theme' && (
            <div className="settings-themes">
              <CustomThemeEditor
                customs={Array.isArray(v.customThemes) ? v.customThemes : []}
                current={v.theme}
                lang={lang}
                onPick={(id) => set('theme', id)}
                onChange={(list, theme) => setV((s) => ({ ...s, customThemes: list, theme: theme || s.theme }))}
              />
              <ThemeColumns current={v.theme} onPick={(id) => set('theme', id)} />
            </div>
          )}

          {tab === 'terminal' && (
            <>
              <label>{t('set_term_cwd')}</label>
              <div className="path-pick">
                <input type="text" value={v.terminalStartDir || ''} placeholder={t('set_term_cwd_placeholder')}
                  onChange={(e) => set('terminalStartDir', e.target.value)} title={t('set_term_cwd_hint')} />
                {canPick && (
                  <button type="button" className="btn icon" title={t('set_term_cwd_browse')} onClick={() => browseFolder('terminalStartDir')}>
                    <Icon name="folder" size={14} />
                  </button>
                )}
              </div>

              <label>{t('set_term_font')}</label>
              <select value={v.terminalFont || ''} onChange={(e) => set('terminalFont', e.target.value)} title={t('set_term_font_hint')}
                style={{ fontFamily: v.terminalFont ? `"${String(v.terminalFont).replace(/"/g, '')}"` : undefined }}>
                {fontOptions.map((name) => (
                  <option key={name} value={name} style={{ fontFamily: `"${String(name).replace(/"/g, '')}"` }}>{name}</option>
                ))}
              </select>

              <label>{t('set_term_font_size')}</label>
              <input type="number" min={8} max={32} step={1} value={v.terminalFontSize || 13}
                onChange={(e) => set('terminalFontSize', Number(e.target.value))} title={t('set_term_font_hint')} />

              <label>{t('set_term_lines')}</label>
              <input type="number" min={500} max={100000} step={500} value={v.terminalMaxLines || 10000}
                onChange={(e) => set('terminalMaxLines', Number(e.target.value))} title={t('set_term_lines_hint')} />

              <label>{t('set_term_prompt_shell')}</label>
              <select value={activeShell ? activeShell.id : ''} onChange={(e) => setPromptShell(e.target.value)}>
                {shells.map((sh) => (
                  <option key={sh.id} value={sh.id}>{lang === 'ko' ? (sh.labelKo || sh.label) : sh.label}</option>
                ))}
              </select>

              <label>{t('set_term_prompts')}</label>
              <input className="settings-prompt" type="text"
                value={activePrompt}
                placeholder={activeShell ? defaultPromptFor(activeShell) : ''}
                title={t('set_term_prompts_hint')}
                onChange={(e) => activeShell && setPrompt(activeShell.id, e.target.value)} />
            </>
          )}

          {tab === 'transfer' && (
            <>
              <label>{t('set_transfer_concurrency')}</label>
              <select value={Number(v.transferConcurrency) || 3} onChange={(e) => set('transferConcurrency', Number(e.target.value))} title={t('set_transfer_concurrency_hint')}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>

              <span />
              <label className="check"><input type="checkbox" checked={v.skipUnchanged !== false} onChange={(e) => set('skipUnchanged', e.target.checked)} /> {t('set_skip_unchanged')}</label>
            </>
          )}
        </form>
      </div>
    </DialogFrame>
  );
}
