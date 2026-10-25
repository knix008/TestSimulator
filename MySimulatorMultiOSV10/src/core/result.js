// The engine's result bytes (ARCHITECTURE.md "Result bytes") decoded into node
// outputs whose columns are Float64Array views of one data block.

export const MAGIC = 0x4d49534d;

/** bytes (ArrayBuffer | Uint8Array | number[]) → { header, nodes: Map(id → output) }. */
export function decodeResult(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 8 || dv.getUint32(0, true) !== MAGIC) throw new Error('not a MySimulator result');
  const length = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + length)));
  const start = Math.ceil((8 + length) / 8) * 8;
  // A copy keeps the data 8-byte aligned whatever the source buffer's offset.
  const data = new Float64Array(u8.slice(start).buffer);
  const view = (slot) => (slot && slot.length ? data.subarray(slot.offset, slot.offset + slot.length) : new Float64Array(0));
  const nodes = new Map();
  for (const n of header.nodes ?? []) {
    nodes.set(n.id, {
      id: n.id,
      ok: n.ok,
      error: n.error ?? null,
      warnings: n.warnings ?? [],
      skipped: Boolean(n.skipped),
      elapsedMs: n.elapsedMs ?? 0,
      text: n.text ?? '',
      scalars: (n.scalars ?? []).map((s) => ({ name: s.name, value: s.value ?? NaN, unit: s.unit ?? '' })),
      tables: (n.tables ?? []).map((t) => ({
        name: t.name,
        x: t.x ?? null,
        rows: t.rows ?? 0,
        columns: t.columns.map((c) => ({ name: c.name, unit: c.unit ?? '', labels: c.labels ?? null, values: c.labels ? new Float64Array(c.labels.length).fill(NaN) : view(c) })),
      })),
      grids: (n.grids ?? []).map((g) => ({ name: g.name, xLabel: g.xLabel, yLabel: g.yLabel, zLabel: g.zLabel, x: view(g.x), y: view(g.y), z: view(g.z), xNames: g.xNames ?? null, yNames: g.yNames ?? null })),
    });
  }
  return { header: { ok: header.ok, error: header.error ?? null, name: header.name, elapsedMs: header.elapsedMs ?? 0 }, nodes };
}

/** The column named `name` of a table (exact, then case-insensitive). */
export function findColumn(table, name) {
  if (!table || !name) return null;
  return table.columns.find((c) => c.name === name) ?? table.columns.find((c) => c.name.toLowerCase() === String(name).toLowerCase()) ?? null;
}

export function xColumn(table) {
  return table && table.x != null ? table.columns[table.x] : null;
}

/** Numeric columns other than x. */
export function valueColumns(table) {
  return table.columns.filter((c, i) => i !== table.x && !c.labels);
}

export function labelColumn(table) {
  return table.columns.find((c) => c.labels) ?? null;
}

/** Every column name reachable in an output (for the column pickers). */
export function columnNames(output) {
  const names = [];
  for (const t of output?.tables ?? []) for (const c of t.columns) if (!names.includes(c.name)) names.push(c.name);
  return names;
}

function csvCell(text) {
  const s = String(text);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function numberText(v) {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? '' : v > 0 ? 'inf' : '-inf';
  return String(Number(v.toPrecision(15)));
}

export function tableCsv(table) {
  const head = table.columns.map((c) => csvCell(c.unit ? `${c.name} (${c.unit})` : c.name)).join(',');
  const rows = [head];
  const n = table.rows ?? Math.max(0, ...table.columns.map((c) => (c.labels ?? c.values).length));
  for (let r = 0; r < n; r++) rows.push(table.columns.map((c) => (c.labels ? csvCell(c.labels[r] ?? '') : numberText(c.values[r]))).join(','));
  return `${rows.join('\n')}\n`;
}

export function scalarsCsv(output) {
  return `name,value,unit\n${output.scalars.map((s) => [csvCell(s.name), numberText(s.value), csvCell(s.unit)].join(',')).join('\n')}\n`;
}

export function gridCsv(grid) {
  const nx = grid.x.length;
  const lines = [`${csvCell(grid.yLabel || 'y')} \\ ${csvCell(grid.xLabel || 'x')},${Array.from(grid.x, (v, i) => (grid.xNames ? csvCell(grid.xNames[i]) : numberText(v))).join(',')}`];
  for (let j = 0; j < grid.y.length; j++) {
    lines.push(`${grid.yNames ? csvCell(grid.yNames[j]) : numberText(grid.y[j])},${Array.from(grid.z.subarray(j * nx, (j + 1) * nx), numberText).join(',')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** All of one node's output as JSON (tables as column arrays). */
export function outputJson(output) {
  return JSON.stringify({
    id: output.id,
    scalars: Object.fromEntries(output.scalars.map((s) => [s.name, Number.isFinite(s.value) ? s.value : null])),
    tables: output.tables.map((t) => ({ name: t.name, columns: Object.fromEntries(t.columns.map((c) => [c.name, c.labels ?? Array.from(c.values, (v) => (Number.isFinite(v) ? v : null))])) })),
    text: output.text,
  }, null, 2);
}

/** A short summary of an output for the tree and the node card: "3 tables · 2001 rows". */
export function outputSummary(output) {
  if (!output) return '';
  if (!output.ok) return output.error ?? '';
  const rows = output.tables.reduce((m, t) => Math.max(m, t.rows), 0);
  const parts = [];
  if (output.tables.length) parts.push(`${output.tables.length}×▤ ${rows.toLocaleString()}`);
  if (output.grids.length) parts.push(`${output.grids.length}×▦`);
  if (output.scalars.length) parts.push(`${output.scalars.length}×#`);
  return parts.join(' · ');
}
