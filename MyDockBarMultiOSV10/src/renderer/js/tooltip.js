/* Where an item's name goes, and how much room the window has to reserve for
 * it. Kept free of DOM access so the arithmetic can be tested on its own.
 *
 * The dock window is transparent and sized to the dock, so a tooltip is not
 * free to overflow it: whatever falls outside the window is clipped by the
 * operating system. A dock on the left or right edge is the hard case, since
 * the name reads *across* the dock's thin dimension and needs far more room
 * than the icons do. */
(function () {
  'use strict';

  /** Gap between an icon and its name. */
  const GAP = 8;

  /** Never let the window balloon for one absurdly long name. */
  const MAX_LABEL = 420;

  /** Breathing room kept between the tooltip and the window edge. */
  const EDGE = 4;

  /**
   * Room to reserve across the dock's thin dimension, beyond the icons.
   *
   * On a horizontal dock the name sits above or below the icons, so this is
   * the height of one line. On a vertical dock it sits beside them and this is
   * the full width of the widest name - which is why a left-hand dock lives in
   * a much wider window than it appears to occupy.
   */
  function crossRoom({ showLabels, vertical, labelWidth, labelHeight }) {
    if (!showLabels) return 6;
    if (!vertical) return Math.ceil(labelHeight + GAP) + 6;
    return Math.ceil(Math.min(MAX_LABEL, labelWidth) + GAP) + 6;
  }

  /**
   * Smallest the window may be along the dock's long dimension. A horizontal
   * dock holding two icons is narrower than the name of either of them, and
   * centring the name on the icon would push most of it outside the window.
   */
  function axisRoom({ showLabels, vertical, labelWidth }) {
    if (!showLabels || vertical) return 0;
    return Math.ceil(Math.min(MAX_LABEL, labelWidth)) + GAP * 2;
  }

  /**
   * Where to put the tooltip for an item, clamped so it always lands inside
   * the window. `box` is the item's rectangle, `tip` the tooltip's measured
   * size and `view` the window's inner size - all in window coordinates.
   */
  function place({ position, box, tip, view }) {
    const vertical = position === 'left' || position === 'right';
    let left;
    let top;

    if (vertical) {
      top = box.top + box.height / 2 - tip.height / 2;
      left = position === 'left' ? box.right + GAP : box.left - tip.width - GAP;
    } else {
      left = box.left + box.width / 2 - tip.width / 2;
      top = position === 'top' ? box.bottom + GAP : box.top - tip.height - GAP;
    }

    return {
      left: clamp(left, tip.width, view.width),
      top: clamp(top, tip.height, view.height),
    };
  }

  /**
   * Keep `value` inside the view. When the tooltip is larger than the window
   * there is no position that fits, so it is pinned to the near edge and the
   * overflow is left to the element's own ellipsis rather than being split
   * across both sides.
   */
  function clamp(value, size, view) {
    const limit = view - size - EDGE;
    if (limit <= EDGE) return EDGE;
    return Math.round(Math.max(EDGE, Math.min(limit, value)));
  }

  const api = { crossRoom, axisRoom, place, clamp, GAP, MAX_LABEL, EDGE };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DockTooltip = api;
})();
