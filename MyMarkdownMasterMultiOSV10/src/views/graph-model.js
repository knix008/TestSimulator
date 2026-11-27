// The graph view's pure part (no DOM, Node-testable): the options, which nodes and links the vault's index
// gives under those options (Obsidian's graph filters, groups and local graph), a fallback query matcher,
// and the force simulation (centre, Barnes-Hut repulsion, links) that lays the nodes out.
import { nameOf, kindOf, fileNameOf } from '../vault/index.js';

// ───────── options

export const DEFAULT_OPTIONS = Object.freeze({
  collapsed: false,
  sections: { filters: true, groups: false, display: false, forces: false },
  // Filters
  search: '',
  showTags: false,
  showAttachments: false,
  existingOnly: false,
  showOrphans: true,
  // Local graph
  depth: 1,
  incoming: true,
  outgoing: true,
  neighbors: false,
  // Groups: [{ query, color: '#rrggbb' }]
  groups: [],
  // Display
  arrows: false,
  textFade: 0,
  nodeSize: 1,
  lineSize: 1,
  // Forces
  centerStrength: 0.52,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250,
});

/** [key, min, max] of every number option (the sliders' ranges). */
export const RANGES = {
  depth: [1, 5, 1], textFade: [-3, 3, 0.1], nodeSize: [0.1, 5, 0.1], lineSize: [0.1, 5, 0.1],
  centerStrength: [0, 1, 0.01], repelStrength: [0, 20, 0.1], linkStrength: [0, 1, 0.01], linkDistance: [30, 500, 1],
};

const clampNum = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** A complete, valid options object from whatever was stored (null, old or hand-edited). */
export function normalizeOptions(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [key, dflt] of Object.entries(DEFAULT_OPTIONS)) {
    if (key === 'sections') out.sections = { ...dflt, ...(src.sections && typeof src.sections === 'object' ? Object.fromEntries(Object.entries(src.sections).filter(([k]) => k in dflt).map(([k, v]) => [k, !!v])) : {}) };
    else if (key === 'groups') out.groups = (Array.isArray(src.groups) ? src.groups : []).filter((g) => g && typeof g === 'object').slice(0, 50).map((g) => ({ query: String(g.query ?? ''), color: isHex(g.color) ? g.color.toLowerCase() : '#7c8ea8' }));
    else if (typeof dflt === 'boolean') out[key] = key in src ? !!src[key] : dflt;
    else if (typeof dflt === 'string') out[key] = typeof src[key] === 'string' ? src[key] : dflt;
    else if (RANGES[key]) out[key] = clampNum(src[key], RANGES[key][0], RANGES[key][1], dflt);
    else out[key] = dflt;
  }
  out.depth = Math.round(out.depth);
  return out;
}

// ───────── query matching (fallback when the app has no search engine)

/** Splits a query into terms; "quoted text" stays one term. */
function terms(query) {
  const out = [];
  const re = /(-?)(?:(\w+):)?(?:"([^"]*)"|(\S+))/g;
  for (const m of String(query ?? '').matchAll(re)) {
    const value = (m[3] ?? m[4] ?? '').toLowerCase();
    if (!value && !m[2]) continue;
    out.push({ negate: m[1] === '-', op: (m[2] ?? '').toLowerCase(), value });
  }
  return out;
}

/**
 * Does `path` match `query`? Terms are ANDed; `-term` negates; `path:x` (path contains x), `file:x`
 * (file name contains x), `tag:#x` / `tag:x` (the note has tag x or a nested x/… tag); anything else is a
 * case-insensitive substring of the path. `tagsOf(path)` gives the note's tags ('#x').
 */
