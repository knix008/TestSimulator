// Prints a project as C for its LVGL version, as a folder structure:
//   src/ui/...             the screens, for the firmware
//   src/main.c, config/lv_conf.h, CMakeLists.txt   the desktop simulator
import { apiFor, parseVersion } from "./versions.js";
import { ALIGNS, CHART_TYPES, FLEX_FLOWS, SCALE_MODES, SERIES_COLORS, availableIn } from "./schema.js";
import { imageData } from "./images.js";
import { cNames, colorValue, emit } from "./emit.js";
import { FILE_EXTENSION, serializeProject, walk } from "./project.js";
import { generateLvConf } from "./lvconf.js";

export const UI_DIR = "src/ui";
export const SCREENS_DIR = "src/ui/screens";
export const IMAGES_DIR = "src/ui/images";
export const FONTS_DIR = "src/ui/fonts";
/** Only generated code lives here, so files of removed screens can be deleted on save. */
export const GENERATED_DIRS = [SCREENS_DIR, IMAGES_DIR, FONTS_DIR];

const hex = (value) => `0x${value.toString(16).padStart(6, "0")}`;

/** A C string literal; UTF-8 stays as it is, so non-ASCII text survives. */
export function cString(text) {
  const body = String(text)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\?\?/g, "?\\?");
  return `"${body}"`;
}

/** What a widget needs right after it is created. */
function createExtras(name, node, api) {
  if (node.type === "win") return [`lv_obj_t * ${name}_label = lv_label_create(lv_win_get_content(${name}));`];
  if (node.type === "arclabel") return [`lv_arclabel_set_angle_start(${name}, 180);`, `lv_arclabel_set_angle_size(${name}, 270);`, `lv_arclabel_set_radius(${name}, LV_PCT(100));`];
  if (node.type === "scale") return [`lv_scale_set_label_show(${name}, true);`];
  if (node.type === "qrcode" && api.major >= 9) return [`lv_qrcode_set_size(${name}, ${Number(node.props.qrSize) || 100});`];
  if (node.type === "meter") {
    return [
      `lv_meter_scale_t * ${name}_scale = lv_meter_add_scale(${name});`,
      `lv_meter_set_scale_ticks(${name}, ${name}_scale, 41, 2, 10, lv_palette_main(LV_PALETTE_GREY));`,
      `lv_meter_set_scale_major_ticks(${name}, ${name}_scale, 8, 4, 15, lv_color_black(), 10);`,
      `${name}_needle = lv_meter_add_needle_line(${name}, ${name}_scale, 4, lv_palette_main(LV_PALETTE_RED), -10);`,
    ];
  }
  return [];
}

function gridTrack(track) {
  const text = track.trim();
  if (text === "content") return "LV_GRID_CONTENT";
  if (text.endsWith("fr")) return `LV_GRID_FR(${Number.parseInt(text, 10) || 1})`;
  return String(Number.parseInt(text, 10) || 0);
}

function createCall(type, parent, api, node) {
  switch (type) {
    case "imagebutton": return `${api.imageButton}(${parent})`;
    case "animimage": return `lv_animimg_create(${parent})`;
    case "canvas": return `lv_canvas_create(${parent})`;
    case "tileview": return `lv_tileview_create(${parent})`;
    case "menu": return `lv_menu_create(${parent})`;
    case "span": return `lv_spangroup_create(${parent})`;
    case "grid": return `lv_obj_create(${parent})`;
    case "colorwheel": return `lv_colorwheel_create(${parent}, true)`;
    case "meter": return `lv_meter_create(${parent})`;
    case "scale": return `lv_scale_create(${parent})`;
    case "barcode": return `lv_barcode_create(${parent})`;
    case "arclabel": return `lv_arclabel_create(${parent})`;
    case "win": return api.major >= 9 ? `lv_win_create(${parent})` : `lv_win_create(${parent}, 40)`;
    case "msgbox": return api.major >= 9 ? `lv_msgbox_create(${parent})` : `lv_msgbox_create(${parent}, " ", " ", (const char * []){ "" }, false)`;
    case "qrcode": return api.major >= 9 ? `lv_qrcode_create(${parent})` : `lv_qrcode_create(${parent}, ${Number(node.props.qrSize) || 100}, lv_color_black(), lv_color_white())`;
    case "screen": return "lv_obj_create(NULL)";
    case "container": return `lv_obj_create(${parent})`;
    case "label": return `lv_label_create(${parent})`;
    case "button": return `${api.button}(${parent})`;
    case "checkbox": return `lv_checkbox_create(${parent})`;
    case "switch": return `lv_switch_create(${parent})`;
    case "slider": return `lv_slider_create(${parent})`;
    case "bar": return `lv_bar_create(${parent})`;
    case "arc": return `lv_arc_create(${parent})`;
    case "dropdown": return `lv_dropdown_create(${parent})`;
    case "roller": return `lv_roller_create(${parent})`;
    case "textarea": return `lv_textarea_create(${parent})`;
    case "spinner": return api.spinner(parent);
    case "led": return `lv_led_create(${parent})`;
    case "image": return `${api.image}(${parent})`;
    case "line": return `lv_line_create(${parent})`;
    case "list": return `lv_list_create(${parent})`;
    case "table": return `lv_table_create(${parent})`;
    case "chart": return `lv_chart_create(${parent})`;
    case "tabview": return api.tabview(parent);
    case "keyboard": return `lv_keyboard_create(${parent})`;
    case "calendar": return `lv_calendar_create(${parent})`;
    case "spinbox": return `lv_spinbox_create(${parent})`;
    case "buttonmatrix": return `${api.matrix}(${parent})`;
    default: throw new Error(`unknown widget ${type}`);
  }
}

