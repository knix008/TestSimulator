// The way back from C to the design: reads what the code view holds and changes the project.
// It reads the form codegen.js prints, plus a few everyday spellings (lv_obj_set_pos,
// lv_obj_set_size, lv_obj_align, older function names). It is not a C compiler: anything else
// is an error with a line number, and nothing is applied, so no edit is ever lost silently.
//
// A change is what differs between the code as generated now and the edited code. Properties
// the code does not show (a keyboard's target, events, widgets this LVGL version lacks) stay.
import { ALIGNS, CHART_TYPES, CONTAINERS, FLEX_FLOWS, FONT_SIZES, GRID_CELL_PROPS, SCALE_MODES, WIDGETS, availableIn, normalDevice } from "./schema.js";
import { generateCode, SCREENS_DIR, UI_DIR } from "./codegen.js";
import { cNames } from "./emit.js";
import { removeNode, sanitizeName, walk } from "./project.js";
import { overridesFromText, validConfName, validConfValue } from "./lvconf.js";

const MAIN_FILE = "src/main.c";
const UI_FILE = `${UI_DIR}/ui.c`;
const CONF_FILE = "config/lv_conf.h";
const MIN_DEVICE = 32;
const MAX_DEVICE = 4096;

/** Files whose edits reach the design. Everything else is derived from them. */
export function isEditableCode(file) {
  return file === MAIN_FILE || file === UI_FILE || file === CONF_FILE || (file.startsWith(`${SCREENS_DIR}/`) && file.endsWith(".c"));
}

class CodeError extends Error {
  constructor(code, line, params = {}) {
    super(code);
    this.code = code;
    this.line = line;
    this.params = params;
  }
}

/* ------------------------------------------------------------- statements */

/** Splits a screen file into the statements of its one function, each with its line. */
function statementsOf(text) {
  const statements = [];
  let screen = null;
  let inside = false;
  let finished = false;
  let blocks = 0;
  let parens = 0;
  let initializer = 0;
  let buffer = "";
  let line = 1;
  let start = 1;
  const push = () => {
    const body = buffer.replace(/\s+/g, " ").trim();
    buffer = "";
    return body;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "\n") line++;
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      line++;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new CodeError("syntax", line);
      for (let k = i; k < end; k++) if (text[k] === "\n") line++;
      i = end + 1;
      continue;
    }
    if (c === "#" && !inside && buffer.trim() === "") {
      while (i + 1 < text.length && text[i + 1] !== "\n") i++;
      continue;
    }
    if (buffer.trim() === "" && !/\s/.test(c)) start = line;
    if (c === '"') {
      let k = i + 1;
      while (k < text.length && text[k] !== '"' && text[k] !== "\n") k += text[k] === "\\" ? 2 : 1;
      if (text[k] !== '"') throw new CodeError("syntax", line);
      buffer += text.slice(i, k + 1);
      i = k;
      continue;
    }
    if (c === "(") parens++;
    if (c === ")") {
      parens--;
      if (parens < 0) throw new CodeError("syntax", line);
    }
    if (c === "{") {
      if (parens > 0 || initializer > 0 || /=\s*$/.test(buffer)) {
        initializer++;
        buffer += c;
        continue;
      }
      if (!inside) {
        const head = /^void\s+ui_(\w+)_create\s*\(\s*void\s*\)$/.exec(push());
        if (!head || finished) throw new CodeError("syntax", start);
        screen = `ui_${head[1]}`;
        inside = true;
        continue;
      }
      if (buffer.trim() !== "") throw new CodeError("syntax", start);
      blocks++;
      continue;
    }
    if (c === "}") {
      if (initializer > 0) {
        initializer--;
        buffer += c;
        continue;
      }
      if (parens > 0 || buffer.trim() !== "" || !inside) throw new CodeError("syntax", start);
      if (blocks > 0) {
        blocks--;
        continue;
      }
      inside = false;
      finished = true;
      continue;
    }
    if (c === ";" && parens === 0 && initializer === 0) {
      const body = push();
      if (!inside) throw new CodeError("unknown", start, { text: body });
      if (body) statements.push({ text: body, line: start });
      continue;
    }
    buffer += c;
  }
  if (inside || parens !== 0 || initializer !== 0 || !finished) throw new CodeError("syntax", line);
  if (buffer.trim() !== "") throw new CodeError("syntax", start);
  return { screen, statements };
}

