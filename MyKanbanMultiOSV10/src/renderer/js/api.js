/* API 클라이언트 — 모든 fetch 요청을 래핑 */
const API = (() => {
  const BASE = '/api';

  async function request(method, path, body, isFormData = false) {
    const opts = { method, credentials: 'include' };
    if (body !== undefined) {
      if (isFormData) {
        opts.body = body;
      } else {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || `HTTP ${res.status}`;
      // Server errors (5xx): show detailed popup; client errors (4xx): throw for caller
      if (res.status >= 500 && typeof showError !== 'undefined') {
        showError(I18n.t('serverError') + ` (${res.status})`, `${I18n.t('request')}: ${method} ${path}\n\n${I18n.t('error')}: ${msg}${data.stack ? '\n\n' + data.stack : ''}`);
        throw new Error(msg);
      }
      throw new Error(msg);
    }
    return data;
  }

  return {
    get:    (path)        => request('GET',    path),
    post:   (path, body)  => request('POST',   path, body),
    put:    (path, body)  => request('PUT',    path, body),
    patch:  (path, body)  => request('PATCH',  path, body),
    delete: (path)        => request('DELETE', path),
    upload: (path, formData) => request('POST', path, formData, true),
  };
})();

/* 공통 Toast 알림 */
function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.remove(); }, duration);
}

/* 자동 저장 (DB) */
const AutoSave = (() => {
  const sessions = new Map();

  function setIndicator(indicatorId, state) {
    if (!indicatorId) return;
    const el = document.getElementById(indicatorId);
    if (!el) return;
    const labels = {
      saving: I18n.t('autoSaving'),
      saved: I18n.t('autoSaved'),
      error: I18n.t('autoSaveFailed'),
    };
    el.textContent = labels[state] || '';
    el.className = `autosave-status autosave-${state}`;
  }

  function start(key, { collect, save, debounceMs = 600, indicatorId = null, initialPayload = null }) {
    stop(key);
    sessions.set(key, {
      timer: null,
      saving: false,
      lastPayload: initialPayload != null ? JSON.stringify(initialPayload) : null,
      collect,
      save,
      debounceMs,
      indicatorId,
    });
  }

  function stop(key) {
    const session = sessions.get(key);
    if (session?.timer) clearTimeout(session.timer);
    sessions.delete(key);
  }

  function schedule(key) {
    const session = sessions.get(key);
    if (!session) return;
    clearTimeout(session.timer);
    session.timer = setTimeout(() => { flush(key); }, session.debounceMs);
  }

  async function flush(key) {
    const session = sessions.get(key);
    if (!session) return true;
    clearTimeout(session.timer);
    session.timer = null;
    if (session.saving) return true;

    const payload = session.collect();
    if (!payload) {
      if (key.startsWith('card:') && document.getElementById('ec-title') && !document.getElementById('ec-title').value.trim()) {
        showToast(I18n.t('cardTitle') + ' ' + I18n.t('fieldRequired'), 'error');
        return false;
      }
      if (key.startsWith('board:') && document.getElementById('edit-board-title') && !document.getElementById('edit-board-title').value.trim()) {
        showToast(I18n.t('boardName') + ' ' + I18n.t('fieldRequired'), 'error');
        return false;
      }
      return true;
    }
    const payloadKey = JSON.stringify(payload);
    if (payloadKey === session.lastPayload) return true;

    session.saving = true;
    setIndicator(session.indicatorId, 'saving');
    try {
      await session.save(payload);
      session.lastPayload = payloadKey;
      setIndicator(session.indicatorId, 'saved');
      return true;
    } catch (err) {
      setIndicator(session.indicatorId, 'error');
      showToast(err.message, 'error');
      return false;
    } finally {
      session.saving = false;
    }
  }

  async function flushAll() {
    let allOk = true;
    for (const key of [...sessions.keys()]) {
      const ok = await flush(key);
      if (!ok) allOk = false;
    }
    return allOk;
  }

  return { start, stop, schedule, flush, flushAll };
})();

