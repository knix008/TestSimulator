// Entry: theme before the first paint, then the app. The web build also
// registers its service worker so it can be installed and run offline.
import './styles.css';
import { loadSettings } from './settings.js';
import { applyTheme } from './themes.js';

const settings = loadSettings();
const dark = settings.theme === 'dark' || (settings.theme === 'system' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
applyTheme(dark ? 'dark' : 'light');

import('./app.js');

if (!window.__TAURI_INTERNALS__ && 'serviceWorker' in navigator && import.meta.env.PROD && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
