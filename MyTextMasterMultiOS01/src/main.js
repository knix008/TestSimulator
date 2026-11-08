// One page, one window: the start page and the editor. Settings, About and the other
// dialogs are panels over the page (ui/dialog.js), menus drop down inside it (ui/menu.js).
import './styles.css';
import './editor.css';
import './panels.css';
import './settings.css';
import { loadSettings } from './domain/settings.js';
import { setLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';
import { installTooltips } from './ui/tooltip.js';

const settings = loadSettings(globalThis.localStorage);
setLanguage(settings.language);
// Before the first paint, so the window does not flash in the wrong colours.
applyTheme(resolveTheme(settings.theme, globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches, settings.customTheme));
applyFont(settings);
// Every title shows at once, not after the browser's long wait.
installTooltips(document);

// The user's guide has a window of its own (desktop: set by Rust; browser: ?view=guide).
const view = window.__MYTEXTMASTER_VIEW__ ?? new URLSearchParams(location.search).get('view');
if (view === 'guide') {
  document.documentElement.classList.add('is-guide');
  import('./guidewindow.js');
} else if (view === 'dialog') {
  // A dialog (settings, about, a question, printing …) in a window of its own.
  import('./dialogwindow.js');
} else {
  // A browser window can be narrower than the app's minimum width (a desktop window cannot): scroll sideways then.
  if (!window.__TAURI_INTERNALS__) document.documentElement.classList.add('is-web');
  import('./app.js');
}
