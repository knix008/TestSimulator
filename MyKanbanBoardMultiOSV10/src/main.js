// One bundle serves every window: the main app, and the popup windows
// ("popup-settings", "popup-menu", …) — OS windows on the desktop, frames
// (index.html?popup=<kind>) in the web build.
import './styles.css';
import { loadSettings } from './domain/settings.js';
import { setLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';

const settings = loadSettings(globalThis.localStorage);
setLanguage(settings.language);
// Before the first paint, so no window flashes in the wrong colours.
applyTheme(resolveTheme(settings.theme, globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches));
applyFont(settings);

const label = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label
  ?? (new URLSearchParams(location.search).get('popup') ? `popup-${new URLSearchParams(location.search).get('popup')}` : 'main');

if (label.startsWith('popup-')) {
  document.documentElement.classList.add('is-popup');
  import('./popup.js');
} else {
  import('./app.js');
}