/** Top-level arguments of a call. */
function splitArgs(text) {
  const args = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let k = i + 1;
      while (k < text.length && text[k] !== '"') k += text[k] === "\\" ? 2 : 1;
      current += text.slice(i, k + 1);
      i = k;
      continue;
    }
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  if (current.trim() !== "") args.push(current.trim());
  return args;
}

const CALL = /^(\w+)\s*\((.*)\)$/;

/** The closing bracket of a call must be its last character; otherwise a ";" went missing. */
function closesAtEnd(body) {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '"') {
      i++;
      while (i < body.length && body[i] !== '"') i += body[i] === "\\" ? 2 : 1;
      continue;
    }
    if (body[i] === "(") depth++;
    if (body[i] === ")" && --depth === 0 && i !== body.length - 1) return false;
  }
  return true;
}

function decodeString(literal, line) {
  if (!/^"(?:[^"\\]|\\.)*"$/.test(literal)) throw new CodeError("string", line, { text: literal });
  return literal.slice(1, -1).replace(/\\(.)/g, (_, c) => ({ n: "\n", t: "\t" }[c] ?? c));
}

function int(text, line) {
  const value = String(text).trim();
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  if (value === "LV_OPA_COVER") return 255;
  if (value === "LV_OPA_TRANSP") return 0;
  throw new CodeError("number", line, { text: value });
}

function colour(text, line) {
  const match = /^lv_color_hex\(\s*(0x[0-9a-f]{1,6})\s*\)$/i.exec(String(text).trim());
  if (!match) throw new CodeError("colour", line, { text });
  return `#${Number.parseInt(match[1], 16).toString(16).padStart(6, "0")}`;
}

function size(text, line) {
  const value = String(text).trim();
  if (value === "LV_SIZE_CONTENT") return "content";
  const percent = /^(?:lv_pct|LV_PCT)\(\s*(-?\d+)\s*\)$/.exec(value);
  if (percent) return `${percent[1]}%`;
  return int(value, line);
}

function enumValue(text, prefix, options, line) {
  const value = String(text).trim();
  const name = value.startsWith(prefix) ? value.slice(prefix.length) : null;
  if (name === null || !options.includes(name)) throw new CodeError("unknown", line, { text: value });
  return name;
}

function imageName(text, line) {
  const match = /^&ui_img_(\w+)$/.exec(String(text).trim());
  if (!match) throw new CodeError("unknown", line, { text });
  return match[1];
}

/* ---------------------------------------------------------------- the file */

const CREATE = {
  lv_label_create: "label", lv_btn_create: "button", lv_button_create: "button", lv_checkbox_create: "checkbox", lv_switch_create: "switch",
  lv_slider_create: "slider", lv_bar_create: "bar", lv_arc_create: "arc", lv_dropdown_create: "dropdown", lv_roller_create: "roller",
  lv_textarea_create: "textarea", lv_spinner_create: "spinner", lv_led_create: "led", lv_img_create: "image", lv_image_create: "image",
  lv_line_create: "line", lv_list_create: "list", lv_table_create: "table", lv_chart_create: "chart", lv_tabview_create: "tabview",
  lv_keyboard_create: "keyboard", lv_calendar_create: "calendar", lv_spinbox_create: "spinbox", lv_btnmatrix_create: "buttonmatrix",
  lv_buttonmatrix_create: "buttonmatrix", lv_imgbtn_create: "imagebutton", lv_imagebutton_create: "imagebutton", lv_animimg_create: "animimage",
  lv_canvas_create: "canvas", lv_msgbox_create: "msgbox", lv_win_create: "win", lv_tileview_create: "tileview", lv_menu_create: "menu",
  lv_spangroup_create: "span", lv_colorwheel_create: "colorwheel", lv_meter_create: "meter", lv_scale_create: "scale", lv_qrcode_create: "qrcode",
  lv_barcode_create: "barcode", lv_arclabel_create: "arclabel", lv_obj_create: "container",
};

