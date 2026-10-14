// OpenSCAD (.scad, and its strict .csg form that FreeCAD's OpenSCAD workbench
// reads): solids written as CSG trees with native primitives where MyCAD's
// geometry is the same, polyhedra otherwise; a small interpreter reads the
// language back into meshes. No DOM.

import { booleanOf } from './csg.js';
import { triangulate } from './triangulate.js';
import { polygonArea } from './geometry.js';

const n = (v) => {
  const r = Math.abs(v) < 1e-12 ? 0 : v;
  return Number.isInteger(r) ? String(r) : String(Number(r.toPrecision(12)));
};
const vec = (a) => `[${a.map(n).join(', ')}]`;
const FN = 72;
const ROUND = `$fn = ${FN}, $fa = 12, $fs = 2`;

// ───────────────────────── writer

/**
 * OpenSCAD text for solid entities. `helpers` = { placement, localMesh, normalizeSolidData, partInParent }
 * (passed in to keep this module free of the solids module).
 */
export function toScad(entities, helpers, { title = 'MyCAD' } = {}) {
  const { placement, localMesh } = helpers;
  const indent = (text, depth) => text.split('\n').map((l) => (l ? '  '.repeat(depth) + l : l)).join('\n');
  // The 4×4 matrix of a placement: images of the axes and the origin.
  const matrixOf = (e) => {
    const map = placement(e);
    const o = map([0, 0, 0]);
    const x = map([1, 0, 0]).map((v, i) => v - o[i]);
    const y = map([0, 1, 0]).map((v, i) => v - o[i]);
    const z = map([0, 0, 1]).map((v, i) => v - o[i]);
    return [[x[0], y[0], z[0], o[0]], [x[1], y[1], z[1], o[1]], [x[2], y[2], z[2], o[2]], [0, 0, 0, 1]];
  };
  const isIdentity = (m) => m.every((row, i) => row.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-12));
  const placed = (e, body) => {
    const m = matrixOf(e);
    return isIdentity(m) ? body : `multmatrix([${m.map(vec).join(', ')}]) {\n${indent(body, 1)}\n}`;
  };
  const polyhedron = (tris) => {
    const points = [];
    const index = new Map();
    const at = (p) => {
      const key = p.map((v) => Math.round(v * 1e6)).join(',');
      if (!index.has(key)) { index.set(key, points.length); points.push(p); }
      return index.get(key);
    };
    // OpenSCAD wants faces clockwise seen from outside: each triangle turned round.
    const faces = tris.map(([a, b, c]) => [at(a), at(c), at(b)]);
    return `polyhedron(points = [${points.map(vec).join(', ')}], faces = [${faces.map(vec).join(', ')}], convexity = 4);`;
  };
  const polygon = (loop) => `polygon(points = [${loop.map((q) => vec([q.x, q.y])).join(', ')}], paths = [[${loop.map((_, i) => i).join(', ')}]], convexity = 2);`;
  const linear = (h, body) => `linear_extrude(height = ${n(h)}, center = false, convexity = 2, twist = 0, slices = 1, scale = [1, 1], $fn = 0, $fa = 12, $fs = 2) {\n${indent(body, 1)}\n}`;
  const body = (e) => {
    const p = e.params ?? {};
    switch (e.kind) {
      case 'box': return `cube(size = ${vec([p.length, p.width, p.height])}, center = false);`;
      case 'cylinder':
        if (p.angle >= 359.999) return `cylinder(${ROUND}, h = ${n(p.height)}, r1 = ${n(p.radius)}, r2 = ${n(p.radius)}, center = false);`;
        return `rotate_extrude(angle = ${n(p.angle)}, convexity = 2, ${ROUND}) {\n  ${polygon([{ x: 0, y: 0 }, { x: p.radius, y: 0 }, { x: p.radius, y: p.height }, { x: 0, y: p.height }])}\n}`;
      case 'cone': return `cylinder(${ROUND}, h = ${n(p.height)}, r1 = ${n(p.radius1)}, r2 = ${n(p.radius2)}, center = false);`;
      case 'sphere': return `sphere(${ROUND}, r = ${n(p.radius)});`;
      case 'ellipsoid': return `multmatrix([[${n(p.radius2)}, 0, 0, 0], [0, ${n(p.radius3)}, 0, 0], [0, 0, ${n(p.radius1)}, 0], [0, 0, 0, 1]]) {\n  sphere(${ROUND}, r = 1);\n}`;
      case 'prism': return `cylinder($fn = ${p.sides}, $fa = 12, $fs = 2, h = ${n(p.height)}, r1 = ${n(p.radius)}, r2 = ${n(p.radius)}, center = false);`;
      case 'tube': return `difference() {\n  cylinder(${ROUND}, h = ${n(p.height)}, r1 = ${n(p.outer)}, r2 = ${n(p.outer)}, center = false);\n  multmatrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, -1], [0, 0, 0, 1]]) {\n    cylinder(${ROUND}, h = ${n(p.height + 2)}, r1 = ${n(p.inner)}, r2 = ${n(p.inner)}, center = false);\n  }\n}`;
      case 'torus': return `rotate_extrude(angle = 360, convexity = 2, ${ROUND}) {\n  multmatrix([[1, 0, 0, ${n(p.radius1)}], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {\n    circle(${ROUND}, r = ${n(p.radius2)});\n  }\n}`;
      case 'pad': {
        if (p.taper) return polyhedron(localMesh(e));
        const shapes = e.shape?.shapes ?? [];
        const one = (shape) => (shape.holes.length
          ? `difference() {\n${indent(linear(p.height, polygon(shape.outer)), 1)}\n${shape.holes.map((h) => indent(`multmatrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, -1], [0, 0, 0, 1]]) {\n${indent(linear(p.height + 2, polygon(h)), 1)}\n}`, 1)).join('\n')}\n}`
          : linear(p.height, polygon(shape.outer)));
        return shapes.length === 1 ? one(shapes[0]) : `union() {\n${shapes.map((s) => indent(one(s), 1)).join('\n')}\n}`;
      }
      case 'revolution': {
        const profile = e.shape?.profile ?? [];
        return `rotate_extrude(angle = ${n(p.angle)}, convexity = 2, ${ROUND}) {\n  ${polygon(profile.map(([r, z]) => ({ x: r, y: z })))}\n}`;
      }
      case 'boolean': {
        const op = { union: 'union', cut: 'difference', common: 'intersection' }[e.shape?.op] ?? 'union';
        return `${op}() {\n${(e.shape?.parts ?? []).map((part) => indent(entityText(part), 1)).join('\n')}\n}`;
      }
      default: return polyhedron(localMesh(e));
    }
  };
  const entityText = (e) => placed(e, body(e));
  const solids = entities.filter((e) => e.type === 'solid');
  return [
    `// ${String(title).replace(/[\r\n]/g, ' ')} — MyCAD (millimetres). OpenSCAD / FreeCAD OpenSCAD workbench (.csg).`,
    ...solids.map((e) => `// ${(e.name || e.kind).replace(/[\r\n]/g, ' ')}\n${entityText(e)}`),
    '',
  ].join('\n');
}

