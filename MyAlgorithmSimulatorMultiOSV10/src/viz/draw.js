// Draws one algorithm frame onto a canvas. Everything is plain data (see the
// algorithm modules), so the same frame looks the same every time it is drawn.

const INK = {
  compare: '#f5a524', swap: '#e5484d', pivot: '#8b5cf6', active: '#3b82f6', current: '#3b82f6',
  min: '#14b8a6', found: '#16a34a', write: '#f97316', done: '#16a34a', dim: '#94a3b8',
  tree: '#3b82f6', rejected: '#e5484d', relaxed: '#16a34a', frontier: '#f59e0b',
  open: '#86efac', closed: '#cbd5e1', path: '#fde68a', wall: '#334155', start: '#22c55e', goal: '#ef4444',
  source: '#93c5fd', error: '#fca5a5', visited: '#64748b', probe: '#3b82f6',
};

const font = (px, weight = 600) => `${weight} ${px}px "Segoe UI", "Malgun Gothic", sans-serif`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function arrow(ctx, x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const tip = Math.min(9, len / 3);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(angle) * tip, y2 - Math.sin(angle) * tip);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - tip * Math.cos(angle - 0.4), y2 - tip * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - tip * Math.cos(angle + 0.4), y2 - tip * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function textWidth(ctx, text) {
  return ctx.measureText(String(text)).width;
}

/** Text that may be a plain string or `{ ko, en }`. */
const tx = (value, lang) => (value && typeof value === 'object' ? (value[lang] ?? value.ko ?? '') : (value ?? ''));

/** Draws the frame. `theme` is { text, muted, border, surface, accent, dark }. */
export function drawFrame(ctx, w, h, view, theme, lang = 'ko') {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.dark ? '#0f1420' : '#f8fafd';
  ctx.fillRect(0, 0, w, h);
  if (!view) return;
  const draw = {
    array: drawArray, graph: drawGraph, grid: drawGrid, table: drawTable,
    string: drawString, tree: drawTree, board: drawBoard, hanoi: drawHanoi,
  }[view.kind];
  if (draw) draw(ctx, w, h, view, theme, lang);
}

// ───────────────────────── arrays (sorting, searching)

function drawArray(ctx, w, h, view, theme) {
  const { values, colors, done, pointers, range, aux, buckets } = view;
  const n = values.length;
  const doneSet = new Set(done);
  const auxH = aux ? 52 : 0;
  const bucketH = buckets ? 78 : 0;
  const top = 30;
  const bottom = h - 26 - auxH - bucketH;
  const slot = Math.min(64, (w - 24) / n);
  const x0 = (w - slot * n) / 2;
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min;
  const zeroY = bottom - ((0 - min) / span) * (bottom - top - 14);

  if (range) {
    ctx.fillStyle = theme.dark ? 'rgba(59,130,246,0.13)' : 'rgba(59,130,246,0.10)';
    ctx.fillRect(x0 + range[0] * slot, top - 8, (range[1] - range[0] + 1) * slot, bottom - top + 12);
  }
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, zeroY);
  ctx.lineTo(x0 + slot * n, zeroY);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  values.forEach((v, i) => {
    const barH = Math.max(2, (Math.abs(v) / span) * (bottom - top - 14));
    const x = x0 + i * slot + slot * 0.12;
    const bw = slot * 0.76;
    const y = v >= 0 ? zeroY - barH : zeroY;
    ctx.fillStyle = INK[colors[i]] ?? (doneSet.has(i) ? INK.done : (theme.dark ? '#334155' : '#cbd5e1'));
    roundRect(ctx, x, y, bw, barH, 3);
    ctx.fill();
    if (doneSet.has(i) && !colors[i]) {
      ctx.strokeStyle = INK.done;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = theme.text;
    ctx.font = font(Math.min(13, slot * 0.42));
    if (slot > 18) ctx.fillText(String(v), x + bw / 2, v >= 0 ? y - 9 : y + barH + 9);
    ctx.fillStyle = theme.muted;
    ctx.font = font(Math.min(11, slot * 0.34), 400);
    ctx.fillText(String(i), x + bw / 2, bottom + 12);
  });

  for (const [name, index] of Object.entries(pointers)) {
    if (index < 0 || index >= n) continue;
    const x = x0 + index * slot + slot / 2;
    ctx.fillStyle = theme.accent;
    ctx.font = font(11);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, x, top - 12);
    ctx.beginPath();
    ctx.moveTo(x, top - 9);
    ctx.lineTo(x - 4, top - 15);
    ctx.lineTo(x + 4, top - 15);
    ctx.fill();
  }

  if (aux) drawStrip(ctx, aux.label, aux.values, aux.colors ?? {}, x0, bottom + 30, slot, theme);
  if (buckets) drawBuckets(ctx, buckets, 12, h - bucketH + 4, w - 24, bucketH - 10, theme);
}

