// The graphical editor's model and its M code generator (pure: no React / DOM;
// tested in test/flow.test.mjs).
//
// A flow file (.mflow) is JSON:
//   { format: 'msm-flow', version: 1, nodes: [Node], links: [Link], view: { x, y, zoom } }
//   Link = { id, from: { node, port }, to: { node, port } }   (output port → input port)
//   Node = { id, type, x, y, ... } by type:
//     const  { name, value }                 a constant: `name = value;`
//     var    { name }                        a workspace variable (no code, its name is the value)
//     op     { op, name }                    a ⊕ b with one of OPS
//     func   { fn, syntax, inputs: [{ label, value }], outputs: [label], names: [var] }
//            a function call; unconnected inputs use their literal `value` (or are left out)
//     expr   { expr, inputs: [{ label }], name }   a formula over its input names
//     disp   { label }                       shows a value: disp(x)
// Every output is a variable: `name` (const / op / expr) or names[i] (func).
// The code runs top to bottom in data order (inputs first; ties: by y, then x).

export const FLOW_FORMAT = 'msm-flow';
export const FLOW_VERSION = 1;

export const OPS = [
  { op: '+', label: 'a + b' }, { op: '-', label: 'a - b' }, { op: '.*', label: 'a .* b' }, { op: './', label: 'a ./ b' },
  { op: '.^', label: 'a .^ b' }, { op: '*', label: 'a * b' }, { op: '/', label: 'a / b' }, { op: '^', label: 'a ^ b' },
  { op: '==', label: 'a == b' }, { op: '~=', label: 'a ~= b' }, { op: '<', label: 'a < b' }, { op: '>', label: 'a > b' },
  { op: '<=', label: 'a <= b' }, { op: '>=', label: 'a >= b' }, { op: '&', label: 'a & b' }, { op: '|', label: 'a | b' },
];

const M_KEYWORDS = new Set(['break', 'case', 'catch', 'classdef', 'continue', 'else', 'elseif', 'end', 'for', 'function', 'global', 'if', 'otherwise', 'parfor', 'persistent', 'return', 'spmd', 'switch', 'try', 'while']);
export const isVarName = (s) => /^[A-Za-z]\w{0,62}$/.test(String(s || '')) && !M_KEYWORDS.has(s);

export function emptyFlow() {
  return { format: FLOW_FORMAT, version: FLOW_VERSION, nodes: [], links: [], view: { x: 0, y: 0, zoom: 1 } };
}

/** Parses .mflow text (throws on anything that is not a flow file). */
export function parseFlow(text) {
  const raw = String(text || '').trim();
  if (!raw) return emptyFlow();
  const j = JSON.parse(raw);
  if (!j || j.format !== FLOW_FORMAT || !Array.isArray(j.nodes)) throw new Error('Not a flow file (format "msm-flow" expected).');
  return { ...emptyFlow(), ...j, nodes: j.nodes.map((n) => ({ ...n })), links: (j.links || []).map((l) => ({ ...l })), view: { ...emptyFlow().view, ...(j.view || {}) } };
}

export const serializeFlow = (flow) => `${JSON.stringify({ format: FLOW_FORMAT, version: FLOW_VERSION, nodes: flow.nodes, links: flow.links, view: flow.view }, null, 2)}\n`;

