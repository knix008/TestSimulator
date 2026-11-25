// Icons of the newer part commands (24×24, stroke = currentColor, the same style as icons-cad.js): body
// tools, reference geometry, fillet variants, patterns, curves and sketch transform tools.
export const ICONS_PART = {
  boundingBox: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z" stroke-dasharray="2.4 1.6"/><path d="M4 8l8 4 8-4M12 12v8" stroke-dasharray="2.4 1.6" opacity="0.7"/><path d="M8 10l4-2 4 2v4l-4 2-4-2z" fill="currentColor" opacity="0.35" stroke="none"/>',
  // ── more surfaces
  surfaceSweep: '<path d="M3 17c3-6 6-6 9-3s6 3 9-3" opacity="0.6"/><path d="M5 20c3-6 6-6 9-3s6 3 7-1"/><path d="M3 17l2 3M12 14l2 3M21 11v5" opacity="0.5"/>',
  cutWithSurface: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M2 12c4-4 8 2 12-2s6-2 8-4" stroke-width="2"/>',
  deleteHole: '<path d="M3 7l9-3 9 3v10l-9 3-9-3z"/><circle cx="12" cy="12" r="3" stroke-dasharray="2 1.5"/><path d="M10 10l4 4M14 10l-4 4"/>',
  untrimSurface: '<path d="M3 7l9-3 9 3v10l-9 3-9-3z" stroke-dasharray="2 1.6"/><path d="M7 9l5-2 5 2v6l-5 2-5-2z"/>',
  midSurface: '<path d="M3 6h18M3 18h18"/><path d="M3 12h18" stroke-dasharray="3 1.6" stroke-width="2"/>',
  radiateSurface: '<rect x="8" y="8" width="8" height="8" rx="0.5"/><path d="M8 8L3 3M16 8l5-5M16 16l5 5M8 16l-5 5M3 3h18v18H3z" opacity="0.55"/>',
  flattenSurface: '<path d="M3 9c3-5 6-5 9 0s6 5 9 0" opacity="0.6"/><path d="M3 16h18l-3 4H6z"/><path d="M12 10v4M10 12.5l2 2 2-2"/>',
  // ── fastening features
  mountingBoss: '<path d="M2 20h20"/><path d="M7 20l1-11h8l1 11"/><ellipse cx="12" cy="9" rx="4" ry="1.4"/><path d="M12 9v8" stroke-dasharray="2 1.5" opacity="0.6"/><path d="M3 20l4-7M21 20l-4-7" opacity="0.6"/>',
  snapHook: '<path d="M3 21h18"/><path d="M9 21V6h2v15"/><path d="M11 6l4 3v3h-4"/>',
  snapHookGroove: '<path d="M3 8h6v4h6V8h6v10H3z"/><path d="M9 12l-1 3h8l-1-3" stroke-dasharray="2 1.4" opacity="0.6"/>',
  vent: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 8v8M11 8v8M15 8v8M19 8v8" stroke-width="2.2" opacity="0.7"/>',
  lipGroove: '<path d="M3 20V9h5v-4h3v4h2v11"/><path d="M14 20V9h3l0 4h4v7" opacity="0.7"/>',
  // ── bodies
  combineBodies: '<rect x="3" y="7" width="10" height="10" rx="1"/><circle cx="15" cy="12" r="6" opacity="0.6"/><path d="M11 12h4M13 10v4"/>',
  deleteBody: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" opacity="0.55"/><path d="M8 9l8 8M16 9l-8 8" stroke-width="2"/>',
  indent: '<path d="M2 10h6c0 5 8 5 8 0h6"/><path d="M2 13h5c1 6 9 6 10 0h5" opacity="0.6"/><circle cx="12" cy="6" r="3.5"/>',
  flex: '<path d="M3 18c4 0 6-2 8-6s4-8 10-8"/><path d="M3 21c5 0 7-2 9-6s4-7 9-7" opacity="0.6"/><path d="M3 18v3M21 4v4"/>',
  deform: '<path d="M3 17h5c1-7 7-7 8 0h5"/><path d="M3 20h18" opacity="0.5"/><path d="M12 3v6M10 7l2 2 2-2"/>',
  // ── reference geometry
  refPoint: '<path d="M12 4v16M4 12h16" opacity="0.4"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M7 7l10 10M17 7L7 17" opacity="0.25"/>',
  coordSys: '<path d="M6 18h14M6 18V4M6 18l-3.5 3"/><path d="M18 16l2 2-2 2M4 6l2-2 2 2"/><circle cx="6" cy="18" r="1.6" fill="currentColor"/><path d="M10 9h4v4" opacity="0.5"/>',
  // ── fillets
  variableFillet: '<path d="M4 20V10a7 7 0 0 1 7-7h9"/><path d="M8 20v-8a3 3 0 0 1 3-3h1" opacity="0.6"/><path d="M12 9c3 0 5 1 8 4" stroke-dasharray="2 1.5"/><circle cx="20" cy="13" r="1.3" fill="currentColor"/><circle cx="4" cy="10" r="1.3" fill="currentColor"/>',
  faceFillet: '<path d="M3 20V8h3"/><path d="M21 4H9v3"/><path d="M6 8a3 3 0 0 1 3-1" stroke-width="2.6"/><path d="M3 14h4M14 4v4" opacity="0.4"/>',
  fullRoundFillet: '<path d="M7 21V11a5 5 0 0 1 10 0v10"/><path d="M5 21h14" opacity="0.5"/><path d="M7 11a5 5 0 0 1 10 0" stroke-width="2.6"/>',
  // ── patterns
  curvePattern: '<path d="M3 19c4-12 14-12 18-2" stroke-dasharray="2 1.6"/><rect x="2" y="15" width="4" height="4" rx="1"/><rect x="8.5" y="8" width="4" height="4" rx="1" opacity="0.7"/><rect x="17" y="12" width="4" height="4" rx="1" opacity="0.45"/>',
  sketchDrivenPattern: '<circle cx="5" cy="6" r="2"/><circle cx="18" cy="5" r="2" opacity="0.7"/><circle cx="9" cy="17" r="2" opacity="0.55"/><circle cx="19" cy="18" r="2" opacity="0.4"/><path d="M5 6l13-1M5 6l4 11M9 17l10 1" stroke-dasharray="1.5 1.5" opacity="0.5"/>',
  tablePattern: '<rect x="2" y="3" width="10" height="13" rx="1"/><path d="M2 7h10M2 11h10M7 3v13"/><rect x="15" y="6" width="3" height="3" rx="0.6"/><rect x="18" y="13" width="3" height="3" rx="0.6" opacity="0.7"/><rect x="14" y="18" width="3" height="3" rx="0.6" opacity="0.5"/>',
  fillPattern: '<path d="M3 5l9-3 9 3v14l-9 3-9-3z"/><circle cx="8" cy="9" r="1.4"/><circle cx="12" cy="9" r="1.4"/><circle cx="16" cy="9" r="1.4"/><circle cx="10" cy="13" r="1.4"/><circle cx="14" cy="13" r="1.4"/><circle cx="8" cy="17" r="1.4"/><circle cx="12" cy="17" r="1.4"/><circle cx="16" cy="17" r="1.4"/>',
  variablePattern: '<rect x="2" y="15" width="4" height="4" rx="0.8"/><rect x="8" y="12" width="4" height="7" rx="0.8" opacity="0.75"/><rect x="14" y="8" width="4" height="11" rx="0.8" opacity="0.55"/><path d="M20 19V4M18 6l2-2 2 2"/>',
  // ── curves
  projectedCurve: '<path d="M4 6c3-3 6 3 9 0s5-3 7 0" stroke-dasharray="2 1.5"/><path d="M3 17l5-3h13l-5 3z"/><path d="M5 15c3-2 6 1 9-1s4-1 5 0" stroke-width="2"/><path d="M8 7v6M16 6v7" opacity="0.4"/>',
  splitLine: '<path d="M3 9l9-5 9 5-9 5z"/><path d="M3 9v6l9 5 9-5V9"/><path d="M8 7.5l9 4.5" stroke-width="2" stroke-dasharray="2.5 1.2"/>',
  compositeCurve: '<path d="M3 18l5-8"/><path d="M8 10c3-5 6-5 8-1" opacity="0.75"/><path d="M16 9l5 4" opacity="0.55"/><circle cx="8" cy="10" r="1.4" fill="currentColor"/><circle cx="16" cy="9" r="1.4" fill="currentColor"/>',
  surfaceSpline: '<path d="M3 16l6-9h12l-6 9z" opacity="0.6"/><path d="M6 13c3-3 5 1 8-2s3-2 4-2"/><circle cx="6" cy="13" r="1.2"/><circle cx="18" cy="9" r="1.2"/>',
  curveXYZ: '<path d="M3 19c3-9 7 2 10-6s5-6 8-9"/><circle cx="3" cy="19" r="1.3" fill="currentColor"/><circle cx="8.5" cy="14" r="1.3" fill="currentColor"/><circle cx="14" cy="10" r="1.3" fill="currentColor"/><circle cx="21" cy="4" r="1.3" fill="currentColor"/><path d="M3 22h5M3 22v-3" opacity="0.4"/>',
  // ── sketch tools
  convertEntities: '<path d="M3 15l5-9h13l-5 9z" opacity="0.55"/><path d="M6 20h11" stroke-width="2"/><path d="M11 12v6M9 16l2 2 2-2"/>',
  intersectionCurve: '<path d="M3 6h18v12H3z" opacity="0.4"/><ellipse cx="12" cy="12" rx="6" ry="3"/><path d="M12 2v20" stroke-dasharray="2 1.5"/>',
  moveEntities: '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  copyEntities: '<rect x="3" y="3" width="11" height="11" rx="1"/><rect x="10" y="10" width="11" height="11" rx="1" stroke-dasharray="2 1.5"/>',
  rotateEntities: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M17 2v4h4"/><rect x="9" y="9" width="6" height="6" rx="0.5" transform="rotate(20 12 12)"/>',
  scaleEntities: '<rect x="3" y="12" width="9" height="9" rx="1"/><rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="2 1.6" opacity="0.6"/><path d="M12 12l7-7M15 5h4v4"/>',
  // ── drawings: revision cloud, datum target, area hatch, bend table, aligned section, alternate position, flat pattern view
  revisionCloud: '<path d="M5 9a2.5 2.5 0 0 1 4-2 2.5 2.5 0 0 1 4.5 0 2.5 2.5 0 0 1 4.5 1.5 2.5 2.5 0 0 1 1 4.5 2.5 2.5 0 0 1-2 4 2.5 2.5 0 0 1-4.5 1 2.5 2.5 0 0 1-4.5 0A2.5 2.5 0 0 1 4 15.5 2.5 2.5 0 0 1 5 9z"/><path d="M10 10l4 4M14 10l-4 4" opacity="0.6"/>',
  datumTarget: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11"/><path d="M12 12l5 5"/><path d="M15.5 15.5l5 5M20.5 15.5l-5 5" stroke-width="1.8"/>',
  areaHatch: '<rect x="3" y="4" width="18" height="16" rx="1" stroke-dasharray="2.4 1.6"/><path d="M3 12l8-8M3 19l15-15M9 20l12-12M16 20l5-5"/>',
  bendTable: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16" opacity="0.7"/><path d="M5 18c2 0 2-3 3-3" stroke-width="1.6"/>',
  alignedSection: '<path d="M12 3v9l7 7" stroke-dasharray="4 1.4 1.2 1.4" stroke-width="1.8"/><path d="M9 3h6M16.5 21.5l4-4"/><path d="M5 6l3-3M5 6l3 3" opacity="0.7"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  alternatePosition: '<rect x="3" y="12" width="9" height="7" rx="1"/><rect x="11" y="4" width="9" height="7" rx="1" stroke-dasharray="4 1.2 1.2 1.2"/><path d="M8 11l4-3" opacity="0.7"/>',
  flatPatternView: '<path d="M3 14h18v4H3z"/><path d="M8 14v4M16 14v4" stroke-dasharray="1.6 1.2"/><path d="M6 10V5h12v5" opacity="0.55"/><path d="M12 6v5M10 9l2 2 2-2"/>',
  // ── advanced hole, intersect, mate reference, save bodies
  moveFace: '<path d="M4 9l8-4 8 4v8l-8 4-8-4z" opacity="0.45"/><path d="M12 13V3M9 6l3-3 3 3"/><path d="M4 9l8 4 8-4"/>',
  advancedHole: '<path d="M4 4h16" /><path d="M7 4v4h3v9l2 3 2-3V8h3V4" /><path d="M10 12h4M10 15h4" opacity="0.6"/>',
  intersectRegions: '<circle cx="9" cy="10" r="6"/><circle cx="15" cy="14" r="6"/><path d="M12.2 15.2a6 6 0 0 0 2.6-7 6 6 0 0 0-5.6 1.6 6 6 0 0 0 3 5.4z" fill="currentColor" opacity="0.4" stroke="none"/>',
  connectionPoint: '<rect x="3" y="12" width="12" height="8" rx="1"/><circle cx="15" cy="8" r="2.2" fill="currentColor"/><path d="M15 8l6-5M18 3h3v3"/>',
  mateReference: '<rect x="3" y="12" width="12" height="8" rx="1"/><path d="M9 12V4M6 7l3-3 3 3"/><path d="M15 16h6M18 13v6" stroke-dasharray="2 1.2"/>',
  saveBodies: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><path d="M7 11v4h5M17 11v4h-5M12 15v6M9 18l3 3 3-3"/>',
};
