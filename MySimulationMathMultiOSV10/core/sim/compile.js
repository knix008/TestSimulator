// Model compiler: flattens the block diagram into executable nodes. Virtual
// blocks (subsystems, inner ports, Goto/From) are resolved away; conditional
// subsystems (enabled, triggered, action, iterator) become execution groups;
// sample times are propagated; nodes are sorted by direct feedthrough and
// algebraic loops are detected (error, or solved by Newton iteration).
import { blockDef, portsOf } from './blocks/index.js';
import { connections, escapeName } from './model.js';
import { makeB, modelScope, maskScope, simErr, Interp, isOn } from './params.js';
import { parseTs } from './blocks/util.js';

const VIRTUAL_ROLES = new Set(['subsystem', 'goto', 'from', 'gotovis', 'enableport', 'triggerport', 'actionport', 'dsm', 'note']);
const CONTROL_ROLES = { enableport: 'enable', triggerport: 'trigger', actionport: 'action', foriter: 'iterator', whileiter: 'iterator' };

export const roleOf = (b) => { const d = blockDef(b.type); return d ? d.role || (b.system ? 'subsystem' : '') : ''; };

/** The Port number of an Inport/Outport block (1-based). */
export const portNum = (b) => { const k = Math.round(Number(String((b.params && b.params.Port) || '1').trim())); return k >= 1 ? k : 1; };

/**
 * Compiles a model. opts: { overrides: Map name→Value (SimulationInput variables),
 * interp, warn(msg, blockId) }. Returns the program used by runtime.js.
 */
