// Type names, defaults, base names and icons of the added surface, sheet metal and weldment features (no
// imports: features.js, the tree and the commands read them while the modules load). Built in sheet-more.js.
export const SHEET_MORE_TYPES = [
  'ruledSurface', 'deleteFace', 'replaceFace', 'extendSurface',
  'miterFlange', 'loftedBend', 'tab', 'closedCorner', 'cornerRelief', 'formTool',
  'endCap', 'gusset', 'weldBead', 'trimExtend',
];

export const FORM_TOOLS = ['dimple', 'emboss', 'louver', 'lance'];

/** Icons of the features (tree, PropertyManager header, commands). */
export const SHEET_MORE_ICONS = {
  ruledSurface: 'ruledSurface', deleteFace: 'deleteFace', replaceFace: 'replaceFace', extendSurface: 'extendSurface',
  miterFlange: 'miterFlange', loftedBend: 'loftedBend', tab: 'sheetTab', closedCorner: 'closedCorner', cornerRelief: 'cornerRelief', formTool: 'formTool',
  endCap: 'endCap', gusset: 'gusset', weldBead: 'weldBead', trimExtend: 'trimExtend',
};


export const SHEET_MORE_DEFAULTS = {
  ruledSurface: () => ({ edges: [], mode: 'tangent', distance: 10, axis: 'z', alternate: false, reverse: false }),
  deleteFace: () => ({ faces: [], mode: 'patch' }),
  replaceFace: () => ({ faces: [], surface: null }),
  extendSurface: () => ({ surface: null, distance: 5, kind: 'same' }),
  miterFlange: () => ({ edges: [], length: 20, angle: 90, radius: null, gap: 0, flip: false }),
  loftedBend: () => ({ sketches: [], thickness: 2, radius: 2, kFactor: 0.44, segments: 64 }),
  tab: () => ({ sketch: null }),
  closedCorner: () => ({ flanges: [], flangeA: null, flangeB: null, gap: 0 }),
  cornerRelief: () => ({ flanges: [], flangeA: null, flangeB: null, kind: 'rect', size: 0 }),
  formTool: () => ({ face: null, tool: 'dimple', dx: 0, dy: 0, angle: 0, size: 20, width: 8, height: 4, down: false }),
  endCap: () => ({ face: null, thickness: 5, inset: 2 }),
  gusset: () => ({ faces: [], d1: 30, d2: 30, thickness: 5, chamfer: 0, offset: 0 }),
  weldBead: () => ({ edges: [], size: 5, cosmetic: false }),
  trimExtend: () => ({ member: null, plane: { kind: 'std', name: 'right' } }),
};

export const SHEET_MORE_NAMES = {
  ruledSurface: 'Ruled Surface', deleteFace: 'Delete Face', replaceFace: 'Replace Face', extendSurface: 'Surface-Extend',
  miterFlange: 'Miter Flange', loftedBend: 'Lofted-Bend', tab: 'Tab', closedCorner: 'Closed Corner', cornerRelief: 'Corner Relief', formTool: 'Form Tool',
  endCap: 'End Cap', gusset: 'Gusset', weldBead: 'Weld Bead', trimExtend: 'Trim/Extend',
};
