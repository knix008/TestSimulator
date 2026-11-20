// The colour of each icon (the same idea as MyUMLMaker's icon-tones.js): the meaning
// decides — delete and close are red, folders amber, play and check green, help blue,
// themes pink — so one icon looks the same everywhere: toolbar, panels, start screen,
// popups and context menus. The shades are in icon-tones.css (deeper on light themes,
// brighter on dark ones).
export const ICON_TONES = ['blue', 'sky', 'indigo', 'purple', 'pink', 'red', 'orange', 'amber', 'yellow', 'green', 'teal', 'cyan', 'slate', 'brown'];

export const TONE_OF = Object.freeze({
  // what to capture
  monitor: 'blue', window: 'sky', self: 'indigo', region: 'teal', target: 'orange',
  // capture and recording
  camera: 'purple', video: 'pink', record: 'red', pause: 'amber', play: 'green', stop: 'red', repeat: 'sky',
  mic: 'pink', speaker: 'purple', engine: 'brown', fps: 'cyan', fileFormat: 'teal', quality: 'yellow',
  // files and the history
  folder: 'amber', open: 'orange', save: 'indigo', copy: 'cyan', link: 'orange', images: 'purple', clock: 'amber', trash: 'red',
  // viewing
  eye: 'blue', zoomIn: 'green', zoomOut: 'green', fit: 'green', actual: 'green',
  // window and panels
  close: 'red', winMinimize: 'sky', winMaximize: 'green', winRestore: 'green', home: 'orange',
  panelLeft: 'indigo', panelRight: 'indigo', panelLeftFilled: 'indigo', panelRightFilled: 'indigo',
  collapseLeft: 'indigo', expandLeft: 'indigo', collapseRight: 'indigo', expandRight: 'indigo',
  chevronLeft: 'sky', chevronRight: 'sky', chevronDown: 'sky', refresh: 'sky',
  // settings, help and the start screen
  gear: 'slate', sliders: 'slate', keyboard: 'slate', info: 'blue', book: 'blue', globe: 'orange', palette: 'pink',
  film: 'pink', aperture: 'purple',
  aurora: 'green', waves: 'sky', particles: 'indigo', constellation: 'blue', bubbles: 'cyan', gridflow: 'purple', flowchart: 'teal',
  starfield: 'yellow', rain: 'sky', snow: 'cyan', fireflies: 'amber', ripples: 'blue', coderain: 'green', hexagons: 'orange',
  orbits: 'indigo', lava: 'red', spiral: 'purple', confetti: 'pink', nodes: 'teal', ribbons: 'pink', shuffle: 'orange', opacity: 'slate',
  print: 'indigo', paper: 'blue', portrait: 'sky', landscape: 'sky', pageAuto: 'teal', margin: 'cyan', frame: 'brown',
  gaugeLow: 'teal', gaugeMid: 'sky', gaugeHigh: 'orange', sun: 'amber', moon: 'indigo',
  undo: 'sky', cut: 'cyan', paste: 'cyan', selectAll: 'teal',
  check: 'green', grid: 'teal', bulb: 'yellow', rocket: 'green', list: 'cyan', blank: 'slate',
});

/** The hue of an icon (always one of ICON_TONES). */
export const toneOf = (name) => TONE_OF[name] ?? 'slate';
