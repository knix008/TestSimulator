import { Icons } from './icons.js';

const VIDEO_EXT = new Set(['.mp4','.avi','.mov','.mkv','.webm','.flv','.wmv','.m4v','.ts','.mts']);
const AUDIO_EXT = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']);
const LAST_DIR_KEY = 'av-editor-last-dir';

function isMedia(ext) { return VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext); }
function extClass(ext) {
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return 'other';
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export class FileExplorer {
  constructor(container, { i18n, onFileSelect, onFileDblClick }) {
    this.container = container;
    this.i18n = i18n;
    this.onFileSelect = onFileSelect;
    this.onFileDblClick = onFileDblClick;

    this.currentFilter = 'all';
    this.searchQuery = '';
    this.selectedEntry = null;
    this.isElectron = typeof window.electronAPI !== 'undefined';

    // Tree state: path → { expanded, children, loading }
    this.treeState = new Map();

    this.render();
    this.loadDrives();
    this.loadSpecialFolders();
    this._restoreLastDir();
  }

  // ── Render skeleton ──────────────────────────────────────────────────────

  render() {
    this.container.innerHTML = `
      <div class="explorer-header">
        <span class="explorer-title" data-i18n="fileExplorer.title"></span>
      </div>

      <div class="explorer-filter-bar">
        <button class="filter-btn active" data-filter="all"  data-i18n="fileExplorer.filterAll"></button>
        <button class="filter-btn"        data-filter="video" data-i18n="fileExplorer.filterVideo"></button>
        <button class="filter-btn"        data-filter="audio" data-i18n="fileExplorer.filterAudio"></button>
      </div>

      <div class="explorer-search">
        <input type="text" id="explorer-search-input"
               data-i18n-placeholder="fileExplorer.searchPlaceholder" autocomplete="off"/>
      </div>

      <!-- Scrollable tree area -->
      <div class="explorer-tree-scroll" id="explorer-tree-scroll">

        <!-- Drives -->
        <div class="explorer-section-header" data-section="drives" id="section-hdr-drives">
          <span class="chevron">${Icons.chevronDown}</span>
          <span data-i18n="fileExplorer.drives"></span>
        </div>
        <div class="drives-list" id="drives-list"></div>

        <!-- Special folders -->
        <div class="explorer-section-header" data-section="specials" id="section-hdr-specials">
          <span class="chevron">${Icons.chevronDown}</span>
          <span data-i18n="fileExplorer.favorites"></span>
        </div>
        <div class="specials-list" id="specials-list"></div>

        <!-- Directory tree -->
        <div class="explorer-section-header" id="section-hdr-tree">
          <span class="chevron chevron-static">${Icons.chevronDown}</span>
          <span id="tree-path-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;font-size:10px;"></span>
        </div>
        <div class="tree-list" id="dir-tree-root"></div>

      </div><!-- /explorer-tree-scroll -->

      <!-- File info panel (bottom of explorer) -->
      <div class="explorer-file-info" id="explorer-file-info">
        <div class="explorer-file-info-empty" id="explorer-file-info-empty"></div>
      </div>
    `;

    this._updateTranslatableText();
    this._bindEvents();
  }

  _updateTranslatableText() {
    this.container.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = this.i18n.t(el.getAttribute('data-i18n'));
    });
    this.container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = this.i18n.t(el.getAttribute('data-i18n-placeholder'));
    });
    const emptyEl = this.container.querySelector('#explorer-file-info-empty');
    if (emptyEl) emptyEl.textContent = this.i18n.t('fileInfo.noSelection');
  }

  _bindEvents() {
    // Filter
    this.container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentFilter = btn.dataset.filter;
        this.container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._refreshVisibleTrees();
      });
    });

    // Search
    const search = this.container.querySelector('#explorer-search-input');
    search?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this._refreshVisibleTrees();
    });

    // Section collapse
    this.container.querySelectorAll('.explorer-section-header[data-section]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        hdr.classList.toggle('collapsed');
        const target = hdr.dataset.section === 'drives' ? '#drives-list' : '#specials-list';
        const list = this.container.querySelector(target);
        if (list) list.style.display = hdr.classList.contains('collapsed') ? 'none' : '';
      });
    });
  }

  // ── Drives ────────────────────────────────────────────────────────────────

  async loadDrives() {
    const list = this.container.querySelector('#drives-list');
    list.innerHTML = `<div class="file-item" style="color:var(--text-disabled);padding-left:16px">${this.i18n.t('fileExplorer.loading')}</div>`;

    let drives = [];
    if (this.isElectron) {
      drives = await window.electronAPI.getDrives();
    }

    list.innerHTML = '';
    drives.forEach(drive => {
      const item = document.createElement('div');
      item.className = 'drive-item';
      item.innerHTML = `${Icons.drive}<span>${drive.label || drive.name}</span>`;
      item.addEventListener('click', () => {
        this.container.querySelectorAll('.drive-item, .special-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        this._openRootDir(drive.path, drive.label || drive.name);
      });
      list.appendChild(item);
    });
  }

  async loadSpecialFolders() {
    const list = this.container.querySelector('#specials-list');
    if (!this.isElectron) { list.innerHTML = ''; return; }

    const specials = await window.electronAPI.getSpecialFolders();
    list.innerHTML = '';

    const iconMap = { home: Icons.home, desktop: Icons.desktop, documents: Icons.folder, downloads: Icons.folder };
    const i18nMap = {
      home: 'fileExplorer.home', desktop: 'fileExplorer.desktop',
      documents: 'fileExplorer.documents', downloads: 'fileExplorer.downloads'
    };

    specials.forEach(f => {
      const item = document.createElement('div');
      item.className = 'special-item';
      item.innerHTML = `${iconMap[f.name] || Icons.folder}<span>${this.i18n.t(i18nMap[f.name] || f.label)}</span>`;
      item.addEventListener('click', () => {
        this.container.querySelectorAll('.drive-item, .special-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        this._openRootDir(f.path, this.i18n.t(i18nMap[f.name] || f.label));
      });
      list.appendChild(item);
    });
  }

  // ── Tree View ─────────────────────────────────────────────────────────────

  _openRootDir(rootPath, label) {
    const treeRoot = this.container.querySelector('#dir-tree-root');
    const pathLabel = this.container.querySelector('#tree-path-label');
    if (pathLabel) pathLabel.textContent = label || rootPath;
    treeRoot.innerHTML = '';
    this.treeState.clear();
    localStorage.setItem(LAST_DIR_KEY, rootPath);
    this._renderTreeDir(rootPath, treeRoot, 0, true);
  }

  async _renderTreeDir(dirPath, parentEl, depth, autoExpand = false) {
    let state = this.treeState.get(dirPath);
    if (!state) {
      state = { expanded: false, loaded: false, children: [], el: null };
      this.treeState.set(dirPath, state);
    }

    // Create the row for this directory (skip if it's the root rendered inline)
    const isRoot = depth === 0;

    if (!isRoot) {
      const dirName = dirPath.split(/[\\/]/).filter(Boolean).pop() || dirPath;
      const row = document.createElement('div');
      row.className = 'tree-item tree-dir';
      row.style.paddingLeft = (depth * 14 + 8) + 'px';
      row.dataset.path = dirPath;
      row.innerHTML = `
        <span class="tree-toggle">${Icons.chevronRight}</span>
        <span class="tree-icon" style="color:var(--warning)">${Icons.folder}</span>
        <span class="tree-label">${dirName}</span>
      `;

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = 'none';
      state.el = { row, childrenContainer };

      row.addEventListener('click', () => this._toggleDir(dirPath, row, childrenContainer, depth));
      parentEl.appendChild(row);
      parentEl.appendChild(childrenContainer);

      if (autoExpand) {
        this._toggleDir(dirPath, row, childrenContainer, depth, true);
      }
    } else {
      // Root: load directly into parentEl
      await this._loadDirContents(dirPath, parentEl, depth);
      localStorage.setItem(LAST_DIR_KEY, dirPath);
    }
  }

  async _toggleDir(dirPath, row, childrenContainer, depth, forceExpand = false) {
    const state = this.treeState.get(dirPath) || { expanded: false, loaded: false };
    const isExpanded = !forceExpand && state.expanded;

    if (isExpanded) {
      // Collapse
      state.expanded = false;
      childrenContainer.style.display = 'none';
      row.querySelector('.tree-toggle').innerHTML = Icons.chevronRight;
      row.querySelector('.tree-icon').innerHTML = Icons.folder;
      this.treeState.set(dirPath, state);
    } else {
      // Expand
      state.expanded = true;
      childrenContainer.style.display = '';
      row.querySelector('.tree-toggle').innerHTML = Icons.chevronDown;
      row.querySelector('.tree-icon').innerHTML = Icons.folderOpen;

      if (!state.loaded) {
        childrenContainer.innerHTML = `<div class="file-item" style="color:var(--text-disabled);padding-left:${(depth+1)*14+22}px">${this.i18n.t('fileExplorer.loading')}</div>`;
        await this._loadDirContents(dirPath, childrenContainer, depth + 1);
        state.loaded = true;
      }
      this.treeState.set(dirPath, state);
      localStorage.setItem(LAST_DIR_KEY, dirPath);
    }
  }

  async _loadDirContents(dirPath, containerEl, depth) {
    containerEl.innerHTML = '';

    let entries = [];
    if (this.isElectron) {
      entries = await window.electronAPI.readDirectory(dirPath);
    }

    // Separate dirs and files
    const dirs = entries.filter(e => e.isDirectory);
    const files = entries.filter(e => !e.isDirectory);

    // Apply filter/search to files
    const filteredFiles = files.filter(e => {
      const ext = e.extension || '';
      if (this.searchQuery && !e.name.toLowerCase().includes(this.searchQuery)) return false;
      if (this.currentFilter === 'video' && !VIDEO_EXT.has(ext)) return false;
      if (this.currentFilter === 'audio' && !AUDIO_EXT.has(ext)) return false;
      if (this.currentFilter === 'all' && !isMedia(ext)) return false;
      return true;
    });

    if (dirs.length === 0 && filteredFiles.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'file-list-empty';
      emptyEl.style.paddingLeft = (depth * 14 + 8) + 'px';
      emptyEl.textContent = this.i18n.t('fileExplorer.noFiles');
      containerEl.appendChild(emptyEl);
      return;
    }

    // Render subdirectories
    dirs.forEach(dir => {
      this._renderTreeDir(dir.path, containerEl, depth);
    });

    // Render files
    filteredFiles.forEach(entry => {
      const ext = entry.extension || '';
      const isVid = VIDEO_EXT.has(ext);
      const isAud = AUDIO_EXT.has(ext);
      const icon = isVid ? Icons.video : (isAud ? Icons.audio : Icons.file);

      const fileEl = document.createElement('div');
      fileEl.className = 'tree-item tree-file file-item';
      fileEl.style.paddingLeft = (depth * 14 + 22) + 'px';
      fileEl.draggable = true;
      fileEl.dataset.path = entry.path;
      fileEl.innerHTML = `
        <span style="width:14px;height:14px;flex-shrink:0;display:inline-flex">${icon}</span>
        <span class="file-name">${entry.name}</span>
        ${ext ? `<span class="file-ext ${extClass(ext)}">${ext.replace('.','')}</span>` : ''}
      `;

      fileEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.container.querySelectorAll('.tree-file.selected').forEach(el => el.classList.remove('selected'));
        fileEl.classList.add('selected');
        this.selectedEntry = entry;
        this._showFileInfo(entry);
        this.onFileSelect?.(entry);
      });

      fileEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.onFileDblClick?.(entry);
      });

      fileEl.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('application/av-editor-file', JSON.stringify(entry));
        ev.dataTransfer.effectAllowed = 'copy';
      });

      containerEl.appendChild(fileEl);
    });
  }

  _refreshVisibleTrees() {
    // Re-render all expanded trees with new filter/search
    this.treeState.forEach((state, dirPath) => {
      if (state.expanded && state.el?.childrenContainer) {
        state.loaded = false; // force reload
        const depth = parseInt(state.el?.row?.style.paddingLeft || '8') / 14;
        this._loadDirContents(dirPath, state.el.childrenContainer, depth);
        state.loaded = true;
      }
    });
    // Re-render root trees (depth 0)
    const roots = this.container.querySelectorAll('#dir-tree-root');
    // (root dir reloads automatically)
  }

  // ── File info (bottom of explorer) ───────────────────────────────────────

  _showFileInfo(entry) {
    const panel = this.container.querySelector('#explorer-file-info');
    if (!panel) return;
    const ext = (entry.extension || '').toLowerCase();
    const isVid = VIDEO_EXT.has(ext);
    const isAud = AUDIO_EXT.has(ext);
    const t = (k) => this.i18n.t(k);

    panel.innerHTML = `
      <div class="explorer-info-row">
        <span class="explorer-info-label">${t('fileInfo.name')}</span>
        <span class="explorer-info-value" title="${entry.name}">${entry.name}</span>
      </div>
      <div class="explorer-info-row">
        <span class="explorer-info-label">${t('fileInfo.mediaType')}</span>
        <span class="info-badge ${isVid ? 'video' : isAud ? 'audio' : ''}">
          ${isVid ? t('fileInfo.video') : isAud ? t('fileInfo.audio') : (ext || '?').toUpperCase()}
        </span>
      </div>
      <div class="explorer-info-row">
        <span class="explorer-info-label">${t('fileInfo.size')}</span>
        <span class="explorer-info-value">${fmtSize(entry.size)}</span>
      </div>
      <div class="explorer-info-row">
        <span class="explorer-info-label">${t('fileInfo.modified')}</span>
        <span class="explorer-info-value">${entry.modified ? new Date(entry.modified).toLocaleDateString() : '—'}</span>
      </div>
    `;
  }

  // ── Last dir persistence ──────────────────────────────────────────────────

  async _restoreLastDir() {
    const lastDir = localStorage.getItem(LAST_DIR_KEY);
    if (!lastDir) {
      // default: open Home
      if (this.isElectron) {
        const home = await window.electronAPI.getHomeDir();
        if (home) {
          const pathLabel = this.container.querySelector('#tree-path-label');
          if (pathLabel) pathLabel.textContent = this.i18n.t('fileExplorer.home');
          this._renderTreeDir(home, this.container.querySelector('#dir-tree-root'), 0, true);
          localStorage.setItem(LAST_DIR_KEY, home);
        }
      }
      return;
    }
    const pathLabel = this.container.querySelector('#tree-path-label');
    if (pathLabel) pathLabel.textContent = lastDir;
    const treeRoot = this.container.querySelector('#dir-tree-root');
    if (treeRoot) this._renderTreeDir(lastDir, treeRoot, 0, true);
  }

  // ── Translations ───────────────────────────────────────────────────────────

  updateTranslations() {
    this._updateTranslatableText();
    this.loadSpecialFolders();
  }
}
