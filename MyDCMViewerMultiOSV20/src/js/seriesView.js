/* Related images on one screen: list, details, or a tile grid with a resizable tile.
 *
 * RadiAnt splits a series across panels; MicroDicom's browser and OHIF's study
 * browser show the same study as a list or as thumbnails. This view does that for
 * the open series (or for the frames of a single multi-frame file).
 *
 *   SeriesView.init({ t, items, active, open, tile, onTile, onContext })
 *   SeriesView.setMode('single'|'list'|'detail'|'tile')
 *   SeriesView.setTile(px) · SeriesView.refresh() · SeriesView.mark(index) · SeriesView.mode()
 *   SeriesView.selectedItems() · SeriesView.selectAll()
 *
 * A click shows that image. Ctrl or Shift adds to the selection, and a right-click
 * opens the browse menu (group the selection into one series, play it, open it).
 * A double-click leaves the grid and opens the image full size.
 * Thumbnails are decoded a few at a time, only for cells on screen, and cached small.
 */
window.SeriesView = (function () {
  const MODES = ['single', 'list', 'detail', 'tile'];
  let app = null, root = null, scroll = null, mode = 'single', tile = 144;
  let items = [], token = 0, observer = null, anchorKey = null;
  const selected = new Set();
  const thumbs = new Map();
  let queue = [], running = 0;
  const MAX_JOBS = 3, MAX_THUMBS = 240;

  function init(a) {
    app = a;
    root = document.getElementById('browseView');
    scroll = document.getElementById('browseScroll');
    if (!root || !scroll) return;
    tile = Math.max(72, Math.min(360, +app.tile() || 144));
    const range = document.getElementById('tileSize');
    const label = document.getElementById('tileSizeLabel');
    if (range) {
      range.value = String(tile);
      range.addEventListener('input', () => setTile(+range.value));
    }
    if (label) label.textContent = String(tile);
    if (scroll) scroll.style.setProperty('--tile', `${tile}px`);
    scroll.tabIndex = 0;
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) enqueue(e.target);
    }, { root: scroll, rootMargin: '240px' });
    scroll.addEventListener('mousedown', (e) => {
      if (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey) && e.target.closest('.browse-cell')) e.preventDefault();
    });
    scroll.addEventListener('click', (e) => {
      const cell = e.target.closest('.browse-cell');
      if (!cell || cell.dataset.index == null) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) { selected.clear(); paintSelection(); }
        return;
      }
      const i = +cell.dataset.index;
      const item = items[i];
      if (!item) return;
      const key = itemKey(item);
      if (e.shiftKey && anchorKey != null) {
        const anchor = items.findIndex((it) => itemKey(it) === anchorKey);
        const from = anchor < 0 ? i : anchor;
        if (!e.ctrlKey && !e.metaKey) selected.clear();
        for (let k = Math.min(from, i); k <= Math.max(from, i); k++) selected.add(itemKey(items[k]));
        paintSelection();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (selected.has(key)) selected.delete(key); else selected.add(key);
        anchorKey = key;
        paintSelection();
        return;
      }
      selected.clear();
      selected.add(key);
      anchorKey = key;
      paintSelection();
      app.open(item, { single: false });
    });
    scroll.addEventListener('dblclick', (e) => {
      const cell = e.target.closest('.browse-cell');
      if (!cell || cell.dataset.index == null) return;
      const item = items[+cell.dataset.index];
      if (item) app.open(item, { single: true });
    });
    scroll.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cell = e.target.closest('.browse-cell');
      let hit = null;
      if (cell && cell.dataset.index != null) {
        hit = items[+cell.dataset.index] || null;
        if (hit) {
          const key = itemKey(hit);
          if (!selected.has(key)) {
            selected.clear();
            selected.add(key);
            anchorKey = key;
            paintSelection();
          }
        }
      }
      if (app.onContext) app.onContext(e, selectedItems(), hit);
    });
    scroll.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        e.stopPropagation();
        selectAll();
      } else if (e.key === 'Escape' && selected.size) {
        e.preventDefault();
        e.stopPropagation();
        selected.clear();
        paintSelection();
      }
    });
  }

  function itemKey(item) { return `${item.path || ''}\0${item.frame || 0}`; }

  function selectedItems() { return items.filter((it) => selected.has(itemKey(it))); }

  function selectAll() {
    items.forEach((it) => selected.add(itemKey(it)));
    paintSelection();
  }

  function clearSelection() {
    selected.clear();
    anchorKey = null;
    paintSelection();
  }

  function pruneSelection() {
    const live = new Set(items.map(itemKey));
    for (const key of selected) if (!live.has(key)) selected.delete(key);
    if (anchorKey && !live.has(anchorKey)) anchorKey = null;
  }

  function paintSelection() {
    if (!scroll) return;
    scroll.querySelectorAll('.browse-cell').forEach((cell) => {
      const item = items[+cell.dataset.index];
      cell.classList.toggle('selected', !!(item && selected.has(itemKey(item))));
    });
    const hint = scroll.querySelector('.browse-hint');
    if (hint && app) {
      hint.textContent = selected.size > 1
        ? app.t('browse.hintSelected', { n: items.length, s: selected.size })
        : app.t('browse.hint', { n: items.length });
    }
  }

  function modeOf() { return mode; }

  function setMode(next) {
    mode = MODES.includes(next) ? next : 'single';
    document.body.classList.toggle('browse-open', mode !== 'single');
    document.body.classList.toggle('browse-tiles', mode === 'tile');
    if (root) root.hidden = mode === 'single';
    if (mode !== 'single') paint();
  }

  function setTile(px) {
    tile = Math.max(72, Math.min(360, Math.round(+px || 144)));
    const range = document.getElementById('tileSize');
    const label = document.getElementById('tileSizeLabel');
    if (range && +range.value !== tile) range.value = String(tile);
    if (label) label.textContent = String(tile);
    if (scroll) scroll.style.setProperty('--tile', `${tile}px`);
    if (app && app.onTile) app.onTile(tile);
  }

  function refresh() {
    if (!scroll || mode === 'single') return;
    paint();
  }

  function paint() {
    if (!scroll) return;
    token++;
    queue = [];
    if (observer) observer.disconnect();
    items = app.items() || [];
    pruneSelection();
    scroll.style.setProperty('--tile', `${tile}px`);
    scroll.className = `browse-scroll browse-${mode}`;
    scroll.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'browse-empty';
      empty.textContent = app.t('browse.empty');
      scroll.append(empty);
      return;
    }
    const hint = document.createElement('div');
    hint.className = 'browse-hint';
    hint.textContent = selected.size > 1
      ? app.t('browse.hintSelected', { n: items.length, s: selected.size })
      : app.t('browse.hint', { n: items.length });
    scroll.append(hint);
    const grid = document.createElement('div');
    grid.className = 'browse-grid';
    const active = app.active();
    const frag = document.createDocumentFragment();
    items.forEach((item, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      const on = i === active;
      const picked = selected.has(itemKey(item));
      cell.className = `browse-cell${on ? ' active' : ''}${picked ? ' selected' : ''}`;
      cell.dataset.index = String(i);
      cell.title = item.name || item.title || '';
      if (mode === 'list') {
        cell.innerHTML = `<span class="browse-idx">${i + 1}</span><span class="browse-title"></span><span class="browse-sub"></span>`;
      } else {
        cell.innerHTML = `<canvas class="browse-thumb" width="4" height="4"></canvas><span class="browse-title"></span><span class="browse-sub"></span>`;
      }
      cell.querySelector('.browse-title').textContent = item.title || item.name || '';
      cell.querySelector('.browse-sub').textContent = item.sub || '';
      frag.append(cell);
    });
    grid.append(frag);
    scroll.append(grid);
    if (mode !== 'list' && observer) {
      grid.querySelectorAll('.browse-cell').forEach((cell) => observer.observe(cell));
    }
    const on = grid.querySelector('.browse-cell.active');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function mark(index) {
    if (!scroll || mode === 'single') return;
    const cells = scroll.querySelectorAll('.browse-cell');
    if (!cells.length) return;
    cells.forEach((c) => c.classList.toggle('active', +c.dataset.index === index));
    const on = scroll.querySelector('.browse-cell.active');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function enqueue(cell) {
    const canvas = cell.querySelector('canvas');
    if (!canvas || canvas.dataset.ready === '1') return;
    canvas.dataset.ready = '1';
    queue.push({ cell, canvas, generation: token });
    pump();
  }

  function pump() {
    while (running < MAX_JOBS && queue.length) {
      const job = queue.shift();
      if (job.generation !== token) continue;
      running++;
      drawThumb(job).finally(() => { running--; pump(); });
    }
  }

  async function drawThumb(job) {
    const item = items[+job.cell.dataset.index];
    if (!item || job.generation !== token) return;
    const key = `${item.path}#${item.frame || 0}`;
    let pic = thumbs.get(key);
    if (!pic) {
      try {
        const bytes = new Uint8Array(await window.Platform.readFile(item.path));
        if (job.generation !== token) return;
        const image = await window.DicomDecoder.load(bytes);
        try {
          const r = await image.render({ frame: item.frame || 0, resetWindow: true, maxEdge: 192, overlays: false });
          pic = document.createElement('canvas');
          pic.width = r.width; pic.height = r.height;
          const id = pic.getContext('2d').createImageData(r.width, r.height);
          id.data.set(r.rgba);
          pic.getContext('2d').putImageData(id, 0, 0);
        } finally { if (image.release) image.release(); }
        thumbs.set(key, pic);
        if (thumbs.size > MAX_THUMBS) thumbs.delete(thumbs.keys().next().value);
      } catch { return; }
    }
    if (job.generation !== token || !pic) return;
    const canvas = job.canvas;
    canvas.width = pic.width; canvas.height = pic.height;
    canvas.getContext('2d').drawImage(pic, 0, 0);
  }

  return { init, setMode, setTile, refresh, mark, mode: modeOf, selectedItems, selectAll, clearSelection };
})();
