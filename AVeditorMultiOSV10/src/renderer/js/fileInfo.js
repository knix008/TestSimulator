export class FileInfo {
  constructor(container, { i18n }) {
    this.container = container;
    this.i18n = i18n;
    this._entry = null;
    this._mediaInfo = null;
    this._loading = false;
    this._requestId = 0;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="file-info-header" data-i18n="fileInfo.title"></div>
      <div class="file-info-content" id="file-info-content">
        <div class="file-info-empty" id="file-info-empty"></div>
      </div>
    `;
    this._updateEmpty();
  }

  _updateEmpty() {
    const el = this.container.querySelector('#file-info-empty');
    if (el) el.textContent = this.i18n.t('fileInfo.noSelection');
    const header = this.container.querySelector('.file-info-header');
    if (header) header.textContent = this.i18n.t('fileInfo.title');
  }

  _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Begin a metadata fetch; returns an id used to ignore stale responses. */
  beginLoad(fileEntry) {
    this._entry = fileEntry || null;
    this._mediaInfo = null;
    this._loading = !!fileEntry;
    this._requestId += 1;
    this._renderAll();
    return this._requestId;
  }

  /**
   * Apply media metadata for a prior beginLoad request.
   * @param {number} requestId
   * @param {object|null} info
   */
  completeLoad(requestId, info) {
    if (requestId !== this._requestId) return;
    this._loading = false;
    this._mediaInfo = info || null;
    this._renderAll();
  }

  show(fileEntry, mediaInfo = null) {
    if (!fileEntry) { this.clear(); return; }
    this._entry = fileEntry;
    this._mediaInfo = mediaInfo;
    this._loading = false;
    this._requestId += 1;
    this._renderAll();
  }

  showMediaMetadata(info) {
    if (!this._entry) return;
    this._loading = false;
    this._mediaInfo = info || null;
    this._renderAll();
  }

  clear() {
    this._entry = null;
    this._mediaInfo = null;
    this._loading = false;
    this._requestId += 1;
    const content = this.container.querySelector('#file-info-content');
    if (content) {
      content.innerHTML = `<div class="file-info-empty">${this.i18n.t('fileInfo.noSelection')}</div>`;
    }
    const header = this.container.querySelector('.file-info-header');
    if (header) header.textContent = this.i18n.t('fileInfo.title');
  }

  _renderAll() {
    const content = this.container.querySelector('#file-info-content');
    if (!content) return;

    const header = this.container.querySelector('.file-info-header');
    if (header) header.textContent = this.i18n.t('fileInfo.title');

    if (!this._entry) {
      content.innerHTML = `<div class="file-info-empty">${this.i18n.t('fileInfo.noSelection')}</div>`;
      return;
    }

    const fileEntry = this._entry;
    const info = this._mediaInfo || {};
    const ext = (fileEntry.extension || info.extension || '').toLowerCase();
    const VIDEO_EXT = new Set(['.mp4','.avi','.mov','.mkv','.webm','.flv','.wmv','.m4v','.ts','.mts']);
    const AUDIO_EXT = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']);
    const isVideo = info.isVideo === true || (info.isVideo !== false && VIDEO_EXT.has(ext));
    const isAudio = info.isAudio === true || (!isVideo && AUDIO_EXT.has(ext));
    const t = (key) => this.i18n.t(key);
    const size = info.size || fileEntry.size;
    const modified = info.modified || fileEntry.modified;
    const created = info.created || fileEntry.created;

    const rows = [
      [t('fileInfo.name'), `<span class="info-value">${this._esc(fileEntry.name)}</span>`],
      [t('fileInfo.mediaType'), isVideo
        ? `<span class="info-badge video">${t('fileInfo.video')}</span>`
        : isAudio
          ? `<span class="info-badge audio">${t('fileInfo.audio')}</span>`
          : `<span class="info-value">${this._esc(ext || '?')}</span>`
      ],
      [t('fileInfo.size'), `<span class="info-value">${this._fmtSize(size)}</span>`],
      [t('fileInfo.format'), `<span class="info-value">${this._esc((ext.replace('.','') || '—').toUpperCase())}</span>`],
    ];

    const duration = Number(info.duration);
    if (Number.isFinite(duration) && duration > 0) {
      rows.push([t('fileInfo.duration'), `<span class="info-value">${this._fmtDur(duration)}</span>`]);
    }
    if (info.containerFormat) {
      rows.push([t('fileInfo.containerFormat'), `<span class="info-value">${this._esc(info.containerFormat)}</span>`]);
    }
    if (info.width && info.height) {
      rows.push([t('fileInfo.resolution'), `<span class="info-value">${info.width}×${info.height}</span>`]);
    }
    if (info.fps) {
      rows.push([t('fileInfo.frameRate'), `<span class="info-value">${this._fmtNumber(info.fps)} fps</span>`]);
    }
    if (info.videoCodec) {
      rows.push([t('fileInfo.videoCodec'), `<span class="info-value">${this._esc(info.videoCodec)}</span>`]);
    } else if (info.codec && isVideo) {
      rows.push([t('fileInfo.codec'), `<span class="info-value">${this._esc(info.codec)}</span>`]);
    }
    if (info.audioCodec && isVideo) {
      rows.push([t('fileInfo.audioCodec'), `<span class="info-value">${this._esc(info.audioCodec)}</span>`]);
    }
    if (info.audioCodec && isAudio) {
      rows.push([t('fileInfo.codec'), `<span class="info-value">${this._esc(info.audioCodec)}</span>`]);
    } else if (info.codec && isAudio && !info.audioCodec) {
      rows.push([t('fileInfo.codec'), `<span class="info-value">${this._esc(info.codec)}</span>`]);
    }
    if (info.sampleRate) {
      rows.push([t('fileInfo.sampleRate'), `<span class="info-value">${Math.round(info.sampleRate)} Hz</span>`]);
    }
    if (info.channels) {
      rows.push([t('fileInfo.channels'), `<span class="info-value">${info.channels}</span>`]);
    }
    if (info.bitrate) {
      rows.push([t('fileInfo.bitrate'), `<span class="info-value">${Math.round(info.bitrate / 1000)} kbps</span>`]);
    }
    if (info.overallBitrate && info.overallBitrate !== info.bitrate) {
      rows.push([t('fileInfo.overallBitrate'), `<span class="info-value">${Math.round(info.overallBitrate / 1000)} kbps</span>`]);
    }

    rows.push(
      [t('fileInfo.modified'), `<span class="info-value">${modified ? new Date(modified).toLocaleString() : '—'}</span>`],
      [t('fileInfo.created'), `<span class="info-value">${created ? new Date(created).toLocaleString() : '—'}</span>`],
      [t('fileInfo.path'), `<span class="info-value path" title="${this._esc(fileEntry.path || '')}">${this._esc(fileEntry.path || '—')}</span>`],
    );

    let html = rows.map(([label, value]) => `
      <div class="info-row">
        <span class="info-label">${label}</span>
        ${value}
      </div>
    `).join('');

    if (this._loading) {
      html += `
        <div class="info-row media-meta-loading">
          <span class="info-label">${t('fileInfo.metadata')}</span>
          <span class="info-value">${t('fileInfo.loadingMetadata')}</span>
        </div>`;
    }

    content.innerHTML = html;
  }

  _fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  _fmtDur(secs) {
    if (!isFinite(secs)) return '—';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  _fmtNumber(value) {
    const num = Number(value);
    if (!isFinite(num)) return '—';
    return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.00$/, '');
  }

  updateTranslations() {
    if (this._entry) {
      this._renderAll();
      return;
    }
    this.clear();
  }
}
