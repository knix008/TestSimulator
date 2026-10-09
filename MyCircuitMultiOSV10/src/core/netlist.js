// Schematic connectivity: which pins share a net, what each net is called,
// plus annotation and the electrical rules check (ERC).
//
// Rules (same as KiCad):
//   * Wire end points connect to whatever sits exactly on them.
//   * A wire end, pin tip or label anchor lying on the middle of another wire
//     connects to it (a T joint). Two wires merely crossing do not connect
//     unless a junction dot sits on the crossing.
//   * Local labels with the same text are the same net on their page; global
//     labels (and a local label of the same name on the same page) join
//     across every page of the schematic.
//   * Power symbols name their net after the symbol (GND, +5V, ...) on every page.
//
// Multi-page schematics keep every item in the same arrays, tagged with
// `page` (a page id from schematic.pages). Geometry only connects within a page.

import { getSymbol, partSymbol, unitCount } from "../lib/symbols.js";
import { xform, xformDir, pointSegDist } from "./geom.js";

// Page id of an item; items without one belong to the first page.
export function pageOf(sch, o) {
  return (o && o.page) || (sch.pages && sch.pages[0] ? sch.pages[0].id : "");
}

export const SCH_KINDS = ["parts", "wires", "buses", "junctions", "labels", "noconnects", "texts", "sheets", "dimensions"];

// Where a hierarchical sheet pin sits (its connection point on the block edge).
export function sheetPinPoint(sheet, pin) {
  return pin.side === "R" ? [sheet.x + sheet.w, sheet.y + pin.offset] : [sheet.x, sheet.y + pin.offset];
}

// "D[0..7]" → ["D0", …, "D7"]; anything else → null.
export function busMembers(text) {
  const m = /^(.*)\[(\d+)\.\.(\d+)\]$/.exec(String(text || ""));
  if (!m) return null;
  const a = +m[2];
  const b = +m[3];
  const out = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 256; i++) out.push(`${m[1]}${i}`);
  return out;
}

// The items of one page as a schematic-shaped object (arrays are copies, the
// items themselves are shared). Edit it, then writePageView() puts additions
// and removals back.
export function pageView(sch, page = pageOf(sch, null)) {
  const v = { sheet: sch.sheet, pages: sch.pages, page };
  for (const k of SCH_KINDS) v[k] = (sch[k] || []).filter((o) => pageOf(sch, o) === page);
  return v;
}

export function writePageView(sch, v) {
  for (const k of SCH_KINDS) {
    const others = (sch[k] || []).filter((o) => pageOf(sch, o) !== v.page);
    for (const o of v[k]) o.page = v.page;
    sch[k] = others.concat(v[k]);
  }
}

const pkey = (page, x, y) => `${page}|${Math.round(x)},${Math.round(y)}`;

