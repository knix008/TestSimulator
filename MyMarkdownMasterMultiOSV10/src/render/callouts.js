// Callout types (Obsidian's set and aliases), their colours and icons, and GitHub alerts. Pure: no DOM.
// The icons are drawn here (24×24, stroke = currentColor) and not through icons.js, because a callout's
// icon takes the callout's colour, not an icon tone.

/** Alias → canonical type (Obsidian's list). Unknown types are notes. */
export const CALLOUT_ALIASES = {
  note: 'note',
  abstract: 'abstract', summary: 'abstract', tldr: 'abstract',
  info: 'info',
  todo: 'todo',
  tip: 'tip', hint: 'tip', important: 'tip',
  success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question',
  warning: 'warning', caution: 'warning', attention: 'warning',
  failure: 'failure', fail: 'failure', missing: 'failure',
  danger: 'danger', error: 'danger',
  bug: 'bug',
  example: 'example',
  quote: 'quote', cite: 'quote',
};

export const CALLOUT_TYPES = ['note', 'abstract', 'info', 'todo', 'tip', 'success', 'question', 'warning', 'failure', 'danger', 'bug', 'example', 'quote'];

/** The colour (an app tone, --tone-<name>) of each canonical type. */
export const CALLOUT_TONES = {
  note: 'blue', abstract: 'cyan', info: 'blue', todo: 'blue', tip: 'teal', success: 'green', question: 'orange',
  warning: 'orange', failure: 'red', danger: 'red', bug: 'red', example: 'purple', quote: 'slate',
};

export function calloutType(name) {
  const key = String(name ?? '').trim().toLowerCase();
  return CALLOUT_ALIASES[key] ?? 'note';
}

export const CALLOUT_ICON_PATHS = {
  // pencil
  note: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="M15 5l4 4"/>',
  // clipboard with lines
  abstract: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  // i in a circle
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  // check in a circle
  todo: '<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>',
  // flame
  tip: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.6 1.4 2.7 2.5 2.7z"/>',
  // check
  success: '<path d="M20 6L9 17l-5-5"/>',
  // ? in a circle
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  // triangle with !
  warning: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  // x
  failure: '<path d="M18 6L6 18M6 6l12 12"/>',
  // lightning
  danger: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
  // bug
  bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2"/>',
  // list
  example: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  // quote marks
  quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.3-.8-2-2-2H4c-1.3 0-2 .7-2 2v6c0 1.3.7 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 0-1 1v3c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.3-.8-2-2-2h-4c-1.3 0-2 .7-2 2v6c0 1.3.7 2 2 2h.8c0 2.3.2 4-2.8 4v3c0 1 0 1 1 1z"/>',
};

const svg = (body, className) => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** The inline SVG of a callout type (aliases and unknown types allowed). */
export const calloutIconSvg = (name) => svg(CALLOUT_ICON_PATHS[calloutType(name)], 'callout-svg');

export const FOLD_CHEVRON = svg('<path d="M6 9l6 6 6-6"/>', 'callout-fold-svg');

// ───────── GitHub alerts (comrak: div.markdown-alert.markdown-alert-<type> > p.markdown-alert-title)

export const ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'];
export const ALERT_ICON_PATHS = {
  note: CALLOUT_ICON_PATHS.info,
  tip: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  important: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4M12 14h.01"/>',
  warning: CALLOUT_ICON_PATHS.warning,
  caution: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/><path d="M12 8v4M12 16h.01"/>',
};

/** The alert type from an element's class list ("markdown-alert markdown-alert-tip" → "tip"). */
export function alertType(className) {
  const m = /\bmarkdown-alert-(note|tip|important|warning|caution)\b/.exec(String(className ?? ''));
  return m ? m[1] : 'note';
}

export const alertIconSvg = (type) => svg(ALERT_ICON_PATHS[type] ?? ALERT_ICON_PATHS.note, 'callout-svg');
