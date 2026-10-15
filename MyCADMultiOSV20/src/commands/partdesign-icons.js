// Icons of the commands in ./partdesign.js. The popup windows import only these, not the commands.
import { registerIcon } from '../icons.js';

const ICONS = {
  pdBody: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M8 9l4 2 4-2" opacity=".6"/><circle cx="18" cy="5" r="2.5" fill="currentColor"/>',
  pdTip: '<path d="M6 3v18"/><path d="M6 4h11l-3 4 3 4H6"/>',
  pdMoveFeature: '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/><path d="M7 11v5h6M11 14l2 2-2 2"/>',
  pdMoveInTree: '<path d="M5 6h10M5 12h10M5 18h10"/><path d="M19 8v8M17 14l2 2 2-2"/>',
  pdLinearPattern: '<rect x="3" y="9" width="5" height="6" rx="1"/><rect x="10" y="9" width="5" height="6" rx="1"/><rect x="17" y="9" width="4" height="6" rx="1"/>',
  pdPolarPattern: '<circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/><rect x="10" y="3" width="4" height="4" rx="1"/><rect x="17" y="10" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/>',
  pdMirrored: '<path d="M12 3v18" stroke-dasharray="3 2"/><rect x="4" y="8" width="5" height="8" rx="1"/><rect x="15" y="8" width="5" height="8" rx="1" opacity=".5"/>',
  pdMultiTransform: '<rect x="3" y="14" width="5" height="5" rx="1"/><rect x="10" y="14" width="5" height="5" rx="1"/><rect x="10" y="5" width="5" height="5" rx="1" transform="rotate(25 12.5 7.5)"/><path d="M17 16h4"/>',
  pdNewSketch: '<path d="M4 18l8 3 8-3-8-3z"/><path d="M8 13l7-7 3 3-7 7H8z"/>',
  pdShapeBinder: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" stroke-dasharray="3 2"/><path d="M9 12h6"/>',
  pdSubShapeBinder: '<path d="M4 8l8-4 8 4-8 4z" stroke-dasharray="3 2"/><path d="M12 12v8"/>',
  pdSubtractiveHelix: '<path d="M6 5c6 0 6 3 12 3M6 11c6 0 6 3 12 3M6 17c6 0 6 3 12 3"/><path d="M3 3l18 18" opacity=".5"/>',
  pdSubtractiveLoft: '<path d="M7 19h10l-2-14H9z"/><path d="M3 3l18 18" opacity=".5"/>',
  pdSubtractivePipe: '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><path d="M3 3l18 18" opacity=".5"/>',
};
for (const [name, inner] of Object.entries(ICONS)) registerIcon(name, inner);
