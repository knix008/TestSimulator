/* Directory tree / file browser for AV Editor — adapted from ImageViewerMutlOSV10 */
import { Icons } from './icons.js';

const VIDEO_EXTS = new Set(['.mp4','.avi','.mov','.mkv','.webm','.flv','.wmv','.m4v','.ts','.mts']);
const AUDIO_EXTS = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']);
const LAST_DIR_KEY = 'av-editor-last-dir';

export class FileTree {
  constructor(container, { i18n, onSelect, onDblClick, onDirOpen, onContextMenu }) {
    this._container = container;
    this._i18n = i18n;
    this._onSelect = onSelect;
    this._onDblClick = onDblClick;
    this._onDirOpen = onDirOpen;
    this._onContextMenu = onContextMenu;

    this._drives      = [];
    this._focusPath   = null;
    this._selectedPath = null;
    this._expandedDirs = new Set();
    this._pathSep     = '/';
    this._ready       = false;

    const api = window.electronAPI;
    if (api?.getPathSep) {
      api.getPathSep().then((sep) => { this._pathSep = sep || '/'; }).catch(() => {});
    }

    this._buildShell();
    this.loadDrives();

    // Web library updates (import / open folder)
    window.addEventListener('av-library-changed', () => {
      if (window.electronAPI?.isWeb) this.refresh();
    });
  }

  // ── Shell HTML ─────────────────────────────────────────────────────────────

