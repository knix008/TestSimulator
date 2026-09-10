// Deterministic diagram layouts.
//
// Deterministic on purpose: a force-directed layout would place the same
// project differently on every run, which makes two exports impossible to
// compare and makes "the box moved" a meaningless observation. Everything here
// is a pure function of the graph, so the same input always draws the same
// picture.

/**
 * Tidy tree layout (Reingold–Tilford, simplified to the "shift siblings"
 * variant, which is enough for call trees and reads cleanly).
 *
 * @param {object} root node with `children`
 * @param {{nodeWidth:number, nodeHeight:number, gapX:number, gapY:number, direction:'lr'|'tb'}} opts
 */
export function layoutTree(root, opts) {
  const { nodeWidth, nodeHeight, gapX, gapY, direction = 'lr' } = opts;
  const positioned = [];
  const edges = [];
  let cursor = 0;

  const place = (node, depth) => {
    const children = node.children || [];
    let center;

    if (children.length === 0) {
      center = cursor;
      cursor += direction === 'lr' ? nodeHeight + gapY : nodeWidth + gapX;
    } else {
      const childCenters = children.map((child) => place(child, depth + 1));
      center = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    }

    const entry =
      direction === 'lr'
        ? { node, x: depth * (nodeWidth + gapX), y: center, width: nodeWidth, height: nodeHeight }
        : { node, x: center, y: depth * (nodeHeight + gapY), width: nodeWidth, height: nodeHeight };

    positioned.push(entry);
    for (const child of children) {
      edges.push({ from: node, to: child });
    }
    return center;
  };

  place(root, 0);

  const byNode = new Map(positioned.map((p) => [p.node, p]));
  const width = Math.max(...positioned.map((p) => p.x + p.width)) + 40;
  const height = Math.max(...positioned.map((p) => p.y + p.height)) + 40;

  return {
    nodes: positioned.map((p) => ({ ...p, x: p.x + 20, y: p.y + 20 })),
    edges: edges.map((edge) => ({
      from: shift(byNode.get(edge.from)),
      to: shift(byNode.get(edge.to)),
      fromNode: edge.from,
      toNode: edge.to,
    })),
    width,
    height,
  };
}

function shift(entry) {
  return entry ? { ...entry, x: entry.x + 20, y: entry.y + 20 } : null;
}

/**
 * Layered layout for a general directed graph: nodes are ranked by their
 * longest path from a source, then ordered within a rank by the average
 * position of their predecessors (one barycenter sweep, which removes most
 * crossings without any randomness).
 */
export function layoutLayered(nodes, edges, opts) {
  const { nodeWidth, nodeHeight, gapX = 70, gapY = 26, maxPerLayer = 24 } = opts;
  if (nodes.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const incoming = new Map(ids.map((id) => [id, []]));
  const outgoing = new Map(ids.map((id) => [id, []]));

  for (const edge of edges) {
    if (!idSet.has(edge.fromId) || !idSet.has(edge.toId)) continue;
    outgoing.get(edge.fromId).push(edge.toId);
    incoming.get(edge.toId).push(edge.fromId);
  }

  // Rank by longest path from a node with no incoming edge; cycles are broken
  // by the visit guard, which is why this terminates on any graph.
  const rank = new Map();
  const visit = (id, seen) => {
    if (rank.has(id)) return rank.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) || [];
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map((p) => visit(p, seen)));
    seen.delete(id);
    rank.set(id, value);
    return value;
  };
  for (const id of ids) visit(id, new Set());

  const layers = new Map();
  for (const node of nodes) {
    const r = rank.get(node.id) || 0;
    if (!layers.has(r)) layers.set(r, []);
    layers.get(r).push(node);
  }

  // Barycenter ordering, one sweep from the first layer down.
  const order = new Map();
  const sortedRanks = [...layers.keys()].sort((a, b) => a - b);
  for (const r of sortedRanks) {
    const layer = layers.get(r);
    if (r === sortedRanks[0]) {
      layer.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
    } else {
      layer.sort((a, b) => barycenter(a, incoming, order) - barycenter(b, incoming, order));
    }
    layer.forEach((node, index) => order.set(node.id, index));
  }

  const positioned = [];
  for (const r of sortedRanks) {
    const layer = layers.get(r).slice(0, maxPerLayer);
    layer.forEach((node, index) => {
      positioned.push({
        node,
        x: r * (nodeWidth + gapX) + 24,
        y: index * (nodeHeight + gapY) + 24,
        width: nodeWidth,
        height: nodeHeight,
      });
    });
  }

  const byId = new Map(positioned.map((p) => [p.node.id, p]));
  const drawnEdges = edges
    .map((edge) => ({ ...edge, from: byId.get(edge.fromId), to: byId.get(edge.toId) }))
    .filter((edge) => edge.from && edge.to);

  return {
    nodes: positioned,
    edges: drawnEdges,
    width: Math.max(...positioned.map((p) => p.x + p.width)) + 30,
    height: Math.max(...positioned.map((p) => p.y + p.height)) + 30,
  };
}