function intLine(o, prop, value, type, api) {
  const flag = (name) => (value ? `lv_obj_add_flag(${o}, ${name});` : `${api.removeFlag}(${o}, ${name});`);
  const state = (name) => (value ? `lv_obj_add_state(${o}, ${name});` : `${api.removeState}(${o}, ${name});`);
  switch (prop) {
    case "x": return `lv_obj_set_x(${o}, ${value});`;
    case "y": return `lv_obj_set_y(${o}, ${value});`;
    case "width": return `lv_obj_set_width(${o}, ${value});`;
    case "height": return `lv_obj_set_height(${o}, ${value});`;
    case "widthPct": return `lv_obj_set_width(${o}, lv_pct(${value}));`;
    case "heightPct": return `lv_obj_set_height(${o}, lv_pct(${value}));`;
    case "widthContent": return `lv_obj_set_width(${o}, LV_SIZE_CONTENT);`;
    case "heightContent": return `lv_obj_set_height(${o}, LV_SIZE_CONTENT);`;
    case "align": return `lv_obj_set_align(${o}, LV_ALIGN_${ALIGNS[value]});`;
    case "hidden": return flag("LV_OBJ_FLAG_HIDDEN");
    case "clickable": return flag("LV_OBJ_FLAG_CLICKABLE");
    case "scrollable": return flag("LV_OBJ_FLAG_SCROLLABLE");
    case "checked": return state("LV_STATE_CHECKED");
    case "disabled": return state("LV_STATE_DISABLED");
    case "bgColor": return `lv_obj_set_style_bg_color(${o}, lv_color_hex(${hex(value)}), 0);`;
    case "bgOpa": return `lv_obj_set_style_bg_opa(${o}, ${value}, 0);`;
    case "borderColor": return `lv_obj_set_style_border_color(${o}, lv_color_hex(${hex(value)}), 0);`;
    case "borderWidth": return `lv_obj_set_style_border_width(${o}, ${value}, 0);`;
    case "radius": return `lv_obj_set_style_radius(${o}, ${value}, 0);`;
    case "textColor": return `lv_obj_set_style_text_color(${o}, lv_color_hex(${hex(value)}), 0);`;
    case "font": return `lv_obj_set_style_text_font(${o}, &lv_font_montserrat_${value}, 0);`;
    case "pad": return `lv_obj_set_style_pad_all(${o}, ${value}, 0);`;
    case "shadowWidth": return `lv_obj_set_style_shadow_width(${o}, ${value}, 0);`;
    case "shadowColor": return `lv_obj_set_style_shadow_color(${o}, lv_color_hex(${hex(value)}), 0);`;
    case "opa": return `lv_obj_set_style_opa(${o}, ${value}, 0);`;
    case "gap": return `lv_obj_set_style_pad_gap(${o}, ${value}, 0);`;
    case "indicatorColor":
      if (type === "arc") return `lv_obj_set_style_arc_color(${o}, lv_color_hex(${hex(value)}), LV_PART_INDICATOR); lv_obj_set_style_bg_color(${o}, lv_color_hex(${hex(value)}), LV_PART_KNOB);`;
      if (type === "spinner") return `lv_obj_set_style_arc_color(${o}, lv_color_hex(${hex(value)}), LV_PART_INDICATOR);`;
      return `lv_obj_set_style_bg_color(${o}, lv_color_hex(${hex(value)}), ${type === "switch" ? "LV_PART_INDICATOR | LV_STATE_CHECKED" : "LV_PART_INDICATOR"});`;
    case "flexFlow": return `lv_obj_set_flex_flow(${o}, LV_FLEX_FLOW_${FLEX_FLOWS[value]});`;
    case "value":
      if (type === "slider") return `lv_slider_set_value(${o}, ${value}, LV_ANIM_OFF);`;
      if (type === "bar") return `lv_bar_set_value(${o}, ${value}, LV_ANIM_OFF);`;
      if (type === "spinbox") return `lv_spinbox_set_value(${o}, ${value});`;
      if (type === "meter") return `lv_meter_set_indicator_value(${o}, ${o}_needle, ${value});`;
      return `lv_arc_set_value(${o}, ${value});`;
    case "selected":
      if (type === "dropdown") return `lv_dropdown_set_selected(${o}, ${value});`;
      return `lv_roller_set_selected(${o}, ${value}, LV_ANIM_OFF);`;
    case "ledBright": return `lv_led_set_brightness(${o}, ${value});`;
    case "rotation": return `${api.imageRotation}(${o}, ${value});`;
    case "scale": return `${api.imageScale}(${o}, ${value});`;
    case "lineColor": return `lv_obj_set_style_line_color(${o}, lv_color_hex(${hex(value)}), 0);`;
    case "lineWidth": return `lv_obj_set_style_line_width(${o}, ${value}, 0);`;
    case "columnWidth": return `for(uint32_t c = 0; c < ${api.columnCountGet}(${o}); c++) ${api.columnWidth}(${o}, c, ${value});`;
    case "scaleMode": return `lv_scale_set_mode(${o}, LV_SCALE_MODE_${SCALE_MODES[value]});`;
    case "totalTicks": return `lv_scale_set_total_tick_count(${o}, ${value});`;
    case "majorEvery": return `lv_scale_set_major_tick_every(${o}, ${value});`;
    case "duration": return `lv_animimg_set_duration(${o}, ${value}); lv_animimg_set_repeat_count(${o}, LV_ANIM_REPEAT_INFINITE); lv_animimg_start(${o});`;
    case "chartType": return `lv_chart_set_type(${o}, LV_CHART_TYPE_${CHART_TYPES[value]});`;
    default: throw new Error(`unknown property ${prop}`);
  }
}

/** The range a value runs over; the engine's range_of gives the same numbers. */
function valueRange(node) {
  const { props, type } = node;
  if (props.min !== undefined && props.max !== undefined && ["slider", "bar", "arc", "spinbox", "meter"].includes(type)) return [Number(props.min) || 0, Number(props.max) || 0];
  if (type === "switch" || type === "checkbox") return [0, 1];
  if (type === "led") return [0, 255];
  if (type === "image") return [0, 3599];
  if (type === "dropdown" || type === "roller") return [0, String(props.options ?? "").split("\n").length - 1];
  if (type === "spinbox") return [-99999, 99999];
  return [0, 100];
}

