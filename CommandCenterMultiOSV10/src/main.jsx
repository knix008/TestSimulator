import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ToolWindow from './ToolWindow';
import MenuPopup from './MenuPopup';
import ThemeMenuWindow from './ThemeMenuWindow';
import { windowKind, isTauri, ensureHost } from './lib/backend';
import { watchTitlebarArea } from './lib/titlebar';
import './styles.css';

// ?win=<kind> → this page is one of the separate tool windows (viewer, editor, …);
// ?win=menu is the frameless window every menu is drawn in (see MenuPopup.jsx).
const page = windowKind === 'menu' ? <MenuPopup />
  : windowKind === 'themeMenu' ? <ThemeMenuWindow />
  : windowKind ? <ToolWindow /> : <App />;
// Where the page draws the window's title bar itself, keep the native window controls' space free
// (the menu popups have no title bar at all — they are frameless).
if (windowKind === 'themeMenu') document.documentElement.classList.add('theme-menu');
if (windowKind !== 'menu' && windowKind !== 'themeMenu') watchTitlebarArea();
// The main window has no title bar. The menu row carries the window buttons.
if (isTauri && !windowKind) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    getCurrentWindow().setDecorations(false).catch(() => {});
  }).catch(() => {});
}

async function boot() {
  // Settings and About already have their arguments. Draw them before the host
  // round-trip so the window is not empty while that call is in flight.
  const early = windowKind === 'settings' || windowKind === 'about' || windowKind === 'themeMenu';
  if (isTauri && !early) {
    try { await ensureHost(); } catch (err) { console.error(err); }
  }
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      {page}
    </React.StrictMode>,
  );
  if (isTauri && early) ensureHost().catch((err) => console.error(err));
}
boot();
