// Icons of the added surface, sheet metal and weldment commands (24×24, stroke = currentColor), in the
// style of icons-cad.js: ruled / delete / replace / extend surface, miter flange, lofted bend, tab, closed
// corner, corner relief, the forming tools, end cap, gusset, weld bead and trim / extend.
export const ICONS_SHEET = {
  ruledSurface: '<path d="M4 16h11l5-5" stroke-width="2"/><path d="M4 16V8M9 16V8M14 16V8M19 12V4" opacity="0.6"/><path d="M4 8h10l5-4" stroke-dasharray="2 1.5"/>',
  deleteFace: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/><path d="M14 13l5 3M19 13l-5 3" stroke-width="1.8"/>',
  replaceFace: '<path d="M4 10l8-4 8 4v8l-8 4-8-4z" opacity="0.7"/><path d="M3 7c3-3 6 1 9-2s6 1 9-2" stroke-width="1.9"/><path d="M12 9v4M10.5 11.5L12 13l1.5-1.5"/>',
  extendSurface: '<path d="M4 18c3-4 6-4 9-8" stroke-width="2"/><path d="M13 10c2-3 4-4 7-5" stroke-dasharray="2 1.6"/><path d="M4 21c3-4 6-4 9-8" opacity="0.5"/><path d="M17 3l3 2-2 3"/>',
  miterFlange: '<path d="M3 20h12l6-6" /><path d="M3 20V9h12v11M15 9l6-6v11"/><path d="M15 9l-1 1" stroke-width="2.2"/>',
  loftedBend: '<rect x="4" y="3" width="16" height="5" rx="0.5"/><ellipse cx="12" cy="19" rx="5" ry="2"/><path d="M4 8l3 11M20 8l-3 11M12 8v9" opacity="0.7"/>',
  sheetTab: '<path d="M3 15l9-5 9 5-9 5z"/><path d="M14 11.5l5-2.8 3 1.7-5 2.8z" fill="currentColor" opacity="0.4"/><path d="M3 15v2l9 5 9-5v-2"/>',
  closedCorner: '<path d="M4 20V8l6-5h10v12l-6 5z"/><path d="M4 8h10v12M14 8l6-5" /><path d="M10 3v5" stroke-width="2"/>',
  cornerRelief: '<path d="M3 21h18V9"/><path d="M3 21V9h12" opacity="0.7"/><rect x="15" y="3" width="6" height="6" stroke-dasharray="2 1.4"/><path d="M15 9v12" opacity="0.5"/>',
  formTool: '<path d="M2 17h5c1-5 9-5 10 0h5"/><path d="M2 20h5c1-5 9-5 10 0h5" opacity="0.5"/><path d="M12 3v5M9.5 6L12 8.5 14.5 6"/>',
  formDimple: '<path d="M2 16h5a5 5 0 0 1 10 0h5"/><path d="M2 19h5a5 5 0 0 1 10 0h5" opacity="0.5"/>',
  formEmboss: '<path d="M2 16h5l2-6h6l2 6h5"/><path d="M2 19h5l2-6h6l2 6h5" opacity="0.5"/>',
  formLouver: '<path d="M2 17h7c2 0 6-2 8-8"/><path d="M17 9v8h5" /><path d="M2 20h20" opacity="0.5"/><path d="M9 17h8" stroke-dasharray="1.6 1.4"/>',
  formLance: '<path d="M2 17h4l3-6h6l3 6h4"/><path d="M2 20h20" opacity="0.5"/><path d="M9 11v6M15 11v6" stroke-dasharray="1.6 1.4"/>',
  endCap: '<rect x="3" y="8" width="11" height="8"/><path d="M14 6h4v12h-4z" fill="currentColor" opacity="0.35"/><path d="M14 6h4v12h-4z"/><path d="M6 11h5v2H6" opacity="0.5"/>',
  gusset: '<path d="M4 3v18h17"/><path d="M7 3v15h14" opacity="0.6"/><path d="M7 8v10h10z" fill="currentColor" opacity="0.35"/><path d="M7 8v10h10z"/>',
  weldBead: '<path d="M3 3v18h18"/><path d="M3 13c2 0 3 1 4 3s2 3 2 5" stroke-width="2.2"/><path d="M6 20l1-1M4.5 17.5l1-1M8 19l-1-1" opacity="0.7"/>',
  trimExtend: '<path d="M2 10h12M2 14h12" /><path d="M14 10h6M14 14h6" stroke-dasharray="1.8 1.4"/><path d="M16 4v16" stroke-width="2.2"/>',
  // ── convert / insert bends, rip, unfold / fold, cross break, welded corner, tab and slot
  convertSheet: '<path d="M4 8l7-4 9 4v9l-7 4-9-4z" opacity="0.45"/><path d="M4 8v9l9 4" stroke-width="2"/><path d="M4 8l9 4 7-4" stroke-dasharray="2 1.5"/><path d="M15 15h6M18 12l3 3-3 3"/>',
  insertBends: '<path d="M3 20h9a4 4 0 0 0 4-4V4" stroke-width="2"/><path d="M6 20h6a1 1 0 0 0 1-1V4" opacity="0.5"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/><path d="M19 4v6M16 7h6"/>',
  rip: '<path d="M3 21V7h7M14 7h7v14" stroke-width="2"/><path d="M10 7l2-4 2 4" stroke-dasharray="1.6 1.3"/><path d="M12 9v12" stroke-dasharray="2 1.6" opacity="0.7"/>',
  unfold: '<path d="M3 18h9a3 3 0 0 0 3-3V5" opacity="0.5" stroke-dasharray="2 1.5"/><path d="M3 21h18" stroke-width="2"/><path d="M17 6a7 7 0 0 1 4 7"/><path d="M21 9v4h-4"/>',
  fold: '<path d="M3 21h9a3 3 0 0 0 3-3V5" stroke-width="2"/><path d="M15 21h6" opacity="0.5" stroke-dasharray="2 1.5"/><path d="M21 13a7 7 0 0 0-4-7"/><path d="M17 10V6h4"/>',
  crossBreak: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 5l18 14M21 5L3 19" stroke-dasharray="2.2 1.6"/>',
  weldedCorner: '<path d="M3 21V9h12M15 9v12" opacity="0.6"/><path d="M15 9l6-6v12l-6 6" /><path d="M15 9v12" stroke-width="2.6"/><path d="M13 12l4 1M13 15l4 1M13 18l4 1" opacity="0.7"/>',
  tabSlot: '<path d="M2 16h20v4H2z"/><path d="M8 4h8v12" /><path d="M8 4v12"/><path d="M10 16v3h4v-3" stroke-width="2"/>',
};
