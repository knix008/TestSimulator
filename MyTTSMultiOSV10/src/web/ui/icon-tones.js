// The colour of each icon. Meaning decides where it can (delete is red, open is amber …);
// the many model element icons take a steady colour from their name, so that one icon
// looks the same everywhere and the toolbox and explorer are not all one hue.
export const ICON_TONES = ['blue', 'sky', 'indigo', 'purple', 'pink', 'red', 'orange', 'amber', 'yellow', 'green', 'teal', 'cyan', 'slate', 'brown'];

const BY_MEANING = [
  [/trash|delete|remove|close|exit|clear|error|danger|^x$|power|stop|bad/i, 'red'],
  [/^(fileNew|new|add|plus|play|run|check|ok|success|start|tutorial$)/i, 'green'],
  [/zoom|fit|search|find|filter/i, 'green'],
  [/folder|open|recent|history|clock|timer/i, 'amber'],
  [/save|disk|database|db/i, 'indigo'],
  [/import|export|upload|download|share|csv/i, 'teal'],
  [/undo|redo|refresh|sync|reload|chevron|caret|arrow|back|forward/i, 'sky'],
  [/copy|paste|cut|duplicate|clone|clipboard/i, 'cyan'],
  [/theme|palette|color|colour|paint|fill|brush|font|text/i, 'pink'],
  [/gear|setting|slider|option|prefer|keyboard|dot|grip|more/i, 'slate'],
  [/info|question|help|guide|doc|book|about/i, 'blue'],
  [/bulb|idea|spark|star|warn|flag|dice/i, 'yellow'],
  [/print|image|picture|video|camera/i, 'purple'],
  [/home|globe|language|web|link|url/i, 'orange'],
];

// Icons of model elements take their colour from the name; slate and red keep their meaning elsewhere.
const VARIETY = ['blue', 'sky', 'indigo', 'purple', 'pink', 'orange', 'amber', 'green', 'teal', 'cyan', 'brown'];
const hash = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

const cache = new Map();
/** The hue of an icon (always one of ICON_TONES). */
export function toneOf(name) {
  if (cache.has(name)) return cache.get(name);
  // Diagram kinds, elements and backgrounds are pictures of things, not commands: no meaning in their names.
  const picture = /^(dg|uml|erd|fc|dfd|sysml|bpmn|c4|mm|wf|cloud|nw|gantt|wbs|tl|am|ds|ebnf|regex|us|cj|anim|line|layout|align|stereo)/i.test(name);
  const tone = (!picture && BY_MEANING.find(([pattern]) => pattern.test(name))?.[1]) || VARIETY[hash(name) % VARIETY.length];
  cache.set(name, tone);
  return tone;
}
