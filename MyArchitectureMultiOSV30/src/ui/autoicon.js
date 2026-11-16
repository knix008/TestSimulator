// Every button has an icon. A text button (class "btn") built without one gets
// an icon picked from its label: the label is mapped back to its English key
// (the Korean text → the key it translates) and matched against the rules
// below, first match wins. Buttons that draw their own picture (svg, img,
// canvas) or carry data-noicon are left alone.

import { KO } from "./i18n-ko.js";

// Korean text → every English key that translates to it (several can share one word).
let reverse = null;
const keysOf = (text) => {
  if (!reverse) { reverse = new Map(); for (const [k, v] of Object.entries(KO)) if (typeof v === "string") { if (!reverse.has(v)) reverse.set(v, []); reverse.get(v).push(k); } }
  return reverse.get(text) || [];
};

// [pattern on the English label, icon name]
const RULES = [
  [/^(×|✕|x)$/i, "close"],
  [/^(ok|apply|accept)/i, "check"],
  [/\b(delete|remove|discard|clear all)\b/i, "trash"],
  [/\b(cancel|not now|later|close|dismiss|quit|exit)\b/i, "close"],
  [/\b(no texture|clear|reset|default|revert)\b/i, "refresh"],
  [/\b(retry|again|refresh|reload|rebuild|regenerate)\b/i, "refresh"],
  [/\bsave\b/i, "save"],
  [/\bprint\b/i, "print"],
  [/\bexport\b/i, "export"],
  [/\b(import|from contours|from file|load)\b/i, "import"],
  [/\b(open|browse|choose|pick|texture|image)\b/i, "open"],
  [/\b(copy|duplicate)\b/i, "copy"],
  [/\b(new|add|create|register)\b/i, "plus"],
  [/\b(select|instances)\b/i, "select"],
  [/\b(show in 3d|3d)\b/i, "cube"],
  [/\b(edit|rename|change|modify)\b/i, "wand"],
  [/\b(make unique|unique)\b/i, "part"],
  [/\bexplode\b/i, "offset"],
  [/\bcomponent\b/i, "skComponent"],
  [/\bsmoove\b/i, "skSmoove"],
  [/\b(terrain|contour)\b/i, "skTerrain"],
  [/\brotate\b/i, "rotate"],
  [/\bmirror\b/i, "mirror"],
  [/\bgroup\b/i, "group"],
  [/\bscale\b/i, "scale"],
  [/\b(move|main model)\b/i, "skMove"],
  [/\b(site|location|map)\b/i, "globe"],
  [/\b(propert|settings|options|configure)\b/i, "settings"],
  [/\b(theme|colou?r)\b/i, "palette"],
  [/\b(tutorial|tour|help|manual|guide)\b/i, "help"],
  [/\b(start|run|play|begin)\b/i, "play"],
  [/\b(skip|next|continue|forward)\b/i, "chevronRight"],
  [/\b(back|previous|prev)\b/i, "chevronLeft"],
  [/\b(levels?|storey|floor)\b/i, "levels"],
  [/\b(view|show|preview)\b/i, "eye"],
  [/\b(sheet|template|page)\b/i, "sheet"],
  [/\b(check|verify|ok|apply|accept|done|yes|confirm|use|fit)\b/i, "check"],
  [/\b(layer|tag)\b/i, "layers"],
  [/\b(sample|example)\b/i, "sample"],
];

export function iconForLabel(label) {
  const raw = String(label || "").trim();
  const text = raw.replace(/[…:.]+$/u, "").trim();
  const cands = [...keysOf(raw), text];
  for (const [re, name] of RULES) if (cands.some((c) => re.test(c))) return name;
  return "chevronRight";
}

// Tabs and segmented choices: a fixed icon per English label, else the rules.
const TAB_ICONS = {
  "General": "settings", "Appearance": "palette", "Units & grid": "ruler", "Floor plan": "floorplan", "3D view": "cube", "Output": "print",
  "Navigation": "orbit", "3D": "cube", "3D modelling": "pushpull", "3D modelling tools": "pushpull",
  "Rooms": "room", "Doors and windows": "door", "Wall types": "wall", "Levels": "levels", "Cost estimate": "calculator", "Furniture": "sofa", "Schedules": "schedule",
  "Colour": "palette", "Black and white": "moon", "Level plans": "levels", "Sheets": "sheet", "All pages": "file", "Pages": "list",
  "Landscape": "file", "Portrait": "file",
};
export function iconForTab(label) {
  const text = String(label || "").trim();
  if (TAB_ICONS[text]) return TAB_ICONS[text];
  // Several keys can share one Korean word: any of them with a tab icon.
  for (const [k, v] of Object.entries(KO)) if (v === text && TAB_ICONS[k]) return TAB_ICONS[k];
  return iconForLabel(label);
}
