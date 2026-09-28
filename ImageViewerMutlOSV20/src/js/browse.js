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
  let _onSelect     = null;    // callback(filePath|'') — selection, not opening
  let _onVisibility = null;
  let _bound       = false;

  const _view = { mode: 'grid', size: 160, sort: 'name', desc: false };

  /* Thumbnail size ladder — the toolbar steps through it, smallest to largest. */
  const SIZES = [64, 80, 96, 120, 160, 200, 240, 300, 380];
  const DEFAULT_SIZE = 160;
  const MIN_SIZE = SIZES[0];
  const MAX_SIZE = SIZES[SIZES.length - 1];

  /** Row thumbnail for list / details, derived from the one size the user sets. */
  const _rowSize = (size) => Math.round(Math.max(20, Math.min(72, size / 4)));

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
      if (saved.size >= MIN_SIZE && saved.size <= MAX_SIZE) _view.size = saved.size;
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
        <span class="browse-sep"></span>
        <div class="browse-zoom">
          <button type="button" class="browse-btn" id="browse-size-dec"></button>
          <button type="button" class="browse-size-val" id="browse-size-val"></button>
          <button type="button" class="browse-btn" id="browse-size-inc"></button>
        </div>
      </div>
      <div class="browse-head" id="browse-head">
        <span class="browse-head-thumb"></span>
        <span class="browse-name browse-col" data-col="name">${_t('browse.colName', 'Name')}</span>
        <span class="browse-meta">
          <span class="browse-type browse-col" data-col="type">${_t('browse.colType', 'Type')}</span>
          <span class="browse-size-cell browse-col" data-col="size">${_t('browse.colSize', 'Size')}</span>
          <span class="browse-dim browse-col">${_t('browse.colDim', 'Dimensions')}</span>
          <span class="browse-date browse-col" data-col="date">${_t('browse.colModified', 'Date modified')}</span>
          <span class="browse-created browse-col">${_t('browse.colCreated', 'Date created')}</span>
        </span>
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

    const dec = _root.querySelector('#browse-size-dec');
    dec.innerHTML = Icons.zoomOut || '';
    dec.title = _t('browse.sizeDec', 'Smaller');
    dec.addEventListener('click', () => _stepSize(-1));

    const inc = _root.querySelector('#browse-size-inc');
    inc.innerHTML = Icons.zoomIn || '';
    inc.title = _t('browse.sizeInc', 'Larger');
    inc.addEventListener('click', () => _stepSize(1));

    const val = _root.querySelector('#browse-size-val');
    val.title = _t('browse.sizeReset', 'Reset to default size');
    val.addEventListener('click', () => setSize(DEFAULT_SIZE));

    _root.querySelector('#browse-head').addEventListener('click', (e) => {
      const col = e.target.closest?.('.browse-col[data-col]');
      if (!col) return;
      const key = col.dataset.col;
      if (_view.sort === key) _view.desc = !_view.desc;
      else { _view.sort = key; _view.desc = false; }
      const sel = _root.querySelector('#browse-sort');
      if (sel) sel.value = _view.sort;
      _saveView();
      _syncChrome();
      _render();
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
    _grid.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      _stepSize(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    _grid.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        _stepSize(1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        _stepSize(-1);
        return;
      }
      if (e.key === 'Enter' && _selected) {
        const entry = _entries.find((x) => _same(x.path, _selected));
        if (entry) _activate(entry.path, entry.isDirectory);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        goUp();
      }
    });

  }

  /** Window-level, so rebuilding the chrome (language switch) cannot stack copies. */
  function _bindThumbReady() {
    window.addEventListener('thumb-ready', (e) => {
      const p = e.detail?.path;
      const thumb = e.detail?.thumb;
      if (!p || !thumb || !_grid) return;
      const tile = [..._grid.querySelectorAll('.browse-tile')].find((el) => _same(el.dataset.path, p));
      if (tile) _paintThumb(tile, thumb);
    });
  }

  function _applySizeVar() {
    if (!_root) return;
    _root.style.setProperty('--browse-tile', `${_view.size}px`);
    _root.style.setProperty('--browse-row', `${_rowSize(_view.size)}px`);
  }

  /** Nearest ladder step in `dir` (-1 smaller, +1 larger). */
  function _stepSize(dir) {
    const next = dir > 0
      ? SIZES.find((s) => s > _view.size)
      : [...SIZES].reverse().find((s) => s < _view.size);
    setSize(next == null ? (dir > 0 ? MAX_SIZE : MIN_SIZE) : next);
  }

  function setSize(px) {
    const next = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(Number(px) || DEFAULT_SIZE)));
    if (next === _view.size) return;
    _view.size = next;
    _applySizeVar();
    _saveView();
    _syncSizeChrome();
  }

  function _syncSizeChrome() {
    if (!_root) return;
    const val = _root.querySelector('#browse-size-val');
    if (val) val.textContent = `${_view.size}`;
    const dec = _root.querySelector('#browse-size-dec');
    const inc = _root.querySelector('#browse-size-inc');
    if (dec) dec.disabled = _view.size <= MIN_SIZE;
    if (inc) inc.disabled = _view.size >= MAX_SIZE;
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
    _root.querySelectorAll('#browse-head .browse-col').forEach((col) => {
      const on = !!col.dataset.col && col.dataset.col === _view.sort;
      col.classList.toggle('sorted', on);
      col.dataset.dir = on ? (_view.desc ? 'desc' : 'asc') : '';
    });
    _syncSizeChrome();
    _applySizeVar();
  }

  function init(container, { onOpenFile, onOpenDir, onContextMenu, onSelect, onVisibility } = {}) {
    _root = container;
    _onOpenFile = onOpenFile || null;
    _onOpenDir = onOpenDir || null;
    _onContextMenu = onContextMenu || null;
    _onSelect = onSelect || null;
    _onVisibility = onVisibility || null;
    if (_bound) return;
    _bound = true;
    _loadView();
    _buildChrome();
    _bindThumbReady();
    _syncChrome();
  }

  function setMode(mode) {
    if (!['grid', 'list', 'details'].includes(mode)) return;
    _view.mode = mode;
    _saveView();
    _syncChrome();
    _render();
  }

  /** `notify: false` for redraws — only a real click should move the info panel. */
  function _select(path, { notify = true } = {}) {
    _selected = path || '';
    _grid?.querySelectorAll('.browse-tile').forEach((el) => {
      el.classList.toggle('selected', !!path && _same(el.dataset.path, path));
    });
    if (!notify || !_onSelect) return;
    const entry = path ? _entries.find((x) => _same(x.path, path)) : null;
    _onSelect(entry && !entry.isDirectory ? entry.path : '');
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

  /** "Folder" / "JPG File" — the Type column in details mode. */
  function _typeLabel(entry) {
    if (entry.isDirectory) return _t('browse.folder', 'Folder');
    const ext = FormatSupport.getExtension(entry.name);
    if (!ext) return _t('browse.fileNoExt', 'File');
    return _t('browse.fileType', '{ext} File').replace('{ext}', ext.toUpperCase());
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
    const cell = (cls, text) => {
      const el = document.createElement('span');
      el.className = cls;
      el.textContent = text || '';
      if (text) el.title = text;
      return el;
    };
    const modified = entry.mtimeMs ? FormatSupport.formatDate(entry.mtimeMs) : '';
    const created = entry.birthtimeMs ? FormatSupport.formatDate(entry.birthtimeMs) : '';
    meta.append(
      cell('browse-type', _typeLabel(entry)),
      cell('browse-size-cell', entry.isDirectory || entry.size == null
        ? '' : FormatSupport.formatFileSize(entry.size)),
      cell('browse-dim', ''),
      cell('browse-date', modified),
      cell('browse-created', created),
    );
    tile.appendChild(meta);
    tile.title = [entry.name, _typeLabel(entry), modified].filter(Boolean).join('\n');

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
    _select(_selected, { notify: false });
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

  /** Let the app know the contact sheet appeared / disappeared, so chrome can follow. */
  function _notifyVisibility(was) {
    if (_onVisibility && was !== isVisible()) _onVisibility(isVisible());
  }

  function show(dirPath) {
    if (!_root) return;
    const was = isVisible();
    _root.hidden = false;
    _syncChrome();
    _notifyVisibility(was);
    if (dirPath && !_same(dirPath, _dir)) open(dirPath);
    else if (!_dir && dirPath) open(dirPath);
  }

  function hide() {
    if (!_root) return;
    const was = isVisible();
    _root.hidden = true;
    _notifyVisibility(was);
  }

  function applyI18n() {
    if (!_root) return;
    _buildChrome();          // labels are baked in, so the bar has to be rebuilt
    if (_pathEl && _dir) {
      _pathEl.textContent = _dir;
      _pathEl.title = _dir;
    }
    _syncChrome();
    _render();
  }

  return {
    init, open, show, hide, refresh, goUp, setMode, setSize,
    stepSize: _stepSize, getDir, isVisible, applyI18n,
  };
})();
