// What is wrong with a project: read from the document, so the list is always current, and
// from the compiler's output after a native build. Every entry says where it can be fixed.
import { ALIGNS, FLEX_FLOWS, TEXT_TARGETS, VALUE_SOURCES, VALUE_TARGETS, availableIn } from "./schema.js";
import { cNames } from "./emit.js";
import { sanitizeName, walk } from "./project.js";
import { engineFor } from "./versions.js";
import { depthOfFormat, disabledWidgetOption } from "./lvconf.js";
import { fontData } from "./fonts.js";

const NO_OVERLAP_CHECK = new Set(["keyboard", "msgbox"]);

function sizeOf(value, whole) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (text.endsWith("%")) return whole === null ? null : (whole * (Number.parseInt(text, 10) || 0)) / 100;
  return /^-?\d+$/.test(text) ? Number(text) : null;
}

/** Where a node sits inside its parent, or null when only LVGL's layout can tell. */
function boxOf(node, parent) {
  const width = sizeOf(node.props.width, parent.w);
  const height = sizeOf(node.props.height, parent.h);
  if (width === null || height === null || parent.w === null || parent.h === null) return null;
  const align = ALIGNS.includes(node.props.align) ? node.props.align : "DEFAULT";
  const across = /RIGHT/.test(align) ? parent.w - width : /MID|CENTER/.test(align) && !/LEFT/.test(align) ? (parent.w - width) / 2 : 0;
  const down = /BOTTOM/.test(align) ? parent.h - height : /LEFT_MID|RIGHT_MID|CENTER/.test(align) ? (parent.h - height) / 2 : 0;
  const x = across + (Number(node.props.x) || 0);
  const y = down + (Number(node.props.y) || 0);
  return { x, y, w: width, h: height };
}

const ROUND_WIDGETS = new Set(["arc", "spinner", "meter", "colorwheel", "led"]);
/** A round widget must fit the display as a circle; any other one with all its corners. */
function outsideCircle(type, box, radius) {
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  if (ROUND_WIDGETS.has(type)) return Math.hypot(cx - radius, cy - radius) + Math.max(box.w, box.h) / 2 > radius + 0.5;
  return [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].some(([x, y]) => Math.hypot(x - radius, y - radius) > radius + 0.5);
}

const contains = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
const touches = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function gridCells(grid) {
  const columns = Math.max(1, String(grid.props.gridColumns ?? "").split(",").length);
  return grid.children.map((node, index) => ({
    node,
    column: node.props.gridCol === undefined ? index % columns : Number(node.props.gridCol) || 0,
    columnSpan: Number(node.props.gridColSpan) || 1,
    row: node.props.gridRow === undefined ? Math.floor(index / columns) : Number(node.props.gridRow) || 0,
    rowSpan: Number(node.props.gridRowSpan) || 1,
  }));
}

