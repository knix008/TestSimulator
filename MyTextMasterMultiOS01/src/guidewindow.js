// The user's guide in a window of its own (desktop: the Tauri window "guide"; browser: a separate
// window opened with ?view=guide). Same look as the main window: its own title row with the icon,
// the name and the window buttons, the dotted resize marker at the bottom right, the app's theme.
// The guide itself (contents, text size, language) is ui/guide.js. Settings are shared with the
// main window through localStorage: a theme picked there shows here at once (storage event).
import appIconUrl from '../assets/icon-256.png';
import { showGuide } from './ui/guide.js';
import { helpText } from './help.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { t, setLanguage, getLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';
import { loadSettings, storeSettings } from './domain/settings.js';
import * as native from './platform/native.js';

const root = document.querySelector('#app');
const desktop = native.desktop;
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
let settings = loadSettings(globalThis.localStorage);
let guide = null;
const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

const isDark = () => resolveTheme(settings.theme, prefersDark(), settings.customTheme).dark;

function render() {
  root.className = 'guide-window';
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  root.innerHTML = `
    <header class="guide-titlebar" data-window-drag>
      <img class="app-brand-icon" src="${appIconUrl}" alt="" data-window-drag />
      <span class="app-brand-name" data-window-drag>MyTextMaster</span>
      <span class="guide-titlebar-sep" data-window-drag>—</span>
      <span class="guide-titlebar-title" data-window-drag>${escapeHtml(t('action.userGuide'))}</span>
      <span class="grow" data-window-drag></span>
      ${desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : ''}
    </header>
    <div id="guide-host"></div>
    <div class="resize-grip ${desktop ? '' : 'static'}" ${desktop ? 'data-resize-grip' : 'aria-hidden="true"'} title="${escapeHtml(t('tip.resize'))}">${GRIP}</div>`;
  guide = showGuide(root.querySelector('#guide-host'), {
    text: (language) => helpText('guide', language),
    settings: () => ({ ...settings, guideLanguage: settings.guideLanguage || getLanguage() }),
    update: (patch) => {
      // Only the guide's own keys: everything else belongs to the main window.
      settings = { ...loadSettings(globalThis.localStorage), ...patch };
      storeSettings(globalThis.localStorage, settings);
    },
    dark: () => isDark(),
    openLink: (href) => (/^(https?:|mailto:)/i.test(href) ? native.openExternal(href).catch(() => {}) : undefined),
  });
  document.title = `MyTextMaster — ${t('action.userGuide')}`;
  native.setWindowTitle(document.title);
}

function applyLook() {
  setLanguage(settings.language);
  applyTheme(resolveTheme(settings.theme, prefersDark(), settings.customTheme));
  applyFont(settings);
}

root.addEventListener('click', async (event) => {
  const win = event.target.closest('[data-window]');
  if (!win) return;
  if (win.dataset.window === 'close') {
    if (desktop) (await import('@tauri-apps/api/window')).getCurrentWindow().close();
    else globalThis.close();
  } else native.windowCommand(win.dataset.window);
});
root.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !desktop) return;
  if (event.target.closest('[data-window-drag]') && !event.target.closest('button')) native.windowDrag();
  else if (event.target.closest('[data-resize-grip]')) { event.preventDefault(); native.windowDrag('SouthEast'); }
});
root.addEventListener('dblclick', (event) => { if (event.target.closest('[data-window-drag]')) native.windowCommand('maximize'); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !desktop) globalThis.close();
});

// The main window changed the theme, the colours or the language: follow it.
globalThis.addEventListener('storage', (event) => {
  if (event.key !== 'mytextmaster.settings') return;
  const next = loadSettings(globalThis.localStorage);
  const redraw = next.language !== settings.language || next.theme !== settings.theme || JSON.stringify(next.customTheme) !== JSON.stringify(settings.customTheme);
  settings = next;
  applyLook();
  if (redraw) render();
});

applyLook();
render();
globalThis.__mytextmasterGuide = { redraw: () => guide?.redraw() };
