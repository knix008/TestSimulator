const PATHS = {
  dot: '<circle cx="12" cy="12" r="3"/>',
  new: '<path d="M12 5v14M5 12h14"/>',
  open: '<path d="M3 7h6l2 2h10v10H3z"/>',
  save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7M8 20v-6h8v6"/>',
  saveAs: '<path d="M5 4h9l3 3v6M8 4v5h6M8 14h8v6H8zM16 18h5M18.5 15.5v5"/>',
  undo: '<path d="M8 8H4v4M4.5 12A8 8 0 1 0 7 6"/>',
  redo: '<path d="M16 8h4v4M19.5 12A8 8 0 1 1 17 6"/>',
  cut: '<path d="M8 8l8 8M16 8l-8 8M7 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0M7 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0"/>',
  copy: '<path d="M8 8h10v12H8zM6 16H5a1 1 0 0 1-1-1V4h10v2"/>',
  paste: '<path d="M8 6h8v2h2v12H6V8h2zM9 4h6v3H9z"/>',
  print: '<path d="M7 8V4h10v4M7 16H5V9h14v7h-2M7 13h10v7H7z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.2-5.5M20 4v5h-5"/>',
  settings: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M8.2 4.4h7.6L20.4 12l-4.6 7.6H8.2L3.6 12zM15.4 12a3.4 3.4 0 1 0-6.8 0 3.4 3.4 0 1 0 6.8 0z"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>',
  exit: '<path d="M10 5H6v14h4M10 12h9M16 8l4 4-4 4"/>',
  recent: '<path d="M12 7v5l3 2M12 4a8 8 0 1 0 8 8"/>',
  clear: '<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  zoomIn: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5M8 11h6"/>',
  zoomReset: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5M9 11h4"/>',
  daily: '<path d="M5 5h14v14H5zM8 3v4M16 3v4M5 9h14"/>',
  weekly: '<path d="M4 6h4v12H4zM10 6h4v12h-4zM16 6h4v12h-4"/>',
  monthly: '<path d="M4 5h16v14H4zM4 9h16M9 9v10M14 9v10"/>',
  left: '<path d="M4 5h6v14H4zM12 8h8M12 12h8M12 16h6"/>',
  right: '<path d="M14 5h6v14h-6zM4 8h8M4 12h8M4 16h6"/>',
  theme: '<path d="M12 3v2M12 19v2M4.2 6.2l1.4 1.4M18.4 16.4l1.4 1.4M3 12h2M19 12h2M6.2 19.8l1.4-1.4M16.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
  lang: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9S14.5 18.2 12 21c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z"/>',
  download: '<path d="M12 4v10M8 10l4 4 4-4M5 19h14"/>',
  link: '<path d="M10 14l4-4M8 16l-2 2a4 4 0 0 1-6-6l2-2M16 8l2-2a4 4 0 0 1 6 6l-2 2"/>',
  weather: '<path d="M7 16h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 16z"/>',
  font: '<path d="M5 19L12 5l7 14M8 14h8"/>',
  image: '<path d="M4 5h16v14H4zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4M4 16l5-4 3 3 2-2 6 5"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  favorite: '<path d="M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z"/>',
  note: '<path d="M6 4h9l3 3v13H6zM14 4v4h4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  warning: '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  folder: '<path d="M3 7h6l2 2h10v10H3z"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  page: '<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  cloud: '<path d="M7 17h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.5 3.5 0 0 0 7 17z"/>',
  partly: '<circle cx="8" cy="9" r="3"/><path d="M8 17h9a3 3 0 0 0 .3-6 5 5 0 0 0-8.2.8"/>',
  rain: '<path d="M7 14h10a4 4 0 0 0 .2-8 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 14zM8 18l-1 2M12 18l-1 2M16 18l-1 2"/>',
  snow: '<path d="M7 14h10a4 4 0 0 0 .2-8 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 14zM9 18h.01M12 19h.01M15 18h.01"/>',
  storm: '<path d="M7 14h10a4 4 0 0 0 .2-8 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 14zM11 15l-2 4h3l-1 3 4-5h-3z"/>',
  fog: '<path d="M5 10h14M4 14h16M6 18h12"/>',
  windowMin: '<path d="M6 12h12"/>',
  windowMax: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  windowRestore: '<rect x="5.5" y="9" width="9.5" height="9.5" rx="1.5"/><path d="M9 6.5v-.1c0-.5.4-.9.9-.9h7.2c.8 0 1.4.6 1.4 1.4v7.2c0 .5-.4.9-.9.9h-.1"/>',
  windowClose: '<path d="M7 7l10 10M17 7 7 17"/>',
  palette: '<path d="M12 4a8 8 0 0 0 0 16c1.3 0 2-.8 2-1.8 0-1.4-1.2-1.7-1.2-2.9 0-1 .8-1.8 1.8-1.8H17a3 3 0 0 0 3-3C20 7.1 16.4 4 12 4z"/><circle cx="8.2" cy="11" r="1"/><circle cx="10.5" cy="7.6" r="1"/><circle cx="14.6" cy="7.8" r="1"/>',
  moon: '<path d="M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9z"/>',
};

export function gripIcon() {
  return '<svg class="grip-svg" viewBox="0 0 14 14" aria-hidden="true"><path d="M13 3 3 13M13 7.5 7.5 13M13 12l-1 1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
}

export function icon(name) {
  const body = PATHS[name] || PATHS.dot;
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export function knownIcons() {
  return Object.keys(PATHS);
}