/** Splits on top-level commas (not inside brackets or quotes). */
function splitArgs(s) {
  const out = [];
  let depth = 0, q = null, cur = '';
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth += 1;
    if (')]}'.includes(c)) depth -= 1;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Ports of a help syntax line: 'Y = sin(X)' → { outputs: ['Y'], inputs: [{ label: 'X', value: '' }] }.
 * Literal arguments ('int8', 3) become inputs with that value; '...' and name-value pairs are left out.
 */
export function parseSyntax(syntax, fn) {
  const s = String(syntax || '').trim();
  let outs = [], rhs = s;
  const eq = /^(\[[^\]]*\]|[A-Za-z_]\w*)\s*=\s*(?!=)(.*)$/.exec(s);
  if (eq) {
    rhs = eq[2];
    outs = eq[1].startsWith('[') ? eq[1].slice(1, -1).split(/[\s,]+/).filter((x) => x && x !== '~') : [eq[1]];
  }
  const call = /^([A-Za-z_][\w.]*)\s*(?:\((.*)\))?\s*;?$/.exec(rhs.trim());
  const inputs = [];
  if (call && call[2] != null) {
    splitArgs(call[2]).forEach((a, i) => {
      if (!a || a === '...' || a === '___') return;
      if (/^[A-Za-z_]\w*$/.test(a)) inputs.push({ label: a, value: '' });
      else inputs.push({ label: `arg${i + 1}`, value: a });
    });
  }
  return { fn: (call && call[1]) || fn || '', outputs: outs, inputs };
}

let seq = 0;
export const newId = (prefix = 'n') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A free variable name base1, base2, … not used by any node. */
export function freeName(flow, base) {
  const b = isVarName(base) ? base : 'v';
  const used = new Set(outputNames(flow));
  for (let k = 1; ; k++) { const n = `${b}${k}`; if (!used.has(n)) return n; }
}

/** Every output variable name of the flow (const/op/expr names, func names). */
export function outputNames(flow) {
  const out = [];
  for (const n of flow.nodes) {
    if (n.type === 'func') out.push(...(n.names || []));
    else if (n.type === 'const' || n.type === 'op' || n.type === 'expr') out.push(n.name);
  }
  return out.filter(Boolean);
}

/** Input / output port counts of a node. */
export function portsOf(n) {
  switch (n.type) {
    case 'const': return { inputs: [], outputs: [n.name || 'value'] };
    case 'var': return { inputs: [], outputs: [n.name || 'x'] };
    case 'op': return { inputs: ['a', 'b'], outputs: [n.name || 'r'] };
    case 'func': return { inputs: (n.inputs || []).map((p) => p.label), outputs: (n.outputs || []).map((o, i) => (n.names && n.names[i]) || o) };
    case 'expr': return { inputs: (n.inputs || []).map((p) => p.label), outputs: [n.name || 'r'] };
    case 'disp': return { inputs: ['x'], outputs: [] };
    default: return { inputs: [], outputs: [] };
  }
}

/** A new node of `type` at (x, y); opts: { fn, syntax } for func, { op } for op, { name } for var, { value } for const. */
export function makeNode(flow, type, x, y, opts = {}) {
  const base = { id: newId(), type, x: Math.round(x), y: Math.round(y) };
  switch (type) {
    case 'const': return { ...base, name: opts.name || freeName(flow, 'c'), value: opts.value != null ? String(opts.value) : '1' };
    case 'var': return { ...base, name: opts.name || 'x' };
    case 'op': return { ...base, op: opts.op || '+', name: freeName(flow, 'r') };
    case 'expr': return { ...base, expr: opts.expr || 'a + b', inputs: [{ label: 'a' }, { label: 'b' }], name: freeName(flow, 'r') };
    case 'disp': return { ...base, label: '' };
    case 'func': {
      const p = parseSyntax(opts.syntax || `${opts.fn}()`, opts.fn);
      const node = { ...base, fn: opts.fn || p.fn, syntax: opts.syntax || '', inputs: p.inputs, outputs: p.outputs, names: [] };
      const taken = new Set(outputNames(flow));
      node.names = p.outputs.map((o) => {
        const stem = isVarName(o) ? o : node.fn;
        let k = 1, nm = `${stem}${k}`;
        while (taken.has(nm)) { k += 1; nm = `${stem}${k}`; }
        taken.add(nm);
        return nm;
      });
      return node;
    }
    default: throw new Error(`Unknown node type "${type}".`);
  }
}

