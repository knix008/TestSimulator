import { t } from '../i18n/index.js';

let dialogEls = null;
let previousFocus = null;
let cancelHandler = null;

function ensureDialog() {
  if (dialogEls) return dialogEls;

  const overlay = document.createElement('div');
  overlay.id = 'progressDialog';
  overlay.className = 'app-dialog progress-dialog hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'progressDialogTitle');
  overlay.innerHTML = `
    <div class="app-dialog__panel progress-dialog__panel">
      <header class="app-dialog__header">
        <h2 id="progressDialogTitle" class="app-dialog__title">Progress</h2>
      </header>
      <p class="app-dialog__summary" id="progressDialogMessage"></p>
      <div class="progress-dialog__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="progress-dialog__bar" id="progressDialogBar"></div>
      </div>
      <div class="progress-dialog__meta">
        <span id="progressDialogPercent">0%</span>
        <span id="progressDialogElapsed" class="progress-dialog__elapsed"></span>
        <span id="progressDialogPhase"></span>
      </div>
      <footer class="app-dialog__actions">
        <button type="button" id="progressDialogCancel">Cancel</button>
      </footer>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#progressDialogCancel').addEventListener('click', () => {
    cancelHandler?.();
  });

  dialogEls = {
    overlay,
    title: overlay.querySelector('#progressDialogTitle'),
    message: overlay.querySelector('#progressDialogMessage'),
    bar: overlay.querySelector('#progressDialogBar'),
    track: overlay.querySelector('.progress-dialog__track'),
    percent: overlay.querySelector('#progressDialogPercent'),
    elapsed: overlay.querySelector('#progressDialogElapsed'),
    phase: overlay.querySelector('#progressDialogPhase'),
    cancelBtn: overlay.querySelector('#progressDialogCancel'),
  };
  return dialogEls;
}

function applyLocaleToChrome() {
  const els = ensureDialog();
  if (!els.overlay.dataset.titleKey) {
    els.title.textContent = t('progressDialog.title');
  } else {
    els.title.textContent = t(els.overlay.dataset.titleKey);
  }
  els.cancelBtn.textContent = t('progressDialog.cancel');
}

export function refreshProgressDialogLocale() {
  if (!dialogEls || dialogEls.overlay.classList.contains('hidden')) return;
  applyLocaleToChrome();
}

/**
 * @param {{ titleKey?: string, message?: string, percent?: number, indeterminate?: boolean, cancelable?: boolean, onCancel?: () => void }} [options]
 */
export function showProgressDialog(options = {}) {
  const els = ensureDialog();
  previousFocus = document.activeElement;
  els.overlay.dataset.titleKey = options.titleKey || 'progressDialog.title';
  applyLocaleToChrome();
  els.message.textContent = options.message || '';
  els.phase.textContent = '';
  els.elapsed.textContent = '';
  updateProgressDialog({
    percent: options.indeterminate ? undefined : (options.percent ?? 0),
    indeterminate: Boolean(options.indeterminate),
  });
  els.cancelBtn.classList.toggle('hidden', options.cancelable === false);
  cancelHandler = typeof options.onCancel === 'function' ? options.onCancel : null;
  els.overlay.classList.remove('hidden');
  els.cancelBtn.focus();
}

/**
 * @param {{
 *   percent?: number,
 *   message?: string,
 *   phase?: string,
 *   indeterminate?: boolean,
 *   elapsedMs?: number,
 *   detail?: string,
 * }} info
 */
export function updateProgressDialog(info = {}) {
  const els = ensureDialog();

  if (info.indeterminate === true) {
    els.overlay.classList.add('progress-dialog--indeterminate');
    els.bar.style.width = '';
    els.percent.textContent = t('progressDialog.working');
    els.track?.removeAttribute('aria-valuenow');
    els.track?.setAttribute('aria-valuetext', t('progressDialog.working'));
  } else if (info.indeterminate === false || Number.isFinite(info.percent)) {
    els.overlay.classList.remove('progress-dialog--indeterminate');
    els.track?.removeAttribute('aria-valuetext');
  }

  const percent = Number.isFinite(info.percent)
    ? Math.max(0, Math.min(100, Math.round(info.percent)))
    : null;
  if (percent != null && info.indeterminate !== true) {
    els.bar.style.width = `${percent}%`;
    els.percent.textContent = `${percent}%`;
    els.track?.setAttribute('aria-valuenow', String(percent));
  }

  if (typeof info.message === 'string' && info.message) {
    els.message.textContent = info.message;
  }

  if ('detail' in info) {
    els.elapsed.textContent = typeof info.detail === 'string' ? info.detail : '';
  } else if (Number.isFinite(info.elapsedMs)) {
    els.elapsed.textContent = formatElapsed(info.elapsedMs);
  }

  if (typeof info.phase === 'string') {
    const phaseKey = `progressDialog.phase.${info.phase}`;
    const translated = t(phaseKey);
    els.phase.textContent = translated === phaseKey ? '' : translated;
  }
}

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return t('progressDialog.elapsed', {
    time: `${m}:${String(s).padStart(2, '0')}`,
  });
}

export function hideProgressDialog() {
  if (!dialogEls) return;
  dialogEls.overlay.classList.add('hidden');
  dialogEls.overlay.classList.remove('progress-dialog--indeterminate');
  cancelHandler = null;
  const focusEl = previousFocus;
  previousFocus = null;
  if (focusEl && typeof focusEl.focus === 'function') {
    try { focusEl.focus(); } catch { /* ignore */ }
  }
}

/**
 * Show a progress dialog while running an async task.
 * @template T
 * @param {{
 *   titleKey?: string,
 *   cancelable?: boolean,
 *   indeterminate?: boolean,
 *   run: (update: typeof updateProgressDialog, signal: AbortSignal) => Promise<T>,
 * }} options
 * @returns {Promise<T | { canceled: true }>}
 */
export async function runWithProgressDialog(options) {
  const ac = new AbortController();
  let canceled = false;
  showProgressDialog({
    titleKey: options.titleKey || 'progressDialog.title',
    cancelable: options.cancelable !== false,
    percent: 0,
    indeterminate: Boolean(options.indeterminate),
    onCancel: () => {
      canceled = true;
      ac.abort();
      updateProgressDialog({
        message: t('progressDialog.canceled'),
        phase: 'canceled',
        indeterminate: false,
        percent: 0,
      });
    },
  });

  try {
    const result = await options.run(updateProgressDialog, ac.signal);
    if (canceled || ac.signal.aborted) {
      return { canceled: true };
    }
    return result;
  } catch (err) {
    if (canceled || ac.signal.aborted || err?.code === 'CANCELED' || err?.message === 'canceled') {
      return { canceled: true };
    }
    throw err;
  } finally {
    hideProgressDialog();
  }
}
