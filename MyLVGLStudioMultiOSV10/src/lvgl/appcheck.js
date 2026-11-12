// Reads the application's own code (src/app) for the ViewModel names it uses, and finds those
// the design no longer has: after renaming or deleting a ViewModel or a property, the logic
// would stop compiling. The studio never changes that code; it only says where to look, before
// a build does. Not a C parser: it looks at identifiers outside comments and strings.
import { glueIdentifiers } from "./gluegen.js";
import { findViewModel, formerNames, viewModels, vmPrefix } from "./viewmodel.js";
import { vmNames } from "./gluegen.js";

/** The text with comments, strings and character literals blanked; lines and columns stay. */
export function codeOnly(text) {
  const source = String(text);
  let out = "";
  const blank = (part) => part.replace(/[^\n]/g, " ");
  for (let i = 0; i < source.length; ) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      let end = source.indexOf("\n", i);
      if (end < 0) end = source.length;
      out += blank(source.slice(i, end));
      i = end;
    } else if (c === "/" && next === "*") {
      let end = source.indexOf("*/", i + 2);
      end = end < 0 ? source.length : end + 2;
      out += blank(source.slice(i, end));
      i = end;
    } else if (c === '"' || c === "'") {
      let end = i + 1;
      while (end < source.length && source[end] !== c && source[end] !== "\n") end += source[end] === "\\" ? 2 : 1;
      end = Math.min(source.length, end + 1);
      out += c + blank(source.slice(i + 1, end - 1)) + (source[end - 1] === c ? c : blank(source[end - 1] ?? ""));
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** The shape of a name the generator makes: vm_<model>_get_/set_/prop_<property>, vm_<model>_init. */
const GLUE_SHAPE = /^vm_[a-z0-9_]+?_(?:(?:get|set|prop)_[A-Za-z0-9_]+|init)$/;
const kindOf = (name) => /_(get|set|prop)_/.exec(name)?.[1] ?? "init";

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

/**
 * What each old C name of a renamed ViewModel or property is called now: from the renames the
 * project remembers, so the answer is certain, not a guess.
 */
function renamedTo(project) {
  const names = new Map();
  const { props, models } = formerNames(project);
  for (const [was, now] of props) {
    const [oldModel, oldProp] = was.split(".");
    const [newModel, newProp] = now.split(".");
    const vm = findViewModel(project, newModel);
    const prop = vm?.props.find((item) => item.name === newProp);
    if (!prop) continue;
    const before = vmNames(oldModel, { name: oldProp });
    const after = vmNames(vm, prop);
    for (const key of ["get", "set", "prop"]) names.set(before[key], after[key]);
  }
  for (const [was, now] of models) {
    names.set(`${vmPrefix(was)}_init`, `${vmPrefix(now)}_init`);
    names.set(`${vmPrefix(was)}.h`, `${vmPrefix(now)}.h`);
  }
  return names;
}

/** Only a slip of the keyboard is guessed at: one or two letters off, of the same kind. */
function closest(name, valid) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of valid) {
    if (kindOf(candidate) !== kindOf(name)) continue;
    const d = distance(name, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best && bestDistance <= 2 ? best : null;
}

/**
 * Every place the application code uses a ViewModel name or header the project does not
 * generate: [{ file, line, name, header, suggest }]. `appCode` maps a path to its text.
 * Names the application defines itself are its own business and not reported.
 */
export function missingGlueNames(project, appCode) {
  const valid = new Set(glueIdentifiers(project));
  const headers = new Set(viewModels(project).map((vm) => `${vmPrefix(vm)}.h`));
  const renamed = renamedTo(project);
  const found = [];
  const files = Object.entries(appCode ?? {}).sort(([a], [b]) => a.localeCompare(b));
  // Functions the application defines itself, in any of its files.
  const own = new Set();
  const cleaned = files.map(([file, text]) => [file, text, codeOnly(text)]);
  for (const [, , code] of cleaned) {
    for (const match of code.matchAll(/\b(vm_[A-Za-z0-9_]+)\s*\([^;{}()]*\)\s*\{/g)) own.add(match[1]);
  }
  const headerSuggest = (header) => {
    if (renamed.has(header)) return renamed.get(header);
    for (const candidate of headers) if (distance(header, candidate) <= 2) return candidate;
    return null;
  };
  for (const [file, text, code] of cleaned) {
    const rawLines = String(text).split("\n");
    code.split("\n").forEach((line, index) => {
      const include = /^\s*#\s*include\s*"\s*"\s*$/.test(line) ? /^\s*#\s*include\s*"(vm_[A-Za-z0-9_]+\.h)"/.exec(rawLines[index] ?? "") : null;
      if (include && !headers.has(include[1])) found.push({ file, line: index + 1, name: include[1], header: true, suggest: headerSuggest(include[1]) });
      const seen = new Set();
      for (const match of line.matchAll(/\bvm_[A-Za-z0-9_]+\b/g)) {
        const name = match[0];
        if (seen.has(name) || !GLUE_SHAPE.test(name) || valid.has(name) || own.has(name)) continue;
        seen.add(name);
        found.push({ file, line: index + 1, name, header: false, suggest: renamed.get(name) ?? closest(name, valid) });
      }
    });
  }
  return found;
}
