// The top of the window, two rows:
//   menu bar   — app icon and name (My BrainMap V1.0) on the left, then the menus
//                (파일 · 편집 · 삽입 · 서식 · 보기 · 도구 · 도움말, each
//                with an icon), and on the desktop minimize / maximize / close
//                on the right. The icon, name and the empty stretch are the
//                frameless window's drag region (double-click maximizes).
//                On the desktop a click opens a native OS menu (it may reach
//                beyond the window); on the web the in-page ContextMenu, which
//                switches on hover while one is open
//   toolbar    — Toolbar.jsx
// The menu bar is rendered here (MenuBar).
//
// AppControls — theme picker (split button: main part cycles, caret lists
// them all, dark and light side by side), language toggle (the flag of the
// language you switch TO),
// Settings and Info — sit at the right end of the toolbar row (Toolbar.jsx),
// or here when the toolbar is hidden.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { allThemes, themeById, nextThemeId } from '../themes';
import { isDesktop, windowControl, onMaximized, syncWindowMinWidth, nativeMenus, popupNativeMenu } from '../lib/backend';
import { Icon, Flag } from './Icons';
import { ContextMenu } from './ContextMenu';
import { Widest } from './Widest';
import { withMenuIcons } from '../lib/menuicons';

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

const THEME_ROWS = 21;   // theme dropdown: one header + that mode's 20 themes, all in one column

export function AppControls({ onAction, theme, compact = false }) {   // compact: icons only for Settings / Info (toolbar row)
  useLanguage();
  const [themeMenu, setThemeMenu] = useState(null);
  const lang = getLanguage();
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  // The list is grouped by mode: the dark themes first, then the light ones, each
  // in a single column of THEME_ROWS rows (a header + its 20 themes), so the two
  // modes stand side by side and the custom ones (★, in their own mode's group)
  // follow their mode. Spacers pad a group so the next one starts a new column.
  const themeGroup = (title, list) => {
    if (!list.length) return [];
    const cells = [{ header: title }, ...list.map((th) => ({ id: `theme:${th.id}`, label: `${th.custom ? '★ ' : ''}${lang === 'ko' ? th.label : th.labelEn}`, checked: th.id === theme, swatch: th.tokens['--accent'], swatchBg: th.tokens['--bg'] }))];
    while (cells.length % THEME_ROWS) cells.push({ spacer: true });
    return cells;
  };
  const themeItems = [...themeGroup(t('set_theme_dark'), allThemes().filter((th) => th.mode === 'dark')), ...themeGroup(t('set_theme_light'), allThemes().filter((th) => th.mode === 'light'))];
  const keep = (e) => e.preventDefault();   // keep the editor focused
  return (
    <span className="app-controls">
      <span className="tb-split">
        <button className="tb-btn tb-split-main" title={t('tip_next_theme', { theme: themeLabel(nextThemeId(theme)) })} onMouseDown={keep} onClick={() => onAction('nextTheme')}>
          <Icon name="palette" /><Widest texts={[themeLabel(theme), ...allThemes().flatMap((th) => [th.label, th.labelEn])]} />
        </button>
        <button className="tb-btn tb-split-caret" title={t('tip_theme')} aria-label={t('tip_theme')} onMouseDown={keep} onClick={(e) => setThemeMenu(themeMenu ? null : e.currentTarget)}>
          <Icon name="chevronDown" size={14} />
        </button>
      </span>
      <button className="tb-btn tb-icon-only" title={lang === 'ko' ? 'Switch to English' : '한국어로 전환'} aria-label={t('tip_language')} onMouseDown={keep} onClick={() => onAction('toggleLanguage')}>
        <Flag country={lang === 'ko' ? 'gb' : 'kr'} width={22} />
      </button>
      <button className={`tb-btn ${compact ? 'tb-icon-only' : ''}`} data-cmd="settings" title={t('tip_settings')} onMouseDown={keep} onClick={() => onAction('settings')}>
        <Icon name="settings" />{!compact && <Widest k="settings" />}
      </button>
      <span className="tb-sep" />
      <button className={`tb-btn ${compact ? 'tb-icon-only' : ''}`} title={t('tip_about')} onMouseDown={keep} onClick={() => onAction('about')}>
        <Icon name="info" />{!compact && <Widest k="menu_info" />}
      </button>
      {themeMenu && (
        <ContextMenu anchorEl={themeMenu} x={0} y={0} items={themeItems} rows={THEME_ROWS} className="theme-menu" onClose={() => setThemeMenu(null)}
          onPick={(id) => { setThemeMenu(null); onAction(id); }} />
      )}
    </span>
  );
}

