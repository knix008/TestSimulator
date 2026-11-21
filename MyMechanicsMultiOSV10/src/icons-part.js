// Icons of the newer part commands (24×24, stroke = currentColor, the same style as icons-cad.js): body
// tools, reference geometry, fillet variants, patterns, curves and sketch transform tools.
export const ICONS_PART = {
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
  curveXYZ: '<path d="M3 19c3-9 7 2 10-6s5-6 8-9"/><circle cx="3" cy="19" r="1.3" fill="currentColor"/><circle cx="8.5" cy="14" r="1.3" fill="currentColor"/><circle cx="14" cy="10" r="1.3" fill="currentColor"/><circle cx="21" cy="4" r="1.3" fill="currentColor"/><path d="M3 22h5M3 22v-3" opacity="0.4"/>',
  // ── sketch tools
  convertEntities: '<path d="M3 15l5-9h13l-5 9z" opacity="0.55"/><path d="M6 20h11" stroke-width="2"/><path d="M11 12v6M9 16l2 2 2-2"/>',
  intersectionCurve: '<path d="M3 6h18v12H3z" opacity="0.4"/><ellipse cx="12" cy="12" rx="6" ry="3"/><path d="M12 2v20" stroke-dasharray="2 1.5"/>',
  moveEntities: '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  copyEntities: '<rect x="3" y="3" width="11" height="11" rx="1"/><rect x="10" y="10" width="11" height="11" rx="1" stroke-dasharray="2 1.5"/>',
  rotateEntities: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M17 2v4h4"/><rect x="9" y="9" width="6" height="6" rx="0.5" transform="rotate(20 12 12)"/>',
  scaleEntities: '<rect x="3" y="12" width="9" height="9" rx="1"/><rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="2 1.6" opacity="0.6"/><path d="M12 12l7-7M15 5h4v4"/>',
};