export function defaultMatch(query, path, tagsOf = () => []) {
  const list = terms(query);
  if (!list.length) return true;
  const p = String(path ?? '').toLowerCase();
  let tags = null;
  for (const { negate, op, value } of list) {
    let hit;
    if (op === 'tag') {
      tags ??= (tagsOf(path) ?? []).map((x) => String(x).toLowerCase().replace(/^#/, ''));
      const v = value.replace(/^#/, '');
      hit = tags.some((x) => x === v || x.startsWith(`${v}/`));
    } else if (op === 'file') hit = fileNameOf(p).includes(value);
    else if (op === 'path') hit = p.includes(value);
    else hit = p.includes(op ? `${op}:${value}` : value);
    if (hit === negate) return false;
  }
  return true;
}

// ───────── building the graph

export const nodeId = {
  file: (path) => path,
  tag: (tag) => `tag:${String(tag).toLowerCase().replace(/^#?/, '#')}`,
  unresolved: (name) => `unresolved:${String(name).trim().toLowerCase()}`,
};

/**
 * Nodes and links of the vault under `opts`.
 * ctx: { local: path|null, matchQuery?(query, path) }.
 * Returns { nodes: [{ id, kind: 'note'|'attachment'|'tag'|'unresolved', label, path, name, mtime, degree,
 * color, depth }], links: [{ source, target }] (node indices, directed), centre: index|-1 }.
 */
export function buildGraph(index, rawOpts, ctx = {}) {
  const opts = normalizeOptions(rawOpts);
  const local = ctx.local || null;
  const tagsOf = (path) => index.meta(path)?.tags ?? [];
  const match = typeof ctx.matchQuery === 'function' ? ctx.matchQuery : (q, path) => defaultMatch(q, path, tagsOf);

  const nodes = new Map(); // id → node
  const add = (id, kind, extra) => { if (!nodes.has(id)) nodes.set(id, { id, kind, degree: 0, color: null, depth: 0, mtime: 0, path: null, name: '', label: '', ...extra }); return nodes.get(id); };
  const addFile = (path) => {
    const info = index.files.get(path);
    const kind = kindOf(path) === 'note' ? 'note' : 'attachment';
    return add(nodeId.file(path), kind, { path, label: kind === 'note' ? nameOf(path) : fileNameOf(path), mtime: info?.mtime ?? 0 });
  };

  for (const path of index.notePaths()) addFile(path);
  if (opts.showAttachments) for (const path of index.allPaths()) if (kindOf(path) !== 'note') addFile(path);
  if (local && index.files.has(local) && !nodes.has(local)) addFile(local);

  const edges = new Map(); // "a\nb" → [a, b]
  const addEdge = (a, b) => { if (a === b) return; const key = `${a}\n${b}`; if (!edges.has(key)) edges.set(key, [a, b]); };
  for (const path of index.notePaths()) {
    for (const link of index.outgoing(path)) {
      if (link.resolved) {
        if (nodes.has(link.resolved)) addEdge(path, link.resolved);
      } else if (link.target && !opts.existingOnly) {
        const name = String(link.target).trim();
        if (!name) continue;
        const id = nodeId.unresolved(name);
        add(id, 'unresolved', { name, label: name });
        addEdge(path, id);
      }
    }
    if (opts.showTags) {
      for (const tag of tagsOf(path)) {
        const id = nodeId.tag(tag);
        add(id, 'tag', { name: tag.startsWith('#') ? tag : `#${tag}`, label: tag.startsWith('#') ? tag : `#${tag}` });
        addEdge(path, id);
      }
    }
  }

  // Search: files must match; tags and unresolved names stay only when a kept file links to them.
  let keep = new Set(nodes.keys());
  if (opts.search.trim()) {
    keep = new Set();
    for (const n of nodes.values()) if (n.path && (n.path === local || match(opts.search, n.path))) keep.add(n.id);
    for (const [a, b] of edges.values()) {
      if (keep.has(a) && !nodes.get(b).path) keep.add(b);
    }
  }
  let edgeList = [...edges.values()].filter(([a, b]) => keep.has(a) && keep.has(b));

  // Local graph: breadth-first from the centre, `depth` jumps, along the allowed directions.
  const depthOf = new Map();
  if (local) {
    const centreId = nodes.has(local) ? local : null;
    if (!centreId) return { nodes: [], links: [], centre: -1, opts };
    keep.add(centreId);
    edgeList = [...edges.values()].filter(([a, b]) => keep.has(a) && keep.has(b));
    const out = new Map(); const inc = new Map();
    for (const [a, b] of edgeList) { (out.get(a) ?? out.set(a, []).get(a)).push(b); (inc.get(b) ?? inc.set(b, []).get(b)).push(a); }
    depthOf.set(centreId, 0);
    let frontier = [centreId];
    for (let d = 1; d <= opts.depth && frontier.length; d += 1) {
      const next = [];
      for (const id of frontier) {
        const around = [...(opts.outgoing ? out.get(id) ?? [] : []), ...(opts.incoming ? inc.get(id) ?? [] : [])];
        for (const other of around) if (!depthOf.has(other)) { depthOf.set(other, d); next.push(other); }
      }
      frontier = next;
    }
    keep = new Set(depthOf.keys());
    edgeList = edgeList.filter(([a, b]) => {
      if (!keep.has(a) || !keep.has(b)) return false;
      if (opts.neighbors) return true;
      const da = depthOf.get(a); const db = depthOf.get(b);
      return (opts.outgoing && da + 1 === db) || (opts.incoming && db + 1 === da);
    });
  }

  for (const [a, b] of edgeList) { nodes.get(a).degree += 1; nodes.get(b).degree += 1; }
  if (!opts.showOrphans) for (const id of [...keep]) if (nodes.get(id).degree === 0 && id !== local) keep.delete(id);

  const list = [...nodes.values()].filter((n) => keep.has(n.id));
  const at = new Map(list.map((n, i) => [n.id, i]));
  for (const n of list) {
    n.depth = depthOf.get(n.id) ?? 0;
    if (n.path) for (const g of opts.groups) if (g.query.trim() && match(g.query, n.path)) { n.color = g.color; break; }
  }
  // Tags and unresolved names appear (in the animation) with the first file that links to them.
  const links = edgeList.map(([a, b]) => ({ source: at.get(a), target: at.get(b) }));
  for (const l of links) {
    const s = list[l.source]; const t = list[l.target];
    if (!t.path && s.mtime && (!t.mtime || s.mtime < t.mtime)) t.mtime = s.mtime;
  }
  return { nodes: list, links, centre: local ? at.get(local) ?? -1 : -1, opts };
}

/** Node radius in world units: grows with the number of links (Obsidian's weight). */
export function nodeRadius(node, nodeSize = 1) {
  return nodeSize * (4 + Math.min(16, Math.sqrt(node?.degree ?? 0) * 1.8));
}

/** Text-fade zoom: labels start to show past this scale (textFade -3..3, higher = later). */
export function labelThreshold(textFade = 0) { return 0.75 * 1.4 ** textFade; }

/** Label opacity at `scale` (0 below the threshold, 1 a little above). */
export function labelAlpha(scale, textFade = 0) { const t = labelThreshold(textFade); return Math.max(0, Math.min(1, (scale - t) / (t * 0.5))); }

/** Indices in the order the animation shows them: oldest first (mtime), a file before the tags it brings, then by label. */
export function animationOrder(nodes) {
  return nodes.map((n, i) => i).sort((a, b) => (nodes[a].mtime || 0) - (nodes[b].mtime || 0) || (nodes[a].path ? 0 : 1) - (nodes[b].path ? 0 : 1) || String(nodes[a].label).localeCompare(String(nodes[b].label)));
}

/**
 * Copies positions from the previous layout by id; a new node starts next to a placed neighbour, else on
 * a small spiral around the centre (deterministic). Returns how many nodes were new.
 */
export function carryPositions(prevNodes, graph) {
  const prev = new Map((prevNodes ?? []).map((n) => [n.id, n]));
  const { nodes, links } = graph;
  let fresh = 0;
  const placed = new Array(nodes.length).fill(false);
  nodes.forEach((n, i) => {
    const p = prev.get(n.id);
    if (p && Number.isFinite(p.x)) { n.x = p.x; n.y = p.y; n.vx = p.vx ?? 0; n.vy = p.vy ?? 0; placed[i] = true; } else { n.vx = 0; n.vy = 0; }
    n.fx = null; n.fy = null;
  });
  const nbrs = nodes.map(() => []);
  for (const l of links) { nbrs[l.source].push(l.target); nbrs[l.target].push(l.source); }
  nodes.forEach((n, i) => {
    if (placed[i]) return;
    fresh += 1;
    const anchor = nbrs[i].find((j) => placed[j]);
    const a = i * 2.399963; // golden angle
    if (anchor != null) { n.x = nodes[anchor].x + Math.cos(a) * 20; n.y = nodes[anchor].y + Math.sin(a) * 20; } else {
      const r = 10 * Math.sqrt(i + 0.5);
      n.x = Math.cos(a) * r; n.y = Math.sin(a) * r;
    }
    placed[i] = true;
  });
  return fresh;
}

// ───────── force simulation

/** Obsidian's slider values → force constants in world units. */
export function forceParams(opts) {
  const o = normalizeOptions(opts);
  return {
    center: o.centerStrength * 0.1,
    repel: -o.repelStrength * 30,
    link: o.linkStrength,
    distance: o.linkDistance * 0.2,
  };
}

/**
 * Barnes-Hut quadtree over the nodes (skipping `hidden`), as flat arrays for speed. Each cell: centre of
 * mass (cx, cy), mass, bounds, four children (-1 = none), a leaf node index (-1 = internal or empty).
 */
export function buildQuadtree(nodes) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const n of nodes) { if (n.hidden) continue; if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x; if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y; }
  if (minX === Infinity) return null;
  const size = Math.max(maxX - minX, maxY - minY, 1) * 1.0001;
  const cap = nodes.length * 4 + 8;
  const t = {
    x0: new Float64Array(cap), y0: new Float64Array(cap), w: new Float64Array(cap),
    cx: new Float64Array(cap), cy: new Float64Array(cap), mass: new Float64Array(cap),
    child: new Int32Array(cap * 4).fill(-1), leaf: new Int32Array(cap).fill(-1), next: new Int32Array(cap).fill(-1), count: 1,
  };
  const grow = () => {
    const n = t.x0.length * 2;
    for (const k of ['x0', 'y0', 'w', 'cx', 'cy', 'mass']) { const a = new Float64Array(n); a.set(t[k]); t[k] = a; }
    const c = new Int32Array(n * 4).fill(-1); c.set(t.child); t.child = c;
    const l = new Int32Array(n).fill(-1); l.set(t.leaf); t.leaf = l;
    const x = new Int32Array(n).fill(-1); x.set(t.next); t.next = x;
  };
  const cell = (x0, y0, w) => { if (t.count >= t.x0.length) grow(); const c = t.count; t.count += 1; t.x0[c] = x0; t.y0[c] = y0; t.w[c] = w; return c; };
  t.x0[0] = minX; t.y0[0] = minY; t.w[0] = size;
  // Nodes at the same point share a leaf through a chain (`chain` links node → next node in the leaf).
  const chain = new Int32Array(nodes.length).fill(-1);
  const quadOf = (c, x, y) => { const h = t.w[c] / 2; return (x >= t.x0[c] + h ? 1 : 0) + (y >= t.y0[c] + h ? 2 : 0); };
  const childCell = (c, q) => { const h = t.w[c] / 2; return cell(t.x0[c] + (q & 1 ? h : 0), t.y0[c] + (q & 2 ? h : 0), h); };
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.hidden) continue;
    let c = 0;
    for (let guard = 0; ; guard += 1) {
      if (t.leaf[c] >= 0) {
        const j = t.leaf[c];
        const m = nodes[j];
        if ((m.x === n.x && m.y === n.y) || guard > 48 || t.w[c] < 1e-6) { chain[i] = chain[j]; chain[j] = i; break; }
        // Split: push the leaf's node(s) down.
        t.leaf[c] = -1;
        const q = quadOf(c, m.x, m.y);
        const d = childCell(c, q);
        t.child[c * 4 + q] = d;
        t.leaf[d] = j;
      }
      const q = quadOf(c, n.x, n.y);
      const d = t.child[c * 4 + q];
      if (d < 0) {
        const e = childCell(c, q);
        t.child[c * 4 + q] = e;
        t.leaf[e] = i;
        break;
      }
      c = d;
    }
  }
  // Root may itself be an empty internal cell with one leaf child: fine. Accumulate masses bottom-up.
  const accumulate = (c) => {
    let m = 0; let sx = 0; let sy = 0;
    if (t.leaf[c] >= 0) {
      for (let j = t.leaf[c]; j >= 0; j = chain[j]) { m += 1; sx += nodes[j].x; sy += nodes[j].y; }
    } else {
      for (let q = 0; q < 4; q += 1) {
        const d = t.child[c * 4 + q];
        if (d < 0) continue;
        accumulate(d);
        m += t.mass[d]; sx += t.cx[d] * t.mass[d]; sy += t.cy[d] * t.mass[d];
      }
    }
    t.mass[c] = m; t.cx[c] = m ? sx / m : 0; t.cy[c] = m ? sy / m : 0;
  };
  accumulate(0);
  t.chain = chain;
  return t;
}

