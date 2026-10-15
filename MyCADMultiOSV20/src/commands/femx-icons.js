// Icons of the commands in ./femx.js. The popup windows import only these, not the commands.
import { registerIcon } from '../icons.js';

const C = '<circle cx="12" cy="12" r="8"/>';

const ICONS = {
  femxBearing: `${C}<circle cx="12" cy="12" r="4"/>`, femxHeatSource: '<path d="M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-4 2-5 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  femxCentrif: `${C}<path d="M12 12l6-6M15 6h3v3"/>`, femxContact: '<rect x="3" y="4" width="8" height="16"/><rect x="13" y="4" width="8" height="16"/>',
  femxCurrent: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', femxDisplacement: '<rect x="3" y="8" width="10" height="10"/><path d="M13 13h8M18 10l3 3-3 3"/>',
  femxCharge: '<circle cx="12" cy="12" r="7"/><path d="M12 8v8M8 12h8"/>', femxPotential: '<path d="M4 20h16M6 20V8M18 20V4"/><path d="M6 8h12" stroke-dasharray="2 2"/>',
  femxFlowVelocity: '<path d="M3 8h14M3 12h18M3 16h14"/><path d="M18 9l3 3-3 3"/>', femxFluidBoundary: '<path d="M3 12h18"/><path d="M3 6c3-2 6 2 9 0s6-2 9 0"/>',
  femxGear: '<circle cx="12" cy="12" r="5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/>',
  femxHeatflux: '<path d="M4 20h16"/><path d="M8 18V6M12 18V4M16 18V6"/><path d="M6 8l2-2 2 2M10 6l2-2 2 2M14 8l2-2 2 2"/>',
  femxInitialFlow: '<path d="M3 12h15"/><path d="M15 9l3 3-3 3"/><circle cx="5" cy="12" r="2"/>', femxInitialPressure: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  femxInitialTemperature: '<path d="M10 4v10a4 4 0 1 0 4 0V4a2 2 0 0 0-4 0z"/>', femxMagnetization: '<path d="M6 4v10a6 6 0 0 0 12 0V4h-4v10a2 2 0 0 1-4 0V4z"/>',
  femxPlaneRotation: '<path d="M3 16l9 5 9-5-9-5z"/><path d="M12 11V3"/>', femxPressure: '<rect x="3" y="14" width="18" height="6"/><path d="M7 4v8M12 4v8M17 4v8M5 10l2 2 2-2M10 10l2 2 2-2M15 10l2 2 2-2"/>',
  femxPulley: `${C}<circle cx="12" cy="12" r="2"/><path d="M4 12l-2 8M20 12l2 8"/>`, femxRigid: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16M20 4L4 20"/>',
  femxSectionPrint: '<rect x="4" y="6" width="16" height="12"/><path d="M12 3v18" stroke-dasharray="2 2"/>', femxSpring: '<path d="M12 3v3l-5 2 10 3-10 3 10 3-5 2v3"/>',
  femxTemperature: '<path d="M10 4v10a4 4 0 1 0 4 0V4a2 2 0 0 0-4 0z"/><path d="M12 9v6"/>', femxTie: '<rect x="3" y="4" width="8" height="16"/><rect x="13" y="4" width="8" height="16"/><path d="M11 12h2"/>',
  femxTransform: '<path d="M5 19V5M5 19h14"/><path d="M5 19l10-10M12 9h3v3"/>', femxEps0: '<text x="4" y="17" font-size="12" stroke="none" fill="currentColor">ε₀</text>',
  femxEquation: '<path d="M4 7h16M4 12h16M4 17h10"/>', femxMaterial: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5"/>',
  femxFluid: '<path d="M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/>', femxNonlinear: '<path d="M4 20c4-12 8-16 16-16"/><path d="M4 20h16M4 20V4"/>',
  femxReinforced: '<rect x="3" y="6" width="18" height="12"/><path d="M6 10h12M6 14h12"/><circle cx="8" cy="10" r="1"/><circle cx="16" cy="14" r="1"/>',
  femxMesh: '<path d="M4 4h16v16H4z"/><path d="M4 12h16M12 4v16M4 4l16 16"/>', femxMeshRegion: '<path d="M4 4h16v16H4z"/><path d="M12 12h8M16 12v8M12 16h8M16 12l4 4"/>',
  femxLayer: '<path d="M4 18h16M4 15h16M4 12h16"/><path d="M4 9c4-4 12-4 16 0"/>', femxMeshGroup: '<path d="M4 4h16v16H4z"/><path d="M4 12h8V4"/>', femxMeshClear: '<path d="M4 4h16v16H4z"/><path d="M4 4l16 16M20 4L4 20"/>',
  femxMeshInfo: '<path d="M4 4h16v16H4z"/><path d="M12 10v6M12 7v.01"/>', femxMesh2Mesh: '<path d="M4 6h7v12H4z"/><path d="M13 6l7 6-7 6z"/>',
  femxNodesSet: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M3 3h18v18H3z" stroke-dasharray="2 2"/>',
  femxElementsSet: '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3z"/><path d="M13 13h8v8h-8z" stroke-dasharray="2 2"/>', femxErase: '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3z"/><path d="M14 14l6 6M20 14l-6 6"/>',
  femxFluid1D: '<path d="M3 12h18"/><path d="M3 9h18M3 15h18" opacity=".5"/>', femxRotation1D: '<path d="M3 12h18"/><path d="M12 7a5 5 0 1 1-5 5"/>',
  femxSolver: '<path d="M4 4h16v16H4z"/><path d="M8 15l3-3-3-3M12 15h4"/>', femxSolverControl: '<circle cx="12" cy="12" r="8"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>',
  femxPipeline: '<path d="M3 6h6v4H3zM15 14h6v4h-6z"/><path d="M9 8h3v8h3"/>', femxWarp: '<path d="M3 16c6 0 6-8 18-8"/><path d="M3 16h18" stroke-dasharray="2 2"/>',
  femxClipScalar: '<path d="M3 20l6-8 4 4 8-12"/><path d="M3 10h18" stroke-dasharray="2 2"/>', femxClipRegion: '<circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/><path d="M5 12h14"/>',
  femxCut: '<path d="M4 6h16v12H4z"/><path d="M2 12h20" stroke-width="2.5"/>', femxContours: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/>',
  femxGlyph: '<path d="M4 18l6-6M14 18l6-6M4 8l6-6"/><path d="M8 12h2v2M18 12h2v2M8 2h2v2"/>', femxLine: '<path d="M4 20L20 4"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="8" r="1.5"/>',
  femxPoint: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>', femxLinearized: '<path d="M4 4v16"/><path d="M4 6l14 2M4 12h10M4 18l6-2"/>',
  femxCalculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2M16 12v4"/>', femxBranch: '<path d="M6 3v18M6 9c6 0 12 0 12 6"/>',
  femxFunctions: '<path d="M8 20c2 0 2-16 4-16s2 16 4 16"/><path d="M6 12h12"/>', femxApply: '<path d="M4 12l5 5L20 6"/>',
  femxHistogram: '<path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/>', femxLineplot: '<path d="M3 20V4M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/>', femxTable: '<rect x="3" y="4" width="18" height="16"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  femxPurge: '<path d="M6 5h12M9 5V3h6v2M7 5l1 15h8l1-15"/>', femxClipAdd: '<path d="M3 12h18"/><path d="M6 12V5h12v7" stroke-dasharray="2 2"/>', femxClipRemove: '<path d="M3 12h18"/><path d="M8 5l8 14M16 5L8 19"/>',
  femxExamples: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};
for (const [name, inner] of Object.entries(ICONS)) registerIcon(name, inner);