/* 공통 Modal */
const Modal = (() => {
  const SIZES = { sm: 'modal-sm', md: 'modal-md', lg: 'modal-lg', xl: 'modal-xl' };
  let beforeCloseHook = null;

  function btn({ label, icon = '', onclick = '', variant = 'primary', extraClass = '', type = 'button', attrs = '' }) {
    const iconHtml = icon ? `<span class="btn-icon-label" aria-hidden="true">${icon}</span>` : '';
    const cls = ['btn', `btn-${variant}`, extraClass].filter(Boolean).join(' ');
    const onclickAttr = onclick ? ` onclick="${onclick}"` : '';
    const attrsAttr = attrs ? ` ${attrs}` : '';
    return `<button type="${type}" class="${cls}"${onclickAttr}${attrsAttr}>${iconHtml}<span class="btn-label">${escHtml(label)}</span></button>`;
  }

  function titleHtmlFromParts(title, icon) {
    if (!title) return '';
    const iconHtml = icon ? `<span class="modal-title-icon" aria-hidden="true">${icon}</span>` : '';
    return `${iconHtml}<span class="modal-title-text">${escHtml(title)}</span>`;
  }

  function focusModal() {
    const box = document.getElementById('modal-box');
    const input = box.querySelector('.modal-body input:not([readonly]):not([disabled]), .modal-body textarea:not([readonly]), .modal-body select:not([disabled])');
    if (input) requestAnimationFrame(() => input.focus());
  }

  function open(html) {
    document.getElementById('modal-box').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    focusModal();
  }

  function doClose() {
    beforeCloseHook = null;
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-box').innerHTML = '';
    document.body.style.overflow = '';
  }

  async function close() {
    if (confirmResolve) {
      resolveConfirm(false);
      return;
    }
    if (beforeCloseHook) {
      const hook = beforeCloseHook;
      try {
        const ok = await hook();
        if (ok === false) return;
      } catch {
        return;
      }
    }
    doClose();
  }

  function forceClose() {
    beforeCloseHook = null;
    doClose();
  }

  function setBeforeClose(fn) {
    beforeCloseHook = fn || null;
  }

  function clearBeforeClose() {
    beforeCloseHook = null;
  }

  function closeOnOverlay(e) {
    if (e.target === document.getElementById('modal-overlay')) {
      if (confirmResolve) resolveConfirm(false);
      else close();
    }
  }

  function dialog({ title, titleHtml, icon, body = '', footer = '', size = 'md', type = 'default' }) {
    if (!confirmResolve) beforeCloseHook = null;
    const sizeClass = SIZES[size] || SIZES.md;
    const typeClass = type !== 'default' ? ` modal-${type}` : '';
    const heading = titleHtml || titleHtmlFromParts(title, icon);
    const header = heading ? `
      <div class="modal-header">
        <h2 class="modal-title" id="modal-title">${heading}</h2>
        <button type="button" class="modal-close" onclick="Modal.close()" aria-label="${escAttr(I18n.t('close'))}">&#10005;</button>
      </div>` : `
      <div class="modal-header modal-header-minimal">
        <button type="button" class="modal-close" onclick="Modal.close()" aria-label="${escAttr(I18n.t('close'))}">&#10005;</button>
      </div>`;

    open(`
      <div class="modal-dialog ${sizeClass}${typeClass}" role="dialog" aria-modal="true"${heading ? ' aria-labelledby="modal-title"' : ''}>
        ${header}
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>`);
  }

  function footerCancelPrimary(primaryLabel, primaryOnclick, { left = '', cancel = true, primaryIcon = '✓', cancelIcon = '✕' } = {}) {
    return `
      ${left ? `<div class="modal-footer-left">${left}</div>` : ''}
      ${cancel ? btn({ label: I18n.t('cancel'), icon: cancelIcon, variant: 'secondary', onclick: 'Modal.close()' }) : ''}
      ${btn({ label: primaryLabel, icon: primaryIcon, variant: 'primary', onclick: primaryOnclick })}`;
  }

  let confirmResolve = null;
  let confirmSnapshot = null;

  function resolvePendingConfirm(result) {
    if (!confirmResolve) return;
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(result);
  }

  function confirm({
    title,
    message,
    icon = '⚠️',
    confirmLabel,
    confirmIcon = '🗑️',
    cancelIcon = '✕',
    danger = true,
    size = 'sm',
  }) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-overlay');
      const wasOpen = !overlay.classList.contains('hidden');
      confirmSnapshot = wasOpen ? document.getElementById('modal-box').innerHTML : null;
      confirmResolve = resolve;
      dialog({
        title: title || I18n.t('confirmTitle'),
        icon,
        type: 'confirm',
        size,
        body: `<p class="modal-message modal-confirm-message">${escHtml(message)}</p>`,
        footer: `
          ${btn({ label: I18n.t('cancel'), icon: cancelIcon, variant: 'secondary', onclick: 'Modal.resolveConfirm(false)' })}
          ${btn({
            label: confirmLabel || I18n.t('delete'),
            icon: confirmIcon,
            variant: danger ? 'danger' : 'primary',
            onclick: 'Modal.resolveConfirm(true)',
          })}`,
      });
    });
  }

  function resolveConfirm(result) {
    const snapshot = confirmSnapshot;
    resolvePendingConfirm(result);
    confirmSnapshot = null;
    if (!result && snapshot) {
      document.getElementById('modal-box').innerHTML = snapshot;
      document.getElementById('modal-overlay').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      return;
    }
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-box').innerHTML = '';
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal-overlay').classList.contains('hidden')) {
      if (confirmResolve) resolveConfirm(false);
      else close();
    }
  });

  return { open, close, forceClose, setBeforeClose, clearBeforeClose, closeOnOverlay, dialog, btn, footerCancelPrimary, confirm, resolveConfirm };
})();