function valueOfCall(name, type) {
  switch (type) {
    case "slider": return `lv_slider_get_value(${name})`;
    case "bar": return `lv_bar_get_value(${name})`;
    case "spinbox": return `lv_spinbox_get_value(${name})`;
    case "dropdown": return `(int32_t)lv_dropdown_get_selected(${name})`;
    case "roller": return `(int32_t)lv_roller_get_selected(${name})`;
    case "switch": case "checkbox": return `(lv_obj_has_state(${name}, LV_STATE_CHECKED) ? 1 : 0)`;
    default: return `lv_arc_get_value(${name})`;
  }
}

const VALUE_PROP = { led: "ledBright", image: "rotation", dropdown: "selected", roller: "selected" };

function setTextCall(name, type, text, api, { raw = false } = {}) {
  const literal = raw ? text : cString(text);
  switch (type) {
    case "win": return `lv_label_set_text(${name}_label, ${literal});`;
    case "qrcode": return `lv_qrcode_update(${name}, ${literal}, strlen(${literal}));`;
    case "barcode": return `lv_obj_update_layout(${name}); lv_barcode_update(${name}, ${literal});`;
    case "arclabel": return `lv_arclabel_set_text(${name}, ${literal});`;
    case "msgbox": return api.major >= 9 ? `lv_msgbox_add_text(${name}, ${literal});` : `lv_label_set_text(lv_msgbox_get_text(${name}), ${literal});`;
    case "label": return `lv_label_set_text(${name}, ${literal});`;
    case "button": return `lv_label_set_text(${name}_label, ${literal});`;
    case "checkbox": return `lv_checkbox_set_text(${name}, ${literal});`;
    case "textarea": return `lv_textarea_set_text(${name}, ${literal});`;
    default: return `/* ${name} has no text */`;
  }
}

/** The multi-line properties: one small block of C each. */
function dataLines(name, prop, value, api) {
  const lines = value.split("\n");
  switch (prop) {
    case "items":
      return lines.map((line) => (line.startsWith("#") ? `lv_list_add_text(${name}, ${cString(line.slice(1))});` : `${api.list}(${name}, NULL, ${cString(line)});`));
    case "cells": {
      const rows = lines.map((line) => line.split(","));
      const out = [`${api.rowCount}(${name}, ${rows.length});`, `${api.columnCount}(${name}, ${Math.max(...rows.map((row) => row.length))});`];
      rows.forEach((row, r) => row.forEach((cell, c) => out.push(`lv_table_set_cell_value(${name}, ${r}, ${c}, ${cString(cell)});`)));
      return out;
    }
    case "series": {
      const rows = lines.map((line) => line.split(",").map((text) => Number.parseInt(text, 10) || 0));
      const out = [`lv_chart_set_point_count(${name}, ${Math.max(...rows.map((row) => row.length))});`];
      rows.forEach((row, index) => {
        out.push("{", `    lv_chart_series_t * series = lv_chart_add_series(${name}, lv_color_hex(${hex(SERIES_COLORS[index % SERIES_COLORS.length])}), LV_CHART_AXIS_PRIMARY_Y);`);
        for (const point of row) out.push(`    lv_chart_set_next_value(${name}, series, ${point});`);
        out.push("}");
      });
      return out;
    }
    case "tiles":
      return lines.map((line, index) => `lv_label_set_text(lv_label_create(lv_tileview_add_tile(${name}, ${index}, 0, LV_DIR_HOR)), ${cString(line)});`);
    case "menuItems":
      return [
        "{",
        `    lv_obj_t * page = lv_menu_page_create(${name}, NULL);`,
        ...lines.map((line) => `    lv_label_set_text(lv_label_create(lv_menu_cont_create(page)), ${cString(line)});`),
        `    lv_menu_set_page(${name}, page);`,
        "}",
      ];
    case "spans":
      return lines.map((line) => `lv_span_set_text(${api.spanNew}(${name}), ${cString(line)});`);
    case "tabs":
      return lines.map((line) => `lv_label_set_text(lv_label_create(lv_tabview_add_tab(${name}, ${cString(line)})), ${cString(line)});`);
    case "map": {
      const cells = [];
      lines.forEach((line, index) => {
        if (index) cells.push('"\\n"');
        for (const cell of line.split(",")) cells.push(cString(cell));
      });
      cells.push('""');
      return [`static const char * ${name}_map[] = { ${cells.join(", ")} };`, `${api.matrixMap}(${name}, ${name}_map);`];
    }
    case "points": {
      const points = value.split(" ").map((pair) => pair.split(",").map((text) => Number.parseInt(text, 10) || 0));
      return [
        `static const ${api.point} ${name}_points[] = { ${points.map(([x, y]) => `{ ${x}, ${y ?? 0} }`).join(", ")} };`,
        `lv_line_set_points(${name}, ${name}_points, ${points.length});`,
      ];
    }
    default:
      throw new Error(`unknown data property ${prop}`);
  }
}

function strLine(name, type, prop, value, api) {
  if (prop === "text") return setTextCall(name, type, value, api);
  if (prop === "title") {
    if (type === "win") return `lv_win_add_title(${name}, ${cString(value)});`;
    return api.major >= 9 ? `lv_msgbox_add_title(${name}, ${cString(value)});` : `lv_label_set_text(lv_msgbox_get_title(${name}), ${cString(value)});`;
  }
  if (prop === "buttons") {
    const cells = value.split(",");
    if (api.major >= 9) return cells.map((cell) => `lv_msgbox_add_footer_button(${name}, ${cString(cell)});`).join(" ");
    return `static const char * ${name}_buttons[] = { ${cells.map(cString).join(", ")}, "" }; lv_btnmatrix_set_map(lv_msgbox_get_btns(${name}), ${name}_buttons); lv_obj_set_size(lv_msgbox_get_btns(${name}), ${cells.length} * (2 * LV_DPI_DEF / 3), lv_font_get_line_height(lv_obj_get_style_text_font(lv_msgbox_get_btns(${name}), LV_PART_ITEMS)) + LV_DPI_DEF / 10);`;
  }
  if (prop === "placeholder") return `lv_textarea_set_placeholder_text(${name}, ${cString(value)});`;
  if (type === "dropdown") return `lv_dropdown_set_options(${name}, ${cString(value)});`;
  return `lv_roller_set_options(${name}, ${cString(value)}, LV_ROLLER_MODE_NORMAL);`;
}

