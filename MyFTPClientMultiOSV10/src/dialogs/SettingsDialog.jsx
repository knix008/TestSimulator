// Settings (⚙ on the toolbar). Values live in the session file; App applies
// them when the dialog is confirmed. The window is a fixed size with tabs so
// the form never needs a scrollbar.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { THEMES, themeById, themeSwatchStyle, applyTheme, DEFAULT_THEME } from '../themes';
import { DialogFrame } from './Dialogs';
import { ContextMenu } from '../components/ContextMenu';
import { Icon } from '../components/Icons';
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
  { id: 'terminal', label: 'set_tab_terminal' },
  { id: 'transfer', label: 'set_tab_transfer' },
];

export function SettingsDialog({ spec, done }) {
  const lang = useLanguage();
  const localDir = spec.localDir || '';
  const [tab, setTab] = useState('general');
  const [promptShell, setPromptShell] = useState('powershell');
  const [v, setV] = useState({
    ...SETTINGS_DEFAULTS,
    ...(spec.values || {}),
    lastLocalPath: localDir || (spec.values && spec.values.lastLocalPath) || '',
    shellPrompts: { ...DEFAULT_SHELL_PROMPTS, ...((spec.values && spec.values.shellPrompts) || {}) },
  });
  const [themeEl, setThemeEl] = useState(null);
  const [shells, setShells] = useState(FALLBACK_PROMPT_SHELLS);
  const [fonts, setFonts] = useState([]);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const setPrompt = (id, val) => setV((s) => ({
    ...s,
    shellPrompts: { ...(s.shellPrompts || {}), [id]: val },
  }));
  const currentTheme = themeById(v.theme);
  const themeName = lang === 'ko' ? currentTheme.label : currentTheme.labelEn;
  const initialTheme = (spec.values && spec.values.theme) || DEFAULT_THEME;
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
  const notifyTheme = (id) => {
    const theme = applyTheme(id);
    if (typeof spec.onPreviewTheme === 'function') spec.onPreviewTheme(theme.id, theme);
    const electron = typeof window !== 'undefined' ? window.myFtpClient : null;
    if (electron && electron.broadcastAppearance) {
      const from = spec.values || {};
      electron.broadcastAppearance({
        theme: theme.id,
        language: v.language || from.language,
        fontSize: v.fontSize || from.fontSize,
        bg: theme.tokens['--bg'],
      }).catch(() => {});
    }
    return theme;
  };
  const cancel = () => {
    notifyTheme(initialTheme);
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

  const pickFolder = async (key) => {
    try {
      const r = await call('local.pickFolder', { start: v[key] || localDir });
      if (r && r.path) set(key, r.path);
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
              <button type="button" className="theme-select-btn" title={t('set_theme')}
                onClick={(e) => setThemeEl((el) => (el ? null : e.currentTarget))}>
                <span className="theme-swatch" style={themeSwatchStyle(currentTheme)} />
                <span className="ellipsis">{themeName}</span>
                <Icon name="chevronDown" size={14} />
              </button>

              <label>{t('set_font_size')}</label>
              <select value={v.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>
                {[11, 12, 13, 14, 15, 16, 18].map((n) => <option key={n} value={n}>{n} px</option>)}
              </select>

              <label>{t('set_local_cwd')}</label>
              <div className="path-pick">
                <input type="text" value={v.lastLocalPath || ''} placeholder={t('set_local_cwd_placeholder')}
                  onChange={(e) => set('lastLocalPath', e.target.value)} title={t('set_local_cwd_hint')} />
                {canPick && (
                  <button type="button" className="btn icon" title={t('set_local_cwd_browse')} onClick={() => pickFolder('lastLocalPath')}>
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
            </>
          )}

          {tab === 'terminal' && (
            <>
              <label>{t('set_term_cwd')}</label>
              <div className="path-pick">
                <input type="text" value={v.terminalStartDir || ''} placeholder={t('set_term_cwd_placeholder')}
                  onChange={(e) => set('terminalStartDir', e.target.value)} title={t('set_term_cwd_hint')} />
                {canPick && (
                  <button type="button" className="btn icon" title={t('set_term_cwd_browse')} onClick={() => pickFolder('terminalStartDir')}>
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
      {themeEl && (
        <ContextMenu className="theme-pick" anchorEl={themeEl} x={0} y={0}
          items={THEMES.map((th) => ({
            id: th.id,
            label: lang === 'ko' ? th.label : th.labelEn,
            checked: th.id === currentTheme.id,
            swatch: th.tokens['--accent'],
            swatchBg: th.tokens['--bg'],
          }))}
          onClose={() => setThemeEl(null)}
          onPick={(id) => { notifyTheme(id); set('theme', id); setThemeEl(null); }} />
      )}
    </DialogFrame>
  );
}
