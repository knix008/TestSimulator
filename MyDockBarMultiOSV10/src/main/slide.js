'use strict';

/**
 * Geometry and timing for the auto-hide slide.
 *
 * An auto-hiding dock does not blink out of existence: it travels to the
 * screen edge and back, leaving a sliver behind. The awkward parts of that -
 * where it comes to rest, how far along it is at a given moment, and which
 * part of it is still on screen while it moves - are kept here, free of
 * Electron, so they can be reasoned about and tested on their own.
 */

/**
 * Smooth at both ends. A linear slide starts and stops with a visible jerk;
 * this eases in and out so the dock appears to gather speed and settle.
 */
function ease(t) {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - ((-2 * c + 2) ** 3) / 2;
}

/**
 * Where the window sits once the dock has hidden: off the edge it belongs to,
 * with `peek` pixels left on screen for the pointer to find.
 */
function awayOrigin(shown, { position, area, width, height, peek }) {
  const keep = Math.max(1, peek);
  if (position === 'top') return { x: shown.x, y: area.y - height + keep };
  if (position === 'left') return { x: area.x - width + keep, y: shown.y };
  if (position === 'right') return { x: area.x + area.width - keep, y: shown.y };
  return { x: shown.x, y: area.y + area.height - keep }; // bottom
}

/**
 * The window origin part-way through the slide, `progress` running from 0
 * (fully out) to 1 (fully away). Rounded: a window placed on a fractional
 * pixel shimmers as it moves.
 */
function originAt(shown, away, progress) {
  const p = Math.min(1, Math.max(0, progress));
  return {
    x: Math.round(shown.x + (away.x - shown.x) * p),
    y: Math.round(shown.y + (away.y - shown.y) * p),
  };
}

/**
 * How long a slide should take. Reversing part-way is charged only for the
 * distance left to cover, so a dock caught on its way out comes back at the
 * speed it was already moving instead of crawling.
 */
function duration(full, from, to) {
  return Math.round(Math.max(0, full) * Math.abs(to - from));
}

/** The strip of screen edge that wakes a hidden dock, in screen coordinates. */
function edgeBand(position, area, peek) {
  const keep = Math.max(1, peek);
  if (position === 'top') return { x: area.x, y: area.y, width: area.width, height: keep };
  if (position === 'left') return { x: area.x, y: area.y, width: keep, height: area.height };
  if (position === 'right') {
    return { x: area.x + area.width - keep, y: area.y, width: keep, height: area.height };
  }
  return { x: area.x, y: area.y + area.height - keep, width: area.width, height: keep };
}

/**
 * `band` clipped to `bounds`, expressed in coordinates local to `bounds`, or
 * null when the two do not meet. Used to find the part of a sliding dock that
 * is still on screen: the window itself sweeps across the desktop on its way
 * out, and only the sliver at the edge should count as a hot zone.
 */
function localOverlap(bounds, band) {
  const x1 = Math.max(bounds.x, band.x);
  const y1 = Math.max(bounds.y, band.y);
  const x2 = Math.min(bounds.x + bounds.width, band.x + band.width);
  const y2 = Math.min(bounds.y + bounds.height, band.y + band.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1 - bounds.x, y: y1 - bounds.y, width: x2 - x1, height: y2 - y1 };
}

/** Is `point` (local coordinates) inside `rect`, allowing a grace margin? */
function within(point, rect, margin = 0) {
  if (!rect) return false;
  return point.x >= rect.x - margin
    && point.y >= rect.y - margin
    && point.x < rect.x + rect.width + margin
    && point.y < rect.y + rect.height + margin;
}

/**
 * What the pointer's position means for an auto-hiding dock.
 *
 * `plate` is the region the renderer says is actually dock, and `sliver` the
 * part of a hidden dock still showing at the screen edge - both in window-local
 * coordinates, either of them possibly null.
 *
 * Two things this has to get right, and both used to be wrong:
 *
 *  - While the dock slides out it is still largely on screen, so the pointer
 *    must be able to catch it there rather than having to chase it to the edge.
 *  - The window is much bigger than the dock, because it reserves room for
 *    magnification and for item names. Judging "the pointer left" by the
 *    window would leave the dock awake over a wide band of empty air.
 */
function decide({ point, hidden, sliding, plate, sliver, margin = 0 }) {
  const zones = hidden ? [sliver] : [plate];
  // Mid-slide, whichever of the two the pointer finds counts.
  if (hidden && sliding) zones.push(plate);

  const onDock = zones.some((zone) => within(point, zone));
  const nearDock = zones.some((zone) => within(point, zone, margin));

  return { interactive: onDock, show: onDock, hide: !onDock && !nearDock };
}

module.exports = {
  ease, awayOrigin, originAt, duration, edgeBand, localOverlap, within, decide,
};
