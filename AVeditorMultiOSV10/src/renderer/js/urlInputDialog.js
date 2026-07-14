import { Icons } from './icons.js';

const HISTORY_KEY = 'av-editor-stream-link-history';
const HISTORY_MAX = 10;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
}
export function addToHistory(entry) {
  const h = loadHistory().filter(x => x.url !== entry.url);
  h.unshift({ url: entry.url, type: entry.type, title: entry.title || entry.url });
  saveHistory(h);
}
export function removeFromHistory(url) {
  saveHistory(loadHistory().filter(x => x.url !== url));
}

/**
 * Detect the type of a URL string.
 * @returns {'youtube'|'rtsp'|'http'|null}
 */
export function detectUrlType(url) {
  if (!url || typeof url !== 'string') return null;
  const s = url.trim();
  try {
    const u = new URL(s);
    // VideoPlayerV10: rtsp / http / https / rtmp (+ rtsps for cameras)
    if (u.protocol === 'rtsp:' || u.protocol === 'rtsps:') return 'rtsp';
    if (u.protocol === 'rtmp:' || u.protocol === 'rtmps:') return 'http';
    // VideoPlayerV10 IsYouTubeUrl: host contains youtube.com | youtu.be
    const host = (u.hostname || '').toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if (u.protocol === 'http:' || u.protocol === 'https:') return 'http';
  } catch {
    return null;
  }
  return null;
}

