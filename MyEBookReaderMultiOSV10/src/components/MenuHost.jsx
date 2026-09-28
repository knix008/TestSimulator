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
 * overhang the application — in a single column, however long it is.
 *
 * The window is pooled and reused, so which menu this is arrives over IPC rather
 * than from the URL, and can change while the window lives.
 */
export default function MenuHost() {
  const [message, setMessage] = useState(null);
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

  // Report the size the list actually wants; the window follows it, so a menu
  // never scrolls and never has empty space around its rows.
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node || !message) return undefined;
    const report = () => {
      const box = node.getBoundingClientRect();
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
  }, [message]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') electron()?.menu?.close?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!message) return <div className="menu-window" ref={listRef} />;

  const lang = message.language || 'ko';
  const t = (key, args) => translate(lang, key, args);
  const rows = message.menu === 'theme'
    ? themeRows(THEMES, message.theme)
    : menuRows(message.menu, message.state || {});

  return (
    <div className="menu-window" ref={listRef}>
      <MenuList
        rows={rows}
        label={t(`menu.${message.menu}`, message.menu)}
        translate={t}
        onChoose={(id) => electron()?.menu?.choose?.(id)}
      />
    </div>
  );
}
