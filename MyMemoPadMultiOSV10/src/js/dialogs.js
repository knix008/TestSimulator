import { t } from './i18n.js';

export function showAlert(message, title) {
  const dialog = document.getElementById('alert-dialog');
  document.getElementById('alert-title').textContent = title || t('common.info');
  document.getElementById('alert-message').textContent = message;
  if (!dialog.open) dialog.showModal();
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve();
    };
    dialog.addEventListener('close', onClose);
  });
}

export function showConfirm(message, title) {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-title').textContent = title || t('common.info');
  document.getElementById('confirm-message').textContent = message;
  if (!dialog.open) dialog.showModal();
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'yes');
    };
    dialog.addEventListener('close', onClose);
  });
}

export function initErrorDialog() {
  const dialog = document.getElementById('error-dialog');
  const detail = document.getElementById('error-detail');
  const hint = document.getElementById('error-hint');
  const copyBtn = document.getElementById('error-copy');
  const copied = document.getElementById('error-copied');

  copyBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const text = detail.value;
    try {
      if (window.desktopAPI?.copyText) await window.desktopAPI.copyText(text);
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else throw new Error('no clipboard');
      copied.hidden = false;
      copied.textContent = t('error.dialog.copied');
    } catch {
      copied.hidden = false;
      copied.textContent = t('error.dialog.copyFailed');
    }
  });

  function show(options = {}) {
    hint.textContent = options.terminating ? t('error.dialog.hint.terminating') : t('error.dialog.hint');
    const lines = [
      `MyMemoPad ${options.version || ''}`.trim(),
      `Time: ${new Date().toISOString()}`,
      `Source: ${options.source || 'UI'}`,
      `OS: ${navigator.userAgent}`,
      '',
      options.detail || options.message || t('error.dialog.hint')
    ];
    detail.value = lines.join('\n');
    copied.hidden = true;
    if (!dialog.open) dialog.showModal();
  }

  window.addEventListener('error', (event) => {
    show({
      source: 'window.onerror',
      detail: [event.message, event.filename, event.lineno, event.error?.stack].filter(Boolean).join('\n')
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    show({
      source: 'unhandledrejection',
      detail: reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason)
    });
  });

  return { show };
}