const fontSymbol = (name, size) => `ui_font_${name}_${size}`;

/** The font and size pairs the code needs, each once. */
function usedFonts(project, ops) {
  const used = new Map();
  const add = (name, size) => {
    const font = (project.fonts ?? []).find((item) => item.name === name);
    if (font) used.set(fontSymbol(name, size), { font, size });
  };
  if (project.defaultFont) add(project.defaultFont.font, project.defaultFont.size);
  for (const op of ops) if (op.op === "font") add(op.name, op.size);
  return used;
}

/** Fonts are read from their files when the program starts, then decoded as text is drawn. */
function fontSource(used) {
  const source = [
    GENERATED_NOTE,
    '#include "ui.h"',
    "#include <stdio.h>",
    "#include <stdlib.h>",
    "#include <string.h>",
    "",
    "/* The folder of the font files. A firmware without one can define UI_FONT_DIR, or replace ui_font_read. */",
    "#ifndef UI_FONT_DIR",
    '#define UI_FONT_DIR "assets/fonts"',
    "#endif",
    "",
  ];
  for (const symbol of used.keys()) source.push(`const lv_font_t * ${symbol};`);
  source.push(
    "",
    "/* The decoder opens the first face of a collection, so that entry is pointed at the wanted face. */",
    "static const uint8_t * ui_font_read(const char * file, int face, size_t * size)",
    "{",
    '    FILE * in = fopen(file, "rb");',
    "    if(!in) return NULL;",
    "    fseek(in, 0, SEEK_END);",
    "    long length = ftell(in);",
    "    fseek(in, 0, SEEK_SET);",
    "    uint8_t * data = length > 0 ? malloc((size_t)length) : NULL;",
    "    if(data && fread(data, 1, (size_t)length, in) != (size_t)length) {",
    "        free(data);",
    "        data = NULL;",
    "    }",
    "    fclose(in);",
    "    if(!data) return NULL;",
    '    if(face > 0 && memcmp(data, "ttcf", 4) == 0) memcpy(data + 12, data + 12 + 4 * face, 4);',
    "    *size = (size_t)length;",
    "    return data;",
    "}",
    "",
    "void ui_fonts_init(void)",
    "{",
    "    size_t size = 0;",
    "    const uint8_t * data = NULL;",
  );
  const byFile = new Map();
  for (const [symbol, item] of used) {
    const key = item.font.name;
    if (!byFile.has(key)) byFile.set(key, { font: item.font, list: [] });
    byFile.get(key).list.push([symbol, item.size]);
  }
  for (const { font, list } of byFile.values()) {
    const file = font.file.split("/").pop();
    source.push(`    data = ui_font_read(UI_FONT_DIR "/" ${cString(file)}, ${font.face}, &size);`);
    for (const [symbol, size] of list) {
      source.push(`    ${symbol} = data ? lv_tiny_ttf_create_data(data, size, ${size}) : NULL;`, `    if(${symbol}) ((lv_font_t *)${symbol})->fallback = LV_FONT_DEFAULT; /* What the file lacks, such as LVGL's symbols. */`, `    else ${symbol} = LV_FONT_DEFAULT;`);
    }
  }
  source.push("}", "");
  return source.join("\n");
}

const GENERATED_NOTE = "/* Generated by My LVGL Studio. Changes are overwritten when the project is saved. */";

const hexByte = (value) => `0x${value.toString(16).padStart(2, "0")}`;

function hexLines(bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 32) {
    lines.push(`    ${Array.from(bytes.subarray(i, i + 32), hexByte).join(",")},`);
  }
  return lines.join("\n");
}

/** RGB565 + alpha, the 3-byte form LVGL v8 uses on a 16-bit display. */
function rgb565Alpha(bgra, swap) {
  const out = new Uint8Array((bgra.length / 4) * 3);
  for (let i = 0, o = 0; i < bgra.length; i += 4, o += 3) {
    const value = ((bgra[i + 2] & 0xf8) << 8) | ((bgra[i + 1] & 0xfc) << 3) | (bgra[i] >> 3);
    out[o] = swap ? value >> 8 : value & 255;
    out[o + 1] = swap ? value & 255 : value >> 8;
    out[o + 2] = bgra[i + 3];
  }
  return out;
}

/** One image as C. v9 always stores ARGB8888; v8's format depends on the colour depth. */
function imageSource(name, version, { imageData: withData = true } = {}) {
  const data = imageData(name);
  const symbol = `ui_img_${name}`;
  const top = [GENERATED_NOTE, '#include "lvgl.h"', ""];
  if (!withData) return [...top, `/* ${symbol}: ${data.w}x${data.h}, written as a C array when the project is saved. */`, ""].join("\n");
  if (parseVersion(version)?.major === 8) {
    return [
      ...top,
      `const LV_ATTRIBUTE_MEM_ALIGN uint8_t ${symbol}_map[] = {`,
      "#if LV_COLOR_DEPTH == 32",
      hexLines(data.bgra),
      "#elif LV_COLOR_DEPTH == 16 && LV_COLOR_16_SWAP == 0",
      hexLines(rgb565Alpha(data.bgra, false)),
      "#elif LV_COLOR_DEPTH == 16 && LV_COLOR_16_SWAP != 0",
      hexLines(rgb565Alpha(data.bgra, true)),
      "#else",
      '#error "This image was generated for a colour depth of 16 or 32"',
      "#endif",
      "};",
      "",
      `const lv_img_dsc_t ${symbol} = {`,
      "    .header.always_zero = 0,",
      `    .header.w = ${data.w},`,
      `    .header.h = ${data.h},`,
      "    .header.cf = LV_IMG_CF_TRUE_COLOR_ALPHA,",
      `    .data_size = sizeof(${symbol}_map),`,
      `    .data = ${symbol}_map,`,
      "};",
      "",
    ].join("\n");
  }
  return [
    ...top,
    `static const uint8_t ${symbol}_map[] = {`,
    hexLines(data.bgra),
    "};",
    "",
    `const lv_image_dsc_t ${symbol} = {`,
    "    .header.magic = LV_IMAGE_HEADER_MAGIC,",
    "    .header.cf = LV_COLOR_FORMAT_ARGB8888,",
    `    .header.w = ${data.w},`,
    `    .header.h = ${data.h},`,
    `    .header.stride = ${data.w * 4},`,
    `    .data_size = sizeof(${symbol}_map),`,
    `    .data = ${symbol}_map,`,
    "};",
    "",
  ].join("\n");
}

