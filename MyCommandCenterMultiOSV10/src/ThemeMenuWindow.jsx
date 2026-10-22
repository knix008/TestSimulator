// The theme list as its own window (?win=themeMenu). A menu drawn inside the
// application window is cut off at the window's edge; this one is placed in
// screen coordinates, so it can hang past that edge the way an OS menu does.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ThemeMenuPanel } from './components/ThemeMenu';
import { onAppMessage, postToApp } from './lib/backend';
import { setLanguage } from './lib/i18n';
import { applyTheme, setCustomThemes } from './themes';

function readPayload() {
  try { return JSON.parse(localStorage.getItem('cc-theme-menu') || 'null'); } catch { return null; }
}

async function placeWindow(payload, width, height) {
  const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window');
  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi');
  const win = getCurrentWindow();
  const w = Math.ceil(width) + 2;
  const h = Math.ceil(height) + 2;
  let left = payload.x;
  let top = payload.y;
  const mon = await currentMonitor();
  if (mon && mon.workArea) {
    const scale = mon.scaleFactor || 1;
    const ax = mon.workArea.position.x / scale;
    const ay = mon.workArea.position.y / scale;
    const aw = mon.workArea.size.width / scale;
    const ah = mon.workArea.size.height / scale;
    if (top + h > ay + ah - 8) top = payload.above - h;
    if (top < ay + 8) top = ay + 8;
    if (left + w > ax + aw - 8) left = ax + aw - w - 8;
    if (left < ax + 8) left = ax + 8;
  }
  await win.setPosition(new LogicalPosition(Math.round(left), Math.round(top)));
  await win.setSize(new LogicalSize(w, h));
  await win.show();
  try { await win.setFocus(); } catch { /* already in front */ }
}

export function ThemeMenuWindow() {
  const [payload, setPayload] = useState(readPayload);
  const ref = useRef(null);
  const closing = useRef(false);
  const nonceRef = useRef(0);
  if (payload && payload.nonce !== nonceRef.current) {
    nonceRef.current = payload.nonce;
    closing.current = false;
    setCustomThemes(payload.customThemes || []);
    if (payload.language) setLanguage(payload.language);
    if (payload.fontSize) document.documentElement.style.setProperty('--fs', `${payload.fontSize}px`);
    if (payload.theme) applyTheme(payload.theme);
  }

  useEffect(() => {
    document.documentElement.classList.add('theme-menu');
    return () => document.documentElement.classList.remove('theme-menu');
  }, []);

  useEffect(() => onAppMessage((msg) => {
    if (!msg || msg.type !== 'themeMenu:show') return;
    closing.current = false;
    setPayload(readPayload());
  }), []);

  useEffect(() => {
    if (!payload) return undefined;
    const key = (e) => {
      if (e.key !== 'Escape' || closing.current) return;
      e.preventDefault();
      closing.current = true;
      postToApp({ type: 'themeMenu:closed', nonce: payload.nonce }).catch(() => {});
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().hide()).catch(() => {});
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [payload]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !payload) return undefined;
    let dead = false;
    let removeBlur = () => {};
    const r = el.getBoundingClientRect();
    placeWindow(payload, r.width, r.height).then(() => {
      if (dead) return;
      const onBlur = () => {
        if (closing.current) return;
        closing.current = true;
        postToApp({ type: 'themeMenu:closed', nonce: payload.nonce }).catch(() => {});
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().hide()).catch(() => {});
      };
      window.addEventListener('blur', onBlur);
      removeBlur = () => window.removeEventListener('blur', onBlur);
    }).catch(() => {});
    return () => { dead = true; removeBlur(); };
  }, [payload]);

  if (!payload) return null;
  return (
    <ThemeMenuPanel
      ref={ref}
      os
      lang={payload.language || 'ko'}
      current={payload.theme}
      onPick={(id) => {
        if (closing.current) return;
        closing.current = true;
        postToApp({ type: 'themeMenu:pick', id, nonce: payload.nonce }).catch(() => {});
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().hide()).catch(() => {});
      }}
    />
  );
}

export default ThemeMenuWindow;
