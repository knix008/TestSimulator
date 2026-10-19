// One bundle serves every window: the main app and the popup windows
// ("popup-settings", "popup-pyenv", …) — OS windows on the desktop, frames
// (index.html?popup=<kind>) in the web build.
import './styles.css';
import './app.css';
import { loadSettings, resetForNewInstall } from './domain/settings.js';
import { setLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';

// First start after the installer ran: preferences go back to their defaults, the user's data stays.
resetForNewInstall(globalThis.localStorage, globalThis.__MYTRAINER_INSTALL_RESET__);
const settings = loadSettings(globalThis.localStorage);
setLanguage(settings.language);
// Before the first paint, so no window flashes in the wrong colours.
applyTheme(resolveTheme(settings.theme, globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches, settings.customTheme));
applyFont(settings);

const framed = new URLSearchParams(location.search).get('popup');
const label = framed ? `popup-${framed}` : window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? 'main';

if (label.startsWith('popup-')) {
  document.documentElement.classList.add('is-popup');
  import('./popup.js');
} else {
  if (!window.__TAURI_INTERNALS__) document.documentElement.classList.add('is-web');
  import('./app.js');
}
