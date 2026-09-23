/* The magnification maths, kept free of DOM access so the behaviour can be
 * reasoned about (and unit-tested) on its own. */
(function () {
  'use strict';

  /** Falloff curve: 1 under the cursor, 0 at the edge of the zoom range. */
  function kernel(t, mode) {
    const a = Math.abs(t);
    if (mode === 'none' || a >= 1) return 0;
    if (mode === 'linear') return 1 - a;
    if (mode === 'cosine') return Math.cos((a * Math.PI) / 2);
    return 1 - a * a; // parabolic — the RocketDock/macOS default feel
  }

  /**
   * Walk a distance measured along the resting layout and return the matching
   * distance along the magnified layout. This is what keeps the icon under the
   * pointer from sliding away as its neighbours grow.
   */
  function mapDistance(distance, sizes, widths, gap) {
    const n = sizes.length;
    let base = 0;
    let scaled = 0;
    for (let i = 0; i < n; i += 1) {
      const step = sizes[i] + (i < n - 1 ? gap : 0);
      const stepScaled = widths[i] + (i < n - 1 ? gap : 0);
      if (distance <= base + step) {
        const f = step > 0 ? (distance - base) / step : 0;
        return scaled + f * stepScaled;
      }
      base += step;
      scaled += stepScaled;
    }
    return scaled + (distance - base);
  }

  /**
   * @param {object} opts
   * @param {number[]} opts.sizes   resting length of each item along the dock axis
   * @param {number}   opts.unit    nominal icon size (drives the zoom radius)
   * @param {number}   opts.gap     spacing between items
   * @param {number}   opts.origin  coordinate the row is drawn from
   * @param {number} [opts.restOrigin] where the icons sit at rest. The falloff
   *        curve is measured against this, so shifting `origin` to centre the
   *        expansion on the pointer does not drag the curve along with it.
   * @param {number|null} opts.cursor pointer position along the axis, or null at rest
   * @param {number} [opts.spread] px of expansion to hold constant. When given,
   *        whatever the magnification is not currently using is redistributed
   *        as extra gap, so the row keeps one length and one starting point no
   *        matter where the pointer is.
   * @returns {{scales:number[], starts:number[], widths:number[], restLength:number}}
   */
  function layout(opts) {
    const {
      sizes, unit, gap, origin, cursor, maxZoom, zoomRange, animation, spread,
    } = opts;
    const restOrigin = opts.restOrigin === undefined ? origin : opts.restOrigin;
    const n = sizes.length;
    const restLength = n ? sizes.reduce((a, b) => a + b, 0) + gap * (n - 1) : 0;

    const scales = new Array(n);
    const widths = new Array(n);
    const starts = new Array(n);

    // Resting centres, used to decide how much each item grows. Measured from
    // where the icons actually sit, not from wherever the row is drawn.
    let walk = restOrigin;
    const centers = new Array(n);
    for (let i = 0; i < n; i += 1) {
      centers[i] = walk + sizes[i] / 2;
      walk += sizes[i] + gap;
    }

    const radius = Math.max(1, unit * zoomRange);
    const amplitude = Math.max(0, maxZoom - 1);

    for (let i = 0; i < n; i += 1) {
      scales[i] = cursor === null
        ? 1
        : 1 + amplitude * kernel((cursor - centers[i]) / radius, animation);
      widths[i] = sizes[i] * scales[i];
    }

    // Constant-length mode. The row is sized for a fixed amount of expansion,
    // and the difference between that and what the magnification is actually
    // using right now is taken up by the gaps - widening them when the pointer
    // is near an end and less of the curve fits on the row, narrowing them in
    // the middle where more of it does.
    //
    // The difference is shared evenly rather than concentrated where the curve
    // is strongest: putting it all beside the hovered icon is what made the
    // gap next to an end icon balloon to more than twice its width.
    const extraGaps = new Array(Math.max(0, n - 1)).fill(0);
    if (spread > 0 && n > 1) {
      let used = 0;
      for (let i = 0; i < n; i += 1) used += widths[i] - sizes[i];

      // A gap may narrow, but never past a third of its resting width.
      const share = (spread - used) / (n - 1);
      const floor = -gap * 0.66;
      extraGaps.fill(Math.max(floor, share));
    }

    let start;
    if (cursor === null || spread > 0) {
      start = origin;
    } else {
      const clamped = Math.max(0, Math.min(restLength, cursor - origin));
      start = cursor - mapDistance(clamped, sizes, widths, gap) - (cursor - origin - clamped);
    }

    walk = start;
    for (let i = 0; i < n; i += 1) {
      starts[i] = walk;
      walk += widths[i] + gap + (extraGaps[i] || 0);
    }

    return { scales, starts, widths, restLength, extraGaps };
  }

  /**
   * How much this particular set of icons expands as the pointer crosses it,
   * sampled at every position: the least (on an end icon, where half the curve
   * hangs off the row), the most (mid-row) and the midpoint of the two.
   *
   * Swept rather than estimated because the answer depends on how many icons
   * there are - three icons simply cannot spread as far as twenty - as well as
   * on the curve, the zoom range and the zoom amount. It runs once per
   * relayout, not per frame.
   *
   * @returns {{min:number, max:number, mid:number}}
   */
  function spreadRange(opts) {
    const { sizes, gap } = opts;
    const n = sizes.length;
    if (!n) return { min: 0, max: 0, mid: 0 };

    const restLength = sizes.reduce((a, b) => a + b, 0) + gap * (n - 1);
    let min = Infinity;
    let max = 0;

    // One sample per quarter-icon is far finer than the extremes need.
    const samples = Math.max(32, n * 4);
    for (let i = 0; i <= samples; i += 1) {
      const cursor = (restLength * i) / samples;
      const result = layout({ ...opts, origin: 0, restOrigin: 0, cursor, spread: 0 });
      let used = 0;
      for (let k = 0; k < n; k += 1) used += result.widths[k] - sizes[k];
      min = Math.min(min, used);
      max = Math.max(max, used);
    }

    if (!Number.isFinite(min)) min = 0;
    return { min: Math.floor(min), max: Math.ceil(max), mid: Math.round((min + max) / 2) };
  }

  /**
   * The size the row is held at. The midpoint of the range, so the widening
   * needed at the ends and the narrowing needed in the middle are both half
   * what sizing for the maximum would demand.
   */
  function peakSpread(opts) {
    return spreadRange(opts).mid;
  }

  /**
   * Total extra room the row can need. Kept for callers that only want one
   * number; `reach` is what the dock itself uses.
   */
  function bulge(unit, maxZoom, zoomRange) {
    const affected = Math.ceil(zoomRange * 2) + 1;
    return Math.ceil(unit * Math.max(0, maxZoom - 1) * affected);
  }

  /** Frame-rate independent easing toward a target value. */
  function approach(current, target, dt, stiffness) {
    const factor = 1 - Math.exp(-stiffness * dt);
    return current + (target - current) * factor;
  }

  window.DockMagnify = {
    layout, kernel, mapDistance, peakSpread, spreadRange, bulge, approach,
  };
})();