/**
 * Adds the repulsion on every visible node to its velocity: strength / distance (d3's many-body),
 * approximated far away by cell centres of mass (theta). Returns the tree (for tests).
 */
export function applyRepulsion(nodes, strength, alpha, theta = 0.9) {
  const t = buildQuadtree(nodes);
  if (!t || !strength) return t;
  const theta2 = theta * theta;
  const stack = new Int32Array(t.count + 8);
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.hidden) continue;
    let sp = 0; stack[sp++] = 0;
    let fx = 0; let fy = 0;
    while (sp) {
      const c = stack[--sp];
      if (!t.mass[c]) continue;
      let dx = t.cx[c] - n.x; let dy = t.cy[c] - n.y;
      let d2 = dx * dx + dy * dy;
      const w = t.w[c];
      const inside = n.x >= t.x0[c] && n.x <= t.x0[c] + w && n.y >= t.y0[c] && n.y <= t.y0[c] + w;
      if (t.leaf[c] < 0 && !inside && (w * w) / theta2 < d2) {
        fx += dx * t.mass[c] / d2; fy += dy * t.mass[c] / d2;
        continue;
      }
      if (t.leaf[c] >= 0) {
        for (let j = t.leaf[c]; j >= 0; j = t.chain[j]) {
          if (j === i) continue;
          const m = nodes[j];
          dx = m.x - n.x; dy = m.y - n.y; d2 = dx * dx + dy * dy;
          if (d2 === 0) { dx = jiggle(i, j); dy = jiggle(j, i); d2 = dx * dx + dy * dy; }
          if (d2 < 1) d2 = Math.sqrt(d2);
          fx += dx / d2; fy += dy / d2;
        }
        continue;
      }
      for (let q = 0; q < 4; q += 1) { const d = t.child[c * 4 + q]; if (d >= 0) stack[sp++] = d; }
    }
    n.vx += fx * strength * alpha;
    n.vy += fy * strength * alpha;
  }
  return t;
}
const jiggle = (a, b) => (((a * 9301 + b * 49297) % 233280) / 233280 - 0.5) * 1e-3;

