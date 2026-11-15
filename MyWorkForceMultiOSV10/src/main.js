import './styles.css';
import { start } from './app.js';
import { startViewer } from './ui/docwindow.js';
import { applyInstall, loadSettings } from './domain/settings.js';
import { setLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';

const settings = applyInstall(globalThis.__MYWORKFORCE_INSTALL_RESET__, globalThis.__MYWORKFORCE_INSTALL_LANGUAGE__);
loadSettings();
setLanguage(settings.language);
const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
applyTheme(resolveTheme(settings.theme, dark, settings.customTheme));
applyFont(settings);
if (!globalThis.window?.__TAURI_INTERNALS__) document.documentElement.classList.add('is-web');
const viewer = new URLSearchParams(location.search).get('viewer');
if (!startViewer(viewer)) start();
