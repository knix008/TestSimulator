// The top bar of the frameless window — it replaces the OS title bar:
//   left   the brand (icon + name + version — dragging them moves the window,
//          double-click maximizes) and, immediately to the right of the version,
//          the start-page toggle, the connection badge, the
//          profile combo with 저장 / 삭제 (moved here from the connection bar)
//   right  swap server/local sides, collapse / expand the bottom panel (labeled,
//          pressed while the panel is open), terminal view,
//          theme picker (split: main cycles, caret opens the theme window),
//          language toggle (the flag of the language you switch TO), Settings,
//          the user guide (its own window), Info, and — in the desktop app —
//          minimize / maximize / close.
// The bar is the window's drag region (backend.installWindowDrag); every
// control opts out of dragging.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { themeById, nextThemeId, customThemeDefs } from '../themes';
import { isDesktop, windowControl, onMaximized, openThemeMenu, onThemeMenu, shouldWindowDrag, startWindowDrag } from '../lib/backend';
import { Icon, Flag } from './Icons';
import { ThemePopup } from './ThemePopup';
import { DropDown } from './DropDown';

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

export function Toolbar({ onAction, theme, connection, profiles, profileName, onPickProfile, onSaveProfile, onDeleteProfile, busy, terminalView, dockCollapsed = false, fontSize, startOpen = false, version = '' }) {
  useLanguage();
  const [themeMenu, setThemeMenu] = useState(null);
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  useEffect(() => onThemeMenu({ onPick: (id) => actionRef.current(id) }), []);
  const lang = getLanguage();
  const size = Math.max(8, Math.min(32, Number(fontSize) || 13));
  const themeLabel = (id) => { const th = themeById(id); return th.custom ? th.label : (lang === 'ko' ? th.label : th.labelEn); };
  const openThemes = (e) => {
    const button = e.currentTarget;
    if (isDesktop) {
      const th = themeById(theme);
      openThemeMenu(button, {
        current: theme,
        language: getLanguage(),
        fontSize: size,
        customThemes: customThemeDefs(),
        bg: th.tokens['--bg'],
      }).catch(() => {});
      return;
    }
    setThemeMenu((el) => (el ? null : button));
  };
  // A press on the icon, the name, the version or any empty part of the bar
  // moves the window. Double-click there toggles maximize. Controls do neither.
  const onDown = (e) => {
    if (e.button !== 0 || e.detail !== 1 || !shouldWindowDrag(e.target)) return;
    e.stopPropagation();
    startWindowDrag(e);
  };
  const onDouble = (e) => { if (isDesktop && shouldWindowDrag(e.target)) windowControl('maximize'); };
  return (
    <div className="toolbar" onMouseDown={onDown} onDoubleClick={onDouble}>
      <div className="tb-main">
      <span className="tb-brand">
        <img src="./icon.svg" alt="" width={20} height={20} className="tb-logo" />
        <span className="tb-title">{t('appTitle')}</span>
        {version && <span className="tb-version">v{version}</span>}
        <button className={`tb-btn tb-start${startOpen ? ' active' : ''}`} title={t('tip_start_page')} aria-label={t('home')} aria-pressed={startOpen} onClick={() => onAction('toggleStart')}>
          <Icon name="home" /><span>{t('home')}</span>
        </button>
      </span>
      <span className="tb-sep" />
      {connection && (
        <span className="tb-conn" title={`${connection.protocol}://${connection.user ? `${connection.user}@` : ''}${connection.host}:${connection.port}`}>
          <span className="tb-conn-dot" />
          <span className="ellipsis">{connection.protocol.toLowerCase()}://{connection.host}:{connection.port}</span>
        </span>
      )}
      <span className="tb-sep" />
      <span className="tb-profile">
        <DropDown value={profileName} onChange={onPickProfile} disabled={busy} title={t('profile_select')} ariaLabel={t('profile_select')}
          options={[{ value: '', label: profiles.length ? t('profile_select') : t('profile_none') }, ...profiles.map((p) => ({ value: p.name, label: p.name }))]} />
        <button className="tb-btn" onClick={onSaveProfile} title={t('tip_profile_save')} disabled={busy}><Icon name="save" /><span>{t('profile_save')}</span></button>
        <button className="tb-btn" onClick={onDeleteProfile} title={t('tip_profile_delete')} disabled={busy}><Icon name="trash" /><span>{t('profile_delete')}</span></button>
      </span>
      <span className="tb-spacer" />
      <button className="tb-btn" title={t('tip_swap_panels')} aria-label={t('swap_panels')} onClick={() => onAction('swapPanels')}>
        <Icon name="swap" /><span>{t('swap_panels')}</span>
      </button>
      <button className={`tb-btn${dockCollapsed ? '' : ' active'}`} title={t(dockCollapsed ? 'tip_dock_expand' : 'tip_dock_collapse')} aria-label={t(dockCollapsed ? 'dock_expand' : 'dock_collapse')} aria-pressed={!dockCollapsed} onClick={() => onAction('toggleDock')}>
        <Icon name="panelBottom" /><span>{t(dockCollapsed ? 'dock_expand' : 'dock_collapse')}</span>
      </button>
      <button className={`tb-btn${terminalView ? ' selected' : ''}`} title={t('tip_term_view')} onClick={() => onAction('terminal')} aria-pressed={!!terminalView}>
        <Icon name="terminal" /><span>{t('term_view')}</span>
      </button>
      <span className="tb-font" title={t('tip_font_size', { n: size })}>
        <button className="tb-btn tb-icon-only" title={t('tip_font_dec')} aria-label={t('tip_font_dec')}
          disabled={size <= 8} onClick={() => onAction('fontDec')}>
          <Icon name="fontDecrease" />
        </button>
        <span className="tb-font-size" aria-live="polite">{size}px</span>
        <button className="tb-btn tb-icon-only" title={t('tip_font_inc')} aria-label={t('tip_font_inc')}
          disabled={size >= 32} onClick={() => onAction('fontInc')}>
          <Icon name="fontIncrease" />
        </button>
      </span>
      <span className="tb-split">
        <button className="tb-btn tb-split-main" title={t('tip_next_theme', { theme: themeLabel(nextThemeId(theme)) })} onClick={() => onAction('nextTheme')}>
          <Icon name="palette" /><span className="tb-theme-label">{themeLabel(theme)}</span>
        </button>
        <button className="tb-btn tb-split-caret" title={t('tip_theme')} aria-label={t('tip_theme')} aria-haspopup="menu" onClick={openThemes}>
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
      <button className="tb-btn" title={t('tip_manual')} onClick={() => onAction('manual')}>
        <Icon name="book" /><span>{t('manual')}</span>
      </button>
      <button className="tb-btn" title={t('tip_about')} onClick={() => onAction('about')}>
        <Icon name="info" /><span>{t('menu_info')}</span>
      </button>
      </div>
      {isDesktop && <><span className="tb-sep" /><WindowButtons /></>}
      {themeMenu && (
        <ThemePopup anchorEl={themeMenu} current={theme} onClose={() => setThemeMenu(null)}
          onPick={(id) => { setThemeMenu(null); onAction(id); }} />
      )}
    </div>
  );
}

export default Toolbar;
