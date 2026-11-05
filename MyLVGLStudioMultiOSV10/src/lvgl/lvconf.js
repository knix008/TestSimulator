// lv_conf.h as data. What can be set is read from a version's own lv_conf_template.h, because
// the options differ a lot between versions (8.4 has 240, 9.6 has over 500, and names change).
// A project stores only what it changed, in project.lvConf; the rest stays as the studio's
// shared configuration (lvConfText.js) or LVGL's default.
import lvConfText from "./lvConfText.js";

const GUARD = /^(LV_CONF_H|LV_CONF_SUPPRESS_DEFINE_CHECK|__)/;
const OPTION_NAME = /^[A-Za-z_]\w*$/;

const stripComments = (text) => text.replace(/\/\*.*?\*\//g, " ").replace(/\/\/.*$/, " ").trim();
const commentText = (lines) => lines
  .map((line) => line.replace(/^\s*\/\*+\s?/, "").replace(/\*+\/\s*$/, "").replace(/^\s*\*+\s?/, "").trim())
  .filter(Boolean);

/* ------------------------------------------------------------ conditions */

/** Reads a preprocessor condition. `lookup` gives an option's value, or undefined. */
export function evaluateCondition(expression, lookup) {
  const tokens = String(expression).match(/defined|&&|\|\||==|!=|>=|<=|[()!<>]|[A-Za-z_]\w*|0x[0-9a-fA-F]+|\d+/g) ?? [];
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  const number = (value) => {
    if (typeof value === "number") return value;
    if (value === undefined || value === "") return 0;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  };
  const truthy = (value) => {
    const n = number(value);
    return Number.isNaN(n) ? false : n !== 0;
  };
  const primary = () => {
    const token = take();
    if (token === "(") {
      const value = or();
      take();
      return value;
    }
    if (token === "!") return truthy(primary()) ? 0 : 1;
    if (token === "defined") {
      const open = peek() === "(";
      if (open) take();
      const name = take();
      if (open) take();
      return lookup(name) === undefined ? 0 : 1;
    }
    if (token === undefined) return 0;
    if (/^(0x|\d)/.test(token)) return Number(token);
    return lookup(token) ?? token;
  };
  const compare = () => {
    const left = primary();
    const op = peek();
    if (!["==", "!=", ">", "<", ">=", "<="].includes(op)) return left;
    take();
    const right = primary();
    const [a, b] = [number(left), number(right)];
    const numeric = !Number.isNaN(a) && !Number.isNaN(b);
    switch (op) {
      case "==": return (numeric ? a === b : String(left) === String(right)) ? 1 : 0;
      case "!=": return (numeric ? a !== b : String(left) !== String(right)) ? 1 : 0;
      case ">": return a > b ? 1 : 0;
      case "<": return a < b ? 1 : 0;
      case ">=": return a >= b ? 1 : 0;
      default: return a <= b ? 1 : 0;
    }
  };
  function and() {
    let value = compare();
    while (peek() === "&&") {
      take();
      const right = compare();
      value = truthy(value) && truthy(right) ? 1 : 0;
    }
    return value;
  }
  function or() {
    let value = and();
    while (peek() === "||") {
      take();
      const right = and();
      value = truthy(value) || truthy(right) ? 1 : 0;
    }
    return value;
  }
  return truthy(or());
}

/* -------------------------------------------------------------- the template */

/** Is a 0 or 1 an on/off switch? Otherwise it is a number that happens to be small. */
function isSwitch(name, description) {
  if (/^LV_USE_|^LV_FONT_(MONTSERRAT|UNSCII|SIMSUN|DEJAVU|CUSTOM|SOURCE)|^LV_BUILD_|^LV_ENABLE_|^LV_DISABLE_/.test(name)) return true;
  if (/\b0\s*:/.test(description) && /\b1\s*:/.test(description)) return true;
  // Names that count or measure something hold numbers, even when the default is 0 or 1.
  return !/ADR|ADDR|SIZE|CNT|COUNT|_NUM|LEN|OFS|ALIGN|MAX|MIN|PERIOD|TIME|LIMIT|WIDTH|HEIGHT|DEPTH|PERCENT|EXPAND|MEMORY|_RES|DPI|FACES|SIZES|CACHE_DEF/.test(name);
}

function kindOf(option) {
  const { name, description } = option;
  const value = option.occurrences[0].value;
  if (value === "0" || value === "1") {
    if (isSwitch(name, description)) return { kind: "bool" };
  }
  if (/^lv_color_hex\(\s*0x[0-9a-f]{1,6}\s*\)$/i.test(value)) return { kind: "color" };
  if (/^LV_[A-Z0-9_]+$/.test(value)) {
    // "Possible values" in the comment, sharing the start of the value's own name.
    const named = [...description.matchAll(/\bLV_[A-Z0-9_]+\b/g)].map((match) => match[0]);
    for (const segments of [3, 2]) {
      const start = `${value.split("_").slice(0, segments).join("_")}_`;
      const choices = [...new Set([value, ...named.filter((item) => item.startsWith(start) && item !== name)])];
      if (choices.length >= 2) return { kind: "enum", choices };
    }
  }
  if (/^-?\d+$/.test(value)) {
    // "1 (I1), 8 (L8), 16 (RGB565)" in the comment.
    const listed = [...description.matchAll(/\b(\d+)\s*\(/g)].map((match) => match[1]);
    if (new Set(listed).size >= 2 && listed.includes(value)) return { kind: "enum", choices: [...new Set(listed)] };
    return { kind: "int" };
  }
  return { kind: "text" };
}

/**
 * The options of a lv_conf_template.h:
 *   sections: [{ title, groups: [{ title, names: [...] }] }]
 *   options:  Map(name -> { name, kind, choices, description, section, group, occurrences })
 * An occurrence is one #define: its value and the #if conditions around it.
 */
export function parseConfTemplate(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  const options = new Map();
  const stack = [];
  let section = null;
  let group = null;
  let pending = "";

  const openSection = (title) => {
    section = { title, groups: [] };
    group = { title: "", names: [] };
    section.groups.push(group);
    sections.push(section);
  };
  openSection("General");

  for (let index = 0; index < lines.length; index++) {
    let line = lines[index].trim();
    if (line === "") {
      pending = "";
      continue;
    }
    if (line.startsWith("/*")) {
      const block = [line];
      while (!line.includes("*/") && index + 1 < lines.length) {
        index++;
        line = lines[index];
        block.push(line);
      }
      const rule = /^\/\*+\s*(=|-){3,}/.exec(block[0]);
      const words = commentText(block).map((row) => row.replace(/^[=\-\s]+|[=\-\s]+$/g, "")).filter(Boolean);
      if (rule && rule[1] === "=" && words.length) {
        openSection(words.join(" "));
        pending = "";
      } else if (rule && words.length) {
        group = { title: words.join(" "), names: [] };
        section.groups.push(group);
        pending = "";
      } else {
        pending = commentText(block).join("\n");
      }
      continue;
    }
    if (!line.startsWith("#")) {
      pending = "";
      continue;
    }
    while (line.endsWith("\\") && index + 1 < lines.length) {
      index++;
      line = `${line.slice(0, -1)} ${lines[index].trim()}`;
    }
    const trailing = /\/\*+<?\s*(.*?)\s*\*+\//.exec(line)?.[1] ?? "";
    const directive = stripComments(line);
    const match = /^#\s*(\w+)\s*(.*)$/.exec(directive);
    if (!match) continue;
    const [, keyword, rest] = match;
    if (keyword === "if" || keyword === "ifdef" || keyword === "ifndef") {
      const condition = keyword === "if" ? rest : keyword === "ifdef" ? `defined(${rest})` : `!defined(${rest})`;
      // The outer "#if 0" of the template and the header guard say nothing about an option.
      const wrapper = (stack.length === 0 && rest === "0") || /^LV_CONF_H$/.test(rest);
      stack.push({ condition: wrapper ? null : condition, dead: /^0\b/.test(rest) && !wrapper });
    } else if (keyword === "elif") {
      const top = stack.at(-1);
      if (top) top.condition = `!(${top.condition}) && (${rest})`;
    } else if (keyword === "else") {
      const top = stack.at(-1);
      if (top?.condition) top.condition = `!(${top.condition})`;
    } else if (keyword === "endif") {
      stack.pop();
    } else if (keyword === "define") {
      const define = /^#\s*define\s+(\w+)(\()?\s*(.*)$/.exec(directive);
      const description = pending;
      pending = "";
      if (!define || define[2] || GUARD.test(define[1]) || stack.some((item) => item.dead)) continue;
      const name = define[1];
      const occurrence = { value: define[3].trim(), conditions: stack.map((item) => item.condition).filter(Boolean) };
      const known = options.get(name);
      if (known) {
        known.occurrences.push(occurrence);
        continue;
      }
      options.set(name, { name, description: description || trailing, section: section.title, group: group.title, occurrences: [occurrence] });
      group.names.push(name);
    } else {
      pending = "";
    }
  }

  const fonts = [...options.keys()].map((name) => /^LV_FONT_MONTSERRAT_(\d+)$/.exec(name)?.[1]).filter(Boolean);
  for (const option of options.values()) {
    Object.assign(option, kindOf(option));
    if (/^&lv_font_/.test(option.occurrences[0].value) && fonts.length) {
      option.kind = "enum";
      option.choices = [...new Set([option.occurrences[0].value, ...fonts.map((size) => `&lv_font_montserrat_${size}`)])];
    }
  }
  const used = sections.map((item) => ({ ...item, groups: item.groups.filter((entry) => entry.names.length) })).filter((item) => item.groups.length);
  return { sections: used, options };
}

/* ---------------------------------------------------------------- the values */

/** Every #define of a lv_conf.h, as name -> value. */
export function readDefines(text) {
  const defines = new Map();
  for (const row of String(text).replace(/\r\n/g, "\n").split("\n")) {
    const match = /^\s*#\s*define\s+(\w+)(\()?\s*(.*)$/.exec(stripComments(row));
    if (match && !match[2] && !GUARD.test(match[1])) defines.set(match[1], match[3].trim());
  }
  return defines;
}

const BASE = readDefines(lvConfText);
/** How LVGL 9.6 reads an old LV_COLOR_DEPTH (lv_conf_internal.h). */
const FORMAT_OF_DEPTH = { 1: "LV_COLOR_FORMAT_I1", 8: "LV_COLOR_FORMAT_L8", 16: "LV_COLOR_FORMAT_RGB565", 24: "LV_COLOR_FORMAT_RGB888", 32: "LV_COLOR_FORMAT_XRGB8888" };
/** The depth of a 9.6 colour format: what the simulator can show depends on it. */
export const depthOfFormat = (format) => (/I1$/.test(format) ? 1 : /L8$/.test(format) ? 8 : /RGB565/.test(format) ? 16 : /RGB888$/.test(format) ? 24 : 32);

/** What is written for an option when the project does not change it. */
function looker(model, overrides, useOverrides) {
  const memo = new Map();
  const value = (name) => {
    if (memo.has(name)) return memo.get(name);
    memo.set(name, undefined); // A condition about itself ends here.
    let found;
    if (useOverrides && overrides?.[name] !== undefined) found = overrides[name];
    else if (name === "LV_COLOR_FORMAT_DEFAULT") found = FORMAT_OF_DEPTH[(useOverrides ? overrides?.LV_COLOR_DEPTH : undefined) ?? BASE.get("LV_COLOR_DEPTH")];
    else if (BASE.has(name)) found = BASE.get(name);
    else {
      const option = model.options.get(name);
      if (option) found = (activeOccurrence(option, value) ?? option.occurrences[0]).value;
    }
    memo.set(name, found);
    return found;
  };
  return value;
}

function activeOccurrence(option, lookup) {
  return option.occurrences.find((item) => item.conditions.every((condition) => evaluateCondition(condition, lookup)));
}

/** The value in effect for a project: its own, or the studio's, or LVGL's default. */
export const confValue = (model, overrides, name) => looker(model, overrides, true)(name) ?? "";
/** The value the option returns to when reset. */
export const confDefault = (model, overrides, name) => {
  if (name === "LV_COLOR_FORMAT_DEFAULT") return FORMAT_OF_DEPTH[BASE.get("LV_COLOR_DEPTH")];
  if (BASE.has(name)) return BASE.get(name);
  const option = model.options.get(name);
  if (!option) return "";
  return (activeOccurrence(option, looker(model, overrides, true)) ?? option.occurrences[0]).value;
};
/** False when an #if around the option is off: LVGL then does not read it. */
export const confActive = (model, overrides, name) => {
  const option = model.options.get(name);
  return option ? Boolean(activeOccurrence(option, looker(model, overrides, true))) : false;
};
/** The conditions that keep an inactive option off, for telling the user. */
export const confNeeds = (model, name) => model.options.get(name)?.occurrences[0].conditions.join(" && ") ?? "";

/** Options the project sets that this version's template does not have. */
export const unknownOverrides = (model, overrides) => Object.keys(overrides ?? {}).filter((name) => !model.options.has(name)).sort();

/** Sets one option on a project: a value equal to the default is simply not stored. */
export function setConfValue(project, model, name, value) {
  const overrides = { ...project.lvConf };
  delete overrides[name];
  if (value !== undefined && String(value).trim() !== confDefault(model, overrides, name).trim()) overrides[name] = String(value).trim();
  if (Object.keys(overrides).length) project.lvConf = overrides;
  else delete project.lvConf;
}

export const validConfValue = (value) => typeof value === "string" && !/[\r\n]/.test(value) && !value.includes("/*") && !value.includes("//");
export const validConfName = (name) => OPTION_NAME.test(name) && !GUARD.test(name);

/** The project's config/lv_conf.h: the shared file with the project's values in it. */
export function generateLvConf(project) {
  const overrides = project.lvConf;
  if (!overrides || !Object.keys(overrides).length) return lvConfText;
  // With a format, 9.6 would keep the shared file's depth instead of deriving it from the format.
  const rows = lvConfText.split("\n").filter((row) => !(overrides.LV_COLOR_FORMAT_DEFAULT !== undefined && overrides.LV_COLOR_DEPTH === undefined && /^\s*#\s*define\s+LV_COLOR_DEPTH\b/.test(row)));
  const placed = new Set();
  const out = rows.map((row) => {
    const match = /^(\s*#\s*define\s+)(\w+)(\s+.*)?$/.exec(row);
    if (!match || overrides[match[2]] === undefined) return row;
    placed.add(match[2]);
    return `${match[1]}${match[2]} ${overrides[match[2]]}`.trimEnd();
  });
  const extra = Object.keys(overrides).filter((name) => !placed.has(name)).sort();
  if (extra.length) {
    const end = out.lastIndexOf("#endif");
    out.splice(end, 0, "/* Set in the project's LVGL settings */", ...extra.map((name) => `#define ${name} ${overrides[name]}`.trimEnd()), "");
  }
  return out.join("\n");
}

/** Reads an edited lv_conf.h back: what differs from the shared file is what the project sets. */
export function overridesFromText(text) {
  const overrides = {};
  const defines = readDefines(text);
  for (const [name, value] of defines) {
    if (BASE.get(name) !== value) overrides[name] = value;
  }
  return overrides;
}

/* ---------------------------------------------- what the configuration breaks */

const WIDGET_OPTION = {
  button: ["LV_USE_BUTTON", "LV_USE_BTN"],
  image: ["LV_USE_IMAGE", "LV_USE_IMG"],
  imagebutton: ["LV_USE_IMAGEBUTTON", "LV_USE_IMGBTN"],
  buttonmatrix: ["LV_USE_BUTTONMATRIX", "LV_USE_BTNMATRIX"],
  animimage: ["LV_USE_ANIMIMG", "LV_USE_ANIMIMAGE"],
};

/** The option that turned a widget off in these values, if any. */
export function disabledWidgetOption(type, overrides) {
  if (!overrides || type === "screen" || type === "container" || type === "grid") return null;
  const names = WIDGET_OPTION[type] ?? [`LV_USE_${type.toUpperCase()}`];
  return names.find((name) => overrides[name] === "0") ?? null;
}
