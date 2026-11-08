// The colour of every icon, as MyUMLMaker colours its toolbars: an icon draws in its own tone wherever it sits on a
// toolbar, a header, a tab or a menu (styles.css decides where; a pressed button keeps the button's own colour).
// Tones go by what the icon is about, and are mid-bright so they read on the dark and the light themes alike.
const BLUE = '#3b82f6';
const SKY = '#0ea5e9';
const TEAL = '#14b8a6';
const GREEN = '#22c55e';
const LIME = '#84cc16';
const YELLOW = '#eab308';
const AMBER = '#f59e0b';
const ORANGE = '#f97316';
const RED = '#ef4444';
const PINK = '#ec4899';
const PURPLE = '#a855f7';
const VIOLET = '#8b5cf6';
const SLATE = '#64748b';

const GROUPS = [
  // Editors
  [SKY, ['ed-view3d', 'ed-outliner', 'ed-properties', 'ed-uv', 'ed-image', 'ed-text', 'ed-console', 'ed-sheet', 'ed-coverage', 'ed-info', 'ed-assets', 'ed-clip', 'ed-sequencer']],
  [PURPLE, ['ed-timeline', 'ed-dopesheet', 'ed-graph', 'ed-nla', 'keyframe', 'history']],
  [TEAL, ['ed-node', 'mod-nodes', 'data', 'view-layer', 'collection', 'output']],
  // Things in the scene
  [AMBER, ['prim-plane', 'prim-cube', 'prim-circle', 'prim-sphere', 'prim-ico', 'prim-cone', 'prim-grid', 'prim-cylinder', 'mesh', 'object', 'curve', 'text', 'meta', 'lattice', 'empty', 'duplicate', 'join', 'template']],
  [YELLOW, ['light', 'sun', 'moon', 'bulb']],
  [PINK, ['gpencil', 'material', 'texture', 'palette', 'world', 'scene', 'pencil']],
  [VIOLET, ['armature', 'bone', 'constraint', 'mod-armature', 'mod-lattice', 'mod-deform', 'mod-cast', 'mod-shrink', 'mod-wave', 'mod-smooth', 'mod-displace']],
  [BLUE, ['modifier', 'mod-remesh', 'mod-multires', 'mod-skin', 'mod-subsurf', 'mod-mirror', 'mod-array', 'mod-solidify', 'mod-bevel', 'mod-decimate', 'mod-boolean', 'mod-screw', 'mod-weld', 'mod-wire', 'mod-tri', 'mod-split', 'mod-build', 'mod-mask', 'mod-ocean']],
  [GREEN, ['physics', 'particles', 'field', 'run', 'play', 'tutorial', 'samples', 'check', 'add', 'new', 'import', 'sync']],
  [RED, ['render', 'camera-render', 'camera', 'delete', 'remove', 'close', 'power', 'stop', 'record']],
  // Tools
  [BLUE, ['tool', 'tool-select', 'tool-cursor', 'tool-move', 'tool-rotate', 'tool-scale', 'tool-transform', 'move4', 'hand', 'search', 'snap', 'proportional', 'grid']],
  [ORANGE, ['tool-extrude', 'tool-inset', 'tool-bevel', 'tool-loopcut', 'tool-knife', 'tool-spin', 'tool-brush', 'shade-smooth', 'shade-flat']],
  [TEAL, ['tool-annotate', 'tool-measure']],
  // Shading and overlays
  [SKY, ['wire', 'shaded', 'solid', 'rendered', 'xray', 'overlay', 'eye', 'eye-off']],
  // Files and the window
  [AMBER, ['open', 'folder', 'folder-clock', 'save', 'export', 'bookmark', 'guide', 'library']],
  [LIME, ['undo', 'redo', 'first', 'last', 'prev', 'next', 'pause', 'up', 'down', 'left', 'right', 'restore']],
  [SKY, ['video', 'help', 'clock', 'home', 'drag']],
  [SLATE, ['settings', 'minimize', 'maximize', 'maximize2', 'split-v', 'split-h', 'fullscreen']],
];

export const ICON_TONES = Object.fromEntries(GROUPS.flatMap(([tone, names]) => names.map((name) => [name, tone])));

/** The tone of an icon; one not listed takes the accent colour. */
export const iconTone = (name) => ICON_TONES[name] ?? null;
