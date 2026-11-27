// The note editor's pictures (24×24, stroke), registered with the app's icon set on import.
import { registerIcons } from '../icons.js';

export const EDITOR_ICONS = {
  editorCalloutNote: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  editorCalloutInfo: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  editorCalloutTip: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3 0-3 0-5.5 1-8.5z"/>',
  editorCalloutSuccess: '<path d="M4 12.5l5 5L20 6.5"/>',
  editorCalloutQuestion: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5M12 17v.5"/>',
  editorCalloutWarning: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  editorCalloutFailure: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  editorCalloutDanger: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  editorCalloutBug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7v13M7 12H3M21 12h-4M8 4l2 3M16 4l-2 3M7 17l-3 2M17 17l3 2"/>',
  editorCalloutExample: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.5M4 12h.5M4 18h.5"/>',
  editorCalloutQuote: '<path d="M5 18c2.5-1 4-3 4-6V7H4v5h4M15 18c2.5-1 4-3 4-6V7h-5v5h4"/>',
  editorCalloutAbstract: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  editorCalloutTodo: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  editorImageMissing: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4M14 13l2-2 5 5"/><path d="M4 4l16 16"/>',
  editorImageLeft: '<rect x="3" y="5" width="9" height="8" rx="1.5"/><path d="M15 6h6M15 10h6M15 14h6M3 18h18"/>',
  editorImageCenter: '<rect x="7.5" y="4" width="9" height="9" rx="1.5"/><path d="M3 17h18M6 21h12"/>',
  editorImageRight: '<rect x="12" y="5" width="9" height="8" rx="1.5"/><path d="M3 6h6M3 10h6M3 14h6M3 18h18"/>',
  editorImageOriginal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9v6M8 9l-1.5 1.5M12.5 10.5v.2M12.5 13.5v.2M16 9v6M16 9l-1.5 1.5"/>',
  editorImageResize: '<path d="M20 11v9h-9M20 20L11 11"/>',
};

registerIcons(EDITOR_ICONS);

/** The callout icon name of a type (see texts.js calloutType). */
export const calloutIcon = (type) => `editorCallout${type[0].toUpperCase()}${type.slice(1)}`;
