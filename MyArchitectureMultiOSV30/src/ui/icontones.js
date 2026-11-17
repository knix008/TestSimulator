// The colours of the icons now live in icons.js (every icon() is coloured);
// kept for the modules that import toned / toneOf / ICON_TONES from here.
import { icon, toneOf, ICON_TONES } from "./icons.js";

export { toneOf, ICON_TONES };

/** icon() with its tone (every icon has one now). */
export function toned(name, size = 18, extraClass = "") {
  return icon(name, size, extraClass);
}
