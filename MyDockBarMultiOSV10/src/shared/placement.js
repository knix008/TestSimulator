/**
 * Where a dock sits: the four edges, and the four corners.
 *
 * A corner is an edge with the bar pinned to one end, so the rest of the
 * layout only has to know the edge. The caller's own alignment applies on an
 * edge; a corner names its end and ignores that alignment.
 *
 * Loaded by both the main process (`require`) and the renderer (`<script>`).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DockPlacement = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CORNERS = {
    'bottom-left': { edge: 'bottom', align: 'start' },
    'bottom-right': { edge: 'bottom', align: 'end' },
    'top-left': { edge: 'top', align: 'start' },
    'top-right': { edge: 'top', align: 'end' },
  };

  const EDGES = ['bottom', 'top', 'left', 'right'];

  /** Every position the settings and the tray menu offer, edges then corners. */
  const POSITIONS = EDGES.concat(Object.keys(CORNERS));

  /**
   * @param {string} position
   * @param {string} [align] start | center | end, used only for an edge
   * @returns {{ edge:string, align:string, vertical:boolean, corner:boolean }}
   */
  function resolve(position, align) {
    const corner = CORNERS[position];
    if (corner) {
      return { edge: corner.edge, align: corner.align, vertical: false, corner: true };
    }
    const edge = EDGES.includes(position) ? position : 'bottom';
    const used = align === 'start' || align === 'end' ? align : 'center';
    return {
      edge,
      align: used,
      vertical: edge === 'left' || edge === 'right',
      corner: false,
    };
  }

  return { CORNERS, EDGES, POSITIONS, resolve };
}));
