import { Icons } from './icons.js';
import { showUrlInputDialog, detectUrlType, addToHistory } from './urlInputDialog.js';
import { showAlert } from './dialog.js';

const STORAGE_KEY = 'av-editor-stream-links';

/**
 * Panel component that manages a list of YouTube / RTSP / HTTP stream links.
 * Rendered in #stream-links-panel inside the left sidebar.
 */
export class StreamLinks {
  constructor(container, { i18n, onSelect, onContextMenu }) {
    this.container = container;
    this.i18n = i18n;
    this.onSelect = onSelect;
    this.onContextMenu = onContextMenu;

    this._links = this._loadLinks();
    this._collapsed = localStorage.getItem('av-editor-stream-links-collapsed') === '1';
    this._downloadCallbackRegistered = false;
    this._downloadingId = null;
    this._downloadBusy = false;
    this._lastProgressAt = 0;
    this._lastProgressPct = -1;

    this._build();
    this._renderList();
    this._registerDownloadListener();
  }

  _t(key) { return this.i18n.t(key); }

  // ── Persistence ─────────────────────────────────────────────────────────────

  _loadLinks() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  _saveLinks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._links));
  }

  // ── Shell ────────────────────────────────────────────────────────────────────

  _build() {
    this.container.innerHTML = `
      <div class="sl-header">
        <span class="sl-title">${this._t('streamLinks.title')}</span>
        <div class="sl-header-actions">
          <button class="sl-add-btn" id="sl-add-btn" title="${this._t('streamLinks.addUrlTooltip')}" aria-label="${this._t('streamLinks.addUrl')}">${Icons.link}</button>
          <button class="sl-toggle-btn" id="sl-toggle-btn" title="${this._collapsed ? 'Expand' : 'Collapse'}" aria-label="Toggle">${this._collapsed ? Icons.chevronRight : Icons.chevronDown}</button>
        </div>
      </div>
      <div class="sl-list" id="sl-list" ${this._collapsed ? 'hidden' : ''}></div>
    `;

    this.listEl = this.container.querySelector('#sl-list');

    this.container.querySelector('#sl-add-btn').addEventListener('click', () => this._onAddClick());
    this.container.querySelector('#sl-toggle-btn').addEventListener('click', () => this._toggleCollapse());
  }

  _toggleCollapse() {
    this._collapsed = !this._collapsed;
    localStorage.setItem('av-editor-stream-links-collapsed', this._collapsed ? '1' : '0');
    const toggleBtn = this.container.querySelector('#sl-toggle-btn');
    if (this.listEl) this.listEl.hidden = this._collapsed;
    if (toggleBtn) toggleBtn.innerHTML = this._collapsed ? Icons.chevronRight : Icons.chevronDown;
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  _renderList() {
    if (!this.listEl) return;

    if (!this._links.length) {
      this.listEl.innerHTML = `<div class="sl-empty">${this._t('streamLinks.emptyHint')}</div>`;
      return;
    }

    this.listEl.innerHTML = '';
    for (const link of this._links) {
      const item = document.createElement('div');
      item.className = 'sl-item';
      item.dataset.id = link.id;
      item.title = link.originalUrl;

      const icon = link.type === 'youtube' ? Icons.youtube
        : link.type === 'rtsp' ? Icons.rtsp
        : Icons.link;

      const nameText = link.title && link.title !== link.originalUrl
        ? link.title
        : this._shortUrl(link.originalUrl);

      item.innerHTML = `
        <span class="sl-icon">${icon}</span>
        <span class="sl-name">${this._escHtml(nameText)}</span>
        <div class="sl-item-actions">
          ${link.type === 'youtube' && window.electronAPI?.youtubeDownload
            ? `<button class="sl-dl-btn" data-id="${link.id}" title="${this._t('streamLinks.downloadBtn')}">${Icons.download}</button>`
            : ''}
          <button class="sl-rm-btn" data-id="${link.id}" title="${this._t('streamLinks.removeLink')}">${Icons.close}</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.sl-dl-btn') || e.target.closest('.sl-rm-btn')) return;
        this._selectLink(link);
      });

      item.addEventListener('dblclick', (e) => {
        if (e.target.closest('.sl-dl-btn') || e.target.closest('.sl-rm-btn')) return;
        this._selectLink(link);
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onContextMenu?.(link, e.clientX, e.clientY);
      });

      const dlBtn = item.querySelector('.sl-dl-btn');
      if (dlBtn) {
        dlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._downloadYoutube(link);
        });
      }

      const rmBtn = item.querySelector('.sl-rm-btn');
      if (rmBtn) {
        rmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._removeLink(link.id);
        });
      }

      this.listEl.appendChild(item);
    }
  }

  _escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _shortUrl(url) {
    try {
      const u = new URL(url);
      return (u.hostname + u.pathname).slice(0, 50);
    } catch { return url.slice(0, 50); }
  }

  _setItemStatus(id, msg) {
    const item = this.listEl?.querySelector(`[data-id="${id}"]`);
    if (!item) return;
    let status = item.querySelector('.sl-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'sl-status';
      item.appendChild(status);
    }
    status.textContent = msg;
    status.hidden = !msg;
  }

  _formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  _showDownloadOverlay(title) {
    let overlay = document.getElementById('download-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'download-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="export-card analyze-card">
        <h3 id="download-overlay-title">${this._escHtml(title || this._t('streamLinks.downloadTitle'))}</h3>
        <div class="export-progress-bar-track">
          <div class="export-progress-bar-fill" id="download-progress-fill" style="width:0%"></div>
        </div>
        <div class="analyze-progress-meta">
          <span id="download-progress-label">${this._t('streamLinks.downloading').replace('{percent}', '0')}</span>
          <span id="download-progress-pct">0%</span>
        </div>
      </div>
    `;
    overlay.classList.add('visible');
  }

  _updateDownloadProgress(percent, label, { indeterminate = false } = {}) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const fill = document.getElementById('download-progress-fill');
    const labelEl = document.getElementById('download-progress-label');
    const pctEl = document.getElementById('download-progress-pct');
    if (fill) {
      fill.style.width = indeterminate ? '30%' : `${pct}%`;
      fill.classList.toggle('indeterminate', !!indeterminate);
    }
    if (labelEl && label) labelEl.textContent = label;
    if (pctEl) pctEl.textContent = indeterminate ? '…' : `${pct}%`;
  }

  _hideDownloadOverlay() {
    document.getElementById('download-overlay')?.classList.remove('visible');
    const fill = document.getElementById('download-progress-fill');
    fill?.classList.remove('indeterminate');
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async _onAddClick() {
    const result = await showUrlInputDialog(this.i18n);
    if (!result) return;
    addToHistory(result);
    const link = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: result.type,
      originalUrl: result.url,
      title: result.title || result.url,
      duration: result.duration || 0,
      author: result.author || '',
    };
    this._links.unshift(link);
    this._saveLinks();
    this._renderList();
    this._selectLink(link);
  }

  async _selectLink(link) {
    if (link.type === 'rtsp') {
      if (window.electronAPI?.rtspPrepareStream) {
        this._setItemStatus(link.id, this._t('streamLinks.preparingStream'));
        try {
          const result = await window.electronAPI.rtspPrepareStream(link.originalUrl);
          this._setItemStatus(link.id, '');
          if (!result.ok) {
            await showAlert(result.error || this._t('streamLinks.rtspPlayError'));
            return;
          }
          const entry = this._makeStreamEntry(link, result.streamUrl, result.duration, { hls: true });
          this.onSelect?.(entry);
        } catch (e) {
          this._setItemStatus(link.id, '');
          await showAlert(e.message || this._t('streamLinks.rtspPlayError'));
        }
        return;
      }
      // Electron / no converter: pass through (preview shows RTSP error if unsupported)
      const entry = this._makeStreamEntry(link, link.originalUrl);
      this.onSelect?.(entry);
      return;
    }

    if (link.type === 'http') {
      // Web: proxy for CORS/range; Electron can load remote URLs directly
      if (window.electronAPI?.isWeb && window.electronAPI?.httpPrepareStream) {
        this._setItemStatus(link.id, this._t('streamLinks.preparingStream'));
        try {
          const result = await window.electronAPI.httpPrepareStream(link.originalUrl);
          this._setItemStatus(link.id, '');
          if (!result.ok) {
            await showAlert(result.error || this._t('streamLinks.playError'));
            return;
          }
          const entry = this._makeStreamEntry(link, result.streamUrl);
          this.onSelect?.(entry);
        } catch (e) {
          this._setItemStatus(link.id, '');
          await showAlert(e.message || this._t('streamLinks.playError'));
        }
        return;
      }
      const entry = this._makeStreamEntry(link, link.originalUrl);
      this.onSelect?.(entry);
      return;
    }

    // YouTube: resolve muxed URL (Electron: CDN; web: same-origin proxy)
    if (link.type === 'youtube') {
      if (!window.electronAPI?.youtubePrepareStream) {
        await showAlert(this._t('streamLinks.playError'));
        return;
      }
      this._setItemStatus(link.id, this._t('streamLinks.preparingStream'));
      try {
        const result = await window.electronAPI.youtubePrepareStream(link.originalUrl);
        this._setItemStatus(link.id, '');
        if (!result.ok) {
          await showAlert(result.error || this._t('streamLinks.playError'));
          return;
        }
        if (result.title && result.title !== link.originalUrl) {
          link.title = result.title;
          this._saveLinks();
          this._renderList();
        }
        const entry = this._makeStreamEntry(link, result.streamUrl || result.embedUrl, result.duration, {
          playback: result.playback || (result.embedUrl && !result.streamUrl ? 'embed' : 'proxy'),
          embedUrl: result.embedUrl || null,
          videoId: result.videoId || null,
        });
        this.onSelect?.(entry);
      } catch (e) {
        this._setItemStatus(link.id, '');
        await showAlert(e.message || this._t('streamLinks.playError'));
      }
    }
  }

  _makeStreamEntry(link, streamUrl, duration, extra = {}) {
    return {
      isStream: true,
      urlType: link.type,
      originalUrl: link.originalUrl,
      name: link.title || link.originalUrl,
      extension: extra.hls ? '.m3u8' : '.mp4',
      url: streamUrl,
      blobUrl: null,
      path: null,
      duration: duration || link.duration || 0,
      size: 0,
      hls: !!extra.hls,
      ...extra,
    };
  }

  async _downloadYoutube(link) {
    if (!window.electronAPI?.youtubeDownload) {
      await showAlert(this._t('streamLinks.downloadError').replace('{error}', 'API unavailable'));
      return;
    }
    if (this._downloadBusy) return;
    this._downloadBusy = true;
    this._downloadingId = link.id;
    this._lastProgressAt = 0;
    this._lastProgressPct = -1;
    this._downloadDoneAlerted = false;

    this._setItemStatus(link.id, this._t('streamLinks.preparingStream'));

    try {
      const result = await window.electronAPI.youtubeDownload(link.originalUrl);
      if (result.cancelled) {
        this._setItemStatus(link.id, '');
        return;
      }
      if (!result.ok) {
        this._setItemStatus(link.id, '');
        await showAlert(this._t('streamLinks.downloadError').replace('{error}', result.error));
        return;
      }
      // Electron/web progress 'done' usually already alerted; fallback if not.
      if (result.filePath && !this._downloadDoneAlerted) {
        await showAlert(this._t('streamLinks.downloadDone').replace('{path}', result.filePath));
      }
    } catch (e) {
      this._setItemStatus(link.id, '');
      await showAlert(this._t('streamLinks.downloadError').replace('{error}', e.message));
    } finally {
      this._hideDownloadOverlay();
      this._setItemStatus(this._downloadingId, '');
      this._downloadingId = null;
      this._downloadBusy = false;
      this._downloadDoneAlerted = false;
    }
  }

  _registerDownloadListener() {
    if (this._downloadCallbackRegistered) return;
    this._downloadCallbackRegistered = true;
    window.electronAPI?.onYoutubeDownloadProgress?.((data) => {
      if (!data) return;
      const id = this._downloadingId;

      if (data.status === 'started') {
        const link = this._links.find((l) => l.id === this._downloadingId);
        const name = link?.title && link.title !== link.originalUrl
          ? link.title
          : (link ? this._shortUrl(link.originalUrl) : this._t('streamLinks.downloadTitle'));
        this._showDownloadOverlay(name);
        this._updateDownloadProgress(0, this._t('streamLinks.downloading').replace('{percent}', '0'));
        if (id) this._setItemStatus(id, this._t('streamLinks.downloading').replace('{percent}', '0'));
        return;
      }

      if (data.status === 'progress') {
        const total = Number(data.total) || 0;
        const downloaded = Number(data.downloaded) || 0;
        const hasTotal = total > 0;
        const percent = hasTotal
          ? Math.max(0, Math.min(100, Math.round(Number(data.percent) || ((downloaded / total) * 100))))
          : 0;

        // Throttle UI updates (~4/sec) unless percent changed by ≥1
        const now = Date.now();
        if (
          now - this._lastProgressAt < 250
          && percent === this._lastProgressPct
          && hasTotal
        ) {
          return;
        }
        this._lastProgressAt = now;
        this._lastProgressPct = percent;

        let label;
        if (hasTotal) {
          label = this._t('streamLinks.downloadingProgress')
            .replace('{percent}', String(percent))
            .replace('{downloaded}', this._formatBytes(downloaded))
            .replace('{total}', this._formatBytes(total));
        } else {
          label = this._t('streamLinks.downloadingBytes')
            .replace('{downloaded}', this._formatBytes(downloaded));
        }
        this._updateDownloadProgress(percent, label, { indeterminate: !hasTotal });
        if (id) {
          this._setItemStatus(
            id,
            hasTotal
              ? this._t('streamLinks.downloading').replace('{percent}', String(percent))
              : label
          );
        }
        return;
      }

      if (data.status === 'done') {
        this._updateDownloadProgress(100, this._t('streamLinks.downloading').replace('{percent}', '100'));
        if (id) this._setItemStatus(id, '');
        if (data.filePath) {
          this._downloadDoneAlerted = true;
          showAlert(this._t('streamLinks.downloadDone').replace('{path}', data.filePath || ''));
        }
        return;
      }

      if (data.status === 'error') {
        if (id) this._setItemStatus(id, '');
        this._hideDownloadOverlay();
      }
    });
  }

  _removeLink(id) {
    this._links = this._links.filter(l => l.id !== id);
    this._saveLinks();
    this._renderList();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Programmatically open the add-URL dialog. */
  async promptAddUrl() {
    return this._onAddClick();
  }

  /** Update i18n strings and re-render. */
  updateLocale() {
    this._build();
    this._renderList();
  }
}
