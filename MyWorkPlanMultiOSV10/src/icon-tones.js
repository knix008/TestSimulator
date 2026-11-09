// The colour of each icon (the same scheme as MyUMLMaker). Meaning decides where it
// can (delete is red, open is amber, save is indigo …); views, reports, templates,
// samples and the moving backgrounds are pictures of things, so they take a steady
// colour from their name — one icon looks the same in every window, toolbar, menu
// and popup, and a toolbar is not all one hue.
export const ICON_TONES = ['blue', 'sky', 'indigo', 'purple', 'pink', 'red', 'orange', 'amber', 'yellow', 'green', 'teal', 'cyan', 'slate', 'brown'];

const BY_MEANING = [
  [/trash|delete|remove|close|exit|clear|error|danger|unlink|^x$|stop|inactive|overallocation|critical|deadline/i, 'red'],
  [/^(fileNew|new|add|plus|play|run|check|ok|success|start|tutorial$|taskAdd|summaryAdd|resourceAdd|onTrack)/i, 'green'],
  [/zoom|fit|search|find|filter|goTo|scrollTo|highlight/i, 'green'],
  [/folder|open|recent|history|clock|timer|hourglass|today|statusDate/i, 'amber'],
  [/save|disk|database|db|server|key|plug/i, 'indigo'],
  [/import|export|upload|download|share|csv|xml|transfer|insertProject/i, 'teal'],
  [/undo|redo|refresh|sync|reload|chevron|caret|arrow|back|forward|step|moveUp|moveDown|indent|outdent/i, 'sky'],
  [/copy|paste|cut|duplicate|clone|clipboard|fillDown|replace/i, 'cyan'],
  [/theme|palette|color|colour|paint|fill|brush|font|edit|notes|imageBg/i, 'pink'],
  [/gear|setting|slider|option|prefer|keyboard|dot|grip|more|menu|columns|table|panel|statusBar|ruler|calculate|level/i, 'slate'],
  [/info|question|help|guide|doc|book|about|userGuide|reader/i, 'blue'],
  [/bulb|idea|spark|star|warn|flag|dice|milestone|baseline/i, 'yellow'],
  [/print|image|picture|video|camera|pageSetup/i, 'purple'],
  [/home|globe|language|web|link|url|hyperlink/i, 'orange'],
  [/money|cost|coins|wage|labor/i, 'brown'],
];

// Pictures of things take their colour from the name; slate and red keep their meaning elsewhere.
const VARIETY = ['blue', 'sky', 'indigo', 'purple', 'pink', 'orange', 'amber', 'green', 'teal', 'cyan', 'brown'];
const hash = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

const cache = new Map();
/** The hue of an icon (always one of ICON_TONES). */
export function toneOf(name) {
  if (cache.has(name)) return cache.get(name);
  const picture = /^(view|report(?!Labor)|tpl|anim|grp)/.test(name);
  const tone = (!picture && BY_MEANING.find(([pattern]) => pattern.test(name))?.[1]) || VARIETY[hash(name) % VARIETY.length];
  cache.set(name, tone);
  return tone;
}