  _buildShell() {
    const isWeb = !!window.electronAPI?.isWeb;
    const openTitle = isWeb
      ? this._t('fileExplorer.addMedia', 'Add media…')
      : this._t('toolbar.open', 'Open Folder');

    this._container.innerHTML = `
      <div class="ft-header">
        <span class="ft-title">${this._t('fileExplorer.title', 'MEDIA FILES')}</span>
        <div class="ft-header-actions">
          <select class="ft-drive-select" id="ft-drive-select"
                  title="${this._t('fileExplorer.drives', 'Drives & Volumes')}"
                  aria-label="${this._t('fileExplorer.drives', 'Drives & Volumes')}"></select>
          <button type="button" class="ft-open-btn${isWeb ? ' ft-add-btn' : ''}" id="ft-open-folder-btn" title="${openTitle}" aria-label="${openTitle}">
            ${isWeb ? Icons.import : Icons.folder}
          </button>
        </div>
      </div>
      <div class="ft-path-bar" id="tree-path-bar" title=""></div>
      <div class="ft-scroll" id="file-tree-scroll"></div>
    `;

    if (isWeb) {
      this._ensureWebFileInput();
      this._container.querySelector('#ft-open-folder-btn')
        ?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Must stay synchronous inside the user gesture.
          this._fileInput?.click();
        });
      this._bindLibraryDrop();
    } else {
      this._container.querySelector('#ft-open-folder-btn')
        ?.addEventListener('click', async () => {
          const dir = await window.electronAPI.openFolderDialog?.();
          if (dir) {
            await this.revealPath(dir);
            this._persistDir(dir);
          }
        });
    }

    this._container.querySelector('#ft-drive-select')
      ?.addEventListener('change', async (e) => {
        const drivePath = e.target.value;
        if (!drivePath) return;
        await this.revealPath(drivePath);
        this._persistDir(drivePath);
      });

    // Empty-area context menu (panel background)
    this._container.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tree-item')) return;
      e.preventDefault();
      e.stopPropagation();
      if (this._onContextMenu) {
        this._onContextMenu(null, e.clientX, e.clientY);
      }
    });
  }

  _ensureWebFileInput() {
    if (this._fileInput) return this._fileInput;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,video/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.aac,.flac,.ogg,.m4a';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;opacity:0;overflow:hidden;pointer-events:none;';
    this._container.appendChild(input);
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      // Reset so the same file can be chosen again.
      input.value = '';
      if (!files.length) return;
      const paths = await window.electronAPI.addMediaFiles?.(files);
      if (paths?.length) {
        const home = await window.electronAPI.getHomeDir?.() || '/library';
        await this.revealPath(home);
        this._persistDir(home);
      }
    });
    this._fileInput = input;
    return input;
  }

  async importMediaToLibrary() {
    return this._importMediaToLibrary();
  }

  async _importMediaToLibrary() {
    if (window.electronAPI?.isWeb) {
      this._ensureWebFileInput();
      this._fileInput?.click();
      return;
    }
    const api = window.electronAPI;
    if (!api) return;
    const paths = api.openFileDialog
      ? await api.openFileDialog()
      : [];
    if (paths?.length) {
      const home = await api.getHomeDir?.() || '/library';
      await this.revealPath(home);
      this._persistDir(home);
    }
  }

  _bindLibraryDrop() {
    const scroll = this._scrollEl();
    if (!scroll) return;
    const setOver = (on) => scroll.classList.toggle('ft-drop-over', on);

    scroll.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setOver(true);
    });
    scroll.addEventListener('dragleave', (e) => {
      if (!scroll.contains(e.relatedTarget)) setOver(false);
    });
    scroll.addEventListener('drop', async (e) => {
      e.preventDefault();
      setOver(false);
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      const paths = await window.electronAPI.addMediaFiles?.(files);
      if (paths?.length) {
        const home = await window.electronAPI.getHomeDir?.() || '/library';
        await this.revealPath(home);
        this._persistDir(home);
      }
    });
  }

  _bindMediaDrag(row, entry) {
    row.draggable = true;
    row.classList.add('is-draggable');

    row.addEventListener('dragstart', (ev) => {
      const payload = {
        name: entry.name,
        path: entry.path,
        extension: entry.extension,
        size: entry.size,
        isDirectory: false,
        isMedia: true,
      };

      // Shared fallback for in-app drops when Electron takes over native drag.
      window.__avEditorDragEntry = payload;

      try {
        ev.dataTransfer.setData('application/av-editor-file', JSON.stringify(payload));
        ev.dataTransfer.setData('text/plain', entry.path || entry.name || '');
      } catch { /* ignore */ }
      ev.dataTransfer.effectAllowed = 'copyMove';
      row.classList.add('dragging');

      // Electron: native OS drag-out (Explorer / desktop). Requires preventDefault.
      if (window.electronAPI?.isElectron && entry.path && window.electronAPI.startDrag) {
        ev.preventDefault();
        window.electronAPI.startDrag(entry.path);
        return;
      }

      // Web: attach File / DownloadURL so drops outside the page can receive the media.
      if (window.electronAPI?.isWeb) {
        this._enrichWebDrag(ev, entry);
      }
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      window.__avEditorDragEntry = null;
    });
  }

  _enrichWebDrag(ev, entry) {
    const info = window.electronAPI.getMediaDragInfo?.(entry.path);
    if (!info) return;

    if (info.file instanceof File) {
      try {
        ev.dataTransfer.items.add(info.file);
      } catch { /* browser may reject */ }
    }

    if (info.url) {
      // Chromium: drop onto desktop / downloads as a file when URL is http(s).
      const safeName = String(info.name || 'media').replace(/[:\r\n]/g, '_');
      try {
        ev.dataTransfer.setData('DownloadURL', `${info.mime}:${safeName}:${info.url}`);
      } catch { /* ignore */ }
      try {
        ev.dataTransfer.setData('text/uri-list', info.url);
      } catch { /* ignore */ }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _t(key, fallback = '') {
    const v = this._i18n.t(key);
    return (v && v !== key) ? v : fallback;
  }

  _norm(p) { return p ? p.replace(/[\\/]+$/, '').toLowerCase() : ''; }
  _pathsEqual(a, b) { return this._norm(a) === this._norm(b); }
  _isDrivePath(p) { return this._drives.some(d => this._pathsEqual(d.path, p)); }

  _scrollEl() { return this._container.querySelector('#file-tree-scroll'); }
  _pathBarEl() { return this._container.querySelector('#tree-path-bar'); }
  _driveSelectEl() { return this._container.querySelector('#ft-drive-select'); }

  _persistDir(dirPath) {
    if (!dirPath) return;
    localStorage.setItem(LAST_DIR_KEY, dirPath);
    if (this._onDirOpen) this._onDirOpen(dirPath);
  }

  _updatePathBar(dirPath) {
    const bar = this._pathBarEl();
    if (!bar) return;
    const text = dirPath || '';
    bar.textContent = text || this._t('fileExplorer.noPath', 'No folder selected');
    bar.title = text;
    bar.classList.toggle('is-empty', !text);
  }

  _populateDriveSelect() {
    const sel = this._driveSelectEl();
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    for (const drive of this._drives) {
      const opt = document.createElement('option');
      opt.value = drive.path;
      opt.textContent = drive.label || drive.name;
      sel.appendChild(opt);
    }
    sel.hidden = this._drives.length <= 1;
    if (prev && [...sel.options].some(o => o.value === prev)) {
      sel.value = prev;
    } else if (this._drives.length) {
      sel.value = this._drives[0].path;
    }
  }

  _syncDriveSelect(dirPath) {
    const sel = this._driveSelectEl();
    if (!sel || !dirPath || !this._drives.length) return;
    const match = this._drives.find(d => {
      const dn = this._norm(d.path);
      const pn = this._norm(dirPath);
      return pn === dn || pn.startsWith(dn + '\\') || pn.startsWith(dn + '/') ||
        // Windows: "c:" vs "c:\"
        (dn.length === 2 && dn.endsWith(':') && (pn === dn || pn.startsWith(dn)));
    });
    if (match) sel.value = match.path;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async loadDrives() {
    const result = await window.electronAPI.listDrives();
    this._drives = Array.isArray(result) ? result : [];
    this._ready = true;
    this._populateDriveSelect();
    await this._restoreLastDir();
  }

  async _restoreLastDir() {
    const lastDir = localStorage.getItem(LAST_DIR_KEY);
    if (lastDir) {
      try {
        const info = await window.electronAPI.getFileInfo?.(lastDir);
        if (info?.isDirectory) {
          await this.revealPath(lastDir);
          return;
        }
      } catch { /* fall through */ }
    }

    // No valid last dir — open home if available, otherwise show drive roots
    try {
      const home = await window.electronAPI.getHomeDir?.();
      if (home) {
        await this.revealPath(home);
        return;
      }
    } catch { /* fall through */ }

    this._focusPath = null;
    this._updatePathBar(null);
    await this._renderRoot();
  }

  async revealPath(dirPath) {
    if (!this._ready) await this.loadDrives();
    if (!dirPath) {
      this._focusPath = null;
      this._updatePathBar(null);
      await this._renderRoot();
      return;
    }
    const ancestors = await window.electronAPI.pathAncestors(dirPath);
    this._expandedDirs = new Set(ancestors);
    this._focusPath = ancestors.length ? ancestors[ancestors.length - 1] : dirPath;
    this._updatePathBar(this._focusPath);
    this._syncDriveSelect(this._focusPath);
    await this._renderRoot();
    requestAnimationFrame(() => {
      const el = this._scrollEl()
        ?.querySelector(`.tree-item[data-path="${CSS.escape(this._focusPath)}"]`);
      el?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }

  getRoot()       { return this._focusPath; }
  getSelected()   { return this._selectedPath; }
  setSelected(p)  { this._selectedPath = p; this._highlightSelected(); }

  async refresh() {
    if (!this._ready) { await this.loadDrives(); return; }
    try {
      const r = await window.electronAPI.listDrives();
      if (Array.isArray(r) && r.length) {
        this._drives = r;
        this._populateDriveSelect();
        this._syncDriveSelect(this._focusPath);
      }
    } catch {}
    await this._renderRoot();
    this._highlightSelected();
    if (this._focusPath) this._updatePathBar(this._focusPath);
  }

  updateTranslations() {
    const title = this._container.querySelector('.ft-title');
    if (title) title.textContent = this._t('fileExplorer.title', 'MEDIA FILES');
    const openTitle = window.electronAPI?.isWeb
      ? this._t('fileExplorer.addMedia', 'Add media…')
      : this._t('toolbar.open', 'Open Folder');
    const btn = this._container.querySelector('#ft-open-folder-btn');
    if (btn) {
      btn.title = openTitle;
      btn.setAttribute('aria-label', openTitle);
    }
    const sel = this._driveSelectEl();
    if (sel) {
      const label = this._t('fileExplorer.drives', 'Drives & Volumes');
      sel.title = label;
      sel.setAttribute('aria-label', label);
    }
    this._updatePathBar(this._focusPath);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  async _renderRoot() {
    const scroll = this._scrollEl();
    if (!scroll) return;
    scroll.innerHTML = '';

    if (!this._drives.length) {
      scroll.innerHTML = `<div class="ft-empty">${this._t('fileExplorer.noDrives', 'No drives found')}</div>`;
      return;
    }

    const root = document.createElement('div');
    root.className = 'tree-root';
    scroll.appendChild(root);

    for (const drive of this._drives) {
      await this._renderEntry(root, {
        name: drive.label || drive.name,
        path: drive.path,
        isDirectory: true,
        isDrive: true,
      }, 0);
    }
  }

  async _renderDir(parent, dirPath, depth) {
    parent.innerHTML = '';
    let entries;
    try {
      entries = await window.electronAPI.readDirectory(dirPath);
    } catch (e) {
      parent.innerHTML = `<div class="tree-item" style="padding-left:${depth * 14 + 18}px;color:var(--text-disabled);font-size:11px">${e.message || 'Error'}</div>`;
      return;
    }
    if (!entries || entries.error || !entries.length) {
      if (window.electronAPI?.isWeb) {
        const hint = document.createElement('div');
        hint.className = 'ft-empty ft-empty-action';
        hint.style.paddingLeft = `${Math.max(8, depth * 14)}px`;
        hint.innerHTML = `
          <div>${this._t('fileExplorer.emptyWeb', 'No media yet')}</div>
          <button type="button" class="ft-empty-add-btn">${this._t('fileExplorer.addMedia', 'Add media…')}</button>
          <div class="ft-empty-hint">${this._t('fileExplorer.dropHint', 'Or drop files here')}</div>
        `;
        hint.querySelector('.ft-empty-add-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._importMediaToLibrary();
        });
        parent.appendChild(hint);
        return;
      }
      parent.innerHTML = `<div class="tree-item" style="padding-left:${depth * 14 + 18}px;color:var(--text-disabled);font-size:11px">${this._t('fileExplorer.empty', 'Empty')}</div>`;
      return;
    }
    let rendered = 0;
    for (const entry of entries) {
      const before = parent.childElementCount;
      await this._renderEntry(parent, entry, depth);
      if (parent.childElementCount > before) rendered++;
    }
    if (!rendered) {
      parent.innerHTML = `<div class="tree-item" style="padding-left:${depth * 14 + 18}px;color:var(--text-disabled);font-size:11px">${this._t('fileExplorer.noFiles', 'No media files found')}</div>`;
    }
  }

  async _renderEntry(parent, entry, depth) {
    const ext   = (entry.extension || '').toLowerCase();
    const isVid = VIDEO_EXTS.has(ext);
    const isAud = AUDIO_EXTS.has(ext);
    const isDir = entry.isDirectory || entry.isDrive;
    const isDrive = !!entry.isDrive || this._isDrivePath(entry.path);
    const isMedia = isVid || isAud;

    if (!isDir && !isMedia) return;

    const row = document.createElement('div');
    row.className = `tree-item${isDir ? ' is-dir' : ' is-media'}${isDrive ? ' is-drive' : ''}`;
    row.dataset.path  = entry.path;
    row.dataset.isDir = isDir ? '1' : '0';

    // Indent
    const indent = document.createElement('div');
    indent.className = 'tree-indent';
    indent.style.width = `${depth * 14 + 4}px`;
    row.appendChild(indent);

    // Arrow (dirs only)
    const arrow = document.createElement('div');
    arrow.className = isDir ? 'tree-arrow' : 'tree-arrow no-arrow';
    if (isDir) {
      arrow.innerHTML = Icons.chevronRight;
      if ([...this._expandedDirs].some(p => this._pathsEqual(p, entry.path))) {
        arrow.classList.add('expanded');
      }
    }
    row.appendChild(arrow);

    // Icon
    const icon = document.createElement('div');
    if (isDrive) {
      icon.className = 'tree-icon drive-icon';
      icon.innerHTML = Icons.drive;
    } else if (isDir) {
      const expanded = [...this._expandedDirs].some(p => this._pathsEqual(p, entry.path));
      icon.className = 'tree-icon dir-icon';
      icon.innerHTML = expanded ? Icons.folderOpen : Icons.folder;
    } else if (isVid) {
      icon.className = 'tree-icon video-icon';
      icon.innerHTML = Icons.video;
    } else {
      icon.className = 'tree-icon audio-icon';
      icon.innerHTML = Icons.audio;
    }
    row.appendChild(icon);

    // Label
    const label = document.createElement('div');
    label.className = 'tree-label';
    label.textContent = entry.name;
    label.title = entry.path;
    row.appendChild(label);

    // Extension badge (media files only)
    if (!isDir && isMedia) {
      const badge = document.createElement('span');
      badge.className = `tree-ext ${isVid ? 'ext-video' : 'ext-audio'}`;
      badge.textContent = ext.replace('.', '').toUpperCase();
      row.appendChild(badge);
    }

    // Selection state
    if (this._pathsEqual(entry.path, this._selectedPath)) row.classList.add('selected');
    if (this._focusPath && this._pathsEqual(entry.path, this._focusPath)) row.classList.add('focused-path');

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      this._handleClick(row, { ...entry, isDirectory: isDir, isDrive }, arrow, icon);
    });

    row.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const ext = (entry.extension || '').toLowerCase();
      if (!isDir && (VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext))) {
        if (this._onDblClick) this._onDblClick(entry);
      }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = { ...entry, isDirectory: isDir, isDrive, isMedia };
      if (!isDir && isMedia) {
        this._selectedPath = entry.path;
        this._highlightSelected();
        if (this._onSelect) this._onSelect(entry);
      }
      if (this._onContextMenu) this._onContextMenu(payload, e.clientX, e.clientY);
    });

    if (!isDir && isMedia) {
      this._bindMediaDrag(row, entry);
    }

    parent.appendChild(row);

    // Render children if already expanded
    if (isDir && [...this._expandedDirs].some(p => this._pathsEqual(p, entry.path))) {
      const children = document.createElement('div');
      children.className = 'tree-children';
      children.dataset.parentPath = entry.path;
      parent.appendChild(children);
      await this._renderDir(children, entry.path, depth + 1);
    }
  }

  // ── Click handling ─────────────────────────────────────────────────────────

  async _handleClick(row, entry, arrow, icon) {
    if (entry.isDirectory || entry.isDrive) {
      const isExpanded = [...this._expandedDirs].some(p => this._pathsEqual(p, entry.path));
      if (isExpanded) {
        // Collapse: remove this dir and all descendants from expanded set
        for (const p of [...this._expandedDirs]) {
          const pn = this._norm(p);
          const en = this._norm(entry.path);
          if (pn === en || pn.startsWith(en + '\\') || pn.startsWith(en + '/')) {
            this._expandedDirs.delete(p);
          }
        }
        arrow.classList.remove('expanded');
        if (!entry.isDrive) icon.innerHTML = Icons.folder;
        const scroll = this._scrollEl();
        const children = scroll?.querySelector(
          `.tree-children[data-parent-path="${CSS.escape(entry.path)}"]`
        );
        if (children) children.remove();
      } else {
        // Expand
        this._expandedDirs.add(entry.path);
        arrow.classList.add('expanded');
        if (!entry.isDrive) icon.innerHTML = Icons.folderOpen;
        const children = document.createElement('div');
        children.className = 'tree-children';
        children.dataset.parentPath = entry.path;
        const indentW = parseInt(row.querySelector('.tree-indent').style.width || '0');
        children.innerHTML = `<div class="tree-item" style="padding-left:${indentW + 14}px;color:var(--text-disabled);font-size:11px">${this._t('fileExplorer.loading', 'Loading…')}</div>`;
        row.insertAdjacentElement('afterend', children);
        const depth = Math.round(indentW / 14);
        await this._renderDir(children, entry.path, depth + 1);
      }
      this._focusPath = entry.path;
      this._updatePathBar(entry.path);
      this._syncDriveSelect(entry.path);
      this._persistDir(entry.path);
    } else {
      // Media file clicked
      const ext = (entry.extension || '').toLowerCase();
      if (VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)) {
        this._selectedPath = entry.path;
        this._highlightSelected();
        if (this._onSelect) this._onSelect(entry);
      }
    }
  }

  _highlightSelected() {
    const scroll = this._scrollEl();
    if (!scroll) return;
    scroll.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
    scroll.querySelectorAll('.tree-item[data-path]').forEach(el => {
      if (this._pathsEqual(el.dataset.path, this._selectedPath)) el.classList.add('selected');
    });
  }
}