// menus: [{ id, label, icon, items: () => [...] }]
export function MenuBar({ menus, onAction, theme, controls = false, startOpen = false }) {
  useLanguage();
  // The window must stay wide enough for the menus (and the app controls when the icon toolbar is hidden).
  useLayoutEffect(() => { syncWindowMinWidth(); });
  const [open, setOpen] = useState(null);        // { id, el }
  // Double-click on the empty part of the bar toggles maximize, like a title bar.
  const onDouble = (e) => { if (isDesktop && !e.target.closest('button, select, input')) windowControl('maximize'); };
  // Desktop: a native OS menu under the title (it may reach beyond the window); the title stays
  // highlighted while it is open. Web (and the smoke test): the in-page ContextMenu.
  const openMenu = async (m, el) => {
    if (nativeMenus) {
      if (open) return;
      setOpen({ id: m.id, el, native: true });
      const r = el.getBoundingClientRect();
      let id = null;
      try {
        id = await popupNativeMenu(await withMenuIcons(m.items()), { x: r.left, y: r.bottom });
        setOpen(null);
        if (id) onAction(id);
        return;
      } catch { setOpen(null); }
    }
    setOpen(open && open.id === m.id ? null : { id: m.id, el });
  };
  const hoverMenu = (m, el) => { if (open && !open.native && open.id !== m.id) setOpen({ id: m.id, el }); };
  const current = open && !open.native ? menus.find((m) => m.id === open.id) : null;
  // Every menu title reserves the same width — the widest title of the current language — so the titles sit at
  // an even pitch without being wider than the longest of them (the window's minimum width only ever grows, so
  // switching languages never shrinks the window).
  const allTitles = menus.map((m) => (m.labelKey ? t(m.labelKey) : m.label));

  return (
    <div className="toolbar menubar" onDoubleClick={onDouble}>
      <span className="tb-brand" data-tauri-drag-region>
        <img src="./icon.svg" alt="" width={16} height={16} className="tb-logo" draggable={false} />
        <span className="tb-title">{t('appName')}</span>
      </span>
      <button type="button" className={`menu-btn start-nav ${startOpen ? 'open' : ''}`} title={t('tip_start')} aria-pressed={startOpen ? 'true' : 'false'}
        onMouseDown={(e) => e.preventDefault()} onClick={() => onAction('showStart')}>
        <Icon name="home" size={14} className="menu-icon" />{t('start_nav')}
      </button>
      <span className="menus">
        {menus.map((m) => (
          <button key={m.id} className={`menu-btn ${open && open.id === m.id ? 'open' : ''}`} data-menu={m.id}
            onMouseDown={(e) => { e.preventDefault(); openMenu(m, e.currentTarget); }}
            onMouseEnter={(e) => hoverMenu(m, e.currentTarget)}>
            {m.icon && <Icon name={m.icon} size={14} className="menu-icon" />}<Widest texts={[m.labelKey ? t(m.labelKey) : m.label, ...allTitles]} className="menu-title" />
          </button>
        ))}
      </span>
      <span className="tb-spacer" data-tauri-drag-region />
      {controls && <AppControls onAction={onAction} theme={theme} />}
      {isDesktop && <WindowButtons />}
      {current && (
        <ContextMenu anchorEl={open.el} x={0} y={0} items={current.items()} className="menu-drop" onClose={() => setOpen(null)}
          onPick={(id) => { setOpen(null); onAction(id); }} onAction={onAction} />
      )}
    </div>
  );
}

export default MenuBar;