/** Finds the problems of a project. `installed` lists the LVGL versions on this computer. */
export function findProblems(project, { installed = null } = {}) {
  const list = [];
  const version = project.lvgl;
  const names = cNames(project);
  const nodes = new Map();
  const screens = new Map();
  for (const screen of project.screens) walk({ screens: [screen] }, (node) => {
    nodes.set(node.id, node);
    screens.set(node.id, screen);
  });
  const images = new Set((project.images ?? []).map((image) => image.name));
  const exists = (id) => nodes.has(id);
  const add = (severity, code, node, params = {}) => {
    const available = node ? availableIn(node.type, version) : false;
    list.push({
      key: `${code}:${node?.id ?? ""}:${Object.values(params).join("|")}`,
      severity,
      code,
      params: { version, ...params },
      node: node?.id ?? null,
      nodeName: node?.name ?? "",
      type: node?.type ?? null,
      screen: node ? screens.get(node.id)?.name ?? "" : "",
      hasCode: available,
    });
  };

  if (!engineFor(version).exact) add("info", "engineClose", null, { engine: engineFor(version).engine });
  if (installed && !installed.includes(version)) list.push({ key: "notInstalled", severity: "info", code: "notInstalled", params: { version }, node: null, nodeName: "", type: null, screen: "", hasCode: false, manager: true });

  const seenName = new Map();
  walk(project, (node, parent) => {
    const known = sanitizeName(node.name).toLowerCase();
    if (seenName.has(known)) add("warning", "nameClash", node, { other: seenName.get(known), generated: names.get(node.id) });
    else seenName.set(known, node.name);

    if (!availableIn(node.type, version)) {
      add("error", "widgetVersion", node);
      return;
    }
    if (node.type === "image" || node.type === "imagebutton") {
      if (!node.props.src) add("warning", "imageEmpty", node);
      else if (!images.has(node.props.src)) add("error", "imageMissing", node, { image: node.props.src });
    }
    if (node.type === "animimage") {
      const frames = String(node.props.frames ?? "").split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
      if (!frames.length) add("warning", "imageEmpty", node);
      for (const frame of frames) if (!images.has(frame)) add("error", "imageMissing", node, { image: frame });
    }
    if (node.type === "keyboard" && node.props.target && !exists(node.props.target)) add("warning", "keyboardTarget", node);
    if (node.props.min !== undefined && node.props.max !== undefined) {
      const [min, max] = [Number(node.props.min), Number(node.props.max)];
      if (min >= max) add("warning", "range", node, { min, max });
      else if (node.props.value !== undefined && (Number(node.props.value) < min || Number(node.props.value) > max)) add("warning", "valueRange", node, { value: node.props.value, min, max });
    }
    node.events.forEach((event, index) => {
      if (event.action === "log") return;
      if (!exists(event.target)) add("error", "eventTarget", node, { event: index + 1, action: event.action });
      else if (!availableIn(nodes.get(event.target).type, version)) add("error", "eventTargetVersion", node, { event: index + 1, target: nodes.get(event.target).name });
    });
    void parent;
  });

  // Two children of one grid in one cell, and cells the grid does not have.
  walk(project, (node) => {
    if (node.type !== "grid" || !availableIn("grid", version)) return;
    const columns = Math.max(1, String(node.props.gridColumns ?? "").split(",").length);
    const rows = Math.max(1, String(node.props.gridRows ?? "").split(",").length);
    const taken = new Map();
    for (const cell of gridCells(node)) {
      if (!availableIn(cell.node.type, version)) continue;
      if (cell.column + cell.columnSpan > columns || cell.row + cell.rowSpan > rows) add("warning", "gridCell", cell.node, { column: cell.column, row: cell.row, columns, rows });
      for (let c = cell.column; c < cell.column + cell.columnSpan; c++) {
        for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
          const at = `${c},${r}`;
          if (taken.has(at)) add("warning", "gridOverlap", cell.node, { other: taken.get(at), column: c, row: r });
          else taken.set(at, cell.node.name);
        }
      }
    }
  });

  // Value actions on widgets that have no value, or that cannot show one.
  walk(project, (node) => {
    for (const event of node.events) {
      const target = nodes.get(event.target);
      if (event.action === "setValue" && (!VALUE_SOURCES.has(node.type) || (target && !VALUE_TARGETS.has(target.type)))) add("warning", "eventValue", node, {});
      if (event.action === "showValue" && (!VALUE_SOURCES.has(node.type) || (target && !TEXT_TARGETS.has(target.type)))) add("warning", "eventValue", node, {});
    }
  });

  // Fonts: a file that is gone, and characters the font in effect does not have.
  const fontNamed = (name) => (project.fonts ?? []).find((font) => font.name === name);
  for (const font of project.fonts ?? []) {
    if (!fontData(font.name)) add("error", "fontFile", null, { name: font.name, file: font.file });
  }
  if (project.defaultFont && !fontNamed(project.defaultFont.font)) add("warning", "fontMissing", null, { name: project.defaultFont.font });
  if (project.lvConf?.LV_USE_TINY_TTF === "0" && project.fonts?.length) add("error", "confTtf", null, { option: "LV_USE_TINY_TTF" });
  const hasCharacter = (fontName, face) => {
    const faces = fontData(fontName)?.info.faces;
    return faces ? faces[face]?.has ?? null : null;
  };
  const BUILT_IN = (code) => (code >= 0x20 && code <= 0x7e) || code === 0xb0 || code === 0x2022 || (code >= 0xf000 && code <= 0xf8ff);
  const standardFont = project.defaultFont ? fontNamed(project.defaultFont.font) : null;
  // A project font falls back on the built-in one, so what that has shows too.
  const withBuiltIn = (has) => (code) => has(code) || BUILT_IN(code);
  const standardHas = standardFont && hasCharacter(standardFont.name, standardFont.face);
  const standard = standardHas ? withBuiltIn(standardHas) : BUILT_IN;
  const TEXT_PROPS = ["text", "title", "placeholder", "options", "items", "cells", "tabs", "tiles", "menuItems", "spans", "map", "buttons"];
  const visitText = (node, inherited) => {
    let current = inherited;
    if (node.props.fontFamily !== undefined) {
      const font = fontNamed(node.props.fontFamily);
      const has = font && hasCharacter(font.name, font.face);
      if (has) current = withBuiltIn(has);
      else if (font) current = BUILT_IN;
      if (!font) add("warning", "fontMissing", node, { name: node.props.fontFamily });
    } else if (node.props.font !== undefined) {
      current = standard;
    }
    if (availableIn(node.type, version)) {
      const missing = new Set();
      for (const key of TEXT_PROPS) {
        for (const character of String(node.props[key] ?? "")) {
          const code = character.codePointAt(0);
          if (code >= 0x20 && !current(code)) missing.add(character);
        }
      }
      if (missing.size) add("warning", "fontGlyphs", node, { characters: [...missing].slice(0, 8).join(" ") });
    }
    for (const child of node.children) visitText(child, current);
  };
  for (const screen of project.screens) visitText(screen, standard);

  // What project.lvConf turned off, but the design uses: the native build would fail on it.
  const conf = project.lvConf;
  if (conf) {
    if (conf.LV_USE_THEME_DEFAULT === "0") add("error", "confTheme", null, { option: "LV_USE_THEME_DEFAULT" });
    if (conf.LV_COLOR_DEPTH !== undefined && ![16, 24, 32].includes(Number(conf.LV_COLOR_DEPTH))) add("warning", "confDepth", null, { depth: conf.LV_COLOR_DEPTH });
    if (conf.LV_COLOR_16_SWAP === "1") add("warning", "confSwap", null, { option: "LV_COLOR_16_SWAP" });
    if (conf.LV_COLOR_FORMAT_DEFAULT !== undefined && depthOfFormat(conf.LV_COLOR_FORMAT_DEFAULT) < 16) add("warning", "confDepth", null, { depth: conf.LV_COLOR_FORMAT_DEFAULT });
    if (/SWAPPED/.test(conf.LV_COLOR_FORMAT_DEFAULT ?? "")) add("warning", "confSwap", null, { option: "LV_COLOR_FORMAT_DEFAULT" });
    const standard = /^(?:&lv_font_montserrat_|LV_FONT_DEFAULT_MONTSERRAT_)(\d+)$/.exec(conf.LV_FONT_DEFAULT ?? "&lv_font_montserrat_14")?.[1];
    if (standard && conf[`LV_FONT_MONTSERRAT_${standard}`] === "0") add("error", "confFontDefault", null, { option: `LV_FONT_MONTSERRAT_${standard}` });
    walk(project, (node) => {
      if (!availableIn(node.type, version)) return;
      const widget = disabledWidgetOption(node.type, conf);
      if (widget) add("error", "confWidget", node, { option: widget });
      if (node.props.font !== undefined && node.props.fontFamily === undefined && conf[`LV_FONT_MONTSERRAT_${node.props.font}`] === "0") add("error", "confFont", node, { option: `LV_FONT_MONTSERRAT_${node.props.font}` });
      if (node.props.flexFlow !== undefined && conf.LV_USE_FLEX === "0") add("error", "confLayout", node, { option: "LV_USE_FLEX" });
      if (node.type === "grid" && conf.LV_USE_GRID === "0") add("error", "confLayout", node, { option: "LV_USE_GRID" });
    });
  }

  // Positions: only what can be worked out without LVGL's layout.
  const visit = (node, size, isScreen) => {
    if (node.type !== "screen" && node.type !== "container") return;
    const flowing = FLEX_FLOWS.includes(node.props.flexFlow);
    const placed = [];
    for (const child of node.children) {
      if (!availableIn(child.type, version)) continue;
      const box = flowing ? null : boxOf(child, size);
      if (box && !child.props.hidden && !NO_OVERLAP_CHECK.has(child.type)) {
        if (isScreen && project.device.shape === "round" && outsideCircle(child.type, box, size.w / 2)) add("warning", "roundOutside", child, {});
        if (isScreen) {
          const whole = { x: 0, y: 0, w: size.w, h: size.h };
          if (!touches(whole, box)) add("warning", "offScreen", child, { w: size.w, h: size.h });
          else if (!contains(whole, box)) add("warning", "partlyOff", child, { w: size.w, h: size.h });
        }
        for (const other of placed) {
          if (touches(box, other.box) && !contains(box, other.box) && !contains(other.box, box)) add("warning", "overlap", child, { other: other.node.name });
        }
        placed.push({ node: child, box });
      }
      visit(child, box ? { w: box.w, h: box.h } : { w: null, h: null }, false);
    }
  };
  for (const screen of project.screens) visit(screen, { w: project.device.w, h: project.device.h }, true);

  const order = { error: 0, warning: 1, info: 2 };
  return list.sort((a, b) => order[a.severity] - order[b.severity]);
}

