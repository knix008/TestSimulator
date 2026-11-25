// The CSG tree of an OpenSCAD program, written as OpenSCAD writes a .csg file: the program run with every module
// instance, loop and block a group(), every transformation a multmatrix() and every built-in module with all its
// arguments (defaults filled in), so the file runs in OpenSCAD without the program's modules, functions or
// variables. The run goes through evaluate.js with a recorder in place of the geometry engine.
import { evaluate } from './evaluate.js';
import { bindArgs, transformMatrix } from './geometry.js';
import { isNum, isVec, isStr, repr } from './values.js';

const TRANSFORMS = new Set(['translate', 'rotate', 'scale', 'mirror', 'multmatrix']);

/** Built-in modules: their parameter order and the arguments written (with the defaults OpenSCAD writes). */
const SPECS = {
  cube: { names: ['size', 'center'], out: (a) => [['size', isNum(a.size) ? [a.size, a.size, a.size] : a.size ?? [1, 1, 1]], ['center', a.center === true]] },
  sphere: { names: ['r'], fn: true, out: (a) => [['r', isNum(a.d) ? a.d / 2 : a.r ?? 1]] },
  cylinder: {
    names: ['h', 'r1', 'r2', 'center'], fn: true,
    out: (a) => {
      const r = isNum(a.d) ? a.d / 2 : a.r;
      const r1 = isNum(a.d1) ? a.d1 / 2 : a.r1 ?? r ?? 1; const r2 = isNum(a.d2) ? a.d2 / 2 : a.r2 ?? r ?? 1;
      return [['h', a.h ?? 1], ['r1', r1], ['r2', r2], ['center', a.center === true]];
    },
  },
  polyhedron: { names: ['points', 'faces', 'convexity'], out: (a) => [['points', a.points], ['faces', a.faces ?? a.triangles], ['convexity', a.convexity ?? 1]] },
  square: { names: ['size', 'center'], out: (a) => [['size', isNum(a.size) ? [a.size, a.size] : a.size ?? [1, 1]], ['center', a.center === true]] },
  circle: { names: ['r'], fn: true, out: (a) => [['r', isNum(a.d) ? a.d / 2 : a.r ?? 1]] },
  polygon: { names: ['points', 'paths', 'convexity'], out: (a) => [['points', a.points], ['paths', a.paths], ['convexity', a.convexity ?? 1]] },
  text: {
    names: ['text', 'size', 'font'], fn: true,
    out: (a) => [['text', a.text ?? ''], ['size', a.size ?? 10], ['spacing', a.spacing ?? 1], ['font', a.font ?? ''], ['direction', a.direction ?? 'ltr'], ['language', a.language ?? 'en'], ['script', a.script ?? 'latin'], ['halign', a.halign ?? 'left'], ['valign', a.valign ?? 'baseline']],
  },
  import: { names: ['file', 'layer', 'convexity', 'origin', 'scale'], fn: true, out: (a) => [['file', a.file ?? ''], ['layer', a.layer ?? ''], ['origin', a.origin ?? [0, 0]], ['scale', a.scale ?? 1], ['convexity', a.convexity ?? 1]] },
  surface: { names: ['file', 'center', 'convexity'], out: (a) => [['file', a.file ?? ''], ['center', a.center === true], ['invert', a.invert === true], ['convexity', a.convexity ?? 1]] },
  color: { names: ['c', 'alpha'], out: (a) => [['c', a.c], ['alpha', a.alpha ?? 1]], colour: true },
  offset: { names: ['r'], fn: true, out: (a) => (isNum(a.r) ? [['r', a.r]] : [['delta', a.delta ?? 1], ['chamfer', a.chamfer === true]]) },
  hull: { names: [], out: () => [] },
  minkowski: { names: ['convexity'], out: (a) => [['convexity', a.convexity ?? 0]] },
  union: { names: [], out: () => [] },
  difference: { names: [], out: () => [] },
  intersection: { names: [], out: () => [] },
  render: { names: ['convexity'], out: (a) => [['convexity', a.convexity ?? 1]] },
  group: { names: [], out: () => [] },
  resize: { names: ['newsize', 'auto', 'convexity'], out: (a) => [['newsize', a.newsize ?? [0, 0, 0]], ['auto', a.auto ?? [false, false, false]], ['convexity', a.convexity ?? 0]] },
  linear_extrude: {
    names: ['file', 'layer', 'height', 'origin', 'scale', 'center', 'twist', 'slices'], fn: true,
    out: (a) => [['height', isNum(a.height) ? a.height : isNum(a.file) ? a.file : 100], ['center', a.center === true], ['convexity', a.convexity ?? 1], ['twist', a.twist ?? 0], ['slices', a.slices ?? 1], ['scale', isNum(a.scale) ? [a.scale, a.scale] : a.scale ?? [1, 1]]],
  },
  rotate_extrude: { names: ['file', 'layer', 'origin', 'scale'], fn: true, out: (a) => [['angle', a.angle ?? 360], ['convexity', a.convexity ?? 1]] },
  projection: { names: ['cut'], out: (a) => [['cut', a.cut === true], ['convexity', a.convexity ?? 0]] },
  roof: { names: ['method', 'convexity'], fn: true, out: (a) => [['method', a.method ?? 'voronoi'], ['convexity', a.convexity ?? 1]] },
};

