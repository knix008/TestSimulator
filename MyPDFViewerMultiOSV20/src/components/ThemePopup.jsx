import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { ThemeMenu } from './ThemePicker.jsx';
import { applyTheme, loadSettingsSync } from '../lib/settings.js';

const desktop = () => (typeof window !== 'undefined' ? window.desktopAPI : undefined);

// Standalone theme list in a child window so the Dark / Light columns can sit
// outside the main frame with no inner scrollbar.
export default function ThemePopup({ current }) {
  const customThemes = useMemo(() => loadSettingsSync().customThemes, []);

  useLayoutEffect(() => {
    applyTheme(current, customThemes);
    document.documentElement.classList.add('theme-popup');
    document.body.classList.add('theme-popup');
    const el = document.querySelector('.theme-popup-menu');
    if (!el || !desktop()?.win?.setPopupSize) return undefined;
    const fit = () => {
      const r = el.getBoundingClientRect();
      desktop()?.win?.setPopupSize({
        width: Math.ceil(r.width),
        height: Math.ceil(r.height),
      });
    };
    fit();
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [current, customThemes]);

  useEffect(() => {
    const onLeave = () => desktop()?.win?.closeThemePopup?.();
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => document.documentElement.removeEventListener('mouseleave', onLeave);
  }, []);

  return (
    <div className="theme-popup-menu dropdown">
      <ThemeMenu
        current={current}
        customThemes={customThemes}
        onPick={(id) => desktop()?.win?.pickTheme?.(id)}
        labelledBy="theme"
      />
    </div>
  );
}
