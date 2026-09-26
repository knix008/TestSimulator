import React from 'react';
import { useTranslation } from 'react-i18next';
import { themesByMode } from '../lib/themes';
import { IconContrast, IconCheck } from './Icons';

export function ThemeMenuList({ theme, themeAuto, onAuto, onPick }) {
  const { t } = useTranslation();
  return (
    <>
      <button type="button" className={`dropdown-item${themeAuto ? ' on' : ''}`} onClick={onAuto}>
        <IconContrast size={16} />
        <span>{t('theme.auto')}</span>
        {themeAuto && <span className="tick"><IconCheck size={14} /></span>}
      </button>
      <div className="theme-menu-cols">
        {['dark', 'light'].map((mode) => (
          <div key={mode} className="theme-menu-col">
            <div className="dropdown-head">{t(mode === 'dark' ? 'theme.groupDark' : 'theme.groupLight')}</div>
            {themesByMode(mode).map((th) => (
              <button
                key={th.id}
                type="button"
                className={`dropdown-item${theme === th.id && !themeAuto ? ' on' : ''}`}
                onClick={() => onPick(th.id)}
              >
                <span className="theme-swatch-mini" aria-hidden="true">
                  {th.bars.map((c, i) => <i key={i} style={{ background: c }} />)}
                </span>
                <span>{t(`theme.${th.id}`)}</span>
                {theme === th.id && !themeAuto && <span className="tick"><IconCheck size={14} /></span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