/** Re-shapes a func node for another syntax line, keeping the values and names it can. */
export function applySyntax(flow, node, syntax) {
  const p = parseSyntax(syntax, node.fn);
  const others = { ...flow, nodes: flow.nodes.filter((n) => n.id !== node.id) };
  const taken = new Set(outputNames(others));
  const names = p.outputs.map((o, i) => {
    const old = node.names && node.names[i];
    if (old && !taken.has(old)) { taken.add(old); return old; }
    const stem = isVarName(o) ? o : node.fn;
    let k = 1, nm = `${stem}${k}`;
    while (taken.has(nm)) { k += 1; nm = `${stem}${k}`; }
    taken.add(nm);
    return nm;
  });
  const inputs = p.inputs.map((inp, i) => ({ ...inp, value: inp.value || (node.inputs && node.inputs[i] && node.inputs[i].value) || '' }));
  return { ...node, syntax, inputs, outputs: p.outputs, names };
}

/** Adds a link output (from.node, from.port) → input (to.node, to.port); an input takes one link (the old one goes). */
export function connect(flow, from, to) {
  if (from.node === to.node) return flow;
  const links = flow.links.filter((l) => !(l.to.node === to.node && l.to.port === to.port));
  const next = { ...flow, links: [...links, { id: newId('l'), from: { ...from }, to: { ...to } }] };
  return wouldCycle(next) ? flow : next;
}

function wouldCycle(flow) {
  const order = topoOrder(flow);
  return order.cyclic.length > 0;
}

/** Removes nodes (and their links) / links by id. */
export function removeItems(flow, ids) {
  const set = new Set(ids);
  const nodes = flow.nodes.filter((n) => !set.has(n.id));
  const keep = new Set(nodes.map((n) => n.id));
  return { ...flow, nodes, links: flow.links.filter((l) => !set.has(l.id) && keep.has(l.from.node) && keep.has(l.to.node)) };
}

/** Links whose ports no longer exist (after a node lost inputs / outputs) are dropped. */
export function pruneLinks(flow) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  return {
    ...flow,
    links: flow.links.filter((l) => {
      const a = byId.get(l.from.node), b = byId.get(l.to.node);
      return a && b && l.from.port < portsOf(a).outputs.length && l.to.port < portsOf(b).inputs.length;
    }),
  };
}

/** Data order: { order: [node], cyclic: [node] } (Kahn's algorithm, ties by y then x). */
export function topoOrder(flow) {
  const indeg = new Map(flow.nodes.map((n) => [n.id, 0]));
  const next = new Map(flow.nodes.map((n) => [n.id, []]));
  for (const l of flow.links) {
    if (!indeg.has(l.from.node) || !indeg.has(l.to.node)) continue;
    indeg.set(l.to.node, indeg.get(l.to.node) + 1);
    next.get(l.from.node).push(l.to.node);
  }
  const byPos = (a, b) => a.y - b.y || a.x - b.x;
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const ready = flow.nodes.filter((n) => indeg.get(n.id) === 0).sort(byPos);
  const order = [];
  while (ready.length) {
    const n = ready.shift();
    order.push(n);
    for (const m of next.get(n.id)) {
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) { ready.push(byId.get(m)); ready.sort(byPos); }
    }
  }
  const done = new Set(order.map((n) => n.id));
  return { order, cyclic: flow.nodes.filter((n) => !done.has(n.id)) };
}

const simple = (e) => /^[A-Za-z_]\w*$/.test(e) || /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(e) || /^'[^']*'$/.test(e);
const wrap = (e) => (simple(e) ? e : `(${e})`);

/**
 * M code of the flow: { code, problems: [{ node, code, message }] }.
 * problem codes: badName, dupName, missingInput, cycle, emptyFn.
 * opts.title: a header comment.
 */
