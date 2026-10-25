// Command icons that need a drawing rather than a character: the 3D view is a
// shaded cube (three faces, lit from the top left), drawn in currentColor so it
// follows the theme, the hover and the "on" state like the text icons.
import { svg } from './dom.js';
import { commandIcon } from '../core/commands.js';

const DRAWN = {
  // New: a blank page with a folded corner and a plus.
  toolPanel: () => svg(`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" class="icon-svg"><rect x="2.5" y="3.5" width="5" height="13" fill="currentColor" fill-opacity="0.55"/><rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`),
  propertyPanel: () => svg(`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" class="icon-svg"><rect x="12.5" y="3.5" width="5" height="13" fill="currentColor" fill-opacity="0.55"/><rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`),
  chartPanel: () => svg(`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" class="icon-svg"><rect x="2.5" y="11.5" width="15" height="5" fill="currentColor" fill-opacity="0.55"/><path d="M4.5 15 L7 13.2 L9.5 14.2 L12 12.6 L15.5 13.6" fill="none" stroke="currentColor" stroke-width="0.9"/><rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`),
  zoomReset: () => svg(`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" class="icon-svg">
    <rect x="3" y="3" width="14" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.2 1.6"/>
    <circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M10 1.5 V6 M10 14 V18.5 M1.5 10 H6 M14 10 H18.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="10" cy="10" r="1" fill="currentColor"/>
  </svg>`),
  new: () => svg(`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" class="icon-svg">
    <path d="M4.5 1.8 H12 L16 5.8 V18.2 H4.5 Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M12 1.8 V5.8 H16" fill="currentColor" fill-opacity="0.45" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M10.25 9 V15 M7.25 12 H13.25" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`),
  view3d: () => svg(`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" class="icon-svg">
    <path d="M10 2 L17.5 6 L10 10 L2.5 6 Z" fill="currentColor" fill-opacity="0.95"/>
    <path d="M2.5 6 L10 10 L10 18.5 L2.5 14.3 Z" fill="currentColor" fill-opacity="0.55"/>
    <path d="M17.5 6 L10 10 L10 18.5 L17.5 14.3 Z" fill="currentColor" fill-opacity="0.3"/>
    <path d="M10 2 L17.5 6 L17.5 14.3 L10 18.5 L2.5 14.3 L2.5 6 Z M2.5 6 L10 10 L17.5 6 M10 10 L10 18.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
  </svg>`),
};

/** The icon of a command: a drawn one where there is, else its character. */
export function iconOf(id) {
  return DRAWN[id] ? DRAWN[id]() : commandIcon(id);
}
