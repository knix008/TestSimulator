/* Filmstrip — a row of the open file's folder siblings under the viewer.
   Layout, left to right: [parent folder] [‹ previous] [thumbnails …] [next ›].
   It is its own row of #viewer-area (not an overlay), so the viewer simply ends
   where the strip starts. The contact sheet (#browse-view) still covers both. */
window.Filmstrip = (() => {
  const ENABLED_KEY = 'filmstripV1';   // '0' = hidden by the user

  let _root    = null;   // #filmstrip
  let _strip   = null;   // the scrolling thumbnail row
  let _upBtn   = null;
  let _prevBtn = null;
  let _nextBtn = null;
  let _list    = [];     // paths shown, in the app's prev/next order
  let _listKey = '';
  let _index   = -1;
  let _enabled = true;
  let _observer = null;
  let _cb = {};          // { onOpen(path), onPrev(), onNext(), onUp() }

  const _t = (key, fallback) => {
    const v = window.I18n && I18n.t(key);
    return (v && v !== key) ? v : (fallback || key);
  };
  const _norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const _base = (p) => String(p || '').split(/[\\/]/).pop() || String(p || '');

  /** Folder with an up arrow — "go to the parent folder". */
  const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 2.6 4.2 4.2-1.4 1.4-1.8-1.8V17h-2v-4.6l-1.8 1.8-1.4-1.4L12 8.6z"/></svg>';

  /** Folder of a file path, or '' — only to tell whether there is a parent to go to. */
  function _dirOf(p) {
    const s = String(p || '');
    const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
    return i < 0 ? '' : s.slice(0, i);
  }

  /** A drive root (C:\ / C:) or the posix root has no parent. */
  function _isRoot(dir) {
    return !dir || /^[A-Za-z]:[\\/]?$/.test(dir) || /^[\\/]*$/.test(dir);
  }

  function _build() {
    _root.innerHTML = `
      <button type="button" class="filmstrip-up" id="filmstrip-up"></button>
      <button type="button" class="filmstrip-nav" id="filmstrip-prev"></button>
      <div class="filmstrip-strip" id="filmstrip-strip"></div>
      <button type="button" class="filmstrip-nav" id="filmstrip-next"></button>`;
    _strip   = _root.querySelector('#filmstrip-strip');
    _upBtn   = _root.querySelector('#filmstrip-up');
    _prevBtn = _root.querySelector('#filmstrip-prev');
    _nextBtn = _root.querySelector('#filmstrip-next');

    _upBtn.innerHTML = `<span class="filmstrip-up-icon">${ICON_UP}</span>`
      + `<span class="filmstrip-up-name">${_t('filmstrip.parent', 'Parent folder')}</span>`;
    _prevBtn.innerHTML = Icons.chevronLeft || '&lt;';
    _nextBtn.innerHTML = Icons.chevronRight || '&gt;';
    _applyTitles();

    // Buttons must not take focus / start a viewer drag
    for (const btn of [_upBtn, _prevBtn, _nextBtn]) {
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    }
    _upBtn.addEventListener('click', () => { if (!_upBtn.disabled) _cb.onUp?.(); });
    _prevBtn.addEventListener('click', () => { if (!_prevBtn.disabled) _cb.onPrev?.(); });
    _nextBtn.addEventListener('click', () => { if (!_nextBtn.disabled) _cb.onNext?.(); });

    _strip.addEventListener('mousedown', (e) => e.preventDefault());   // keep keyboard focus where it was
    _strip.addEventListener('click', (e) => {
      const tile = e.target.closest?.('.filmstrip-tile');
      if (!tile) return;
      const i = Number(tile.dataset.index);
      if (i === _index) return;
      const p = _list[i];
      if (p) _cb.onOpen?.(p, i);
    });
    // A plain mouse wheel scrolls the row sideways
    _strip.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) return;
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!d) return;
      e.preventDefault();
      _strip.scrollLeft += d;
    }, { passive: false });
  }

  function _applyTitles() {
    if (!_upBtn) return;
    _upBtn.title = _t('filmstrip.parentTip', 'Go to the parent folder');
    _prevBtn.title = _t('toolbar.prev', 'Previous image');
    _nextBtn.title = _t('toolbar.next', 'Next image');
    _prevBtn.setAttribute('aria-label', _prevBtn.title);
    _nextBtn.setAttribute('aria-label', _nextBtn.title);
    _upBtn.setAttribute('aria-label', _upBtn.title);
    const name = _upBtn.querySelector('.filmstrip-up-name');
    if (name) name.textContent = _t('filmstrip.parent', 'Parent folder');
  }

  function _iconFor(p) {
    const ext = window.FormatSupport ? FormatSupport.getExtension(p) : '';
    const info = typeof Icons.forExtension === 'function' ? Icons.forExtension(ext) : null;
    return (info && info.html) || Icons.file || '';
  }

  function _paintThumb(tile, thumb) {
    const box = tile.querySelector('.filmstrip-thumb');
    if (!box || !thumb?.url) return;
    const img = document.createElement('img');
    img.src = thumb.url;
    img.alt = '';
    img.draggable = false;
    box.replaceChildren(img);
    box.classList.add('has-thumb');
  }

  function _tile(p, i) {
    const tile = document.createElement('div');
    tile.className = 'filmstrip-tile';
    tile.dataset.index = String(i);
    tile.dataset.path = p;
    tile.title = _base(p);
    const box = document.createElement('div');
    box.className = 'filmstrip-thumb';
    box.innerHTML = `<span class="filmstrip-fallback">${_iconFor(p)}</span>`;
    const name = document.createElement('div');
    name.className = 'filmstrip-name';
    name.textContent = _base(p);
    tile.append(box, name);
    const cached = window.Thumbs ? Thumbs.get(p) : null;
    if (cached) _paintThumb(tile, cached);
    else if (window.Thumbs && Thumbs.canThumbnail(p)) tile.dataset.needsThumb = '1';
    return tile;
  }

  /** Thumbnails are asked for only as tiles scroll near the visible part of the row. */
  function _observe() {
    _observer?.disconnect();
    const pending = _strip.querySelectorAll('[data-needs-thumb="1"]');
    if (!pending.length || !window.Thumbs) return;
    const load = (tile) => {
      delete tile.dataset.needsThumb;
      Thumbs.request(tile.dataset.path, { front: true })
        .then((thumb) => { if (thumb) _paintThumb(tile, thumb); })
        .catch(() => { /* no thumbnail for this one */ });
    };
    if (!('IntersectionObserver' in window)) { pending.forEach(load); return; }
    _observer = new IntersectionObserver((rows) => {
      for (const row of rows) {
        if (!row.isIntersecting) continue;
        _observer.unobserve(row.target);
        load(row.target);
      }
    }, { root: _strip, rootMargin: '0px 400px' });
    pending.forEach((tile) => _observer.observe(tile));
  }

  function _render() {
    _observer?.disconnect();
    const frag = document.createDocumentFragment();
    _list.forEach((p, i) => frag.appendChild(_tile(p, i)));
    _strip.replaceChildren(frag);
    _observe();
  }

  function _paintActive({ smooth = true } = {}) {
    _strip.querySelectorAll('.filmstrip-tile.active').forEach((el) => el.classList.remove('active'));
    const tile = _strip.querySelector(`.filmstrip-tile[data-index="${_index}"]`);
    if (tile) {
      tile.classList.add('active');
      // Scroll the row only — scrollIntoView would also shift overflow:hidden ancestors.
      // A tile already fully in view stays put, so the strip never slides under the mouse.
      const s = _strip.getBoundingClientRect(), r = tile.getBoundingClientRect();
      if (r.left < s.left || r.right > s.right) {
        const left = _strip.scrollLeft + (r.left - s.left) - (s.width - r.width) / 2;
        _strip.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
      }
    }
    _prevBtn.disabled = _index <= 0;
    _nextBtn.disabled = _index < 0 || _index >= _list.length - 1;
    _upBtn.disabled = _isRoot(_dirOf(_list[_index] || _list[0]));
  }

  function _setShown(on) {
    if (!_root) return;
    const show = !!on && _enabled;
    if (_root.hidden === !show) return;
    _root.hidden = !show;
  }

  function init(host, callbacks = {}) {
    _cb = callbacks || {};
    if (_root || !host) return;
    _root = host;
    try { _enabled = localStorage.getItem(ENABLED_KEY) !== '0'; } catch { _enabled = true; }
    _build();
    window.addEventListener('thumb-ready', (e) => {
      const p = e.detail?.path;
      const thumb = e.detail?.thumb;
      if (!p || !thumb || !_strip || _root.hidden) return;
      const key = _norm(p);
      const tile = [..._strip.querySelectorAll('.filmstrip-tile')].find((el) => _norm(el.dataset.path) === key);
      if (tile) _paintThumb(tile, thumb);
    });
  }

  /**
   * Show `list` with `index` as the open file. The row is rebuilt only when the list
   * itself changed; moving to a neighbour just moves the highlight.
   */
  function update(list, index) {
    if (!_root) return;
    const files = Array.isArray(list) ? list : [];
    if (!files.length || index < 0) { _setShown(false); return; }
    const key = files.join('\n');
    const wasHidden = _root.hidden;
    _setShown(true);
    if (!_enabled) {
      // Keep the data current so turning the strip back on shows the right row.
      _list = files.slice(); _index = index; _listKey = '';
      return;
    }
    if (key !== _listKey) {
      _list = files.slice();
      _listKey = key;
      _index = index;
      _render();
      _paintActive({ smooth: false });
      return;
    }
    _index = index;
    _paintActive({ smooth: !wasHidden });
  }

  function hide() { _setShown(false); }
  function isShown() { return !!_root && !_root.hidden; }
  function isEnabled() { return _enabled; }

  function setEnabled(on) {
    _enabled = !!on;
    try { localStorage.setItem(ENABLED_KEY, _enabled ? '1' : '0'); } catch { /* ignore */ }
    if (!_enabled) _setShown(false);
  }

  function applyI18n() { _applyTitles(); }

  return { init, update, hide, isShown, isEnabled, setEnabled, applyI18n };
})();
