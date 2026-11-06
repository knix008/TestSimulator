import React from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_ID, themeById, themesByMode } from '../lib/themes';
import { IconContrast, IconSettings } from './Icons';

// At the top: following the system, the user's own theme, and the button that edits it. Below it
// the dark themes, and under them the light ones.
export function ThemeMenuList({ theme, themeAuto, onAuto, onPick, onCustomize }) {
  const { t } = useTranslation();
  const custom = themeById(CUSTOM_ID);
  return (
    <>
      <div className="theme-menu-top">
        <button type="button" className={`dropdown-item${themeAuto ? ' on' : ''}`} data-testid="theme-auto" onClick={onAuto}>
          <IconContrast size={16} />
          <span>{t('theme.auto')}</span>
        </button>
        <button type="button" className={`dropdown-item${theme === CUSTOM_ID && !themeAuto ? ' on' : ''}`} data-testid="theme-custom" onClick={() => onPick(CUSTOM_ID)}>
          <span className="theme-swatch-mini" aria-hidden="true">{custom.bars.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
          <span>{t('theme.custom')}</span>
        </button>
        <button type="button" className="dropdown-item" data-testid="theme-customize" onClick={onCustomize}>
          <IconSettings size={16} />
          <span>{t('theme.customize')}</span>
        </button>
      </div>
      {['dark', 'light'].map((mode) => (
        <div key={mode} data-theme-group={mode}>
          <div className="dropdown-head">{t(mode === 'dark' ? 'theme.groupDark' : 'theme.groupLight')}</div>
          <div className="theme-menu-grid">
            {themesByMode(mode).map((th) => (
              <button
                key={th.id}
                type="button"
                data-theme-pick={th.id}
                className={`theme-chip${theme === th.id && !themeAuto ? ' on' : ''}`}
                title={t(`theme.${th.id}`)}
                onClick={() => onPick(th.id)}
              >
                <span className="theme-chip-bars" aria-hidden="true">{th.bars.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
                <span className="theme-chip-name">{t(`theme.${th.id}`)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
