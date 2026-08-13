import { I18n } from './i18n.js';
import { applyThemeToDocument, loadThemes, resolveTheme } from './themes.js';
import {
  mountAboutView,
  mountPromptView,
  mountSshView,
  mountSettingsView,
} from './modals.js';

const api = window.myTerminal;
const i18n = new I18n();

const titleEl = document.getElementById('popup-title');
const bodyEl = document.getElementById('popup-body');
const footerEl = document.getElementById('popup-footer');
const closeBtn = document.getElementById('popup-close');

let popupId = null;
let currentClose = () => {};
let autoFitEnabled = true;
let beforeCloseHook = async () => {};

function applyThemeVars(themeId, custom, themes, transparency = 0) {
  const theme = resolveTheme(themes, themeId || 'dark', custom);
  applyThemeToDocument(theme, transparency, '', null);
  document.body.style.background = theme.toolbarBg;
  document.documentElement.style.background = theme.toolbarBg;
}

async function fitToContent() {
  if (!autoFitEnabled || !popupId || !api.fitPopup) return;
  const app = document.getElementById('popup-app');
  // Measure intrinsic content size (ignore stretched window height).
  const prevHeight = app.style.height;
  const prevOverflow = document.body.style.overflow;
  app.style.height = 'auto';
  document.body.style.overflow = 'hidden';
  const width = Math.ceil(Math.min(Math.max(app.scrollWidth || app.offsetWidth, 400), 760));
  const height = Math.ceil(Math.max(app.scrollHeight || app.offsetHeight, 240));
  await api.fitPopup({ id: popupId, width, height });
  app.style.height = prevHeight;
  document.body.style.overflow = prevOverflow;
}

function send(message) {
  if (!popupId) return Promise.resolve();
  return api.popupSend(popupId, message);
}

function setTitle(text) {
  titleEl.textContent = text || 'MyTerminal';
  document.title = text || 'MyTerminal';
}

function clearView() {
  bodyEl.innerHTML = '';
  footerEl.innerHTML = '';
}

async function mount(message) {
  clearView();
  const { kind, payload = {} } = message;
  await i18n.setLanguage(payload.lang || 'en');

  // Settings keeps a fixed window size; content scrolls inside.
  autoFitEnabled = payload.autoFit !== false && kind !== 'settings';
  document.body.classList.toggle('popup-fixed', !autoFitEnabled);

  if (payload.themes) {
    applyThemeVars(
      payload.themeId,
      payload.custom,
      payload.themes,
      payload.bgTransparency || 0
    );
  }

  beforeCloseHook = async () => {};
  currentClose = async () => {
    const hook = beforeCloseHook;
    beforeCloseHook = async () => {};
    try {
      await hook();
    } catch (_) {
      /* still close */
    }
    send({ type: 'closed-request' });
    api.closePopup(popupId);
  };

  const ctx = {
    i18n,
    api,
    bodyEl,
    footerEl,
    setTitle,
    close: () => currentClose(),
    send,
    fit: fitToContent,
    setBeforeClose: (fn) => {
      beforeCloseHook = typeof fn === 'function' ? fn : async () => {};
    },
  };

  if (kind === 'about') mountAboutView(ctx, payload);
  else if (kind === 'prompt') mountPromptView(ctx, payload);
  else if (kind === 'ssh') mountSshView(ctx, payload);
  else if (kind === 'settings') mountSettingsView(ctx, payload);
  else {
    setTitle(payload.title || 'MyTerminal');
    bodyEl.innerHTML = payload.bodyHtml || '';
  }

  if (autoFitEnabled) requestAnimationFrame(() => fitToContent());
}

async function boot() {
  popupId = await api.popupGetId();
  closeBtn.addEventListener('click', () => currentClose());

  api.onPopupMessage((msg) => {
    if (msg?.type === 'init') mount(msg);
    if (msg?.type === 'settings:reset-result') {
      document.dispatchEvent(
        new CustomEvent('popup-settings-reset', {
          detail: {
            custom: msg.custom,
            lsDirectoryColor: msg.lsDirectoryColor,
            lsFileColor: msg.lsFileColor,
          },
        })
      );
    }
    if (msg?.type === 'ssh:result') {
      document.dispatchEvent(new CustomEvent('popup-ssh-result', { detail: msg }));
    }
  });

  // Themes fallback if payload omits them.
  try {
    await loadThemes();
  } catch (_) {
    /* ignore */
  }

  send({ type: 'ready' });
}

boot().catch((err) => {
  console.error(err);
  bodyEl.textContent = String(err);
});