function generateUi(project, options) {
  const api = apiFor(project.lvgl);
  const names = cNames(project);
  const { ops, ids } = emit(project);
  const nodeById = new Map();
  walk(project, (node) => nodeById.set(ids.get(node.id), node));
  const nameOf = (id) => names.get(nodeById.get(id).id);
  const typeOf = (id) => nodeById.get(id).type;
  const events = ops.filter((op) => op.op === "event");
  const fonts = usedFonts(project, ops);
  const animated = ops.filter((op) => op.op === "int" && op.prop === "animate");
  const sendChanged = (name) => (api.major >= 9 ? `lv_obj_send_event(${name}, LV_EVENT_VALUE_CHANGED, NULL);` : `lv_event_send(${name}, LV_EVENT_VALUE_CHANGED, NULL);`);

  // Operations per screen, in order.
  const byScreen = new Map();
  let current = null;
  for (const op of ops) {
    if (op.op === "event") continue;
    if (op.op === "create" && op.parent === -1) {
      current = [];
      byScreen.set(op.id, current);
    }
    current.push(op);
  }

  const files = {};

  /* ui.h */
  const header = [
    GENERATED_NOTE,
    "#ifndef UI_H",
    "#define UI_H",
    "",
    '#include "lvgl.h"',
    "",
    "#ifdef __cplusplus",
    'extern "C" {',
    "#endif",
    "",
    "/* Call once, after LVGL and the display are ready. Loads the first screen. */",
    "void ui_init(void);",
    "",
    "/* One function per file in screens/. */",
  ];
  for (const screenId of byScreen.keys()) header.push(`void ${nameOf(screenId)}_create(void);`);
  header.push("");
  const images = (project.images ?? []).filter((image) => imageData(image.name));
  if (images.length) {
    header.push("/* One file per image in images/. */");
    for (const image of images) header.push(`${api.imageDeclare}(ui_img_${image.name});`);
    header.push("");
  }
  if (animated.length) {
    header.push("/* Values that sweep back and forth, from ui_events.c. */", "void ui_animate_value(lv_obj_t * obj, void (*set)(void *, int32_t), int32_t min, int32_t max, uint32_t duration);");
    for (const op of animated) header.push(`void ${nameOf(op.id)}_set(void * obj, int32_t value);`);
    header.push("");
  }
  if (fonts.size) {
    header.push("/* The project's fonts, from fonts/ui_fonts.c. */", "void ui_fonts_init(void);");
    for (const symbol of fonts.keys()) header.push(`extern const lv_font_t * ${symbol};`);
    header.push("");
  }
  walk(project, (node) => {
    header.push(`extern lv_obj_t * ${names.get(node.id)};`);
    if (node.type === "button") header.push(`extern lv_obj_t * ${names.get(node.id)}_label;`);
    if (node.type === "meter" && availableIn(node.type, project.lvgl)) header.push(`extern lv_meter_indicator_t * ${names.get(node.id)}_needle;`);
  });
  header.push("", "#ifdef __cplusplus", "}", "#endif", "", "#endif", "");
  files[`${UI_DIR}/ui.h`] = header.join("\n");

  /* ui_events.h */
  const eventsHeader = [
    GENERATED_NOTE,
    "#ifndef UI_EVENTS_H",
    "#define UI_EVENTS_H",
    "",
    '#include "lvgl.h"',
    "",
  ];
  events.forEach((_, index) => eventsHeader.push(`void ui_event_${index}(lv_event_t * e);`));
  if (events.length) eventsHeader.push("");
  eventsHeader.push("#endif", "");
  files[`${UI_DIR}/ui_events.h`] = eventsHeader.join("\n");

  /* ui_events.c: one small function per action */
  const eventSource = [GENERATED_NOTE, '#include "ui.h"', '#include "ui_events.h"', "#include <stdio.h>", ""];
  events.forEach((event, index) => {
    const target = event.target >= 0 ? nameOf(event.target) : "";
    eventSource.push(`void ui_event_${index}(lv_event_t * e)`, "{", "    LV_UNUSED(e);");
    switch (event.action) {
      case "screen": eventSource.push(`    ${api.screenLoad}(${target});`); break;
      case "setText": eventSource.push(`    ${setTextCall(target, typeOf(event.target), event.text, api)}`); break;
      case "toggle":
        eventSource.push(
          `    if(lv_obj_has_flag(${target}, LV_OBJ_FLAG_HIDDEN)) ${api.removeFlag}(${target}, LV_OBJ_FLAG_HIDDEN);`,
          `    else lv_obj_add_flag(${target}, LV_OBJ_FLAG_HIDDEN);`,
        );
        break;
      case "show": eventSource.push(`    ${api.removeFlag}(${target}, LV_OBJ_FLAG_HIDDEN);`); break;
      case "hide": eventSource.push(`    lv_obj_add_flag(${target}, LV_OBJ_FLAG_HIDDEN);`); break;
      case "log": eventSource.push(`    printf("%s\\n", ${cString(event.text)});`, "    fflush(stdout);"); break;
      case "setValue": {
        const from = nodeById.get(event.id);
        const to = nodeById.get(event.target);
        const [fromMin, fromMax] = valueRange(from);
        const [toMin, toMax] = valueRange(to);
        const value = `lv_map(${valueOfCall(nameOf(event.id), from.type)}, ${fromMin}, ${fromMax}, ${toMin}, ${toMax})`;
        eventSource.push(`    ${intLine(target, VALUE_PROP[to.type] ?? "value", value, to.type, api)}`);
        break;
      }
      case "showValue":
        eventSource.push(
          "    char text[128];",
          `    lv_snprintf(text, sizeof(text), ${cString(event.text)}, ${valueOfCall(nameOf(event.id), typeOf(event.id))});`,
          `    ${setTextCall(target, typeOf(event.target), "text", api, { raw: true })}`,
        );
        break;
      default: break;
    }
    eventSource.push("}", "");
  });
  if (animated.length) {
    eventSource.push(
      "/* A value that sweeps back and forth, telling whoever listens, as if a hand moved it. */",
      "void ui_animate_value(lv_obj_t * obj, void (*set)(void *, int32_t), int32_t min, int32_t max, uint32_t duration)",
      "{",
      "    lv_anim_t anim;",
      "    lv_anim_init(&anim);",
      "    lv_anim_set_var(&anim, obj);",
      "    lv_anim_set_exec_cb(&anim, set);",
      "    lv_anim_set_values(&anim, min, max);",
      `    ${api.major >= 9 ? "lv_anim_set_duration" : "lv_anim_set_time"}(&anim, duration);`,
      `    ${api.major >= 9 ? "lv_anim_set_playback_duration" : "lv_anim_set_playback_time"}(&anim, duration);`,
      "    lv_anim_set_repeat_count(&anim, LV_ANIM_REPEAT_INFINITE);",
      "    lv_anim_set_path_cb(&anim, lv_anim_path_ease_in_out);",
      "    lv_anim_start(&anim);",
      "}",
      "",
    );
    for (const op of animated) {
      const name = nameOf(op.id);
      eventSource.push(`void ${name}_set(void * obj, int32_t value)`, "{", "    LV_UNUSED(obj);", `    ${intLine(name, "value", "value", typeOf(op.id), api)}`, `    ${sendChanged(name)}`, "}", "");
    }
  }
  files[`${UI_DIR}/ui_events.c`] = eventSource.join("\n");

  /* screens/ui_<name>.c */
  for (const [screenId, list] of byScreen) {
    const source = [GENERATED_NOTE, '#include "ui.h"', "#include <string.h>", "", `void ${nameOf(screenId)}_create(void)`, "{"];
    for (const op of list) {
      const name = nameOf(op.id);
      const type = typeOf(op.id);
      if (op.op === "create") {
        const parent = op.parent >= 0 ? nameOf(op.parent) : "NULL";
        source.push(`    ${name} = ${createCall(type, parent, api, op.node)};`);
        for (const line of createExtras(name, op.node, api)) source.push(`    ${line}`);
        if (type === "button") source.push(`    ${name}_label = lv_label_create(${name});`, `    lv_obj_center(${name}_label);`);
      } else if (op.op === "range") {
        if (type === "chart") source.push(`    ${api.chartRange}(${name}, LV_CHART_AXIS_PRIMARY_Y, ${op.min}, ${op.max});`);
        else if (type === "meter") source.push(`    lv_meter_set_scale_range(${name}, ${name}_scale, ${op.min}, ${op.max}, 270, 135);`);
        else source.push(`    lv_${type}_set_range(${name}, ${op.min}, ${op.max});`);
      } else if (op.op === "canvas") {
        source.push(
          `    static uint8_t ${name}_buffer[${op.w * op.h * 4}];`,
          `    lv_canvas_set_buffer(${name}, ${name}_buffer, ${op.w}, ${op.h}, ${api.canvasFormat});`,
          `    lv_canvas_fill_bg(${name}, lv_color_hex(${hex(op.color)}), LV_OPA_COVER);`,
        );
      } else if (op.op === "grid") {
        const tracks = (text) => [...text.split(",").map(gridTrack), "LV_GRID_TEMPLATE_LAST"].join(", ");
        source.push(
          `    static const ${api.track} ${name}_columns[] = { ${tracks(op.columns)} };`,
          `    static const ${api.track} ${name}_rows[] = { ${tracks(op.rows)} };`,
          `    lv_obj_set_grid_dsc_array(${name}, ${name}_columns, ${name}_rows);`,
        );
      } else if (op.op === "cell") {
        source.push(`    lv_obj_set_grid_cell(${name}, LV_GRID_ALIGN_STRETCH, ${op.column}, ${op.columnSpan}, LV_GRID_ALIGN_STRETCH, ${op.row}, ${op.rowSpan});`);
      } else if (op.op === "frames") {
        const present = op.names.filter((image) => imageData(image));
        if (present.length) {
          source.push(
            `    static const void * ${name}_frames[] = { ${present.map((image) => `&ui_img_${image}`).join(", ")} };`,
            `    ${api.imageSet}(${name}, ${name}_frames[0]);`,
            `    lv_animimg_set_src(${name}, ${name}_frames, ${present.length});`,
          );
        }
      } else if (op.op === "str" && ["items", "cells", "series", "tabs", "map", "points", "tiles", "menuItems", "spans"].includes(op.prop)) {
        for (const line of dataLines(name, op.prop, op.value, api)) source.push(`    ${line}`);
      } else if (op.op === "str") {
        source.push(`    ${strLine(name, type, op.prop, op.value, api)}`);
      } else if (op.op === "digits") {
        source.push(`    lv_spinbox_set_digit_format(${name}, ${op.count}, ${op.separator});`);
      } else if (op.op === "date") {
        source.push(`    lv_calendar_set_today_date(${name}, ${op.year}, ${op.month}, ${op.day});`, `    ${api.calendarMonth}(${name}, ${op.year}, ${op.month});`);
      } else if (op.op === "image") {
        if (imageData(op.name)) {
          source.push(type === "imagebutton"
            ? `    ${api.imageButtonSet}(${name}, ${api.imageButtonState}, NULL, &ui_img_${op.name}, NULL);`
            : `    ${api.imageSrc}(${name}, &ui_img_${op.name});`);
        }
      } else if (op.op === "font") {
        source.push(`    lv_obj_set_style_text_font(${name}, ${fontSymbol(op.name, op.size)}, 0);`);
      } else if (op.op === "link") {
        continue;
      } else if (op.prop === "animate") {
        const [min, max] = valueRange(nodeById.get(op.id));
        source.push(`    ui_animate_value(${name}, ${name}_set, ${min}, ${max}, ${op.value});`);
      } else {
        source.push(`    ${intLine(name, op.prop, op.value, type, api)}`);
      }
    }
    source.push("}", "");
    files[`${SCREENS_DIR}/${nameOf(screenId)}.c`] = source.join("\n");
  }

  /* images/ui_img_<name>.c */
  for (const image of images) files[`${IMAGES_DIR}/ui_img_${image.name}.c`] = imageSource(image.name, project.lvgl, options);

  if (fonts.size) files[`${FONTS_DIR}/ui_fonts.c`] = fontSource(fonts);

  /* ui.c: the objects and ui_init */
  const theme = project.theme;
  const source = [
    GENERATED_NOTE,
    `/* Project: ${String(project.name).replace(/\*\//g, "* /")} - LVGL ${project.lvgl} */`,
    '#include "ui.h"',
    '#include "ui_events.h"',
    "",
  ];
  walk(project, (node) => {
    source.push(`lv_obj_t * ${names.get(node.id)};`);
    if (node.type === "button") source.push(`lv_obj_t * ${names.get(node.id)}_label;`);
    if (node.type === "meter" && availableIn(node.type, project.lvgl)) source.push(`lv_meter_indicator_t * ${names.get(node.id)}_needle;`);
  });
  const standard = project.defaultFont && fonts.has(fontSymbol(project.defaultFont.font, project.defaultFont.size)) ? fontSymbol(project.defaultFont.font, project.defaultFont.size) : "LV_FONT_DEFAULT";
  source.push(
    "",
    "void ui_init(void)",
    "{",
    ...(fonts.size ? ["    ui_fonts_init();"] : []),
    `    ${api.display} * display = ${api.defaultDisplay}();`,
    `    lv_theme_t * theme = lv_theme_default_init(display, lv_color_hex(${hex(colorValue(theme.primary))}), lv_color_hex(${hex(colorValue(theme.secondary))}), ${theme.dark ? "true" : "false"}, ${standard});`,
    `    ${api.setTheme}(display, theme);`,
    "",
  );
  for (const screenId of byScreen.keys()) source.push(`    ${nameOf(screenId)}_create();`);
  source.push("");
  const links = ops.filter((op) => op.op === "link");
  for (const link of links) source.push(`    lv_keyboard_set_textarea(${nameOf(link.id)}, ${nameOf(link.target)});`);
  if (links.length) source.push("");
  events.forEach((event, index) => {
    source.push(`    lv_obj_add_event_cb(${nameOf(event.id)}, ui_event_${index}, LV_EVENT_${event.trigger}, NULL);`);
  });
  if (events.length) source.push("");
  source.push(`    ${api.screenLoad}(${names.get(project.screens[0].id)});`, "}", "");
  files[`${UI_DIR}/ui.c`] = source.join("\n");

  return files;
}

