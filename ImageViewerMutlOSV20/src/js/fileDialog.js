/* In-app open / save file dialog (replaces OS picker) */
window.FileDialog = (() => {
  let _overlay = null;
  let _resolve = null;
  let _mode = 'openFile';
  let _cwd = '';
  let _selected = null;
  let _filter = 'all';
  let _sep = '\\';
  let _bound = false;

  const SAVE_EXTS = ['png', 'jpg', 'webp', 'bmp'];

  function _t(key, fallback) {
    const v = window.I18n && I18n.t(key);
    if (v && v !== key) return v;
    return fallback || key;
  }

  function _els() {
    return {
      overlay: document.getElementById('file-dialog-overlay'),
      title: document.getElementById('fd-title'),
      close: document.getElementById('fd-close'),
      up: document.getElementById('fd-up'),
      home: document.getElementById('fd-home'),
      path: document.getElementById('fd-path'),
      drives: document.getElementById('fd-drives'),
      list: document.getElementById('fd-list'),
      nameRow: document.getElementById('fd-name-row'),
      name: document.getElementById('fd-name'),
      filter: document.getElementById('fd-filter'),
      cancel: document.getElementById('fd-cancel'),
      ok: document.getElementById('fd-ok'),
      okLabel: document.getElementById('fd-ok-label'),
    };
  }

  function _bindOnce() {
    if (_bound) return;
    _bound = true;
    const e = _els();
    if (e.up) {
      e.up.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8z"/></svg>`;
      e.up.title = _t('fd.up', 'Up');
    }
    if (e.home) {
      e.home.innerHTML = Icons.folderOpen || Icons.folder || '';
      e.home.title = _t('fd.home', 'Home');
    }
    e.close?.addEventListener('click', () => _finish({ canceled: true }));
    e.cancel?.addEventListener('click', () => _finish({ canceled: true }));
    e.ok?.addEventListener('click', () => _confirm());
    e.up?.addEventListener('click', () => _goUp());
    e.home?.addEventListener('click', () => _goHome());
    e.path?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        _goTo(e.path.value.trim());
      }
    });
    e.filter?.addEventListener('change', () => {
      _filter = e.filter.value;
      if (_mode === 'save') _ensureSaveExt();
      _renderList();
    });
    e.name?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        _confirm();
      }
    });
    e.overlay?.addEventListener('click', (ev) => {
      if (ev.target === e.overlay) _finish({ canceled: true });
    });
    e.list?.addEventListener('dblclick', (ev) => {
      const row = ev.target.closest?.('.fd-row');
      if (!row) return;
      _activateRow(row, true);
    });
    e.list?.addEventListener('click', (ev) => {
      const row = ev.target.closest?.('.fd-row');
      if (!row) return;
      _activateRow(row, false);
    });
    document.addEventListener('keydown', (ev) => {
      if (!_overlay || _overlay.style.display !== 'flex') return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        _finish({ canceled: true });
        return;
      }
      if (ev.key === 'Enter' && ev.target !== e.path && ev.target !== e.name) {
        ev.preventDefault();
        _confirm();
      }
    }, true);
  }

  function _norm(p) {
    return String(p || '').replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
  }

  function _isDriveRoot(p) {
    return /^[a-z]:\\?$/i.test(String(p || '').replace(/\//g, '\\'));
  }

  async function _join(...parts) {
    const api = window.electronAPI;
    if (api?.pathJoin) return api.pathJoin(...parts);
    return parts.join(_sep).replace(/[\\/]+/g, _sep);
  }

  async function _dirname(p) {
    const api = window.electronAPI;
    if (api?.pathDirname) return api.pathDirname(p);
    const s = String(p || '').replace(/[\\/]+$/, '');
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return i > 0 ? s.slice(0, i) : s;
  }

  async function _basename(p) {
    const api = window.electronAPI;
    if (api?.pathBasename) return api.pathBasename(p);
    return String(p || '').split(/[/\\]/).pop() || '';
  }

  function _extOf(name) {
    const n = String(name || '');
    const d = n.lastIndexOf('.');
    return d >= 0 ? n.slice(d + 1).toLowerCase() : '';
  }

  function _matchesFilter(entry) {
    if (entry.isDirectory) return true;
    if (_mode === 'openFolder') return false;
    const ext = _extOf(entry.name);
    if (_mode === 'save') {
      if (_filter === 'all') return SAVE_EXTS.includes(ext);
      return ext === _filter || (_filter === 'jpg' && ext === 'jpeg');
    }
    if (_filter === 'images') return FormatSupport.IMAGE_EXTS.has(ext);
    if (_filter === 'video') return FormatSupport.VIDEO_EXTS.has(ext);
    if (_filter === 'audio') return FormatSupport.AUDIO_EXTS.has(ext);
    return FormatSupport.isSupportedFile(entry.path);
  }

  function _iconFor(entry) {
    if (entry.isDrive) return Icons.drive;
    if (entry.isDirectory) return Icons.folder;
    const info = Icons.forExtension(_extOf(entry.name));
    return (info && info.html) || Icons.file;
  }

  async function _startDir(defaultPath) {
    const api = window.electronAPI;
    let start = '';
    if (defaultPath) {
      try {
        const stats = await api.getFileStats(defaultPath);
        if (stats && !stats.error && stats.isDirectory) start = defaultPath;
        else start = await _dirname(defaultPath);
      } catch { start = defaultPath; }
    }
    if (!start) start = localStorage.getItem('lastOpenedDir') || '';
    if (start) {
      try {
        const stats = await api.getFileStats(start);
        if (stats && !stats.error && stats.isDirectory) return start;
      } catch {}
    }
    try {
      const drives = await api.listDrives();
      if (Array.isArray(drives) && drives[0]?.path) return drives[0].path;
    } catch {}
    try {
      const home = await api.getHomeDir();
      if (home) return home;
    } catch {}
    return '';
  }

  function _fillFilters() {
    const e = _els();
    if (!e.filter) return;
    e.filter.innerHTML = '';
    const opts = _mode === 'save'
      ? [
          ['png', _t('fd.filterPng', 'PNG (*.png)')],
          ['jpg', _t('fd.filterJpeg', 'JPEG (*.jpg)')],
          ['webp', _t('fd.filterWebp', 'WebP (*.webp)')],
          ['bmp', _t('fd.filterBmp', 'BMP (*.bmp)')],
        ]
      : _mode === 'openFolder'
        ? [['all', _t('fd.filterFolders', 'Folders')]]
        : [
            ['all', _t('fd.filterSupported', 'Supported media')],
            ['images', _t('fd.filterImages', 'Images')],
            ['video', _t('fd.filterVideo', 'Video')],
            ['audio', _t('fd.filterAudio', 'Audio')],
          ];
    for (const [val, label] of opts) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      e.filter.appendChild(o);
    }
    _filter = opts[0][0];
    e.filter.value = _filter;
    e.filter.disabled = _mode === 'openFolder';
  }

  function _ensureSaveExt() {
    const e = _els();
    if (!e.name || _mode !== 'save') return;
    let name = (e.name.value || '').trim();
    if (!name) name = 'image';
    const ext = _extOf(name);
    const want = _filter === 'jpg' ? 'jpg' : _filter;
    if (!SAVE_EXTS.includes(ext) && ext !== 'jpeg') {
      e.name.value = `${name.replace(/\.[^.]+$/, '')}.${want}`;
    } else if (want === 'jpg' && ext === 'jpeg') {
      /* ok */
    } else if (ext !== want && want !== 'all') {
      e.name.value = `${name.replace(/\.[^.]+$/, '')}.${want}`;
    }
  }

  async function _goTo(dirPath) {
    if (!dirPath) return;
    try {
      const stats = await window.electronAPI.getFileStats(dirPath);
      if (!stats || stats.error || !stats.isDirectory) return;
      _cwd = dirPath;
      _selected = { path: dirPath, isDirectory: true, name: await _basename(dirPath) };
      await _render();
    } catch {}
  }

  async function _goUp() {
    if (!_cwd) return;
    const parent = await _dirname(_cwd);
    if (!parent || _norm(parent) === _norm(_cwd)) return;
    await _goTo(parent);
  }

  async function _goHome() {
    try {
      const home = await window.electronAPI.getHomeDir();
      if (home) await _goTo(home);
    } catch {}
  }

  async function _activateRow(row, dbl) {
    const p = row.dataset.path;
    const isDir = row.dataset.dir === '1';
    const name = row.dataset.name || '';
    _selected = { path: p, isDirectory: isDir, name };
    _highlight();
    const e = _els();
    if (_mode === 'save' && !isDir && e.name) e.name.value = name;
    if (!dbl) return;
    if (isDir) await _goTo(p);
    else if (_mode === 'openFile') _confirm();
    else if (_mode === 'save') _confirm();
  }

  function _highlight() {
    const e = _els();
    e.list?.querySelectorAll('.fd-row').forEach((row) => {
      row.classList.toggle('selected', _selected && _norm(row.dataset.path) === _norm(_selected.path));
    });
  }

  async function _renderDrives() {
    const e = _els();
    if (!e.drives) return;
    e.drives.innerHTML = '';
    let drives = [];
    try {
      const result = await window.electronAPI.listDrives();
      if (Array.isArray(result)) drives = result;
    } catch {}
    for (const d of drives) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fd-drive';
      if (_norm(d.path) === _norm(_cwd) || _norm(_cwd).startsWith(_norm(d.path) + '/')
          || String(_cwd).toLowerCase().startsWith(String(d.path).replace(/\\/g, '/').toLowerCase())) {
        btn.classList.add('active');
      }
      btn.innerHTML = `<span class="fd-drive-icon">${Icons.drive}</span><span class="fd-drive-label">${d.name || d.path}</span>`;
      btn.title = d.path;
      btn.addEventListener('click', () => _goTo(d.path));
      e.drives.appendChild(btn);
    }
  }

  async function _renderList() {
    const e = _els();
    if (!e.list) return;
    e.list.innerHTML = `<div class="fd-empty">${_t('tree.loading', 'Loading...')}</div>`;
    let entries = [];
    try {
      const result = await window.electronAPI.readDirectory(_cwd);
      if (Array.isArray(result)) entries = result;
      else if (result?.error) {
        e.list.innerHTML = `<div class="fd-empty">${result.error}</div>`;
        return;
      }
    } catch (err) {
      e.list.innerHTML = `<div class="fd-empty">${err.message || 'Error'}</div>`;
      return;
    }
    const rows = entries.filter(_matchesFilter);
    e.list.innerHTML = '';
    if (!rows.length) {
      e.list.innerHTML = `<div class="fd-empty">${_t('fd.empty', 'Empty')}</div>`;
      return;
    }
    for (const entry of rows) {
      const row = document.createElement('div');
      row.className = `fd-row${entry.isDirectory ? ' is-dir' : ' is-file'}`;
      row.dataset.path = entry.path;
      row.dataset.dir = entry.isDirectory ? '1' : '0';
      row.dataset.name = entry.name;
      row.innerHTML = `<span class="fd-icon">${_iconFor(entry)}</span><span class="fd-name"></span>`;
      row.querySelector('.fd-name').textContent = entry.name;
      e.list.appendChild(row);
    }
    _highlight();
  }

  async function _render() {
    const e = _els();
    if (e.path) e.path.value = _cwd;
    await _renderDrives();
    await _renderList();
  }

  async function _confirm() {
    const e = _els();
    if (_mode === 'openFile') {
      if (!_selected || _selected.isDirectory) return;
      if (!FormatSupport.isSupportedFile(_selected.path)) return;
      _finish({ canceled: false, filePath: _selected.path });
      return;
    }
    if (_mode === 'openFolder') {
      const p = (_selected && _selected.isDirectory) ? _selected.path : _cwd;
      if (!p) return;
      _finish({ canceled: false, filePath: p });
      return;
    }
    _ensureSaveExt();
    const name = (e.name?.value || '').trim();
    if (!name || !_cwd) return;
    const filePath = await _join(_cwd, name);
    try {
      const stats = await window.electronAPI.getFileStats(filePath);
      if (stats && !stats.error && !stats.isDirectory) {
        const ok = window.confirm(_t('fd.overwrite', 'A file with this name already exists. Overwrite?'));
        if (!ok) return;
      }
    } catch {}
    _finish({ canceled: false, filePath });
  }

  function _finish(result) {
    if (_overlay) {
      _overlay.style.display = 'none';
      _overlay.classList.remove('visible');
    }
    if (result && !result.canceled && result.filePath) {
      try {
        const dir = _mode === 'openFolder' ? result.filePath : _cwd;
        if (dir) {
          localStorage.setItem('lastOpenedDir', dir);
          window.electronAPI?.setLastOpenDir?.(dir);
        }
      } catch { /* ignore */ }
    }
    const done = _resolve;
    _resolve = null;
    if (done) done(result);
  }

  async function show({ mode = 'openFile', defaultPath = '', title = '' } = {}) {
    _bindOnce();
    _overlay = document.getElementById('file-dialog-overlay');
    if (!_overlay) return { canceled: true };
    if (_resolve) _finish({ canceled: true });

    try { _sep = await window.electronAPI.getPathSep(); } catch { _sep = '\\'; }

    _mode = mode;
    const e = _els();
    const titles = {
      openFile: _t('fd.openFile', 'Open File'),
      openFolder: _t('fd.openFolder', 'Open Folder'),
      save: _t('fd.saveAs', 'Save As'),
    };
    if (e.title) e.title.textContent = title || titles[mode] || titles.openFile;
    const titleIcon = document.getElementById('fd-title-icon');
    if (titleIcon) titleIcon.innerHTML = Icons[mode === 'save' ? 'saveAs' : mode === 'openFolder' ? 'openFolder' : 'openFile'] || '';
    if (e.okLabel) {
      e.okLabel.textContent = mode === 'save'
        ? _t('fd.save', 'Save')
        : _t('fd.open', 'Open');
    }
    if (e.nameRow) e.nameRow.style.display = 'flex';
    if (e.up) e.up.title = _t('fd.up', 'Up');
    if (e.home) e.home.title = _t('fd.home', 'Home');
    if (e.name) {
      e.name.style.display = mode === 'save' ? 'block' : 'none';
    }
    const nameLbl = document.getElementById('fd-name-label');
    if (nameLbl) nameLbl.style.display = mode === 'save' ? 'block' : 'none';
    _fillFilters();

    let nameHint = '';
    if (mode === 'save' && defaultPath) {
      nameHint = await _basename(defaultPath);
      const ext = _extOf(nameHint);
      if (SAVE_EXTS.includes(ext) || ext === 'jpeg') {
        _filter = ext === 'jpeg' ? 'jpg' : ext;
        if (e.filter) e.filter.value = _filter;
      }
    }
    if (e.name) e.name.value = nameHint || (mode === 'save' ? 'image.png' : '');

    _cwd = await _startDir(defaultPath);
    _selected = _cwd ? { path: _cwd, isDirectory: true, name: await _basename(_cwd) } : null;

    _overlay.style.display = 'flex';
    _overlay.classList.add('visible');
    await _render();
    if (mode === 'save') e.name?.focus();
    else e.path?.focus();

    return new Promise((resolve) => { _resolve = resolve; });
  }

  return {
    openFile: () => show({ mode: 'openFile' }),
    openFolder: (opts) => show({ mode: 'openFolder', ...(opts || {}) }),
    save: (opts) => show({ mode: 'save', ...(opts || {}) }),
  };
})();
