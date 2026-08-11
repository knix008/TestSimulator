/**
 * Detailed error popup with copy support.
 */

import { syncThemeToOverlays } from './themes.js';

function serializeUnknown(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    return [err.name, err.message, err.stack].filter(Boolean).join('\n');
  }
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

function mediaErrorDetail(mediaError) {
  if (!mediaError) return '';
  const names = {
    1: 'MEDIA_ERR_ABORTED',
    2: 'MEDIA_ERR_NETWORK',
    3: 'MEDIA_ERR_DECODE',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
  };
  const code = mediaError.code;
  const name = names[code] || `UNKNOWN(${code})`;
  const message = mediaError.message || '';
  return [`code: ${code} (${name})`, message ? `message: ${message}` : ''].filter(Boolean).join('\n');
}

export function buildErrorReport({
  title,
  message,
  detail = '',
  error = null,
  context = {},
  t = (k) => k
}) {
  const when = new Date().toISOString();
  const lines = [
    `${t('errorTitle')}: ${title || t('errorDefaultTitle')}`,
    `${t('errorTime')}: ${when}`,
    '',
    `${t('errorSummary')}:`,
    message || t('errorDefaultMessage'),
    ''
  ];

  const detailText = detail || serializeUnknown(error) || mediaErrorDetail(error);
  if (detailText) {
    lines.push(`${t('errorDetails')}:`, detailText, '');
  }

  const ctxEntries = Object.entries(context || {}).filter(([, v]) => v != null && v !== '');
  if (ctxEntries.length) {
    lines.push(`${t('errorContext')}:`);
    for (const [k, v] of ctxEntries) {
      lines.push(`- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
    lines.push('');
  }

  lines.push(
    `${t('errorEnv')}:`,
    `- userAgent: ${navigator.userAgent}`,
    `- platform: ${navigator.platform || ''}`,
    `- language: ${navigator.language || ''}`,
    `- href: ${location.href}`
  );

  return lines.join('\n');
}

export function createErrorDialogController({
  dialog,
  titleEl,
  messageEl,
  detailEl,
  copyBtn,
  closeBtn,
  copiedEl,
  t
}) {
  let lastReport = '';
  let copyTimer = 0;

  function show(options = {}) {
    const title = options.title || t('errorDefaultTitle');
    const message = options.message || t('errorDefaultMessage');
    const report = buildErrorReport({ ...options, title, message, t });
    lastReport = report;

    titleEl.textContent = title;
    messageEl.textContent = message;
    detailEl.value = report;
    if (copiedEl) {
      copiedEl.hidden = true;
      copiedEl.textContent = '';
    }
    // Ensure current theme CSS variables are applied to the top-layer dialog.
    try {
      syncThemeToOverlays();
    } catch { /* ignore */ }

    dialog.dataset.blocking = 'true';
    dialog.style.background = 'transparent';
    dialog.style.backgroundColor = 'transparent';
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => detailEl.focus());
  }

  function copyViaExecCommand(text) {
    detailEl.focus();
    detailEl.select();
    detailEl.setSelectionRange?.(0, text.length);
    const ok = document.execCommand('copy');
    if (ok) return true;
    // Fallback when readonly textarea select is blocked in some hosts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    ta.remove();
    return copied;
  }

  function showCopyResult(ok) {
    if (!copiedEl) return;
    copiedEl.hidden = false;
    copiedEl.textContent = ok ? t('errorCopied') : t('errorCopyFailed');
    if (copyTimer) clearTimeout(copyTimer);
    if (ok) {
      copyTimer = window.setTimeout(() => {
        copiedEl.hidden = true;
      }, 1800);
    }
  }

  async function copy() {
    const text = detailEl.value || lastReport;
    if (!text) {
      showCopyResult(false);
      return false;
    }
    try {
      if (window.desktopAPI?.copyText) {
        await window.desktopAPI.copyText(text);
        showCopyResult(true);
        return true;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showCopyResult(true);
        return true;
      }
      const ok = copyViaExecCommand(text);
      showCopyResult(ok);
      return ok;
    } catch {
      try {
        const ok = copyViaExecCommand(text);
        showCopyResult(ok);
        return ok;
      } catch {
        showCopyResult(false);
        return false;
      }
    }
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  copyBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    copy();
  });
  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    close();
  });

  return { show, copy, close };
}

export { mediaErrorDetail, serializeUnknown };