/* 오류 상세 팝업 — 내용 복사 가능, 비반전 표시 */
function buildErrorDialogText(title, details) {
  const body = String(details || I18n.t('unknownError'));
  const heading = String(title || I18n.t('error')).trim();
  return heading ? `${heading}\n\n${body}` : body;
}

async function copyErrorDialogText() {
  const el = document.getElementById('err-detail-text');
  const text = el?.value || el?.dataset.copyText || '';
  if (!text) {
    showToast(I18n.t('copyFailed'), 'error');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast(I18n.t('errorCopied'), 'success');
      return;
    }
  } catch {}
  if (el) {
    el.focus();
    el.select();
    try {
      if (document.execCommand('copy')) {
        showToast(I18n.t('errorCopied'), 'success');
        return;
      }
    } catch {}
  }
  showToast(I18n.t('copyFailed'), 'error');
}

function showError(title, details) {
  const text = buildErrorDialogText(title, details);
  Modal.dialog({
    title: title || I18n.t('error'),
    icon: '⚠️',
    type: 'error',
    size: 'lg',
    body: `
      <p class="modal-error-hint">${escHtml(I18n.t('errorCopyHint'))}</p>
      <textarea id="err-detail-text" class="modal-error-text" readonly spellcheck="false" data-copy-text="${escAttr(text)}">${escHtml(text)}</textarea>`,
    footer: `
      <div class="modal-footer-left">
        ${Modal.btn({
          label: I18n.t('copy'),
          icon: '📋',
          variant: 'secondary',
          onclick: 'copyErrorDialogText()',
        })}
      </div>
      ${Modal.btn({ label: I18n.t('close'), icon: '✕', variant: 'primary', onclick: 'Modal.close()' })}`,
  });
  requestAnimationFrame(() => {
    const el = document.getElementById('err-detail-text');
    if (el) el.focus();
  });
}

/* 날짜 유틸 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(I18n.getLang() === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' });
}

function dueDateClass(dateStr) {
  if (!dateStr) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dateStr); due.setHours(0,0,0,0);
  const diff = (due - today) / 86400000;
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'soon';
  return 'ok';
}

function fileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)}KB`;
  return `${(bytes/1024/1024).toFixed(1)}MB`;
}

function icon(name, variant = 'default') {
  const cls = ['ui-icon', variant !== 'default' ? `ui-icon-${variant}` : ''].filter(Boolean).join(' ');
  const svg = (paths) =>
    `<svg class="${cls}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  switch (name) {
    case 'user':
      return svg('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>');
    case 'users':
      return svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
    case 'userCog':
      return svg('<circle cx="9" cy="7" r="4"/><path d="M4 20c0-3 2.5-5.5 5-5.5"/><circle cx="18" cy="9" r="2.5"/><path d="M18 6.5V5"/><path d="M18 13v-1.5"/><path d="M20.1 7.1l1-1"/><path d="M14.9 10.9l1-1"/><path d="M20.1 10.9l-1-1"/><path d="M14.9 7.1l-1-1"/>');
    case 'chart':
      return svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>');
    case 'export':
      return svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
    default:
      return '';
  }
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