export function compileModel(model, ctx, opts = {}) {
  const interp = opts.interp || new Interp(ctx, {});
  const diagnostics = [];
  const warn = (message, block = null, level = 'warning') => diagnostics.push({ level, message, block });
  const rootScope = modelScope(model, ctx, interp, opts.overrides || null);
  const prog = {
    model, interp, scope: rootScope, nodes: [], groups: [], diagnostics, infos: [], infoOfBlock: new Map(), nodeOfBlock: new Map(),
    stores: new Map(), logged: [], rootIn: [], rootOut: [], plan: [], rates: [], info: { ports: {}, blocks: {} },
  };

  // ------------------------------------------------------------ pass 1: system tree
  function buildInfo(sys, parent, block, scope, path, group) {
    const info = { sys, parent, block, scope, path, group, byId: new Map(), conns: new Map(), inNames: new Map(), children: new Map(), gotos: [], blocks: sys.blocks };
    prog.infos.push(info);
    for (const b of sys.blocks) { info.byId.set(b.id, b); prog.infoOfBlock.set(b.id, info); }
    for (const c of connections(sys)) {
      const key = `${c.dst.block}:${c.dst.port}`;
      if (info.conns.has(key)) {
        const db = info.byId.get(c.dst.block);
        throw simErr('sim:compile:multipleDrivers', `Input port ${c.dst.port} of '${path}/${db ? db.name : c.dst.block}' is driven by more than one line.`, c.dst.block);
      }
      if (!info.byId.has(c.src.block) || !info.byId.has(c.dst.block)) continue;
      info.conns.set(key, c.src);
      if (typeof c.dst.port === 'number') { let a = info.inNames.get(c.dst.block); if (!a) { a = []; info.inNames.set(c.dst.block, a); } a[c.dst.port - 1] = c.name || ''; }
    }
    for (const b of sys.blocks) {
      const def = blockDef(b.type);
      const bpath = `${path}/${escapeName(b.name)}`;
      if (!def) throw simErr('sim:compile:unknownBlock', `Block '${bpath}' has an unknown type '${b.type}'.`, b.id, bpath);
      const role = def.role || (b.system ? 'subsystem' : '');
      if (role === 'goto') info.gotos.push(b);
      if (role === 'dsm') {
        const B = makeB({ block: b, path: bpath, def, scope, interp, ctx, nIn: 0, nOut: 0, model });
        const name = B.opt('DataStoreName') || 'A';
        if (prog.stores.has(name)) warn(`Data store '${name}' is defined more than once.`, b.id);
        prog.stores.set(name, { name, init: B.arr('InitialValue'), block: b.id });
      }
      if (role === 'subsystem') {
        const inner = b.system || { blocks: [], lines: [] };
        const childScope = maskScope(b, scope, interp, bpath);
        const ctl = inner.blocks.filter((x) => CONTROL_ROLES[roleOf(x)]);
        let g = null;
        if (ctl.length) {
          g = { id: prog.groups.length, block: b, path: bpath, parent: group, kinds: new Set(), ctrl: {}, members: [], active: true, fired: false, stamp: -1, prev: {}, iter: null, statesReset: false, outReset: [] };
          for (const cb of ctl) {
            const role2 = roleOf(cb);
            const cdef = blockDef(cb.type);
            const CB = makeB({ block: cb, path: `${bpath}/${escapeName(cb.name)}`, def: cdef, scope: childScope, interp, ctx, nIn: 0, nOut: 0, model });
            if (role2 === 'enableport') { g.kinds.add('enable'); g.statesReset = CB.opt('StatesWhenEnabling') === 'reset'; }
            else if (role2 === 'triggerport') { g.kinds.add('trigger'); g.trigType = CB.opt('TriggerType') || 'rising'; }
            else if (role2 === 'actionport') { g.kinds.add('action'); g.statesReset = CB.opt('InitializeStates') === 'reset'; }
            else { g.kinds.add('iterator'); g.iterBlock = cb; }
          }
          prog.groups.push(g);
        }
        const child = buildInfo(inner, info, b, childScope, bpath, g || group);
        if (g) g.info = child;
        info.children.set(b.id, child);
      }
    }
    return info;
  }
  const root = buildInfo(model.root, null, null, rootScope, model.name, null);

  // ------------------------------------------------------------ pass 2: nodes
  const isHeldOutport = (info, b) => roleOf(b) === 'outport' && info.block && info.group && info.group.block === info.block;
  const isRealBlock = (info, b) => {
    const role = roleOf(b);
    if (VIRTUAL_ROLES.has(role)) return false;
    if (role === 'inport' && info.block) return false;
    if (role === 'outport' && info.block && !isHeldOutport(info, b)) return false;
    return true;
  };
  const floatSignals = new Map();
  for (const info of prog.infos) {
    for (const b of info.sys.blocks) {
      if (!isRealBlock(info, b)) continue;
      const def = blockDef(b.type);
      const path = `${info.path}/${escapeName(b.name)}`;
      const role = def.role || '';
      const pc = portsOf(b);
      let nIn = pc.in, nOut = pc.out;
      if (role === 'floatscope') {
        const list = String(b.params.Signals || '').split(',').map((s) => s.trim()).filter(Boolean);
        floatSignals.set(b.id, list);
        nIn = list.length;
      }
      if (!def.make) throw simErr('sim:compile:noRuntime', `Block '${path}' (${def.label.en}) cannot be simulated.`, b.id, path);
      const B = makeB({ block: b, path, def, scope: info.scope, interp, ctx, nIn, nOut, model });
      B.held = isHeldOutport(info, b);
      B.inNames = Array.from({ length: nIn }, (_, k) => ((info.inNames.get(b.id) || [])[k] || ''));
      B.root = !info.block;
      let rt;
      try { rt = def.make(B) || {}; } catch (e) {
        if (e && e.block) throw e;
        throw simErr(e && e.identifier && e.identifier.startsWith('sim:') ? e.identifier : 'sim:compile:block', `${path}: ${e.message || e}`, b.id, path);
      }
      const node = {
        idx: prog.nodes.length, id: b.id, block: b, def, role, path, info, rt, B, nIn, nOut, inSrc: new Array(nIn).fill(null),
        group: info.group, ts: rt.ts === undefined ? -1 : rt.ts, rate: null, nx: 0, xOff: 0, y: [], u: new Array(nIn), stamp: -1, unit: null,
      };
      if (info.group) info.group.members.push(node);
      prog.nodes.push(node);
      prog.nodeOfBlock.set(b.id, node);
      if (role === 'inport' && !info.block) prog.rootIn.push(node);
      if (role === 'outport' && !info.block) prog.rootOut.push(node);
      if (node.group && node.group.iterBlock === b) node.group.iter = node;
    }
  }
  for (const g of prog.groups) if (g.kinds.has('iterator')) {
    for (const m of g.members) m.unit = topIter(m.group);
  }
  function topIter(g) { let r = null; for (let x = g; x; x = x.parent) if (x.kinds.has('iterator')) r = x; return r; }

  // ------------------------------------------------------------ pass 3: wiring
  function findGoto(info, tag) {
    const match = (b) => String(b.params.GotoTag || 'A') === tag;
    let g = info.gotos.find(match);
    if (g) return { goto: g, info };
    for (let p = info.parent; p; p = p.parent) {
      g = p.gotos.find((b) => match(b) && /^(scoped|global)$/i.test(String(b.params.TagVisibility || 'local')));
      if (g) return { goto: g, info: p };
    }
    for (const inf of prog.infos) {
      g = inf.gotos.find((b) => match(b) && /^global$/i.test(String(b.params.TagVisibility || 'local')));
      if (g) return { goto: g, info: inf };
    }
    return null;
  }
  function srcOf(info, dstId, dstPort, depth) {
    const s = info.conns.get(`${dstId}:${dstPort}`);
    return s ? resolveSource(info, s.block, s.port, depth + 1) : null;
  }
  function resolveSource(info, blockId, port, depth = 0) {
    if (depth > 500) throw simErr('sim:compile:virtualLoop', 'A loop of virtual blocks (subsystem ports / Goto-From) was found.', blockId);
    const node = prog.nodeOfBlock.get(blockId);
    if (node) return { n: node.idx, p: (typeof port === 'number' ? port : 1) - 1 };
    const b = info.byId.get(blockId);
    if (!b) return null;
    const role = roleOf(b);
    if (role === 'subsystem') {
      const child = info.children.get(b.id);
      const ob = child.sys.blocks.find((x) => roleOf(x) === 'outport' && portNum(x) === port);
      if (!ob) return null;
      const on = prog.nodeOfBlock.get(ob.id);
      if (on) return { n: on.idx, p: 0 };
      return srcOf(child, ob.id, 1, depth);
    }
    if (role === 'inport' && info.block) return srcOf(info.parent, info.block.id, portNum(b), depth);
    if (role === 'from') {
      const tag = String(b.params.GotoTag || 'A');
      const g = findGoto(info, tag);
      if (!g) throw simErr('sim:compile:noGoto', `From block '${info.path}/${b.name}' has no matching Goto block for tag '${tag}'.`, b.id);
      return srcOf(g.info, g.goto.id, 1, depth);
    }
    return null;
  }
  prog.resolveSource = (blockId, port) => { const info = prog.infoOfBlock.get(blockId); return info ? resolveSource(info, blockId, port) : null; };
  for (const node of prog.nodes) {
    if (node.role === 'floatscope') {
      node.inSrc = floatSignals.get(node.id).map((key) => { const [id, p] = key.split(':'); try { return prog.resolveSource(id, Number(p) || 1); } catch { return null; } });
      continue;
    }
    for (let k = 0; k < node.nIn; k++) {
      const s = srcOf(node.info, node.id, k + 1, 0);
      node.inSrc[k] = s;
      if (!s) warn(`Input port ${k + 1} of '${node.path}' is not connected.`, node.id);
    }
  }
  for (const g of prog.groups) {
    const pinfo = g.info.parent;
    for (const k of ['enable', 'trigger', 'action']) {
      if (!g.kinds.has(k)) continue;
      const s = srcOf(pinfo, g.block.id, k, 0);
      if (!s) warn(`The ${k} port of '${g.path}' is not connected.`, g.block.id);
      g.ctrl[k] = s;
    }
  }
  for (const info of prog.infos) {
    for (const l of info.sys.lines) {
      if (!l.log) continue;
      const s = resolveSource(info, l.src.block, l.src.port);
      if (!s) continue;
      const sb = info.byId.get(l.src.block);
      const nm = (l.name && l.name.trim()) || `${sb ? sb.name : 'signal'}_${l.src.port}`;
      prog.logged.push({ name: fieldName(nm, prog.logged.map((x) => x.name)), src: s, line: l.id });
    }
  }

  // ------------------------------------------------------------ pass 4: sample times
  propagateSampleTimes(prog);

  // ------------------------------------------------------------ pass 5: sorting
  prog.plan = sortPlan(prog, prog.nodes, null, model.settings.algebraicLoop || 'warning', warn);

  // ------------------------------------------------------------ GUI info
  for (const node of prog.nodes) prog.info.blocks[node.id] = { ts: tsText(node.ts), rate: node.rate };
  return prog;
}

