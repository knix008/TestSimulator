// The link between a 2D electrical schematic (schematic.js) and a 3D harness route (harness.js): the schematic says
// what is connected, the harness says where the wires run and how long they are.
//   endpoints   a schematic symbol whose tag is the name of a harness connector (X1, XT2, or a device such as M1)
//               ends harness wires; its pins map by their order on the symbol (connector pin "3" is pin 3)
//   wires       each net of the schematic that joins two endpoint pins is one harness wire, named by the net's wire
//               number, its colour (IEC 60757 code, or a colour word) and size (mm², to the nearest standard size)
//               taken from the schematic wires of the net
//   compare     wires missing from the harness, extra ones, and colour / size differences
//   lengths     the routed 3D lengths written back on the schematic wires of each net (the from–to list shows them)
// A net joining more than two endpoint pins needs a splice, which a harness of pin-to-pin wires does not have: the
// first two pins get the wire and the net is reported.
import { nets, symbolPins, wireNumbers } from './schematic.js';
import { WIRE_COLOURS, WIRE_SIZES } from './harness.js';

const COLOUR_WORDS = { red: 'RD', black: 'BK', blue: 'BU', green: 'GN', yellow: 'YE', white: 'WH', orange: 'OG', violet: 'VT', purple: 'VT', brown: 'BN', grey: 'GY', gray: 'GY', 빨강: 'RD', 검정: 'BK', 파랑: 'BU', 초록: 'GN', 녹색: 'GN', 노랑: 'YE', 흰색: 'WH', 주황: 'OG', 보라: 'VT', 갈색: 'BN', 회색: 'GY' };

/** A schematic colour text as a harness colour code (or null when it is not one). */
export function colourCode(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (WIRE_COLOURS[up]) return up;
  return COLOUR_WORDS[s.toLowerCase()] ?? null;
}

/** A schematic size text ("1.5", "1,5 mm²", "AWG 18") as a standard harness size in mm² (or null). */
export function sizeOf(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const awg = /awg\s*(\d+)/i.exec(s);
  const mm2 = awg ? 0.012668 * 92 ** ((36 - Number(awg[1])) / 19.5) : Number(s.replace(',', '.').replace(/[^\d.]/g, ''));
  if (!(mm2 > 0)) return null;
  return WIRE_SIZES.reduce((best, g) => (Math.abs(Math.log(g / mm2)) < Math.abs(Math.log(best / mm2)) ? g : best), WIRE_SIZES[0]);
}

const pinKey = (c, p) => `${c}:${p}`;
const pairKey = (w) => [pinKey(w.from, w.fromPin), pinKey(w.to, w.toPin)].sort().join('|');
const byTagPin = (a, b) => a.tag.localeCompare(b.tag, 'en', { numeric: true }) || a.pin - b.pin;

/**
 * The harness wires the schematic asks for: { wires: [{ name, from, fromPin, to, toPin, color, gauge, net }],
 * issues: [{ kind: 'no-connector' (a schematic connector with no harness connector), 'pin-range', 'splice', 'colour',
 * 'size', … }] }. `harness` is the route feature (its connectors: { name, pins }).
 */
export function harnessWiresFromSchematic(sch, harness) {
  const conns = new Map((harness?.connectors ?? []).map((c) => [String(c.name), Math.max(1, Math.round(Number(c.pins) || 1))]));
  const issues = [];
  const symByTag = new Map(sch.symbols.map((s) => [s.tag, s]));
  for (const s of sch.symbols) if ((s.kind === 'connector' || s.kind === 'terminal') && !conns.has(s.tag)) issues.push({ kind: 'no-connector', tag: s.tag });
  const numbers = wireNumbers(sch);
  const wires = [];
  for (const net of nets(sch)) {
    const ends = [];
    const seen = new Set();
    for (const p of net.pins) {
      if (!conns.has(p.tag)) continue;
      const sym = symByTag.get(p.tag);
      const index = symbolPins(sym).findIndex((x) => x.id === p.pin) + 1;
      if (index < 1) continue;
      if (index > conns.get(p.tag)) { issues.push({ kind: 'pin-range', tag: p.tag, pin: index, pins: conns.get(p.tag), net: net.name }); continue; }
      const k = pinKey(p.tag, index);
      if (!seen.has(k)) { seen.add(k); ends.push({ tag: p.tag, pin: index }); }
    }
    if (ends.length < 2) continue;
    ends.sort(byTagPin);
    if (ends.length > 2) issues.push({ kind: 'splice', net: net.name, pins: ends.map((e) => pinKey(e.tag, e.pin)) });
    const schWires = net.wires.map((id) => sch.wires.find((w) => w.id === id)).filter(Boolean);
    const named = schWires.find((w) => w.number);
    const name = named?.number || (schWires[0] ? numbers.get(schWires[0].id) : net.name) || net.name;
    const colourText = schWires.find((w) => w.color)?.color;
    const sizeText = schWires.find((w) => w.gauge)?.gauge;
    const color = colourCode(colourText);
    const gauge = sizeOf(sizeText);
    if (colourText && !color) issues.push({ kind: 'colour', net: net.name, value: colourText });
    if (sizeText && !gauge) issues.push({ kind: 'size', net: net.name, value: sizeText });
    wires.push({ name: String(name).replace(/\.\d+$/, ''), from: ends[0].tag, fromPin: ends[0].pin, to: ends[1].tag, toPin: ends[1].pin, color: color ?? 'BK', gauge: gauge ?? 0.5, net: net.name });
  }
  // Wire names must be unique in the harness: a repeated one gets a suffix.
  const count = new Map();
  for (const w of wires) { const n = (count.get(w.name) ?? 0) + 1; count.set(w.name, n); if (n > 1) w.name = `${w.name}-${n}`; }
  return { wires, issues };
}

