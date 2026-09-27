/* Directory tree / file browser — roots are OS drives */
window.FileTree = (() => {
  let _container     = null;
  let _drives        = [];
  let _focusPath     = null;
  let _selectedPath  = null;
  let _selectedPaths = new Set();   // multi-select
  let _lastClickedPath = null;      // for shift-range selection
  let _expandedDirs  = new Set();
  let _onSelect      = null;    // callback(filePath)
  let _onDirOpen     = null;    // callback(dirPath)
  let _onDriveSelect = null;    // callback(drivePath)
  let _onContextMenu = null;
  let _onImport      = null;    // callback({ destDir, mode, count, ... })
  let _dropHoverEl   = null;
  let _pathSep       = '/';
  let _ready         = false;
  let _centerOnce    = false;   // center explorer row only on first open
  let _refreshing    = false;
  let _foldersOnly   = false;   // browse mode: the tree shows folders, the grid shows files

  const IMAGE_EXTS = FormatSupport.IMAGE_EXTS;
  const VIDEO_EXTS = FormatSupport.VIDEO_EXTS;
  const AUDIO_EXTS = FormatSupport.AUDIO_EXTS;

  function init(container, { onSelect, onDirOpen, onDriveSelect, onContextMenu, onImport }) {
    _container = container;
    _onSelect  = onSelect;
    _onDirOpen = onDirOpen;
    _onDriveSelect = onDriveSelect || null;
    _onContextMenu = onContextMenu || null;
    _onImport = onImport || null;
    window.electronAPI.getPathSep().then(sep => { _pathSep = sep; });
    _initDropZone();
  }

  function _clearDropHover() {
    if (_dropHoverEl) {
      _dropHoverEl.classList.remove('drop-hover');
      _dropHoverEl = null;
    }
    const panel = _container?.closest('#file-tree-panel') || _container;
    panel?.classList.remove('drop-target', 'drop-move');
  }

  function _setDropHover(el, isMove) {
    if (_dropHoverEl && _dropHoverEl !== el) {
      _dropHoverEl.classList.remove('drop-hover');
    }
    _dropHoverEl = el || null;
    if (_dropHoverEl) _dropHoverEl.classList.add('drop-hover');
    const panel = _container?.closest('#file-tree-panel') || _container;
    if (panel) {
      panel.classList.add('drop-target');
      panel.classList.toggle('drop-move', !!isMove);
    }
  }

  /** Directory under the pointer, or focused / selected folder fallback. */
  function _resolveDropDir(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const row = el?.closest?.('.tree-item');
    if (row) {
      if (row.dataset.isDir === '1' && row.dataset.path) {
        return row.dataset.path;
      }
      // Dropped on a file row → use that file's parent
      const filePath = row.dataset.path;
      if (filePath) {
        const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
        if (idx >= 0) {
          let parent = filePath.slice(0, idx);
          // Windows drive root: "C:" → "C:\"
          if (/^[a-zA-Z]:$/.test(parent)) parent += '\\';
          return parent || null;
        }
      }
    }
    return _focusPath || null;
  }

  function _dropFilePath(file) {
    try {
      if (window.electronAPI.getPathForFile) {
        return window.electronAPI.getPathForFile(file) || file.path || '';
      }
    } catch (_) {}
    return file.path || '';
  }

  function _initDropZone() {
    const panel = _container.closest('#file-tree-panel') || _container;

    panel.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // External OS files only — ignore empty payloads
      if (![...e.dataTransfer.types].some((t) => t === 'Files')) return;

      const isMove = e.shiftKey;
      e.dataTransfer.dropEffect = isMove ? 'move' : 'copy';

      const dir = _resolveDropDir(e.clientX, e.clientY);
      const row = dir
        ? panel.querySelector(`.tree-item[data-path="${CSS.escape(dir)}"]`)
        : null;
      _setDropHover(row, isMove);
    });

    panel.addEventListener('dragleave', (e) => {
      if (!panel.contains(e.relatedTarget)) {
        _clearDropHover();
      }
    });

    panel.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isMove = e.shiftKey;
      const destDir = _resolveDropDir(e.clientX, e.clientY);
      _clearDropHover();

      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;

      if (window.electronAPI.platform === 'web') {
        // Web: no real filesystem copy — keep previous open/register behavior
        const items = [...(e.dataTransfer.items || [])];
        for (const item of items) {
          if (item.kind === 'file' && item.getAsFileSystemHandle) {
            try {
              const handle = await item.getAsFileSystemHandle();
              if (handle.kind === 'directory') {
                FileRegistry.clear();
                const root = await FileRegistry.mountDirectoryHandle(handle, '/');
                localStorage.setItem('webRootLabel', handle.name || 'Local Files');
                await loadDrives();
                await revealPath(root);
                if (_onDirOpen) _onDirOpen(root);
                return;
              }
            } catch {}
          }
        }
        for (const f of files) {
          const ext = FormatSupport.getExtension(f.name);
          if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)) {
            const p = FileRegistry.registerFile(f, destDir || '/');
            await loadDrives();
            await revealPath(destDir || '/');
            setSelected(p);
            if (_onSelect) await _onSelect(p);
            await refresh();
            return;
          }
        }
        return;
      }

      if (!destDir) {
        if (_onImport) {
          _onImport({ error: 'noDest' });
        }
        return;
      }

      const sources = [];
      for (const f of files) {
        const p = _dropFilePath(f);
        if (p) sources.push(p);
      }
      if (!sources.length) return;

      const mode = isMove ? 'move' : 'copy';
      const result = await window.electronAPI.transferIntoDir({
        sources,
        destDir,
        mode,
      });

      if (result?.error && !result.results) {
        if (_onImport) _onImport({ error: result.error, destDir, mode });
        return;
      }

      // Expand destination and refresh so new files appear
      _expandedDirs.add(destDir);
      // Normalize: also keep path from ancestors if needed
      await revealPath(destDir);
      await refresh();
      if (_onDirOpen) _onDirOpen(destDir, { activate: false });

      const copied = (result.results || []).filter((r) => r.dest && !r.skipped);
      const firstMedia = copied.find((r) => {
        const ext = FormatSupport.getExtension(r.dest);
        return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext);
      });

      if (firstMedia) {
        setSelected(firstMedia.dest);
        if (_onSelect) await _onSelect(firstMedia.dest);
      }

      if (_onImport) {
        _onImport({
          destDir,
          mode,
          count: copied.length,
          errors: result.errors,
          results: copied,
        });
      }
    });
  }

  function _norm(p) {
    if (!p) return '';
    return String(p).replace(/\//g, '\\').replace(/[\\/]+$/, '').toLowerCase();
  }

  function _pathsEqual(a, b) {
    return _norm(a) === _norm(b);
  }

  function _isDrivePath(p) {
    return _drives.some(d => _pathsEqual(d.path, p));
  }

  function _driveForPath(p) {
    if (!p) return null;
    const n = _norm(p);
    let best = null;
    for (const d of _drives) {
      const dn = _norm(d.path);
      if (n === dn || n.startsWith(dn + '\\') || n.startsWith(dn + '/')) {
        if (!best || dn.length > _norm(best.path).length) best = d;
      }
    }
    return best;
  }

  function _renderDriveBar() {
    const bar = document.getElementById('tree-drive-bar');
    if (!bar) return;
    const current = _driveForPath(_focusPath);
    const frag = document.createDocumentFragment();
    for (const d of _drives) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tree-drive-btn' + (_pathsEqual(current?.path, d.path) ? ' active' : '');
      btn.textContent = d.name;
      btn.title = d.path;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_onDriveSelect) _onDriveSelect(d.path);
        else if (_onDirOpen) _onDirOpen(d.path, { activate: true });
      });
      frag.appendChild(btn);
    }
    bar.replaceChildren(frag);
  }

  function _updatePathBar(dirPath) {
    const bar = document.getElementById('tree-path-bar');
    if (!bar) return;
    if (!dirPath) {
      bar.hidden = true;
      bar.textContent = '';
      bar.removeAttribute('title');
      _renderDriveBar();
      return;
    }
    bar.hidden = false;
    bar.textContent = dirPath;
    bar.title = dirPath;
    _renderDriveBar();
  }

  async function loadDrives() {
    const result = await window.electronAPI.listDrives();
    _drives = Array.isArray(result) ? result : [];
    _ready = true;
    _renderDriveBar();
    await _renderRoot();
  }

  /** Expand tree from drive root down to dirPath (full absolute path). */
  async function revealPath(dirPath) {
    if (!_ready) await loadDrives();
    if (!dirPath) {
      _focusPath = null;
      _updatePathBar(null);
      _renderDriveBar();
      await _renderRoot();
      return;
    }

    const ancestors = await window.electronAPI.pathAncestors(dirPath);
    _expandedDirs = new Set(ancestors);
    _focusPath = ancestors.length ? ancestors[ancestors.length - 1] : dirPath;
    _updatePathBar(_focusPath);
    _renderDriveBar();
    await _renderRoot();
    _highlightSelected();
    _flushCenterOrEnsureVisible();
  }

  /** @deprecated use revealPath — kept for callers that still pass openRoot */
  async function openRoot(dirPath) {
    return revealPath(dirPath);
  }

  function getRoot()         { return _focusPath; }
  function getSelected()     { return _selectedPath; }
  function setSelected(p, { center = false, scroll = true } = {}) {
    if (_pathsEqual(_selectedPath, p) && !center && !_selectedPaths.size) {
      if (scroll) _scrollRowIfNeeded();
      return;
    }
    const prev = _selectedPath;
    _selectedPath = p;
    const oldEl = prev ? _findTreeItem(prev) : null;
    const newEl = p ? _findTreeItem(p) : null;
    if (oldEl !== newEl) {
      oldEl?.classList.remove('selected');
      newEl?.classList.add('selected');
    }
    if (_selectedPaths.size) {
      for (const extra of _selectedPaths) {
        if (_pathsEqual(extra, p) || _pathsEqual(extra, prev)) continue;
        _findTreeItem(extra)?.classList.remove('selected');
      }
      _selectedPaths.clear();
    }
    if (center) {
      _centerOnce = true;
      _scrollOpenFileToCenter();
      return;
    }
    _centerOnce = false;
    if (scroll) _scrollRowIfNeeded();
  }

  /* ── Rendering ── */
  function isFoldersOnly() { return _foldersOnly; }

  async function setFoldersOnly(value) {
    const next = !!value;
    if (next === _foldersOnly) return;
    _foldersOnly = next;
    await refresh({ force: true });
  }

  async function _renderRoot() {
    if (!_container) return;

    if (!_drives.length) {
      const empty = document.createElement('div');
      empty.id = 'file-tree-empty';
      empty.innerHTML = `<span data-i18n="tree.noDir"></span><br>
        <span class="open-folder-link" data-i18n="tree.openFolder" id="ft-open-link"></span>`;
      _container.replaceChildren(empty);
      I18n.applyToDOM();
      document.getElementById('ft-open-link')?.addEventListener('click', () => {
        window.FileDialog?.openFolder().then((r) => {
          if (r && !r.canceled && r.filePath) {
            window.dispatchEvent(new CustomEvent('app-open-folder', { detail: r.filePath }));
          }
        });
      });
      return;
    }

    // Build off-DOM so the explorer does not blank/flicker between paints.
    const rootEl = document.createElement('div');
    rootEl.className = 'tree-root';
    for (const drive of _drives) {
      await _renderEntry(rootEl, {
        name: drive.name,
        path: drive.path,
        isDirectory: true,
        isDrive: true,
      }, 0);
    }
    _container.replaceChildren(rootEl);
  }

  async function _renderDir(parent, dirPath, depth) {
    let entries;
    try {
      entries = await window.electronAPI.readDirectory(dirPath);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'tree-item';
      err.style.cssText = `padding-left:${depth * 14 + 4}px;color:var(--text-muted);font-size:12px`;
      err.textContent = e.message || 'Error';
      parent.replaceChildren(err);
      return;
    }
    if (!entries || entries.error) {
      const msg = (entries && entries.error) ? entries.error : (I18n.t('tree.empty') || 'Empty');
      const empty = document.createElement('div');
      empty.className = 'tree-item';
      empty.style.cssText = `padding-left:${depth * 14 + 4}px;color:var(--text-muted);font-size:12px`;
      empty.textContent = msg;
      parent.replaceChildren(empty);
      return;
    }

    const rows = _foldersOnly ? entries.filter((e) => e.isDirectory || e.isDrive) : entries;
    const frag = document.createDocumentFragment();
    for (const entry of rows) {
      await _renderEntry(frag, entry, depth);
    }
    parent.replaceChildren(frag);
  }

  async function _renderEntry(parent, entry, depth) {
    const ext = FormatSupport.getExtension(entry.name);
    const isImg  = IMAGE_EXTS.has(ext);
    const isVid  = VIDEO_EXTS.has(ext);
    const isAud  = AUDIO_EXTS.has(ext);
    const isDir  = entry.isDirectory || entry.isDrive;
    const isDrive = !!entry.isDrive || _isDrivePath(entry.path);
    const isSup  = isImg || isVid || isAud;

    const row = document.createElement('div');
    row.className = `tree-item${isDir ? ' is-dir' : (isSup ? ' is-image' : ' is-other')}${isDrive ? ' is-drive' : ''}`;
    row.dataset.path = entry.path;
    row.dataset.isDir = isDir ? '1' : '0';
    if (isDrive) row.dataset.isDrive = '1';

    const indent = document.createElement('div');
    indent.className = 'tree-indent';
    indent.style.width = `${depth * 14 + 4}px`;
    row.appendChild(indent);

    const arrow = document.createElement('div');
    arrow.className = `tree-arrow${isDir ? '' : ' no-arrow'}`;
    if (isDir) {
      arrow.innerHTML = Icons.chevronRight;
      if (_expandedDirs.has(entry.path) || [..._expandedDirs].some(p => _pathsEqual(p, entry.path))) {
        arrow.classList.add('expanded');
        // Normalize expanded set to this exact path string
        if (![..._expandedDirs].includes(entry.path)) {
          for (const p of [..._expandedDirs]) {
            if (_pathsEqual(p, entry.path)) {
              _expandedDirs.delete(p);
              _expandedDirs.add(entry.path);
            }
          }
        }
      }
    }
    row.appendChild(arrow);

    const icon = document.createElement('div');
    let iconHtml;
    let iconClass;
    if (isDrive) {
      iconClass = 'tree-icon drive-icon';
      iconHtml = Icons.drive;
    } else if (isDir) {
      iconClass = 'tree-icon dir-icon';
      const expanded = [..._expandedDirs].some(p => _pathsEqual(p, entry.path));
      iconHtml = expanded ? Icons.folderOpen : Icons.folder;
    } else if (isSup && typeof Icons.forExtension === 'function') {
      const fmt = Icons.forExtension(ext);
      iconClass = `tree-icon ${fmt.className}`;
      iconHtml = fmt.html;
    } else if (isAud) {
      iconClass = 'tree-icon fmt-icon fmt-audio';
      iconHtml = Icons.fmtAudio || Icons.audio || Icons.effects;
    } else if (isImg || isVid) {
      iconClass = 'tree-icon img-icon';
      iconHtml = isVid ? (Icons.fmtVideo || Icons.image) : Icons.image;
    } else {
      iconClass = 'tree-icon file-icon';
      iconHtml = Icons.file;
    }
    icon.className = iconClass;
    icon.innerHTML = iconHtml;
    row.appendChild(icon);

    const label = document.createElement('div');
    label.className = 'tree-label';
    // Drives already include letter in name (e.g. "C:" or "Data (D:)")
    label.textContent = entry.name;
    label.title = entry.path;
    row.appendChild(label);

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      _container?.focus({ preventScroll: true });
      if (!entry.isDirectory && !entry.isDrive && isSup && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        _handleMultiClick(entry, e);
      } else {
        _selectedPaths.clear();
        _handleClick(row, { ...entry, isDirectory: isDir, isDrive }, arrow, icon, e);
      }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (_onContextMenu) _onContextMenu({ ...entry, isDirectory: isDir, isDrive }, e.clientX, e.clientY);
    });

    // Drag-out to OS (Explorer, Desktop, other apps) — Electron only
    if (!isDrive && window.electronAPI.platform !== 'web') {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        // Required for webContents.startDrag (native file drag)
        e.preventDefault();
        const paths = _pathsForDragOut(entry.path);
        if (!paths.length) return;
        window.electronAPI.startDrag(paths.length === 1 ? paths[0] : paths);
      });
    }

    if (_pathsEqual(entry.path, _selectedPath) || _selectedPaths.has(entry.path)) {
      row.classList.add('selected');
    }
    if (_focusPath && _pathsEqual(entry.path, _focusPath)) {
      row.classList.add('focused-path');
    }

    parent.appendChild(row);

    if (isDir && [..._expandedDirs].some(p => _pathsEqual(p, entry.path))) {
      const children = document.createElement('div');
      children.className = 'tree-children';
      children.dataset.parentPath = entry.path;
      parent.appendChild(children);
      await _renderDir(children, entry.path, depth + 1);
    }
  }

  async function _setDirExpanded(row, entry, arrow, icon, expand) {
    const isExpanded = [..._expandedDirs].some(p => _pathsEqual(p, entry.path));
    if (expand === isExpanded) return;
    if (!expand) {
      for (const p of [..._expandedDirs]) {
        if (_pathsEqual(p, entry.path) || _norm(p).startsWith(_norm(entry.path) + '\\') ||
            _norm(p).startsWith(_norm(entry.path) + '/')) {
          _expandedDirs.delete(p);
        }
      }
      arrow.classList.remove('expanded');
      if (!entry.isDrive) icon.innerHTML = Icons.folder;
      const children = row.parentElement.querySelector(
        `.tree-children[data-parent-path="${CSS.escape(entry.path)}"]`
      );
      if (children) children.remove();
      return;
    }
    _expandedDirs.add(entry.path);
    arrow.classList.add('expanded');
    if (!entry.isDrive) icon.innerHTML = Icons.folderOpen;
    const children = document.createElement('div');
    children.className = 'tree-children';
    children.dataset.parentPath = entry.path;
    row.insertAdjacentElement('afterend', children);
    children.innerHTML = `<div class="tree-item" style="padding-left:${parseInt(row.querySelector('.tree-indent').style.width) + 14}px;color:var(--text-muted);font-size:12px">${I18n.t('tree.loading')}</div>`;
    await _renderDir(children, entry.path, _getDepth(row) + 1);
  }

  async function _handleClick(row, entry, arrow, icon, e) {
    if (entry.isDirectory || entry.isDrive) {
      const clickedArrow = !!(e?.target?.closest?.('.tree-arrow'));
      const isExpanded = [..._expandedDirs].some(p => _pathsEqual(p, entry.path));
      const willExpand = !isExpanded;
      await _setDirExpanded(row, entry, arrow, icon, willExpand);
      _focusPath = entry.path;
      _updatePathBar(entry.path);
      if (_onDirOpen) _onDirOpen(entry.path, { activate: !clickedArrow && willExpand });
    } else {
      const ext = FormatSupport.getExtension(entry.name);
      const isSup = FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext) || FormatSupport.AUDIO_EXTS.has(ext);
      if (isSup) {
        _selectedPath = entry.path;
        _highlightSelected();
        if (_onSelect) _onSelect(entry.path);
      }
    }
  }

  function _getDepth(row) {
    return Math.round(parseInt(row.querySelector('.tree-indent')?.style.width || '0') / 14);
  }

  function _handleMultiClick(entry, e) {
    if (e.shiftKey && _lastClickedPath) {
      const allItems = Array.from(_container.querySelectorAll('.tree-item[data-is-dir="0"]'));
      const paths = allItems.map(el => el.dataset.path);
      const a = paths.indexOf(_lastClickedPath);
      const b = paths.indexOf(entry.path);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
        paths.slice(lo, hi + 1).forEach(p => _selectedPaths.add(p));
      }
    } else {
      if (_selectedPaths.has(entry.path)) {
        _selectedPaths.delete(entry.path);
      } else {
        _selectedPaths.add(entry.path);
        _lastClickedPath = entry.path;
        _selectedPath = entry.path;
      }
    }
    _lastClickedPath = entry.path;
    _highlightSelected();
  }

  function getSelectedPaths() {
    const set = new Set();
    for (const p of _selectedPaths) if (p) set.add(p);
    if (_selectedPath) set.add(_selectedPath);
    return Array.from(set);
  }

  /** Paths to export via native drag (multi-select aware). */
  function _pathsForDragOut(primaryPath) {
    const selected = getSelectedPaths();
    const primaryInSelection = selected.some((p) => _pathsEqual(p, primaryPath));
    if (selected.length > 1 && primaryInSelection) return selected;
    return primaryPath ? [primaryPath] : [];
  }

  function _highlightSelected() {
    if (!_container) return;
    _container.querySelectorAll('.tree-item[data-path]').forEach(el => {
      const on = _pathsEqual(el.dataset.path, _selectedPath) || _selectedPaths.has(el.dataset.path);
      el.classList.toggle('selected', on);
    });
  }

  function _findTreeItem(path) {
    if (!_container || !path) return null;
    for (const el of _container.querySelectorAll('.tree-item[data-path]')) {
      if (_pathsEqual(el.dataset.path, path)) return el;
    }
    return null;
  }

  function _isRowVisible(el) {
    if (!el || !_container) return false;
    const cRect = _container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    return eRect.top >= cRect.top && eRect.bottom <= cRect.bottom;
  }

  function _visibleRows() {
    if (!_container) return [];
    return [..._container.querySelectorAll('.tree-item[data-path]')];
  }

  function _rowIndex(path) {
    if (!path) return -1;
    return _visibleRows().findIndex((el) => _pathsEqual(el.dataset.path, path));
  }

  function _isSupportedPath(path) {
    const name = String(path || '').split(/[/\\]/).pop() || '';
    const ext = FormatSupport.getExtension(name);
    return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext);
  }

  async function _moveBy(delta) {
    const rows = _visibleRows();
    if (!rows.length) return false;
    let i = _rowIndex(_selectedPath);
    if (i < 0) i = _rowIndex(_focusPath);
    if (i < 0) i = delta > 0 ? -1 : rows.length;
    const next = i + delta;
    if (next < 0 || next >= rows.length) return true;
    const row = rows[next];
    const path = row.dataset.path;
    if (!path) return true;
    const isDir = row.dataset.isDir === '1';
    _selectedPath = path;
    _selectedPaths.clear();
    _highlightSelected();
    _scrollRowIfNeeded();
    if (isDir) {
      _focusPath = path;
      _updatePathBar(path);
      return true;
    }
    if (_isSupportedPath(path) && _onSelect) await _onSelect(path);
    return true;
  }

  function handleKey(e) {
    if (!_container || !_ready && !_visibleRows().length) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _moveBy(1);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      _moveBy(-1);
      return true;
    }
    return false;
  }

  function _scrollRowIfNeeded() {
    const el = _findTreeItem(_selectedPath);
    if (!el || _isRowVisible(el)) return;
    _scrollRow('nearest');
  }

  function _scrollRow(mode) {
    const path = _selectedPath || _focusPath;
    if (!path || !_container) return;
    const el = _findTreeItem(_selectedPath) || _findTreeItem(path);
    if (!el) return;
    if (mode !== 'center' && _isRowVisible(el)) return;
    const run = () => {
      const row = _findTreeItem(_selectedPath) || _findTreeItem(path);
      if (!row) return;
      const scroller = _container;
      const cRect = scroller.getBoundingClientRect();
      const eRect = row.getBoundingClientRect();
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (mode === 'center') {
        const top = scroller.scrollTop + (eRect.top - cRect.top) - (scroller.clientHeight / 2) + (eRect.height / 2);
        scroller.scrollTop = Math.max(0, Math.min(max, top));
        return;
      }
      if (eRect.top >= cRect.top && eRect.bottom <= cRect.bottom) return;
      if (eRect.top < cRect.top) {
        scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + (eRect.top - cRect.top)));
      } else {
        scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + (eRect.bottom - cRect.bottom)));
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  function _scrollOpenFileToCenter() {
    _scrollRow('center');
  }

  function _flushCenterOrEnsureVisible(prevScroll) {
    if (_centerOnce) {
      _centerOnce = false;
      _scrollOpenFileToCenter();
      return;
    }
    if (prevScroll != null && _container) _container.scrollTop = prevScroll;
    _scrollRow('nearest');
  }

  async function getImageFilesInDir(dirPath) {
    const entries = await window.electronAPI.readDirectory(dirPath);
    if (!entries || entries.error) return [];
    return entries
      .filter(e => !e.isDirectory && FormatSupport.isSupportedFile(e.path))
      .map(e => e.path);
  }

  /** Case-/slash-insensitive index in a path list (Windows-safe). */
  function indexOfPath(list, target) {
    if (!list || !target) return -1;
    const n = _norm(target);
    return list.findIndex((p) => _norm(p) === n);
  }

  function _rewritePath(p, fromPath, toPath) {
    if (!p || !fromPath || !toPath) return p;
    const sep = /\\/.test(fromPath) ? '\\' : '/';
    const norm = (s) => String(s).replace(/[/\\]+/g, sep).replace(/[\\/]+$/, '');
    const np = norm(p);
    const nf = norm(fromPath);
    const nt = norm(toPath);
    if (np.toLowerCase() === nf.toLowerCase()) return toPath;
    const prefix = nf + sep;
    if (np.toLowerCase().startsWith(prefix.toLowerCase())) return nt + np.slice(nf.length);
    return p;
  }

  /** After a rename: keep expansion / selection pointed at the new path. */
  function remapPath(fromPath, toPath) {
    if (!fromPath || !toPath || _pathsEqual(fromPath, toPath)) return;
    _expandedDirs = new Set([..._expandedDirs].map((p) => _rewritePath(p, fromPath, toPath)));
    _selectedPath = _rewritePath(_selectedPath, fromPath, toPath);
    _selectedPaths = new Set([..._selectedPaths].map((p) => _rewritePath(p, fromPath, toPath)));
    _focusPath = _rewritePath(_focusPath, fromPath, toPath);
    _lastClickedPath = _rewritePath(_lastClickedPath, fromPath, toPath);
  }

  /** Drop a path from expansion/selection state (after delete). */
  function forgetPath(targetPath) {
    if (!targetPath) return;
    const n = _norm(targetPath);
    for (const p of [..._expandedDirs]) {
      const pn = _norm(p);
      if (pn === n || pn.startsWith(n + '\\') || pn.startsWith(n + '/')) {
        _expandedDirs.delete(p);
      }
    }
    if (_pathsEqual(_selectedPath, targetPath)) _selectedPath = null;
    if (_selectedPaths.has(targetPath)) _selectedPaths.delete(targetPath);
    for (const p of [..._selectedPaths]) {
      const pn = _norm(p);
      if (pn === n || pn.startsWith(n + '\\') || pn.startsWith(n + '/')) {
        _selectedPaths.delete(p);
      }
    }
    if (_pathsEqual(_focusPath, targetPath)) {
      _focusPath = null;
      // try parent
    }
  }

  function _visiblePathSignature() {
    if (!_container) return '';
    return Array.from(_container.querySelectorAll('.tree-item[data-path]'))
      .map((el) => _norm(el.dataset.path))
      .join('\n');
  }

  async function _walkExpandedPaths(dirPath, out) {
    if (![..._expandedDirs].some((p) => _pathsEqual(p, dirPath))) return;
    let entries;
    try {
      entries = await window.electronAPI.readDirectory(dirPath);
    } catch {
      return;
    }
    if (!entries || entries.error) return;
    for (const entry of entries) {
      out.push(_norm(entry.path));
      if (entry.isDirectory || entry.isDrive) await _walkExpandedPaths(entry.path, out);
    }
  }

  async function _expectedPathSignature() {
    const paths = [];
    for (const drive of _drives) {
      paths.push(_norm(drive.path));
      await _walkExpandedPaths(drive.path, paths);
    }
    return paths.join('\n');
  }

  /**
   * Re-read disk. Without `{ force: true }` the explorer DOM is left as-is
   * (selection-only updates go through setSelected).
   */
  async function refresh({ force = false } = {}) {
    if (!force) return;
    if (_refreshing) return;
    if (!_ready) {
      await loadDrives();
      return;
    }
    _refreshing = true;
    try {
      try {
        const result = await window.electronAPI.listDrives();
        if (Array.isArray(result) && result.length) _drives = result;
      } catch {}
      try {
        const expected = await _expectedPathSignature();
        if (expected && expected === _visiblePathSignature()) return;
      } catch { /* fall through to a full rebuild */ }
      const prevScroll = _container ? _container.scrollTop : 0;
      await _renderRoot();
      _highlightSelected();
      if (_focusPath) _updatePathBar(_focusPath);
      _renderDriveBar();
      _flushCenterOrEnsureVisible(prevScroll);
    } finally {
      _refreshing = false;
    }
  }

  return {
    init, loadDrives, revealPath, openRoot, getRoot, getSelected, setSelected,
    getSelectedPaths, getImageFilesInDir, indexOfPath, refresh, forgetPath, remapPath, handleKey,
    setFoldersOnly, isFoldersOnly,
  };
})();
