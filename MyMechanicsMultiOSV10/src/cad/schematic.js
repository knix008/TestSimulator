// 2D electrical schematics (no DOM): symbols with pins on a grid, wires between pins (orthogonal, with corner points),
// nets found from what the wires join, wire numbers, a from–to (connection) list, a parts list, and the sheet as SVG.
//
// project.schematics = [{ id, name, sheet: 'A3' | 'A4', symbols: [{ id, kind, tag, x, y, rot (0|90|180|270), value,
//   pins (connectors / terminal blocks: count) }], wires: [{ id, a: { sym, pin }, b: { sym, pin }, points: [[x, y]]
//   (corners between the pins), number (empty = automatic), color, gauge }] }]   (coordinates in mm, y down)

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = (v) => Math.round(v * 100) / 100;
export const GRID = 5;

/**
 * Symbol kinds: { prefix (the tag's letters, IEC 81346), pins: [{ id, x, y }] (in the symbol's own frame, mm), body
 * (SVG of the symbol in its frame), w, h }. Connectors and terminal blocks have as many pins as `pins` says.
 */
export const SYMBOLS = {
  resistor: { prefix: 'R', pins: [{ id: '1', x: -10, y: 0 }, { id: '2', x: 10, y: 0 }], body: '<path d="M-10 0h3M7 0h3"/><rect x="-7" y="-2.5" width="14" height="5"/>' },
  fuse: { prefix: 'F', pins: [{ id: '1', x: -10, y: 0 }, { id: '2', x: 10, y: 0 }], body: '<path d="M-10 0h20"/><rect x="-6" y="-2.5" width="12" height="5"/>' },
  diode: { prefix: 'V', pins: [{ id: 'A', x: -10, y: 0 }, { id: 'K', x: 10, y: 0 }], body: '<path d="M-10 0h7M3 0h7M-3 -4v8l6 -4z M3 -4v8"/>' },
  lamp: { prefix: 'P', pins: [{ id: 'X1', x: -10, y: 0 }, { id: 'X2', x: 10, y: 0 }], body: '<path d="M-10 0h5M5 0h5"/><circle r="5"/><path d="M-3.5 -3.5l7 7M3.5 -3.5l-7 7"/>' },
  motor: { prefix: 'M', pins: [{ id: 'U', x: -10, y: 0 }, { id: 'V', x: 10, y: 0 }], body: '<path d="M-10 0h4M6 0h4"/><circle r="6"/><text y="2.2" font-size="6" text-anchor="middle" stroke="none" fill="currentColor">M</text>' },
  switch: { prefix: 'S', pins: [{ id: '13', x: -10, y: 0 }, { id: '14', x: 10, y: 0 }], body: '<path d="M-10 0h5M5 0h5M-5 0l9 -5"/><circle cx="-5" r="0.8"/><circle cx="5" r="0.8"/>' },
  pushbutton: { prefix: 'S', pins: [{ id: '13', x: -10, y: 0 }, { id: '14', x: 10, y: 0 }], body: '<path d="M-10 0h5M5 0h5M-5 -3h10M0 -3v-5M-2 -8h4"/><circle cx="-5" r="0.8"/><circle cx="5" r="0.8"/>' },
  coil: { prefix: 'K', pins: [{ id: 'A1', x: 0, y: -10 }, { id: 'A2', x: 0, y: 10 }], body: '<path d="M0 -10v6M0 4v6"/><rect x="-6" y="-4" width="12" height="8"/>' },
  contact: { prefix: 'K', pins: [{ id: '13', x: 0, y: -10 }, { id: '14', x: 0, y: 10 }], body: '<path d="M0 -10v5M0 5v5M0 -5l-5 9"/>' },
  supply: { prefix: 'G', pins: [{ id: '+', x: 0, y: 10 }], body: '<path d="M0 10v-6M-5 -4h10"/>' },
  ground: { prefix: 'PE', pins: [{ id: 'PE', x: 0, y: -10 }], body: '<path d="M0 -10v8M-6 -2h12M-4 1h8M-2 4h4"/>' },
  connector: { prefix: 'X', variable: true },
  terminal: { prefix: 'XT', variable: true },
};