/** A desktop host: SDL window + pointer. ML_HEADLESS draws one frame into a file instead. */
export function generateMain(project) {
  const { w, h, shape } = project.device;
  const roundMask = shape === "round" ? `
            /* A round display: what lies outside the circle does not exist. */
            SDL_SetRenderDrawColor(renderer, 0, 0, 0, 255);
            for(int y = 0; y < HEIGHT; y++) {
                int half = WIDTH / 2;
                int dy = y - HEIGHT / 2;
                while(half > 0 && half * half + dy * dy > (WIDTH / 2) * (WIDTH / 2)) half--;
                SDL_RenderDrawLine(renderer, 0, y, WIDTH / 2 - half, y);
                SDL_RenderDrawLine(renderer, WIDTH / 2 + half, y, WIDTH - 1, y);
            }` : "";
  return `/* Generated by My LVGL Studio: runs the designed screens on the desktop. */
#include "lvgl.h"
#include "ui.h"
#include <stdio.h>
#include <stdlib.h>
#ifndef ML_HEADLESS
#define SDL_MAIN_HANDLED
#include <SDL.h>
#endif

#define WIDTH ${w}
#define HEIGHT ${h}

/* The window shows the frame in the colour depth of lv_conf.h. */
#if LV_COLOR_DEPTH == 16
#define PIXEL_SIZE 2
#define WINDOW_FORMAT SDL_PIXELFORMAT_RGB565
#elif LV_COLOR_DEPTH == 24
#define PIXEL_SIZE 3
#define WINDOW_FORMAT SDL_PIXELFORMAT_BGR24
#elif LV_COLOR_DEPTH == 32
#define PIXEL_SIZE 4
#define WINDOW_FORMAT SDL_PIXELFORMAT_ARGB8888
#else
#error "The desktop simulator shows colour depths of 16, 24 and 32. Other depths still work on the firmware."
#endif

static uint8_t * framebuffer;
static int redraw;
static int mouse_x, mouse_y, mouse_down;

#if LVGL_VERSION_MAJOR >= 9
static void flush_cb(lv_display_t * disp, const lv_area_t * area, uint8_t * pixels)
{
    LV_UNUSED(area);
    LV_UNUSED(pixels);
    redraw = 1;
    lv_display_flush_ready(disp);
}
static void read_cb(lv_indev_t * indev, lv_indev_data_t * data)
{
    LV_UNUSED(indev);
    data->point.x = mouse_x;
    data->point.y = mouse_y;
    data->state = mouse_down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}
static void lvgl_host_init(void)
{
    lv_display_t * display = lv_display_create(WIDTH, HEIGHT);
    lv_display_set_flush_cb(display, flush_cb);
    lv_display_set_buffers(display, framebuffer, NULL, WIDTH * HEIGHT * PIXEL_SIZE, LV_DISPLAY_RENDER_MODE_DIRECT);
    lv_indev_t * pointer = lv_indev_create();
    lv_indev_set_type(pointer, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(pointer, read_cb);
}
#else
static lv_disp_draw_buf_t draw_buf;
static lv_disp_drv_t disp_drv;
static lv_indev_drv_t indev_drv;
static void flush_cb(lv_disp_drv_t * drv, const lv_area_t * area, lv_color_t * pixels)
{
    LV_UNUSED(area);
    LV_UNUSED(pixels);
    redraw = 1;
    lv_disp_flush_ready(drv);
}
static void read_cb(lv_indev_drv_t * drv, lv_indev_data_t * data)
{
    LV_UNUSED(drv);
    data->point.x = mouse_x;
    data->point.y = mouse_y;
    data->state = mouse_down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}
static void lvgl_host_init(void)
{
    lv_disp_draw_buf_init(&draw_buf, framebuffer, NULL, WIDTH * HEIGHT);
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = WIDTH;
    disp_drv.ver_res = HEIGHT;
    disp_drv.flush_cb = flush_cb;
    disp_drv.draw_buf = &draw_buf;
    disp_drv.direct_mode = 1;
    lv_disp_drv_register(&disp_drv);
    lv_indev_drv_init(&indev_drv);
    indev_drv.type = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = read_cb;
    lv_indev_drv_register(&indev_drv);
}
#endif

int main(int argc, char ** argv)
{
    setvbuf(stdout, NULL, _IONBF, 0);
    framebuffer = calloc(WIDTH * HEIGHT, PIXEL_SIZE);
    lv_init();
    lvgl_host_init();
    ui_init();

#ifdef ML_HEADLESS
    lv_refr_now(NULL);
    FILE * out = argc > 1 ? fopen(argv[1], "wb") : NULL;
    if(!out) return 1;
    fwrite(framebuffer, PIXEL_SIZE, WIDTH * HEIGHT, out);
    fclose(out);
    return 0;
#else
    LV_UNUSED(argc);
    LV_UNUSED(argv);
    if(SDL_Init(SDL_INIT_VIDEO) != 0) {
        fprintf(stderr, "SDL: %s\\n", SDL_GetError());
        return 1;
    }
    SDL_Window * window = SDL_CreateWindow(${JSON.stringify(`${project.name} - LVGL ${project.lvgl}`)}, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, WIDTH, HEIGHT, 0);
    SDL_Renderer * renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED);
    SDL_Texture * texture = SDL_CreateTexture(renderer, WINDOW_FORMAT, SDL_TEXTUREACCESS_STREAMING, WIDTH, HEIGHT);
    Uint32 last = SDL_GetTicks();
    int running = 1;
    printf("started: %dx%d, LVGL %d.%d.%d\\n", WIDTH, HEIGHT, LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR, LVGL_VERSION_PATCH);
    while(running) {
        SDL_Event event;
        while(SDL_PollEvent(&event)) {
            if(event.type == SDL_QUIT) running = 0;
            else if(event.type == SDL_MOUSEMOTION) {
                mouse_x = event.motion.x;
                mouse_y = event.motion.y;
            }
            else if(event.type == SDL_MOUSEBUTTONDOWN || event.type == SDL_MOUSEBUTTONUP) {
                mouse_x = event.button.x;
                mouse_y = event.button.y;
                mouse_down = event.type == SDL_MOUSEBUTTONDOWN;
            }
        }
        Uint32 now = SDL_GetTicks();
        lv_tick_inc(now - last);
        last = now;
        lv_timer_handler();
        if(redraw) {
            redraw = 0;
            SDL_UpdateTexture(texture, NULL, framebuffer, WIDTH * PIXEL_SIZE);
            SDL_RenderCopy(renderer, texture, NULL, NULL);${roundMask}
            SDL_RenderPresent(renderer);
        }
        SDL_Delay(5);
    }
    SDL_Quit();
    return 0;
#endif
}
`;
}

