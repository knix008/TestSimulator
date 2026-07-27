import { t, getLocale, translateError } from '../i18n/index.js';
import { getTheme } from './theme.js';

let dialogEls = null;
let lastDetailText = '';
let lastOptions = null;
let previousFocus = null;
let open = false;

function ensureDialog() {
  if (dialogEls) return dialogEls;

  const overlay = document.createElement('div');
  overlay.id = 'errorDialog';
  overlay.className = 'app-dialog error-dialog hidden';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'errorDialogTitle');
  overlay.innerHTML = `
    <div class="app-dialog__panel error-dialog__panel">
      <header class="app-dialog__header error-dialog__header">
        <h2 id="errorDialogTitle" class="app-dialog__title app-dialog__title--danger">Error</h2>
        <button type="button" class="app-dialog__close" id="errorDialogClose" aria-label="Close">×</button>
      </header>
      <p class="app-dialog__summary" id="errorDialogSummary"></p>
      <label class="app-dialog__label" for="errorDialogDetails" id="errorDialogDetailsLabel">Details</label>
      <textarea id="errorDialogDetails" class="app-dialog__details" readonly rows="12" spellcheck="false"></textarea>
      <footer class="app-dialog__actions">
        <button type="button" id="errorDialogCopy">Copy</button>
        <button type="button" class="primary" id="errorDialogOk">Close</button>
      </footer>
      <p class="app-dialog__status" id="errorDialogCopyStatus" aria-live="polite"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => hideErrorDialog();
  overlay.querySelector('#errorDialogClose').addEventListener('click', close);
  overlay.querySelector('#errorDialogOk').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('#errorDialogCopy').addEventListener('click', async () => {
    const statusEl = overlay.querySelector('#errorDialogCopyStatus');
    try {
      await navigator.clipboard.writeText(lastDetailText);
      statusEl.textContent = t('errorDialog.copied');
    } catch {
      const ta = overlay.querySelector('#errorDialogDetails');
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        statusEl.textContent = t('errorDialog.copied');
      } catch {
        statusEl.textContent = t('errorDialog.copyFailed');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      hideErrorDialog();
    }
  });

  dialogEls = {
    overlay,
    title: overlay.querySelector('#errorDialogTitle'),
    summary: overlay.querySelector('#errorDialogSummary'),
    details: overlay.querySelector('#errorDialogDetails'),
    detailsLabel: overlay.querySelector('#errorDialogDetailsLabel'),
    copyBtn: overlay.querySelector('#errorDialogCopy'),
    okBtn: overlay.querySelector('#errorDialogOk'),
    copyStatus: overlay.querySelector('#errorDialogCopyStatus'),
    closeBtn: overlay.querySelector('#errorDialogClose'),
  };
  return dialogEls;
}

function resolveSummary(options) {
  if (!options) return '';
  if (options.summaryKey) return t(options.summaryKey);
  const raw = options.error?.message || '';
  if (typeof raw === 'string' && raw.startsWith('i18n:')) {
    return translateError(options.error);
  }
  return options.summary || t('errorDialog.unexpected');
}

function applyLocaleToChrome() {
  const els = ensureDialog();
  els.title.textContent = t('errorDialog.title');
  els.detailsLabel.textContent = t('errorDialog.details');
  els.copyBtn.textContent = t('errorDialog.copy');
  els.okBtn.textContent = t('errorDialog.close');
  els.closeBtn.setAttribute('aria-label', t('errorDialog.close'));
}

export function refreshErrorDialogLocale() {
  if (!dialogEls) return;
  applyLocaleToChrome();
  if (open && lastOptions) {
    const summary = resolveSummary(lastOptions);
    lastOptions.summary = summary;
    const detailText = buildDetailText({
      summary,
      details: lastOptions.details || '',
      error: lastOptions.error,
      context: lastOptions.context || {},
    });
    lastDetailText = detailText;
    dialogEls.summary.textContent = summary;
    dialogEls.details.value = detailText;
    dialogEls.copyStatus.textContent = '';
  }
}

export function hideErrorDialog() {
  if (!dialogEls) return;
  dialogEls.overlay.classList.add('hidden');
  dialogEls.copyStatus.textContent = '';
  open = false;
  lastOptions = null;
  if (previousFocus && typeof previousFocus.focus === 'function') {
    previousFocus.focus();
  }
  previousFocus = null;
}

/**
 * @param {{
 *   summary?: string,
 *   summaryKey?: string,
 *   details?: string,
 *   error?: unknown,
 *   context?: Record<string, unknown>
 * }} options
 */
export function showErrorDialog({
  summary = '',
  summaryKey = '',
  details = '',
  error = null,
  context = {},
} = {}) {
  const els = ensureDialog();
  if (!open) previousFocus = document.activeElement;

  lastOptions = { summary, summaryKey, details, error, context };
  const resolved = resolveSummary(lastOptions);
  lastOptions.summary = resolved;

  const detailText = buildDetailText({
    summary: resolved,
    details,
    error,
    context,
  });
  lastDetailText = detailText;

  applyLocaleToChrome();
  els.summary.textContent = resolved;
  els.details.value = detailText;
  els.copyStatus.textContent = '';
  els.overlay.classList.remove('hidden');
  open = true;
  els.okBtn.focus();
}

function themeLabel() {
  return getTheme() === 'light' ? t('errorDialog.themeLight') : t('errorDialog.themeDark');
}

function localeLabel() {
  return getLocale() === 'en' ? 'English' : '한국어';
}

function buildDetailText({ summary, details, error, context }) {
  const lines = [
    t('errorDialog.reportTitle'),
    '========================',
    `${t('errorDialog.reportTime')}: ${new Date().toISOString()}`,
    `${t('errorDialog.reportLocale')}: ${localeLabel()} (${getLocale()})`,
    `${t('errorDialog.reportTheme')}: ${themeLabel()}`,
    `${t('errorDialog.reportUrl')}: ${location.href}`,
    `${t('errorDialog.reportUa')}: ${navigator.userAgent}`,
    '',
    `${t('errorDialog.reportSummary')}:`,
    summary,
  ];

  if (details) {
    lines.push('', `${t('errorDialog.reportNotes')}:`, details);
  }

  if (context && Object.keys(context).length) {
    lines.push('', `${t('errorDialog.reportContext')}:`);
    for (const [key, value] of Object.entries(context)) {
      lines.push(`- ${key}: ${stringifyValue(value)}`);
    }
  }

  if (error) {
    const err = normalizeError(error);
    lines.push('', `${t('errorDialog.reportError')}:`);
    lines.push(`${t('errorDialog.reportName')}: ${err.name}`);
    lines.push(`${t('errorDialog.reportMessage')}: ${err.message}`);
    if (err.stack) {
      lines.push('', `${t('errorDialog.reportStack')}:`);
      lines.push(err.stack);
    }
  }

  return lines.join('\n');
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: translateError(error),
      stack: error.stack || '',
    };
  }
  return { name: 'Error', message: translateError(error), stack: '' };
}

function stringifyValue(value) {
  if (value == null) return String(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Soft validation tips stay inline; everything else is treated as serious. */
const SOFT_ERROR_KEYS = new Set([
  'error.selectImage',
  'error.apiUrl',
  'error.apiUnreachable',
  'error.apiHttp',
  'error.dreamspaceEmpty',
  'error.unknownMode',
  'error.heuristicEmpty',
]);

export function isSeriousError(error) {
  const raw = error?.message || String(error || '');
  if (raw.startsWith('i18n:')) {
    try {
      const payload = JSON.parse(raw.slice(5));
      return !SOFT_ERROR_KEYS.has(payload.key);
    } catch {
      return true;
    }
  }
  if (SOFT_ERROR_KEYS.has(raw)) return false;
  return true;
}

export function installGlobalErrorHandlers(onSerious) {
  window.addEventListener('error', (event) => {
    if (open) return;
    onSerious({
      summaryKey: 'errorDialog.unexpected',
      summary: t('errorDialog.unexpected'),
      error: event.error || event.message,
      context: {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (open) return;
    onSerious({
      summaryKey: 'errorDialog.unhandled',
      summary: t('errorDialog.unhandled'),
      error: event.reason,
      context: { type: 'unhandledrejection' },
    });
  });
}