// ───────────────────────── reader: tokens and syntax

function tokenize(src) {
  const tokens = [];
  const re = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|("(?:[^"\\]|\\.)*")|(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([$A-Za-z_][\w$]*)|(<=|>=|==|!=|&&|\|\||[-+*/%^<>=!?:;,.(){}[\]#*!%])/y;
  let m;
  let at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    m = re.exec(src);
    if (!m) throw new Error(`OpenSCAD: unexpected "${src.slice(at, at + 12)}"`);
    at = re.lastIndex;
    if (m[1]) tokens.push({ t: 'str', v: JSON.parse(m[1]) });
    else if (m[2]) tokens.push({ t: 'num', v: Number(m[2]) });
    else if (m[3]) tokens.push({ t: 'id', v: m[3] });
    else if (m[4]) tokens.push({ t: 'op', v: m[4] });
  }
  return tokens;
}

/** Parses statements: { call, args: [{ name?, expr }], children, modifier } | { assign, expr } | { for } | { if }. */
function parse(tokens) {
  let i = 0;
  const peek = (v) => tokens[i] && (v === undefined || tokens[i].v === v);
  const eat = (v) => {
    if (v !== undefined && tokens[i]?.v !== v) throw new Error(`OpenSCAD: expected "${v}" near "${tokens[i]?.v ?? 'end'}"`);
    return tokens[i++];
  };
  const expr = () => ternary();
  const ternary = () => {
    const c = or();
    if (peek('?')) { eat('?'); const a = expr(); eat(':'); const b = expr(); return { op: '?', c, a, b }; }
    return c;
  };
  const binary = (next, ops) => () => {
    let left = next();
    while (tokens[i] && tokens[i].t === 'op' && ops.includes(tokens[i].v)) { const op = eat().v; left = { op, a: left, b: next() }; }
    return left;
  };
  const unary = () => {
    if (peek('-')) { eat(); return { op: 'neg', a: unary() }; }
    if (peek('+')) { eat(); return unary(); }
    if (peek('!')) { eat(); return { op: 'not', a: unary() }; }
    return power();
  };
  const power = () => { const a = postfix(); if (peek('^')) { eat(); return { op: '^', a, b: unary() }; } return a; };
  const mul = binary(unary, ['*', '/', '%']);
  const add = binary(mul, ['+', '-']);
  const cmp = binary(add, ['<', '>', '<=', '>=', '==', '!=']);
  const and = binary(cmp, ['&&']);
  const or = binary(and, ['||']);
  const postfix = () => {
    let e = primary();
    for (;;) {
      if (peek('[')) { eat('['); const index = expr(); eat(']'); e = { op: 'index', a: e, b: index }; } else if (peek('.')) { eat('.'); e = { op: 'member', a: e, name: eat().v }; } else break;
    }
    return e;
  };
  const primary = () => {
    const tok = eat();
    if (tok.t === 'num') return { lit: tok.v };
    if (tok.t === 'str') return { lit: tok.v };
    if (tok.t === 'id') {
      if (tok.v === 'true') return { lit: true };
      if (tok.v === 'false') return { lit: false };
      if (tok.v === 'undef') return { lit: undefined };
      if (peek('(')) { eat('('); const args = argList(); eat(')'); return { fn: tok.v, args }; }
      return { name: tok.v };
    }
    if (tok.v === '(') { const e = expr(); eat(')'); return e; }
    if (tok.v === '[') {
      if (peek(']')) { eat(']'); return { list: [] }; }
      const first = expr();
      if (peek(':')) {
        eat(':');
        const second = expr();
        if (peek(':')) { eat(':'); const third = expr(); eat(']'); return { range: [first, second, third] }; }
        eat(']');
        return { range: [first, { lit: 1 }, second] };
      }
      const list = [first];
      while (peek(',')) { eat(','); if (peek(']')) break; list.push(expr()); }
      eat(']');
      return { list };
    }
    throw new Error(`OpenSCAD: unexpected "${tok.v}"`);
  };
  const argList = () => {
    const args = [];
    while (!peek(')')) {
      if (tokens[i].t === 'id' && tokens[i + 1]?.v === '=') { const name = eat().v; eat('='); args.push({ name, expr: expr() }); } else args.push({ expr: expr() });
      if (peek(',')) eat(',');
    }
    return args;
  };
  const statement = () => {
    if (peek(';')) { eat(';'); return null; }
    if (peek('{')) { eat('{'); const list = []; while (!peek('}')) { const s = statement(); if (s) list.push(s); } eat('}'); return { call: 'union', args: [], children: list, block: true }; }
    let modifier = null;
    if (peek('*') || peek('!') || peek('#') || peek('%')) modifier = eat().v;
    const tok = eat();
    if (tok.t !== 'id') throw new Error(`OpenSCAD: unexpected "${tok.v}"`);
    if (tok.v === 'module' || tok.v === 'function') throw new Error('OpenSCAD: user modules and functions are not read');
    if (peek('=') && !modifier) { eat('='); const e = expr(); eat(';'); return { assign: tok.v, expr: e }; }
    if (tok.v === 'for' || tok.v === 'intersection_for') {
      eat('(');
      const vars = [];
      while (!peek(')')) { const name = eat().v; eat('='); vars.push({ name, expr: expr() }); if (peek(',')) eat(','); }
      eat(')');
      return { for: vars, intersect: tok.v === 'intersection_for', children: childOf() };
    }
    if (tok.v === 'if') {
      eat('(');
      const cond = expr();
      eat(')');
      const then = childOf();
      let other = [];
      if (peek('else')) { eat('else'); other = childOf(); }
      return { if: cond, then, else: other };
    }
    eat('(');
    const args = argList();
    eat(')');
    return { call: tok.v, args, children: childOf(), modifier };
  };
  const childOf = () => {
    if (peek(';')) { eat(';'); return []; }
    if (peek('{')) { eat('{'); const list = []; while (!peek('}')) { const s = statement(); if (s) list.push(s); } eat('}'); return list; }
    const s = statement();
    return s ? [s] : [];
  };
  const out = [];
  while (i < tokens.length) { const s = statement(); if (s) out.push(s); }
  return out;
}

