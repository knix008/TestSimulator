// Icons of the later assembly, drawing, evaluate and simulation tools (24×24, stroke = currentColor):
// component patterns and mirror, smart mates, moving with collision detection, drawing sheets and the new
// view kinds and tables, curvature / zebra / thickness displays, buckling and fatigue studies.
export const ICONS_ASM = {
  compLinPattern: '<path d="M3 12l3-1.7 3 1.7v3.4L6 17.1l-3-1.7z"/><path d="M10 12l3-1.7 3 1.7v3.4l-3 1.7-3-1.7z" opacity="0.65"/><path d="M17 12l3-1.7 2 1.2v3.4l-2 1.2-3-1.7z" opacity="0.4"/><path d="M4 6h15M16 3.5L19 6l-3 2.5"/>',
  compCirPattern: '<circle cx="12" cy="12" r="7.5" stroke-dasharray="2 2"/><path d="M12 2.5l2.2 1.3v2.5L12 7.6 9.8 6.3V3.8z"/><path d="M19.5 10l2 1.2v2.4l-2 1.2-2-1.2v-2.4z" opacity="0.6"/><path d="M12 16.4l2.2 1.3v2.5L12 21.5l-2.2-1.3v-2.5z" opacity="0.4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  compMirror: '<path d="M12 2v20" stroke-dasharray="2.2 1.8"/><path d="M8 7L3 9.5v6L8 18l3-1.5v-7z"/><path d="M16 7l5 2.5v6L16 18l-3-1.5v-7z" opacity="0.55"/>',
  smartMate: '<path d="M4 15l4-2.3 4 2.3v4.5L8 21.8l-4-2.3z"/><path d="M12 4l4-2.3L20 4v4.5l-4 2.3-4-2.3z" opacity="0.7"/><path d="M15.5 13.5l-3.5 2" stroke-dasharray="1.6 1.4"/><path d="M17 15.5l1.2-3.6 1.2 3.6 3.6 1.2-3.6 1.2-1.2 3.6-1.2-3.6-3.6-1.2z" fill="currentColor" stroke="none"/>',
  moveComponent: '<path d="M8 10l4-2.3 4 2.3v4.6l-4 2.3-4-2.3z"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><path d="M10.5 3.5L12 2l1.5 1.5M10.5 20.5L12 22l1.5-1.5M3.5 10.5L2 12l1.5 1.5M20.5 10.5L22 12l-1.5 1.5"/>',
  collision: '<rect x="3" y="7" width="8" height="10" rx="1"/><rect x="13" y="7" width="8" height="10" rx="1" opacity="0.6"/><path d="M12 4l-1 3 2 1-1 3M12 13l-1 3 2 1-1 3" stroke-width="2"/>',
  sheetAdd: '<rect x="3" y="5" width="14" height="14" rx="1"/><path d="M6 5V3h14v14h-3" opacity="0.6"/><path d="M10 9v6M7 12h6"/>',
  sheetRename: '<rect x="3" y="5" width="14" height="14" rx="1"/><path d="M6 15h5"/><path d="M14 13l6-6 2 2-6 6-2.6.6z"/>',
  sheetDelete: '<rect x="3" y="5" width="14" height="14" rx="1"/><path d="M7 9l6 6M13 9l-6 6"/><path d="M6 5V3h14v14h-3" opacity="0.6"/>',
  brokenOut: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M8 9c2-1.5 4 1 6-.5s2 1 2 3-1.5 2-1 4-3 1.5-5 1-3-1-3-3 1-2 1-4.5z"/><path d="M9 13l3-3M10 16l5-5" opacity="0.7"/>',
  breakView: '<path d="M2 8h7M2 16h7M15 8h7M15 16h7"/><path d="M9 6l-1.5 3 3 3-3 3 1.5 3M15 6l-1.5 3 3 3-3 3 1.5 3"/>',
  cropView: '<path d="M6 2v16h16"/><path d="M2 6h16v16"/><rect x="9" y="9" width="6" height="6" opacity="0.5"/>',
  holeTable: '<rect x="2" y="3" width="20" height="18" rx="1"/><path d="M2 8h20M8 3v18M15 3v18"/><circle cx="5" cy="13" r="1.6"/><circle cx="5" cy="17.5" r="1.1"/>',
  revisionTable: '<rect x="2" y="3" width="20" height="18" rx="1"/><path d="M2 8h20M2 13h20M7 3v18"/><path d="M10 16.5l2.5 2.5 5-5" stroke-width="2"/>',
  curvature: '<path d="M3 19c2-9 7-14 18-15"/><circle cx="12" cy="13" r="4" stroke-dasharray="1.6 1.4"/><path d="M12 13l2.8-2.8"/><circle cx="12" cy="13" r="0.9" fill="currentColor"/>',
  zebra: '<path d="M4 4c5 2 11 2 16 0v16c-5 2-11 2-16 0z"/><path d="M4 9c5 2 11 2 16 0M4 14c5 2 11 2 16 0" stroke-width="2.6"/>',
  thickness: '<path d="M3 6h18M3 18h18"/><path d="M6 9v6M18 9v6"/><path d="M6 9l-1.5 1.8M6 9l1.5 1.8M6 15l-1.5-1.8M6 15l1.5-1.8"/><rect x="10" y="9" width="4" height="6" fill="currentColor" opacity="0.4" stroke="none"/>',
  buckling: '<path d="M8 2h8M8 22h8"/><path d="M12 2c4 5 4 15 0 20" stroke-width="2"/><path d="M12 2v20" stroke-dasharray="1.6 1.6" opacity="0.5"/><path d="M19 5v4M17.5 7.5L19 9l1.5-1.5"/>',
  fatigue: '<path d="M2 5v15h20"/><path d="M4 7c4 1 6 4 9 7s5 3 8 3" stroke-width="2"/><path d="M5 11h2M5 15h2" opacity="0.5"/>',
};