/** The pins of a symbol in its own frame (connectors and terminal blocks: a column of `pins`, 5 mm apart). */
export function symbolPins(sym) {
  const def = SYMBOLS[sym.kind];
  if (!def) return [];
  if (!def.variable) return def.pins;
  const n = Math.max(1, Math.min(64, Math.round(sym.pins ?? 4)));
  return Array.from({ length: n }, (_, i) => ({ id: String(i + 1), x: sym.kind === 'terminal' ? 0 : 7.5, y: (i - (n - 1) / 2) * GRID }));
}

/** A point of a symbol's frame on the sheet (rotation in 90° steps, then the symbol's position). */
export function toSheet(sym, p) {
  const r = (((sym.rot ?? 0) % 360) + 360) % 360;
  const [x, y] = r === 90 ? [-p.y, p.x] : r === 180 ? [-p.x, -p.y] : r === 270 ? [p.y, -p.x] : [p.x, p.y];
  return [sym.x + x, sym.y + y];
}

/** A pin's position on the sheet, or null. */
export function pinAt(sch, ref) {
  const s = sch.symbols.find((x) => x.id === ref.sym);
  const p = s && symbolPins(s).find((x) => x.id === ref.pin);
  return p ? toSheet(s, p) : null;
}

/** A wire's polyline on the sheet: its first pin, its corner points, its second pin. */
export function wirePath(sch, w) {
  const a = pinAt(sch, w.a); const b = pinAt(sch, w.b);
  return a && b ? [a, ...(w.points ?? []), b] : null;
}

/** Orthogonal corner points between two pins (one bend: horizontal first, unless the pins share x or y). */
export function autoRoute(a, b) {
  if (Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9) return [];
  return [[b[0], a[1]]];
}

