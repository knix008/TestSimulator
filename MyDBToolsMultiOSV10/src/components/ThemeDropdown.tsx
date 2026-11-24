// The theme drop-down on the menu bar: one button showing the current theme,
// opening a panel with every theme — light and dark side by side, the user's
// own themes below — and the theme actions (theme settings, next theme) on top.
// Forty themes in one long menu would run off the bottom of the window; two
// columns of twenty fit.
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import {
  customThemeDefinitions,
  getPalette,
  getThemeName,
  THEMES,
  type ThemeDefinition,
  type ThemeId,
} from '../render/theme';
import { Icons } from './Icons';

interface Props {
  theme: ThemeId;
  language: 'ko' | 'en';
  onPick: (id: ThemeId) => void;
  onNext: () => void;
  onSettings: () => void;
}

export function ThemeDropdown({ theme, language, onPick, onNext, onSettings }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (def: ThemeDefinition) => (
    <button
      key={def.id}
      type="button"
      role="menuitemradio"
      aria-checked={theme === def.id}
      data-theme-pick={def.id}
      className={`theme-drop-item ${theme === def.id ? 'active' : ''}`}
      onClick={() => {
        onPick(def.id);
        setOpen(false);
      }}
    >
      <span
        className="theme-drop-chip"
        style={{ background: `linear-gradient(135deg, ${def.palette.canvasBackground} 0 50%, ${def.palette.accent} 50%)`, borderColor: def.palette.border }}
      />
      <span className="theme-drop-name">{getThemeName(def.id, language)}</span>
      {theme === def.id && <span className="theme-drop-check">✓</span>}
    </button>
  );

  const customs = customThemeDefinitions();

  return (
    <div className="theme-dropdown" ref={ref}>
      <button
        type="button"
        className={`tb theme-dropdown-button ${open ? 'open' : ''}`}
        data-action="theme-dropdown"
        title={t('TtThemeSelector')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="theme-icon" style={{ color: getPalette(theme).accent }}>
          <Icons.Palette />
        </span>
        <span>{getThemeName(theme, language)}</span>
        <span className="theme-dropdown-caret">▾</span>
      </button>
      {open && (
        <div className="theme-drop-panel" role="menu">
          <div className="theme-drop-actions">
            <button
              type="button"
              className="btn"
              data-action="theme-settings"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
            >
              <Icons.Palette />
              <span>{t('MenuThemeSettings')}</span>
            </button>
            <button type="button" className="btn" data-action="theme-next" onClick={onNext}>
              <Icons.Redo />
              <span>{t('ThemeNext')}</span>
            </button>
          </div>
          <div className="theme-drop-columns">
            {(['light', 'dark'] as const).map((kind) => (
              <div key={kind} className="theme-drop-column">
                <div className="theme-drop-head">
                  {kind === 'light' ? <Icons.Sun /> : <Icons.Moon />}
                  {kind === 'light' ? t('SettingsThemeLight') : t('SettingsThemeDark')}
                </div>
                {THEMES.filter((x) => x.kind === kind).map(item)}
              </div>
            ))}
          </div>
          {customs.length > 0 && (
            <>
              <div className="theme-drop-head">
                <Icons.Palette />
                {t('ThemeCustomGroup')}
              </div>
              <div className="theme-drop-custom">{customs.map(item)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