/**
 * The harness wires after taking the schematic in: the schematic's wires, keeping what the harness had for the same
 * pair of pins that the schematic does not say (the clips a wire passes, `via`). Wires only in the harness go.
 */
export function mergeHarnessWires(harnessWires, fromSchematic) {
  const old = new Map((harnessWires ?? []).map((w) => [pairKey(w), w]));
  return fromSchematic.map((w) => {
    const o = old.get(pairKey(w));
    const out = { name: w.name, from: w.from, fromPin: w.fromPin, to: w.to, toPin: w.toPin, color: w.color, gauge: w.gauge };
    if (o?.via?.length) out.via = Array.isArray(o.via) ? o.via.slice() : o.via;
    return out;
  });
}

/** Differences between what the schematic asks for and the harness wires: { missing, extra, changed, inSync }. */
export function compareHarness(sch, harness) {
  const { wires: want, issues } = harnessWiresFromSchematic(sch, harness);
  const have = new Map((harness?.wires ?? []).map((w) => [pairKey(w), w]));
  const wanted = new Set(want.map(pairKey));
  const missing = want.filter((w) => !have.has(pairKey(w)));
  const extra = (harness?.wires ?? []).filter((w) => !wanted.has(pairKey(w)));
  const changed = [];
  for (const w of want) {
    const h = have.get(pairKey(w)); if (!h) continue;
    if (String(h.color ?? 'BK') !== w.color) changed.push({ wire: h.name ?? w.name, field: 'color', schematic: w.color, harness: String(h.color ?? 'BK') });
    if (Number(h.gauge ?? 0.5) !== w.gauge) changed.push({ wire: h.name ?? w.name, field: 'gauge', schematic: w.gauge, harness: Number(h.gauge ?? 0.5) });
  }
  return { missing, extra, changed, issues, inSync: !missing.length && !extra.length && !changed.length };
}

/**
 * The routed lengths written on the schematic: every schematic wire of a net carried by a harness wire gets that
 * wire's length (mm, 0.1) in `length` and the harness wire's name in `harnessWire`; others lose them. `routed` is the
 * harness model's wires ({ from, fromPin, to, toPin, length, name }). Returns the number of nets given a length.
 */
export function backAnnotate(sch, harness, routed) {
  const { wires: want } = harnessWiresFromSchematic(sch, harness);
  const lengthOf = new Map(routed.map((w) => [pairKey(w), w]));
  const byNet = new Map();
  for (const w of want) { const r = lengthOf.get(pairKey(w)); if (r) byNet.set(w.net, r); }
  for (const w of sch.wires) { delete w.length; delete w.harnessWire; }
  let n = 0;
  for (const net of nets(sch)) {
    const r = byNet.get(net.name); if (!r) continue;
    n++;
    for (const id of net.wires) { const w = sch.wires.find((x) => x.id === id); if (w) { w.length = Math.round(r.length * 10) / 10; w.harnessWire = r.name; } }
  }
  return n;
}

/** The harness routes of a project: [{ part, feature }] (route features of kind 'harness'). */
export function harnessesOf(project) {
  return (project?.parts ?? []).flatMap((part) => (part.features ?? []).filter((f) => f.type === 'route' && f.kind === 'harness').map((feature) => ({ part, feature })));
}
