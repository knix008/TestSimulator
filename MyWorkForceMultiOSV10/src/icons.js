const ICONS = {
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10.5V20h12v-9.5"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  backlog: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  roadmap: '<path d="M4 16c2-6 4-6 6 0s4 6 6 0 4-6 4 0"/><circle cx="6" cy="16" r="1.2" fill="currentColor"/>',
  issues: '<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  dashboard: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>',
  chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15v4M12 9v10M16 12v7"/>',
  release: '<path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M5 21h14"/>',
  component: '<path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3z"/><path d="M12 12 20 7.5M12 12v9M12 12 4 7.5"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2"/><path d="M16 19a4 4 0 0 1 4-4"/>',
  bell: '<path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2h-15L6 16z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  settings: '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.8.3-1.2.8-1.2 1.6V14"/><path d="M12 17h.01"/>',
  alert: '<path d="M12 4 3 19h18L12 4z"/><path d="M12 10v4M12 16.5h.01"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bug: '<path d="M8 9a4 4 0 0 1 8 0v3a4 4 0 0 1-8 0V9z"/><path d="M4 10h4M16 10h4M5 16l3-1M19 16l-3-1M12 5V3"/>',
  story: '<path d="M6 4h9l3 3v13H6z"/><path d="M15 4v3h3"/>',
  task: '<path d="M5 7h14M5 12h14M5 17h9"/><path d="m4 7 .5.5 1-1"/>',
  epic: '<path d="M4 16 12 4l8 12H4z"/>',
  subtask: '<path d="M6 6h12v4H6zM10 14h8v4h-8z"/><path d="M8 10v4h2"/>',
  spark: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
  request: '<path d="M5 6h14v10H8l-3 3V6z"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/>',
  comment: '<path d="M5 6h14v9H8l-3 3V6z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
  link: '<path d="M10 13a4 4 0 0 0 6 .2l2-2a4 4 0 0 0-5.7-5.6L11 7"/><path d="M14 11a4 4 0 0 0-6-.2l-2 2a4 4 0 0 0 5.7 5.6L13 17"/>',
  paperclip: '<path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-8 8a4 4 0 0 1-5.6-5.6l7.5-7.5"/>',
  trash: '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  download: '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/>',
  folder: '<path d="M3 7h6l2 2h10v10H3V7z"/>',
  save: '<path d="M5 4h11l3 3v13H5V4z"/><path d="M8 4v6h7V4M8 20v-6h8v6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  square: '<rect x="6" y="6" width="12" height="12"/>',
  restore: '<rect x="8" y="8" width="10" height="10"/><path d="M6 16V6h10"/>',
  undo: '<path d="M8 8H4v4"/><path d="M4 8a8 8 0 1 1-1 5"/>',
  redo: '<path d="M16 8h4v4"/><path d="M20 8a8 8 0 1 0 1 5"/>',
  flag: '<path d="M6 4v16"/><path d="M6 5h11l-2 3.5L17 12H6"/>',
  tag: '<path d="M4 12V4h8l8 8-8 8-8-8z"/><circle cx="8.5" cy="8.5" r="1"/>',
  box: '<path d="M3 8h18v11H3z"/><path d="M3 8 7 4h10l4 4M12 4v4"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
  workflow: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 6h6a4 4 0 0 1 4 4M8 18h4M6 8v8"/>',
  bolt: '<path d="M13 3 5 14h7l-1 7 8-11h-7l1-7z"/>',
  shield: '<path d="M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3z"/>',
  play: '<path d="m8 5 11 7-11 7V5z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="1"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  columns: '<rect x="4" y="4" width="6" height="16"/><rect x="14" y="4" width="6" height="16"/>',
  copy: '<rect x="8" y="8" width="10" height="12" rx="1"/><path d="M6 16V5h9"/>',
  pencil: '<path d="M4 20h4L18 10l-4-4L4 16v4z"/><path d="m13 7 4 4"/>',
  printer: '<path d="M7 8V4h10v4"/><rect x="6" y="10" width="12" height="6" rx="1"/><path d="M8 16h8v4H8z"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2 2.5 2 13.5 0 16M12 4c-2 2.5-2 13.5 0 16"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  book: '<path d="M5 5h6a3 3 0 0 1 3 3v11H8a3 3 0 0 0-3 3V5z"/><path d="M19 5h-6a3 3 0 0 0-3 3v11h6a3 3 0 0 1 3 3V5z"/>',
  file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  move: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  moon: '<path d="M16 14.5A6.5 6.5 0 0 1 9.5 4 7 7 0 1 0 16 14.5z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.6-1.3-.6-2.1 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7.5" r="1.2"/><circle cx="14.5" cy="7.5" r="1.2"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  panelLeft: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panelRight: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  foldLeft: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M17 9l-4 3 4 3"/>',
  foldRight: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="M7 9l4 3-4 3"/>',
};

const TONES = {
  home: 'orange', board: 'blue', backlog: 'amber', roadmap: 'purple', issues: 'indigo', list: 'sky',
  dashboard: 'teal', chart: 'cyan', release: 'green', component: 'brown', filter: 'green', people: 'pink',
  bell: 'amber', settings: 'slate', help: 'blue', alert: 'red', search: 'teal', plus: 'green', bug: 'red',
  story: 'blue', task: 'sky', epic: 'purple', subtask: 'indigo', spark: 'yellow', request: 'teal', user: 'pink',
  comment: 'sky', clock: 'amber', link: 'cyan', paperclip: 'slate', trash: 'red', download: 'teal', folder: 'amber',
  save: 'indigo', sun: 'yellow', check: 'green', close: 'red', minus: 'slate', square: 'sky', restore: 'sky',
  undo: 'sky', redo: 'cyan', flag: 'orange', tag: 'pink', box: 'brown', eye: 'indigo', workflow: 'purple',
  bolt: 'yellow', shield: 'blue', play: 'green', calendar: 'orange', columns: 'blue', copy: 'cyan',
  pencil: 'pink', printer: 'purple', database: 'indigo', globe: 'orange', lock: 'amber', book: 'blue', info: 'sky',
  file: 'teal', move: 'red', moon: 'indigo', palette: 'pink', chevronDown: 'slate', layers: 'purple',
  chevronLeft: 'slate', chevronRight: 'slate', panelLeft: 'blue', panelRight: 'teal', foldLeft: 'blue', foldRight: 'teal',
};

/** Bottom-right triangle of dots used to resize a card or the window. */
export function gripIcon() {
  return `<svg class="icon grip-icon" data-icon="grip" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor" stroke="none"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></g></svg>`;
}

const hasWash = (body) => /^<(rect|circle|ellipse)\b(?![^>]*\bfill=)/.test(body) || /^<path d="[^"]*[zZ]\s*"(?![^>]*\bfill=)[^>]*\/>/.test(body);

export function icon(name) {
  const known = ICONS[name] ? name : 'box';
  const body = ICONS[known];
  return `<svg class="icon" data-icon="${known}" data-tone="${TONES[known] || 'blue'}"${hasWash(body) ? ' data-wash=""' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const TYPE_ICON = {
  epic: 'epic', story: 'story', task: 'task', bug: 'bug', subtask: 'subtask',
  improvement: 'spark', feature: 'spark', incident: 'alert', request: 'request',
};