// ───────────────────────── reader: evaluation

const rad = (d) => (d * Math.PI) / 180;
const FUNCS = {
  sin: (a) => Math.sin(rad(a)), cos: (a) => Math.cos(rad(a)), tan: (a) => Math.tan(rad(a)),
  asin: (a) => (Math.asin(a) * 180) / Math.PI, acos: (a) => (Math.acos(a) * 180) / Math.PI, atan: (a) => (Math.atan(a) * 180) / Math.PI, atan2: (y, x) => (Math.atan2(y, x) * 180) / Math.PI,
  abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: (...a) => Math.min(...a.flat()), max: (...a) => Math.max(...a.flat()),
  ln: Math.log, log: (a, b) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)), exp: Math.exp, sign: Math.sign, len: (a) => a?.length,
  norm: (v) => Math.hypot(...v), concat: (...a) => a.flat(), str: (...a) => a.join(''),
};

function evaluate(e, scope) {
  if ('lit' in e) return e.lit;
  if (e.name !== undefined) return scope.get(e.name) ?? (e.name === 'PI' ? Math.PI : undefined);
  if (e.list) return e.list.map((x) => evaluate(x, scope));
  if (e.range) {
    const [a, s, b] = e.range.map((x) => evaluate(x, scope));
    const out = [];
    if (s > 0) for (let v = a; v <= b + 1e-9 && out.length < 100000; v += s) out.push(v);
    else if (s < 0) for (let v = a; v >= b - 1e-9 && out.length < 100000; v += s) out.push(v);
    return out;
  }
  if (e.fn) {
    const f = FUNCS[e.fn];
    if (!f) throw new Error(`OpenSCAD: function ${e.fn}() is not read`);
    return f(...e.args.map((a) => evaluate(a.expr, scope)));
  }
  const a = e.a ? evaluate(e.a, scope) : undefined;
  switch (e.op) {
    case 'neg': return Array.isArray(a) ? a.map((v) => -v) : -a;
    case 'not': return !a;
    case 'index': return a?.[evaluate(e.b, scope)];
    case 'member': return a?.[{ x: 0, y: 1, z: 2 }[e.name]];
    case '?': return evaluate(e.c, scope) ? evaluate(e.a, scope) : evaluate(e.b, scope);
    default: break;
  }
  const b = evaluate(e.b, scope);
  const both = (f) => (Array.isArray(a) && Array.isArray(b) ? a.map((v, k) => f(v, b[k])) : Array.isArray(a) ? a.map((v) => f(v, b)) : Array.isArray(b) ? b.map((v) => f(a, v)) : f(a, b));
  switch (e.op) {
    case '+': return both((x, y) => x + y);
    case '-': return both((x, y) => x - y);
    case '*':
      if (Array.isArray(a) && Array.isArray(b) && !Array.isArray(a[0]) && !Array.isArray(b[0])) return a.reduce((s, v, k) => s + v * b[k], 0);
      return both((x, y) => x * y);
    case '/': return both((x, y) => x / y);
    case '%': return a % b;
    case '^': return a ** b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    case '==': return JSON.stringify(a) === JSON.stringify(b);
    case '!=': return JSON.stringify(a) !== JSON.stringify(b);
    case '&&': return a && b;
    case '||': return a || b;
    default: throw new Error(`OpenSCAD: operator ${e.op}`);
  }
}