function drawStrip(ctx, label, values, colors, x, y, slot, theme) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(11, 700);
  ctx.fillStyle = theme.muted;
  ctx.fillText(label, x - Math.min(36, x - 4), y + 11);
  values.forEach((v, i) => {
    if (v === null || v === undefined || v === '') return;
    const bx = x + i * slot + slot * 0.12;
    ctx.fillStyle = INK[colors[i]] ?? (theme.dark ? '#1e293b' : '#e2e8f0');
    roundRect(ctx, bx, y, slot * 0.76, 22, 3);
    ctx.fill();
    ctx.fillStyle = colors[i] ? '#0f172a' : theme.text;
    ctx.font = font(Math.min(12, slot * 0.4));
    ctx.textAlign = 'center';
    ctx.fillText(String(v), bx + slot * 0.38, y + 11);
  });
}

function drawBuckets(ctx, buckets, x, y, w, h, theme) {
  const slot = w / buckets.length;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  buckets.forEach((items, b) => {
    const bx = x + b * slot;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3, y + 14, slot - 6, h - 18);
    ctx.fillStyle = theme.muted;
    ctx.font = font(11, 700);
    ctx.fillText(String(b), bx + slot / 2, y + 7);
    items.forEach((v, i) => {
      ctx.fillStyle = theme.accent;
      ctx.font = font(11);
      ctx.fillText(String(v), bx + slot / 2, y + 26 + i * 13);
    });
  });
}

// ───────────────────────── graphs

