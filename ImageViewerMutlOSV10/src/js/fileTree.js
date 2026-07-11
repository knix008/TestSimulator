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
  let _onContextMenu = null;
  let _pathSep       = '/';
  let _ready         = false;

  const IMAGE_EXTS = FormatSupport.IMAGE_EXTS;
  const VIDEO_EXTS = FormatSupport.VIDEO_EXTS;
  const AUDIO_EXTS = FormatSupport.AUDIO_EXTS;

  function init(container, { onSelect, onDirOpen, onContextMenu }) {
    _container = container;
    _onSelect  = onSelect;
    _onDirOpen = onDirOpen;
    _onContextMenu = onContextMenu || null;
    window.electronAPI.getPathSep().then(sep => { _pathSep = sep; });
    _initDropZone();
  }

  function _initDropZone() {
    const panel = _container.closest('#file-tree-panel') || _container;

    panel.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      panel.classList.add('drop-target');
    });

    panel.addEventListener('dragleave', (e) => {
      if (!panel.contains(e.relatedTarget)) {
        panel.classList.remove('drop-target');
      }
    });

    panel.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.remove('drop-target');

      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;

      if (window.electronAPI.platform === 'web') {
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
          if (FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext) || FormatSupport.AUDIO_EXTS.has(ext)) {
            const p = FileRegistry.registerFile(f, '/');
            await loadDrives();
            await revealPath('/');
            setSelected(p);
            if (_onSelect) await _onSelect(p);
            await refresh();
            return;
          }
        }
        return;
      }

      const dropPath = (f) =>
        (window.electronAPI.getPathForFile && window.electronAPI.getPathForFile(f)) || f.path || '';

      for (const f of files) {
        const p = dropPath(f);
        if (!p) continue;
        const stats = await window.electronAPI.getFileStats(p);
        if (stats && !stats.error && stats.isDirectory) {
          await revealPath(p);
          if (_onDirOpen) _onDirOpen(p);
          await refresh();
          return;
        }
      }

      for (const f of files) {
        const p = dropPath(f);
        if (!p) continue;
        const ext = FormatSupport.getExtension(f.name);
        if (FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext) || FormatSupport.AUDIO_EXTS.has(ext)) {
          const dir = await window.electronAPI.pathDirname(p);
          await revealPath(dir);
          setSelected(p);
          if (_onSelect) await _onSelect(p);
          await refresh();
          setSelected(p);
          return;
        }
      }

      // Fallback: any dropped path
      const p = dropPath(files[0]);
      if (p) {
        const dir = await window.electronAPI.pathDirname(p);
        await revealPath(dir);
        setSelected(p);
        if (_onSelect) await _onSelect(p);
        await refresh();
        setSelected(p);
      }
    });
  }

  function _norm(p) {
    if (!p) return '';
    return p.replace(/[\\/]+$/, '').toLowerCase();
  }

  function _pathsEqual(a, b) {
    return _norm(a) === _norm(b);
  }

  function _isDrivePath(p) {
    return _drives.some(d => _pathsEqual(d.path, p));
  }

  function _updatePathBar(dirPath) {
    const bar = document.getElementById('tree-path-bar');
    if (!bar) return;
    if (!dirPath) {
      bar.hidden = true;
      bar.textContent = '';
      bar.removeAttribute('title');
      return;
    }
    bar.hidden = false;
    bar.textContent = dirPath;
    bar.title = dirPath;
  }

  async function loadDrives() {
    const result = await window.electronAPI.listDrives();
    _drives = Array.isArray(result) ? result : [];
    _ready = true;
    await _renderRoot();
  }

  /** Expand tree from drive root down to dirPath (full absolute path). */
  async function revealPath(dirPath) {
    if (!_ready) await loadDrives();
    if (!dirPath) {
      _focusPath = null;
      _updatePathBar(null);
      await _renderRoot();
      return;
    }

    const ancestors = await window.electronAPI.pathAncestors(dirPath);
    _expandedDirs = new Set(ancestors);
    _focusPath = ancestors.length ? ancestors[ancestors.length - 1] : dirPath;
    _updatePathBar(_focusPath);
    await _renderRoot();

    // Scroll focused folder into view
    requestAnimationFrame(() => {
      const el = _container?.querySelector(`.tree-item[data-path="${CSS.escape(_focusPath)}"]`);
      el?.scrollIntoView({ block: 'nearest' });
      if (el) el.classList.add('selected');
    });
  }

  /** @deprecated use revealPath — kept for callers that still pass openRoot */
  async function openRoot(dirPath) {
    return revealPath(dirPath);
  }

  function getRoot()         { return _focusPath; }
  function getSelected()     { return _selectedPath; }
  function setSelected(p)    { _selectedPath = p; _highlightSelected(); }

  /* ── Rendering ── */
  async function _renderRoot() {
    if (!_container) return;
    _container.innerHTML = '';

    if (!_drives.length) {
      _container.innerHTML = `<div id="file-tree-empty">
        <span data-i18n="tree.noDir"></span><br>
        <span class="open-folder-link" data-i18n="tree.openFolder" id="ft-open-link"></span>
      </div>`;
      I18n.applyToDOM();
      document.getElementById('ft-open-link')?.addEventListener('click', () => {
        window.electronAPI.openFolderDialog();
      });
      return;
    }

    const rootEl = document.createElement('div');
    rootEl.className = 'tree-root';
    _container.appendChild(rootEl);

    for (const drive of _drives) {
      await _renderEntry(rootEl, {
        name: drive.name,
        path: drive.path,
        isDirectory: true,
        isDrive: true,
      }, 0);
    }
  }

  async function _renderDir(parent, dirPath, depth) {
    // Clear any "Loading..." placeholder before painting entries
    parent.innerHTML = '';
    let entries;
    try {
      entries = await window.electronAPI.readDirectory(dirPath);
    } catch (e) {
      parent.innerHTML = `<div class="tree-item" style="padding-left:${depth * 14 + 4}px;color:var(--text-muted);font-size:12px">${e.message || 'Error'}</div>`;
      return;
    }
    if (!entries || entries.error) {
      const msg = (entries && entries.error) ? entries.error : (I18n.t('tree.empty') || 'Empty');
      parent.innerHTML = `<div class="tree-item" style="padding-left:${depth * 14 + 4}px;color:var(--text-muted);font-size:12px">${msg}</div>`;
      return;
    }

    for (const entry of entries) {
      await _renderEntry(parent, entry, depth);
    }
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
    icon.className = `tree-icon ${isDrive ? 'drive-icon' : (isDir ? 'dir-icon' : (isSup ? 'img-icon' : 'file-icon'))}`;
    const expanded = [..._expandedDirs].some(p => _pathsEqual(p, entry.path));
    icon.innerHTML = isDrive
      ? Icons.drive
      : (isDir
        ? (expanded ? Icons.folderOpen : Icons.folder)
        : (isAud ? (Icons.audio || Icons.effects) : (isImg || isVid ? Icons.image : Icons.file)));
    row.appendChild(icon);

    const label = document.createElement('div');
    label.className = 'tree-label';
    // Drives already include letter in name (e.g. "C:" or "Data (D:)")
    label.textContent = entry.name;
    label.title = entry.path;
    row.appendChild(label);

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!entry.isDirectory && !entry.isDrive && isSup && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        _handleMultiClick(entry, e);
      } else {
        _selectedPaths.clear();
        _handleClick(row, { ...entry, isDirectory: isDir, isDrive }, arrow, icon);
      }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (_onContextMenu) _onContextMenu({ ...entry, isDirectory: isDir }, e.clientX, e.clientY);
    });

    // Drag-out: allow dragging files to external apps (Electron only)
      if (!isDir && isSup && window.electronAPI.platform !== 'web') {
        row.draggable = true;
        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/plain', entry.path);
          window.electronAPI.startDrag(entry.path);
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

  async function _handleClick(row, entry, arrow, icon) {
    if (entry.isDirectory || entry.isDrive) {
      const isExpanded = [..._expandedDirs].some(p => _pathsEqual(p, entry.path));
      if (isExpanded) {
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
      } else {
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
      _focusPath = entry.path;
      _updatePathBar(entry.path);
      if (_onDirOpen) _onDirOpen(entry.path);
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

  function getSelectedPaths() { return Array.from(_selectedPaths); }

  function _highlightSelected() {
    if (!_container) return;
    _container.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
    _container.querySelectorAll('.tree-item[data-path]').forEach(el => {
      if (_pathsEqual(el.dataset.path, _selectedPath) || _selectedPaths.has(el.dataset.path)) {
        el.classList.add('selected');
      }
    });
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

  /** Re-read disk and redraw, keeping expanded folders / selection. */
  async function refresh() {
    if (!_ready) {
      await loadDrives();
      return;
    }
    // Re-probe drives in case volumes were added/removed
    try {
      const result = await window.electronAPI.listDrives();
      if (Array.isArray(result) && result.length) _drives = result;
    } catch {}
    await _renderRoot();
    _highlightSelected();
    if (_focusPath) _updatePathBar(_focusPath);
  }

  return {
    init, loadDrives, revealPath, openRoot, getRoot, getSelected, setSelected,
    getSelectedPaths, getImageFilesInDir, indexOfPath, refresh, forgetPath,
  };
})();
