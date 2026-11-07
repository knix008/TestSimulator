// The program's own icon set: small line drawings on a 16×16 grid, in currentColor.
import { svg } from './dom.js';

const L = (d) => `<path d="${d}"/>`;
const C = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const F = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
/** Eight teeth around a hub. */
const GEAR = (() => {
  const at = (r, a) => `${(8 + r * Math.cos(a)).toFixed(2)} ${(8 + r * Math.sin(a)).toFixed(2)}`;
  const points = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    points.push(at(4.7, a - 0.36), at(6.6, a - 0.2), at(6.6, a + 0.2), at(4.7, a + 0.36));
  }
  return L(`M${points.join('L')}z`) + C(8, 8, 2);
})();
const CUBE = L('M8 2l5 3v6l-5 3-5-3V5zM3 5l5 3 5-3M8 8v6');

const ICONS = {
  // Editors
  'ed-view3d': CUBE, 'ed-outliner': L('M3 3h4M5 6.5h8M5 10h8M5 13.5h8M3 4v9.5'), 'ed-properties': L('M3 4h10M3 8h10M3 12h10') + F(6, 4, 1.4) + F(10, 8, 1.4) + F(5, 12, 1.4),
  'ed-timeline': L('M2 12h12M4 10v4M8 10v4M12 10v4M6 2v7') + F(6, 5, 1.6), 'ed-dopesheet': L('M2 4h12M2 8h12M2 12h12') + F(5, 4, 1.3) + F(10, 8, 1.3) + F(7, 12, 1.3),
  'ed-graph': L('M2 13C6 13 6 3 10 3s3 4 4 5M2 2v12h12'), 'ed-nla': L('M2 3h8v3H2zM6 8h8v3H6zM2 13h12'), 'ed-node': L('M2 3h5v4H2zM9 9h5v4H9zM7 5c3 0 0 6 2 6'),
  'ed-uv': L('M3 3h10v10H3zM3 8h10M8 3v10M3 13L13 3'), 'ed-image': L('M2 3h12v10H2zM2 11l3-3 3 3 2-2 4 4') + F(10.5, 6, 1.2), 'ed-text': L('M3 3h10M8 3v10M6 13h4'),
  'ed-console': L('M2 3h12v10H2zM4 6l2 2-2 2M8 10h3'), 'ed-info': C(8, 8, 6) + L('M8 7v4') + F(8, 5, 0.9), 'ed-sheet': L('M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10M10 3v10'), 'ed-coverage': L('M3 8l3 3 7-7M3 13h10'),
  // Primitives and object types
  'prim-plane': L('M2 10l5-5h7l-5 5z'), 'prim-cube': CUBE, 'prim-circle': C(8, 8, 5.5), 'prim-sphere': C(8, 8, 5.5) + L('M2.5 8c2 2.5 9 2.5 11 0M8 2.5c-2.5 2-2.5 9 0 11'), 'prim-ico': L('M8 2l5.5 3.2v5.6L8 14l-5.5-3.2V5.2zM8 2L5 7h6zM5 7l-2.5 3.8M11 7l2.5 3.8M5 7l3 7 3-7'),
  'prim-cylinder': '<ellipse cx="8" cy="4" rx="5" ry="2"/>' + L('M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4'), 'prim-cone': L('M8 2L3 12c0 1.1 2.2 2 5 2s5-.9 5-2z'), 'prim-torus': '<ellipse cx="8" cy="8" rx="6" ry="4"/><ellipse cx="8" cy="7.5" rx="2.5" ry="1.2"/>', 'prim-grid': L('M2 2h12v12H2zM6 2v12M10 2v12M2 6h12M2 10h12'),
  light: C(8, 6, 3.5) + L('M6.5 10v2h3v-2M7 14h2'), camera: L('M2 5h8v7H2zM10 7l4-2v7l-4-2'), empty: L('M8 2v12M2 8h12'), armature: L('M4 12l6-8 2 2-8 6zM10 4l1-1'), curve: L('M2 12C5 2 11 14 14 4'), text: L('M4 13L8 3l4 10M5.5 9.5h5'),
  meta: C(6, 7, 3.5) + C(11, 10, 2.5), lattice: L('M3 3h10v10H3zM3 8h10M8 3v10'), gpencil: L('M3 13l1-3 7-7 2 2-7 7zM10 4l2 2'), field: L('M3 5c3-2 7 2 10 0M3 8c3-2 7 2 10 0M3 11c3-2 7 2 10 0'), collection: L('M2 5h5l1 1.5h6V13H2z'), object: L('M8 2l5 3v6l-5 3-5-3V5z'),
  mesh: L('M8 2l5 3v6l-5 3-5-3V5zM3 5l10 6M13 5L3 11'), bone: L('M4 12l6-8 2 2-8 6z'), modifier: L('M12 2l2 2-8 8H4v-2zM3 14h10'), material: C(8, 8, 5.5) + L('M5 6c1-1.5 2.5-1.5 3 0'), world: C(8, 8, 5.5) + L('M2.5 8h11M8 2.5c-3 3-3 8 0 11M8 2.5c3 3 3 8 0 11'), texture: L('M2 2h6v6H2zM8 8h6v6H8z'), scene: L('M2 13l4-7 3 4 2-2 3 5zM11 3a1 1 0 1 0 .01 0'),
  render: L('M2 4h12v8H2zM6 4v8M10 4v8'), output: L('M2 3h12v8H2zM5 14h6M8 11v3'), 'view-layer': L('M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3'), tool: L('M10 2a3.5 3.5 0 0 0-3 5l-5 5 2 2 5-5a3.5 3.5 0 0 0 5-3l-2 2-2-1-1-2z'), particles: F(4, 5, 1.2) + F(9, 3, 1) + F(12, 7, 1.3) + F(6, 10, 1) + F(11, 12, 1.2), physics: C(8, 8, 2) + '<ellipse cx="8" cy="8" rx="6" ry="2.5"/><ellipse cx="8" cy="8" rx="2.5" ry="6"/>', constraint: L('M6 10l4-4M4.5 8.5l-1 1a2.5 2.5 0 0 0 3.5 3.5l1-1M8.5 4l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1'), data: L('M3 2h7l3 3v9H3zM10 2v3h3'),
  // Tools
  'tool-select': L('M3 2l9 6-4 1 3 5-2 1-3-5-3 3z'), 'tool-box': '<rect x="2.5" y="2.5" width="11" height="11" stroke-dasharray="2 2"/>', 'tool-cursor': C(8, 8, 3.5) + L('M8 2v3M8 11v3M2 8h3M11 8h3'), 'tool-move': L('M8 2v12M2 8h12M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2'),
  'tool-rotate': L('M13 8a5 5 0 1 1-1.5-3.5M11.5 2v3h-3'), 'tool-scale': L('M3 13L13 3M9 3h4v4M3 9v4h4'), 'tool-transform': C(8, 8, 3) + L('M8 1v3M8 12v3M1 8h3M12 8h3'), 'tool-extrude': L('M3 11h10v3H3zM8 10V3M8 3L6 5M8 3l2 2'), 'tool-inset': L('M2 2h12v12H2zM5 5h6v6H5zM2 2l3 3M14 2l-3 3M2 14l3-3M14 14l-3-3'), 'tool-bevel': L('M2 14V7l5-5h7'), 'tool-loopcut': L('M2 3h12v10H2zM8 3v10'), 'tool-knife': L('M3 13L12 2l2 2-5 6zM3 13h6'), 'tool-spin': L('M3 13C3 7 7 3 13 3M13 3l-2-1.5M13 3l-2 1.5'), 'tool-annotate': L('M3 13c3-6 5-6 6-3s3 1 4-5'), 'tool-measure': L('M2 11L11 2l3 3-9 9zM5 8l1.5 1.5M7.5 5.5L9 7'),
  'tool-brush': L('M9 9l5-7-7 5zM7 7c-3 0-2 3-5 4 2 2 7 2 7-2'),
  'shade-smooth': C(8, 8, 5.5) + L('M4.5 6.5a4.5 4.5 0 0 1 4-2.5'), 'shade-flat': L('M8 2.5l4.8 2.8v5.4L8 13.5l-4.8-2.8V5.300zM3.200 5.300L8 8l4.800-2.700M8 8v5.500'),
  // Actions
  add: L('M8 3v10M3 8h10'), remove: L('M3 8h10'), close: L('M4 4l8 8M12 4l-8 8'), up: L('M3 10l5-5 5 5'), down: L('M3 6l5 5 5-5'), left: L('M10 3L5 8l5 5'), right: L('M6 3l5 5-5 5'), check: L('M3 8l3 3 7-7'),
  delete: L('M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9'), duplicate: L('M5 5h8v8H5zM3 11V3h8'), join: L('M3 3h4v4H3zM9 9h4v4H9zM7 7l2 2'), keyframe: L('M8 2l5 6-5 6-5-6z'), search: C(7, 7, 4) + L('M10 10l4 4'), save: L('M3 2h8l2 2v10H3zM5 2v4h5V2M5 14V9h6v5'), open: L('M2 5h5l1 1h6l-2 7H2z'), new: L('M4 2h6l3 3v9H4zM10 2v3h3'), undo: L('M5 3L2 6l3 3M2 6h7a4 4 0 0 1 0 8H6'), redo: L('M11 3l3 3-3 3M14 6H7a4 4 0 0 0 0 8h3'),
  import: L('M8 2v8M5 7l3 3 3-3M2 12v2h12v-2'), export: L('M8 10V2M5 5l3-3 3 3M2 12v2h12v-2'), play: L('M5 3l8 5-8 5z'), pause: L('M5 3v10M11 3v10'), stop: L('M4 4h8v8H4z'), 'first': L('M4 3v10M13 3L6 8l7 5z'), 'last': L('M12 3v10M3 3l7 5-7 5z'), prev: L('M11 3L5 8l6 5z'), next: L('M5 3l6 5-6 5z'), eye: L('M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z') + C(8, 8, 2), 'eye-off': L('M2 2l12 12M3 5.5C2 6.800 1.500 8 1.500 8S4 12.500 8 12.500c1.200 0 2.300-.4 3.200-1M7 3.600c.3 0 .6-.1 1-.1 4 0 6.500 4.500 6.500 4.500s-.5 1-1.500 2.100'),
  'camera-render': L('M2 5h8v7H2zM10 7l4-2v7l-4-2') + F(6, 8.500, 1.2), wire: L('M8 2l5 3v6l-5 3-5-3V5zM3 5l10 6M13 5L3 11M8 2v12'), solid: '<path d="M8 2l5 3v6l-5 3-5-3V5z" fill="currentColor" fill-opacity=".35"/>', shaded: C(8, 8, 5.5) + '<path d="M4 5a5.500 5.500 0 0 1 8 0z" fill="currentColor" fill-opacity=".6" stroke="none"/>', rendered: C(8, 8, 3.500) + L('M8 1.500v2M8 12.500v2M1.500 8h2M12.500 8h2M3.400 3.400l1.400 1.400M11.200 11.200l1.400 1.400M3.400 12.600l1.400-1.400M11.200 4.800l1.400-1.400'), xray: L('M8 2l5 3v6l-5 3-5-3V5z') + '<path d="M3 5l5 3 5-3M8 8v6" stroke-dasharray="1.500 1.500"/>', overlay: C(6, 6, 4) + C(10, 10, 4), grid: L('M2 6h12M2 10h12M6 2v12M10 2v12'), snap: L('M4 2v6a4 4 0 0 0 8 0V2H9v6a1 1 0 0 1-2 0V2z'), settings: GEAR, palette: L('M8 2a6 6 0 1 0 0 12c1.500 0 1.500-1 1-2s0-2 1.500-2H13a1 1 0 0 0 1-1 6 6 0 0 0-6-7z') + F(5, 7, 1) + F(8, 5, 1) + F(11, 7, 1),
  minimize: L('M3 12h10'), maximize: L('M3 3h10v10H3z'), restore: L('M5 5h8v8H5zM3 11V3h8'), 'split-v': L('M2 3h12v10H2zM8 3v10'), 'split-h': L('M2 3h12v10H2zM2 8h12'), maximize2: L('M3 7V3h4M13 9v4H9M3 3l4 4M13 13L9 9'), guide: L('M3 2h8a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2zM3 12a2 2 0 0 1 2-2h8'), run: L('M5 3l8 5-8 5z'),
  // Modifier fallback
  clock: C(8, 8, 6) + L('M8 4.500V8l2.500 1.500'), power: L('M8 2v6M4.500 4.500a5 5 0 1 0 7 0'), tutorial: L('M1.500 6L8 3l6.500 3L8 9zM4.500 7.500V11c2 1.500 5 1.500 7 0V7.500M14.500 6v4'), sync: L('M13 6a5 5 0 0 0-9-1.500M3 2.500v2.500h2.500M3 10a5 5 0 0 0 9 1.500M13 13.500V11h-2.500'), samples: L('M2 5h5l1 1.500h6V13H2z') + F(8, 9.500, 1.500), drag: F(6, 4, 1) + F(10, 4, 1) + F(6, 8, 1) + F(10, 8, 1) + F(6, 12, 1) + F(10, 12, 1), moon: L('M13 10A6 6 0 0 1 6 3a6 6 0 1 0 7 7z'), sun: C(8, 8, 3) + L('M8 1.500v2M8 12.500v2M1.500 8h2M12.500 8h2M3.400 3.400l1.400 1.400M11.200 11.200l1.400 1.400M3.400 12.600l1.400-1.400M11.200 4.800l1.400-1.400'),
  hand: L('M5 8V3.500a1 1 0 0 1 2 0V7M7 7V2.500a1 1 0 0 1 2 0V7M9 7V3.500a1 1 0 0 1 2 0V8M11 8V5.500a1 1 0 0 1 2 0V10c0 2.500-1.500 4-4 4H8c-1.500 0-2.500-.8-3.200-2L2.800 9c-.6-1 .6-2 1.500-1.200L5 8.500'),
  'home': L('M2 8l6-5.500L14 8M4 7v6.500h3v-4h2v4h3V7'), 'ed-sequencer': L('M2 4h12v8H2zM5 4v8M9 4v8M2 8h12'), 'ed-clip': L('M2 5h12v8H2zM2 5l2-3h3L5 5M7 5l2-3h3l-2 3'), 'bookmark': L('M4 2h8v12l-4-3-4 3z'), 'ed-assets': L('M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z'), 'proportional': C(8, 8, 6) + F(8, 8, 1.5), 'mod-remesh': L('M2 2h12v12H2zM6 2v12M10 2v12M2 6h12M2 10h12'), 'mod-multires': L('M2 13h12M4 10h8M6 7h4M7.500 4h1'), 'mod-skin': L('M3 13L8 8l5-5M5 13c-2-2-2-4 0-6l3-3c2-2 4-2 6 0'), 'mod-ocean': L('M1 6c2-2 3-2 5 0s3 2 5 0 3-2 4-1M1 11c2-2 3-2 5 0s3 2 5 0 3-2 4-1'), 'mod-subsurf': L('M3 8c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5z'), 'mod-mirror': L('M8 2v12M6 4L2 12h4zM10 4l4 8h-4z'), 'mod-array': L('M2 6h3v4H2zM6.500 6h3v4h-3zM11 6h3v4h-3z'), 'mod-solidify': L('M2 5h12v2H2zM2 9h12v2H2z'), 'mod-bevel': L('M2 14V7l5-5h7'), 'mod-decimate': L('M2 13L8 3l6 10z'), 'mod-boolean': C(6, 8, 4) + C(10, 8, 4), 'mod-screw': L('M4 3h8M3 6h10M4 9h8M3 12h10'), 'mod-weld': L('M3 8h4M9 8h4M8 3l-1 5h2l-1 5'), 'mod-wire': L('M2 2h12v12H2zM2 2l12 12M14 2L2 14'), 'mod-tri': L('M2 13L8 3l6 10zM5 8h6'), 'mod-split': L('M8 2v5l-4 7M8 7l4 7'), 'mod-build': L('M2 13h4v-3h4V7h4V3'), 'mod-mask': L('M3 3h10v10H3z') + F(8, 8, 3), 'mod-displace': L('M2 11c2-6 3-6 5-1s4 2 7-5'), 'mod-wave': L('M2 8c2-5 4-5 6 0s4 5 6 0'), 'mod-smooth': L('M2 11c4 0 2-6 6-6s2 6 6 6'), 'mod-deform': L('M4 2c6 3-4 9 2 12M12 2c6 3-4 9 2 12'), 'mod-cast': C(8, 8, 5.500) + L('M3 3h10v10H3z'), 'mod-shrink': L('M2 2l4 4M14 2l-4 4M2 14l4-4M14 14l-4-4') + C(8, 8, 2), 'mod-lattice': L('M3 3h10v10H3zM3 8h10M8 3v10'), 'mod-armature': L('M4 12l6-8 2 2-8 6z'), 'mod-nodes': L('M2 3h5v4H2zM9 9h5v4H9zM7 5c3 0 0 6 2 6'),
};

/** An SVG icon element; an unknown name draws a dot, never nothing. */
export function icon(name, size = 16) {
  const body = ICONS[name] ?? F(8, 8, 2);
  return svg(`<svg class="ico" viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
}

export const iconNames = () => Object.keys(ICONS);
