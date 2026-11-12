// The way back from the generated MVVM code to the design, like codeparse.js for the screens:
//   src/ui/ui_bindings.c   one mv_bind() per binding
//   src/glue/vm_<name>.c   one mv_prop_init_*() per ViewModel property
// The other lines of these files follow from those, so only these statements are read. A
// statement that cannot be read is an error with its line, and nothing is applied.
import { bindAttr, bindableKeys, defaultMode } from "./schema.js";
import { cNames } from "./emit.js";
import { screenOf, walk } from "./project.js";
import {
  addVmProp, contextOf, editVmProp, removeVmProp, renameVmProp, setBinding, validVmName, viewModels, vmPrefix,
} from "./viewmodel.js";

export const BINDINGS_FILE = "src/ui/ui_bindings.c";
export const VM_FILE = /^src\/glue\/(vm_[a-z0-9_]+)\.c$/;

export class GlueError extends Error {
  constructor(code, line, params = {}) {
    super(code);
    this.code = code;
    this.line = line;
    this.params = params;
  }
}

/** Comments become spaces; strings stay, so formats and names can be read. Lines are kept. */
function withoutComments(text) {
  let out = "";
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"' && text[end] !== "\n") end += text[end] === "\\" ? 2 : 1;
      out += text.slice(i, end + 1);
      i = end + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      let end = text.indexOf("\n", i);
      if (end < 0) end = text.length;
      out += " ".repeat(end - i);
      i = end;
    } else if (c === "/" && text[i + 1] === "*") {
      let end = text.indexOf("*/", i + 2);
      end = end < 0 ? text.length : end + 2;
      out += text.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/** A C string literal as text; null when it is not one. */
function cText(literal) {
  const match = /^"((?:[^"\\\n]|\\.)*)"$/.exec(literal.trim());
  if (!match) return null;
  return match[1].replace(/\\(["\\nt?])/g, (_, c) => ({ n: "\n", t: "\t" })[c] ?? c);
}

/** Splits arguments at the commas outside strings. */
function argumentsOf(text) {
  const parts = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
      current += text.slice(i, end + 1);
      i = end;
    } else if (c === ",") {
      parts.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  parts.push(current.trim());
  return parts;
}

/** Every call of `name` in the code: its arguments' text and its line. Unreadable calls are errors. */
function callsOf(code, name, pattern) {
  const calls = [];
  const all = new RegExp(`\\b${name}\\s*\\(`, "g");
  for (const found of code.matchAll(all)) {
    pattern.lastIndex = found.index;
    const match = pattern.exec(code);
    if (!match || match.index !== found.index) throw new GlueError("unknown", lineAt(code, found.index), { text: code.slice(found.index, code.indexOf("\n", found.index) >>> 0).trim() });
    calls.push({ match, line: lineAt(code, found.index) });
  }
  return calls;
}

const ATTRS = { MV_ATTR_VALUE: "value", MV_ATTR_TEXT: "text", MV_ATTR_CHECKED: "checked", MV_ATTR_HIDDEN: "hidden", MV_ATTR_DISABLED: "disabled" };
const MODES = { MV_ONE_WAY: "oneWay", MV_TWO_WAY: "twoWay", MV_ONE_WAY_TO_SOURCE: "oneWayToSource", MV_ONE_TIME: "oneTime" };
const BIND_CALL = /mv_bind\s*\(\s*(\w+)\s*,\s*(\w+)\s*\(\s*\)\s*,\s*&\s*\(\s*mv_binding_desc_t\s*\)\s*\{((?:[^}"]|"(?:[^"\\]|\\.)*")*)\}\s*\)\s*;/y;

/** Reads ui_bindings.c into the project: every binding of every widget. */
export function applyBindings(draft, text) {
  const code = withoutComments(String(text));
  const names = cNames(draft);
  const byName = new Map();
  walk(draft, (node) => byName.set(names.get(node.id), node));
  const models = new Map(viewModels(draft).map((vm) => [vmPrefix(vm), vm]));
  const read = [];
  for (const { match, line } of callsOf(code, "mv_bind", BIND_CALL)) {
    const [, objectName, accessor, body] = match;
    const node = byName.get(objectName);
    if (!node) throw new GlueError("noObject", line, { name: objectName });
    const access = /^(vm_[a-z0-9_]+?)_prop_(\w+)$/.exec(accessor);
    const vm = access && [...models.keys()].filter((prefix) => accessor.startsWith(`${prefix}_prop_`)).map((prefix) => models.get(prefix)).find((model) => model.props.some((prop) => accessor === `${vmPrefix(model)}_prop_${prop.name}`));
    if (!vm) throw new GlueError("noVmProp", line, { name: accessor });
    const prop = vm.props.find((item) => accessor === `${vmPrefix(vm)}_prop_${item.name}`);
    const fields = argumentsOf(body);
    if (fields.length !== 9) throw new GlueError("bindFields", line, { text: body.trim() });
    const [attrText, modeText, convText, , , formatText] = fields;
    const attr = ATTRS[attrText];
    const mode = MODES[modeText];
    if (!attr) throw new GlueError("unknown", line, { text: attrText });
    if (!mode) throw new GlueError("unknown", line, { text: modeText });
    const key = bindableKeys(node.type).find((item) => bindAttr(item) === attr);
    if (!key) throw new GlueError("bindNotHere", line, { name: objectName, attr: attrText });
    const flags = new Set(convText.split("|").map((part) => part.trim()));
    const range = flags.has("MV_CONV_RANGE");
    const invert = flags.has("MV_CONV_INVERT");
    if ([...flags].some((flag) => !["MV_CONV_NONE", "MV_CONV_RANGE", "MV_CONV_INVERT", "0"].includes(flag))) throw new GlueError("unknown", line, { text: convText });
    if (range && invert) throw new GlueError("twoConverters", line, {});
    let format;
    if (formatText !== "NULL") {
      format = cText(formatText);
      if (format === null) throw new GlueError("string", line, { text: formatText });
    }
    if (read.some((item) => item.node === node && item.key === key)) throw new GlueError("bindTwice", line, { name: objectName, attr: attrText });
    read.push({ node, key, vm, prop, mode, converter: range ? "range" : invert ? "invert" : undefined, format, line });
  }
  walk(draft, (node) => {
    delete node.bindings;
  });
  for (const item of read) {
    const context = contextOf(draft, screenOf(draft, item.node.id));
    setBinding(draft, item.node.id, item.key, {
      path: item.prop.name,
      vm: item.vm.name === context ? undefined : item.vm.name,
      mode: item.mode === defaultMode(item.node.type, item.key) ? undefined : item.mode,
      converter: item.converter,
      format: item.key === "text" ? item.format : undefined,
    });
  }
  return read;
}

const INIT_CALL = /mv_prop_init_(int|bool|string)\s*\(\s*&\s*\w+\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*((?:[^;"]|"(?:[^"\\]|\\.)*")*)\)\s*;/y;

/** Reads src/glue/vm_<name>.c into its ViewModel: the properties, their types, first values and ranges. */
export function applyViewModel(draft, file, text) {
  const prefix = VM_FILE.exec(file)?.[1];
  const vm = viewModels(draft).find((model) => vmPrefix(model) === prefix);
  if (!vm) throw new GlueError("noFile", 1, { file });
  const code = withoutComments(String(text));
  const read = [];
  for (const { match, line } of callsOf(code, "mv_prop_init_(?:int|bool|string)", INIT_CALL)) {
    const [, type, nameText, rest] = match;
    const name = cText(nameText);
    if (!validVmName(name)) throw new GlueError("vmName", line, { name: nameText });
    if (read.some((item) => item.name.toLowerCase() === name.toLowerCase())) throw new GlueError("duplicate", line, { name });
    const args = argumentsOf(rest);
    let value;
    let min;
    let max;
    if (type === "int") {
      if (args.length !== 3 || !args.every((arg) => /^-?\d+$/.test(arg))) throw new GlueError("number", line, { text: rest.trim() });
      [value, min, max] = args.map(Number);
    } else if (type === "bool") {
      if (args.length !== 1 || !["true", "false", "0", "1"].includes(args[0])) throw new GlueError("unknown", line, { text: rest.trim() });
      value = args[0] === "true" || args[0] === "1";
    } else {
      if (args.length !== 1) throw new GlueError("string", line, { text: rest.trim() });
      value = cText(args[0]);
      if (value === null) throw new GlueError("string", line, { text: args[0] });
    }
    read.push({ type, name, value, min, max, line });
  }
  // A name that changed in its place is a rename: its bindings and the logic's hint stay.
  // Otherwise what vanished is removed and what appeared is added.
  const kept = new Set(read.map((item) => item.name));
  const known = new Set(vm.props.map((prop) => prop.name));
  let gone = vm.props.map((prop, index) => ({ name: prop.name, index })).filter((prop) => !kept.has(prop.name));
  let fresh = read.filter((item) => !known.has(item.name));
  const renames = [];
  for (const old of gone) {
    const there = read[old.index];
    if (there && fresh.includes(there)) renames.push([old.name, there]);
  }
  gone = gone.filter((old) => !renames.some(([name]) => name === old.name));
  fresh = fresh.filter((item) => !renames.some(([, there]) => there === item));
  if (gone.length === fresh.length) gone.forEach((old, index) => renames.push([old.name, fresh[index]]));
  for (const [name, item] of renames) renameVmProp(draft, vm.name, name, item.name);
  if (gone.length !== fresh.length) {
    for (const old of gone) removeVmProp(draft, vm.name, old.name);
    for (const item of fresh) addVmProp(draft, vm.name, item.type, item.name);
  }
  const model = viewModels(draft).find((item) => item.name === vm.name);
  for (const item of read) {
    const prop = model.props.find((entry) => entry.name === item.name);
    if (prop.type !== item.type) editVmProp(draft, model.name, prop.name, { type: item.type });
    if (item.type === "int") {
      // 0, 0 is how a property without a range is printed.
      const none = item.min === 0 && item.max === 0 && prop.min === undefined && prop.max === undefined;
      if (!none) editVmProp(draft, model.name, prop.name, { min: item.min, max: item.max });
    }
    editVmProp(draft, model.name, prop.name, { value: item.value });
  }
  model.props.sort((a, b) => read.findIndex((item) => item.name === a.name) - read.findIndex((item) => item.name === b.name));
  return read;
}

export const isGlueCode = (file) => file === BINDINGS_FILE || VM_FILE.test(file);
