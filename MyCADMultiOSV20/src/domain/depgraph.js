// Std_DependencyGraph: which object follows which — clones their source,
// assembly parts their base, constrained geometry each other, bound values
// the spreadsheet or a variable set, and members their group.

/**
 * Nodes (objects that take part in a dependency) and edges { from, to, kind }:
 * `to` depends on `from`. labelOf(entity) names an entity.
 */
export function dependencyEdges(drawing, labelOf = (entity) => entity.name || entity.type) {
  const nodes = [];
  const index = new Map();
  const node = (key, label, kind) => {
    if (!index.has(key)) { index.set(key, nodes.length); nodes.push({ key, label, kind }); }
    return index.get(key);
  };
  const entityNode = (id) => {
    const entity = drawing.entities.find((e) => e.id === id);
    return entity ? node(id, `${labelOf(entity)} (${id.slice(0, 6)})`, 'entity') : null;
  };
  const edges = [];
  const seen = new Set();
  const edge = (from, to, kind) => {
    if (from == null || to == null || from === to) return;
    const key = `${from}>${to}>${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };
  for (const entity of drawing.entities) {
    if (entity.clone?.of) edge(entityNode(entity.clone.of), entityNode(entity.id), 'clone');
    if (entity.bind) {
      const usesSheet = Object.values(entity.bind).some((expr) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr) || drawing.spreadsheet);
      if (usesSheet && drawing.spreadsheet) edge(node('spreadsheet', 'Spreadsheet', 'sheet'), entityNode(entity.id), 'expression');
      for (const set of drawing.varSets ?? []) {
        if (Object.values(entity.bind).some((expr) => set.variables.some((v) => new RegExp(`\\b${v.name}\\b`).test(expr)))) edge(node(`varset:${set.id}`, set.name, 'varset'), entityNode(entity.id), 'expression');
      }
    }
    if (entity.group) {
      const group = drawing.groups?.find((g) => g.id === entity.group);
      if (group) edge(node(`group:${group.id}`, group.name, 'group'), entityNode(entity.id), 'group');
    }
  }
  for (const group of drawing.groups ?? []) {
    if (group.parent) {
      const parent = drawing.groups.find((g) => g.id === group.parent);
      if (parent) edge(node(`group:${parent.id}`, parent.name, 'group'), node(`group:${group.id}`, group.name, 'group'), 'group');
    }
  }
  for (const joint of drawing.joints ?? []) edge(entityNode(joint.base), entityNode(joint.part), 'joint');
  for (const constraint of drawing.constraints ?? []) {
    const ids = [...new Set(constraint.refs.map((r) => r.id))];
    for (let i = 1; i < ids.length; i++) edge(entityNode(ids[0]), entityNode(ids[i]), 'constraint');
  }
  return { nodes, edges };
}

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The graph as SVG: sources on the left, what follows them in columns to the right. */
export function graphSvg({ nodes, edges }) {
  const depth = nodes.map(() => 0);
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const e of edges) if (depth[e.to] < depth[e.from] + 1 && depth[e.from] + 1 < nodes.length) { depth[e.to] = depth[e.from] + 1; moved = true; }
    if (!moved) break;
  }
  const columns = [];
  nodes.forEach((n, i) => (columns[depth[i]] ??= []).push(i));
  const w = 200; const h = 34; const gx = 70; const gy = 16;
  const pos = new Map();
  columns.forEach((list, c) => list.forEach((i, r) => pos.set(i, { x: 20 + c * (w + gx), y: 20 + r * (h + gy) })));
  const width = 40 + Math.max(1, columns.length) * (w + gx) - gx;
  const height = 40 + Math.max(1, ...columns.map((list) => list?.length ?? 0)) * (h + gy) - gy;
  const colors = { clone: '#3b82f6', joint: '#f59e0b', constraint: '#10b981', expression: '#a855f7', group: '#64748b' };
  const lines = edges.map((e) => {
    const a = pos.get(e.from); const b = pos.get(e.to);
    const x1 = a.x + w; const y1 = a.y + h / 2; const x2 = b.x; const y2 = b.y + h / 2;
    return `<path d="M${x1} ${y1} C${x1 + gx / 2} ${y1} ${x2 - gx / 2} ${y2} ${x2} ${y2}" fill="none" stroke="${colors[e.kind] ?? '#888'}" stroke-width="1.5" marker-end="url(#arrow)"><title>${esc(e.kind)}</title></path>`;
  });
  const boxes = nodes.map((n, i) => {
    const p = pos.get(i);
    return `<g><rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" rx="6" fill="#ffffff" stroke="#334155"/><text x="${p.x + 10}" y="${p.y + h / 2 + 4}" font-family="sans-serif" font-size="12" fill="#0f172a">${esc(n.label.length > 30 ? `${n.label.slice(0, 29)}…` : n.label)}</text></g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#475569"/></marker></defs>
<rect width="100%" height="100%" fill="#f8fafc"/>
${lines.join('\n')}
${boxes.join('\n')}
</svg>
`;
}
