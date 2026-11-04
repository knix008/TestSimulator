// What can be designed: every widget and property. The inspector, the design engine and
// the C generator all read this table. The numeric ids mirror engine/runtime.c.

export const TYPE_IDS = {
  screen: 0, container: 1, label: 2, button: 3, checkbox: 4, switch: 5, slider: 6, bar: 7,
  arc: 8, dropdown: 9, roller: 10, textarea: 11, spinner: 12, led: 13,
};

export const PROP_IDS = {
  x: 1, y: 2, width: 3, height: 4, widthPct: 5, heightPct: 6, widthContent: 7, heightContent: 8,
  align: 9, hidden: 10, clickable: 11, scrollable: 12, checked: 13, disabled: 14,
  bgColor: 20, bgOpa: 21, borderColor: 22, borderWidth: 23, radius: 24, textColor: 25, font: 26, pad: 27,
  shadowWidth: 28, shadowColor: 29, opa: 30, gap: 31, indicatorColor: 32, flexFlow: 33,
  value: 42, selected: 43, ledBright: 44,
};

export const STR_IDS = { text: 1, placeholder: 2, options: 3 };
export const TRIGGERS = ["CLICKED", "PRESSED", "RELEASED", "VALUE_CHANGED"];
export const ACTION_IDS = { screen: 1, setText: 2, toggle: 3, log: 4, show: 5, hide: 6 };

/** Same order as ALIGNS in engine/runtime.c. */
export const ALIGNS = ["DEFAULT", "TOP_LEFT", "TOP_MID", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_MID", "BOTTOM_RIGHT", "LEFT_MID", "RIGHT_MID", "CENTER"];
/** Same order as FLOWS in engine/runtime.c. */
export const FLEX_FLOWS = ["ROW", "COLUMN", "ROW_WRAP", "COLUMN_WRAP"];
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

const POSITION = [
  { key: "x", kind: "int", group: "layout" },
  { key: "y", kind: "int", group: "layout" },
  { key: "width", kind: "size", group: "layout" },
  { key: "height", kind: "size", group: "layout" },
  { key: "align", kind: "enum", options: ALIGNS, group: "layout" },
];

const STYLE = [
  { key: "bgColor", kind: "color", group: "style" },
  { key: "bgOpa", kind: "int", min: 0, max: 255, group: "style" },
  { key: "borderColor", kind: "color", group: "style" },
  { key: "borderWidth", kind: "int", min: 0, max: 64, group: "style" },
  { key: "radius", kind: "int", min: 0, max: 400, group: "style" },
  { key: "pad", kind: "int", min: 0, max: 200, group: "style" },
  { key: "shadowWidth", kind: "int", min: 0, max: 100, group: "style" },
  { key: "shadowColor", kind: "color", group: "style" },
  { key: "opa", kind: "int", min: 0, max: 255, group: "style" },
];

const TEXT_STYLE = [
  { key: "textColor", kind: "color", group: "style" },
  { key: "font", kind: "enum", options: FONT_SIZES, group: "style" },
];

const FLAGS = [
  { key: "hidden", kind: "bool", group: "flags" },
  { key: "clickable", kind: "bool", group: "flags" },
  { key: "scrollable", kind: "bool", group: "flags" },
  { key: "disabled", kind: "bool", group: "flags" },
];

const FLEX = [
  { key: "flexFlow", kind: "enum", options: FLEX_FLOWS, group: "layout" },
  { key: "gap", kind: "int", min: 0, max: 200, group: "layout" },
];

const TEXT = { key: "text", kind: "text", group: "content" };
const OPTIONS = { key: "options", kind: "lines", group: "content" };
const SELECTED = { key: "selected", kind: "int", min: 0, max: 999, group: "content" };
const CHECKED = { key: "checked", kind: "bool", group: "content" };
const RANGE = [
  { key: "min", kind: "int", group: "content" },
  { key: "max", kind: "int", group: "content" },
  { key: "value", kind: "int", group: "content" },
  { key: "indicatorColor", kind: "color", group: "style" },
];

const widget = (icon, content, defaults) => ({
  icon,
  defaults,
  props: [...POSITION, ...content.filter((prop) => prop.group === "layout"), ...content.filter((prop) => prop.group === "content"), ...STYLE, ...content.filter((prop) => prop.group === "style"), ...FLAGS],
});

export const WIDGETS = {
  screen: {
    icon: "screen",
    defaults: {},
    props: [...FLEX, ...STYLE.filter((prop) => prop.key === "bgColor" || prop.key === "bgOpa" || prop.key === "pad")],
  },
  container: widget("container", [...FLEX, ...TEXT_STYLE], { width: 180, height: 110 }),
  label: widget("label", [TEXT, ...TEXT_STYLE], { text: "Label" }),
  button: widget("button", [TEXT, ...TEXT_STYLE], { width: 110, height: 44, text: "Button" }),
  checkbox: widget("checkbox", [TEXT, CHECKED, ...TEXT_STYLE], { text: "Checkbox" }),
  switch: widget("switch", [CHECKED, { key: "indicatorColor", kind: "color", group: "style" }], { width: 50, height: 26 }),
  slider: widget("slider", RANGE, { width: 180, height: 10, min: 0, max: 100, value: 40 }),
  bar: widget("bar", RANGE, { width: 180, height: 18, min: 0, max: 100, value: 60 }),
  arc: widget("arc", RANGE, { width: 110, height: 110, min: 0, max: 100, value: 50 }),
  dropdown: widget("dropdown", [OPTIONS, SELECTED, ...TEXT_STYLE], { width: 150, options: "Option 1\nOption 2\nOption 3" }),
  roller: widget("roller", [OPTIONS, SELECTED, ...TEXT_STYLE], { options: "Option 1\nOption 2\nOption 3" }),
  textarea: widget("textarea", [TEXT, { key: "placeholder", kind: "text", group: "content" }, ...TEXT_STYLE], { width: 180, height: 70, placeholder: "Text" }),
  spinner: widget("spinner", [{ key: "indicatorColor", kind: "color", group: "style" }], { width: 56, height: 56 }),
  led: widget("led", [{ key: "ledBright", kind: "int", min: 0, max: 255, group: "content" }], { width: 26, height: 26, ledBright: 255 }),
};

/** Palette order, Android Studio style: groups of related widgets. */
export const PALETTE = [
  { group: "common", items: ["label", "button", "container"] },
  { group: "input", items: ["textarea", "checkbox", "switch", "slider", "dropdown", "roller"] },
  { group: "display", items: ["bar", "arc", "spinner", "led"] },
];

export const CONTAINERS = new Set(["screen", "container"]);
export const DEVICES = [
  { id: "cyd", w: 320, h: 240 },
  { id: "portrait", w: 240, h: 320 },
  { id: "hvga", w: 480, h: 320 },
  { id: "wvga", w: 800, h: 480 },
  { id: "wsvga", w: 1024, h: 600 },
  { id: "square", w: 480, h: 480 },
];