function fieldName(s, taken) {
  let n = String(s).replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z])/, 's$1').slice(0, 60) || 'signal';
  if (!taken.includes(n)) return n;
  for (let i = 1; ; i++) if (!taken.includes(`${n}_${i}`)) return `${n}_${i}`;
}

export const tsText = (ts) => (ts === -1 ? -1 : ts === 0 ? 0 : ts === Infinity ? 'inf' : ts === 'trig' ? 'trig' : Array.isArray(ts) ? [ts[0], ts[1] || 0] : ts);

// ------------------------------------------------------------ sample times
function propagateSampleTimes(prog) {
  const { nodes } = prog;
  const inTrig = (n) => { for (let g = n.group; g; g = g.parent) if (g.kinds.has('trigger')) return true; return false; };
  const norm = (ts) => (Array.isArray(ts) ? (ts[0] > 0 ? [ts[0], ts[1] || 0] : ts[0] === 0 ? 0 : -1) : ts == null ? -1 : typeof ts === 'number' ? (ts === Infinity || ts === 0 || ts === -1 ? ts : ts > 0 ? [ts, 0] : -1) : ts);
  for (const n of nodes) {
    n.ts = norm(n.ts);
    if (inTrig(n) && n.ts !== Infinity) n.ts = 'trig';
  }
  // outside a triggered subsystem its held outputs behave like continuous signals
  const outside = (n, ts) => (ts === 'trig' && !inTrig(n) ? 0 : ts);
  const combine = (list) => {
    if (list.some((t) => t === 'trig')) return 'trig';
    if (list.some((t) => t === 0)) return 0;
    const disc = list.filter((t) => Array.isArray(t));
    if (!disc.length) return Infinity;
    let best = disc[0];
    for (const t of disc) if (t[0] < best[0]) best = t;
    const same = disc.every((t) => t[0] === best[0] && t[1] === best[1]);
    return same ? best : [best[0], 0];
  };
  let changed = true;
  for (let pass = 0; changed && pass < 100; pass++) {
    changed = false;
    for (const n of nodes) {
      if (n.ts !== -1) continue;
      const src = n.inSrc.filter(Boolean).map((s) => outside(n, nodes[s.n].ts));
      if (src.some((t) => t === -1)) continue;
      n.ts = combine(src);
      changed = true;
    }
  }
  // loops of inherited blocks: use what is known, else continuous
  for (let pass = 0; pass < 100; pass++) {
    const open = nodes.filter((n) => n.ts === -1);
    if (!open.length) break;
    for (const n of open) {
      const src = n.inSrc.filter(Boolean).map((s) => outside(n, nodes[s.n].ts)).filter((t) => t !== -1);
      n.ts = src.length ? combine(src) : 0;
    }
  }
  for (const n of nodes) {
    const stateful = (n.rt.nx > 0) || typeof n.rt.update === 'function' || typeof n.rt.deriv === 'function' || typeof n.rt.log === 'function' || n.role === 'outport' || typeof n.rt.nextHit === 'function';
    if (n.ts === Infinity && stateful) n.ts = n.inSrc.some(Boolean) ? 0 : n.ts;
    if (n.ts === Infinity && (typeof n.rt.deriv === 'function' || n.rt.nx > 0)) n.ts = 0;
  }
  // discrete rates, fastest first
  const rates = [];
  for (const n of nodes) if (Array.isArray(n.ts) && !rates.some((r) => r[0] === n.ts[0] && r[1] === n.ts[1])) rates.push(n.ts);
  rates.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  prog.rates = rates;
  for (const n of nodes) {
    n.kind = n.ts === 0 ? 'cont' : n.ts === Infinity ? 'const' : n.ts === 'trig' ? 'trig' : 'disc';
    n.rateIdx = n.kind === 'disc' ? rates.findIndex((r) => r[0] === n.ts[0] && r[1] === n.ts[1]) : -1;
    n.rate = n.kind === 'cont' ? 0 : n.kind === 'const' ? 'const' : n.kind === 'trig' ? 'trig' : n.rateIdx + 1;
  }
}

