import { Icons } from './icons.js';

/**
 * Parse scene-analysis JSONL into meta + scenes.
 * @param {string} text
 */
export function parseAnalysisJsonl(text) {
  const meta = { type: 'meta' };
  const scenes = [];
  let status = null;
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;
    if (obj.type === 'meta') Object.assign(meta, obj);
    else if (obj.type === 'scene') scenes.push(obj);
    else if (obj.type === 'done' || obj.type === 'cancelled') status = obj;
  }
  scenes.sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  return { meta, scenes, status };
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Show a modal viewer for an analysis JSONL file or in-memory text.
 * @param {object} opts
 * @param {import('./i18n.js').I18n} opts.i18n
 * @param {string} [opts.filePath]
 * @param {string} [opts.text]
 * @param {(start:number)=>void} [opts.onSeek]
 * @param {()=>void} [opts.onOpenOther]
 * @returns {Promise<void>}
 */
export async function showAnalysisViewer({ i18n, filePath = null, text = null, onSeek = null, onOpenOther = null } = {}) {
  const t = (k, p) => i18n.t(k, p);
  let sourcePath = filePath;
  let raw = text;

  if (raw == null && sourcePath && window.electronAPI?.readTextFile) {
    const res = await window.electronAPI.readTextFile(sourcePath);
    if (!res?.ok) {
      throw new Error(res?.error || t('ollama.viewerLoadFailed'));
    }
    raw = res.text;
  }

  if (raw == null || !String(raw).trim()) {
    throw new Error(t('ollama.viewerEmpty'));
  }

  const { meta, scenes, status } = parseAnalysisJsonl(raw);
  const displayPath = sourcePath
    || meta?.source?.name
    || t('ollama.viewerUntitled');

  return new Promise((resolve) => {
    const existing = document.getElementById('analysis-viewer-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'analysis-viewer-overlay';
    overlay.className = 'analysis-viewer-overlay';
    overlay.tabIndex = -1;

    const srcLabel = meta?.source?.name || meta?.source?.path || '—';
    const lang = meta?.language || '—';
    const model = meta?.model || '—';
    const interval = meta?.intervalSec != null ? `${meta.intervalSec}s` : '—';
    const statusLabel = status?.type === 'cancelled'
      ? t('ollama.cancelled')
      : status?.type === 'done'
        ? t('ollama.done')
        : '';

    const sceneRows = scenes.length
      ? scenes.map((sc, i) => {
        const start = Number(sc.start) || 0;
        const end = Number(sc.end) || start;
        const desc = sc.description || sc.error || '—';
        const errClass = sc.error ? ' is-error' : '';
        return `
          <button type="button" class="analysis-scene-row${errClass}" data-start="${start}" data-index="${i}">
            <div class="analysis-scene-time">${escapeHtml(formatTime(start))} – ${escapeHtml(formatTime(end))}</div>
            <div class="analysis-scene-body">${escapeHtml(desc)}</div>
          </button>
        `;
      }).join('')
      : `<div class="analysis-viewer-empty">${escapeHtml(t('ollama.viewerNoScenes'))}</div>`;

    overlay.innerHTML = `
      <div class="analysis-viewer-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('ollama.viewerTitle'))}">
        <div class="analysis-viewer-header">
          <div class="analysis-viewer-title">
            ${Icons.sparkles}
            <div>
              <h3>${escapeHtml(t('ollama.viewerTitle'))}</h3>
              <p class="analysis-viewer-path" title="${escapeHtml(displayPath)}">${escapeHtml(displayPath)}</p>
            </div>
          </div>
          <button type="button" class="analysis-viewer-close" id="analysis-viewer-close" title="${escapeHtml(t('dialog.cancel'))}">${Icons.close}</button>
        </div>
        <div class="analysis-viewer-meta">
          <span><strong>${escapeHtml(t('ollama.viewerSource'))}</strong> ${escapeHtml(srcLabel)}</span>
          <span><strong>${escapeHtml(t('ollama.viewerLanguage'))}</strong> ${escapeHtml(String(lang))}</span>
          <span><strong>${escapeHtml(t('ollama.model'))}</strong> ${escapeHtml(String(model))}</span>
          <span><strong>${escapeHtml(t('ollama.intervalSec'))}</strong> ${escapeHtml(String(interval))}</span>
          <span><strong>${escapeHtml(t('ollama.viewerScenes'))}</strong> ${scenes.length}</span>
          ${statusLabel ? `<span class="analysis-viewer-status">${escapeHtml(statusLabel)}</span>` : ''}
        </div>
        <div class="analysis-viewer-list" id="analysis-viewer-list">
          ${sceneRows}
        </div>
        <div class="analysis-viewer-footer">
          <button type="button" class="custom-dialog-btn" id="analysis-viewer-open">${Icons.open}<span>${escapeHtml(t('ollama.viewerOpenOther'))}</span></button>
          <button type="button" class="custom-dialog-btn primary" id="analysis-viewer-done">${Icons.check}<span>${escapeHtml(t('dialog.ok'))}</span></button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => {
      overlay.classList.remove('visible');
      const finish = () => {
        overlay.remove();
        resolve();
      };
      overlay.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 280);
    };

    overlay.querySelector('#analysis-viewer-close')?.addEventListener('click', close);
    overlay.querySelector('#analysis-viewer-done')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    overlay.querySelector('#analysis-viewer-list')?.addEventListener('click', (e) => {
      const row = e.target.closest('.analysis-scene-row');
      if (!row) return;
      overlay.querySelectorAll('.analysis-scene-row.is-active').forEach((el) => el.classList.remove('is-active'));
      row.classList.add('is-active');
      const start = Number(row.dataset.start);
      if (Number.isFinite(start) && onSeek) onSeek(start);
    });

    overlay.querySelector('#analysis-viewer-open')?.addEventListener('click', async () => {
      close();
      if (typeof onOpenOther === 'function') {
        setTimeout(() => onOpenOther(), 50);
      }
    });

    overlay.focus();
  });
}