/** The repulsion by brute force (tests compare the quadtree with it). */
export function bruteRepulsion(nodes, strength, alpha) {
  for (let i = 0; i < nodes.length; i += 1) {
    let fx = 0; let fy = 0;
    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) continue;
      const dx = nodes[j].x - nodes[i].x; const dy = nodes[j].y - nodes[i].y;
      let d2 = dx * dx + dy * dy; if (d2 < 1) d2 = Math.sqrt(d2 || 1e-6);
      fx += dx / d2; fy += dy / d2;
    }
    nodes[i].vx += fx * strength * alpha; nodes[i].vy += fy * strength * alpha;
  }
}

/**
 * The layout: call `tick()` until `alpha < alphaMin`. `reheat(a)` wakes it (a change, a drag);
 * `alphaTarget` > 0 keeps it warm while a node is dragged. Pinned nodes (fx/fy) stay put; hidden nodes
 * (the animation) take no part.
 */
export class Simulation {
  constructor(graph = { nodes: [], links: [] }, opts = DEFAULT_OPTIONS) {
    this.alpha = 1;
    this.alphaMin = 0.002;
    this.alphaDecay = 1 - this.alphaMin ** (1 / 300);
    this.alphaTarget = 0;
    this.velocityDecay = 0.4;
    this.setGraph(graph);
    this.setOptions(opts);
  }
  setGraph(graph) {
    this.nodes = graph.nodes;
    this.links = graph.links;
    const count = new Float64Array(this.nodes.length);
    for (const l of this.links) { count[l.source] += 1; count[l.target] += 1; }
    this.bias = this.links.map((l) => count[l.source] / (count[l.source] + count[l.target]));
    this.linkK = this.links.map((l) => 1 / Math.max(1, Math.min(count[l.source], count[l.target])));
  }
  setOptions(opts) { this.params = forceParams(opts); }
  get active() { return this.alpha >= this.alphaMin || this.alphaTarget > 0; }
  reheat(alpha = 0.3) { this.alpha = Math.max(this.alpha, alpha); }
  tick() {
    const { nodes, links } = this;
    const p = this.params;
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    const alpha = this.alpha;
    // Links (d3's forceLink: springs to `distance`, the lighter end moving more).
    for (let k = 0; k < links.length; k += 1) {
      const s = nodes[links[k].source]; const t = nodes[links[k].target];
      if (s.hidden || t.hidden) continue;
      let dx = t.x + t.vx - s.x - s.vx; let dy = t.y + t.vy - s.y - s.vy;
      if (!dx && !dy) { dx = jiggle(k, 1); dy = jiggle(1, k); }
      let l = Math.sqrt(dx * dx + dy * dy);
      l = ((l - p.distance) / l) * alpha * p.link * this.linkK[k];
      dx *= l; dy *= l;
      const b = this.bias[k];
      t.vx -= dx * b; t.vy -= dy * b;
      s.vx += dx * (1 - b); s.vy += dy * (1 - b);
    }
    applyRepulsion(nodes, p.repel, alpha);
    // Centre: every node is pulled to (0, 0) (forceX + forceY), so loose islands stay near the rest.
    for (const n of nodes) {
      if (n.hidden) continue;
      n.vx -= n.x * p.center * alpha;
      n.vy -= n.y * p.center * alpha;
    }
    let moved = 0;
    for (const n of nodes) {
      if (n.hidden) continue;
      if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
      n.vx *= 1 - this.velocityDecay; n.vy *= 1 - this.velocityDecay;
      const v2 = n.vx * n.vx + n.vy * n.vy;
      if (v2 > 1e6) { const s = 1000 / Math.sqrt(v2); n.vx *= s; n.vy *= s; }
      n.x += n.vx; n.y += n.vy;
      moved += Math.abs(n.vx) + Math.abs(n.vy);
    }
    return moved;
  }
}

/** Bounds of the visible nodes (with radius): { minX, minY, maxX, maxY } or null. */
export function graphBounds(nodes, nodeSize = 1) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const n of nodes) {
    if (n.hidden) continue;
    const r = nodeRadius(n, nodeSize);
    minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r); minY = Math.min(minY, n.y - r); maxY = Math.max(maxY, n.y + r);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** The view (scale, tx, ty: screen = t + world × scale) that fits `bounds` into width × height. */
export function fitView(bounds, width, height, { padding = 40, maxScale = 2, minScale = 0.02 } = {}) {
  if (!bounds || width <= 0 || height <= 0) return { scale: 1, tx: width / 2, ty: height / 2 };
  const w = Math.max(1, bounds.maxX - bounds.minX); const h = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.max(minScale, Math.min(maxScale, Math.min((width - padding * 2) / w, (height - padding * 2) / h)));
  const cx = (bounds.minX + bounds.maxX) / 2; const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale };
}
