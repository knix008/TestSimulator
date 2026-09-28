/* How deep the dock's background is and where the icons sit inside it.
 *
 * This is the dock's thin dimension - the one that runs from the screen edge
 * inwards - and the rule it has to keep is that an icon has the same amount of
 * air on both sides of it, whichever edge the dock is docked to. Kept free of
 * DOM access so that rule can be checked directly. */
(function () {
  'use strict';

  /** Reflections take this share of the icon below it, when they are drawn. */
  const REFLECTION = 0.18;

  /** Air between an icon and the background's edge, as a share of the icon. */
  const INSET = 0.12;

  /** Never less than this, however small the icons are. */
  const MIN_INSET = 4;

  /**
   * @param {object} o
   * @param {number} o.iconSize        icon edge length in px
   * @param {number} o.padding         the user's padding setting
   * @param {number} o.plateThickness  0 to size the background to the icons
   * @param {boolean} o.showReflection
   * @param {boolean} o.vertical       dock on the left or right edge
   */
  function crossMetrics({ iconSize, padding, plateThickness, showReflection, vertical }) {
    // Reflections are only drawn on a horizontal dock, so a vertical one must
    // not reserve room for them or its icons end up off-centre.
    const reflection = showReflection && !vertical ? Math.round(iconSize * REFLECTION) : 0;

    // Always present, on both sides, at every screen edge: icons pressed flat
    // against the background look like a strip of pictures rather than a dock.
    // The padding setting adds to this, so it can sit at zero and the dock
    // still has breathing room.
    const inset = Math.max(MIN_INSET, Math.round(iconSize * INSET));

    const auto = iconSize + (padding + reflection + inset) * 2;
    // An explicit thickness wins, but never so small that the icon spills out.
    const plate = plateThickness > 0
      ? Math.max(iconSize + 4, Math.round(plateThickness))
      : auto;

    // Half the slack on each side, which is what keeps the two gaps equal.
    return { reflection, inset, plate, anchor: (plate - iconSize) / 2 };
  }

  const api = { crossMetrics, REFLECTION, INSET, MIN_INSET };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DockMetrics = api;
})();
