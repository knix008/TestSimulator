// Turns a project into a flat list of operations. The engine replays them to draw the
// design surface; the generator prints them as C. Having one list is what keeps the
// design surface and the generated code from drifting apart.
import { ALIGNS, CHART_TYPES, FLEX_FLOWS, TRIGGERS, WIDGETS } from "./schema.js";
import { sanitizeName, walk } from "./project.js";

export const colorValue = (hex) => Number.parseInt(String(hex).replace("#", ""), 16) & 0xffffff;

function sizeOps(axis, value) {
  if (value === undefined) return [];
  const key = axis === "w" ? "width" : "height";
  if (value === "content") return [[`${key}Content`, 0]];
  const text = String(value).trim();
  if (text.endsWith("%")) return [[`${key}Pct`, Number.parseInt(text, 10) || 0]];
  return [[key, Number.parseInt(text, 10) || 0]];
}

function propOps(node) {
  const props = node.props;
  const ops = [];
  const known = new Set(WIDGETS[node.type].props.map((prop) => prop.key));
  const add = (key, value) => ops.push({ prop: key, value });
  if (known.has("flexFlow") && props.flexFlow !== undefined) add("flexFlow", FLEX_FLOWS.indexOf(props.flexFlow));
  if (known.has("width")) for (const [key, value] of sizeOps("w", props.width)) add(key, value);
  if (known.has("height")) for (const [key, value] of sizeOps("h", props.height)) add(key, value);
  if (known.has("align") && props.align !== undefined) add("align", ALIGNS.indexOf(props.align));
  for (const key of ["x", "y"]) if (known.has(key) && props[key] !== undefined) add(key, Number(props[key]) || 0);
  if (known.has("rotation") && props.rotation !== undefined) add("rotation", (Number(props.rotation) || 0) * 10);
  if (known.has("scale") && props.scale !== undefined) add("scale", Math.round(((Number(props.scale) || 100) * 256) / 100));
  for (const key of ["value", "selected", "ledBright", "lineWidth", "columnWidth", "bgOpa", "borderWidth", "radius", "pad", "shadowWidth", "opa", "gap", "font"]) {
    if (known.has(key) && props[key] !== undefined) add(key, Number(props[key]) || 0);
  }
  for (const key of ["bgColor", "borderColor", "textColor", "shadowColor", "indicatorColor", "lineColor"]) {
    if (known.has(key) && props[key] !== undefined) add(key, colorValue(props[key]));
  }
  for (const key of ["hidden", "clickable", "scrollable", "checked", "disabled"]) {
    if (known.has(key) && props[key] !== undefined) add(key, props[key] ? 1 : 0);
  }
  return ops;
}

/**
 * ops, in order:
 *   { op: "create", id, node, type, parent }   parent is -1 for a screen
 *   { op: "range", id, min, max }
 *   { op: "str", id, prop, value }
 *   { op: "int", id, prop, value }
 *   { op: "digits", id, count, separator }   a spinbox, before its range
 *   { op: "date", id, year, month, day }     a calendar
 *   { op: "image", id, index, name }         an image's source, an index into project.images
 *   { op: "link", id, target }               a keyboard's text area, after all objects exist
 *   { op: "event", id, trigger, action, target, text }
 * `ids` maps a node's string id to the small integer the engine uses.
 */
export function emit(project) {
  const ids = new Map();
  walk(project, (node) => ids.set(node.id, ids.size));
  const ops = [];
  walk(project, (node, parent) => {
    const id = ids.get(node.id);
    const known = new Set(WIDGETS[node.type].props.map((prop) => prop.key));
    ops.push({ op: "create", id, node, type: node.type, parent: parent ? ids.get(parent.id) : -1 });
    if (known.has("digits") && node.props.digits !== undefined) {
      ops.push({ op: "digits", id, count: Number(node.props.digits) || 1, separator: Number(node.props.separator) || 0 });
    }
    if (known.has("chartType") && node.props.chartType !== undefined) ops.push({ op: "int", id, prop: "chartType", value: Math.max(0, CHART_TYPES.indexOf(node.props.chartType)) });
    if (known.has("min") && node.props.min !== undefined && node.props.max !== undefined) {
      ops.push({ op: "range", id, min: Number(node.props.min) || 0, max: Number(node.props.max) || 0 });
    }
    // Options come before `selected`, which is emitted among the integer properties.
    if (known.has("options") && node.props.options !== undefined) ops.push({ op: "str", id, prop: "options", value: String(node.props.options) });
    if (known.has("text") && node.props.text !== undefined) ops.push({ op: "str", id, prop: "text", value: String(node.props.text) });
    if (known.has("placeholder") && node.props.placeholder !== undefined) ops.push({ op: "str", id, prop: "placeholder", value: String(node.props.placeholder) });
    for (const key of ["items", "cells", "series", "tabs", "map", "points"]) {
      if (known.has(key) && node.props[key]) ops.push({ op: "str", id, prop: key, value: String(node.props[key]).replace(/\r/g, "") });
    }
    if (known.has("year") && node.props.year !== undefined) {
      ops.push({ op: "date", id, year: Number(node.props.year) || 2026, month: Number(node.props.month) || 1, day: Number(node.props.day) || 1 });
    }
    if (known.has("src") && node.props.src) {
      const index = (project.images ?? []).findIndex((image) => image.name === node.props.src);
      if (index >= 0) ops.push({ op: "image", id, index, name: node.props.src });
    }
    for (const item of propOps(node)) ops.push({ op: "int", id, prop: item.prop, value: item.value });
  });
  walk(project, (node) => {
    if (node.type === "keyboard" && ids.has(node.props.target)) ops.push({ op: "link", id: ids.get(node.id), target: ids.get(node.props.target) });
  });
  // Events last: an action may point at an object created after its source.
  walk(project, (node) => {
    for (const event of node.events) {
      if (!TRIGGERS.includes(event.trigger)) continue;
      const needsTarget = event.action !== "log";
      if (needsTarget && !ids.has(event.target)) continue;
      ops.push({
        op: "event",
        id: ids.get(node.id),
        trigger: event.trigger,
        action: event.action,
        target: needsTarget ? ids.get(event.target) : -1,
        text: String(event.text ?? ""),
      });
    }
  });
  return { ops, ids };
}

/**
 * Object names in generated C: ui_<name>, unique even after sanitising. Names that differ
 * only by case count as clashes, because a screen's name is also its file name.
 */
export function cNames(project) {
  const names = new Map();
  const taken = new Set();
  walk(project, (node) => {
    const base = `ui_${sanitizeName(node.name) || "obj"}`;
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}_${n}`;
    taken.add(name.toLowerCase());
    names.set(node.id, name);
  });
  return names;
}