function generateCMake(sources) {
  const list = sources.map((file) => `  ${file}`).join("\n");
  return `# Generated by My LVGL Studio: builds LVGL and the designed screens for the desktop.
#   cmake -S . -B build -G Ninja -DLVGL_DIR=<folder of the LVGL sources>
cmake_minimum_required(VERSION 3.16)
project(lvgl_app C)

set(LVGL_DIR "\${CMAKE_CURRENT_SOURCE_DIR}/lvgl" CACHE PATH "Folder of the LVGL sources")
if(NOT EXISTS "\${LVGL_DIR}/lvgl.h")
  message(FATAL_ERROR "LVGL was not found in \${LVGL_DIR}; pass -DLVGL_DIR=<folder of the LVGL sources>")
endif()

file(GLOB_RECURSE LVGL_SOURCES CONFIGURE_DEPENDS "\${LVGL_DIR}/src/*.c")
add_library(lvgl STATIC \${LVGL_SOURCES})
target_include_directories(lvgl PUBLIC "\${LVGL_DIR}" "\${CMAKE_CURRENT_SOURCE_DIR}/config")
target_compile_definitions(lvgl PUBLIC LV_CONF_INCLUDE_SIMPLE)
target_compile_options(lvgl PRIVATE -O2 -w)

add_executable(app
${list}
)
target_include_directories(app PRIVATE "\${CMAKE_CURRENT_SOURCE_DIR}/${UI_DIR}")
target_link_libraries(app PRIVATE lvgl)
target_compile_definitions(app PRIVATE UI_FONT_DIR="\${CMAKE_CURRENT_SOURCE_DIR}/assets/fonts")
if(ML_HEADLESS)
  target_compile_definitions(app PRIVATE ML_HEADLESS)
else()
  find_package(SDL2 REQUIRED CONFIG)
  target_link_libraries(app PRIVATE SDL2::SDL2)
endif()
if(NOT WIN32)
  target_link_libraries(app PRIVATE m)
endif()
`;
}

/** Every generated file of the project, keyed by its path inside the project folder. */
export function generateCode(project, options = {}) {
  const ui = generateUi(project, options);
  const sources = ["src/main.c", ...Object.keys(ui).filter((file) => file.endsWith(".c")).sort()];
  return {
    ...ui,
    "src/main.c": generateMain(project),
    "config/lv_conf.h": generateLvConf(project),
    "CMakeLists.txt": generateCMake(sources),
  };
}

/** The whole project folder: the project file and the code. */
export function projectFiles(project, baseName) {
  return { [`${baseName}.${FILE_EXTENSION}`]: serializeProject(project), ...generateCode(project) };
}
