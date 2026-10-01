import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { iconByName } from './Icons.jsx';

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

/**
 * The picture beside each menu's name.
 *
 * The same icon the menu's own rows are drawn with, so the bar and what opens
 * from it look like one thing: the book for reading, the panels for the view,
 * the pen for what the reader marks up.
 */
export const MENU_ICONS = {
  // 'app' is About, shortcuts and the language — what the program *is*, so
  // it carries the information mark. The gear belongs to Settings, which is
  // its own item on the bar now rather than a row inside this menu.
  file: 'open', reading: 'book', view: 'layout', marks: 'highlight', app: 'info',
};

/**
 * The one item on the bar that is not a menu.
 *
 * Settings used to be a row inside the Program menu: two clicks, and the gear
 * on the bar stood for a menu that mostly was not about settings. It opens the
 * window straight away now.
 */
// It carries `data-command` rather than `data-menu`: it opens a window, not
// a menu, and anything counting the menus on the bar must not count it.
export const BAR_COMMAND = { id: 'settings', icon: 'settings', label: 'cmd.settings' };

export default function MenuBar({ onOpenMenu, onCommand, openMenu = null }) {
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
          {React.createElement(iconByName(MENU_ICONS[id]), { size: 15 })}
          <span className="menubar-label">{t(`menu.${id}`)}</span>
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        className="menubar-item"
        data-command={BAR_COMMAND.id}
        onClick={() => onCommand?.(BAR_COMMAND.id)}
        title={t('tip.settings', t(BAR_COMMAND.label))}
      >
        {React.createElement(iconByName(BAR_COMMAND.icon), { size: 15 })}
        <span className="menubar-label">{t(BAR_COMMAND.label)}</span>
      </button>
    </div>
  );
}