export function generateCode(flow, opts = {}) {
  const problems = [];
  const lines = [];
  if (opts.title) lines.push(`% ${opts.title}`);
  const into = new Map(); // `${node}:${port}` → link
  for (const l of flow.links) into.set(`${l.to.node}:${l.to.port}`, l);
  const outVar = new Map(); // `${node}:${port}` → expression
  const { order, cyclic } = topoOrder(flow);
  for (const n of cyclic) problems.push({ node: n.id, code: 'cycle', message: 'This block is part of a loop of connections.' });
  // names: valid and unique
  const seen = new Map();
  for (const n of flow.nodes) {
    const names = n.type === 'func' ? n.names || [] : n.type === 'const' || n.type === 'op' || n.type === 'expr' ? [n.name] : n.type === 'var' ? [n.name] : [];
    for (const nm of names) {
      if (!isVarName(nm)) { problems.push({ node: n.id, code: 'badName', name: nm || '', message: `"${nm || ''}" is not a valid variable name.` }); continue; }
      if (n.type === 'var') continue;
      if (seen.has(nm) && seen.get(nm) !== n.id) problems.push({ node: n.id, code: 'dupName', name: nm, message: `"${nm}" is the output of more than one block.` });
      else seen.set(nm, n.id);
    }
  }
  const input = (n, i) => {
    const l = into.get(`${n.id}:${i}`);
    if (l) return outVar.get(`${l.from.node}:${l.from.port}`) || null;
    return null;
  };
  for (const n of order) {
    const note = n.note ? `   % ${String(n.note).replace(/\r?\n/g, ' ')}` : '';
    switch (n.type) {
      case 'const': {
        lines.push(`${n.name} = ${String(n.value ?? '').trim() || '[]'};${note}`);
        outVar.set(`${n.id}:0`, n.name);
        break;
      }
      case 'var': outVar.set(`${n.id}:0`, n.name); break;
      case 'op': {
        const a = input(n, 0), b = input(n, 1);
        if (a == null || b == null) { problems.push({ node: n.id, code: 'missingInput', message: 'Connect both inputs.' }); break; }
        lines.push(`${n.name} = ${wrap(a)} ${n.op} ${wrap(b)};${note}`);
        outVar.set(`${n.id}:0`, n.name);
        break;
      }
      case 'expr': {
        const subst = new Map();
        let missing = false;
        (n.inputs || []).forEach((p, i) => {
          const v = input(n, i);
          if (v == null) missing = true; else subst.set(p.label, v);
        });
        if (missing) { problems.push({ node: n.id, code: 'missingInput', message: 'Connect every input of the formula.' }); break; }
        // one pass, so an input fed by a variable named like another input is not replaced twice
        const e = String(n.expr || '').trim().replace(/(?<![\w.])[A-Za-z_]\w*/g, (m) => (subst.has(m) && subst.get(m) !== m ? wrap(subst.get(m)) : m));
        lines.push(`${n.name} = ${e || '[]'};${note}`);
        outVar.set(`${n.id}:0`, n.name);
        break;
      }
      case 'func': {
        if (!n.fn) { problems.push({ node: n.id, code: 'emptyFn', message: 'No function name.' }); break; }
        const args = (n.inputs || []).map((p, i) => { const v = input(n, i); return v != null ? v : String(p.value || '').trim() || null; });
        while (args.length && args[args.length - 1] == null) args.pop();
        if ((n.inputs || []).length && !args.length) { problems.push({ node: n.id, code: 'missingInput', message: 'Connect or fill in the inputs.' }); break; }
        const call = args.length ? `${n.fn}(${args.map((a) => (a == null ? '[]' : a)).join(', ')})` : n.fn;
        const names = n.names || [];
        if (!names.length) lines.push(`${call};${note}`);
        else if (names.length === 1) lines.push(`${names[0]} = ${call};${note}`);
        else lines.push(`[${names.join(', ')}] = ${call};${note}`);
        names.forEach((nm, i) => outVar.set(`${n.id}:${i}`, nm));
        break;
      }
      case 'disp': {
        const a = input(n, 0);
        if (a == null) { problems.push({ node: n.id, code: 'missingInput', message: 'Connect the value to show.' }); break; }
        lines.push(n.label ? `disp(${mStr(`${n.label}:`)}); disp(${a});` : `disp(${a});`);
        break;
      }
      default:
    }
  }
  return { code: `${lines.join('\n')}\n`, problems };
}

const mStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
