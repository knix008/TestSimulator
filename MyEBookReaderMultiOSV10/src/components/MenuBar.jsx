import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// The menu bar: File, Reading, View, Marks, Application.
//
// The toolbar is for the things a reader reaches for constantly; the menu bar
// is where everything lives, named in words, in the place people have looked
// for it since menus existed. Both open the same menus — the ones built from
// the command catalogue and shown in their own window (see lib/menus.js and
// electron/childwindows.js) — so a command added there appears in both without
// anything else being touched.
//
// Alt+F, Alt+R and so on open a menu from the keyboard; the letter is the one
// underlined in the label.

export const BAR_MENUS = ['file', 'reading', 'view', 'marks', 'app'];

/** The key that opens each menu, from the English names people expect. */
export const MENU_KEYS = { file: 'f', reading: 'r', view: 'v', marks: 'm', app: 'a' };

export default function MenuBar({ onOpenMenu, openMenu = null }) {
  const { t } = useTranslation();
  const refs = useRef({});

  const open = useCallback((id) => {
    const button = refs.current[id];
    if (!button) return;
    const rect = button.getBoundingClientRect();
    onOpenMenu?.(id, {
      x: rect.left,
      y: rect.bottom + 2,
      width: rect.width,
      height: rect.height + 2,
    });
  }, [onOpenMenu]);

  return (
    <div className="menubar" role="menubar" aria-label={t('menu.bar')}>
      {BAR_MENUS.map((id) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openMenu === id}
          className={`menubar-item${openMenu === id ? ' open' : ''}`}
          data-menu={id}
          ref={(node) => { refs.current[id] = node; }}
          onClick={() => open(id)}
          // Moving along the bar while a menu is open swaps the menu, the way a
          // menu bar has always behaved.
          onMouseEnter={() => { if (openMenu && openMenu !== id) open(id); }}
          title={t(`tip.${id}Menu`, t(`menu.${id}`))}
        >
          {t(`menu.${id}`)}
        </button>
      ))}
    </div>
  );
}
