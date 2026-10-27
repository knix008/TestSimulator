import { I18n } from './i18n.js';
import { applyThemeToDocument, loadThemes, resolveTheme } from './themes.js';
import { mountAboutView, mountSshView, mountSettingsView, addFooterButtons } from './modals.js';
import { mountErrorView } from './error-dialog.js';
import { describeError } from '../../shared/error-format.js';

const api = window.myTerminal;
const i18n = new I18n();

const titleEl = document.getElementById('popup-title');
const titleIconEl = document.getElementById('popup-title-icon');
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
  // min-height:100% would otherwise pin the app to the current window height
  // and leave dead space below the footer, so neutralize it while measuring.
  const prevHeight = app.style.height;
  const prevMinHeight = app.style.minHeight;
  const prevMaxHeight = app.style.maxHeight;
  const prevOverflow = document.body.style.overflow;
  app.style.height = 'auto';
  app.style.minHeight = '0';
  // popup-fixed caps the app at the window height; lift it while measuring.
  app.style.maxHeight = 'none';
  document.body.style.overflow = 'hidden';
  // Bounding rect: content + padding + the app's 1px border on each side.
  const rect = app.getBoundingClientRect();
  const width = Math.ceil(Math.min(Math.max(app.scrollWidth || rect.width, 400), 960));
  const height = Math.ceil(Math.max(rect.height, app.scrollHeight || 0, 140));
  const fitted = await api.fitPopup({ id: popupId, width, height });
  app.style.height = prevHeight;
  app.style.minHeight = prevMinHeight;
  app.style.maxHeight = prevMaxHeight;
  document.body.style.overflow = prevOverflow;
  // Fixed-size popups never scroll — unless the screen is too small for the
  // content, in which case the body scrolls rather than being cut off.
  const short = fitted && Number(fitted.height) > 0 && fitted.height < height - 2;
  document.body.classList.toggle('popup-scroll', !!short);
  return fitted;
}

function send(message) {
  if (!popupId) return Promise.resolve();
  return api.popupSend(popupId, message);
}

/** Inline SVG glyphs for each popup kind's title bar. */
const POPUP_TITLE_ICONS = {
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  prompt: '<path d="M4 5h16v14H4zM7 9l3 2.5L7 14M12.5 14h4.5"/>',
  ssh: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M6.5 8l3 2.5-3 2.5M12.5 13h4"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/>',
  error: '<path d="M12 3l9.5 16.5h-19z"/><path d="M12 9v5M12 17h.01"/>',
};

function setTitleIcon(kind) {
  if (!titleIconEl) return;
  const svg = POPUP_TITLE_ICONS[kind];
  if (svg) {
    titleIconEl.innerHTML = `<svg viewBox="0 0 24 24">${svg}</svg>`;
    titleIconEl.hidden = false;
  } else {
    titleIconEl.innerHTML = '';
    titleIconEl.hidden = true;
  }
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
  setTitleIcon(kind);

  // Settings: sized once to its tallest tab, then locked (no inner scroll);
  // the other popups keep following their content.
  const fixedSize = kind === 'settings';
  autoFitEnabled = payload.autoFit !== false || fixedSize;
  document.body.classList.toggle('popup-fixed', fixedSize);

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
    // A fixed-size popup never re-fits after mount.
    fit: fixedSize ? () => {} : fitToContent,
    setBeforeClose: (fn) => {
      beforeCloseHook = typeof fn === 'function' ? fn : async () => {};
    },
  };

  if (kind === 'about') mountAboutView(ctx, payload);
  else if (kind === 'error') mountErrorView(ctx, payload, addFooterButtons);
  else if (kind === 'ssh') mountSshView(ctx, payload);
  else if (kind === 'settings') mountSettingsView(ctx, payload);
  else {
    setTitle(payload.title || 'MyTerminal');
    bodyEl.innerHTML = payload.bodyHtml || '';
  }

  // Show the window only after content is mounted, themed, and sized — this
  // avoids the open-at-default-size then resize/reposition flicker. After sizing,
  // wait one more frame so the (possibly resized) layout actually paints before
  // the window is revealed, otherwise a pre-resize frame flashes.
  const reveal = () => {
    try {
      Promise.resolve(api.showPopup?.(popupId)).catch(() => {});
    } catch (_) {
      /* fallback timer in main will show it */
    }
  };
  requestAnimationFrame(async () => {
    if (autoFitEnabled) await fitToContent();
    if (fixedSize) {
      autoFitEnabled = false;
      try {
        await api.setPopupResizable?.(popupId, false);
      } catch (_) {
        /* ignore */
      }
    }
    requestAnimationFrame(reveal);
  });
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
    if (msg?.type === 'settings:tab') {
      document.dispatchEvent(new CustomEvent('popup-settings-tab', { detail: { tab: msg.tab } }));
    }
    if (msg?.type === 'settings:git-mode') {
      document.dispatchEvent(
        new CustomEvent('popup-settings-git-mode', { detail: { gitMode: msg.gitMode } })
      );
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

// Anything that blows up inside a popup is shown by the owner window's error dialog.
const forwardError = (err, context) => {
  try {
    const info = describeError(err, { context });
    if (api?.reportError) api.reportError(info);
    else send({ type: 'error', ...info });
  } catch (_) {
    /* ignore */
  }
};
window.addEventListener('error', (e) => forwardError(e.error || e.message || 'Unknown error', 'popup'));
window.addEventListener('unhandledrejection', (e) => forwardError(e.reason || 'Unhandled promise rejection', 'popup'));