function barycenter(node, incoming, order) {
  const parents = (incoming.get(node.id) || []).filter((id) => order.has(id));
  if (parents.length === 0) return Number.MAX_SAFE_INTEGER;
  return parents.reduce((acc, id) => acc + order.get(id), 0) / parents.length;
}

/**
 * Grid packing for box diagrams (UML classes, ERD tables) whose boxes have
 * individual heights. Columns are filled top to bottom, shortest column first,
 * which keeps the picture roughly square instead of one long strip.
 */
export function layoutGrid(boxes, opts) {
  const { columnWidth, gapX = 44, gapY = 28, maxWidth = 1800 } = opts;
  if (boxes.length === 0) return { boxes: [], width: 0, height: 0 };

  const columnCount = Math.max(1, Math.min(boxes.length, Math.floor((maxWidth + gapX) / (columnWidth + gapX))));
  const columnHeights = new Array(columnCount).fill(24);
  const placed = [];

  for (const box of boxes) {
    let shortest = 0;
    for (let i = 1; i < columnCount; i++) {
      if (columnHeights[i] < columnHeights[shortest]) shortest = i;
    }
    placed.push({
      ...box,
      x: 24 + shortest * (columnWidth + gapX),
      y: columnHeights[shortest],
      width: columnWidth,
    });
    columnHeights[shortest] += box.height + gapY;
  }

  return {
    boxes: placed,
    width: 24 + columnCount * (columnWidth + gapX) - gapX + 24,
    height: Math.max(...columnHeights) + 24,
  };
}

/**
 * Orthogonal connector between two boxes, entering and leaving on the sides
 * that face each other — the routing a reader expects from a UML tool.
 */
export function orthogonalPath(from, to) {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  const horizontal = Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y);

  if (horizontal) {
    const startX = toCenter.x > fromCenter.x ? from.x + from.width : from.x;
    const endX = toCenter.x > fromCenter.x ? to.x : to.x + to.width;
    const midX = (startX + endX) / 2;
    return {
      d: `M ${startX} ${fromCenter.y} H ${midX} V ${toCenter.y} H ${endX}`,
      end: { x: endX, y: toCenter.y },
      angle: toCenter.x > fromCenter.x ? 0 : 180,
    };
  }

  const startY = toCenter.y > fromCenter.y ? from.y + from.height : from.y;
  const endY = toCenter.y > fromCenter.y ? to.y : to.y + to.height;
  const midY = (startY + endY) / 2;
  return {
    d: `M ${fromCenter.x} ${startY} V ${midY} H ${toCenter.x} V ${endY}`,
    end: { x: toCenter.x, y: endY },
    angle: toCenter.y > fromCenter.y ? 90 : 270,
  };
}

/** Smooth cubic curve for call-tree edges (left-to-right). */
export function curvePath(from, to, direction = 'lr') {
  if (direction === 'lr') {
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const dx = Math.max(24, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + to.width / 2;
  const y2 = to.y;
  const dy = Math.max(24, (y2 - y1) / 2);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}
