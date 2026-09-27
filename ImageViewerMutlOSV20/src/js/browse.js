/* Browse view — an ACDSee-style contact sheet for one folder.
   Subfolders first, then images; double-click an image to view the original. */
window.Browse = (() => {
  const VIEW_KEY = 'browseViewV1';   // { mode, size, sort, desc }

  let _root        = null;   // #browse-view
  let _grid        = null;
  let _pathEl      = null;
  let _countEl     = null;
  let _dir         = '';
  let _entries     = [];
  let _selected    = '';
  let _observer    = null;
  let _onOpenFile  = null;
  let _onOpenDir   = null;
  let _onContextMenu = null;
  let _bound       = false;

  const _view = { mode: 'grid', size: 160, sort: 'name', desc: false };

  const _t = (key, fallback) => {
    const v = window.I18n && I18n.t(key);
    return (v && v !== key) ? v : (fallback || key);
  };

  const _same = (a, b) =>
    String(a || '').replace(/[\\/]+$/, '').toLowerCase() ===
    String(b || '').replace(/[\\/]+$/, '').toLowerCase();

  function _loadView() {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
      if (['grid', 'list', 'details'].includes(saved.mode)) _view.mode = saved.mode;
      if (saved.size >= 80 && saved.size <= 320) _view.size = saved.size;
      if (['name', 'date', 'size', 'type'].includes(saved.sort)) _view.sort = saved.sort;
      if (typeof saved.desc === 'boolean') _view.desc = saved.desc;
    } catch { /* defaults */ }
  }

  function _saveView() {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(_view)); } catch { /* ignore */ }
  }

  function _buildChrome() {
    _root.innerHTML = `
      <div class="browse-bar">
        <button type="button" class="browse-btn" id="browse-up"></button>
        <span class="browse-path" id="browse-path" title=""></span>
        <span class="browse-count" id="browse-count"></span>
        <span class="browse-spacer"></span>
        <select class="browse-select" id="browse-sort">
          <option value="name">${_t('browse.sortName', 'Name')}</option>
          <option value="date">${_t('browse.sortDate', 'Date')}</option>
          <option value="size">${_t('browse.sortSize', 'Size')}</option>
          <option value="type">${_t('browse.sortType', 'Type')}</option>
        </select>
        <button type="button" class="browse-btn" id="browse-order"></button>
        <span class="browse-sep"></span>
        <button type="button" class="browse-btn" id="browse-mode-grid" data-mode="grid"></button>
        <button type="button" class="browse-btn" id="browse-mode-list" data-mode="list"></button>
        <button type="button" class="browse-btn" id="browse-mode-details" data-mode="details"></button>
        <input class="browse-size" id="browse-size" type="range" min="80" max="320" step="20">
      </div>
      <div class="browse-grid" id="browse-grid" tabindex="0"></div>`;

    _grid    = _root.querySelector('#browse-grid');
    _pathEl  = _root.querySelector('#browse-path');
    _countEl = _root.querySelector('#browse-count');

    const up = _root.querySelector('#browse-up');
    up.innerHTML = Icons.arrowUp || Icons.chevronUp || '';
    up.title = _t('fd.up', 'Up');
    up.addEventListener('click', () => goUp());

    _root.querySelector('#browse-mode-grid').innerHTML = Icons.viewGrid || '';
    _root.querySelector('#browse-mode-list').innerHTML = Icons.viewList || '';
    _root.querySelector('#browse-mode-details').innerHTML = Icons.viewDetails || '';
    _root.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.title = _t(`browse.mode.${btn.dataset.mode}`, btn.dataset.mode);
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    const sort = _root.querySelector('#browse-sort');
    sort.value = _view.sort;
    sort.title = _t('browse.sort', 'Sort by');
    sort.addEventListener('change', () => { _view.sort = sort.value; _saveView(); _render(); });

    const order = _root.querySelector('#browse-order');
    order.addEventListener('click', () => { _view.desc = !_view.desc; _saveView(); _syncChrome(); _render(); });

    const size = _root.querySelector('#browse-size');
    size.value = String(_view.size);
    size.title = _t('browse.size', 'Thumbnail size');
    size.addEventListener('input', () => {
      _view.size = Number(size.value) || 160;
      _applySizeVar();
      _saveView();
    });

    _grid.addEventListener('click', (e) => {
      const tile = e.target.closest?.('.browse-tile');
      if (!tile) { _select(''); return; }
      _select(tile.dataset.path);
    });
    _grid.addEventListener('dblclick', (e) => {
      const tile = e.target.closest?.('.browse-tile');
      if (!tile) return;
      _activate(tile.dataset.path, tile.dataset.dir === '1');
    });
    _grid.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const tile = e.target.closest?.('.browse-tile');
      if (!tile || !_onContextMenu) return;
      _select(tile.dataset.path);
      const entry = _entries.find((x) => _same(x.path, tile.dataset.path));
      if (entry) _onContextMenu(entry, e.clientX, e.clientY);
    });
    _grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && _selected) {
        const entry = _entries.find((x) => _same(x.path, _selected));
        if (entry) _activate(entry.path, entry.isDirectory);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        goUp();
      }
    });

    window.addEventListener('thumb-ready', (e) => {
      const p = e.detail?.path;
      const thumb = e.detail?.thumb;
      if (!p || !thumb || !_grid) return;
      const tile = [..._grid.querySelectorAll('.browse-tile')].find((el) => _same(el.dataset.path, p));
      if (tile) _paintThumb(tile, thumb);
    });
  }

  function _applySizeVar() {
    if (_root) _root.style.setProperty('--browse-tile', `${_view.size}px`);
  }

  function _syncChrome() {
    if (!_root) return;
    _root.dataset.mode = _view.mode;
    _root.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === _view.mode);
    });
    const order = _root.querySelector('#browse-order');
    if (order) {
      order.innerHTML = _view.desc ? (Icons.sortDesc || '') : (Icons.sortAsc || '');
      order.title = _t(_view.desc ? 'browse.orderDesc' : 'browse.orderAsc', 'Sort order');
    }
    const size = _root.querySelector('#browse-size');
    if (size) size.style.display = _view.mode === 'grid' ? '' : 'none';
    _applySizeVar();
  }

  function init(container, { onOpenFile, onOpenDir, onContextMenu } = {}) {
    _root = container;
    _onOpenFile = onOpenFile || null;
    _onOpenDir = onOpenDir || null;
    _onContextMenu = onContextMenu || null;
    if (_bound) return;
    _bound = true;
    _loadView();
    _buildChrome();
    _syncChrome();
  }

  function setMode(mode) {
    if (!['grid', 'list', 'details'].includes(mode)) return;
    _view.mode = mode;
    _saveView();
    _syncChrome();
    _render();
  }

  function _select(path) {
    _selected = path || '';
    _grid?.querySelectorAll('.browse-tile').forEach((el) => {
      el.classList.toggle('selected', !!path && _same(el.dataset.path, path));
    });
  }

  function _activate(path, isDir) {
    if (!path) return;
    if (isDir) { open(path); if (_onOpenDir) _onOpenDir(path); return; }
    if (_onOpenFile) _onOpenFile(path);
  }

  async function goUp() {
    if (!_dir) return;
    try {
      const parent = await window.electronAPI.pathDirname(_dir);
      if (parent && !_same(parent, _dir)) {
        open(parent);
        if (_onOpenDir) _onOpenDir(parent);
      }
    } catch { /* at a drive root */ }
  }

  function _sorted(entries) {
    const dir = _view.desc ? -1 : 1;
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    const cmp = {
      name: byName,
      date: (a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0) || byName(a, b),
      size: (a, b) => (a.size || 0) - (b.size || 0) || byName(a, b),
      type: (a, b) => FormatSupport.getExtension(a.name).localeCompare(FormatSupport.getExtension(b.name)) || byName(a, b),
    }[_view.sort] || byName;

    const dirs = entries.filter((e) => e.isDirectory).sort((a, b) => byName(a, b) * dir);
    const files = entries.filter((e) => !e.isDirectory).sort((a, b) => cmp(a, b) * dir);
    return [...dirs, ...files];
  }

  function _paintThumb(tile, thumb) {
    const box = tile.querySelector('.browse-thumb');
    if (!box || !thumb?.url) return;
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = thumb.url;
    img.alt = '';
    img.draggable = false;
    box.appendChild(img);
    box.classList.add('has-thumb');
    const dim = tile.querySelector('.browse-dim');
    if (dim && thumb.w && thumb.h) dim.textContent = `${thumb.w} × ${thumb.h}`;
  }

  function _iconFor(entry) {
    if (entry.isDirectory) return Icons.folder;
    const ext = FormatSupport.getExtension(entry.name);
    const info = typeof Icons.forExtension === 'function' ? Icons.forExtension(ext) : null;
    return (info && info.html) || Icons.file;
  }

  function _tile(entry) {
    const tile = document.createElement('div');
    tile.className = `browse-tile${entry.isDirectory ? ' is-dir' : ' is-file'}`;
    tile.dataset.path = entry.path;
    tile.dataset.dir = entry.isDirectory ? '1' : '0';
    tile.title = entry.name;

    const box = document.createElement('div');
    box.className = 'browse-thumb';
    box.innerHTML = `<span class="browse-fallback">${_iconFor(entry)}</span>`;
    tile.appendChild(box);

    const name = document.createElement('div');
    name.className = 'browse-name';
    name.textContent = entry.name;
    tile.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'browse-meta';
    if (entry.isDirectory) {
      meta.innerHTML = `<span class="browse-kind">${_t('browse.folder', 'Folder')}</span>`;
    } else {
      const size = entry.size != null ? FormatSupport.formatFileSize(entry.size) : '';
      const date = entry.mtimeMs ? FormatSupport.formatDate(entry.mtimeMs) : '';
      meta.innerHTML =
        `<span class="browse-size-cell">${size}</span>` +
        `<span class="browse-dim"></span>` +
        `<span class="browse-date">${date}</span>`;
    }
    tile.appendChild(meta);

    const cached = !entry.isDirectory ? Thumbs.get(entry.path) : null;
    if (cached) _paintThumb(tile, cached);
    else if (!entry.isDirectory && Thumbs.canThumbnail(entry.path)) tile.dataset.needsThumb = '1';
    return tile;
  }

  function _observe() {
    _observer?.disconnect();
    if (!_grid || !('IntersectionObserver' in window)) {
      _grid?.querySelectorAll('[data-needs-thumb="1"]').forEach((tile) => {
        Thumbs.request(tile.dataset.path).then((thumb) => thumb && _paintThumb(tile, thumb));
      });
      return;
    }
    _observer = new IntersectionObserver((rows) => {
      for (const row of rows) {
        if (!row.isIntersecting) continue;
        const tile = row.target;
        _observer.unobserve(tile);
        delete tile.dataset.needsThumb;
        Thumbs.request(tile.dataset.path, { front: true })
          .then((thumb) => { if (thumb) _paintThumb(tile, thumb); });
      }
    }, { root: _grid, rootMargin: '300px' });
    _grid.querySelectorAll('[data-needs-thumb="1"]').forEach((tile) => _observer.observe(tile));
  }

  function _render() {
    if (!_grid) return;
    const rows = _sorted(_entries);
    _grid.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'browse-empty';
      empty.textContent = _t('tree.empty', 'Empty folder');
      _grid.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      for (const entry of rows) frag.appendChild(_tile(entry));
      _grid.appendChild(frag);
    }
    if (_countEl) {
      const files = rows.filter((e) => !e.isDirectory).length;
      const dirs = rows.length - files;
      _countEl.textContent = (_t('browse.count', '{d} folders · {f} files')
        .replace('{d}', String(dirs))
        .replace('{f}', String(files)));
    }
    _select(_selected);
    _observe();
  }

  /** Show `dirPath` in the grid. Also warms the thumbnail cache for it. */
  async function open(dirPath) {
    if (!dirPath || !_root) return;
    _dir = dirPath;
    _selected = '';
    if (_pathEl) {
      _pathEl.textContent = dirPath;
      _pathEl.title = dirPath;
    }
    let entries = [];
    try {
      const read = window.electronAPI.readDirectoryDetailed || window.electronAPI.readDirectory;
      const result = await read(dirPath);
      if (Array.isArray(result)) entries = result;
    } catch { /* unreadable */ }

    _entries = entries.filter((e) => e.isDirectory || FormatSupport.isSupportedFile(e.path));
    _render();
    Thumbs.prefetchDir(dirPath);
  }

  function refresh() { if (_dir) return open(_dir); }
  function getDir() { return _dir; }
  function isVisible() { return !!_root && !_root.hidden; }

  function show(dirPath) {
    if (!_root) return;
    _root.hidden = false;
    _syncChrome();
    if (dirPath && !_same(dirPath, _dir)) open(dirPath);
    else if (!_dir && dirPath) open(dirPath);
  }

  function hide() { if (_root) _root.hidden = true; }

  function applyI18n() {
    if (!_root) return;
    _buildChrome();
    _syncChrome();
    _render();
  }

  return { init, open, show, hide, refresh, goUp, setMode, getDir, isVisible, applyI18n };
})();
