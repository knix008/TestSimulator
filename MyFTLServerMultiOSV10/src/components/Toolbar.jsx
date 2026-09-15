// The top bar of the frameless window — it replaces the OS title bar:
//   left   app icon + name, the profile combo with 저장 / 삭제 (the server
//          state is shown by the ▶/■ button underneath, not here)
//   right  theme picker (split button: main part cycles, caret lists all 16),
//          language toggle (the flag of the language you switch TO), Settings,
//          Info, and — in the desktop app — minimize / maximize / close.
// The bar is the window's drag region; every control opts out of dragging.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES, themeById, nextThemeId } from '../themes';
import { isElectron, windowControl, onMaximized } from '../lib/backend';
import { Icon, Flag } from './Icons';
import { ContextMenu } from './ContextMenu';

function WindowButtons() {
  const [max, setMax] = useState(false);
  useEffect(() => onMaximized(setMax), []);
  return (
    <span className="win-buttons">
      <button className="win-btn" title={t('win_minimize')} aria-label={t('win_minimize')} onClick={() => windowControl('minimize')}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
      <button className="win-btn" title={max ? t('win_restore') : t('win_maximize')} aria-label={max ? t('win_restore') : t('win_maximize')} onClick={() => windowControl('maximize')}>
        {max
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><path d="M2.5 2.5V.5h7v7h-2" /><rect x=".5" y="2.5" width="7" height="7" /></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x=".5" y=".5" width="9" height="9" /></svg>}
      </button>
      <button className="win-btn win-close" title={t('win_close')} aria-label={t('win_close')} onClick={() => windowControl('close')}>
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.1"><path d="M.5.5l9 9M9.5.5l-9 9" /></svg>
      </button>
    </span>
  );
}

export function Toolbar({ onAction, theme, profiles, profileName, onPickProfile, onSaveProfile, onDeleteProfile, busy }) {
  useLanguage();
  const [themeMenu, setThemeMenu] = useState(null);
  const lang = getLanguage();
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  const themeItems = THEMES.map((th) => ({
    id: `theme:${th.id}`,
    label: lang === 'ko' ? th.label : th.labelEn,
    checked: th.id === theme,
    swatch: th.tokens['--accent'],
    swatchBg: th.tokens['--bg'],
  }));
  const onDouble = (e) => { if (isElectron && !e.target.closest('button, select, input, .tb-profile')) windowControl('maximize'); };
  return (
    <div className="toolbar" onDoubleClick={onDouble}>
      <img src="./icon.svg" alt="" width={20} height={20} className="tb-logo" />
      <span className="tb-title">{t('appName')}</span>
      <span className="tb-sep" />
      <span className="tb-profile">
        <span className="tb-label">{t('profile')}</span>
        <select value={profileName} onChange={(e) => onPickProfile(e.target.value)} disabled={busy} title={t('tip_profile_select')}>
          <option value="">{profiles.length ? t('profile_select') : t('profile_none')}</option>
          {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="tb-btn" onClick={onSaveProfile} title={t('tip_profile_save')} disabled={busy}><Icon name="save" /><span>{t('profile_save')}</span></button>
        <button className="tb-btn" onClick={onDeleteProfile} title={t('tip_profile_delete')} disabled={busy || !profileName}><Icon name="trash" /><span>{t('profile_delete')}</span></button>
      </span>
      <span className="tb-spacer" />
      <span className="tb-split">
        <button className="tb-btn tb-split-main" title={t('tip_next_theme', { theme: themeLabel(nextThemeId(theme)) })} onClick={() => onAction('nextTheme')}>
          <Icon name="palette" /><span>{themeLabel(theme)}</span>
        </button>
        <button className="tb-btn tb-split-caret" title={t('tip_theme')} aria-label={t('tip_theme')} onClick={(e) => setThemeMenu(themeMenu ? null : e.currentTarget)}>
          <Icon name="chevronDown" size={14} />
        </button>
      </span>
      <button className="tb-btn tb-icon-only" title={lang === 'ko' ? 'Switch to English' : '한국어로 전환'} aria-label={t('tip_language')} onClick={() => onAction('toggleLanguage')}>
        <Flag country={lang === 'ko' ? 'gb' : 'kr'} width={22} />
      </button>
      <button className="tb-btn" title={t('tip_settings')} onClick={() => onAction('settings')}>
        <Icon name="settings" /><span>{t('settings')}</span>
      </button>
      <span className="tb-sep" />
      <button className="tb-btn" title={t('tip_about')} onClick={() => onAction('about')}>
        <Icon name="info" /><span>{t('menu_info')}</span>
      </button>
      {isElectron && <><span className="tb-sep" /><WindowButtons /></>}
      {themeMenu && (
        <ContextMenu anchorEl={themeMenu} x={0} y={0} items={themeItems} onClose={() => setThemeMenu(null)}
          onPick={(id) => { setThemeMenu(null); onAction(id); }} />
      )}
    </div>
  );
}

export default Toolbar;
