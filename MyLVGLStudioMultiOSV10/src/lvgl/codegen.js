// Prints a project as C for its LVGL version, as a folder structure:
//   src/ui/...             the screens, for the firmware
//   src/main.c, config/lv_conf.h, CMakeLists.txt   the desktop simulator
import { apiFor, parseVersion } from "./versions.js";
import { ALIGNS, CHART_TYPES, FLEX_FLOWS, SERIES_COLORS } from "./schema.js";
import { imageData } from "./images.js";
import { cNames, colorValue, emit } from "./emit.js";
import { FILE_EXTENSION, serializeProject, walk } from "./project.js";
import lvConf from "./lvConfText.js";

export const UI_DIR = "src/ui";
export const SCREENS_DIR = "src/ui/screens";
export const IMAGES_DIR = "src/ui/images";
/** Only generated code lives here, so files of removed screens can be deleted on save. */
export const GENERATED_DIRS = [SCREENS_DIR, IMAGES_DIR];

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

function createCall(type, parent, api) {
  switch (type) {
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
    case "indicatorColor": return `lv_obj_set_style_bg_color(${o}, lv_color_hex(${hex(value)}), ${type === "switch" ? "LV_PART_INDICATOR | LV_STATE_CHECKED" : "LV_PART_INDICATOR"});`;
    case "flexFlow": return `lv_obj_set_flex_flow(${o}, LV_FLEX_FLOW_${FLEX_FLOWS[value]});`;
    case "value":
      if (type === "slider") return `lv_slider_set_value(${o}, ${value}, LV_ANIM_OFF);`;
      if (type === "bar") return `lv_bar_set_value(${o}, ${value}, LV_ANIM_OFF);`;
      if (type === "spinbox") return `lv_spinbox_set_value(${o}, ${value});`;
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
    case "chartType": return `lv_chart_set_type(${o}, LV_CHART_TYPE_${CHART_TYPES[value]});`;
    default: throw new Error(`unknown property ${prop}`);
  }
}

function setTextCall(name, type, text) {
  const literal = cString(text);
  switch (type) {
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

function strLine(name, type, prop, value) {
  if (prop === "text") return setTextCall(name, type, value);
  if (prop === "placeholder") return `lv_textarea_set_placeholder_text(${name}, ${cString(value)});`;
  if (type === "dropdown") return `lv_dropdown_set_options(${name}, ${cString(value)});`;
  return `lv_roller_set_options(${name}, ${cString(value)}, LV_ROLLER_MODE_NORMAL);`;
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
  walk(project, (node) => {
    header.push(`extern lv_obj_t * ${names.get(node.id)};`);
    if (node.type === "button") header.push(`extern lv_obj_t * ${names.get(node.id)}_label;`);
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
      case "setText": eventSource.push(`    ${setTextCall(target, typeOf(event.target), event.text)}`); break;
      case "toggle":
        eventSource.push(
          `    if(lv_obj_has_flag(${target}, LV_OBJ_FLAG_HIDDEN)) ${api.removeFlag}(${target}, LV_OBJ_FLAG_HIDDEN);`,
          `    else lv_obj_add_flag(${target}, LV_OBJ_FLAG_HIDDEN);`,
        );
        break;
      case "show": eventSource.push(`    ${api.removeFlag}(${target}, LV_OBJ_FLAG_HIDDEN);`); break;
      case "hide": eventSource.push(`    lv_obj_add_flag(${target}, LV_OBJ_FLAG_HIDDEN);`); break;
      case "log": eventSource.push(`    printf("%s\\n", ${cString(event.text)});`, "    fflush(stdout);"); break;
      default: break;
    }
    eventSource.push("}", "");
  });
  files[`${UI_DIR}/ui_events.c`] = eventSource.join("\n");

  /* screens/ui_<name>.c */
  for (const [screenId, list] of byScreen) {
    const source = [GENERATED_NOTE, '#include "ui.h"', "", `void ${nameOf(screenId)}_create(void)`, "{"];
    for (const op of list) {
      const name = nameOf(op.id);
      const type = typeOf(op.id);
      if (op.op === "create") {
        const parent = op.parent >= 0 ? nameOf(op.parent) : "NULL";
        source.push(`    ${name} = ${createCall(type, parent, api)};`);
        if (type === "button") source.push(`    ${name}_label = lv_label_create(${name});`, `    lv_obj_center(${name}_label);`);
      } else if (op.op === "range") {
        source.push(type === "chart"
          ? `    ${api.chartRange}(${name}, LV_CHART_AXIS_PRIMARY_Y, ${op.min}, ${op.max});`
          : `    lv_${type}_set_range(${name}, ${op.min}, ${op.max});`);
      } else if (op.op === "str" && ["items", "cells", "series", "tabs", "map", "points"].includes(op.prop)) {
        for (const line of dataLines(name, op.prop, op.value, api)) source.push(`    ${line}`);
      } else if (op.op === "str") {
        source.push(`    ${strLine(name, type, op.prop, op.value)}`);
      } else if (op.op === "digits") {
        source.push(`    lv_spinbox_set_digit_format(${name}, ${op.count}, ${op.separator});`);
      } else if (op.op === "date") {
        source.push(`    lv_calendar_set_today_date(${name}, ${op.year}, ${op.month}, ${op.day});`, `    ${api.calendarMonth}(${name}, ${op.year}, ${op.month});`);
      } else if (op.op === "image") {
        if (imageData(op.name)) source.push(`    ${api.imageSrc}(${name}, &ui_img_${op.name});`);
      } else if (op.op === "link") {
        continue;
      } else {
        source.push(`    ${intLine(name, op.prop, op.value, type, api)}`);
      }
    }
    source.push("}", "");
    files[`${SCREENS_DIR}/${nameOf(screenId)}.c`] = source.join("\n");
  }

  /* images/ui_img_<name>.c */
  for (const image of images) files[`${IMAGES_DIR}/ui_img_${image.name}.c`] = imageSource(image.name, project.lvgl, options);

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
  });
  source.push(
    "",
    "void ui_init(void)",
    "{",
    `    ${api.display} * display = ${api.defaultDisplay}();`,
    `    lv_theme_t * theme = lv_theme_default_init(display, lv_color_hex(${hex(colorValue(theme.primary))}), lv_color_hex(${hex(colorValue(theme.secondary))}), ${theme.dark ? "true" : "false"}, LV_FONT_DEFAULT);`,
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
  const { w, h } = project.device;
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
    lv_display_set_buffers(display, framebuffer, NULL, WIDTH * HEIGHT * 4, LV_DISPLAY_RENDER_MODE_DIRECT);
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
    framebuffer = calloc(WIDTH * HEIGHT, 4);
    lv_init();
    lvgl_host_init();
    ui_init();

#ifdef ML_HEADLESS
    lv_refr_now(NULL);
    FILE * out = argc > 1 ? fopen(argv[1], "wb") : NULL;
    if(!out) return 1;
    fwrite(framebuffer, 4, WIDTH * HEIGHT, out);
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
    SDL_Texture * texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_STREAMING, WIDTH, HEIGHT);
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
            SDL_UpdateTexture(texture, NULL, framebuffer, WIDTH * 4);
            SDL_RenderCopy(renderer, texture, NULL, NULL);
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
    "config/lv_conf.h": lvConf,
    "CMakeLists.txt": generateCMake(sources),
  };
}

/** The whole project folder: the project file and the code. */
export function projectFiles(project, baseName) {
  return { [`${baseName}.${FILE_EXTENSION}`]: serializeProject(project), ...generateCode(project) };
}
