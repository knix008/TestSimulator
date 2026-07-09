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

/* 공통 Modal */
const Modal = (() => {
  const SIZES = { sm: 'modal-sm', md: 'modal-md', lg: 'modal-lg', xl: 'modal-xl' };

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

  function close() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-box').innerHTML = '';
    document.body.style.overflow = '';
  }

  function closeOnOverlay(e) {
    if (e.target === document.getElementById('modal-overlay')) close();
  }

  function dialog({ title, titleHtml, body = '', footer = '', size = 'md', type = 'default' }) {
    const sizeClass = SIZES[size] || SIZES.md;
    const typeClass = type !== 'default' ? ` modal-${type}` : '';
    const heading = titleHtml || (title ? escHtml(title) : '');
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

  function footerCancelPrimary(primaryLabel, primaryOnclick, { left = '', cancel = true } = {}) {
    return `
      ${left ? `<div class="modal-footer-left">${left}</div>` : ''}
      ${cancel ? `<button type="button" class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>` : ''}
      <button type="button" class="btn btn-primary" onclick="${primaryOnclick}">${primaryLabel}</button>`;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal-overlay').classList.contains('hidden')) close();
  });

  return { open, close, closeOnOverlay, dialog, footerCancelPrimary };
})();

/* 오류 상세 팝업 — 내용 복사 가능, 비반전 표시 */
function showError(title, details) {
  const text = String(details || I18n.t('unknownError'));
  Modal.dialog({
    titleHtml: `<span class="modal-error-icon" aria-hidden="true">&#9888;</span><span>${escHtml(title || I18n.t('error'))}</span>`,
    type: 'error',
    size: 'lg',
    body: `<textarea id="err-detail-text" class="modal-error-text" readonly spellcheck="false">${escHtml(text)}</textarea>`,
    footer: `
      <button type="button" class="btn btn-secondary" onclick="
        const el = document.getElementById('err-detail-text');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(el.value).then(()=>showToast(I18n.t('errorCopied'),'success'));
        } else { el.select(); document.execCommand('copy'); showToast(I18n.t('copied'),'success'); }
      ">&#128203; ${I18n.t('copy')}</button>
      <button type="button" class="btn btn-primary" onclick="Modal.close()">${I18n.t('close')}</button>`,
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

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
