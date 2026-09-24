/* The dock renderer: owns layout, magnification, input and theming. */
(function () {
  'use strict';

  const api = window.dockApi;
  const { layout, peakSpread, approach } = window.DockMagnify;
  const Tip = window.DockTooltip;
  const Metrics = window.DockMetrics;
  const Glyphs = window.DockGlyphs;
  const Placement = window.DockPlacement;

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

  const STAGE_MARGIN = 24;
  // The gap at the two ends of the bar is fixed: the padding setting only ever
  // adjusts the thickness direction, so shrinking it cannot pull the end icons
  // against the edge of the background.
  const AXIS_PAD = 12;

  /** The edge the dock is actually resting on. A corner uses that edge's layout. */
  const place = () => Placement.resolve(state.cfg.dock.position, state.cfg.dock.align);
  const isHorizontal = () => !place().vertical;

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

  /**
   * The Trash draws itself full or empty. A hand-picked icon still wins: the
   * user asked for that picture, so the state is not worth overruling them.
   */
  function iconFor(item) {
    if (item.path === 'system:trash' && !item.icon) {
      return Glyphs.get(state.trashEmpty ? 'system:trash' : 'system:trash-full');
    }
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

    // How deep the background is, and how far in from its edge the icons sit.
    // The gap either side of an icon is the same at every screen edge, so the
    // dock looks the same whichever way round it is turned.
    const cross = Metrics.crossMetrics({
      iconSize,
      padding: pad,
      plateThickness: dock.plateThickness,
      showReflection: dock.showReflection,
      vertical: !isHorizontal(),
    });
    const plateCross = cross.plate;
    const anchor = cross.anchor;

    // Names are shown inside the dock's own window, so the window has to be
    // big enough to hold the longest of them. On a vertical dock that means a
    // window far wider than the icons; on a short horizontal one it means a
    // window wider than the row.
    const label = labelExtent();
    const vertical = !isHorizontal();
    const tooltipRoom = Tip.crossRoom({
      showLabels: dock.showLabels,
      vertical,
      labelWidth: label.width,
      labelHeight: label.height,
    });
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
    const stageAxis = Math.max(
      Math.ceil(restLength + spread + AXIS_PAD * 2 + STAGE_MARGIN * 2),
      Tip.axisRoom({ showLabels: dock.showLabels, vertical, labelWidth: label.width }),
    );

    state.geom = {
      sizes, restLength, plateCross, stageAxis, stageCross,
      anchor, iconSize, gap, pad, spread, axisPad: AXIS_PAD,
    };

    const horizontal = isHorizontal();
    const edge = place().edge;
    const width = horizontal ? stageAxis : stageCross;
    const height = horizontal ? stageCross : stageAxis;

    // Only the cross-axis side of the plate is settled here; its length and
    // position follow the hover and are set in renderFrame().
    const p = el.plate.style;
    if (horizontal) {
      p.top = edge === 'top' ? '0px' : '';
      p.bottom = edge === 'bottom' ? '0px' : '';
      p.right = '';
      p.height = `${plateCross}px`;
    } else {
      p.left = edge === 'left' ? '0px' : '';
      p.right = edge === 'right' ? '0px' : '';
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
    const edge = place().edge;

    const rect = horizontal
      ? {
        x: Math.round(axisStart),
        y: edge === 'top' ? 0 : state.stage.height - cross,
        width: Math.round(axisLength),
        height: cross,
      }
      : {
        x: edge === 'left' ? 0 : state.stage.width - cross,
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
    const extra = state.dropIndex === null ? 0 : g.iconSize + g.gap;
    const length = Math.ceil(g.restLength + extra + g.spread * intensity + g.axisPad * 2);
    const start = Math.round((g.stageAxis - length) / 2);

    // Where the icons sit when nothing is magnified. The row is drawn from
    // `origin`, which slides left by half the spread as the dock wakes up so
    // the expansion ends up centred on the pointer rather than all to one
    // side; `restOrigin` stays put so the falloff curve keeps measuring from
    // the icons' real positions.
    const restLength = Math.ceil(g.restLength + extra + g.axisPad * 2);
    const restOrigin = Math.round((g.stageAxis - restLength) / 2) + g.axisPad;

    return { start, length, origin: start + g.axisPad, restOrigin };
  }

  function renderFrame() {
    const dock = state.cfg.dock;
    const g = state.geom;
    if (!g || !state.nodes.length) return;

    const amplitude = Math.max(0, dock.maxZoom - 1) * state.intensity;
    const active = state.intensity > 0.0015 && state.cursor !== null;
    const bar = barMetrics(state.intensity);

    // A drag opens a slot at the landing position. It exists only in the
    // layout maths - creating a real node would replace the others and they
    // would jump into place instead of sliding.
    const gapAt = state.dropIndex;
    const sizes = gapAt === null
      ? g.sizes
      : [...g.sizes.slice(0, gapAt), g.iconSize, ...g.sizes.slice(gapAt)];

    const result = layout({
      sizes,
      unit: g.iconSize,
      gap: g.gap,
      origin: bar.origin,
      restOrigin: bar.restOrigin,
      cursor: active ? state.cursor : null,
      maxZoom: 1 + amplitude,
      zoomRange: dock.zoomRange,
      animation: dock.animation,
      // Easing `spread` alongside the zoom keeps the row's length and the
      // pointer's effect in step, so nothing jumps as the dock wakes up.
      spread: g.spread * state.intensity,
    });

    state.layout = result;
    place(result, bar, gapAt);
    positionTooltip();
  }

  /** Position the nodes and the plate from a computed layout. */
  function place(result, bar, gapAt) {
    const g = state.geom;
    const dock = state.cfg.dock;
    const horizontal = isHorizontal();
    const edge = place().edge;
    const n = state.drawn.length;

    for (let i = 0; i < n; i += 1) {
      // Real icons skip over the slot the drag has opened.
      const slot = gapAt === null || i < gapAt ? i : i + 1;
      const node = state.nodes[i];
      // Snap to whole pixels: a fractional position makes the browser resample
      // the icon every frame, which looks like shimmer even when the geometry
      // underneath is perfectly steady.
      const offset = Math.round(result.starts[slot]);
      const axisSize = Math.round(result.widths[slot]);
      const crossSize = Math.round(g.iconSize * result.scales[slot]);
      const st = node.style;

      if (horizontal) {
        st.left = `${offset}px`;
        st.width = `${axisSize}px`;
        st.height = `${crossSize}px`;
        if (edge === 'bottom') {
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
        if (edge === 'left') {
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
    state.targetIntensity = (state.cursor === null || state.dropIndex !== null) ? 0 : 1;
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

  /**
   * How much space the longest item name needs, measured in the tooltip's own
   * font. Measured with a canvas rather than by writing each name into the
   * element: this runs during layout, and one text measurement per item is a
   * great deal cheaper than one reflow per item.
   */
  function labelExtent() {
    const empty = { width: 0, height: 0 };
    if (!state.cfg.dock.showLabels) return empty;

    const labels = state.drawn
      .filter((item) => item.type !== 'separator' && item.label)
      .map((item) => String(item.label));
    if (!labels.length) return empty;

    if (!labelExtent.ctx) {
      labelExtent.ctx = document.createElement('canvas').getContext('2d');
    }
    const ctx = labelExtent.ctx;
    const style = getComputedStyle(el.tooltip);
    // `font` is empty in browsers that cannot serialise the shorthand, so fall
    // back to assembling it from the longhands.
    ctx.font = style.font
      || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    let widest = 0;
    for (const text of labels) widest = Math.max(widest, ctx.measureText(text).width);

    const sides = (prop) => parseFloat(style[prop]) || 0;
    const padX = sides('paddingLeft') + sides('paddingRight')
      + sides('borderLeftWidth') + sides('borderRightWidth');
    const padY = sides('paddingTop') + sides('paddingBottom')
      + sides('borderTopWidth') + sides('borderBottomWidth');
    const line = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 12.5) * 1.2;

    return { width: Math.ceil(widest + padX) + 1, height: Math.ceil(line + padY) };
  }

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

    // Clamped on both axes, not just the one the dock runs along: the window
    // is sized for the longest name, but a name longer than the cap, or a
    // stale size from a config change still in flight, must still land inside
    // it rather than be cut off at the window edge.
    const at = Tip.place({
      position: place().edge,
      box,
      tip: { width: tip.width, height: tip.height },
      view: { width: window.innerWidth, height: window.innerHeight },
    });

    el.tooltip.style.left = `${at.left}px`;
    el.tooltip.style.top = `${at.top}px`;
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
    if (idx !== state.hoverIndex) {
      state.hoverIndex = idx;
      // Settling on an icon is the cue to find out whether that program
      // already has a window, well before the click that needs the answer.
      const item = idx >= 0 ? state.drawn[idx] : null;
      if (item && item.path) api.dock.prefetchWindows(item.path);
    }
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

    let walk = barMetrics(state.intensity).restOrigin;
    for (let i = 0; i < state.items.length; i += 1) {
      const size = itemAxisSize(state.items[i], g.iconSize);
      if (cursor < walk + size / 2) return i;
      walk += size + g.gap;
    }
    return state.items.length;
  }

  /**
   * How long each drag-out effect runs, in step with css/effects.css. The
   * entry is only taken off the dock once its animation has finished, so the
   * icon is never yanked out from under the picture of it leaving.
   */
  const REMOVE_EFFECTS = {
    poof: 520, shrink: 380, fade: 260, drop: 460, suck: 440, shatter: 460, none: 0,
  };

  /** The smoke for the poof effect: clouds thrown out from the icon. */
  function puffClouds() {
    const wrap = document.createElement('div');
    wrap.className = 'puff';
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const angle = ((Math.PI * 2 * i) / count) - Math.PI / 2;
      const reach = 105 + (i % 2) * 45;
      const cloud = document.createElement('i');
      cloud.style.setProperty('--px', `${Math.round(Math.cos(angle) * reach)}%`);
      cloud.style.setProperty('--py', `${Math.round(Math.sin(angle) * reach)}%`);
      cloud.style.animationDelay = `${i * 20}ms`;
      wrap.appendChild(cloud);
    }
    return wrap;
  }

  /**
   * The pieces for the shatter effect. Each one carries its own slice of the
   * icon as a background, so what flies apart is the picture itself rather
   * than a generic spray of squares.
   */
  function shards(src) {
    const wrap = document.createElement('div');
    wrap.className = 'shards';
    if (!src) return wrap;

    const grid = 3;
    const step = 100 / grid;
    for (let row = 0; row < grid; row += 1) {
      for (let col = 0; col < grid; col += 1) {
        const piece = document.createElement('i');
        piece.style.left = `${col * step}%`;
        piece.style.top = `${row * step}%`;
        piece.style.width = `${step}%`;
        piece.style.height = `${step}%`;
        piece.style.backgroundImage = `url("${src}")`;
        piece.style.backgroundSize = `${grid * 100}% ${grid * 100}%`;
        piece.style.backgroundPosition = `${(col * 100) / (grid - 1)}% ${(row * 100) / (grid - 1)}%`;

        // Outwards from the middle, so the icon comes apart rather than
        // sliding off in one direction.
        const dx = col - (grid - 1) / 2;
        const dy = row - (grid - 1) / 2;
        piece.style.setProperty('--px', `${Math.round(dx * 130)}%`);
        piece.style.setProperty('--py', `${Math.round(dy * 130 + 90)}%`);
        piece.style.setProperty('--spin', `${Math.round((dx + dy) * 60)}deg`);
        wrap.appendChild(piece);
      }
    }
    return wrap;
  }

  /** Play the configured farewell on `node`; resolves once it has finished. */
  function playRemoveEffect(node) {
    const name = state.cfg.dock.removeEffect;
    const effect = Object.prototype.hasOwnProperty.call(REMOVE_EFFECTS, name) ? name : 'poof';
    const ms = REMOVE_EFFECTS[effect];
    if (!ms) return Promise.resolve();

    node.classList.add('vanishing', `vanish-${effect}`);
    if (effect === 'poof') node.appendChild(puffClouds());
    if (effect === 'shatter') {
      const img = node.querySelector('img.icon');
      node.appendChild(shards(img && img.src));
    }
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  function setDropIndex(index) {
    if (state.dropIndex === index) return;
    state.dropIndex = index;
    // Magnification is suppressed during a drag: the pointer is carrying
    // something, and letting the two animations fight makes both look wrong.
    el.body.classList.add('reordering');
    state.targetIntensity = 0;
    paint(false);
  }

  function clearDropIndex() {
    if (state.dropIndex === null) return;
    state.dropIndex = null;
    paint(false);
    // Leave the transition on long enough for the icons to close the gap.
    setTimeout(() => el.body.classList.remove('reordering'), 220);
  }

  function setupDragAndDrop() {
    let depth = 0;
    // Set by our own drop handler. If a drag of one of our icons ends without
    // it, the icon was released somewhere else and the user meant to remove it.
    let droppedOnDock = false;

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
      droppedOnDock = true;

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
      droppedOnDock = false;
      state.nodes[index].classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(state.dragIndex));
    });

    el.items.addEventListener('dragend', async (event) => {
      const from = state.dragIndex;
      state.dragIndex = -1;
      clearDropIndex();
      for (const node of state.nodes) node.classList.remove('dragging');

      // Released away from the dock: that is how an icon is taken off it.
      if (from < 0 || droppedOnDock || state.cfg.dock.lockItems) return;

      const item = state.items[from];
      if (!item || item.protected) return;

      const index = state.drawn.findIndex((it) => it.id === item.id);
      if (index >= 0) await playRemoveEffect(state.nodes[index]);

      state.items = await api.items.remove(item.id);
      render();
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
    el.body.className = `pos-${place().edge}${dock.showReflection ? ' reflections' : ''}`;
    applyEffectDirection(dock);
  }

  /** Unit vectors for the four directions a launched icon can travel. */
  const FX_VECTOR = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  };

  /** Away from the screen edge the dock is docked against. */
  const FX_AWAY_FROM_EDGE = {
    bottom: 'up', top: 'down', left: 'right', right: 'left',
  };

  /**
   * Point the click effect somewhere the icon can actually go.
   *
   * An icon resting on the bottom of the screen can only bounce upwards, and
   * one down the left-hand edge can only bounce to the right - a fixed
   * translateY would drive the icons of a side dock into the screen edge
   * instead of away from it. 'auto' works that out from the position; the four
   * explicit directions are for anyone who wants it otherwise.
   *
   * The error shake runs across the bounce, along the bar, so a failed launch
   * wobbles between its neighbours instead of retracing the same line.
   */
  function applyEffectDirection(dock) {
    const choice = !dock.clickEffectDirection || dock.clickEffectDirection === 'auto'
      ? FX_AWAY_FROM_EDGE[place().edge] || 'up'
      : dock.clickEffectDirection;
    const [x, y] = FX_VECTOR[choice] || FX_VECTOR.up;

    const style = document.documentElement.style;
    style.setProperty('--fx-x', String(x));
    style.setProperty('--fx-y', String(y));
    style.setProperty('--fx-shake-x', String(Math.abs(y)));
    style.setProperty('--fx-shake-y', String(Math.abs(x)));
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
    api.dock.onHiddenChanged((info) => {
      // Older payloads were a bare boolean; the slide added a duration.
      const hidden = info && typeof info === 'object' ? !!info.hidden : !!info;
      const ms = info && typeof info === 'object' ? Number(info.duration) || 0 : 0;
      // Fade over exactly as long as the window takes to travel, so the dock
      // dissolves as it sinks instead of blinking out at either end of it.
      el.body.style.setProperty('--slide-ms', `${ms}ms`);
      el.body.classList.toggle('plate-hidden', hidden);
      if (hidden) { state.cursor = null; state.hoverIndex = -1; paint(false); }
    });
    api.dock.onRunning((names) => {
      state.running = new Set(names);
      markRunning();
    });

    // The main process hands us the cursor for the moments this window cannot
    // see it for itself - while a popup menu holds the mouse, and as the
    // pointer leaves, when being made click-through can cost us the
    // `mouseleave`. `null` means "off the plate", and relaxes the
    // magnification exactly as leaving would. `quiet` suppresses the name: a
    // tooltip floating beside an open menu helps nobody.
    api.dock.onPointer((point) => {
      const cursor = point ? (isHorizontal() ? point.x : point.y) : null;
      const hover = (point && !point.quiet) ? nearestIndex(cursor) : -1;
      if (cursor === state.cursor && hover === state.hoverIndex) return;
      state.cursor = cursor;
      state.hoverIndex = hover;
      paint(false);
    });

    // The main process watches the bin and pushes every change, so this only
    // settles the icon on startup and covers a reload that missed a push.
    const refreshTrash = async () => {
      const hasTrash = state.items.some((item) => item.path === 'system:trash');
      if (!hasTrash) return;
      const info = await api.trash.state();
      if (info.empty === state.trashEmpty) return;
      state.trashEmpty = info.empty;
      render();
    };
    refreshTrash();
    setInterval(refreshTrash, 30000);
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