// 4×4 matrices as 3×4 row-major arrays.
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const mul4 = (a, b) => [
  a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
  a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
  a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
];
const applyM = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
const rotX = (a) => { const c = Math.cos(rad(a)); const s = Math.sin(rad(a)); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; };
const rotY = (a) => { const c = Math.cos(rad(a)); const s = Math.sin(rad(a)); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; };
const rotZ = (a) => { const c = Math.cos(rad(a)); const s = Math.sin(rad(a)); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const axisAngle = (a, v) => {
  const l = Math.hypot(...v) || 1;
  const [x, y, z] = v.map((q) => q / l);
  const c = Math.cos(rad(a)); const s = Math.sin(rad(a)); const t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0, t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0, t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0];
};

const segmentsFor = (r, args) => {
  if (args.$fn > 0) return Math.max(3, Math.round(args.$fn));
  const fa = args.$fa ?? 12;
  const fs = args.$fs ?? 2;
  return Math.max(5, Math.ceil(Math.min(360 / fa, (2 * Math.PI * r) / fs)));
};

/**
 * Reads OpenSCAD (.scad / .csg) into meshes: [{ name, triangles }] — one per
 * top-level object. `generators` = { revolve(profile, angle, segments), extrudePolygon(points, z0, z1, holes) }.
 */
