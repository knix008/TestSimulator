// One bundle serves every window: the main app, and the popup windows
// ("popup-settings", "popup-menu", …) — OS windows on the desktop, frames
// (index.html?popup=<kind>) in the web build and while the tutorial runs.
import './styles.css';
import { applyInstallLanguage, loadSettings, resetForNewInstall } from './domain/settings.js';
import { setLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';
import { installDropdowns } from './ui/dropdown.js';
import { installTooltips } from './ui/tooltip.js';

// First start after the installer ran: preferences go back to their defaults, the user's data stays
// (the desktop app hands the installer's token to the main window only).
resetForNewInstall(globalThis.localStorage, globalThis.__MYHOMEMAKER_INSTALL_RESET__);
applyInstallLanguage(globalThis.localStorage, globalThis.__MYHOMEMAKER_INSTALL_LANGUAGE__);
const settings = loadSettings(globalThis.localStorage);
setLanguage(settings.language);
// Before the first paint, so no window flashes in the wrong colours.
applyTheme(resolveTheme(settings.theme, globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches, settings.customTheme));
applyFont(settings);

// Every <select> and <input list> of every window gets the dropdown with icons.
installDropdowns(document);
// Every title of every window shows at once, not after the browser's long wait.
installTooltips(document);

const search = new URLSearchParams(location.search);
const framed = search.get('popup');
// Documents and the tutorial video: OS windows "doc-<kind>" (desktop), index.html?viewer=<kind> (browser tab, tutorial frame).
const viewer = search.get('viewer');
const label = framed ? `popup-${framed}` : viewer ? `doc-${viewer}` : window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? 'main';

if (label === 'doc-code') {
  import('./code.js');
} else if (label.startsWith('doc-')) {
  import('./viewer.js');
} else if (label.startsWith('popup-')) {
  document.documentElement.classList.add('is-popup');
  import('./popup.js');
} else {
  // A browser window can be narrower than the app's minimum width (a desktop window cannot): scroll sideways then.
  if (!window.__TAURI_INTERNALS__) document.documentElement.classList.add('is-web');
  import('./app.js');
}