/** Calls that follow from the design rather than saying something about it. */
const DERIVED = new Set([
  "lv_chart_set_point_count", "lv_table_set_row_cnt", "lv_table_set_col_cnt", "lv_table_set_row_count", "lv_table_set_column_count",
  "lv_obj_set_grid_dsc_array", "lv_line_set_points", "lv_btnmatrix_set_map", "lv_buttonmatrix_set_map", "lv_menu_set_page", "lv_animimg_set_src",
  "lv_animimg_set_repeat_count", "lv_animimg_start", "lv_obj_update_layout", "lv_calendar_set_showed_date", "lv_calendar_set_month_shown",
  "lv_arclabel_set_angle_start", "lv_arclabel_set_angle_size", "lv_arclabel_set_radius", "lv_scale_set_label_show",
  "lv_meter_set_scale_ticks", "lv_meter_set_scale_major_ticks",
]);

const STYLE = {
  bg_opa: ["bgOpa", int], border_color: ["borderColor", colour], border_width: ["borderWidth", int], radius: ["radius", int],
  text_color: ["textColor", colour], pad_all: ["pad", int], shadow_width: ["shadowWidth", int], shadow_color: ["shadowColor", colour],
  opa: ["opa", int], pad_gap: ["gap", int], line_color: ["lineColor", colour], line_width: ["lineWidth", int],
};

const FLAGS = { LV_OBJ_FLAG_HIDDEN: "hidden", LV_OBJ_FLAG_CLICKABLE: "clickable", LV_OBJ_FLAG_SCROLLABLE: "scrollable" };
const STATES = { LV_STATE_CHECKED: "checked", LV_STATE_DISABLED: "disabled" };

