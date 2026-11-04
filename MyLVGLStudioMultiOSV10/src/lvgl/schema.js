import { compareVersions } from "./versions.js";

// What can be designed: every widget and property. The inspector, the design engine and
// the C generator all read this table. The numeric ids mirror engine/runtime.c.

export const TYPE_IDS = {
  screen: 0, container: 1, label: 2, button: 3, checkbox: 4, switch: 5, slider: 6, bar: 7,
  arc: 8, dropdown: 9, roller: 10, textarea: 11, spinner: 12, led: 13,
  image: 14, line: 15, list: 16, table: 17, chart: 18, tabview: 19, keyboard: 20, calendar: 21, spinbox: 22, buttonmatrix: 23,
  imagebutton: 24, animimage: 25, canvas: 26, msgbox: 27, win: 28, tileview: 29, menu: 30, span: 31, colorwheel: 32, meter: 33,
  scale: 34, qrcode: 35, barcode: 36, arclabel: 37, grid: 38,
};

export const PROP_IDS = {
  x: 1, y: 2, width: 3, height: 4, widthPct: 5, heightPct: 6, widthContent: 7, heightContent: 8,
  align: 9, hidden: 10, clickable: 11, scrollable: 12, checked: 13, disabled: 14,
  bgColor: 20, bgOpa: 21, borderColor: 22, borderWidth: 23, radius: 24, textColor: 25, font: 26, pad: 27,
  shadowWidth: 28, shadowColor: 29, opa: 30, gap: 31, indicatorColor: 32, flexFlow: 33,
  value: 42, selected: 43, ledBright: 44, rotation: 45, scale: 46, lineColor: 47, lineWidth: 48, columnWidth: 49, chartType: 50, image: 51, scaleMode: 52, totalTicks: 53, majorEvery: 54, duration: 55,
};

export const STR_IDS = { text: 1, placeholder: 2, options: 3, items: 4, cells: 5, series: 6, tabs: 7, map: 8, points: 9, title: 10, buttons: 11, tiles: 12, menuItems: 13, spans: 14, frames: 15 };
export const TRIGGERS = ["CLICKED", "PRESSED", "RELEASED", "VALUE_CHANGED"];
export const ACTION_IDS = { screen: 1, setText: 2, toggle: 3, log: 4, show: 5, hide: 6 };

