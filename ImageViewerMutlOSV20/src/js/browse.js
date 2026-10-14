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
  let _selected    = '';       // focus: the item last clicked (Enter, info panel)
  const _sel       = new Set(); // every selected item, by _norm(path)
  let _anchor      = '';       // where a Shift+click range starts
  let _suppressClick = false;  // the click that ends a marquee drag is not a click
  let _observer    = null;
  let _onOpenFile  = null;
  let _onOpenDir   = null;
  let _onContextMenu = null;
  let _onSelect     = null;    // callback(filePath|'') — selection, not opening
  let _onVisibility = null;
  let _canDrag      = false;   // tiles can be dragged onto explorer folders (desktop only)
  // In-app drag payload: JSON array of paths. The explorer tree accepts it as a move.
  const DRAG_MIME   = 'application/x-imageviewer-paths';
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

  const _norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
  const _same = (a, b) => _norm(a) === _norm(b);

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

  /** Dragging the size slider would otherwise write the view on every pixel. */
  let _saveViewTimer = null;
  function _queueSaveView() {
    clearTimeout(_saveViewTimer);
    _saveViewTimer = setTimeout(_saveView, 200);
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
          <input type="range" class="browse-size-slider" id="browse-size-slider"
                 min="${MIN_SIZE}" max="${MAX_SIZE}" step="1" value="${_view.size}"
                 aria-label="${_t('browse.sizeSlider', 'Thumbnail size')}">
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

    // The slider is free of the ladder the -/+ buttons step through: any size in
    // between is fine, and resizing only touches a CSS variable, so dragging is
    // live without re-rendering a single tile.
    const slider = _root.querySelector('#browse-size-slider');
    slider.title = _t('browse.sizeSlider', 'Thumbnail size');
    slider.addEventListener('input', () => setSize(slider.value));
    slider.addEventListener('dblclick', () => setSize(DEFAULT_SIZE));
    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      _stepSize(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });

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

    // Explorer-style selection: click = one, Ctrl = toggle, Shift = range from the anchor
    _grid.addEventListener('click', (e) => {
      if (_suppressClick) { _suppressClick = false; return; }
      const tile = e.target.closest?.('.browse-tile');
      const add = e.ctrlKey || e.metaKey;
      if (!tile) { if (!add && !e.shiftKey) _select(''); return; }
      const p = tile.dataset.path;
      if (e.shiftKey) {
        _selectRange(_anchor || p, p, { add });
      } else if (add) {
        _toggle(p);
      } else {
        _select(p);
      }
    });
    _bindMarquee();
    // Dragging tiles: the whole selection goes (the pressed tile alone when it is
    // outside the selection). Chromium's own drag, not webContents.startDrag: on Windows
    // startDrag keeps the main process inside the OS drag loop after a drop on our own
    // window until the next click, which stalls the move it was meant to start.
    _grid.addEventListener('dragstart', (e) => {
      const tile = e.target.closest?.('.browse-tile');
      if (!tile || !_canDrag) { e.preventDefault(); return; }
      if (!_sel.has(_norm(tile.dataset.path))) _select(tile.dataset.path);
      const paths = getSelectedPaths();
      if (!paths.length) { e.preventDefault(); return; }
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(paths));
      e.dataTransfer.setData('text/plain', paths.join('\n'));
      e.dataTransfer.effectAllowed = 'copyMove';
      if (paths.length > 1) {
        // Ghost: the pressed tile's thumbnail with a count badge
        const ghost = document.createElement('div');
        ghost.className = 'browse-drag-ghost';
        const img = tile.querySelector('.browse-thumb img');
        if (img) ghost.appendChild(img.cloneNode());
        const badge = document.createElement('span');
        badge.textContent = String(paths.length);
        ghost.appendChild(badge);
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 24, 24);
        setTimeout(() => ghost.remove(), 0);
      }
      _grid.classList.add('is-dragging');
    });
    _grid.addEventListener('dragend', () => _grid.classList.remove('is-dragging'));
    _grid.addEventListener('dblclick', (e) => {
      const tile = e.target.closest?.('.browse-tile');
      if (!tile) return;
      _activate(tile.dataset.path, tile.dataset.dir === '1');
    });
    _grid.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const tile = e.target.closest?.('.browse-tile');
      if (!tile || !_onContextMenu) return;
      // Right-clicking inside the selection acts on all of it; outside, on that item alone
      if (!_sel.has(_norm(tile.dataset.path))) _select(tile.dataset.path);
      else _focusOn(tile.dataset.path);
      const entry = _entries.find((x) => _same(x.path, tile.dataset.path));
      if (entry) _onContextMenu(entry, e.clientX, e.clientY, getSelectedPaths());
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
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        e.stopPropagation();
        selectAll();
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
    _queueSaveView();
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
    const slider = _root.querySelector('#browse-size-slider');
    // Also when a button, Ctrl+wheel or a reset moved the size, not just a drag.
    if (slider && Number(slider.value) !== _view.size) slider.value = String(_view.size);
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

  function init(container, { onOpenFile, onOpenDir, onContextMenu, onSelect, onVisibility, canDrag = false } = {}) {
    _root = container;
    _canDrag = !!canDrag;
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

  /** Paint the selection set onto the tiles. */
  function _paintSelection() {
    _grid?.querySelectorAll('.browse-tile').forEach((el) => {
      const key = _norm(el.dataset.path);
      el.classList.toggle('selected', _sel.has(key));
      el.classList.toggle('focused', !!_selected && key === _norm(_selected));
    });
    _syncCount();
  }

  function _notify() {
    if (!_onSelect) return;
    const entry = _selected ? _entries.find((x) => _same(x.path, _selected)) : null;
    _onSelect(entry && !entry.isDirectory ? entry.path : '');
  }

  /**
   * Select just `path` (or nothing). `notify: false` for redraws — only a real
   * click should move the info panel.
   */
  function _select(path, { notify = true } = {}) {
    _sel.clear();
    if (path) _sel.add(_norm(path));
    _selected = path || '';
    _anchor = path || '';
    _paintSelection();
    if (notify) _notify();
  }

  function _focusOn(path) {
    _selected = path || '';
    _paintSelection();
    _notify();
  }

  function _toggle(path) {
    const key = _norm(path);
    if (_sel.has(key)) {
      _sel.delete(key);
      if (_same(_selected, path)) _selected = '';
    } else {
      _sel.add(key);
      _selected = path;
    }
    _anchor = path;
    _paintSelection();
    _notify();
  }

  /** Paths in the order they are shown — what a Shift range and the marquee walk over. */
  function _shownPaths() {
    return [...(_grid?.querySelectorAll('.browse-tile') || [])].map((el) => el.dataset.path);
  }

  function _selectRange(from, to, { add = false } = {}) {
    const shown = _shownPaths();
    let a = shown.findIndex((p) => _same(p, from));
    const b = shown.findIndex((p) => _same(p, to));
    if (b < 0) return;
    if (a < 0) a = b;
    if (!add) _sel.clear();
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) _sel.add(_norm(shown[i]));
    _selected = to;   // the anchor stays, so the next Shift+click re-ranges from it
    _paintSelection();
    _notify();
  }

  function selectAll() {
    const shown = _shownPaths();
    _sel.clear();
    for (const p of shown) _sel.add(_norm(p));
    if (!_selected && shown.length) _selected = shown[0];
    _paintSelection();
  }

  /** Every selected item, in display order, with its real (not normalised) path. */
  function getSelectedPaths() {
    return _entries.filter((e) => _sel.has(_norm(e.path))).map((e) => e.path);
  }

  /* ── Marquee: drag a box to select what it touches ── */
  function _bindMarquee() {
    let drag = null;   // { x0, y0 (content coords), base: Set, add, box, moved, lastEvt, raf }
    const toContent = (e) => {
      const r = _grid.getBoundingClientRect();
      return { x: e.clientX - r.left + _grid.scrollLeft, y: e.clientY - r.top + _grid.scrollTop };
    };
    const update = () => {
      if (!drag || !drag.lastEvt) return;
      const p = toContent(drag.lastEvt);
      const x1 = Math.min(drag.x0, p.x), y1 = Math.min(drag.y0, p.y);
      const x2 = Math.max(drag.x0, p.x), y2 = Math.max(drag.y0, p.y);
      Object.assign(drag.box.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
      _sel.clear();
      for (const k of drag.base) _sel.add(k);
      let last = '';
      for (const el of _grid.querySelectorAll('.browse-tile')) {
        const l = el.offsetLeft, t = el.offsetTop, r = l + el.offsetWidth, b = t + el.offsetHeight;
        if (r < x1 || l > x2 || b < y1 || t > y2) continue;
        const key = _norm(el.dataset.path);
        // Ctrl+drag flips what the box touches, like Explorer
        if (drag.add && drag.base.has(key)) _sel.delete(key);
        else _sel.add(key);
        last = el.dataset.path;
      }
      if (last) _selected = last;
      _paintSelection();
    };
    // Past the top / bottom edge, keep scrolling while the button is held
    const autoScroll = () => {
      if (!drag) return;
      const r = _grid.getBoundingClientRect();
      const y = drag.lastEvt?.clientY ?? 0;
      const step = y < r.top + 16 ? -Math.min(40, r.top + 16 - y) : y > r.bottom - 16 ? Math.min(40, y - (r.bottom - 16)) : 0;
      if (step) { _grid.scrollTop += step; update(); }
      drag.raf = requestAnimationFrame(autoScroll);
    };
    _grid.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest?.('.browse-head, input, button, select')) return;
      // Pressing on a draggable tile starts a file drag, not a box (like Explorer)
      if (e.target.closest?.('.browse-tile[draggable="true"]')) return;
      const p = toContent(e);
      const add = e.ctrlKey || e.metaKey;
      drag = { x0: p.x, y0: p.y, base: add ? new Set(_sel) : new Set(), add, box: null, moved: false, lastEvt: e, raf: 0, id: e.pointerId };
    });
    _grid.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.lastEvt = e;
      if (!drag.moved) {
        const p = toContent(e);
        if (Math.hypot(p.x - drag.x0, p.y - drag.y0) < 5) return;   // still a click
        drag.moved = true;
        _grid.setPointerCapture?.(e.pointerId);
        drag.box = document.createElement('div');
        drag.box.className = 'browse-marquee';
        _grid.appendChild(drag.box);
        drag.raf = requestAnimationFrame(autoScroll);
      }
      e.preventDefault();
      update();
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag;
      drag = null;
      cancelAnimationFrame(d.raf);
      if (!d.moved) return;
      d.box?.remove();
      _suppressClick = true;              // the click that follows mouseup is part of the drag
      setTimeout(() => { _suppressClick = false; }, 0);
      _anchor = _selected || _anchor;
      _notify();
    };
    _grid.addEventListener('pointerup', end);
    _grid.addEventListener('pointercancel', end);
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
    if (_canDrag) tile.draggable = true;

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
    // Keep only what still exists (a refresh after delete / move)
    const alive = new Set(rows.map((e) => _norm(e.path)));
    for (const k of [..._sel]) if (!alive.has(k)) _sel.delete(k);
    if (_selected && !alive.has(_norm(_selected))) _selected = '';
    _paintSelection();
    _observe();
  }

  function _syncCount() {
    if (!_countEl) return;
    const files = _entries.filter((e) => !e.isDirectory).length;
    const dirs = _entries.length - files;
    let text = _t('browse.count', '{d} folders · {f} files')
      .replace('{d}', String(dirs))
      .replace('{f}', String(files));
    if (_sel.size > 1) text += `  ·  ${_t('browse.selectedCount', '{n} selected').replace('{n}', String(_sel.size))}`;
    _countEl.textContent = text;
  }

  /** Show `dirPath` in the grid. Also warms the thumbnail cache for it. */
  async function open(dirPath, { keepSelection = false } = {}) {
    if (!dirPath || !_root) return;
    const sameDir = _same(dirPath, _dir);
    _dir = dirPath;
    if (!(keepSelection && sameDir)) {
      _selected = '';
      _anchor = '';
      _sel.clear();
    }
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

  /** Re-read the folder (files deleted / moved / added); the selection survives where it can. */
  function refresh() { if (_dir) return open(_dir, { keepSelection: true }); }
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
    stepSize: _stepSize, getDir, isVisible, applyI18n, getSelectedPaths, selectAll, DRAG_MIME,
  };
})();
