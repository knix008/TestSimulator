// Icons of the reading view (24×24, stroke = currentColor), registered into icons.js under the `render` prefix.
import { registerIcons } from '../icons.js';

export const RENDER_ICONS = {
  renderWrap: '<path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4"/><path d="M16 16l-2 2 2 2"/><path d="M3 18h7"/>',
  renderHeadingLink: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  renderExpand: '<path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>',
  renderCollapse: '<path d="M7 20l5-5 5 5M7 4l5 5 5-5"/>',
  renderImageBroken: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4M14 12l2-2 5 5"/><path d="M4 4l16 16"/>',
  renderLineSpacing: '<path d="M11 6h10M11 12h10M11 18h10"/><path d="M5 4v16M3 6l2-2 2 2M3 18l2 2 2-2"/>',
  renderWidth: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12h10M9 10l-2 2 2 2M15 10l2 2-2 2"/>',
  renderNarrower: '<path d="M4 4v16M20 4v16"/><path d="M8 12h8M14 9l3 3-3 3M10 9l-3 3 3 3" transform="rotate(180 12 12)"/>',
  renderContrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  renderAutoScroll: '<path d="M12 4v13M7 12l5 5 5-5"/><path d="M5 21h14"/>',
  renderSlides: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M12 17v4M8 21h8"/><path d="M10 8l4 2.5-4 2.5z"/>',
};

registerIcons(RENDER_ICONS);