const IND = '\t';
const block = (head, kids) => {
  const body = kids.filter(Boolean);
  if (!body.length) return [`${head};`];
  return [`${head} {`, ...body.flatMap((k) => k.map((l) => IND + l)), '}'];
};
const argList = (pairs) => pairs.filter(([, v]) => v !== undefined).map(([k, v]) => `${k} = ${repr(v)}`).join(', ');

/**
 * The CSG tree of a program as .csg text. Options as runScad (files read through `readFile`, Customizer
 * `overrides`, `specials` such as $t). Returns { text, echoes, warnings, error }.
 */
export function csgTree(source, { readFile = null, overrides = {}, fileName = 'model.scad', specials = {} } = {}) {
  const geo = {
    has: (name) => name in SPECS || TRANSFORMS.has(name),
    module(name, args, ctx) {
      const kids = ctx.children();
      if (TRANSFORMS.has(name)) {
        const names = name === 'rotate' ? ['a', 'v'] : name === 'multmatrix' ? ['m'] : ['v'];
        const m = transformMatrix(name, bindArgs(args, names), ctx.warn);
        return block(`multmatrix(${repr(m)})`, kids);
      }
      const spec = SPECS[name];
      const a = bindArgs(args, spec.names);
      for (const x of args) if (x.name && !(x.name in a) && x.name[0] !== '$') a[x.name] = x.value;
      let pairs = spec.out(a);
      if (spec.colour && isStr(a.c)) pairs = [['c', a.c], ['alpha', a.alpha ?? 1]];
      if (spec.colour && isVec(a.c) && a.c.length >= 4 && a.alpha === undefined) pairs = [['c', a.c]];
      if (spec.fn) pairs = [['$fn', ctx.special('$fn') ?? 0], ['$fa', ctx.special('$fa') ?? 12], ['$fs', ctx.special('$fs') ?? 2], ...pairs];
      return block(`${name}(${argList(pairs)})`, kids);
    },
    group: (nodes) => (nodes.some(Boolean) ? block('group()', nodes) : null),
    boolean: (op, nodes) => block(`${op}()`, nodes),
    highlight: () => {}, background: () => {},
    textMetrics: () => null, fontMetrics: () => null,
  };
  try {
    const r = evaluate(source, { geo, readFile, overrides, fileName, specials });
    let root = r.node ?? [];
    // The top level is listed as it is (OpenSCAD writes no group around it).
    if (root[0] === 'group() {' && root[root.length - 1] === '}') root = root.slice(1, -1).map((l) => l.slice(IND.length));
    else if (root[0] === 'group();') root = [];
    return { text: `${root.join('\n')}\n`, echoes: r.echoes, warnings: r.warnings, error: null };
  } catch (error) {
    return { text: '', echoes: error?.echoes ?? [], warnings: error?.warnings ?? [], error };
  }
}
