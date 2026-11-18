import './styles.css';
import { start } from './app.js';
import { startViewer } from './ui/docwindow.js';
import { startPrintWindow } from './ui/printwin.js';
import { startAboutWindow } from './ui/aboutwin.js';
import { applyInstall, applyInstallLanguage, loadSettings } from './domain/settings.js';
import { setLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';

applyInstall(globalThis.__MYWORKFORCE_INSTALL_RESET__, globalThis.__MYWORKFORCE_INSTALL_LANGUAGE__);
const settings = applyInstallLanguage(globalThis.__MYWORKFORCE_INSTALL_LANGUAGE__, globalThis.__MYWORKFORCE_INSTALL_LANGUAGE_TOKEN__);
loadSettings();
setLanguage(settings.language);
const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
applyTheme(resolveTheme(settings.theme, dark, settings.customTheme));
applyFont(settings);
if (!globalThis.window?.__TAURI_INTERNALS__) document.documentElement.classList.add('is-web');
const viewer = new URLSearchParams(location.search).get('viewer');
// Tool windows of their own: print, program information, settings (the app itself, on its settings page).
const tool = new URLSearchParams(location.search).get('tool');
if (tool === 'print') startPrintWindow();
else if (tool === 'about') startAboutWindow();
else if (tool === 'settings') start({ tool: 'settings' });
else if (!startViewer(viewer)) start();
