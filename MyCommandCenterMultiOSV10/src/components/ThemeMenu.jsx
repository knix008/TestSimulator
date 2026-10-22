// Dark in one column, Light in one column, custom themes on a single line.
// The browser draws this inside the page. The desktop app draws the same
// panel in its own window (ThemeMenuWindow.jsx) so it is not clipped by the
// application window.
import React, { forwardRef, useEffect, useLayoutEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { THEMES, getCustomThemes } from '../themes';
import { Icon } from './Icons';

export function ThemeChoice({ th, lang, current, onPick }) {
  const label = lang === 'ko' ? th.label : th.labelEn;
  const on = th.id === current;
  return (
    <button type="button" className={`ctx-item ${on ? 'checked' : ''}`} role="menuitem" onClick={() => onPick(`theme:${th.id}`)}>
      <span className="ctx-icon">{on ? <Icon name="check" size={14} /> : null}</span>
      <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${th.tokens['--bg']} 50%, ${th.tokens['--accent']} 50%)` }} />
      <span className="ctx-label">{label}</span>
    </button>
  );
}

export const ThemeMenuPanel = forwardRef(function ThemeMenuPanel({ lang, current, onPick, os, style }, ref) {
  const custom = getCustomThemes();
  const dark = THEMES.filter((th) => th.mode === 'dark');
  const light = THEMES.filter((th) => th.mode === 'light');
  return (
    <div className={`theme-drop ctx-menu ${os ? 'os' : ''}`} ref={ref} style={style} role="menu">
      <div className="theme-drop-cols">
        <div className="theme-drop-col">
          <div className="ctx-head">{t('theme_dark')}</div>
          {dark.map((th) => <ThemeChoice key={th.id} th={th} lang={lang} current={current} onPick={onPick} />)}
        </div>
        <div className="theme-drop-col">
          <div className="ctx-head">{t('theme_light')}</div>
          {light.map((th) => <ThemeChoice key={th.id} th={th} lang={lang} current={current} onPick={onPick} />)}
        </div>
      </div>
      <div className="theme-drop-custom">
        <div className="ctx-head">{t('set_custom_themes')}</div>
        {custom.length
          ? custom.map((th) => <ThemeChoice key={th.id} th={th} lang={lang} current={current} onPick={onPick} />)
          : <p className="muted small theme-drop-empty">{t('theme_custom_empty')}</p>}
      </div>
    </div>
  );
});

// In-page menu. It stays inside the viewport, which is all a browser page can do.
export function ThemeMenu({ anchorEl, lang, current, onClose, onPick }) {
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [el, setEl] = useState(null);
  useLayoutEffect(() => {
    if (!el || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.left;
    let top = r.bottom + 2;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 2);
    setPos({ left, top });
  }, [anchorEl, el, current]);
  useEffect(() => {
    const down = (e) => {
      if (el && el.contains(e.target)) return;
      if (anchorEl && anchorEl.contains(e.target)) return;
      onClose();
    };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [onClose, anchorEl, el]);
  return (
    <ThemeMenuPanel ref={setEl} lang={lang} current={current} onPick={onPick} style={{ left: pos.left, top: pos.top }} />
  );
}