class DSU {
  constructor() { this.p = new Map(); }
  find(a) {
    if (!this.p.has(a)) this.p.set(a, a);
    let r = a;
    while (this.p.get(r) !== r) r = this.p.get(r);
    let c = a;
    while (this.p.get(c) !== r) { const n = this.p.get(c); this.p.set(c, r); c = n; }
    return r;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

// World-space pins of a placed part.
export function partPins(part) {
  const sym = partSymbol(part);
  if (!sym) return [];
  return sym.pins.map((pin) => {
    const [x, y] = xform(pin.x, pin.y, part);
    return { ...pin, x: Math.round(x), y: Math.round(y), dir: xformDir(pin.dir, part), partId: part.id, ref: part.ref };
  });
}

function onWireInterior(x, y, w) {
  if ((x === w.x1 && y === w.y1) || (x === w.x2 && y === w.y2)) return false;
  return pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2) < 0.5;
}

export function buildNetlist(sch) {
  const dsu = new DSU();
  const pins = [];
  const pg = (o) => pageOf(sch, o);
  for (const part of sch.parts) {
    const page = pg(part);
    for (const pin of partPins(part)) {
      const node = `pin:${part.id}:${pin.num}:${pins.length}`;
      pins.push({ ...pin, node, part, page });
      dsu.union(node, pkey(page, pin.x, pin.y));
    }
  }
  // Pins of the same part sharing a number (e.g. a switch's twin pads) are one
  // net — and so are pins of the units of one multi-unit component (same
  // placement group, or same annotated reference), e.g. shared power pins.
  const byPartNum = new Map();
  const groupOf = (part) => {
    const sym = getSymbol(part.lib);
    if (unitCount(sym) < 2) return part.id;
    if (part.unitGroup) return `g:${part.unitGroup}`;
    return /^[A-Za-z#_]+\d+$/.test(part.ref || "") ? `r:${part.ref}` : part.id;
  };
  for (const p of pins) {
    const k = `${groupOf(p.part)}:${p.num}`;
    if (byPartNum.has(k)) dsu.union(byPartNum.get(k), p.node);
    else byPartNum.set(k, p.node);
  }

  const wires = sch.wires || [];
  for (const w of wires) dsu.union(pkey(pg(w), w.x1, w.y1), pkey(pg(w), w.x2, w.y2));

  // Everything that can attach to the middle of a wire, grouped by page.
  const attach = new Map();
  const addAttach = (page, x, y) => {
    if (!attach.has(page)) attach.set(page, []);
    attach.get(page).push([x, y]);
  };
  for (const p of pins) addAttach(p.page, p.x, p.y);
  for (const w of wires) { addAttach(pg(w), w.x1, w.y1); addAttach(pg(w), w.x2, w.y2); }
  for (const j of sch.junctions || []) addAttach(pg(j), j.x, j.y);
  for (const l of sch.labels || []) addAttach(pg(l), l.x, l.y);
  for (const sh of sch.sheets || []) for (const sp of sh.pins || []) { const [x, y] = sheetPinPoint(sh, sp); addAttach(pg(sh), x, y); }
  for (const w of wires) {
    const page = pg(w);
    const minX = Math.min(w.x1, w.x2), maxX = Math.max(w.x1, w.x2), minY = Math.min(w.y1, w.y2), maxY = Math.max(w.y1, w.y2);
    for (const [x, y] of attach.get(page) || []) {
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (onWireInterior(x, y, w)) dsu.union(pkey(page, x, y), pkey(page, w.x1, w.y1));
    }
  }

  // Labels: same text on the same page always joins; global labels also join
  // across pages. Hierarchical labels join the matching pin of the sheet block
  // that shows their page. Vector labels ("D[0..7]") stand for their members.
  const labelNode = (l) => `label:${pg(l)}:${l.text}`;
  const memberNode = (page, name) => `label:${page}:${name}`;
  for (const l of sch.labels || []) {
    const members = busMembers(l.text);
    if (members) {
      // A global bus label joins each member across pages.
      if (l.kind === "global") for (const m of members) dsu.union(memberNode(pg(l), m), `glabel:${m}`);
      continue;
    }
    if (l.kind === "hier") { dsu.union(pkey(pg(l), l.x, l.y), `hlabel:${pg(l)}:${l.text}`); continue; }
    dsu.union(pkey(pg(l), l.x, l.y), labelNode(l));
    if (l.kind === "global") dsu.union(labelNode(l), `glabel:${l.text}`);
  }
  for (const sh of sch.sheets || []) {
    for (const sp of sh.pins || []) {
      const members = busMembers(sp.name);
      if (members) {
        for (const m of members) dsu.union(memberNode(pg(sh), m), memberNode(sh.target, m));
        continue;
      }
      const [x, y] = sheetPinPoint(sh, sp);
      dsu.union(pkey(pg(sh), x, y), `hlabel:${sh.target}:${sp.name}`);
    }
  }

  // Power symbols: every pin of a power symbol joins the named rail. Hidden
  // power-input pins of ordinary parts join the net named after the pin, like
  // KiCad (e.g. a logic chip's invisible VCC/GND).
  for (const p of pins) {
    const sym = getSymbol(p.part.lib);
    if (sym && sym.power) dsu.union(p.node, `power:${p.part.value || sym.power}`);
    else if (p.hidden && p.type === "power_in" && p.name) dsu.union(p.node, `power:${p.name}`);
  }

  // Group pins by root.
  const groups = new Map();
  const rootOf = (n) => dsu.find(n);
  for (const p of pins) {
    const r = rootOf(p.node);
    if (!groups.has(r)) groups.set(r, { pins: [], names: { power: new Set(), global: new Set(), local: new Set() }, flag: false, root: r });
    groups.get(r).pins.push(p);
  }
  // Names from labels / power that may have no pins (still nets for labels).
  const ensure = (r) => {
    if (!groups.has(r)) groups.set(r, { pins: [], names: { power: new Set(), global: new Set(), local: new Set() }, flag: false, root: r });
    return groups.get(r);
  };
  for (const l of sch.labels || []) {
    if (busMembers(l.text)) continue;
    const node = l.kind === "hier" ? `hlabel:${pg(l)}:${l.text}` : labelNode(l);
    ensure(rootOf(node)).names[l.kind === "global" ? "global" : "local"].add(l.text);
  }
  for (const p of pins) {
    const sym = getSymbol(p.part.lib);
    if (sym && sym.power) ensure(rootOf(p.node)).names.power.add(p.part.value || sym.power);
    else if (p.hidden && p.type === "power_in" && p.name) ensure(rootOf(p.node)).names.power.add(p.name);
    if (sym && sym.flag) ensure(rootOf(p.node)).flag = true;
  }

  const nets = [];
  const pinNet = new Map(); // `${partId}:${pinNum}` -> net name
  const rootNet = new Map();
  const used = new Set();
  let auto = 0;
  const ordered = [...groups.values()].sort((a, b) => {
    const na = a.names.power.size + a.names.global.size + a.names.local.size;
    const nb = b.names.power.size + b.names.global.size + b.names.local.size;
    return nb - na;
  });
  for (const g of ordered) {
    const real = g.pins.filter((p) => { const s = getSymbol(p.part.lib); return s && !s.power && !s.flag; });
    let name = [...g.names.power][0] || [...g.names.global][0] || [...g.names.local][0];
    if (!name) {
      if (!real.length) continue;
      const first = [...real].sort((a, b) => (a.ref || "").localeCompare(b.ref || "", undefined, { numeric: true }) || a.num.localeCompare(b.num, undefined, { numeric: true }))[0];
      name = `Net-(${first.ref}-Pad${first.num})`;
    }
    if (used.has(name)) name = `${name}_${++auto}`;
    used.add(name);
    rootNet.set(g.root, name);
    const netPins = real.map((p) => ({ partId: p.partId, ref: p.ref, pin: p.num, name: p.name, type: p.type, x: p.x, y: p.y }));
    nets.push({ name, pins: netPins, allPins: g.pins, flag: g.flag, labels: [...g.names.local, ...g.names.global], power: [...g.names.power] });
    for (const p of real) pinNet.set(`${p.partId}:${p.num}`, name);
  }
  nets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  nets.forEach((n, i) => { n.code = i + 1; });

  const wireNet = new Map();
  for (const w of wires) {
    const n = rootNet.get(rootOf(pkey(pg(w), w.x1, w.y1)));
    if (n) wireNet.set(w.id, n);
  }
  const firstPage = pageOf(sch, null);
  const key = (x, y, page = firstPage) => pkey(page, x, y);
  const netAt = (x, y, page = firstPage) => rootNet.get(rootOf(key(x, y, page))) || null;
  return { nets, pinNet, wireNet, pins, netAt, dsu, key };
}

// ---------------------------------------------------------------- annotation
// Number every part whose reference ends in "?" (or all, when `all`), per
// prefix, ordered top-to-bottom then left-to-right like reading a page.
export function annotate(sch, { all = false, start = 1 } = {}) {
  const changes = [];
  const byPrefix = new Map();
  const taken = new Map();
  for (const part of sch.parts) {
    const sym = getSymbol(part.lib);
    if (!sym || sym.power || sym.flag) continue;
    const prefix = sym.refPrefix || "U";
    const m = String(part.ref || "").match(/^([A-Za-z#_]+)(\d+)$/);
    if (!all && m) {
      if (!taken.has(m[1])) taken.set(m[1], new Set());
      taken.get(m[1]).add(+m[2]);
      continue;
    }
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(part);
  }
  for (const [prefix, parts] of byPrefix) {
    // Page by page, then top-to-bottom, left-to-right within a page.
    const pageIndex = new Map((sch.pages || []).map((p, i) => [p.id, i]));
    const pi = (p) => pageIndex.get(pageOf(sch, p)) ?? 0;
    parts.sort((a, b) => (pi(a) - pi(b)) || (Math.round(a.y / 100) - Math.round(b.y / 100)) || (a.x - b.x));
    const set = taken.get(prefix) || new Set();
    const groupRef = new Map(); // unitGroup → ref already given to its first unit
    let n = start;
    for (const part of parts) {
      let ref = part.unitGroup ? groupRef.get(part.unitGroup) : null;
      if (!ref) {
        while (set.has(n)) n++;
        ref = `${prefix}${n}`;
        set.add(n);
        n++;
        if (part.unitGroup) groupRef.set(part.unitGroup, ref);
      }
      if (part.ref !== ref) changes.push({ id: part.id, from: part.ref, to: ref });
      part.ref = ref;
    }
    taken.set(prefix, set);
  }
  // Power symbols get hidden #PWR numbers so they are unique, like KiCad.
  let pwr = 1;
  let flg = 1;
  for (const part of sch.parts) {
    const sym = getSymbol(part.lib);
    if (sym && sym.power) part.ref = `#PWR${String(pwr++).padStart(2, "0")}`;
    else if (sym && sym.flag) part.ref = `#FLG${String(flg++).padStart(2, "0")}`;
  }
  return changes;
}

// ---------------------------------------------------------------- ERC
const DRIVERS = new Set(["output", "power_out", "bidir", "tristate", "open_collector"]);

export function runERC(sch, netlist = buildNetlist(sch)) {
  const issues = [];
  // Every issue carries the page it is on so the editor can switch to it.
  const add = (severity, code, message, x, y, ids = [], page) => issues.push({ severity, code, message, x, y, ids, page: page || pageOf(sch, null) });
  const pg = (o) => pageOf(sch, o);
  const at = (page, x, y) => `${page}|${x},${y}`;

  // References.
  const refs = new Map();
  for (const part of sch.parts) {
    const sym = getSymbol(part.lib);
    if (!sym) { add("error", "unknown-symbol", `Unknown symbol "${part.lib}"`, part.x, part.y, [part.id], pg(part)); continue; }
    if (sym.power || sym.flag) continue;
    if (!part.ref || /\?$/.test(part.ref)) { add("error", "unannotated", `${part.ref || part.lib} is not annotated`, part.x, part.y, [part.id], pg(part)); continue; }
    const other = refs.get(part.ref);
    const sameComponent = other && unitCount(sym) > 1 && other.lib === part.lib && (other.unit || 1) !== (part.unit || 1);
    if (other && !sameComponent) add("error", "duplicate-ref", `Duplicate reference ${part.ref}`, part.x, part.y, [part.id, other.id], pg(part));
    else if (!other) refs.set(part.ref, part);
    if (!part.footprint && sym.pins.length) add("warning", "no-footprint", `${part.ref} has no footprint assigned`, part.x, part.y, [part.id], pg(part));
  }

  const ncAt = new Set((sch.noconnects || []).map((n) => at(pg(n), n.x, n.y)));
  const wireEnds = new Map();
  for (const w of sch.wires || []) {
    for (const k of [at(pg(w), w.x1, w.y1), at(pg(w), w.x2, w.y2)]) wireEnds.set(k, (wireEnds.get(k) || 0) + 1);
  }

  for (const net of netlist.nets) {
    const all = net.allPins;
    const real = all.filter((p) => { const s = getSymbol(p.part.lib); return s && !s.power && !s.flag; });
    const outputs = real.filter((p) => p.type === "output");
    if (outputs.length > 1) {
      add("error", "output-conflict", `Outputs ${outputs.map((p) => `${p.ref}.${p.num}`).join(", ")} drive the same net ${net.name}`, outputs[0].x, outputs[0].y, outputs.map((p) => p.partId), outputs[0].page);
    }
    const powerIns = real.filter((p) => p.type === "power_in");
    const hasDriver = real.some((p) => p.type === "power_out") || net.flag;
    if (powerIns.length && !hasDriver) {
      // KiCad reports this when a supply pin is only fed by passives/labels.
      const p = powerIns[0];
      add("error", "power-undriven", `Power input ${p.ref}.${p.num} (${p.name}) on net ${net.name} is not driven by any power output (add a PWR_FLAG)`, p.x, p.y, [p.partId], p.page);
    }
    if (real.length === 1 && !net.labels.length && !net.power.length) {
      const p = real[0];
      const k = at(p.page, p.x, p.y);
      if (!ncAt.has(k) && p.type !== "no_connect") {
        add("warning", "unconnected-pin", `Pin ${p.ref}.${p.num} (${p.name}) is not connected`, p.x, p.y, [p.partId], p.page);
      }
    }
    if (real.length > 1) {
      for (const p of real) {
        if (ncAt.has(at(p.page, p.x, p.y))) add("warning", "nc-connected", `Pin ${p.ref}.${p.num} has a no-connect flag but is connected`, p.x, p.y, [p.partId], p.page);
      }
    }
    const onlyInputs = real.length > 1 && real.every((p) => p.type === "input");
    if (onlyInputs) add("warning", "no-driver", `Net ${net.name} has only input pins`, real[0].x, real[0].y, real.map((p) => p.partId), real[0].page);
  }

  // Pins sitting nowhere (not even on a wire end).
  const pinPoints = new Set(netlist.pins.map((p) => at(p.page, p.x, p.y)));
  const labelPoints = new Set((sch.labels || []).map((l) => at(pg(l), l.x, l.y)));
  for (const w of sch.wires || []) {
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      const k = at(pg(w), x, y);
      if (pinPoints.has(k) || labelPoints.has(k) || ncAt.has(k) || (wireEnds.get(k) || 0) > 1) continue;
      const onOther = (sch.wires || []).some((o) => o !== w && pg(o) === pg(w) && onWireInterior(x, y, o));
      if (!onOther) add("warning", "dangling-wire", "Wire end is not connected to anything", x, y, [w.id], pg(w));
    }
  }
  // Labels that name a net nothing else uses.
  const labelCount = new Map();
  for (const l of sch.labels || []) labelCount.set(l.text, (labelCount.get(l.text) || 0) + 1);
  for (const l of sch.labels || []) {
    // Hierarchical labels pair with a sheet pin (checked as hier-unconnected);
    // vector labels name a whole bus.
    if (l.kind === "hier" || busMembers(l.text)) continue;
    const net = netlist.netAt(l.x, l.y, pg(l));
    const n = netlist.nets.find((x) => x.name === net);
    if (labelCount.get(l.text) === 1 && (!n || n.pins.length < 2)) add("warning", "single-label", `Label "${l.text}" is only used once`, l.x, l.y, [l.id], pg(l));
  }
  for (const n of sch.noconnects || []) {
    if (!pinPoints.has(at(pg(n), n.x, n.y))) add("warning", "stray-nc", "No-connect flag is not on a pin", n.x, n.y, [n.id], pg(n));
  }
  // Hierarchical labels must be reachable through a sheet pin.
  const pinsByTarget = new Map();
  for (const sh of sch.sheets || []) {
    if (!(sch.pages || []).some((p) => p.id === sh.target)) add("error", "sheet-target", `Sheet "${sh.name}" points to a page that does not exist`, sh.x, sh.y, [sh.id], pg(sh));
    for (const sp of sh.pins || []) {
      if (!pinsByTarget.has(sh.target)) pinsByTarget.set(sh.target, new Set());
      pinsByTarget.get(sh.target).add(sp.name);
    }
  }
  for (const l of sch.labels || []) {
    if (l.kind !== "hier") continue;
    const set = pinsByTarget.get(pg(l));
    if (!set || !set.has(l.text)) add("warning", "hier-unconnected", `Hierarchical label "${l.text}" has no matching sheet pin`, l.x, l.y, [l.id], pg(l));
  }
  void DRIVERS;
  return issues;
}

// Netlist for the board: refs with footprints and pin->net maps.
export function boardNetlist(sch, netlist = buildNetlist(sch)) {
  const parts = [];
  const byRef = new Map();
  for (const part of sch.parts) {
    const sym = getSymbol(part.lib);
    const usym = partSymbol(part);
    if (!sym || sym.power || sym.flag || (!usym.pins.length && !part.footprint && unitCount(sym) < 2)) continue;
    const padNets = {};
    for (const pin of usym.pins) {
      const net = netlist.pinNet.get(`${part.id}:${pin.num}`);
      if (net) padNets[pin.num] = net;
    }
    // The units of one component are one footprint on the board.
    const prev = unitCount(sym) > 1 ? byRef.get(part.ref) : null;
    if (prev) { Object.assign(prev.padNets, padNets); if (!prev.footprint && part.footprint) prev.footprint = part.footprint; continue; }
    const entry = { partId: part.id, ref: part.ref, value: part.value, footprint: part.footprint, padNets, dnp: !!part.dnp };
    if (unitCount(sym) > 1) byRef.set(part.ref, entry);
    parts.push(entry);
  }
  return { parts, nets: netlist.nets.map((n) => n.name) };
}
