// Icons of the commands in ./openscad.js. The popup windows import only these, not the commands.
import { registerIcon } from '../icons.js';

const ICONS = {
  scadHull: '<path d="M4 16l5-11 10 3 2 10-9 3z"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="13" r="3"/>',
  scadMinkowski: '<rect x="5" y="7" width="10" height="10" rx="3"/><circle cx="17" cy="7" r="3"/>',
  scadMeshBoolean: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/><path d="M12 7v10" stroke-dasharray="2 2"/>',
  scadMirrorMesh: '<path d="M12 3v18" stroke-dasharray="3 2"/><path d="M4 6l5 3v6l-5 3zM20 6l-5 3v6l5 3z"/>',
  scadScaleMesh: '<path d="M4 20l5-5M4 20v-5h5"/><path d="M12 4l8 4.5v7L12 20" opacity=".6"/>',
  scadResizeMesh: '<rect x="4" y="6" width="16" height="12" stroke-dasharray="3 2"/><path d="M2 12h4M18 12h4M4 10l-2 2 2 2M20 10l2 2-2 2"/>',
  scadColorCode: '<circle cx="8" cy="9" r="4" fill="#22c55e" stroke="none"/><circle cx="16" cy="9" r="4" fill="#f59e0b" stroke="none"/><circle cx="12" cy="16" r="4" fill="#ef4444" stroke="none"/>',
  scadExpandPlacements: '<rect x="3" y="3" width="8" height="8"/><path d="M11 11l8 8M15 19h4v-4"/>',
  scadExplodeGroup: '<path d="M3 7h7l2 2h9v10H3z" stroke-dasharray="3 2"/><path d="M9 14h6M12 11v6"/>',
  scadRemoveSubtree: '<path d="M6 5h12M9 5V3h6v2M7 5l1 15h8l1-15"/><path d="M12 9v7"/>',
  scadReplace: '<rect x="3" y="8" width="7" height="7"/><rect x="14" y="8" width="7" height="7" rx="3.5"/><path d="M10 6l4 0M12 4l2 2-2 2M14 18h-4M12 16l-2 2 2 2"/>',
};
for (const [name, inner] of Object.entries(ICONS)) registerIcon(name, inner);
