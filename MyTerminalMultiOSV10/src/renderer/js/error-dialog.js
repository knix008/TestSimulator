/**
 * Error dialog — every error the app catches ends up here: a popup (Electron)
 * or an in-page modal (web) with the one-line message, the full details in a
 * selectable text box, and a Copy button.
 *
 *   configureErrorDialog({ i18n, getTheme })   once, at boot
 *   reportError(err, { context })              from anywhere in the renderer
 *
 * Errors thrown while showing the dialog itself only go to the console, so a
 * broken dialog can never loop.
 */
import { canUsePopup, openPopupHost } from './popup-host.js';
import { openModalInPage } from './modals.js';
import { describeError } from '../../shared/error-format.js';

let config = { i18n: null, getTheme: () => ({}) };
let openCount = 0;
const MAX_OPEN = 3;
/** Recently shown messages (text → time) so a storm of identical errors shows one dialog. */
const recent = new Map();

export function configureErrorDialog(next) {
  config = { ...config, ...next };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function copyText(text) {
  const api = window.myTerminal;
  try {
    if (api?.clipboardWriteText) {
      await api.clipboardWriteText(text);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    return false;
  }
}

/** Markup shared by the popup and the in-page modal. */
export function errorBodyHtml(i18n, { message, details }) {
  return `
    <div class="error-box">
      <div class="error-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
      </div>
      <p class="error-message">${escapeHtml(message)}</p>
    </div>
    <label class="error-details-label" for="error-details">${escapeHtml(i18n.t('error.details', 'Details'))}</label>
    <textarea id="error-details" class="error-details mono" readonly spellcheck="false">${escapeHtml(details)}</textarea>`;
}

/** Copy button behaviour: copies the details, shows "Copied" for a moment. */
export function wireErrorCopy(root, i18n, details, button) {
  const btn = button || root.querySelector('[data-error-copy]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ok = await copyText(details);
    const label = btn.querySelector('span') || btn;
    const original = label.textContent;
    label.textContent = ok ? i18n.t('error.copied', 'Copied') : i18n.t('error.copyFailed', 'Copy failed');
    setTimeout(() => {
      label.textContent = original;
    }, 1500);
  });
}

/**
 * Show an error. `err` may be an Error, a string or `{ message, details }`.
 * Returns once the dialog is open (never throws).
 */
export async function reportError(err, { context = '', title = '' } = {}) {
  const i18n = config.i18n;
  try {
    console.error(context ? `[${context}]` : '', err);
    const { message, details } =
      err && typeof err === 'object' && typeof err.details === 'string'
        ? { message: String(err.message || ''), details: err.details }
        : describeError(err, { context });
    const key = `${context}|${message}`;
    const now = Date.now();
    if (recent.get(key) && now - recent.get(key) < 2000) return; // same error again within 2 s
    recent.set(key, now);
    if (openCount >= MAX_OPEN) return;
    if (!i18n) return;
    const heading = title || i18n.t('error.title', 'Error');

    if (canUsePopup()) {
      openCount += 1;
      const theme = config.getTheme?.() || {};
      const host = await openPopupHost({ kind: 'error', width: 560, height: 420, minWidth: 420, minHeight: 260 });
      host.onEvent((ev) => {
        if (ev.type === 'closed') openCount = Math.max(0, openCount - 1);
      });
      host.send({
        type: 'init',
        kind: 'error',
        payload: { lang: i18n.lang, title: heading, message, details, themes: theme.themes, themeId: theme.themeId, custom: theme.custom },
      });
      return;
    }

    openCount += 1;
    const { modal, close } = openModalInPage({
      title: heading,
      bodyHtml: errorBodyHtml(i18n, { message, details }),
      buttons: [
        { label: i18n.t('error.copy', 'Copy'), icon: 'copy', closeOnClick: false, onClick: () => {} },
        { label: i18n.t('error.close', 'Close'), primary: true, onClick: () => (openCount = Math.max(0, openCount - 1)) },
      ],
    });
    modal.classList.add('modal-error');
    const copyBtn = modal.querySelectorAll('.modal-footer .modal-btn')[0];
    wireErrorCopy(modal, i18n, details, copyBtn);
    modal.querySelector('.modal-x')?.addEventListener('click', () => (openCount = Math.max(0, openCount - 1)));
    void close;
  } catch (dialogErr) {
    console.error('error dialog failed', dialogErr);
  }
}

/** Renderer-wide catch-all: uncaught errors and rejected promises. */
export function installGlobalErrorHandlers(context = 'renderer') {
  window.addEventListener('error', (e) => {
    const err = e.error || e.message || 'Unknown error';
    reportError(err, { context });
  });
  window.addEventListener('unhandledrejection', (e) => {
    reportError(e.reason || 'Unhandled promise rejection', { context });
  });
}

/** Popup-window view (popup-app.js mounts it for kind 'error'). */
export function mountErrorView(ctx, payload, addFooterButtons) {
  const { i18n, bodyEl, footerEl, setTitle, close, fit } = ctx;
  const details = String(payload.details || payload.message || '');
  setTitle(payload.title || i18n.t('error.title', 'Error'));
  bodyEl.innerHTML = errorBodyHtml(i18n, { message: payload.message || '', details });
  addFooterButtons(
    footerEl,
    [
      { label: i18n.t('error.copy', 'Copy'), icon: 'copy', closeOnClick: false, onClick: () => {} },
      { label: i18n.t('error.close', 'Close'), primary: true },
    ],
    { modal: bodyEl, close }
  );
  wireErrorCopy(bodyEl, i18n, details, footerEl.querySelectorAll('.modal-btn')[0]);
  fit?.();
}
