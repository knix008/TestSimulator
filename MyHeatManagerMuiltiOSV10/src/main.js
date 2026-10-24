import './styles.css';
import './app.css';
import './start.css';
import { loadSettings, resetForNewInstall } from './core/settings.js';
import { setLanguage } from './core/i18n.js';
import { resolveTheme, themeVars } from './core/themes.js';
import { startApp } from './ui/app.js';
import { setLanguageNative, windowReady } from './platform/native.js';

// First start after the installer ran: preferences go back to their defaults, recent files stay.
resetForNewInstall(globalThis.localStorage, globalThis.__MYHEATMANAGER_INSTALL_RESET__);
const settings = loadSettings(globalThis.localStorage);
setLanguage(settings.language);
setLanguageNative(settings.language);

// Before the first paint, so the window never flashes in the wrong colours.
const theme = resolveTheme(settings.theme, settings.customTheme);
for (const [key, value] of Object.entries(themeVars(theme))) document.documentElement.style.setProperty(key, value);
document.documentElement.dataset.theme = theme.mode;

startApp(document.getElementById('root'), settings);
requestAnimationFrame(() => requestAnimationFrame(() => windowReady()));