/** Same order as ALIGNS in engine/runtime.c. */
export const ALIGNS = ["DEFAULT", "TOP_LEFT", "TOP_MID", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_MID", "BOTTOM_RIGHT", "LEFT_MID", "RIGHT_MID", "CENTER"];
/** Same order as FLOWS in engine/runtime.c. */
export const FLEX_FLOWS = ["ROW", "COLUMN", "ROW_WRAP", "COLUMN_WRAP"];
/** Same order as P_CHART_TYPE in engine/runtime.c. */
export const CHART_TYPES = ["LINE", "BAR"];
/** Same order as P_SCALE_MODE in engine/runtime.c. */
export const SCALE_MODES = ["HORIZONTAL_BOTTOM", "ROUND_INNER"];
/** Same order as SERIES_COLORS in engine/runtime.c. */
export const SERIES_COLORS = [0x2196f3, 0xf44336, 0x4caf50, 0xff9800];
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
  image: widget("image", [
    { key: "src", kind: "image", group: "content" },
    { key: "rotation", kind: "int", min: 0, max: 359, group: "content" },
    { key: "scale", kind: "int", min: 10, max: 800, group: "content" },
  ], { width: 80, height: 80 }),
  line: widget("line", [
    { key: "points", kind: "text", group: "content" },
    { key: "lineColor", kind: "color", group: "style" },
    { key: "lineWidth", kind: "int", min: 1, max: 64, group: "style" },
  ], { points: "0,0 60,40 120,10", lineWidth: 3 }),
  list: widget("list", [{ key: "items", kind: "lines", group: "content" }, ...TEXT_STYLE], { width: 160, height: 150, items: "#Section\nItem 1\nItem 2\nItem 3" }),
  table: widget("table", [
    { key: "cells", kind: "lines", group: "content" },
    { key: "columnWidth", kind: "int", min: 20, max: 800, group: "content" },
    ...TEXT_STYLE,
  ], { width: 240, height: 120, cells: "Name,Value\nA,1\nB,2", columnWidth: 110 }),
  chart: widget("chart", [
    { key: "chartType", kind: "enum", options: CHART_TYPES, group: "content" },
    { key: "series", kind: "lines", group: "content" },
    { key: "min", kind: "int", group: "content" },
    { key: "max", kind: "int", group: "content" },
  ], { width: 220, height: 130, chartType: "LINE", series: "10,40,30,70,50,90\n60,20,50,30,80,40", min: 0, max: 100 }),
  tabview: widget("tabview", [{ key: "tabs", kind: "lines", group: "content" }], { width: 240, height: 150, tabs: "Tab 1\nTab 2\nTab 3" }),
  keyboard: widget("keyboard", [{ key: "target", kind: "target", group: "content" }], { width: "100%", height: "40%", align: "TOP_LEFT" }),
  calendar: widget("calendar", [
    { key: "year", kind: "int", min: 1970, max: 2099, group: "content" },
    { key: "month", kind: "int", min: 1, max: 12, group: "content" },
    { key: "day", kind: "int", min: 1, max: 31, group: "content" },
  ], { width: 220, height: 200, year: 2026, month: 1, day: 15 }),
  spinbox: widget("spinbox", [
    { key: "min", kind: "int", group: "content" },
    { key: "max", kind: "int", group: "content" },
    { key: "value", kind: "int", group: "content" },
    { key: "digits", kind: "int", min: 1, max: 10, group: "content" },
    { key: "separator", kind: "int", min: 0, max: 9, group: "content" },
    ...TEXT_STYLE,
  ], { width: 110, min: -9999, max: 9999, value: 120, digits: 4, separator: 2 }),
  buttonmatrix: widget("buttonmatrix", [{ key: "map", kind: "lines", group: "content" }], { width: 200, height: 110, map: "1,2,3\n4,5,6" }),
  imagebutton: widget("imagebutton", [{ key: "src", kind: "image", group: "content" }], { width: 80, height: 80 }),
  animimage: widget("animimage", [
    { key: "frames", kind: "lines", group: "content" },
    { key: "duration", kind: "int", min: 10, max: 60000, group: "content" },
  ], { width: 80, height: 80, duration: 1000 }),
  canvas: widget("canvas", [
    { key: "canvasW", kind: "int", min: 1, max: 1024, group: "content" },
    { key: "canvasH", kind: "int", min: 1, max: 1024, group: "content" },
    { key: "canvasColor", kind: "color", group: "content" },
  ], { canvasW: 100, canvasH: 80, canvasColor: "#c8e6ff" }),
  msgbox: widget("msgbox", [
    { key: "title", kind: "text", group: "content" },
    TEXT,
    { key: "buttons", kind: "text", group: "content" },
  ], { width: 220, align: "TOP_LEFT", title: "Title", text: "Message", buttons: "OK,Cancel" }),
  win: widget("win", [{ key: "title", kind: "text", group: "content" }, TEXT], { width: 220, height: 150, title: "Window", text: "Content" }),
  tileview: widget("tileview", [{ key: "tiles", kind: "lines", group: "content" }], { width: 200, height: 120, tiles: "Tile 1\nTile 2" }),
  menu: widget("menu", [{ key: "menuItems", kind: "lines", group: "content" }], { width: 220, height: 140, menuItems: "Item 1\nItem 2" }),
  span: widget("span", [{ key: "spans", kind: "lines", group: "content" }, ...TEXT_STYLE], { width: 180, height: 60, spans: "Hello \nLVGL" }),
  colorwheel: { ...widget("colorwheel", [], { width: 120, height: 120 }), until: "8.99.99" },
  meter: {
    ...widget("meter", [{ key: "min", kind: "int", group: "content" }, { key: "max", kind: "int", group: "content" }, { key: "value", kind: "int", group: "content" }], { width: 160, height: 160, min: 0, max: 100, value: 40 }),
    until: "8.99.99",
  },
  scale: {
    ...widget("scale", [
      { key: "scaleMode", kind: "enum", options: SCALE_MODES, group: "content" },
      { key: "min", kind: "int", group: "content" },
      { key: "max", kind: "int", group: "content" },
      { key: "totalTicks", kind: "int", min: 2, max: 200, group: "content" },
      { key: "majorEvery", kind: "int", min: 1, max: 100, group: "content" },
    ], { width: 200, height: 60, scaleMode: "HORIZONTAL_BOTTOM", min: 0, max: 100, totalTicks: 21, majorEvery: 5 }),
    since: "9.0.0",
  },
  qrcode: widget("qrcode", [TEXT, { key: "qrSize", kind: "int", min: 20, max: 1000, group: "content" }], { qrSize: 100, text: "https://lvgl.io" }),
  barcode: { ...widget("barcode", [TEXT], { width: 200, height: 60, text: "LVGL" }), since: "9.0.0" },
  arclabel: { ...widget("arclabel", [TEXT], { width: 150, height: 150, text: "LVGL arc label" }), since: "9.4.0" },
  grid: widget("gridIcon", [
    { key: "gridColumns", kind: "text", group: "layout" },
    { key: "gridRows", kind: "text", group: "layout" },
    { key: "gap", kind: "int", min: 0, max: 200, group: "layout" },
  ], { width: 220, height: 130, gridColumns: "1fr,1fr", gridRows: "1fr,1fr" }),
};

/** Palette order, Android Studio style: groups of related widgets. */
export const PALETTE = [
  { group: "common", items: ["label", "button", "image", "imagebutton", "animimage", "line", "canvas", "span", "arclabel"] },
  { group: "layout", items: ["container", "grid", "tabview", "tileview", "win", "menu", "msgbox"] },
  { group: "input", items: ["textarea", "keyboard", "checkbox", "switch", "slider", "spinbox", "dropdown", "roller", "buttonmatrix", "colorwheel"] },
  { group: "display", items: ["bar", "arc", "spinner", "led", "chart", "meter", "scale", "list", "table", "calendar", "qrcode", "barcode"] },
];

export const CONTAINERS = new Set(["screen", "container", "grid"]);

/** Where a child of a Grid sits. Without them it takes the next free cell. */
export const GRID_CELL_PROPS = [
  { key: "gridCol", kind: "int", min: 0, max: 99, group: "layout" },
  { key: "gridRow", kind: "int", min: 0, max: 99, group: "layout" },
  { key: "gridColSpan", kind: "int", min: 1, max: 99, group: "layout" },
  { key: "gridRowSpan", kind: "int", min: 1, max: 99, group: "layout" },
];

/** True when this LVGL version has the widget; some exist only in v8 or only in v9. */
export function availableIn(type, version) {
  const { since, until } = WIDGETS[type] ?? {};
  if (since && compareVersions(version, since) < 0) return false;
  return !(until && compareVersions(version, until) > 0);
}
export const DEVICES = [
  { id: "cyd", w: 320, h: 240 },
  { id: "portrait", w: 240, h: 320 },
  { id: "hvga", w: 480, h: 320 },
  { id: "wvga", w: 800, h: 480 },
  { id: "wsvga", w: 1024, h: 600 },
  { id: "square", w: 480, h: 480 },
];
