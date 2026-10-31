// Theme lists shared by the toolbar's theme dropdown and Settings › 테마:
// ordinary one-line items (colour swatch + name), dark first, then light,
// each mode in two vertical columns of ten (20 + 20 built-in themes).
// Custom themes (★) are listed by the caller above the built-in ones.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { THEMES } from '../themes';
import { Icon } from './Icons';

export const themeName = (th, lang) => (th.custom ? th.label : lang === 'ko' ? th.label : th.labelEn);

export function ThemeItem({ theme: th, active, onPick }) {
  const lang = useLanguage();
  const tk = th.tokens;
  const name = themeName(th, lang);
  return (
    <button type="button" className={`ctx-item theme-item ${active ? 'checked' : ''}`} data-theme-id={th.id} title={name}
      role="menuitemradio" aria-checked={active} onClick={() => onPick(th.id)}>
      <span className="ctx-icon">{active ? <Icon name="check" size={14} /> : null}</span>
      <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${tk['--bg']} 50%, ${tk['--accent']} 50%)` }} />
      <span className="ctx-label">{th.custom && <span className="theme-badge">★</span>}{name}</span>
    </button>
  );
}

/** The dark and light groups side by side, each two columns of ten. */
export function ThemeColumns({ current, onPick }) {
  useLanguage();
  return (
    <div className="theme-modes">
      {[['dark', 'set_theme_dark'], ['light', 'set_theme_light']].map(([mode, title]) => {
        const list = THEMES.filter((th) => th.mode === mode);
        return (
          <section key={mode} className="theme-group" data-mode={mode}>
            <div className="theme-group-title">{t(title)} <span className="muted">({list.length})</span></div>
            <div className="theme-list" role="group" aria-label={t(title)}>
              {list.map((th) => <ThemeItem key={th.id} theme={th} active={th.id === current} onPick={onPick} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