/** The next free tag for a kind: prefix + the lowest number not used (K1, K2, …). */
export function nextTag(sch, kind) {
  const prefix = SYMBOLS[kind]?.prefix ?? 'X';
  const used = new Set(sch.symbols.map((s) => s.tag));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** A new empty schematic. */
export function createSchematic(id, name) { return { id, name, sheet: 'A3', symbols: [], wires: [] }; }

/**
 * The nets: groups of pins the wires join (a wire joins its two pins; a supply's pins with the same value are one
 * net, as are all the ground symbols). Returns [{ id, name, pins: [{ sym, pin, tag }], wires: [wireId] }] sorted by
 * name; `name` is a supply's value or the ground's 'PE' when the net has one, else 'N' + its order.
 */
export function nets(sch) {
  const key = (r) => `${r.sym}:${r.pin}`;
  const parent = new Map();
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const join = (a, b) => { parent.set(find(a), find(b)); };
  for (const s of sch.symbols) for (const p of symbolPins(s)) parent.set(key({ sym: s.id, pin: p.id }), key({ sym: s.id, pin: p.id }));
  for (const w of sch.wires) { if (parent.has(key(w.a)) && parent.has(key(w.b))) join(key(w.a), key(w.b)); }
  // Supplies of the same value and all grounds are connected by name.
  const byName = new Map();
  for (const s of sch.symbols) {
    if (s.kind !== 'supply' && s.kind !== 'ground') continue;
    const name = s.kind === 'ground' ? 'PE' : String(s.value || '+24V');
    const k = key({ sym: s.id, pin: symbolPins(s)[0].id });
    if (byName.has(name)) join(k, byName.get(name)); else byName.set(name, k);
  }
  const groups = new Map();
  for (const k of parent.keys()) { const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); }
  const tagOf = new Map(sch.symbols.map((s) => [s.id, s.tag]));
  const out = [];
  for (const members of groups.values()) {
    const pins = members.map((k) => { const [sym, pin] = k.split(':'); return { sym, pin, tag: tagOf.get(sym) }; });
    const wires = sch.wires.filter((w) => members.includes(key(w.a))).map((w) => w.id);
    if (pins.length < 2 && !wires.length) continue;
    const named = sch.symbols.find((s) => (s.kind === 'supply' || s.kind === 'ground') && members.includes(key({ sym: s.id, pin: symbolPins(s)[0].id })));
    out.push({ id: members[0], name: named ? (named.kind === 'ground' ? 'PE' : String(named.value || '+24V')) : null, pins, wires });
  }
  let n = 0;
  out.sort((a, b) => (a.pins[0].tag ?? '').localeCompare(b.pins[0].tag ?? '', 'en', { numeric: true }) || a.pins[0].pin.localeCompare(b.pins[0].pin, 'en', { numeric: true }));
  for (const net of out) if (!net.name) net.name = `N${++n}`;
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

/** Wire numbers: a wire's own number, else its net's name with a running suffix when the net has several wires. */
export function wireNumbers(sch) {
  const out = new Map();
  for (const net of nets(sch)) {
    net.wires.forEach((id, i) => {
      const w = sch.wires.find((x) => x.id === id);
      out.set(id, w?.number || (net.wires.length > 1 ? `${net.name}.${i + 1}` : net.name));
    });
  }
  return out;
}

/** The from–to list: one row per wire { number, from: 'K1:A1', to: 'X1:3', net, color, gauge, length (the routed 3D harness length, mm, when linked) }, sorted by number. */
export function fromTo(sch) {
  const numbers = wireNumbers(sch);
  const netOf = new Map(); for (const n of nets(sch)) for (const w of n.wires) netOf.set(w, n.name);
  const tag = (r) => `${sch.symbols.find((s) => s.id === r.sym)?.tag ?? '?'}:${r.pin}`;
  return sch.wires.map((w) => ({ number: numbers.get(w.id), from: tag(w.a), to: tag(w.b), net: netOf.get(w.id), color: w.color ?? '', gauge: w.gauge ?? '', length: w.length ?? '' }))
    .sort((a, b) => String(a.number).localeCompare(String(b.number), 'en', { numeric: true }));
}

/** The parts list: one row per symbol (supplies and grounds are not parts) { tag, kind, value, pins }. */
export function schematicBom(sch) {
  return sch.symbols.filter((s) => s.kind !== 'supply' && s.kind !== 'ground')
    .map((s) => ({ tag: s.tag, kind: s.kind, value: s.value ?? '', pins: symbolPins(s).length }))
    .sort((a, b) => a.tag.localeCompare(b.tag, 'en', { numeric: true }));
}

/** Problems: wires to missing pins, pins with nothing on them (connectors and terminals excepted), duplicate tags. */
export function checkSchematic(sch) {
  const issues = [];
  const tags = new Map();
  for (const s of sch.symbols) { if (tags.has(s.tag)) issues.push({ kind: 'duplicate-tag', tag: s.tag }); tags.set(s.tag, s.id); }
  for (const w of sch.wires) for (const end of [w.a, w.b]) if (!pinAt(sch, end)) issues.push({ kind: 'dangling-wire', wire: w.id });
  const used = new Set(sch.wires.flatMap((w) => [`${w.a.sym}:${w.a.pin}`, `${w.b.sym}:${w.b.pin}`]));
  for (const s of sch.symbols) {
    if (SYMBOLS[s.kind]?.variable || s.kind === 'supply' || s.kind === 'ground') continue;
    for (const p of symbolPins(s)) if (!used.has(`${s.id}:${p.id}`)) issues.push({ kind: 'open-pin', tag: s.tag, pin: p.id });
  }
  return issues;
}

/** The sheet as SVG (mm): a frame and title block, the symbols with their tags and pin names, the wires with numbers. */
export function schematicSvg(sch, { selected = null, grid = false, labels = { title: 'Schematic' } } = {}) {
  const [W, H] = sch.sheet === 'A4' ? [297, 210] : [420, 297];
  const numbers = wireNumbers(sch);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="Roboto, sans-serif">`, `<rect width="${W}" height="${H}" fill="#fff"/>`];
  if (grid) { out.push('<g class="grid" stroke="#e5e7eb" stroke-width="0.15">'); for (let x = 10; x < W - 10; x += GRID * 2) out.push(`<path d="M${x} 10V${H - 10}"/>`); for (let y = 10; y < H - 10; y += GRID * 2) out.push(`<path d="M10 ${y}H${W - 10}"/>`); out.push('</g>'); }
  out.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#111" stroke-width="0.5"/>`);
  out.push(`<g class="title" font-size="3.5"><rect x="${W - 130}" y="${H - 30}" width="120" height="20" fill="none" stroke="#111" stroke-width="0.35"/><text x="${W - 126}" y="${H - 22}" font-weight="bold" font-size="5">${esc(sch.name)}</text><text x="${W - 126}" y="${H - 14}">${esc(labels.title)}</text></g>`);
  for (const w of sch.wires) {
    const path = wirePath(sch, w); if (!path) continue;
    const d = path.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`).join('');
    // The number on the longest segment (clear of the pins): above a horizontal run, right of a vertical one.
    let a = path[0], b = path[1] ?? path[0];
    for (let i = 1; i < path.length; i++) if (Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) > Math.hypot(b[0] - a[0], b[1] - a[1])) { a = path[i - 1]; b = path[i]; }
    const vertical = Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) > 1e-9;
    const tx = vertical ? a[0] + 1 : (a[0] + b[0]) / 2, ty = vertical ? (a[1] + b[1]) / 2 + 0.9 : a[1] - 1;
    out.push(`<g class="wire${selected === w.id ? ' selected' : ''}" data-wire="${esc(w.id)}"><path d="${d}" fill="none" stroke="${selected === w.id ? '#2563eb' : '#111'}" stroke-width="0.35"/><text x="${r2(tx)}" y="${r2(ty)}" font-size="2.6" text-anchor="${vertical ? 'start' : 'middle'}" fill="#2563eb">${esc(numbers.get(w.id) ?? '')}</text></g>`);
  }
  for (const s of sch.symbols) {
    const def = SYMBOLS[s.kind]; if (!def) continue;
    const pins = symbolPins(s);
    const sel = selected === s.id;
    out.push(`<g class="symbol${sel ? ' selected' : ''}" data-symbol="${esc(s.id)}" transform="translate(${r2(s.x)} ${r2(s.y)}) rotate(${s.rot ?? 0})" fill="none" stroke="${sel ? '#2563eb' : '#111'}" stroke-width="0.35" color="${sel ? '#2563eb' : '#111'}">`);
    if (def.variable) {
      const n = pins.length; const h = n * GRID;
      out.push(`<rect x="-5" y="${r2(-h / 2)}" width="10" height="${h}"/>`);
      for (const p of pins) out.push(`<path d="M${s.kind === 'terminal' ? -5 : 5} ${r2(p.y)}h2.5"/><text x="${s.kind === 'terminal' ? 0 : 0}" y="${r2(p.y + 1)}" font-size="2.4" text-anchor="middle" stroke="none" fill="currentColor">${esc(p.id)}</text>`);
    } else {
      out.push(def.body);
      for (const p of pins) out.push(`<text x="${r2(p.x + (p.x < 0 ? 1 : p.x > 0 ? -1 : 1.5))}" y="${r2(p.y + (p.y < 0 ? 3 : p.y > 0 ? -1.5 : -1.5))}" font-size="2" text-anchor="${p.x < 0 ? 'start' : p.x > 0 ? 'end' : 'start'}" stroke="none" fill="currentColor">${esc(p.id)}</text>`);
    }
    out.push('</g>');
    for (const p of pins) { const [x, y] = toSheet(s, p); out.push(`<circle class="pin" data-pin="${esc(s.id)}:${esc(p.id)}" cx="${r2(x)}" cy="${r2(y)}" r="0.7" fill="#111"/>`); }
    // The tag (and value) clear of the leads and pin names: left of a symbol drawn vertically (its pins one above the
    // other on the sheet), above one drawn horizontally, right of a ground.
    const label = `${s.tag}${s.value ? ` ${s.value}` : ''}`;
    const at = pins.map((p) => toSheet(s, p));
    const upright = !def.variable && at.length > 1 && at.every((p) => Math.abs(p[0] - at[0][0]) < 1e-9);
    const [lx, ly, anchor] = s.kind === 'ground' ? [s.x + 7, s.y + 2, 'start']
      : def.variable ? [s.x, s.y - pins.length * GRID / 2 - 2, 'middle']
      : upright ? [s.x - 7.5, s.y + 1, 'end']
      : [s.x, s.y - (s.kind === 'pushbutton' ? 10 : s.kind === 'supply' ? 6 : 7), 'middle'];
    out.push(`<text class="tag" x="${r2(lx)}" y="${r2(ly)}" font-size="3" text-anchor="${anchor}" fill="${sel ? '#2563eb' : '#111'}">${esc(label)}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

/** From–to list as CSV (RFC 4180). */
export function fromToCsv(sch) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return ['Wire,From,To,Net,Color,Gauge,Length', ...fromTo(sch).map((r) => [r.number, r.from, r.to, r.net, r.color, r.gauge, r.length].map(q).join(','))].join('\n') + '\n';
}