function drawGraph(ctx, w, h, view, theme, lang) {
  const { graph, node, edge, note, lists } = view;
  const listW = lists.length ? Math.min(230, w * 0.3) : 0;
  const gw = w - listW;
  // Keep the layout square, otherwise a tall stage stretches the graph into a column.
  const side = Math.max(40, Math.min(gw, h) - 28);
  const ox = (gw - side) / 2;
  const oy = (h - side) / 2;
  const at = (p) => [ox + p.x * side, oy + p.y * side];
  const pos = graph.nodes.map(at);

  // Several edges between the same pair are fanned out so none hides another.
  const groups = new Map();
  graph.edges.forEach((e, i) => {
    const key = `${Math.min(e.u, e.v)}-${Math.max(e.u, e.v)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });

  graph.edges.forEach((e, i) => {
    const group = groups.get(`${Math.min(e.u, e.v)}-${Math.max(e.u, e.v)}`);
    const offset = (group.indexOf(i) - (group.length - 1) / 2) * 14;
    const [x1, y1] = pos[e.u];
    const [x2, y2] = pos[e.v];
    const mx = (x1 + x2) / 2 + offset * ((y2 - y1) / (Math.hypot(x2 - x1, y2 - y1) || 1));
    const my = (y2 + y1) / 2 - offset * ((x2 - x1) / (Math.hypot(x2 - x1, y2 - y1) || 1));
    const state = edge[i];
    ctx.strokeStyle = INK[state] ?? (theme.dark ? '#475569' : '#94a3b8');
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = state ? 2.4 : 1.4;
    ctx.setLineDash(state === 'rejected' ? [4, 3] : []);
    if (graph.directed) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      arrow(ctx, x1, y1, x2 - Math.cos(angle) * 20, y2 - Math.sin(angle) * 20);
    } else {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (graph.weighted) {
      ctx.font = font(12, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lx = graph.directed ? (x1 + x2) / 2 : mx;
      const ly = graph.directed ? (y1 + y2) / 2 : my;
      ctx.fillStyle = theme.dark ? '#0f1420' : '#f8fafd';
      const tw = textWidth(ctx, e.w) + 8;
      ctx.fillRect(lx - tw / 2, ly - 8, tw, 16);
      ctx.fillStyle = state ? INK[state] : theme.text;
      ctx.fillText(String(e.w), lx, ly);
    }
  });

  graph.nodes.forEach((n, i) => {
    const [x, y] = pos[i];
    const state = node[i];
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = state && state !== 'start' ? INK[state] : (theme.dark ? '#1e293b' : '#ffffff');
    ctx.fill();
    ctx.lineWidth = state === 'start' ? 3 : 1.5;
    ctx.strokeStyle = state === 'start' ? INK.start : (state ? INK[state] : theme.border);
    ctx.stroke();
    ctx.fillStyle = state && !['start', 'frontier'].includes(state) ? '#ffffff' : theme.text;
    if (state === 'frontier') ctx.fillStyle = '#1f1300';
    ctx.font = font(13, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.label, x, y);
    if (note[i] !== undefined) {
      ctx.font = font(11, 600);
      ctx.fillStyle = theme.accent;
      ctx.fillText(String(note[i]), x, y + 28);
    }
  });

  if (lists.length) drawLists(ctx, lists, gw, 0, listW, h, theme, lang);
}

function drawLists(ctx, lists, x, y, w, h, theme, lang) {
  ctx.fillStyle = theme.dark ? 'rgba(15,20,32,0.6)' : 'rgba(255,255,255,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
  const colW = w / lists.length;
  ctx.textBaseline = 'middle';
  lists.forEach((list, c) => {
    const cx = x + c * colW + 10;
    ctx.fillStyle = theme.accent;
    ctx.font = font(11, 700);
    ctx.textAlign = 'left';
    ctx.fillText(tx(list.label, lang), cx, 16);
    ctx.font = font(12, 500);
    ctx.fillStyle = theme.text;
    list.items.slice(0, Math.floor((h - 36) / 16)).forEach((item, i) => {
      ctx.fillText(String(item), cx, 36 + i * 16);
    });
  });
}

// ───────────────────────── grids (A*, sieve)

export function gridGeometry(view, w, h) {
  const size = Math.min((w - 20) / view.cols, (h - 20) / view.rows);
  const x0 = (w - size * view.cols) / 2;
  const y0 = (h - size * view.rows) / 2;
  return { size, x0, y0 };
}

/** The cell under a canvas point, or -1. */
export function gridCellAt(view, w, h, px, py) {
  const { size, x0, y0 } = gridGeometry(view, w, h);
  const c = Math.floor((px - x0) / size);
  const r = Math.floor((py - y0) / size);
  if (r < 0 || c < 0 || r >= view.rows || c >= view.cols) return -1;
  return r * view.cols + c;
}

function drawGrid(ctx, w, h, view, theme) {
  const { rows, cols, cells, values, start, goal, current, probe, path } = view;
  const { size, x0, y0 } = gridGeometry(view, w, h);
  const pathSet = new Set(path ?? []);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(Math.max(8, size * 0.38), 600);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = x0 + c * size;
      const y = y0 + r * size;
      const state = pathSet.has(i) ? 'path' : cells[i];
      if (state === 'empty') continue;
      let fill = theme.dark ? '#1e293b' : '#ffffff';
      if (state && INK[state]) fill = INK[state];
      ctx.fillStyle = fill;
      ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      if (i === current || i === probe) {
        ctx.strokeStyle = i === current ? '#1d4ed8' : '#7c3aed';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
      }
      const label = i === start ? 'S' : i === goal ? 'G' : (values?.[i] ?? '');
      if (label !== '' && label !== null && size > 12) {
        ctx.fillStyle = state === 'wall' || state === 'closed' ? '#ffffff' : theme.text;
        ctx.fillText(String(label), x + size / 2, y + size / 2);
      }
    }
  }
}

// ───────────────────────── tables (DP, floyd, gcd)

function drawTable(ctx, w, h, view, theme, lang) {
  const { rowHeaders, colHeaders, cells, colors, footer, title } = view;
  const rows = cells.length;
  const cols = colHeaders.length;
  const head = 22;
  const foot = footer ? 26 : 0;
  const top = title ? 26 : 8;
  const labelW = Math.min(150, Math.max(34, ...rowHeaders.map((t) => String(t).length * 7.2 + 12)));
  const availW = w - labelW - 16;
  const availH = h - top - head - foot - 8;
  const cw = Math.min(58, availW / cols);
  const ch = Math.min(30, availH / rows);
  const x0 = (w - (labelW + cw * cols)) / 2;
  const y0 = top + head;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(Math.min(12, ch * 0.5), 700);
  ctx.fillStyle = theme.muted;
  if (title) ctx.fillText(tx(title, lang), w / 2, 14);
  colHeaders.forEach((t, c) => ctx.fillText(String(t), x0 + labelW + c * cw + cw / 2, top + head / 2));
  ctx.textAlign = 'right';
  rowHeaders.forEach((t, r) => ctx.fillText(String(t), x0 + labelW - 6, y0 + r * ch + ch / 2));

  ctx.font = font(Math.min(13, ch * 0.55), 600);
  ctx.textAlign = 'center';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const value = cells[r][c];
      if (value === null) continue;
      const color = colors[`${r},${c}`];
      ctx.fillStyle = color ? INK[color] : (theme.dark ? '#1e293b' : '#ffffff');
      ctx.fillRect(x0 + labelW + c * cw + 1, y0 + r * ch + 1, cw - 2, ch - 2);
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + labelW + c * cw + 0.5, y0 + r * ch + 0.5, cw - 1, ch - 1);
      ctx.fillStyle = color && !['source', 'error', 'path', 'frontier'].includes(color) ? '#0f172a' : theme.text;
      ctx.fillText(String(value), x0 + labelW + c * cw + cw / 2, y0 + r * ch + ch / 2);
    }
  }
  if (footer) {
    ctx.fillStyle = theme.text;
    ctx.font = font(13, 700);
    ctx.fillText(tx(footer, lang), w / 2, h - 14);
  }
}

// ───────────────────────── strings (KMP, Rabin–Karp)

function drawString(ctx, w, h, view, theme, lang) {
  const { text, pattern, shift, i, j, state, matched, found, aux, lps, info } = view;
  const rows = (text ? 1 : 0) + 1 + (aux ? 1 : 0);
  const cell = Math.min(34, (w - 40) / Math.max(pattern.length, text?.length ?? 0, 1));
  const blockH = rows * (cell + 26);
  let y = Math.max(30, (h - blockH) / 2);

  const row = (label, chars, yRow, paint) => {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = font(12, 700);
    ctx.fillStyle = theme.muted;
    ctx.fillText(label, 44, yRow + cell / 2);
    [...chars].forEach((ch, k) => {
      const x = 52 + k * cell;
      paint(x, yRow, k, ch);
      ctx.fillStyle = theme.muted;
      ctx.font = font(9, 400);
      ctx.textAlign = 'center';
      ctx.fillText(String(k), x + cell / 2, yRow + cell + 9);
    });
  };

  const box = (x, yBox, ch, fill) => {
    ctx.fillStyle = fill ?? (theme.dark ? '#1e293b' : '#ffffff');
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1.5, yBox, cell - 3, cell, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.text;
    ctx.font = font(Math.min(16, cell * 0.55), 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x + cell / 2, yBox + cell / 2);
  };

  if (text) {
    const foundSet = new Set();
    for (const at of found) for (let k = 0; k < pattern.length; k++) foundSet.add(at + k);
    row('T', text, y, (x, yBox, k, ch) => box(x, yBox, ch, foundSet.has(k) ? INK.open : k === i ? (state === 'mismatch' ? INK.error : INK.source) : null));
    y += cell + 26;
  }
  const patternX = (k) => 52 + (k + (text ? shift : 0)) * cell;
  ctx.textAlign = 'right';
  ctx.font = font(12, 700);
  ctx.fillStyle = theme.muted;
  ctx.textBaseline = 'middle';
  ctx.fillText('P', 44, y + cell / 2);
  [...pattern].forEach((ch, k) => {
    let fill = null;
    if (text && k < matched) fill = INK.open;
    if (text && k === j) fill = state === 'mismatch' ? INK.error : INK.source;
    if (!text && lps && k === lps.k) fill = INK.source;
    if (!text && lps && k === lps.len && lps.len !== lps.k) fill = INK.compare;
    box(patternX(k), y, ch, fill);
  });
  y += cell + 26;
  if (aux) {
    row(aux.label, aux.values.map((v, k) => [k, v]), y, (x, yBox, k) => {
      const value = aux.values[k];
      box(x, yBox, value === null || value === '' ? '' : String(value), INK[aux.colors?.[k]] ?? null);
    });
  }
  if (info) {
    ctx.fillStyle = theme.text;
    ctx.font = font(13, 600);
    ctx.textAlign = 'center';
    ctx.fillText(tx(info, lang), w / 2, h - 16);
  }
}

// ───────────────────────── trees (BST, traversals)

function drawTree(ctx, w, h, view, theme, lang) {
  const { nodes, root, colors, lists, probe } = view;
  const listW = lists.length ? Math.min(200, w * 0.26) : 0;
  if (root === null) {
    ctx.fillStyle = theme.muted;
    ctx.font = font(14, 500);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('∅', (w - listW) / 2, h / 2);
    if (lists.length) drawLists(ctx, lists, w - listW, 0, listW, h, theme, lang);
    return;
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map();
  const walk = (id, d) => { if (id === null) return 0; depth.set(id, d); return 1 + Math.max(walk(byId.get(id).left, d + 1), walk(byId.get(id).right, d + 1)); };
  const height = walk(root, 0);
  const leaves = [];
  const order = (id) => { if (id === null) return; order(byId.get(id).left); leaves.push(id); order(byId.get(id).right); };
  order(root);
  const gw = w - listW;
  const slot = (gw - 30) / leaves.length;
  const xOf = new Map(leaves.map((id, i) => [id, 15 + slot * (i + 0.5)]));
  const yOf = (id) => 36 + depth.get(id) * Math.min(78, (h - 60) / height);

  ctx.lineWidth = 1.6;
  for (const node of nodes) {
    for (const child of [node.left, node.right]) {
      if (child === null) continue;
      ctx.strokeStyle = theme.dark ? '#475569' : '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(xOf.get(node.id), yOf(node.id));
      ctx.lineTo(xOf.get(child), yOf(child));
      ctx.stroke();
    }
  }
  for (const node of nodes) {
    const x = xOf.get(node.id);
    const y = yOf(node.id);
    const state = colors[node.id];
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = state ? INK[state] : (theme.dark ? '#1e293b' : '#ffffff');
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = state ? INK[state] : theme.border;
    ctx.stroke();
    ctx.fillStyle = state && !['compare', 'frontier'].includes(state) ? '#ffffff' : theme.text;
    ctx.font = font(12, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(node.key), x, y);
  }
  if (probe) {
    const x = xOf.get(probe.at);
    const y = yOf(probe.at) - 34;
    ctx.fillStyle = theme.accent;
    ctx.font = font(12, 700);
    ctx.fillText(String(probe.key), x, y);
  }
  if (lists.length) drawLists(ctx, lists, w - listW, 0, listW, h, theme, lang);
}

// ───────────────────────── chess board (N-Queens)

function drawBoard(ctx, w, h, view, theme) {
  const { n, queens, probe, conflicts, solved } = view;
  const size = Math.min((w - 80) / n, (h - 50) / n);
  const x0 = (w - size * n) / 2;
  const y0 = (h - size * n) / 2 + 8;
  const conflictSet = new Set((conflicts ?? []).map(([r, c]) => `${r},${c}`));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = x0 + c * size;
      const y = y0 + r * size;
      ctx.fillStyle = (r + c) % 2 === 0 ? (theme.dark ? '#1e293b' : '#f1f5f9') : (theme.dark ? '#334155' : '#cbd5e1');
      if (conflictSet.has(`${r},${c}`)) ctx.fillStyle = INK.error;
      ctx.fillRect(x, y, size, size);
      if (probe && probe[0] === r && probe[1] === c) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
      }
    }
  }
  ctx.strokeStyle = solved ? INK.found : theme.border;
  ctx.lineWidth = solved ? 3 : 1;
  ctx.strokeRect(x0, y0, size * n, size * n);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(size * 0.62, 700);
  queens.forEach((c, r) => {
    if (c < 0) return;
    ctx.fillStyle = theme.dark ? '#fde68a' : '#7c3f00';
    ctx.fillText('♛', x0 + c * size + size / 2, y0 + r * size + size / 2 + 1);
  });
  ctx.fillStyle = theme.muted;
  ctx.font = font(11, 500);
  for (let k = 0; k < n; k++) {
    ctx.fillText(String(k), x0 + k * size + size / 2, y0 - 10);
    ctx.fillText(String(k), x0 - 12, y0 + k * size + size / 2);
  }
}

// ───────────────────────── discs (Tower of Hanoi)

function drawHanoi(ctx, w, h, view, theme) {
  const { pegs, n, move } = view;
  const base = h - 46;
  const pegH = Math.min(h * 0.62, 26 + n * 24);
  const gap = w / 3;
  ctx.strokeStyle = theme.dark ? '#64748b' : '#475569';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 4;
  for (let p = 0; p < 3; p++) {
    const x = gap * (p + 0.5);
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x, base - pegH);
    ctx.stroke();
    ctx.fillRect(x - gap * 0.34, base, gap * 0.68, 6);
    ctx.font = font(15, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.text;
    ctx.fillText(['A', 'B', 'C'][p], x, base + 24);
    pegs[p].forEach((disc, level) => {
      const dw = 28 + (disc / n) * (gap * 0.6 - 28);
      const y = base - 12 - level * 22;
      const hue = 200 - (disc / n) * 160;
      ctx.fillStyle = `hsl(${hue} 70% 52%)`;
      const moving = move && move.disc === disc;
      roundRect(ctx, x - dw / 2, moving ? y - 8 : y, dw, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = font(11, 700);
      ctx.textBaseline = 'middle';
      ctx.fillText(String(disc), x, (moving ? y - 8 : y) + 8);
    });
  }
}

const legend = (ko, en) => ({ ko, en });

/** The colours the stage legend explains, per view kind. */
export const LEGEND = {
  array: [['compare', legend('비교', 'Compare')], ['swap', legend('교환', 'Swap')], ['pivot', legend('피벗', 'Pivot')], ['write', legend('기록', 'Write')], ['done', legend('확정', 'Settled')], ['found', legend('발견', 'Found')], ['dim', legend('제외', 'Excluded')]],
  graph: [['current', legend('현재', 'Current')], ['frontier', legend('대기', 'Waiting')], ['visited', legend('방문', 'Visited')], ['done', legend('확정', 'Settled')], ['tree', legend('선택 간선', 'Chosen edge')], ['relaxed', legend('갱신', 'Updated')], ['rejected', legend('제외', 'Rejected')]],
  grid: [['open', legend('후보', 'Open')], ['closed', legend('확정', 'Closed')], ['path', legend('경로', 'Path')], ['wall', legend('벽·제외', 'Wall')], ['start', legend('시작', 'Start')], ['goal', legend('목표', 'Goal')]],
  table: [['source', legend('참조', 'Source')], ['compare', legend('비교', 'Compare')], ['write', legend('기록', 'Write')], ['active', legend('계산 중', 'Computing')], ['path', legend('역추적', 'Traceback')], ['found', legend('결과', 'Result')]],
  string: [['source', legend('비교 중', 'Comparing')], ['open', legend('일치', 'Match')], ['error', legend('불일치', 'Mismatch')], ['write', legend('기록', 'Write')]],
  tree: [['compare', legend('비교', 'Compare')], ['write', legend('삽입', 'Inserted')], ['visited', legend('경로', 'Path')], ['current', legend('방문', 'Visiting')], ['done', legend('완료', 'Done')], ['found', legend('발견', 'Found')]],
  board: [['error', legend('공격받음', 'Attacked')], ['found', legend('해', 'Solution')]],
  hanoi: [],
};

export const INK_COLORS = INK;
