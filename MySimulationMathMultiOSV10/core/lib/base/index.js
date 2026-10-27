// Base library: operators, elementary matrices, elementary functions, data
// analysis, types, strings, regular expressions, cell / struct, sets,
// validation, display / format, date and time, table / timetable,
// categorical, containers.Map, inputParser.
//
// Every builtin is wrapped so that a JS class (table, datetime, duration,
// categorical, containers.Map, ...) that defines a method with the same name
// receives the call when one of the arguments is an object of that class.
import * as ops from './ops.js';
import * as elmat from './elmat.js';
import * as elfun from './elfun.js';
import * as datafun from './datafun.js';
import * as types from './types.js';
import * as display from './display.js';
import * as strings from './strings.js';
import * as regexp from './regexp.js';
import * as cellstruct from './cellstruct.js';
import * as sets from './sets.js';
import * as validate from './validate.js';
import * as time from './time.js';
import * as datetime from './datetime.js';
import * as categorical from './categorical.js';
import * as map from './map.js';
import * as table from './table.js';
import { classDef, setOwnClasses } from './util.js';

const MODULES = [
  ['ops', ops], ['elmat', elmat], ['elfun', elfun], ['datafun', datafun], ['types', types], ['display', display],
  ['strings', strings], ['regexp', regexp], ['cellstruct', cellstruct], ['sets', sets], ['validate', validate],
  ['time', time], ['datetime', datetime], ['categorical', categorical], ['map', map], ['table', table],
];

export const builtins = Object.create(null);
export const help = Object.create(null);
export const classes = Object.create(null);
const owner = Object.create(null);
const installs = [];

for (const [name, mod] of MODULES) {
  for (const [k, def] of Object.entries(mod.classes || {})) {
    if (classes[k]) throw new Error(`base: class "${k}" defined twice (${name})`);
    classes[k] = def;
  }
}
setOwnClasses(classes);

/** Wraps a builtin with method dispatch for objects of JS classes. */
function withDispatch(name, fn) {
  const w = function (args, nargout, ctx) {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a && a.isObject) {
        const def = classDef(ctx, a.cls);
        const m = def && def.methods && def.methods[name];
        if (typeof m === 'function' && m !== w) return m(args, nargout, ctx);
      }
    }
    return fn(args, nargout, ctx);
  };
  Object.defineProperty(w, 'name', { value: name });
  if (fn.override) w.override = true;
  w.raw = fn;
  return w;
}

for (const [name, mod] of MODULES) {
  for (const [k, fn] of Object.entries(mod.builtins || {})) {
    if (builtins[k]) throw new Error(`base: builtin "${k}" defined by both ${owner[k]} and ${name}`);
    builtins[k] = withDispatch(k, fn);
    owner[k] = name;
  }
  for (const [k, h] of Object.entries(mod.help || {})) help[k] = h;
  if (typeof mod.install === 'function') installs.push(mod.install);
}

export function install(ctx) { for (const f of installs) f(ctx); }

// JS helpers for other areas and the interpreter.
export { formatValue, displayValue } from './display.js';
export { plus, minus, times, rdivide, ldivide, power, mtimes, uminus, uplus, not, and, or, xor, eq, ne, lt, gt, le, ge, transpose, ctranspose, colon, horzcat, vertcat, catValues } from './ops.js';
export { makeTable, tableToJS } from './table.js';
export { sprintfJS } from './fmt.js';
export { valuesEqual } from './datafun.js';
