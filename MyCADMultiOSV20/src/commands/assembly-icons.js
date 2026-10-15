// Icons of the commands in ./assembly.js. The popup windows import only these, not the commands.
import { registerIcon } from '../icons.js';

const ICONS = {
  jointBall: '<circle cx="12" cy="12" r="5"/><path d="M3 12h4M17 12h4"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 2"/>',
  jointDistance: '<path d="M4 6h16M4 18h16"/><path d="M12 8v8M10 10l2-2 2 2M10 14l2 2 2-2"/>',
  jointParallel: '<path d="M5 19L13 5M11 19L19 5"/>',
  jointPerpendicular: '<path d="M5 19h14M12 19V5"/><path d="M12 15h4v4"/>',
  jointAngle: '<path d="M4 19h16M4 19L16 7"/><path d="M11 19a7 7 0 0 0-2-5"/>',
  asmCreate: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h4v6"/>',
  asmActivate: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><circle cx="18" cy="6" r="3" fill="currentColor"/>',
  asmNewPart: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 9v6M9 12h6"/>',
  asmInsert: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M3 3l6 6M9 4v5H4"/>',
  asmInsertLink: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M9 13a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4"/>',
  asmGrounded: '<path d="M12 3v12"/><path d="M5 15h14M7 18h10M9 21h6"/>',
  asmSolve: '<path d="M20 12a8 8 0 1 1-3-6.3"/><path d="M20 4v5h-5"/>',
  asmExplode: '<rect x="9" y="9" width="6" height="6"/><path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3"/>',
  asmBom: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  asmExportAsmt: '<path d="M4 4h10l6 6v10H4z"/><path d="M8 14h8M12 10v8"/>',
  jointGears: '<circle cx="8" cy="12" r="5" stroke-dasharray="2 1.5"/><circle cx="17" cy="12" r="3.5" stroke-dasharray="2 1.5"/>',
  jointBelt: '<circle cx="7" cy="12" r="4"/><circle cx="18" cy="12" r="3"/><path d="M7 8l11 1M7 16l11-1"/>',
  jointRackPinion: '<circle cx="12" cy="8" r="4" stroke-dasharray="2 1.5"/><path d="M3 16h18M5 16v3M9 16v3M13 16v3M17 16v3"/>',
  jointScrew: '<path d="M8 4h8M9 7l6 2M9 11l6 2M9 15l6 2M12 19v2"/>',
  robotTool: '<path d="M6 18l6-6"/><path d="M12 12l3-8 3 3-3 8z"/>',
  robotHome: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
  robotSetHome: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 15l2 2 3-4"/>',
  robotOrientation: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l5 3"/>',
  robotDefaults: '<path d="M4 7h10M4 17h6"/><circle cx="17" cy="7" r="3"/><circle cx="13" cy="17" r="3"/>',
  robotEdge2Trac: '<path d="M3 18c5-12 13-12 18 0"/><circle cx="7" cy="11" r="1.5" fill="currentColor"/><circle cx="12" cy="8" r="1.5" fill="currentColor"/><circle cx="17" cy="11" r="1.5" fill="currentColor"/>',
  robotCompound: '<path d="M3 16c3-6 5-6 8 0"/><path d="M13 16c3-6 5-6 8 0"/><path d="M11 16h2"/>',
  robotDressUp: '<path d="M3 17c5-10 13-10 18 0"/><path d="M3 13c5-10 13-10 18 0" stroke-dasharray="2 2"/>',
  robotRun: '<path d="M3 17c5-10 13-10 18 0"/><path d="M10 8l5 3-5 3z" fill="currentColor"/>',
};
for (const [name, inner] of Object.entries(ICONS)) registerIcon(name, inner);
