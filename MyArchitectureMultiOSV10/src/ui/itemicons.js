// Icons for the items inside the side panels: checkbox rows, field labels and
// property labels get a small icon chosen from what they say, so every row of
// the left and right panels reads like the toolbar. A MutationObserver keeps
// decorating whatever the panels render later (any panel, any module).
//
// The label is matched in English: a Korean label is mapped back to its
// English key through the translation table.

import { KO } from "./i18n-ko.js";
import { icon } from "./icons.js";

const ENGLISH = new Map(Object.entries(KO).map(([en, ko]) => [ko, en]));

// First match wins; patterns are tested against the English label.
const RULES = [
  [/^(B?\d+F|level|storey|story|levels?\b|floor \d)/i, "levels"],
  [/height|elevation|altitude of|raise|top offset|base offset|z0/i, "arrowUp"],
  [/sill/i, "window"],
  [/length|width|depth|distance|spacing|offset|size|span|radius|diameter|run\b|rise\b/i, "ruler"],
  [/thickness/i, "wall"],
  [/materials?|finish|paint|surface|texture|cladding/i, "material"],
  [/colou?r|tint|temperature/i, "palette"],
  [/rotation|rotate|angle|azimuth|bearing|north|direction|heading/i, "rotate"],
  [/sun|daylight|shadow/i, "sun"],
  [/night|dark/i, "moon"],
  [/light|lamp|lumen|bright|beam angle/i, "bulb"],
  [/phase|renovation|demoli|existing/i, "history"],
  [/wall type|type|family|style of|kind|profile/i, "typesCat"],
  [/section|cut/i, "section"],
  [/scale/i, "scale"],
  [/render style|style|edges|faces|watermark/i, "skStyle"],
  [/fog/i, "eye"],
  [/furniture|sofa|chair|table|bed/i, "sofa"],
  [/roof|pitch|slope|overhang/i, "roof"],
  [/door|swing|hinge/i, "door"],
  [/window|glaz|glass|mullion|panel/i, "window"],
  [/stair|step|riser|tread|landing/i, "stairs"],
  [/railing|baluster|handrail/i, "railing"],
  [/ramp/i, "ramp"],
  [/column/i, "column"],
  [/beam/i, "beam"],
  [/slab|floor/i, "slab"],
  [/ceiling/i, "ceiling"],
  [/curtain/i, "curtainwall"],
  [/wall/i, "wall"],
  [/room|area|zone|space|department/i, "room"],
  [/grid/i, "grid"],
  [/axes|axis|gizmo|orientation/i, "axes"],
  [/dimension|measure|tape/i, "dimension"],
  [/ground|terrain|site|sandbox/i, "layers"],
  [/mass|solid|component|group/i, "box3d"],
  [/tag|label|text|note|name|number|mark|title|description|comment/i, "text"],
  [/layer|visible|show|hide|hidden/i, "eye"],
  [/camera|view|perspective|field of view|fov|lens/i, "camera"],
  [/scene|animation|transition|frame|play/i, "scenes"],
  [/units?\b|mm|metre|meter|feet|inch/i, "ruler"],
  [/cost|price|budget/i, "calculator"],
  [/classification|bim|ifc|property|properties|globalid|guid/i, "bim"],
  [/snap/i, "snap"],
  [/ortho/i, "ortho"],
  [/mirror|flip/i, "flip"],
  [/lock/i, "lock"],
  [/file|path|model|import/i, "file"],
  [/opacity|transparen|x-ray/i, "eye"],
  [/speed|smooth|zoom/i, "zoomIn"],
  [/language|lang/i, "globe"],
  [/theme/i, "palette"],
];

function iconFor(text, fallback) {
  const label = String(text || "").trim();
  const en = ENGLISH.get(label) || label;
  for (const [re, ic] of RULES) if (re.test(en)) return ic;
  return fallback;
}

const ICON_CLASS = "item-ico";
function badge(name) {
  const s = document.createElement("span");
  s.className = ICON_CLASS;
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = icon(name, 13);
  return s;
}

// Give one row its icon unless it has one already.
function decorate(root) {
  // Checkbox rows: <label class="check"><input><span>text</span></label>
  for (const row of root.querySelectorAll("label.check")) {
    if (row.querySelector(`.${ICON_CLASS}, svg, canvas, img`)) continue;
    const text = row.textContent;
    const box = row.querySelector("input");
    const ic = badge(iconFor(text, "check"));
    if (box && box.nextSibling) box.after(ic); else row.prepend(ic);
  }
  // Labelled fields: <… class="field"><span class="field-label">text</span>control</…>
  for (const lab of root.querySelectorAll(".field > .field-label")) {
    if (lab.querySelector(`.${ICON_CLASS}, svg`)) continue;
    const ctrl = lab.parentElement.querySelector("select, .stepper, input");
    const fallback = ctrl && ctrl.tagName === "SELECT" ? "list" : ctrl && ctrl.classList.contains("stepper") ? "ruler" : "text";
    lab.prepend(badge(iconFor(lab.textContent, fallback)));
  }
  // Property grids: label span, control, label span, control …
  for (const lab of root.querySelectorAll(".prop-grid > span:not(.prop-section):not(.prop-sub):not(.mono-val)")) {
    if (lab.querySelector(`.${ICON_CLASS}, svg`) || !lab.textContent.trim()) continue;
    const next = lab.nextElementSibling;
    if (!next || (next.tagName === "SPAN" && !next.classList.contains("mono-val"))) continue; // not a label → value pair
    const fallback = next.tagName === "SELECT" ? "list" : next.classList.contains("stepper") ? "ruler" : "text";
    lab.prepend(badge(iconFor(lab.textContent, fallback)));
  }
  // List rows (scenes and the like): a leading icon when they have none.
  for (const row of root.querySelectorAll(".net-row")) {
    if (row.querySelector(`.${ICON_CLASS}, svg, canvas, img`)) continue;
    row.prepend(badge(row.dataset.scene ? "scenes" : iconFor(row.textContent, "list")));
  }
}

export function watchItemIcons(...hosts) {
  for (const host of hosts) {
    if (!host) continue;
    decorate(host);
    let queued = false;
    const obs = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; obs.disconnect(); decorate(host); obs.observe(host, { childList: true, subtree: true }); });
    });
    obs.observe(host, { childList: true, subtree: true });
  }
}

export { iconFor };