const PROJECT_FILE = /(?:^|\/)(src\/main\.c|src\/ui\/[^:]+\.[ch]|config\/lv_conf\.h):(\d+)(?::\d+)?:\s*(fatal error|error|warning):\s*(.*)$/;
const OTHER_ERROR = /^(.+?\.(?:c|h|cpp|cmake)):(\d+)(?::\d+)?:\s*(?:fatal )?error:\s*(.*)$/;

/** Compiler messages as problems. Only those in the project's own files lead to code. */
export function parseBuildProblems(lines) {
  const list = [];
  const seen = new Set();
  const add = (severity, text, file = null, line = 0, where = "") => {
    const key = `build:${file ?? where}:${line}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ key, severity, code: "build", params: { text }, node: null, nodeName: "", type: null, screen: "", hasCode: !!file, file, line, where: file ? `${file}:${line}` : where });
  };
  for (const raw of lines) {
    const text = String(raw).replace(/\\/g, "/").trim();
    const own = PROJECT_FILE.exec(text);
    if (own) {
      add(own[3] === "warning" ? "warning" : "error", own[4], own[1], Number(own[2]));
      continue;
    }
    const other = OTHER_ERROR.exec(text);
    if (other) add("error", other[3], null, 0, `${other[1].split("/").pop()}:${other[2]}`);
    else if (/undefined reference to/.test(text)) add("error", text.slice(text.indexOf("undefined reference")));
    else if (/^CMake Error/.test(text)) add("error", text);
  }
  return list;
}

/** The place in the generated code where an object is made. */
export function locateInCode(files, name) {
  const escaped = name.replace(/[^A-Za-z0-9_]/g, "");
  for (const pattern of [new RegExp(`\\b${escaped}\\s*=[^=]`), new RegExp(`\\b${escaped}\\b`)]) {
    for (const [file, text] of Object.entries(files)) {
      const index = text.split("\n").findIndex((line) => pattern.test(line));
      if (index >= 0) return { file, line: index + 1 };
    }
  }
  return null;
}