function formatDuration(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

/**
 * Show a modal dialog for entering a YouTube or stream URL.
 * Resolves with { url, type, title, duration, author } on confirm, or null on cancel.
 */
export function showUrlInputDialog(i18n) {
  const t = (k) => i18n.t(k);

  return new Promise((resolve) => {
    // ── Overlay ──
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay url-dialog-overlay';
    overlay.tabIndex = -1;

    // ── Card ──
    const card = document.createElement('div');
    card.className = 'custom-dialog-card url-dialog-card';

    // ── Title row ──
    const titleRow = document.createElement('div');
    titleRow.className = 'url-dialog-title-row';
    titleRow.innerHTML = `
      <span class="url-dialog-icon-slot">${Icons.link}</span>
      <span class="custom-dialog-title url-dialog-title-text">${t('streamLinks.dialogTitle')}</span>
    `;
    card.appendChild(titleRow);

    // ── Input row ──
    const inputRow = document.createElement('div');
    inputRow.className = 'url-dialog-input-row';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'url-type-badge url-type-none';
    typeBadge.title = '';
    inputRow.appendChild(typeBadge);

    const input = document.createElement('input');
    input.type = 'url';
    input.className = 'url-dialog-input';
    input.placeholder = t('streamLinks.dialogPlaceholder');
    input.spellcheck = false;
    input.autocomplete = 'off';
    inputRow.appendChild(input);

    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'url-paste-btn';
    pasteBtn.title = 'Paste from clipboard';
    pasteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke="currentColor" stroke-width="1.8" fill="none"/><rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>`;
    inputRow.appendChild(pasteBtn);

    card.appendChild(inputRow);

    // ── Preview card (hidden initially) ──
    const previewCard = document.createElement('div');
    previewCard.className = 'url-preview-card';
    previewCard.hidden = true;
    card.appendChild(previewCard);

    // ── Hint / status row ──
    const hintRow = document.createElement('div');
    hintRow.className = 'url-dialog-hint-row';

    const hint = document.createElement('span');
    hint.className = 'url-dialog-hint';
    hint.textContent = t('streamLinks.dialogHint');
    hintRow.appendChild(hint);

    const statusEl = document.createElement('span');
    statusEl.className = 'url-dialog-status';
    statusEl.hidden = true;
    hintRow.appendChild(statusEl);

    card.appendChild(hintRow);

    // ── History section ──
    const historySection = document.createElement('div');
    historySection.className = 'url-history-section';
    card.appendChild(historySection);

    const renderHistory = () => {
      const items = loadHistory();
      historySection.hidden = items.length === 0;
      historySection.innerHTML = '';
      if (!items.length) return;

      const hdr = document.createElement('div');
      hdr.className = 'url-history-header';
      hdr.textContent = t('streamLinks.recentLinks');
      historySection.appendChild(hdr);

      const list = document.createElement('div');
      list.className = 'url-history-list';
      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'url-history-item';

        const icon = document.createElement('span');
        icon.className = `url-type-badge url-type-${item.type || 'none'}`;
        icon.innerHTML = item.type === 'youtube' ? Icons.youtube
          : item.type === 'rtsp' ? Icons.rtsp : Icons.link;
        row.appendChild(icon);

        const label = document.createElement('span');
        label.className = 'url-history-label';
        label.title = item.url;
        label.textContent = item.title && item.title !== item.url
          ? item.title : item.url;
        row.appendChild(label);

        const rmBtn = document.createElement('button');
        rmBtn.className = 'url-history-rm';
        rmBtn.innerHTML = Icons.close;
        rmBtn.title = t('streamLinks.removeLink');
        rmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeFromHistory(item.url);
          renderHistory();
        });
        row.appendChild(rmBtn);

        row.addEventListener('click', () => {
          input.value = item.url;
          onInput();
          input.focus();
        });

        list.appendChild(row);
      });
      historySection.appendChild(list);
    };
    renderHistory();

    // ── Spinner ──
    const spinner = document.createElement('div');
    spinner.className = 'url-dialog-spinner';
    spinner.hidden = true;
    spinner.innerHTML = `<div class="url-spinner-ring"></div><span class="url-spinner-text"></span>`;
    card.appendChild(spinner);

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = 'custom-dialog-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-dialog-btn';
    cancelBtn.innerHTML = `${Icons.close}<span>${t('dialog.cancel')}</span>`;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'custom-dialog-btn primary';
    confirmBtn.innerHTML = `${Icons.check}<span>${t('dialog.ok')}</span>`;
    confirmBtn.disabled = true;

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // ── State ──
    let closed = false;
    let resolvedInfo = null; // { title, duration, author } from YouTube
    let currentType = null;

    // ── Helpers ──
    const close = (value) => {
      if (closed) return;
      closed = true;
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve(value);
    };

    const showStatus = (msg, isError = false) => {
      statusEl.textContent = msg;
      statusEl.hidden = !msg;
      statusEl.className = 'url-dialog-status' + (isError ? ' error' : '');
      hint.hidden = !!msg;
    };

    const setSpinner = (msg) => {
      if (msg) {
        spinner.hidden = false;
        spinner.querySelector('.url-spinner-text').textContent = msg;
      } else {
        spinner.hidden = true;
      }
    };

    const updateTypeBadge = (type) => {
      currentType = type;
      typeBadge.className = 'url-type-badge';
      typeBadge.innerHTML = '';
      if (type === 'youtube') {
        typeBadge.classList.add('url-type-youtube');
        typeBadge.innerHTML = Icons.youtube;
        typeBadge.title = 'YouTube';
      } else if (type === 'rtsp') {
        typeBadge.classList.add('url-type-rtsp');
        typeBadge.innerHTML = Icons.rtsp;
        typeBadge.title = 'RTSP Stream';
      } else if (type === 'http') {
        typeBadge.classList.add('url-type-http');
        typeBadge.innerHTML = Icons.link;
        typeBadge.title = 'HTTP/HTTPS Video';
      } else {
        typeBadge.classList.add('url-type-none');
      }
    };

    const showPreview = (info) => {
      previewCard.hidden = false;
      previewCard.innerHTML = `
        <div class="url-preview-info">
          ${info.thumbnailUrl
            ? `<img class="url-preview-thumb" src="${info.thumbnailUrl}" alt="" loading="lazy" crossorigin="anonymous"/>`
            : `<div class="url-preview-thumb-placeholder">${Icons.youtube}</div>`
          }
          <div class="url-preview-meta">
            <div class="url-preview-title">${escHtml(info.title)}</div>
            ${info.author ? `<div class="url-preview-author">${escHtml(info.author)}</div>` : ''}
            ${info.duration ? `<div class="url-preview-duration">${formatDuration(info.duration)}</div>` : ''}
          </div>
        </div>
      `;
    };

    const hidePreview = () => {
      previewCard.hidden = true;
      previewCard.innerHTML = '';
    };

    const escHtml = (s) => String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // ── URL change handler ──
    let debounceTimer = null;
    let lastInputUrl = '';

    const onInput = () => {
      const raw = input.value.trim();
      if (raw === lastInputUrl) return;
      lastInputUrl = raw;

      clearTimeout(debounceTimer);
      resolvedInfo = null;
      hidePreview();
      showStatus('');
      setSpinner('');

      if (!raw) {
        updateTypeBadge(null);
        confirmBtn.disabled = true;
        return;
      }

      const type = detectUrlType(raw);
      updateTypeBadge(type);

      if (!type) {
        showStatus(t('streamLinks.errorInvalidUrl'), true);
        confirmBtn.disabled = true;
        return;
      }

      confirmBtn.disabled = false;

      if (type === 'youtube' && window.electronAPI?.youtubeGetInfo) {
        // Debounce YouTube resolution so we don't fire on every keystroke
        debounceTimer = setTimeout(async () => {
          const urlSnapshot = raw;
          setSpinner(t('streamLinks.resolving'));
          confirmBtn.disabled = true;
          try {
            const info = await window.electronAPI.youtubeGetInfo(urlSnapshot);
            if (input.value.trim() !== urlSnapshot) return; // stale
            setSpinner('');
            if (info.ok) {
              resolvedInfo = info;
              showPreview(info);
              confirmBtn.disabled = false;
            } else {
              showStatus(info.error || t('streamLinks.errorUnsupported'), true);
              confirmBtn.disabled = false;
            }
          } catch (e) {
            if (input.value.trim() !== urlSnapshot) return;
            setSpinner('');
            showStatus(e.message || t('streamLinks.errorUnsupported'), true);
            confirmBtn.disabled = false;
          }
        }, 900);
      }
    };

    input.addEventListener('input', onInput);

    // ── Paste button ──
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          input.value = text.trim();
          onInput();
          input.focus();
        }
      } catch {
        input.focus();
      }
    });

    // ── Confirm ──
    const doConfirm = async () => {
      const raw = input.value.trim();
      if (!raw) return;
      const type = detectUrlType(raw);
      if (!type) { showStatus(t('streamLinks.errorInvalidUrl'), true); return; }

      if (type === 'rtsp') {
        showStatus(t('streamLinks.rtspWarning'));
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        await new Promise(r => setTimeout(r, 1400));
        close({ url: raw, type, title: raw });
        return;
      }

      // If YouTube already resolved during typing, use that info
      if (type === 'youtube' && resolvedInfo?.ok) {
        close({ url: raw, type, title: resolvedInfo.title, duration: resolvedInfo.duration, author: resolvedInfo.author });
        return;
      }

      // YouTube not yet resolved (user clicked OK quickly)
      if (type === 'youtube' && window.electronAPI?.youtubeGetInfo) {
        clearTimeout(debounceTimer);
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        setSpinner(t('streamLinks.resolving'));
        try {
          const info = await window.electronAPI.youtubeGetInfo(raw);
          setSpinner('');
          if (info.ok) {
            close({ url: raw, type, title: info.title, duration: info.duration, author: info.author });
          } else {
            showStatus(info.error || t('streamLinks.errorUnsupported'), true);
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
          }
        } catch (e) {
          setSpinner('');
          showStatus(e.message || t('streamLinks.errorUnsupported'), true);
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
        }
        return;
      }

      // HTTP or YouTube in web mode
      close({ url: raw, type, title: raw });
    };

    confirmBtn.addEventListener('click', doConfirm);
    cancelBtn.addEventListener('click', () => close(null));

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && !confirmBtn.disabled) doConfirm();
    });

    input.focus();
  });
}
