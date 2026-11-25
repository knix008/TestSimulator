// One bundle serves every window: the main window (start screen + editor), the user's guide
// (index.html?viewer=guide — an OS window on the desktop, a browser tab on the web) and the
// print preview (index.html?popup=print — an OS window, or a frame in the web build).
import React from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import { applyInstallLanguage, loadSettings, resetForNewInstall } from './lib/settings.js';
import { setLanguage } from './i18n.js';
import { applyTheme } from './lib/themes.js';
import { invoke, isDesktop } from './lib/platform.js';

// First start after the installer: preferences back to their defaults (the user's data stays),
// and the language chosen in the installer.
resetForNewInstall(globalThis.localStorage, globalThis.__MYICOMAKER_INSTALL_RESET__);
applyInstallLanguage(globalThis.localStorage, globalThis.__MYICOMAKER_INSTALL_LANGUAGE__);
const settings = loadSettings();
setLanguage(settings.language);
applyTheme(settings.theme, undefined, settings.customTheme);
if (!isDesktop()) document.documentElement.classList.add('is-web');

const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById('root'));

async function start() {
  if (params.get('viewer') === 'guide') {
    const { default: GuideWindow } = await import('./windows/GuideWindow.jsx');
    document.documentElement.classList.add('is-guide');
    root.render(<GuideWindow />);
    return;
  }
  if (params.get('popup') === 'print') {
    const { default: PrintWindow } = await import('./windows/PrintWindow.jsx');
    document.documentElement.classList.add('is-print');
    root.render(<PrintWindow framed={params.has('frame')} onClose={() => window.parent.postMessage({ myicomaker: 'close-popup' }, '*')} />);
    return;
  }
  if (params.get('popup') === 'settings') {
    const { default: SettingsWindow } = await import('./windows/SettingsWindow.jsx');
    document.documentElement.classList.add('is-settings');
    root.render(<SettingsWindow framed={params.has('frame')} onClose={() => window.parent.postMessage({ myicomaker: 'close-popup' }, '*')} />);
    return;
  }
  const { default: App } = await import('./App.jsx');
  let startupFiles = [];
  if (isDesktop()) startupFiles = await invoke('startup_files').catch(() => []);
  root.render(<App startupFiles={startupFiles} />);
}

start();
