/* The dock renderer: owns layout, magnification, input and theming. */
(function () {
  'use strict';

  const api = window.dockApi;
  const { layout, peakSpread, approach } = window.DockMagnify;
  const Glyphs = window.DockGlyphs;

  const el = {
    body: document.body,
    stage: document.getElementById('stage'),
    plate: document.getElementById('plate'),
    items: document.getElementById('items'),
    tooltip: document.getElementById('tooltip'),
    themeCss: document.getElementById('theme-css'),
  };

  const state = {
    cfg: null,
    items: [],
    drawn: [],
    nodes: [],
    geom: null,
    cursor: null,       // pointer position along the dock axis, null at rest
    layout: null,
    intensity: 0,          // 0 at rest, 1 fully magnified
    targetIntensity: 0,
    raf: null,
    lastFrame: 0,
    hoverIndex: -1,
    dragIndex: -1,
    dropIndex: null,       // where a drag would land; parts the icons there
    running: new Set(),
    runningApps: [],
    trashEmpty: true,
    stage: null,
    lastRect: null,
  };

  const TOOLTIP_SPACE = 28;
  const STAGE_MARGIN = 24;
  // The gap at the two ends of the bar is fixed: the padding setting only ever
  // adjusts the thickness direction, so shrinking it cannot pull the end icons
  // against the edge of the background.
  const AXIS_PAD = 12;

  const isHorizontal = () => state.cfg.dock.position === 'bottom' || state.cfg.dock.position === 'top';

  /* --------------------------------------------------------------- *
   * Theme
   * --------------------------------------------------------------- */

  function applyTheme(theme) {
    const root = document.documentElement;
    // Drop anything the previous theme set before applying the new one.
    for (const name of Array.from(root.style)) {
      if (name.startsWith('--')) root.style.removeProperty(name);
    }
    if (!theme) { el.themeCss.textContent = ''; return; }
    for (const [key, value] of Object.entries(theme.variables || {})) {
      root.style.setProperty(key.startsWith('--') ? key : `--${key}`, String(value));
    }
    el.themeCss.textContent = theme.css || '';
  }

  /* --------------------------------------------------------------- *
   * DOM construction
   * --------------------------------------------------------------- */

  /**
   * What the dock actually draws: the pinned items, then - when the setting is
   * on - a separator and an icon for every running application that is not
   * already pinned. The transient ones are never written to the config.
   */
  function visibleItems() {
    const pinned = state.items;
    const list = (!state.cfg.dock.showRunningApps || !state.runningApps.length)
      ? pinned.slice()
      : [
        ...pinned,
        { id: 'running-sep', type: 'separator', label: '', path: '', transient: true },
        ...state.runningApps,
      ];

    // While something is being dragged over the dock, a blank item of icon
    // width is spliced in at the landing position. The surrounding icons part
    // around it, which shows where the drop will go without drawing anything
    // over the bar.
    if (state.dropIndex !== null) {
      const at = Math.max(0, Math.min(pinned.length, state.dropIndex));
      list.splice(at, 0, { id: 'drop-gap', type: 'gap', label: '', path: '', transient: true });
    }
    return list;
  }

  function render() {
    el.items.textContent = '';
    state.drawn = visibleItems();
    state.nodes = state.drawn.map((item, index) => {
      const node = document.createElement('div');
      node.className = 'dock-item'
        + (item.type === 'separator' ? ' separator' : '')
        + (item.type === 'gap' ? ' gap' : '');
      node.dataset.id = item.id;
      node.dataset.index = String(index);

      const inner = document.createElement('div');
      inner.className = 'icon-inner';

      if (item.type === 'gap') {
        // Deliberately empty: the space it occupies is the whole point.
      } else if (item.type === 'separator') {
        const line = document.createElement('div');
        line.className = 'sep-line';
        inner.appendChild(line);
      } else {
        const img = document.createElement('img');
        img.className = 'icon';
        img.src = iconFor(item);
        img.alt = item.label || '';
        img.draggable = false;
        img.addEventListener('error', () => { img.src = Glyphs.get('unknown'); }, { once: true });
        inner.appendChild(img);
      }

      const dot = document.createElement('div');
      dot.className = 'indicator';

      // Themes that draw a tile behind every icon paint this element; the
      // others leave it fully transparent.
      const tile = document.createElement('div');
      tile.className = 'tile';

      node.appendChild(tile);
      node.appendChild(inner);
      node.appendChild(dot);
      el.items.appendChild(node);
      return node;
    });

    relayout();
  }

  /* --------------------------------------------------------------- *
   * Geometry
   * --------------------------------------------------------------- */

  /** The Trash shows whether it is holding anything. */
  function iconFor(item) {
    if (item.path === 'system:trash' && !state.trashEmpty) return Glyphs.get('system:trash-full');
    return Glyphs.forItem(item);
  }

  function itemAxisSize(item, iconSize) {
    if (item.type === 'separator') return Math.max(8, Math.round(iconSize * 0.38));
    return iconSize;
  }

  function relayout() {
    const dock = state.cfg.dock;
    const iconSize = dock.iconSize;
    const gap = dock.spacing;
    const pad = dock.padding;
    const n = state.drawn.length;

    const sizes = state.drawn.map((it) => itemAxisSize(it, iconSize));
    const restLength = n ? sizes.reduce((a, b) => a + b, 0) + gap * (n - 1) : iconSize;

    // Reflections are only drawn for a horizontal dock, so a vertical one must
    // not reserve the space for them or its icons end up off-centre.
    const reflection = dock.showReflection && isHorizontal() ? Math.round(iconSize * 0.18) : 0;

    // Distance from the plate's outer edge to the icon. The reflection lives in
    // this gap, and the plate is made twice as deep so the space above an icon
    // matches the space below it on every edge of the screen.
    //
    // A non-zero plateThickness overrides that height; the icon stays centred
    // in it, so the gaps above and below remain equal.
    const autoCross = iconSize + (pad + reflection) * 2;
    const plateCross = dock.plateThickness > 0
      ? Math.max(iconSize + 4, Math.round(dock.plateThickness))
      : autoCross;
    const anchor = (plateCross - iconSize) / 2;

    const tooltipRoom = dock.showLabels ? TOOLTIP_SPACE : 6;
    const stageCross = Math.ceil(
      Math.max(plateCross, anchor + iconSize * dock.maxZoom) + tooltipRoom + 10,
    );

    // Reserve the magnification headroom in the bar itself, once, so the row
    // slides *inside* a bar whose size never changes: the window, the
    // background and the click region all stay put while the pointer moves.
    //
    // How much room each end needs is measured from this exact set of icons,
    // so a short dock gets short margins and a long one gets the full spread
    // instead of both being padded to the same worst case.
    const spread = peakSpread({
      sizes,
      unit: iconSize,
      gap,
      maxZoom: dock.maxZoom,
      zoomRange: dock.zoomRange,
      animation: dock.animation,
    });

    // The window is sized for the widest the bar can ever get, because resizing
    // an OS window mid-hover is what makes a dock feel unsteady. The window is
    // transparent, so the spare room simply is not visible.
    const stageAxis = Math.ceil(restLength + spread + AXIS_PAD * 2 + STAGE_MARGIN * 2);

    state.geom = {
      sizes, restLength, plateCross, stageAxis, stageCross,
      anchor, iconSize, gap, pad, spread, axisPad: AXIS_PAD,
    };

    const horizontal = isHorizontal();
    const width = horizontal ? stageAxis : stageCross;
    const height = horizontal ? stageCross : stageAxis;

    // Only the cross-axis side of the plate is settled here; its length and
    // position follow the hover and are set in renderFrame().
    const p = el.plate.style;
    if (horizontal) {
      p.top = dock.position === 'top' ? '0px' : '';
      p.bottom = dock.position === 'bottom' ? '0px' : '';
      p.right = '';
      p.height = `${plateCross}px`;
    } else {
      p.left = dock.position === 'left' ? '0px' : '';
      p.right = dock.position === 'right' ? '0px' : '';
      p.bottom = '';
      p.width = `${plateCross}px`;
    }

    // The background can be faded independently of the icons, so the plate
    // opacity multiplies the dock-wide one.
    el.plate.style.opacity = String(dock.opacity * dock.plateOpacity);
    el.items.style.opacity = String(Math.max(dock.opacity, 0.35));

    state.stage = { width, height };
    api.dock.reportSize(width, height);
    paint(true);
  }

  /**
   * The only region that should swallow clicks; everything else stays
   * see-through. The axis extent follows the magnified row so a zoomed icon
   * that has grown past the resting plate is still clickable, while the cross
   * extent is fixed at the tallest an icon can ever get.
   */
  function reportInteractiveRect(axisStart, axisLength) {
    const g = state.geom;
    const dock = state.cfg.dock;
    if (!g || !state.stage) return;

    const cross = Math.ceil(Math.max(g.plateCross, g.anchor + g.iconSize * dock.maxZoom));
    const horizontal = isHorizontal();

    const rect = horizontal
      ? {
        x: Math.round(axisStart),
        y: dock.position === 'top' ? 0 : state.stage.height - cross,
        width: Math.round(axisLength),
        height: cross,
      }
      : {
        x: dock.position === 'left' ? 0 : state.stage.width - cross,
        y: Math.round(axisStart),
        width: cross,
        height: Math.round(axisLength),
      };

    const last = state.lastRect;
    if (last && Math.abs(last.x - rect.x) < 3 && Math.abs(last.y - rect.y) < 3
      && Math.abs(last.width - rect.width) < 3 && Math.abs(last.height - rect.height) < 3) {
      return;
    }
    state.lastRect = rect;
    api.dock.setInteractiveRect(rect);
  }

  /* --------------------------------------------------------------- *
   * Painting
   * --------------------------------------------------------------- */

  /**
   * Paint one frame.
   *
   * Geometry is derived entirely from the pointer position and `intensity`,
   * so holding the pointer still produces the same layout every frame. The
   * previous approach eased each icon's scale and then re-derived the row's
   * anchor from those eased widths, which fed the animation back into its own
   * input and made the row visibly swim.
   */
  /**
   * The bar's length and position for a given hover intensity.
   *
   * At rest it is exactly the icons plus their end margins, so the row sits
   * centred in it. As the pointer arrives it grows into the magnification
   * headroom, staying centred the whole way. It depends on `intensity` and
   * nothing else, which is why travelling along the dock does not resize it.
   */
  function barMetrics(intensity) {
    const g = state.geom;
    const length = Math.ceil(g.restLength + g.spread * intensity + g.axisPad * 2);
    const start = Math.round((g.stageAxis - length) / 2);
    return { start, length, origin: start + g.axisPad };
  }

  function renderFrame() {
    const dock = state.cfg.dock;
    const g = state.geom;
    if (!g || !state.nodes.length) return;

    const amplitude = Math.max(0, dock.maxZoom - 1) * state.intensity;
    const active = state.intensity > 0.0015 && state.cursor !== null;
    const bar = barMetrics(state.intensity);

    const result = layout({
      sizes: g.sizes,
      unit: g.iconSize,
      gap: g.gap,
      origin: bar.origin,
      cursor: active ? state.cursor : null,
      maxZoom: 1 + amplitude,
      zoomRange: dock.zoomRange,
      animation: dock.animation,
      // Easing `spread` alongside the zoom keeps the row's length and the
      // pointer's effect in step, so nothing jumps as the dock wakes up.
      spread: g.spread * state.intensity,
    });

    state.layout = result;
    place(result, bar);
    positionTooltip();
  }

  /** Position the nodes and the plate from a computed layout. */
  function place(result, bar) {
    const g = state.geom;
    const dock = state.cfg.dock;
    const horizontal = isHorizontal();
    const n = state.drawn.length;

    for (let i = 0; i < n; i += 1) {
      const node = state.nodes[i];
      // Snap to whole pixels: a fractional position makes the browser resample
      // the icon every frame, which looks like shimmer even when the geometry
      // underneath is perfectly steady.
      const offset = Math.round(result.starts[i]);
      const axisSize = Math.round(result.widths[i]);
      const crossSize = Math.round(g.iconSize * result.scales[i]);
      const st = node.style;

      if (horizontal) {
        st.left = `${offset}px`;
        st.width = `${axisSize}px`;
        st.height = `${crossSize}px`;
        if (dock.position === 'bottom') {
          st.bottom = `${g.anchor}px`;
          st.top = '';
        } else {
          st.top = `${g.anchor}px`;
          st.bottom = '';
        }
        st.right = '';
      } else {
        st.top = `${offset}px`;
        st.height = `${axisSize}px`;
        st.width = `${crossSize}px`;
        if (dock.position === 'left') {
          st.left = `${g.anchor}px`;
          st.right = '';
        } else {
          st.right = `${g.anchor}px`;
          st.left = '';
        }
        st.bottom = '';
      }
    }

    const p = el.plate.style;
    if (horizontal) {
      p.left = `${bar.start}px`;
      p.width = `${bar.length}px`;
    } else {
      p.top = `${bar.start}px`;
      p.height = `${bar.length}px`;
    }

    reportInteractiveRect(bar.start, bar.length);
  }

  /**
   * @param {boolean} immediate skip the ease, e.g. after a relayout
   */
  function paint(immediate) {
    state.targetIntensity = state.cursor === null ? 0 : 1;
    if (immediate) state.intensity = state.targetIntensity;
    renderFrame();
    if (!immediate) ensureLoop();
  }

  function ensureLoop() {
    if (state.raf) return;
    state.lastFrame = performance.now();

    const step = (now) => {
      const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
      state.lastFrame = now;

      const next = approach(state.intensity, state.targetIntensity, dt, 26);
      const settled = Math.abs(next - state.targetIntensity) <= 0.0015;
      state.intensity = settled ? state.targetIntensity : next;

      renderFrame();

      if (settled) {
        state.raf = null;
        // Once fully at rest the pointer position no longer matters; dropping
        // it keeps the resting layout exactly on its origin.
        if (state.targetIntensity === 0) state.cursor = null;
      } else {
        state.raf = requestAnimationFrame(step);
      }
    };

    state.raf = requestAnimationFrame(step);
  }

  /* --------------------------------------------------------------- *
   * Tooltip
   * --------------------------------------------------------------- */

  function positionTooltip() {
    if (state.hoverIndex < 0 || !state.cfg.dock.showLabels) {
      el.tooltip.classList.remove('show');
      return;
    }
    const item = state.drawn[state.hoverIndex];
    if (!item || item.type === 'separator' || !item.label) {
      el.tooltip.classList.remove('show');
      return;
    }

    el.tooltip.textContent = item.label;
    el.tooltip.classList.add('show');

    const node = state.nodes[state.hoverIndex];
    const box = node.getBoundingClientRect();
    const tip = el.tooltip.getBoundingClientRect();
    const dock = state.cfg.dock;
    const s = el.tooltip.style;

    if (isHorizontal()) {
      let left = box.left + box.width / 2 - tip.width / 2;
      left = Math.max(4, Math.min(window.innerWidth - tip.width - 4, left));
      s.left = `${left}px`;
      s.top = dock.position === 'bottom' ? `${box.top - tip.height - 8}px` : `${box.bottom + 8}px`;
    } else {
      let top = box.top + box.height / 2 - tip.height / 2;
      top = Math.max(4, Math.min(window.innerHeight - tip.height - 4, top));
      s.top = `${top}px`;
      s.left = dock.position === 'left' ? `${box.right + 8}px` : `${box.left - tip.width - 8}px`;
    }
  }

  /* --------------------------------------------------------------- *
   * Input
   * --------------------------------------------------------------- */

  function axisOf(event) {
    return isHorizontal() ? event.clientX : event.clientY;
  }

  function indexFromEvent(event) {
    const node = event.target.closest ? event.target.closest('.dock-item') : null;
    return node ? Number(node.dataset.index) : -1;
  }

  function onPointerMove(event) {
    state.cursor = axisOf(event);
    const idx = nearestIndex(state.cursor);
    if (idx !== state.hoverIndex) state.hoverIndex = idx;
    paint(false);
  }

  /**
   * Which item the pointer is over, taken from the layout that was just
   * computed rather than from getBoundingClientRect. Reading the DOM here
   * would both force a synchronous reflow on every mouse move and report
   * positions from the frame before, which is its own source of jitter.
   */
  function nearestIndex(cursor) {
    const result = state.layout;
    const g = state.geom;
    if (!result || !g) return -1;

    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < result.starts.length; i += 1) {
      const start = result.starts[i];
      const size = result.widths[i];
      if (cursor >= start && cursor <= start + size) return i;
      const distance = cursor < start ? start - cursor : cursor - (start + size);
      if (distance < bestDist) { bestDist = distance; best = i; }
    }
    return bestDist <= g.gap ? best : -1;
  }

  function onPointerLeave() {
    state.cursor = null;
    state.hoverIndex = -1;
    el.tooltip.classList.remove('show');
    paint(false);
    api.dock.mouseLeave();
  }

  function onPointerEnter() {
    api.dock.mouseEnter();
  }

  async function onClick(event) {
    if (event.button !== 0) return;
    const index = indexFromEvent(event);
    if (index < 0) return;
    const item = state.drawn[index];
    if (!item || item.type === 'separator') return;

    const node = state.nodes[index];
    const fx = state.cfg.dock.clickEffect;
    if (fx !== 'none') {
      const cls = fx === 'pop' ? 'fx-pop' : 'fx-bounce';
      node.classList.remove(cls);
      void node.offsetWidth; // restart the animation
      node.classList.add(cls);
      setTimeout(() => node.classList.remove(cls), 1000);
    }

    const result = item.transient
      ? await api.dock.launchPath(item.path)
      : await api.items.launch(item.id);

    if (item.path === 'system:trash') {
      setTimeout(async () => {
        const info = await api.trash.state();
        if (info.empty !== state.trashEmpty) { state.trashEmpty = info.empty; render(); }
      }, 1200);
    }
    if (!result || result.ok === false) {
      node.classList.add('fx-error');
      setTimeout(() => node.classList.remove('fx-error'), 500);
      if (result && result.error) console.warn('[dock] launch failed:', result.error);
    }
  }

  function onContextMenu(event) {
    event.preventDefault();
    const index = indexFromEvent(event);
    const item = index >= 0 ? state.drawn[index] : null;
    // Pass where the pointer is, so anything the menu adds lands there rather
    // than at the end of the dock.
    api.dock.contextMenu(item ? item.id : null, dropIndexFor(axisOf(event)));
  }

  /* ------------------------- drag & drop ------------------------- */

  /**
   * Where a drop at `cursor` should land, as an index into the pinned items.
   * Measured against the resting layout so the answer does not change while
   * the icons are still parting.
   */
  function dropIndexFor(cursor) {
    const g = state.geom;
    if (!g) return state.items.length;

    let walk = barMetrics(state.intensity).origin;
    for (let i = 0; i < state.items.length; i += 1) {
      const size = itemAxisSize(state.items[i], g.iconSize);
      if (cursor < walk + size / 2) return i;
      walk += size + g.gap;
    }
    return state.items.length;
  }

  function setDropIndex(index) {
    if (state.dropIndex === index) return;
    state.dropIndex = index;
    render();
  }

  function clearDropIndex() {
    if (state.dropIndex === null) return;
    state.dropIndex = null;
    render();
  }

  function setupDragAndDrop() {
    let depth = 0;

    const carriesFiles = (event) =>
      !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files');

    el.body.addEventListener('dragenter', (event) => {
      if (!carriesFiles(event) && state.dragIndex < 0) return;
      depth += 1;
    });

    el.body.addEventListener('dragover', (event) => {
      const internal = state.dragIndex >= 0;
      if (!carriesFiles(event) && !internal) return;
      event.preventDefault();

      if (state.cfg.dock.lockItems) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      event.dataTransfer.dropEffect = internal ? 'move' : 'copy';
      setDropIndex(dropIndexFor(axisOf(event)));
    });

    el.body.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) clearDropIndex();
    });

    el.body.addEventListener('drop', async (event) => {
      event.preventDefault();
      depth = 0;

      const index = state.dropIndex === null ? state.items.length : state.dropIndex;
      const internal = state.dragIndex;
      clearDropIndex();

      if (state.cfg.dock.lockItems) return;

      if (internal >= 0) {
        state.dragIndex = -1;
        // The gap sat where the item will land, so the target index is it.
        if (index !== internal) {
          state.items = await api.items.move(internal, index > internal ? index - 1 : index);
          render();
        }
        return;
      }

      const paths = Array.from(event.dataTransfer.files || [])
        .map((file) => api.pathForFile(file))
        .filter(Boolean);
      if (!paths.length) return;

      state.items = await api.items.insertPaths(paths, index);
      render();
    });

    // Reordering inside the dock uses the same gap.
    el.items.addEventListener('dragstart', (event) => {
      if (state.cfg.dock.lockItems) { event.preventDefault(); return; }
      const index = indexFromEvent(event);
      const item = state.drawn[index];
      if (index < 0 || !item || item.transient) { event.preventDefault(); return; }

      state.dragIndex = state.items.findIndex((it) => it.id === item.id);
      if (state.dragIndex < 0) { event.preventDefault(); return; }
      state.nodes[index].classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(state.dragIndex));
    });

    el.items.addEventListener('dragend', () => {
      state.dragIndex = -1;
      clearDropIndex();
    });

    el.items.addEventListener('mousedown', (event) => {
      const index = indexFromEvent(event);
      if (index < 0) return;
      const item = state.drawn[index];
      state.nodes[index].draggable = !state.cfg.dock.lockItems && !!item && !item.transient;
    });
  }

  /* --------------------------------------------------------------- *
   * Wiring
   * --------------------------------------------------------------- */

  function applyBodyClasses() {
    const dock = state.cfg.dock;
    el.body.className = `pos-${dock.position}${dock.showReflection ? ' reflections' : ''}`;
  }

  /** Put the running dot under any drawn item whose executable is running. */
  function markRunning() {
    const show = state.cfg && state.cfg.dock.showRunningIndicator;
    for (let i = 0; i < state.nodes.length; i += 1) {
      const item = state.drawn[i];
      const key = (item.path || '').split(/[\\/]/).pop().toLowerCase();
      state.nodes[i].classList.toggle(
        'running',
        !!show && !!key && (state.running.has(key) || !!item.transient),
      );
    }
  }

  async function refresh(snapshot) {
    state.cfg = snapshot;
    applyTheme(snapshot.theme);
    applyBodyClasses();
    // The pointer was somewhere else (the settings window, the tray menu) when
    // this change arrived, so drop the stale hover rather than staying zoomed.
    state.cursor = null;
    state.hoverIndex = -1;
    state.lastRect = null;
    state.intensity = 0;
    state.targetIntensity = 0;
    el.tooltip.classList.remove('show');
    state.items = await api.items.get();
    render();
    markRunning();
  }

  async function boot() {
    const snapshot = await api.config.get();
    await refresh(snapshot);

    el.body.addEventListener('mousemove', onPointerMove);
    el.body.addEventListener('mouseenter', onPointerEnter);
    el.body.addEventListener('mouseleave', onPointerLeave);
    el.body.addEventListener('click', onClick);
    el.body.addEventListener('contextmenu', onContextMenu);
    el.body.addEventListener('dblclick', (e) => e.preventDefault());

    setupDragAndDrop();

    api.config.onChange((next) => { refresh(next); });
    api.dock.onHiddenChanged((hidden) => {
      el.body.classList.toggle('plate-hidden', hidden);
      if (hidden) { state.cursor = null; state.hoverIndex = -1; paint(false); }
    });
    api.dock.onRunning((names) => {
      state.running = new Set(names);
      markRunning();
    });

    // The bin's contents change from outside the dock, so poll for them and
    // refresh straight after anything that could have emptied it.
    const refreshTrash = async () => {
      const hasTrash = state.items.some((item) => item.path === 'system:trash');
      if (!hasTrash) return;
      const info = await api.trash.state();
      if (info.empty === state.trashEmpty) return;
      state.trashEmpty = info.empty;
      render();
    };
    refreshTrash();
    setInterval(refreshTrash, 15000);
    api.trash.onChange((info) => {
      if (!info || info.empty === state.trashEmpty) return;
      state.trashEmpty = info.empty;
      render();
    });

    api.dock.onRunningApps((apps) => {
      state.runningApps = apps || [];
      render();
      markRunning();
    });

    window.addEventListener('resize', () => paint(true));
  }

  boot().catch((err) => console.error('[dock] boot failed:', err));
})();
