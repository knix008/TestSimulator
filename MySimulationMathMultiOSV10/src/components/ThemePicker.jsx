// Theme picker: custom themes (with 새로 만들기 / 편집) on top, then the
// built-in themes as two groups side by side — Dark | Light — each 20
// themes in 2 columns of compact rows (swatch + name) — the settings 테마 tab.
// list: the toolbar dropdown — Dark and Light as two vertical columns, one
// theme per row (tall; on the desktop the popup window may leave the main window).
import React from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES, allThemes } from '../themes';
import { Icon } from './Chrome';

const nameOf = (th) => (getLanguage() === 'ko' ? th.label : th.labelEn || th.label);

function Entry({ th, on, onPick }) {
  const tk = th.tokens;
  return (
    <button type="button" className={`tp-entry ${on ? 'on' : ''}`} aria-pressed={on} title={nameOf(th)} onClick={() => onPick(th.id)}>
      <span className="tp-swatch" style={{ background: tk['--bg'], borderColor: tk['--border-strong'] }}>
        <i style={{ background: tk['--bg-panel'] }} /><i style={{ background: tk['--accent'] }} /><i style={{ background: tk['--fg'] }} />
      </span>
      <span className="tp-name">{nameOf(th)}</span>
      {on && <Icon name="check" size={12} />}
    </button>
  );
}

export function ThemePicker({ value, onPick, onNewCustom, onEditCustom, list = false }) {
  useLanguage();
  const custom = allThemes().filter((th) => th.custom);
  const dark = THEMES.filter((th) => th.mode === 'dark');
  const light = THEMES.filter((th) => th.mode === 'light');
  return (
    <div className={`theme-picker ${list ? 'list' : ''}`}>
      <div className="tp-custom">
        <div className="tp-head"><Icon name="edit" size={13} /><span>{t('st_tab_custom')}</span><span className="tp-count">{custom.length}</span>
          <span className="spacer" />
          {onNewCustom && <button type="button" className="tp-mini" onClick={onNewCustom}><Icon name="plus" size={12} />{t('ct_new')}</button>}
          {onEditCustom && <button type="button" className="tp-mini" onClick={onEditCustom}><Icon name="edit" size={12} />{t('edit')}</button>}
        </div>
        <div className="tp-cols tp-custom-list">
          {custom.length === 0 && <span className="small tp-none">{t('ct_none_short')}</span>}
          {custom.map((th) => <Entry key={th.id} th={th} on={value === th.id} onPick={onPick} />)}
        </div>
      </div>
      <div className="tp-builtins">
        {[[t('st_dark'), dark, 'palette'], [t('st_light'), light, 'sun']].map(([title, list, icon]) => (
          <div key={title} className="tp-group">
            <div className="tp-head"><Icon name={icon} size={13} /><span>{title}</span><span className="tp-count">{list.length}</span></div>
            <div className="tp-cols">{list.map((th) => <Entry key={th.id} th={th} on={value === th.id} onPick={onPick} />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Window size of the list-mode dropdown (rows of 22 px; custom themes 2 per row). */
export function themeListSize() {
  const rows = Math.max(THEMES.filter((th) => th.mode === 'dark').length, THEMES.filter((th) => th.mode === 'light').length);
  const customRows = Math.max(1, Math.ceil(allThemes().filter((th) => th.custom).length / 2));
  return { width: 400, height: 26 + 26 + customRows * 22 + 8 + 26 + rows * 22 + 8 };
}
