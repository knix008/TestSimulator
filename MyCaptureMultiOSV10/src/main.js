// One bundle serves two kinds of windows: the main app and the
// region-selection overlays ("overlay-…"), the recording controls ("recbar") and
// the popup windows ("popup-settings", "popup-about", "popup-confirm", "popup-theme-menu").
import { loadSettings } from './domain/settings.js';
import { setLanguage } from './i18n.js';
import { applyTheme, resolveTheme } from './themes.js';

const settings = loadSettings(globalThis.localStorage);
setLanguage(settings.language);
// Before the first paint, so the window never flashes in the wrong colours.
applyTheme(resolveTheme(settings.theme, settings.customTheme, globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches));
const label = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? 'main';

if (label.startsWith('overlay-')) {
  import('./overlay.js');
} else if (label.startsWith('popup-')) {
  import('./popup.js');
} else if (label === 'recbar') {
  import('./recbar.js');
} else {
  import('./app.js');
}