export function parseScad(text, generators) {
  const { revolve, extrudePolygon } = generators;
  const program = parse(tokenize(String(text)));
  const warnings = new Set();
  const scope = new Map([['$fn', 0], ['$fa', 12], ['$fs', 2], ['PI', Math.PI]]);
  // Arguments: positional names per module, defaults from the special variables in scope.
  const POSITIONAL = {
    cube: ['size', 'center'], sphere: ['r'], cylinder: ['h', 'r1', 'r2', 'center'], polyhedron: ['points', 'faces', 'convexity'],
    square: ['size', 'center'], circle: ['r'], polygon: ['points', 'paths', 'convexity'], translate: ['v'], rotate: ['a', 'v'], scale: ['v'],
    mirror: ['v'], multmatrix: ['m'], color: ['c', 'alpha'], linear_extrude: ['height', 'center', 'convexity', 'twist'], rotate_extrude: ['angle', 'convexity'], resize: ['newsize'],
  };
  const argsOf = (node, sc) => {
    const out = { $fn: sc.get('$fn'), $fa: sc.get('$fa'), $fs: sc.get('$fs') };
    node.args.forEach((a, k) => { out[a.name ?? POSITIONAL[node.call]?.[k] ?? `_${k}`] = evaluate(a.expr, sc); });
    return out;
  };
  // A 3D result: { op: 'mesh', tris } | { op: 'union'|'difference'|'intersection', parts }
  const mesh = (tris, m) => {
    let out = tris.map((t) => t.map((p) => applyM(m, p)));
    if (det3(m) < 0) out = out.map(([a, b, c]) => [a, c, b]);
    return { op: 'mesh', tris: out };
  };
  // 2D results: lists of { outer, holes } (in the current 2D frame, already transformed).
  const shape2d = (node, m, sc) => {
    const args = argsOf(node, sc);
    const pt = (x, y) => { const [px, py] = applyM(m, [x, y, 0]); return { x: px, y: py }; };
    switch (node.call) {
      case 'square': {
        const s = Array.isArray(args.size) ? args.size : [args.size ?? 1, args.size ?? 1];
        const [x0, y0] = args.center ? [-s[0] / 2, -s[1] / 2] : [0, 0];
        return [{ outer: [pt(x0, y0), pt(x0 + s[0], y0), pt(x0 + s[0], y0 + s[1]), pt(x0, y0 + s[1])], holes: [] }];
      }
      case 'circle': {
        const r = args.r ?? (args.d !== undefined ? args.d / 2 : 1);
        const k = segmentsFor(r, args);
        return [{ outer: Array.from({ length: k }, (_, i) => pt(r * Math.cos((2 * Math.PI * i) / k), r * Math.sin((2 * Math.PI * i) / k))), holes: [] }];
      }
      case 'polygon': {
        const pts = (args.points ?? []).map(([x, y]) => pt(x, y));
        const paths = args.paths ?? [pts.map((_, i) => i)];
        const loops = paths.map((path) => path.map((i) => pts[i]).filter(Boolean)).filter((l) => l.length >= 3);
        if (!loops.length) return [];
        // The biggest loop is the outline, the others its holes.
        loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
        return [{ outer: loops[0], holes: loops.slice(1) }];
      }
      default: {
        const tm = transformOf(node.call, args);
        const inner = tm ? mul4(m, tm) : m;
        const kids = (node.kids ?? children(node.children, node.scope ?? sc)).flatMap((child) => shape2d(child, inner, child.scope ?? sc));
        if (node.call === 'difference' && kids.length > 1) return [{ outer: kids[0].outer, holes: [...kids[0].holes, ...kids.slice(1).map((k) => k.outer)] }];
        if (!['union', 'group', 'render', 'color', 'difference', 'intersection', 'translate', 'rotate', 'scale', 'mirror', 'multmatrix'].includes(node.call)) warnings.add(node.call);
        return kids;
      }
    }
  };
  const transformOf = (call, args) => {
    switch (call) {
      case 'translate': { const v = [...(args.v ?? [0, 0, 0]), 0, 0, 0]; return [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2]]; }
      case 'rotate': {
        if (Array.isArray(args.a)) { const [x = 0, y = 0, z = 0] = args.a; return mul4(rotZ(z), mul4(rotY(y), rotX(x))); }
        if (Array.isArray(args.v)) return axisAngle(args.a ?? 0, args.v);
        return rotZ(args.a ?? 0);
      }
      case 'scale': { const v = Array.isArray(args.v) ? [...args.v, 1, 1, 1] : [args.v ?? 1, args.v ?? 1, args.v ?? 1]; return [v[0], 0, 0, 0, 0, v[1], 0, 0, 0, 0, v[2], 0]; }
      case 'mirror': {
        const v = [...(args.v ?? [1, 0, 0]), 0, 0, 0].slice(0, 3);
        const l = Math.hypot(...v) || 1;
        const [x, y, z] = v.map((q) => q / l);
        return [1 - 2 * x * x, -2 * x * y, -2 * x * z, 0, -2 * x * y, 1 - 2 * y * y, -2 * y * z, 0, -2 * x * z, -2 * y * z, 1 - 2 * z * z, 0];
      }
      case 'multmatrix': { const r = args.m ?? []; return [...(r[0] ?? [1, 0, 0, 0]), ...(r[1] ?? [0, 1, 0, 0]), ...(r[2] ?? [0, 0, 1, 0])].map(Number); }
      default: return null;
    }
  };
  // Children with assignments, for and if resolved into plain module calls (each with its own scope).
  const children = (list, sc) => {
    const local = new Map(sc);
    const out = [];
    for (const s of list) if (s.assign) local.set(s.assign, evaluate(s.expr, local));
    for (const s of list) {
      if (s.assign) continue;
      if (s.modifier === '*' || s.modifier === '%') continue;
      if (s.for) {
        const combos = [[]];
        for (const v of s.for) {
          const values = evaluate(v.expr, local);
          const next = [];
          for (const c of combos) for (const value of Array.isArray(values) ? values : [values]) next.push([...c, [v.name, value]]);
          combos.splice(0, combos.length, ...next);
        }
        const bodies = combos.map((c) => {
          const inner = new Map(local);
          for (const [k, v] of c) inner.set(k, v);
          return { call: 'union', args: [], children: s.children, scope: inner };
        });
        out.push(s.intersect ? { call: 'intersection', args: [], children: [], expanded: bodies, scope: local } : { call: 'union', args: [], children: [], expanded: bodies, scope: local });
        continue;
      }
      if (s.if) {
        out.push({ call: 'union', args: [], children: evaluate(s.if, local) ? s.then : s.else, scope: local });
        continue;
      }
      out.push({ ...s, scope: local });
    }
    return out.flatMap((node) => (node.expanded ? [{ ...node, children: [], kids: node.expanded }] : [node]));
  };
  const solid = (node, m, sc) => {
    const scopeHere = node.scope ?? sc;
    const args = argsOf(node, scopeHere);
    const kidsOf = (mm) => {
      const list = node.kids ? node.kids.map((k) => solid(k, mm, k.scope)) : children(node.children, scopeHere).map((child) => solid(child, mm, scopeHere));
      return list.filter(Boolean);
    };
    switch (node.call) {
      case 'cube': {
        const s = Array.isArray(args.size) ? args.size : [args.size ?? 1, args.size ?? 1, args.size ?? 1];
        const o = args.center ? s.map((v) => -v / 2) : [0, 0, 0];
        const sq = [{ x: o[0], y: o[1] }, { x: o[0] + s[0], y: o[1] }, { x: o[0] + s[0], y: o[1] + s[1] }, { x: o[0], y: o[1] + s[1] }];
        return mesh(extrudePolygon(sq, o[2], o[2] + s[2]), m);
      }
      case 'sphere': {
        const r = args.r ?? (args.d !== undefined ? args.d / 2 : 1);
        const k = segmentsFor(r, args);
        const half = Math.max(2, Math.round(k / 2));
        const profile = [[0, -r], ...Array.from({ length: half - 1 }, (_, i) => { const a = -Math.PI / 2 + (Math.PI * (i + 1)) / half; return [r * Math.cos(a), r * Math.sin(a)]; }), [0, r]];
        return mesh(revolve(profile, 360, k), m);
      }
      case 'cylinder': {
        const h = args.h ?? 1;
        const r1 = args.r1 ?? args.r ?? (args.d1 ?? args.d ?? 2) / 2;
        const r2 = args.r2 ?? args.r ?? (args.d2 ?? args.d ?? 2) / 2;
        const z0 = args.center ? -h / 2 : 0;
        const k = segmentsFor(Math.max(r1, r2), args);
        const profile = [[0, z0], [r1, z0], [r2, z0 + h], [0, z0 + h]].filter((q, i) => !(i === 1 && r1 === 0) && !(i === 2 && r2 === 0));
        return mesh(revolve(profile, 360, k), m);
      }
      case 'polyhedron': {
        const pts = args.points ?? [];
        const faces = args.faces ?? args.triangles ?? [];
        // OpenSCAD faces are clockwise from outside: each fan triangle turned round.
        const tris = faces.flatMap((f) => f.slice(1, -1).map((_, i) => [pts[f[0]], pts[f[i + 2]], pts[f[i + 1]]])).filter((t) => t.every(Boolean));
        return mesh(tris, m);
      }
      case 'linear_extrude': {
        const h = args.height ?? 1;
        const z0 = args.center ? -h / 2 : 0;
        if (args.twist) warnings.add('twist');
        const shapes = children(node.children, scopeHere).flatMap((child) => shape2d(child, I4, scopeHere));
        const parts = shapes.map((s) => mesh(extrudePolygon(polygonArea(s.outer) > 0 ? s.outer : [...s.outer].reverse(), z0, z0 + h, s.holes.map((hole) => (polygonArea(hole) < 0 ? hole : [...hole].reverse()))), m));
        return parts.length === 1 ? parts[0] : { op: 'union', parts };
      }
      case 'rotate_extrude': {
        const angle = args.angle ?? 360;
        const shapes = children(node.children, scopeHere).flatMap((child) => shape2d(child, I4, scopeHere));
        const parts = shapes.map((s) => {
          const ccw = polygonArea(s.outer) > 0 ? s.outer : [...s.outer].reverse();
          const k = segmentsFor(Math.max(...ccw.map((q) => q.x)), args);
          let tris = revolve(ccw.map((q) => [q.x, q.y]), angle, k);
          for (const hole of s.holes) tris = booleanOf('cut', [tris, revolve((polygonArea(hole) > 0 ? hole : [...hole].reverse()).map((q) => [q.x, q.y]), angle, k)]);
          return mesh(tris, m);
        });
        return parts.length === 1 ? parts[0] : { op: 'union', parts };
      }
      case 'union': case 'group': case 'render': case 'color': {
        const parts = kidsOf(m);
        return parts.length === 1 ? parts[0] : { op: 'union', parts };
      }
      case 'difference': return { op: 'difference', parts: kidsOf(m) };
      case 'intersection': return { op: 'intersection', parts: kidsOf(m) };
      case 'translate': case 'rotate': case 'scale': case 'mirror': case 'multmatrix': {
        const parts = kidsOf(mul4(m, transformOf(node.call, args)));
        return parts.length === 1 ? parts[0] : { op: 'union', parts };
      }
      default: {
        warnings.add(node.call);
        const parts = kidsOf(m);
        return parts.length ? { op: 'union', parts } : null;
      }
    }
  };
  // Flatten a result into triangles (booleans by the BSP CSG).
  const flat = (r) => {
    if (!r) return [];
    if (r.op === 'mesh') return r.tris;
    const parts = r.parts.map(flat).filter((t) => t.length);
    if (!parts.length) return [];
    if (r.op === 'union') return parts.length === 1 ? parts[0] : booleanOf('union', parts);
    if (r.op === 'difference') return parts.length === 1 ? parts[0] : booleanOf('cut', parts);
    return booleanOf('common', parts);
  };
  const objects = [];
  children(program, scope).forEach((node, k) => {
    const tris = flat(solid(node, I4, node.scope));
    if (tris.length) objects.push({ name: `${node.call} ${k + 1}`, triangles: tris });
  });
  if (!objects.length) throw new Error('OpenSCAD: no solids');
  objects.warnings = [...warnings];
  return objects;
}
