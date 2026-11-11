/* Viewport layouts (1×1 … 3×3) — several open files side by side, as in RadiAnt / MicroDicom.
 *
 * The full-featured viewer (#viewport: tools, measurements, W/L, cine) always sits in the ACTIVE
 * cell. Every other cell shows one more open tab in a lightweight viewer of its own: pan with the
 * left button, zoom with Ctrl+wheel, scroll frames / the tab's series with the wheel. A click
 * makes a cell active (its tab becomes the current one).
 *   • synchronised scrolling: when the active slice moves, every parallel stack shows its
 *     nearest slice (by position along the normal; by relative index when there is no geometry)
 *   • reference lines: where the active slice plane cuts the other (non-parallel) images
 *
 *   Layout.init({ grid, viewport, app })   app: { tabs(), activeTabId(), activate(tab), activeGeometry(), t }
 *   Layout.set(rows, cols) · Layout.refresh() · Layout.onActiveChanged() · Layout.state
 *   Layout.planeLine(planeA, imageB) → [[x0, y0], [x1, y1]] | null   (pure, tested)
 */
window.Layout = (function () {
  const LAYOUTS = ['1x1', '1x2', '2x1', '2x2', '1x3', '2x3', '3x3'];
  const st = { rows: 1, cols: 1, cells: [], sync: true, refLines: true, activeIndex: 0 };
  let grid = null, mainViewport = null, app = null;

  /* ── geometry (pure) ── */
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  /** { position, orientation: [r(3), c(3)], spacing: [row, col], width, height } → normal etc. */
  function plane(g) {
    if (!g || !g.position || !g.orientation || g.orientation.length < 6) return null;
    const r = g.orientation.slice(0, 3), c = g.orientation.slice(3, 6);
    return { o: g.position, r, c, n: cross(r, c), sp: g.spacing || [1, 1], w: g.width, h: g.height };
  }
  /** The line where plane A cuts image B, in B's pixel coordinates, clipped to B — or null. */
  function planeLine(ga, gb) {
    const A = plane(ga), B = plane(gb);
    if (!A || !B) return null;
    if (Math.abs(dot(A.n, B.n)) > 0.98) return null;   // parallel: no line
    // world(x, y) = oB + x·colSp·r + y·rowSp·c ;  dot(world − oA, nA) = 0  →  a·x + b·y + d = 0
    const a = B.sp[1] * dot(B.r, A.n), b = B.sp[0] * dot(B.c, A.n), d = dot(sub(B.o, A.o), A.n);
    const W = B.w, H = B.h, pts = [];
    const add = (x, y) => { if (x >= -1e-6 && x <= W + 1e-6 && y >= -1e-6 && y <= H + 1e-6 && !pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 1e-6)) pts.push([x, y]); };
    if (Math.abs(b) > 1e-9) { add(0, -d / b); add(W, -(d + a * W) / b); }
    if (Math.abs(a) > 1e-9) { add(-d / a, 0); add(-(d + b * H) / a, H); }
    return pts.length >= 2 ? [pts[0], pts[1]] : null;
  }
  /** Signed distance of a slice from plane A along A's normal. */
  function along(ga, position) { const A = plane(ga); return A && position ? dot(sub(position, A.o), A.n) : null; }
  /** Index of the candidate nearest to the active plane (parallel ones only); null when none applies. */
  function nearestIndex(ga, candidates) {
    const A = plane(ga);
    if (!A) return null;
    let best = null, bestD = Infinity;
    candidates.forEach((g, i) => {
      const B = plane(g);
      if (!B || Math.abs(dot(A.n, B.n)) < 0.95) return;
      const dd = Math.abs(dot(sub(B.o, A.o), A.n));
      if (dd < bestD) { bestD = dd; best = i; }
    });
    return best;
  }

  /* ── cells ── */
  function geometryOf(img, frame) {
    if (!img || !img.frameInfo) return null;
    const fi = img.frameInfo(frame);
    return fi && fi.position && fi.orientation ? { position: fi.position, orientation: fi.orientation, spacing: fi.pixelSpacing || [1, 1], width: img.width, height: img.height, study: img.meta && img.meta.studyUid } : null;
  }

  function makeCell(i) {
    const el = document.createElement('div');
    el.className = 'view-cell';
    el.dataset.index = i;
    el.innerHTML = '<div class="cell-view" tabindex="-1"><canvas></canvas><canvas></canvas></div><div class="cell-label"></div><div class="cell-empty"></div>';
    const view = el.querySelector('.cell-view');
    const [canvas, overlay] = el.querySelectorAll('canvas');
    const cell = { el, view, canvas, overlay, tabId: 0, frame: 0, seriesIndex: -1, local: null, token: 0, viewer: null };
    cell.viewer = window.Viewer.create({
      viewport: view, canvas, overlay,
      on: (ev, p) => { if (ev === 'stack') scrollCell(cell, p.delta); },
      extraDraw: (c, h) => drawRefLine(cell, c, h),
    });
    cell.viewer.wheelMode = 'stack';
    // a left click (not a wheel) on another cell makes it the active one
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || st.cells[st.activeIndex] === cell) return;
      e.stopPropagation(); e.preventDefault();
      activate(cell);
    }, true);
    return cell;
  }

  function tabOf(cell) { return cell.tabId ? app.tabs().find((x) => x.id === cell.tabId) || null : null; }

  /** Rebuild the grid: the active cell holds #viewport, the others their own viewer. */
  function set(rows, cols) {
    rows = Math.max(1, Math.min(3, rows | 0)); cols = Math.max(1, Math.min(3, cols | 0));
    const n = rows * cols;
    const prev = st.cells;
    // keep what each surviving cell showed, give new cells the other open tabs
    const active = app.activeTabId();
    const used = new Set([active]);
    const assigned = [];
    for (let i = 0; i < n; i++) {
      const old = prev[i];
      if (old && old.tabId && !used.has(old.tabId) && app.tabs().some((x) => x.id === old.tabId)) { assigned[i] = old.tabId; used.add(old.tabId); }
    }
    for (const c of prev) { if (c.viewer) c.viewer.destroy(); releaseLocal(c); }
    st.rows = rows; st.cols = cols; st.activeIndex = Math.min(st.activeIndex, n - 1);
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
    document.body.classList.toggle('multi-view', n > 1);
    st.cells = [];
    for (let i = 0; i < n; i++) {
      if (i === st.activeIndex) {
        const el = document.createElement('div');
        el.className = 'view-cell active';
        el.dataset.index = i;
        el.append(mainViewport);
        st.cells.push({ el, main: true, tabId: active });
      } else {
        const c = makeCell(i);
        c.tabId = assigned[i] || 0;
        st.cells.push(c);
      }
    }
    // fill the empty cells with open tabs that are not shown yet
    const isPicture = (x) => !x.file || x.file.kind === 'dicom' || x.file.kind === 'image';
    const free = app.tabs().filter((x) => isPicture(x) && !st.cells.some((c) => c.tabId === x.id)).reverse();
    for (const c of st.cells) if (!c.main && !c.tabId && free.length) c.tabId = free.shift().id;
    st.cells.forEach((c) => grid.append(c.el));
    refresh();
    window.dispatchEvent(new Event('resize'));
  }

  function activate(cell) {
    const tab = tabOf(cell);
    const i = st.cells.indexOf(cell);
    if (i < 0) return;
    const previous = st.cells[st.activeIndex];
    const prevTab = app.activeTabId();
    // swap: the clicked slot becomes the active one, the old active slot shows the old tab
    st.activeIndex = i;
    releaseLocal(cell);
    set(st.rows, st.cols);
    const old = st.cells.find((c) => !c.main && c.el.dataset.index === previous.el.dataset.index);
    if (old) { old.tabId = prevTab; refreshCell(old); }
    if (tab) app.activate(tab); else st.cells[i].tabId = 0;
  }

  function releaseLocal(c) { if (c && c.local && c.local.image && c.local.image.release) c.local.image.release(); if (c) c.local = null; }

  /* ── drawing a passive cell ── */
  async function refreshCell(cell) {
    if (cell.main) return;
    const tab = tabOf(cell);
    const label = cell.el.querySelector('.cell-label');
    const empty = cell.el.querySelector('.cell-empty');
    const token = ++cell.token;
    if (!tab) { cell.viewer.setSource(null); label.textContent = ''; empty.textContent = app.t('layout.empty'); cell.el.classList.add('is-empty'); return; }
    cell.el.classList.remove('is-empty');
    empty.textContent = '';
    let img = null, name = tab.name;
    const f = tab.file;
    if (cell.local && cell.local.image) { img = cell.local.image; name = cell.local.name; }
    else if (f && f.kind === 'dicom') img = f.image;
    try {
      let rgba, width, height, spacing = null;
      if (img) {
        if (cell.frame >= img.frames) cell.frame = 0;
        const win = tab.snap && tab.snap.win;
        const o = { frame: cell.frame };
        if (win && win.custom && Number.isFinite(win.wc)) { o.wc = win.wc; o.ww = win.ww; }
        if (win) { o.invert = win.invert; o.colormap = win.colormap; }
        const r = await img.render(o);
        ({ rgba, width, height } = r);
        spacing = img.frameInfo(cell.frame).pixelSpacing;
      } else if (f && f.kind === 'image' && f.bitmapCanvas) {
        width = f.bitmapCanvas.width; height = f.bitmapCanvas.height;
        rgba = f.bitmapCanvas.getContext('2d').getImageData(0, 0, width, height).data;
      } else if (!f && tab.path && !cell.loading) {
        cell.loading = true;
        try {
          const image = await window.DicomDecoder.load(new Uint8Array(await window.Platform.readFile(tab.path)));
          releaseLocal(cell);
          cell.local = { path: tab.path, name: tab.name, image };
        } catch (err) { label.textContent = `${name} — ${err && err.message || err}`; return; } finally { cell.loading = false; }
        return refreshCell(cell);
      } else {
        cell.viewer.setSource(null);
        label.textContent = `${name} — ${app.t('layout.notLoaded')}`;
        return;
      }
      if (token !== cell.token) return;
      let c = cell.src;
      if (!c || c.width !== width || c.height !== height) { c = document.createElement('canvas'); c.width = width; c.height = height; cell.src = c; }
      const id = c.getContext('2d').createImageData(width, height); id.data.set(rgba); c.getContext('2d').putImageData(id, 0, 0);
      cell.viewer.setSource({ canvas: c, width, height, spacing, aspect: spacing ? spacing[0] / spacing[1] : 1 }, { keepView: true });
      const frames = img ? img.frames : 1;
      const series = tab.snap && tab.snap.series;
      label.textContent = [name, frames > 1 ? `${cell.frame + 1}/${frames}` : '', series && series.files.length > 1 ? `${(cell.seriesIndex >= 0 ? cell.seriesIndex : series.index) + 1}/${series.files.length}` : ''].filter(Boolean).join(' · ');
    } catch (err) {
      label.textContent = `${name} — ${err && err.message || err}`;
    }
  }

  /** Wheel in a passive cell: its frames, else the files of its tab's series. */
  async function scrollCell(cell, delta) {
    const tab = tabOf(cell);
    if (!tab) return;
    const img = cell.local ? cell.local.image : tab.file && tab.file.kind === 'dicom' ? tab.file.image : null;
    if (img && img.frames > 1) { cell.frame = Math.max(0, Math.min(img.frames - 1, cell.frame + delta)); await refreshCell(cell); return; }
    const series = tab.snap && tab.snap.series;
    if (!series || series.files.length < 2) return;
    const cur = cell.seriesIndex >= 0 ? cell.seriesIndex : series.index;
    await showSeriesFile(cell, Math.max(0, Math.min(series.files.length - 1, cur + delta)));
  }
  async function showSeriesFile(cell, i) {
    const tab = tabOf(cell);
    const series = tab.snap.series;
    if (i === cell.seriesIndex && cell.local) return;
    cell.seriesIndex = i;
    const p = series.files[i];
    const token = ++cell.token;
    const image = await window.DicomDecoder.load(new Uint8Array(await window.Platform.readFile(p)));
    if (token !== cell.token) { image.release(); return; }
    releaseLocal(cell);
    cell.local = { path: p, name: window.Platform.basename(p), image };
    cell.frame = 0;
    await refreshCell(cell);
  }

  function refresh() { for (const c of st.cells) if (!c.main) refreshCell(c); }

  /* ── sync + reference lines, after the active slice moved ── */
  let syncTimer = null;
  function onActiveChanged() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 40);
  }
  async function syncNow() {
    if (st.cells.length < 2) return;
    const ga = app.activeGeometry();
    for (const cell of st.cells) {
      if (cell.main) continue;
      const tab = tabOf(cell);
      if (!tab) continue;
      if (st.sync && ga) {
        const img = cell.local ? cell.local.image : tab.file && tab.file.kind === 'dicom' ? tab.file.image : null;
        if (img && img.frames > 1) {
          const k = nearestIndex(ga, Array.from({ length: img.frames }, (_, f) => geometryOf(img, f)));
          if (k != null && k !== cell.frame) { cell.frame = k; await refreshCell(cell); continue; }
        } else if (tab.snap && tab.snap.series && tab.snap.series.files.length > 1) {
          const items = tab.snap.series.items;
          if (items && items.some((x) => x.position)) {
            const k = nearestIndex(ga, items.map((x) => (x.position && x.orientation ? { position: x.position, orientation: x.orientation } : null)));
            if (k != null && k !== cell.seriesIndex) { await showSeriesFile(cell, k); continue; }
          }
        }
      }
      cell.viewer.redraw();
    }
  }
  function drawRefLine(cell, c, h) {
    if (!st.refLines || !h.source) return;
    const ga = app.activeGeometry();
    const tab = tabOf(cell);
    if (!ga || !tab) return;
    const img = cell.local ? cell.local.image : tab.file && tab.file.kind === 'dicom' ? tab.file.image : null;
    const gb = geometryOf(img, cell.frame);
    if (!gb || (ga.study && gb.study && ga.study !== gb.study)) return;
    const line = planeLine(ga, gb);
    if (!line) return;
    const p = h.imageToClient(line[0][0], line[0][1]), q = h.imageToClient(line[1][0], line[1][1]);
    c.strokeStyle = 'rgba(250, 204, 21, 0.95)'; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
  }

  function init(o) {
    grid = o.grid; mainViewport = o.viewport; app = o.app;
    st.sync = o.sync !== false; st.refLines = o.refLines !== false;
    set(1, 1);
  }

  return {
    LAYOUTS, init, set, refresh, activate, onActiveChanged, planeLine, nearestIndex, along, geometryOf, state: st,
    setSync(v) { st.sync = !!v; if (v) onActiveChanged(); },
    setRefLines(v) { st.refLines = !!v; for (const c of st.cells) if (!c.main && c.viewer) c.viewer.redraw(); },
    get count() { return st.cells.length; },
  };
})();
