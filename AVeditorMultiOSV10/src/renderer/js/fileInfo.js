export class FileInfo {
  constructor(container, { i18n }) {
    this.container = container;
    this.i18n = i18n;
    this._entry = null;
    this._mediaInfo = null;
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

  show(fileEntry) {
    if (!fileEntry) { this.clear(); return; }
    this._entry = fileEntry;
    this._mediaInfo = null;
    const content = this.container.querySelector('#file-info-content');
    if (!content) return;

    const header = this.container.querySelector('.file-info-header');
    if (header) header.textContent = this.i18n.t('fileInfo.title');

    const ext = (fileEntry.extension || '').toLowerCase();
    const VIDEO_EXT = new Set(['.mp4','.avi','.mov','.mkv','.webm','.flv','.wmv','.m4v','.ts','.mts']);
    const AUDIO_EXT = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']);
    const isVideo = VIDEO_EXT.has(ext);
    const isAudio = AUDIO_EXT.has(ext);

    const t = (key) => this.i18n.t(key);

    const rows = [
      [t('fileInfo.name'), `<span class="info-value">${this._esc(fileEntry.name)}</span>`],
      [t('fileInfo.mediaType'), isVideo
        ? `<span class="info-badge video">${t('fileInfo.video')}</span>`
        : isAudio
          ? `<span class="info-badge audio">${t('fileInfo.audio')}</span>`
          : `<span class="info-value">${this._esc(ext || '?')}</span>`
      ],
      [t('fileInfo.size'), `<span class="info-value">${this._fmtSize(fileEntry.size)}</span>`],
      [t('fileInfo.format'), `<span class="info-value">${this._esc((ext.replace('.','') || '—').toUpperCase())}</span>`],
      [t('fileInfo.modified'), `<span class="info-value">${fileEntry.modified ? new Date(fileEntry.modified).toLocaleString() : '—'}</span>`],
      [t('fileInfo.created'), `<span class="info-value">${fileEntry.created ? new Date(fileEntry.created).toLocaleString() : '—'}</span>`],
      [t('fileInfo.path'), `<span class="info-value path" title="${this._esc(fileEntry.path || '')}">${this._esc(fileEntry.path || '—')}</span>`],
    ];

    content.innerHTML = rows.map(([label, value]) => `
      <div class="info-row">
        <span class="info-label">${label}</span>
        ${value}
      </div>
    `).join('');
  }

  showMediaMetadata(info) {
    if (!info) return;
    this._mediaInfo = info;
    const content = this.container.querySelector('#file-info-content');
    if (!content || content.querySelector('.file-info-empty')) return;

    const t = (key) => this.i18n.t(key);
    const rows = [];

    if (info.duration) rows.push([t('fileInfo.duration'), this._fmtDur(info.duration)]);
    if (info.containerFormat) rows.push([t('fileInfo.containerFormat'), this._esc(info.containerFormat)]);
    if (info.width && info.height) rows.push([t('fileInfo.resolution'), `${info.width}×${info.height}`]);
    if (info.fps) rows.push([t('fileInfo.frameRate'), `${this._fmtNumber(info.fps)} fps`]);
    if (info.videoCodec) rows.push([t('fileInfo.videoCodec'), this._esc(info.videoCodec)]);
    if (!info.videoCodec && info.codec) rows.push([t('fileInfo.codec'), this._esc(info.codec)]);
    if (info.audioCodec && info.isVideo) rows.push([t('fileInfo.audioCodec'), this._esc(info.audioCodec)]);
    if (info.sampleRate) rows.push([t('fileInfo.sampleRate'), `${Math.round(info.sampleRate)} Hz`]);
    if (info.channels) rows.push([t('fileInfo.channels'), String(info.channels)]);
    if (info.bitrate) rows.push([t('fileInfo.bitrate'), `${Math.round(info.bitrate / 1000)} kbps`]);
    if (info.overallBitrate && info.overallBitrate !== info.bitrate) {
      rows.push([t('fileInfo.overallBitrate'), `${Math.round(info.overallBitrate / 1000)} kbps`]);
    }
    if (info.audioCodec && !info.isVideo) rows.push([t('fileInfo.codec'), this._esc(info.audioCodec)]);

    if (!rows.length) return;

    const extra = rows.map(([label, value]) => `
      <div class="info-row media-meta">
        <span class="info-label">${label}</span>
        <span class="info-value">${value}</span>
      </div>
    `).join('');

    content.querySelectorAll('.info-row.media-meta').forEach(el => el.remove());
    content.insertAdjacentHTML('beforeend', extra);
  }

  clear() {
    this._entry = null;
    this._mediaInfo = null;
    const content = this.container.querySelector('#file-info-content');
    if (content) content.innerHTML = `<div class="file-info-empty">${this.i18n.t('fileInfo.noSelection')}</div>`;
    const header = this.container.querySelector('.file-info-header');
    if (header) header.textContent = this.i18n.t('fileInfo.title');
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
      const mediaInfo = this._mediaInfo;
      this.show(this._entry);
      if (mediaInfo) this.showMediaMetadata(mediaInfo);
      return;
    }
    this.clear();
  }
}
