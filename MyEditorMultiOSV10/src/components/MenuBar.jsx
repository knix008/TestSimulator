// The top of the window, three rows:
//   title bar  — replaces the OS title bar of the frameless window: app icon
//                + name and, in the desktop app, minimize / maximize / close;
//                the window's drag region (double-click maximizes)
//   menu bar   — the menus (파일 · 편집 · 찾기 · 보기 · 언어 · 인코딩 · 도움말, each
//                with an icon); they open on click and switch on hover while
//                one is open, like a native menu bar
//   toolbar    — Toolbar.jsx
// Both bars are rendered here (MenuBar).
//
// AppControls — theme picker (split button: main part cycles, caret lists
// all 16), language toggle (the flag of the language you switch TO),
// Settings and Info — sit at the right end of the toolbar row (Toolbar.jsx),
// or here when the toolbar is hidden.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES, themeById, nextThemeId } from '../themes';
import { isElectron, windowControl, onMaximized, syncWindowMinWidth } from '../lib/backend';
import { Icon, Flag } from './Icons';
import { ContextMenu } from './ContextMenu';
import { Widest } from './Widest';

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

export function AppControls({ onAction, theme, compact = false }) {   // compact: icons only for Settings / Info (toolbar row)
  useLanguage();
  const [themeMenu, setThemeMenu] = useState(null);
  const lang = getLanguage();
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  const themeItems = THEMES.map((th) => ({ id: `theme:${th.id}`, label: lang === 'ko' ? th.label : th.labelEn, checked: th.id === theme, swatch: th.tokens['--accent'], swatchBg: th.tokens['--bg'] }));
  const keep = (e) => e.preventDefault();   // keep the editor focused
  return (
    <span className="app-controls">
      <span className="tb-split">
        <button className="tb-btn tb-split-main" title={t('tip_next_theme', { theme: themeLabel(nextThemeId(theme)) })} onMouseDown={keep} onClick={() => onAction('nextTheme')}>
          <Icon name="palette" /><Widest texts={[themeLabel(theme), ...THEMES.flatMap((th) => [th.label, th.labelEn])]} />
        </button>
        <button className="tb-btn tb-split-caret" title={t('tip_theme')} aria-label={t('tip_theme')} onMouseDown={keep} onClick={(e) => setThemeMenu(themeMenu ? null : e.currentTarget)}>
          <Icon name="chevronDown" size={14} />
        </button>
      </span>
      <button className="tb-btn tb-icon-only" title={lang === 'ko' ? 'Switch to English' : '한국어로 전환'} aria-label={t('tip_language')} onMouseDown={keep} onClick={() => onAction('toggleLanguage')}>
        <Flag country={lang === 'ko' ? 'gb' : 'kr'} width={22} />
      </button>
      <button className={`tb-btn ${compact ? 'tb-icon-only' : ''}`} title={t('tip_settings')} onMouseDown={keep} onClick={() => onAction('settings')}>
        <Icon name="settings" />{!compact && <Widest k="settings" />}
      </button>
      <span className="tb-sep" />
      <button className={`tb-btn ${compact ? 'tb-icon-only' : ''}`} title={t('tip_about')} onMouseDown={keep} onClick={() => onAction('about')}>
        <Icon name="info" />{!compact && <Widest k="menu_info" />}
      </button>
      {themeMenu && (
        <ContextMenu anchorEl={themeMenu} x={0} y={0} items={themeItems} onClose={() => setThemeMenu(null)}
          onPick={(id) => { setThemeMenu(null); onAction(id); }} />
      )}
    </span>
  );
}

// menus: [{ id, label, icon, items: () => [...] }]
export function MenuBar({ menus, onAction, theme, controls = false }) {
  useLanguage();
  // The window must stay wide enough for the menus (and the app controls when the icon toolbar is hidden).
  useLayoutEffect(() => { syncWindowMinWidth(); });
  const [open, setOpen] = useState(null);        // { id, el }
  // Double-click on the empty part of the bar toggles maximize, like a title bar.
  const onDouble = (e) => { if (isElectron && !e.target.closest('button, select, input')) windowControl('maximize'); };
  const openMenu = (m, el) => setOpen(open && open.id === m.id ? null : { id: m.id, el });
  const hoverMenu = (m, el) => { if (open && open.id !== m.id) setOpen({ id: m.id, el }); };
  const current = open ? menus.find((m) => m.id === open.id) : null;

  return (
    <>
    <div className="toolbar titlebar" onDoubleClick={onDouble}>
      <img src="./icon.svg" alt="" width={18} height={18} className="tb-logo" />
      <span className="tb-title">{t('appName')}</span>
      <span className="tb-spacer" />
      {isElectron && <WindowButtons />}
    </div>
    <div className="toolbar menubar">
      <span className="menus">
        {menus.map((m) => (
          <button key={m.id} className={`menu-btn ${open && open.id === m.id ? 'open' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); openMenu(m, e.currentTarget); }}
            onMouseEnter={(e) => hoverMenu(m, e.currentTarget)}>
            {m.icon && <Icon name={m.icon} size={14} className="menu-icon" />}{m.labelKey ? <Widest k={m.labelKey} /> : m.label}
          </button>
        ))}
      </span>
      <span className="tb-spacer" />
      {controls && <AppControls onAction={onAction} theme={theme} />}
      {current && (
        <ContextMenu anchorEl={open.el} x={0} y={0} items={current.items()} className="menu-drop" onClose={() => setOpen(null)}
          onPick={(id) => { setOpen(null); onAction(id); }} onAction={onAction} />
      )}
    </div>
    </>
  );
}

export default MenuBar;
