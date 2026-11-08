// Colour of an icon on the start page and the start-up popup (as MyUMLMaker's
// src/icon-tones.js). Meaning decides where it can (delete is red, open is
// amber …); building and drawing icons take a steady colour from their name,
// so one icon looks the same everywhere and a tile grid is not all one hue.
// style/app.css maps each tone to a colour for dark and light themes.
import { icon } from "./icons.js";

export const ICON_TONES = ["blue", "sky", "indigo", "purple", "pink", "red", "orange", "amber", "yellow", "green", "teal", "cyan", "slate", "brown"];

const BY_MEANING = [
  [/^(trash|close|error|stop)$/, "red"],
  [/^(new|plus|play|check|sample)$/, "green"],
  [/^(zoomIn|zoomOut|zoomFit|search)$/, "green"],
  [/^(open|folder|history|file)$/, "amber"],
  [/^(save|saveAs)$/, "indigo"],
  [/^(import|export|dxf|underlay|image)$/, "teal"],
  [/^(undo|redo|refresh|chevron\w*|arrow\w*)$/, "sky"],
  [/^(palette|material|bucket|text)$/, "pink"],
  [/^(settings|keyboard|dots|grid|command)$/, "slate"],
  [/^(info|help|library)$/, "blue"],
  [/^(bulb\w*|sunlight|sun|warning)$/, "yellow"],
  [/^(print|camera|model3d|cube)$/, "purple"],
  [/^(home|globe|walk)$/, "orange"],
  [/^(tree|leaf)$/, "green"],
  [/^(bim|levels|building)$/, "indigo"],
];

const VARIETY = ["blue", "sky", "indigo", "purple", "pink", "orange", "amber", "green", "teal", "cyan", "brown"];
const hash = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

const cache = new Map();
/** The hue of an icon (always one of ICON_TONES). */
export function toneOf(name) {
  if (cache.has(name)) return cache.get(name);
  const tone = (BY_MEANING.find(([re]) => re.test(name)) || [])[1] || VARIETY[hash(name) % VARIETY.length];
  cache.set(name, tone);
  return tone;
}

/** icon() with its tone: <svg … data-tone="green">. */
export function toned(name, size = 18, extraClass = "") {
  return icon(name, size, extraClass).replace("<svg ", `<svg data-tone="${toneOf(name)}" `);
}