/** Reads a screen file into objects: name, type, parent, and the properties the code gives it. */
export function readScreenCode(text) {
  const { screen, statements } = statementsOf(text);
  const objects = new Map();
  const aliases = new Map();
  let menu = null;

  const set = (object, key, value, line) => {
    object.props[key] = value;
    object.lines[key] = line;
  };
  const push = (object, key, value, line, joiner = "\n") => {
    object.props[key] = object.props[key] === undefined ? value : `${object.props[key]}${joiner}${value}`;
    object.lines[key] ??= line;
  };
  const object = (name, line) => {
    const found = objects.get(name) ?? aliases.get(name);
    if (!found) throw new CodeError("noObject", line, { name });
    return found;
  };

  /** `static` declarations: the arrays some widgets keep. */
  const declaration = (body, line) => {
    const buffer = /^static uint8_t (\w+)_buffer\[\d+\]$/.exec(body);
    if (buffer) return object(buffer[1], line) && true;
    const array = /^static const (?:char|void|\w+) \*? ?(\w+?)_(map|buttons|frames|points|columns|rows)\[\] = \{(.*)\}$/.exec(body);
    if (!array) return false;
    const [, name, kind, values] = array;
    const target = object(name, line);
    const cells = splitArgs(values);
    if (kind === "map" || kind === "buttons") {
      const lines = [[]];
      for (const cell of cells) {
        const value = decodeString(cell, line);
        if (value === "\n") lines.push([]);
        else if (value !== "") lines.at(-1).push(value);
      }
      if (kind === "map") set(target, "map", lines.map((row) => row.join(",")).join("\n"), line);
      else set(target, "buttons", lines.flat().join(","), line);
    } else if (kind === "frames") {
      set(target, "frames", cells.map((cell) => imageName(cell, line)).join("\n"), line);
    } else if (kind === "points") {
      const pairs = cells.map((cell) => {
        const match = /^\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}$/.exec(cell);
        if (!match) throw new CodeError("number", line, { text: cell });
        return `${match[1]},${match[2]}`;
      });
      set(target, "points", pairs.join(" "), line);
    } else {
      const tracks = cells.filter((cell) => cell !== "LV_GRID_TEMPLATE_LAST").map((cell) => {
        if (cell === "LV_GRID_CONTENT") return "content";
        const fr = /^LV_GRID_FR\(\s*(\d+)\s*\)$/.exec(cell);
        return fr ? `${fr[1]}fr` : String(int(cell, line));
      });
      set(target, kind === "columns" ? "gridColumns" : "gridRows", tracks.join(","), line);
      target.type = "grid";
    }
    return true;
  };

  const creation = (body, line) => {
    const match = /^(?:lv_obj_t ?\* ?)?(\w+) ?= ?(\w+) ?\((.*)\)$/.exec(body);
    if (!match) return false;
    const [, name, call, rest] = match;
    const args = splitArgs(rest);
    if (call === "lv_menu_page_create") {
      if (name !== "page") return false;
      menu = object(args[0], line);
      return true;
    }
    // A button's and a window's own label belong to them.
    if (call === "lv_label_create" && name.endsWith("_label")) {
      const owner = objects.get(name.slice(0, -"_label".length));
      const parent = /^lv_win_get_content\((\w+)\)$/.exec(args[0])?.[1] ?? args[0];
      if (owner && parent === owner.name) {
        aliases.set(name, owner);
        return true;
      }
    }
    const type = CREATE[call];
    if (!type) return false;
    if (objects.has(name)) throw new CodeError("duplicate", line, { name });
    if (!/^ui_\w+$/.test(name)) throw new CodeError("badName", line, { name });
    const isScreen = args[0] === "NULL";
    if (isScreen && name !== screen) throw new CodeError("screenName", line, { name, screen });
    const parent = isScreen ? null : object(args[0], line);
    if (parent && !CONTAINERS.has(parent.type)) throw new CodeError("notContainer", line, { name: parent.name });
    const created = { name, type: isScreen ? "screen" : type, parent: parent?.name ?? null, props: {}, lines: {}, line };
    objects.set(name, created);
    if (type === "qrcode" && args.length > 1) set(created, "qrSize", int(args[1], line), line);
    return true;
  };

  const call = (fn, args, line, body) => {
    if (DERIVED.has(fn)) return;
    if (/^lv_style_|^lv_timer_/.test(fn)) throw new CodeError("unknown", line, { text: body });
    // Labels created in place: tabs, tiles and menu rows.
    if (fn === "lv_label_set_text") {
      const tile = /^lv_label_create\(lv_tileview_add_tile\((\w+), ?\d+, ?\d+, ?\w+\)\)$/.exec(args[0]);
      if (tile) return push(object(tile[1], line), "tiles", decodeString(args[1], line), line);
      const tab = /^lv_label_create\(lv_tabview_add_tab\((\w+), ?("(?:[^"\\]|\\.)*")\)\)$/.exec(args[0]);
      if (tab) return push(object(tab[1], line), "tabs", decodeString(tab[2], line), line);
      if (/^lv_label_create\(lv_menu_cont_create\(page\)\)$/.test(args[0]) && menu) return push(menu, "menuItems", decodeString(args[1], line), line);
      const part = /^lv_msgbox_get_(text|title)\((\w+)\)$/.exec(args[0]);
      if (part) return set(object(part[2], line), part[1], decodeString(args[1], line), line);
    }
    if (fn === "lv_span_set_text") {
      const span = /^(?:lv_spangroup_new_span|lv_spangroup_add_span)\((\w+)\)$/.exec(args[0]);
      if (!span) throw new CodeError("unknown", line, { text: body });
      return push(object(span[1], line), "spans", decodeString(args[1], line), line);
    }
    if (/^lv_msgbox_get_btns\(/.test(args[0] ?? "")) return;
    // Style calls: the same shape for all.
    const style = /^lv_obj_set_style_(\w+)$/.exec(fn);
    const o = object(args[0], line);
    // A button's label is centred by the code around it, not by the design.
    if (fn === "lv_obj_center" && args[0] !== o.name) return;
    const value = args.at(-1);
    if (style) {
      const selector = (args[2] ?? "").replace(/\s+/g, "");
      const main = selector === "0" || selector === "LV_PART_MAIN";
      if (style[1] === "arc_color" && selector === "LV_PART_INDICATOR") return set(o, "indicatorColor", colour(args[1], line), line);
      if (style[1] === "bg_color") {
        // An arc's knob follows its indicator.
        if (selector === "LV_PART_KNOB") return undefined;
        if (main) return set(o, "bgColor", colour(args[1], line), line);
        if (/^LV_PART_INDICATOR(\|LV_STATE_CHECKED)?$/.test(selector)) return set(o, "indicatorColor", colour(args[1], line), line);
      }
      if (main && style[1] === "text_font") {
        const own = /^ui_font_(\w+)_(\d+)$/.exec(args[1]);
        if (own) {
          set(o, "fontFamily", own[1], line);
          return set(o, "font", Number(own[2]), line);
        }
        const font = /^&lv_font_montserrat_(\d+)$/.exec(args[1]);
        if (!font || !FONT_SIZES.includes(Number(font[1]))) throw new CodeError("font", line, { text: args[1], sizes: FONT_SIZES.join(", ") });
        return set(o, "font", Number(font[1]), line);
      }
      if (main && STYLE[style[1]]) return set(o, STYLE[style[1]][0], STYLE[style[1]][1](args[1], line), line);
      throw new CodeError("unknown", line, { text: body });
    }
    switch (fn) {
      case "lv_obj_set_x": return set(o, "x", int(args[1], line), line);
      case "lv_obj_set_y": return set(o, "y", int(args[1], line), line);
      case "lv_obj_set_pos": set(o, "x", int(args[1], line), line); return set(o, "y", int(args[2], line), line);
      case "lv_obj_set_width": return set(o, "width", size(args[1], line), line);
      case "lv_obj_set_height": return set(o, "height", size(args[1], line), line);
      case "lv_obj_set_size": set(o, "width", size(args[1], line), line); return set(o, "height", size(args[2], line), line);
      case "lv_obj_set_align": return set(o, "align", enumValue(args[1], "LV_ALIGN_", ALIGNS, line), line);
      case "lv_obj_align":
        set(o, "align", enumValue(args[1], "LV_ALIGN_", ALIGNS, line), line);
        set(o, "x", int(args[2], line), line);
        return set(o, "y", int(args[3], line), line);
      case "lv_obj_center":
        set(o, "align", "CENTER", line);
        set(o, "x", 0, line);
        return set(o, "y", 0, line);
      case "lv_obj_add_flag": case "lv_obj_remove_flag": case "lv_obj_clear_flag": {
        // Every arc has this from the generator; it is not a setting of the project.
        if (args[1] === "LV_OBJ_FLAG_ADV_HITTEST") return undefined;
        const key = FLAGS[args[1]];
        if (!key) throw new CodeError("unknown", line, { text: body });
        return set(o, key, fn === "lv_obj_add_flag", line);
      }
      case "lv_obj_add_state": case "lv_obj_remove_state": case "lv_obj_clear_state": {
        const key = STATES[args[1]];
        if (!key) throw new CodeError("unknown", line, { text: body });
        return set(o, key, fn === "lv_obj_add_state", line);
      }
      case "lv_obj_set_flex_flow": return set(o, "flexFlow", enumValue(args[1], "LV_FLEX_FLOW_", FLEX_FLOWS, line), line);
      case "lv_obj_set_grid_cell":
        set(o, "gridCol", int(args[2], line), line);
        set(o, "gridColSpan", int(args[3], line), line);
        set(o, "gridRow", int(args[5], line), line);
        return set(o, "gridRowSpan", int(args[6], line), line);
      case "lv_slider_set_value": case "lv_bar_set_value": return set(o, "value", int(args[1], line), line);
      case "lv_arc_set_value": case "lv_spinbox_set_value": return set(o, "value", int(value, line), line);
      case "lv_meter_set_indicator_value": return set(o, "value", int(value, line), line);
      case "lv_dropdown_set_selected": case "lv_roller_set_selected": return set(o, "selected", int(args[1], line), line);
      case "lv_led_set_brightness": return set(o, "ledBright", int(value, line), line);
      case "lv_img_set_angle": case "lv_image_set_rotation": return set(o, "rotation", int(value, line) / 10, line);
      case "lv_img_set_zoom": case "lv_image_set_scale": return set(o, "scale", Math.round((int(value, line) * 100) / 256), line);
      case "lv_scale_set_mode": return set(o, "scaleMode", enumValue(args[1], "LV_SCALE_MODE_", SCALE_MODES, line), line);
      case "lv_scale_set_total_tick_count": return set(o, "totalTicks", int(value, line), line);
      case "lv_scale_set_major_tick_every": return set(o, "majorEvery", int(value, line), line);
      case "lv_animimg_set_duration": return set(o, "duration", int(value, line), line);
      case "lv_chart_set_type": return set(o, "chartType", enumValue(args[1], "LV_CHART_TYPE_", CHART_TYPES, line), line);
      case "lv_chart_set_range": case "lv_chart_set_axis_range":
        set(o, "min", int(args[2], line), line);
        return set(o, "max", int(args[3], line), line);
      case "lv_meter_set_scale_range":
        set(o, "min", int(args[2], line), line);
        return set(o, "max", int(args[3], line), line);
      case "lv_chart_set_next_value": {
        if (!o.series?.length) throw new CodeError("unknown", line, { text: body });
        o.series.at(-1).push(int(args[2], line));
        set(o, "series", o.series.map((row) => row.join(",")).join("\n"), o.lines.series ?? line);
        return undefined;
      }
      case "lv_label_set_text": {
        const key = o.type === "label" || args[0] !== o.name ? "text" : null;
        if (!key) throw new CodeError("unknown", line, { text: body });
        return set(o, "text", decodeString(args[1], line), line);
      }
      case "lv_checkbox_set_text": case "lv_textarea_set_text": case "lv_arclabel_set_text": case "lv_barcode_update": case "lv_qrcode_update": case "lv_msgbox_add_text":
        return set(o, "text", decodeString(args[1], line), line);
      case "lv_win_add_title": case "lv_msgbox_add_title": return set(o, "title", decodeString(args[1], line), line);
      case "lv_msgbox_add_footer_button": return push(o, "buttons", decodeString(args[1], line), line, ",");
      case "lv_textarea_set_placeholder_text": return set(o, "placeholder", decodeString(args[1], line), line);
      case "lv_dropdown_set_options": case "lv_roller_set_options": return set(o, "options", decodeString(args[1], line), line);
      case "lv_list_add_text": return push(o, "items", `#${decodeString(args[1], line)}`, line);
      case "lv_list_add_btn": case "lv_list_add_button": return push(o, "items", decodeString(args[2], line), line);
      case "lv_table_set_cell_value": {
        const r = int(args[1], line);
        const c = int(args[2], line);
        o.cells ??= [];
        o.cells[r] ??= [];
        o.cells[r][c] = decodeString(args[3], line);
        const rows = Array.from(o.cells, (row) => Array.from(row ?? [], (cell) => cell ?? "").join(","));
        return set(o, "cells", rows.join("\n"), o.lines.cells ?? line);
      }
      case "lv_spinbox_set_digit_format":
        set(o, "digits", int(args[1], line), line);
        return set(o, "separator", int(args[2], line), line);
      case "lv_calendar_set_today_date":
        set(o, "year", int(args[1], line), line);
        set(o, "month", int(args[2], line), line);
        return set(o, "day", int(args[3], line), line);
      case "lv_image_set_src": case "lv_img_set_src":
        if (args[1].endsWith("_frames[0]")) return undefined;
        return set(o, "src", imageName(args[1], line), line);
      case "lv_imgbtn_set_src": case "lv_imagebutton_set_src": return set(o, "src", imageName(args[3], line), line);
      case "lv_canvas_set_buffer":
        set(o, "canvasW", int(args[2], line), line);
        return set(o, "canvasH", int(args[3], line), line);
      case "lv_canvas_fill_bg": return set(o, "canvasColor", colour(args[1], line), line);
      case "lv_qrcode_set_size": return set(o, "qrSize", int(value, line), line);
      case "ui_animate_value": return set(o, "animate", int(args[4], line), line);
      default: {
        const range = /^lv_(\w+)_set_range$/.exec(fn);
        if (range) {
          set(o, "min", int(args[1], line), line);
          return set(o, "max", int(args[2], line), line);
        }
        throw new CodeError("unknown", line, { text: body });
      }
    }
  };

  for (const { text: body, line } of statements) {
    if (creation(body, line) || declaration(body, line)) continue;
    // Variables that hold parts of a widget.
    const series = /^lv_chart_series_t ?\* ?series = lv_chart_add_series\((\w+),/.exec(body);
    if (series) {
      const chart = object(series[1], line);
      chart.series = [...(chart.series ?? []), []];
      continue;
    }
    if (/^lv_meter_(scale|indicator)_t ?\* ?\w+ = /.test(body) || /^ui_\w+_needle ?= ?lv_meter_add_needle_line\(/.test(body)) continue;
    const loop = /^for ?\(.*\) ?(\w+) ?\((.*)\)$/.exec(body);
    if (loop) {
      if (!/^lv_table_set_col(umn)?_width$/.test(loop[1])) throw new CodeError("unknown", line, { text: body });
      const args = splitArgs(loop[2]);
      set(object(args[0], line), "columnWidth", int(args[2], line), line);
      continue;
    }
    const match = CALL.exec(body);
    if (!match) throw new CodeError("unknown", line, { text: body });
    if (!closesAtEnd(body)) throw new CodeError("syntax", line);
    call(match[1], splitArgs(match[2]), line, body);
  }
  if (!objects.has(screen)) throw new CodeError("noScreen", 1, { screen });
  return { screen, objects };
}

/* ------------------------------------------------------- back to the project */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Changes `draft` to match an edited screen file. Throws a CodeError when it cannot. */
function applyScreen(draft, file, text, baseline) {
  const names = cNames(draft);
  const byName = new Map();
  walk(draft, (node) => byName.set(names.get(node.id), node));
  const before = readScreenCode(baseline);
  const after = readScreenCode(text);
  if (after.screen !== before.screen) throw new CodeError("screenName", 1, { name: after.screen, screen: before.screen });

  // What vanished and what appeared with the same type is a rename: it keeps its events.
  const gone = [...before.objects.keys()].filter((name) => !after.objects.has(name));
  const fresh = [...after.objects.keys()].filter((name) => !before.objects.has(name));
  const renamed = new Map();
  for (const name of fresh) {
    const type = after.objects.get(name).type;
    const from = gone.find((old) => before.objects.get(old).type === type && ![...renamed.values()].includes(old));
    if (from) renamed.set(name, from);
  }

  // Every name in the project, so a new one cannot take one from another screen.
  for (const name of fresh) {
    if (byName.has(name) && !gone.includes(name)) throw new CodeError("duplicate", after.objects.get(name).line, { name });
  }

  const nodes = new Map();
  for (const [name, object] of after.objects) {
    const old = renamed.get(name) ?? name;
    const existing = before.objects.has(old) ? byName.get(old) : null;
    const previous = before.objects.get(old);
    if (!WIDGETS[object.type] || !availableIn(object.type, draft.lvgl)) throw new CodeError("noWidget", object.line, { type: object.type, version: draft.lvgl });
    let node = existing;
    if (!node) {
      node = { id: `n${draft.nextId++}`, type: object.type, name: sanitizeName(name.slice(3)), props: {}, events: [], children: [] };
    }
    if (node.type !== object.type) {
      node.type = object.type;
      node.props = {};
      node.events = [];
    }
    if (name !== old) node.name = sanitizeName(name.slice(3));
    const known = new Set([...WIDGETS[object.type].props, ...GRID_CELL_PROPS].map((prop) => prop.key));
    const keys = new Set([...Object.keys(previous?.props ?? {}), ...Object.keys(object.props)]);
    for (const key of keys) {
      const value = object.props[key];
      if (same(previous?.props[key], value) && existing) continue;
      if (value === undefined) {
        delete node.props[key];
        continue;
      }
      if (!known.has(key)) throw new CodeError("noProp", object.lines[key] ?? object.line, { name, prop: key, type: object.type });
      if (key === "fontFamily" && !(draft.fonts ?? []).some((font) => font.name === value)) throw new CodeError("noFont", object.lines[key], { name: value });
      if (key === "src" && !(draft.images ?? []).some((image) => image.name === value)) throw new CodeError("noImage", object.lines[key], { name: value });
      if (key === "frames" && String(value).split("\n").some((frame) => !(draft.images ?? []).some((image) => image.name === frame))) throw new CodeError("noImage", object.lines[key], { name: value });
      node.props[key] = value;
    }
    nodes.set(name, node);
  }

  // A removed container's children live on when the code still creates them.
  const kept = new Set([...nodes.values()].map((node) => node.id));
  for (const name of gone) {
    if ([...renamed.values()].includes(name)) continue;
    const node = byName.get(name);
    node.children = node.children.filter((child) => !kept.has(child.id));
  }
  // Children: in the order of the code; those the code cannot show keep their place at the end.
  const shown = new Set([...before.objects.keys()].map((name) => byName.get(name)?.id));
  const screenNode = nodes.get(after.screen);
  const removed = gone.filter((name) => ![...renamed.values()].includes(name)).map((name) => byName.get(name));
  const lists = new Map();
  for (const [name, object] of after.objects) {
    if (object.parent === null) continue;
    const parent = nodes.get(object.parent);
    if (!lists.has(parent.id)) lists.set(parent.id, []);
    lists.get(parent.id).push(nodes.get(name));
  }
  for (const node of nodes.values()) {
    const hidden = node.children.filter((child) => !shown.has(child.id) && !kept.has(child.id));
    node.children = [...(lists.get(node.id) ?? []), ...hidden];
  }
  // Removing through the project also clears the events that pointed at them.
  for (const node of removed) {
    screenNode.children.push(node);
    removeNode(draft, node.id);
  }
}

function applyMain(draft, text) {
  for (const [key, axis] of [["WIDTH", "w"], ["HEIGHT", "h"]]) {
    const line = text.split("\n").findIndex((row) => new RegExp(`^\\s*#define\\s+${key}\\b`).test(row));
    const match = new RegExp(`^\\s*#define\\s+${key}\\s+(\\S+)`, "m").exec(text);
    if (!match) throw new CodeError("noDefine", Math.max(1, line + 1), { name: key });
    const value = Number(match[1]);
    if (!Number.isInteger(value) || value < MIN_DEVICE || value > MAX_DEVICE) throw new CodeError("deviceRange", line + 1, { name: key, min: MIN_DEVICE, max: MAX_DEVICE });
    draft.device[axis] = value;
  }
  draft.device = normalDevice(draft.device);
}

function applyUi(draft, text) {
  const match = /lv_theme_default_init\(\s*\w+\s*,\s*(lv_color_hex\(\s*0x[0-9a-f]+\s*\))\s*,\s*(lv_color_hex\(\s*0x[0-9a-f]+\s*\))\s*,\s*(true|false)\s*,\s*(\w+)\s*\)/i.exec(text);
  if (!match) throw new CodeError("noTheme", 1);
  draft.theme = { ...draft.theme, primary: colour(match[1], 1), secondary: colour(match[2], 1), dark: match[3] === "true" };
  const own = /^ui_font_(\w+)_(\d+)$/.exec(match[4]);
  if (own) {
    if (!(draft.fonts ?? []).some((font) => font.name === own[1])) throw new CodeError("noFont", 1, { name: own[1] });
    draft.defaultFont = { font: own[1], size: Number(own[2]) };
  } else {
    delete draft.defaultFont;
  }
}

function applyConf(draft, text) {
  const overrides = overridesFromText(text);
  for (const [name, value] of Object.entries(overrides)) {
    if (!validConfName(name) || !validConfValue(value)) throw new CodeError("unknown", 1, { text: `#define ${name} ${value}` });
  }
  if (Object.keys(overrides).length) draft.lvConf = overrides;
  else delete draft.lvConf;
}

/** Lines of the edited text that the regenerated file does not have: they cannot take effect. */
function unusedLines(text, generated) {
  const have = new Set(generated.split("\n").map((row) => row.trim()));
  const unused = [];
  text.split("\n").forEach((row, index) => {
    const body = row.trim();
    if (body && !have.has(body)) unused.push(index + 1);
  });
  return unused;
}

/**
 * What an edit of a generated file means for the project.
 * { project }            the project to use (the same object when nothing changed)
 * { errors: [...] }      nothing applied; each error has code, line, params
 * `unused`               lines of main.c or ui.c that only the generator can write
 */
export function applyCodeEdit(project, file, text) {
  const normal = String(text).replace(/\r\n/g, "\n");
  if (!isEditableCode(file)) return { project, changed: false, errors: [], unused: [] };
  const baseline = generateCode(project, { imageData: false })[file];
  if (baseline === undefined) return { project, changed: false, errors: [{ code: "noFile", line: 1, params: { file } }], unused: [] };
  if (normal === baseline) return { project, changed: false, errors: [], unused: [] };
  const draft = structuredClone(project);
  try {
    if (file === MAIN_FILE) applyMain(draft, normal);
    else if (file === UI_FILE) applyUi(draft, normal);
    else if (file === CONF_FILE) applyConf(draft, normal);
    else applyScreen(draft, file, normal, baseline);
    const generated = generateCode(draft, { imageData: false });
    let unused = [];
    if (file === MAIN_FILE || file === UI_FILE || file === CONF_FILE) {
      unused = unusedLines(normal, generated[file]);
    } else {
      // The proof: the design now prints what the edit says.
      const said = readScreenCode(normal);
      const printed = readScreenCode(generated[file] ?? "");
      for (const [name, object] of said.objects) {
        const other = printed.objects.get(name);
        if (!other) throw new CodeError("notApplied", object.line, { name });
        for (const key of Object.keys(object.props)) {
          if (!same(other.props[key], object.props[key])) throw new CodeError("noProp", object.lines[key], { name, prop: key, type: object.type });
        }
      }
    }
    const changed = !same(draft, project);
    return { project: changed ? draft : project, changed, errors: [], unused };
  } catch (error) {
    if (error instanceof CodeError) return { project, changed: false, errors: [{ code: error.code, line: error.line, params: error.params }], unused: [] };
    throw error;
  }
}