// ------------------------------------------------------------ sorting
function directOf(node, k) {
  const d = node.rt.direct;
  if (d === undefined) return true;
  if (Array.isArray(d)) return d[k] !== false;
  return !!d;
}

/** Sorted execution plan of `nodes` (one level): steps {kind:'node'|'loop'|'iter'}. */
function sortPlan(prog, nodes, unitGroup, loopMode, warn) {
  const items = [];
  const itemOf = new Map();
  const unitItem = new Map();
  for (const n of nodes) {
    let u = n.unit;
    if (unitGroup) { u = null; for (let g = n.group; g && g !== unitGroup; g = g.parent) if (g.kinds.has('iterator')) u = g; }
    if (u) {
      let it = unitItem.get(u);
      if (!it) { it = { kind: 'iter', group: u, nodes: [], deps: new Set() }; unitItem.set(u, it); items.push(it); }
      it.nodes.push(n); itemOf.set(n.idx, it);
    } else { const it = { kind: 'node', node: n, deps: new Set() }; items.push(it); itemOf.set(n.idx, it); }
  }
  const all = prog.nodes;
  const ctrlDeps = (n) => {
    const out = [];
    for (let g = n.group; g && g !== unitGroup; g = g.parent) for (const k of ['enable', 'trigger', 'action']) if (g.ctrl[k]) out.push(g.ctrl[k].n);
    return out;
  };
  for (const n of nodes) {
    const it = itemOf.get(n.idx);
    const add = (srcIdx) => { const si = itemOf.get(srcIdx); if (si && (si !== it || it.kind === 'node')) it.deps.add(si); };
    n.inSrc.forEach((s, k) => { if (s && n.role !== 'floatscope' && directOf(n, k)) add(s.n); });
    for (const c of ctrlDeps(n)) add(c);
  }
  // Tarjan SCC
  let index = 0;
  const stack = [], on = new Set(), idx = new Map(), low = new Map(), comps = [];
  const strong = (v) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    for (const w of v.deps) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) { const c = []; let w; do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v); comps.push(c); }
  };
  for (const it of items) if (!idx.has(it)) strong(it);
  // comps come out in reverse topological order of the dependency graph (dependencies first)
  const plan = [];
  for (const c of comps) {
    const loop = c.length > 1 || c[0].deps.has(c[0]);
    if (!loop) { plan.push(planStep(prog, c[0], warn)); continue; }
    const names = c.map((it) => (it.kind === 'node' ? it.node.path : it.group.path));
    const blocks = c.map((it) => (it.kind === 'node' ? it.node.id : it.group.block.id));
    if (loopMode === 'error' || c.some((it) => it.kind !== 'node')) {
      throw simErr('sim:compile:algebraicLoop', `Algebraic loop: ${names.join(' → ')}.`, blocks[0]);
    }
    if (loopMode !== 'none') warn(`Algebraic loop (solved iteratively): ${names.join(' → ')}.`, blocks[0]);
    plan.push(loopStep(c.map((it) => it.node), all));
  }
  return plan;
}
function planStep(prog, it, warn) {
  if (it.kind === 'node') return { kind: 'node', node: it.node };
  const sub = sortPlan(prog, it.nodes, it.group, 'error', warn);
  it.group.plan = sub;
  return { kind: 'iter', group: it.group, plan: sub, nodes: it.nodes };
}
/** Orders the nodes of a loop by DFS, cutting the back edges; the cut signals are the unknowns. */
function loopStep(members, all) {
  const set = new Set(members.map((n) => n.idx));
  const state = new Map(); const order = []; const cut = [];
  const visit = (n) => {
    state.set(n.idx, 1);
    n.inSrc.forEach((s, k) => {
      if (!s || !set.has(s.n) || !directOf(n, k)) return;
      const st = state.get(s.n);
      if (st === 1) { if (!cut.some((c) => c.n === s.n && c.p === s.p)) cut.push({ n: s.n, p: s.p }); return; }
      if (!st) visit(all[s.n]);
    });
    state.set(n.idx, 2); order.push(n);
  };
  for (const n of members) if (!state.get(n.idx)) visit(n);
  return { kind: 'loop', nodes: order, cut };
}

export { isOn };
