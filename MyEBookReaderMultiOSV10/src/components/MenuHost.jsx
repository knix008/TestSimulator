import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import MenuList from './MenuList.jsx';
import { menuRows, themeRows } from '../lib/menus.js';
import { THEMES } from '../lib/themes.js';
import { applyTheme } from '../lib/settings.js';
import { translate } from '../i18n.js';

const electron = () => (typeof window !== 'undefined' ? window.electronAPI : undefined);

/**
 * The contents of one menu, rendered inside its own always-on-top window.
 *
 * A frameless BrowserWindow clips its HTML, so a dropdown drawn inside the app
 * could never reach past the app's edge. Here the list measures itself, asks the
 * main process to size the window to match, and the popup is then free to
 * overhang the application. A menu that is still taller than the screen — the
 * theme list, with forty of them — is dealt into a second (or third) column
 * rather than being cut off at the bottom.
 *
 * The window is pooled and reused, so which menu this is arrives over IPC rather
 * than from the URL, and can change while the window lives.
 */
export default function MenuHost() {
  const [message, setMessage] = useState(null);
  const [columns, setColumns] = useState(1);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    // Only when there is something: this asks the main process what it was
    // already showing, and it resolves after the first `menu:payload` push on a
    // cold window — an empty answer must not wipe the menu that just arrived.
    electron()?.menu?.payload?.().then((value) => {
      if (!cancelled && value) setMessage(value);
    }).catch(() => {});
    const off = electron()?.menu?.onPayload?.((next) => {
      if (!cancelled) setMessage(next || null);
    });
    document.documentElement.classList.add('popup-window', 'menu-window-root');
    document.body.classList.add('popup-window');
    return () => { cancelled = true; off?.(); };
  }, []);

  useEffect(() => {
    if (message?.theme) applyTheme(message.theme);
  }, [message?.theme]);

  // Each menu starts as one column and grows only if it has to.
  useEffect(() => { setColumns(1); }, [message]);

  // Report the size the list actually wants; the window follows it, so a menu
  // never scrolls and never has empty space around its rows.
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node || !message) return undefined;
    // How tall a menu may be before it is dealt into another column. It is not
    // simply what the screen could show: a list that runs from the top of the
    // screen to the bottom is a chore to read, so anything past about two
    // thirds of a normal screen goes into columns instead.
    const room = (window.screen?.availHeight || window.innerHeight || 900) - 80;
    const limit = Math.max(320, Math.min(room, 620));
    // And how wide the screen will let it get: another column is no use if the
    // menu window would then be wider than the display and be cut off.
    const across = (window.screen?.availWidth || window.innerWidth || 1200) - 60;
    const grouped = message.menu === 'theme';
    const report = () => {
      const box = node.getBoundingClientRect();
      const perColumn = box.width / columns;
      const fits = (columns + 1) * perColumn <= across;
      if (!grouped && box.height > limit && columns < 4 && fits) {
        // Too tall to be seen whole: deal it into one more column and let the
        // next pass measure again.
        setColumns(columns + 1);
        return;
      }
      electron()?.menu?.reportSize?.({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
    };
    report();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(report) : null;
    observer?.observe(node);
    const settle = setTimeout(report, 40);
    return () => {
      observer?.disconnect();
      clearTimeout(settle);
    };
  }, [message, columns]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') electron()?.menu?.close?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!message) return <div className="menu-window" ref={listRef} />;

  const lang = message.language || 'ko';
  const t = (key, args) => translate(lang, key, args);
  const isThemes = message.menu === 'theme';
  const rows = isThemes
    ? themeRows(THEMES, message.theme)
    : menuRows(message.menu, message.state || {});

  // Forty themes in one column is a menu the length of the screen. They are
  // already in two families, so each family is given two columns and the whole
  // list ends up about as tall as the File menu.
  const shownColumns = isThemes ? 2 : columns;

  return (
    <div className={shownColumns > 1 ? 'menu-window wide' : 'menu-window'} ref={listRef}>
      <MenuList
        rows={rows}
        columns={shownColumns}
        grouped={isThemes}
        label={t(`menu.${message.menu}`, message.menu)}
        translate={t}
        onChoose={(id) => electron()?.menu?.choose?.(id)}
      />
    </div>
  );
}
