import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import i18n from '../i18n';
import { invoke } from '../lib/host';
import { mirrorToDisk } from '../lib/settings';
import { ALL_THEME_IDS, applyCustomTheme, loadCustomTheme, rememberThemePref } from '../lib/themes';
import { ThemeMenuList } from './ThemeMenu';

function themeNow() {
  const s = localStorage.getItem('zm-theme');
  return ALL_THEME_IDS.includes(s) ? s : 'dark';
}

// The theme menu on the desktop: a window of its own, so it can reach past the main window's edge.
// It tells the main window what was picked through localStorage, as the settings window does.
export default function ThemeMenuPage() {
  const [theme, setTheme] = useState(themeNow);
  const [auto, setAuto] = useState(() => localStorage.getItem('zm-theme-auto') === '1');
  const box = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const hide = () => invoke('hide_theme_menu').catch(() => {});

  useEffect(() => {
    const sync = () => {
      setTheme(themeNow());
      setAuto(localStorage.getItem('zm-theme-auto') === '1');
      applyCustomTheme(loadCustomTheme());
      const lang = localStorage.getItem('zm-lang');
      if (lang && i18n.language !== lang) i18n.changeLanguage(lang);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('blur', hide);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // The window is made to fit the menu once the fonts are in. Right after opening its size can
  // read zero, and asking then would leave a sliver of a window.
  useLayoutEffect(() => {
    const fit = () => {
      if (!box.current || window.innerWidth === 0) return;
      const r = box.current.getBoundingClientRect();
      invoke('fit_theme_menu', { width: Math.ceil(r.width), height: Math.ceil(r.height) }).catch(() => {});
    };
    document.fonts.ready.then(fit);
  }, []);

  const pick = (id) => {
    localStorage.setItem('zm-theme-auto', '0');
    localStorage.setItem('zm-theme', id);
    rememberThemePref(id);
    setTheme(id);
    setAuto(false);
    mirrorToDisk();
    hide();
  };
  const pickAuto = () => {
    localStorage.setItem('zm-theme-auto', '1');
    setAuto(true);
    mirrorToDisk();
    hide();
  };
  const customize = () => {
    localStorage.setItem('zm-theme-action', `customize:${Date.now()}`);
    hide();
  };

  return (
    <div className="theme-window" ref={box}>
      <div className="dropdown-menu theme-menu" role="menu" data-testid="theme-menu">
        <ThemeMenuList theme={theme} themeAuto={auto} onAuto={pickAuto} onPick={pick} onCustomize={customize} />
      </div>
    </div>
  );
}
