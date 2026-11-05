// The toolbar's theme dropdown (the ▾ next to the theme button): an ordinary
// menu of one-line items in two columns. Top row: "★ 사용자 정의 테마" (a
// copy of the current theme, opened in Settings › 테마 for editing) and
// "⚙ 설정" (Settings › 테마); the custom themes under it. Then the 20 dark
// themes (two columns of ten, top to bottom) and the 20 light ones below them.
//
// Desktop: the menu is a window of its own (src-tauri theme_menu_open), so it
// may reach past the main window; ThemeMenuWindow is that window's page.
// Browser: ThemePopup shows the same menu inside the page.
import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { t, useLanguage, setLanguage } from '../lib/i18n';
import { getCustomThemes, setCustomThemes, applyTheme } from '../themes';
import { ThemeItem, ThemeColumns } from './ThemeGrid';
import { Icon } from './Icons';

/** The menu itself. onPick gets "theme:<id>", "newCustomTheme" or "themeSettings". */
export const ThemeMenuBody = forwardRef(function ThemeMenuBody({ current, onPick, style, className = '' }, ref) {
  useLanguage();
  const customs = getCustomThemes();
  const theme = (id) => onPick(`theme:${id}`);
  return (
    <div className={`ctx-menu theme-menu ${className}`} ref={ref} style={style} role="menu" aria-label={t('tip_theme')} onContextMenu={(e) => e.preventDefault()}>
      <div className="theme-menu-top">
        <button type="button" className="ctx-item theme-new-custom" role="menuitem" title={t('tip_theme_new_custom')} onClick={() => onPick('newCustomTheme')}>
          <span className="ctx-icon"><Icon name="star" size={14} /></span><span className="ctx-label">{t('theme_new_custom')}</span>
        </button>
        <button type="button" className="ctx-item theme-open-settings" role="menuitem" title={t('tip_theme_settings')} onClick={() => onPick('themeSettings')}>
          <span className="ctx-icon"><Icon name="settings" size={14} /></span><span className="ctx-label">{t('settings')}</span>
        </button>
      </div>
      {customs.length > 0 && (
        <div className="theme-list custom" role="group" aria-label={t('set_custom_themes')}>
          {customs.map((th) => <ThemeItem key={th.id} theme={th} active={th.id === current} onPick={theme} />)}
        </div>
      )}
      <div className="ctx-sep" />
      <ThemeColumns current={current} onPick={theme} />
    </div>
  );
});

/** In the page (browser): right edge under the ▾, kept inside the page. */
export function ThemePopup({ anchorEl, current, onPick, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8));
    const top = Math.max(8, Math.min(r.bottom + 2, window.innerHeight - el.offsetHeight - 8));
    setPos({ left, top });
  }, [anchorEl]);

  useEffect(() => {
    const down = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (anchorEl && anchorEl.contains(e.target)) return;
      onClose();
    };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, anchorEl]);

  return <ThemeMenuBody ref={ref} current={current} onPick={onPick} style={pos} />;
}

/** The page of the desktop dropdown window: the main window's look, then the menu; it sizes its window. */
export function ThemeMenuWindow({ data }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    setLanguage(data.language === 'en' ? 'en' : 'ko');
    setCustomThemes(data.customThemes);
    applyTheme(data.current);
    document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(data.fontSize) || 13)}px`);
    document.documentElement.classList.add('menu-window');
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!ready || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    invoke('theme_menu_size', { width: r.width, height: r.height }).catch(() => {});
  }, [ready]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') invoke('theme_menu_close').catch(() => {}); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  if (!ready) return null;
  return <ThemeMenuBody ref={ref} current={data.current} onPick={(id) => invoke('theme_menu_pick', { id }).catch(() => {})} />;
}

export default ThemePopup;
