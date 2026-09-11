// Port of Import/SchemaLayout.cs
// Text measurement uses a canvas 2D context in the browser and a width
// approximation when no canvas is available (Node scripts).
import type { DbSchema, DbTable, DbTargetType } from '../types';
import { getDbDisplayName } from '../types';
import { ensureInitialized, getTypeDisplay } from './schema';
import { getTableBounds, getTableHeight, type Point, type Rect } from './geometry';
import { getPathPoints, getRelationshipConnection } from './relationshipPath';

const MIN_TABLE_WIDTH = 210;
const MAX_TABLE_WIDTH = 720;
const COLUMN_ICON_WIDTH = 26;
const NAME_COLUMN_RATIO = 0.48;
const TYPE_COLUMN_RATIO = 0.52;

export const FONT_HEADER = 'bold 12.7px "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif';
export const FONT_COLUMN = '11.3px "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif';
export const FONT_COLUMN_BOLD = 'bold 11.3px "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif';
export const FONT_DBTYPE = '9.3px "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif';

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  try {
    if (typeof document === 'undefined') {
      measureCtx = null;
    } else {
      measureCtx = document.createElement('canvas').getContext('2d');
    }
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

/** Approximate width used when no 2D context exists (CJK glyphs are full width). */
function approximateWidth(text: string, pixelSize: number): number {
  let units = 0;
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e7f ? 1 : 0.55;
  return units * pixelSize;
}

export function measureText(text: string, font: string): number {
  if (!text) return 0;
  const ctx = getMeasureContext();
  if (!ctx) {
    const size = parseFloat(font.replace(/^bold\s+/, '')) || 11;
    return approximateWidth(text, size);
  }
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function fitTableWidth(table: DbTable, dbTypeDisplayName: string): void {
  if (!table) return;
  table.Columns ??= [];

  let maxColumnNameWidth = 0;
  let maxTypeWidth = 0;
  for (const column of table.Columns) {
    if (!column) continue;
    const nameFont = column.IsPrimaryKey ? FONT_COLUMN_BOLD : FONT_COLUMN;
    maxColumnNameWidth = Math.max(maxColumnNameWidth, measureText(column.Name, nameFont));
    maxTypeWidth = Math.max(maxTypeWidth, measureText(getTypeDisplay(column), FONT_COLUMN));
  }

  const headerWidth =
    measureText(table.Name, FONT_HEADER) + measureText(dbTypeDisplayName, FONT_DBTYPE) + 24;
  const nameAreaWidth = maxColumnNameWidth + COLUMN_ICON_WIDTH + 12;
  const typeAreaWidth = maxTypeWidth + 12;
  const widthForNames = nameAreaWidth / NAME_COLUMN_RATIO;
  const widthForTypes = typeAreaWidth / TYPE_COLUMN_RATIO;
  const width = Math.max(MIN_TABLE_WIDTH, headerWidth, widthForNames, widthForTypes);
  table.Width = Math.min(MAX_TABLE_WIDTH, Math.ceil(width));
}

export function fitTableWidthForTarget(table: DbTable, targetDb: DbTargetType): void {
  fitTableWidth(table, getDbDisplayName(targetDb));
}

export function fitTableWidths(schema: DbSchema): void {
  if (!schema) return;
  ensureInitialized(schema);
  const dbTypeDisplay = getDbDisplayName(schema.TargetDb);
  for (const table of schema.Tables) fitTableWidth(table, dbTypeDisplay);
}

// ─── Auto arrange ────────────────────────────────────────────────────────────
//
// A uniform grid puts related tables wherever they happen to fall in the table
// list, so relationship lines run diagonally across the diagram and disappear
// behind whatever sits in the way. This lays the schema out in layers instead:
// a table is placed to the right of everything it depends on, so every line
// runs left to right through the empty gutter between two columns.

/**
 * Space between layers — the channel the relationship lines run through.
 *
 * A line leaves a table through whichever edge faces the other end, so a line
 * to a table far above or below attaches to the top or bottom and then cuts
 * back across the column, straight over whatever is stacked in between. The
 * further apart the columns are, the more horizontal that line becomes, until
 * it leaves through the side instead and the problem disappears.
 *
 * So the gutter is not one number: the layout starts at the narrowest and
 * widens only while lines are still being covered up. A schema whose columns
 * are short stays tight; a table with a dozen children gets the room it needs.
 */
const GUTTER_STEPS = [90, 130, 190, 270, 370, 490, 640, 820];
/** Space between tables stacked in the same layer. */
const ROW_GAP = 34;
/** Space between two groups of tables that have nothing to do with each other. */
const COMPONENT_GAP = 64;
const ORIGIN_X = 40;
const ORIGIN_Y = 50;

interface Edge {
  parent: string;
  child: string;
}

/** Relationships as parent → child table ids, ignoring self-links and strays. */
function collectEdges(schema: DbSchema): Edge[] {
  const known = new Set(schema.Tables.map((t) => t.Id));
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const rel of schema.Relationships) {
    const parent = rel.SourceTableId;
    const child = rel.TargetTableId;
    if (!known.has(parent) || !known.has(child) || parent === child) continue;
    // Two relationships between the same pair should not count twice when
    // ordering; the line is drawn twice but the layout question is the same.
    const key = `${parent}\u0000${child}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ parent, child });
  }
  return edges;
}

/** Tables that are reachable from one another, ignoring direction. */
function connectedComponents(tables: DbTable[], edges: Edge[]): DbTable[][] {
  const neighbours = new Map<string, string[]>();
  for (const table of tables) neighbours.set(table.Id, []);
  for (const { parent, child } of edges) {
    neighbours.get(parent)!.push(child);
    neighbours.get(child)!.push(parent);
  }

  const byId = new Map(tables.map((t) => [t.Id, t]));
  const seen = new Set<string>();
  const components: DbTable[][] = [];
  // Walked in table order, so the same schema always lays out the same way.
  for (const table of tables) {
    if (seen.has(table.Id)) continue;
    const group: DbTable[] = [];
    const queue = [table.Id];
    seen.add(table.Id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      group.push(byId.get(id)!);
      for (const next of neighbours.get(id)!) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    components.push(group);
  }
  return components;
}

/**
 * Longest-path layering: a table sits one layer to the right of its furthest
 * parent. Tables caught in a cycle have no such answer, so they are placed
 * after the tables that do, one layer past whichever of their neighbours is
 * furthest right.
 */
function assignLayers(group: DbTable[], edges: Edge[]): Map<string, number> {
  const ids = new Set(group.map((t) => t.Id));
  const local = edges.filter((e) => ids.has(e.parent) && ids.has(e.child));

  const children = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const table of group) {
    children.set(table.Id, []);
    inDegree.set(table.Id, 0);
  }
  for (const { parent, child } of local) {
    children.get(parent)!.push(child);
    inDegree.set(child, inDegree.get(child)! + 1);
  }

  const layer = new Map<string, number>();
  const queue = group.filter((t) => inDegree.get(t.Id) === 0).map((t) => t.Id);
  for (const id of queue) layer.set(id, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of children.get(id)!) {
      layer.set(child, Math.max(layer.get(child) ?? 0, (layer.get(id) ?? 0) + 1));
      inDegree.set(child, inDegree.get(child)! - 1);
      if (inDegree.get(child) === 0) queue.push(child);
    }
  }

  // Whatever is left is in a cycle.
  const remaining = group.filter((t) => !layer.has(t.Id));
  for (const table of remaining) {
    const parents = local.filter((e) => e.child === table.Id).map((e) => layer.get(e.parent));
    const placed = parents.filter((v): v is number => v !== undefined);
    layer.set(table.Id, placed.length > 0 ? Math.max(...placed) + 1 : 0);
  }
  return layer;
}

/**
 * Order the tables inside each layer so lines cross as little as possible: a
 * table moves next to the average position of the tables it connects to in the
 * neighbouring layer. Sweeping back and forth a few times settles it — this is
 * the barycentre heuristic, and a handful of passes is all it needs at the size
 * of a real schema.
 */
function orderWithinLayers(layers: DbTable[][], edges: Edge[]): void {
  const positionOf = new Map<string, number>();
  const refreshPositions = () => {
    for (const layer of layers) layer.forEach((t, i) => positionOf.set(t.Id, i));
  };
  refreshPositions();

  const neighboursIn = (table: DbTable, otherLayer: DbTable[]): number[] => {
    const others = new Set(otherLayer.map((t) => t.Id));
    const result: number[] = [];
    for (const { parent, child } of edges) {
      if (parent === table.Id && others.has(child)) result.push(positionOf.get(child)!);
      if (child === table.Id && others.has(parent)) result.push(positionOf.get(parent)!);
    }
    return result;
  };

  const sweep = (indices: number[], neighbourOffset: number) => {
    for (const i of indices) {
      const other = layers[i + neighbourOffset];
      if (!other) continue;
      const keyed = layers[i].map((table, index) => {
        const positions = neighboursIn(table, other);
        const barycentre =
          positions.length > 0
            ? positions.reduce((a, b) => a + b, 0) / positions.length
            : // Nothing to line up with: keep where it is, rather than drifting
              // to the top and pushing connected tables out of the way.
              index;
        return { table, barycentre, index };
      });
      keyed.sort((a, b) => a.barycentre - b.barycentre || a.index - b.index);
      layers[i] = keyed.map((k) => k.table);
      refreshPositions();
    }
  };

  const down = layers.map((_, i) => i).slice(1);
  const up = layers.map((_, i) => i).slice(0, -1).reverse();
  for (let pass = 0; pass < 3; pass++) {
    sweep(down, -1);
    sweep(up, 1);
  }
}

/** Does the segment p→q pass through rect? Liang–Barsky clipping. */
function segmentCrossesRect(p: Point, q: Point, rect: Rect): boolean {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, p.x - rect.x],
    [dx, rect.x + rect.w - p.x],
    [-dy, p.y - rect.y],
    [dy, rect.y + rect.h - p.y],
  ];
  for (const [den, num] of edges) {
    if (den === 0) {
      if (num < 0) return false;
      continue;
    }
    const t = num / den;
    if (den < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t1 > t0;
}

/**
 * How many relationship lines currently disappear behind a table that is not
 * one of their own ends. This is the thing the layout is trying to avoid, so it
 * is measured directly rather than approximated by a rule of thumb.
 */
function countCoveredLines(schema: DbSchema, group: DbTable[]): number {
  const ids = new Set(group.map((t) => t.Id));
  let covered = 0;
  for (const rel of schema.Relationships) {
    if (!ids.has(rel.SourceTableId) || !ids.has(rel.TargetTableId)) continue;
    const connection = getRelationshipConnection(schema, rel);
    if (!connection) continue;
    const points = getPathPoints(rel, connection);
    for (const table of group) {
      if (table.Id === rel.SourceTableId || table.Id === rel.TargetTableId) continue;
      const b = getTableBounds(table);
      // A line grazing the border is not hidden; only a real overlap counts.
      const inner = { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 };
      const hit = points.some(
        (point, i) => i > 0 && segmentCrossesRect(points[i - 1], point, inner),
      );
      if (hit) {
        covered++;
        break;
      }
    }
  }
  return covered;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Lay one group of connected tables out at the origin, returning the box it
 * fills. Positioning the group on the page is the caller's business — the
 * groups have to be packed against each other before anyone knows where this
 * one goes.
 */
function placeComponent(schema: DbSchema, group: DbTable[], edges: Edge[]): Size {
  const layerOf = assignLayers(group, edges);
  const layerCount = Math.max(...group.map((t) => layerOf.get(t.Id)!)) + 1;
  const layers: DbTable[][] = Array.from({ length: layerCount }, () => []);
  for (const table of group) layers[layerOf.get(table.Id)!].push(table);

  orderWithinLayers(layers, edges);

  const heightOf = (layer: DbTable[]) =>
    layer.reduce((sum, t) => sum + getTableHeight(t), 0) + ROW_GAP * Math.max(0, layer.length - 1);
  const tallest = Math.max(...layers.map(heightOf));

  let width = 0;
  const applyGutter = (gutter: number) => {
    let x = 0;
    for (const layer of layers) {
      // Centre each column against the tallest one, so lines between
      // neighbouring columns stay close to horizontal instead of fanning out
      // from the top.
      let y = Math.round((tallest - heightOf(layer)) / 2);
      for (const table of layer) {
        table.X = x;
        table.Y = y;
        y += getTableHeight(table) + ROW_GAP;
      }
      const columnWidth = Math.max(...layer.map((t) => t.Width));
      x += columnWidth + gutter;
      width = x - gutter;
    }
  };

  // Widen only as far as it takes. A single column has no gutter to widen, so
  // there is nothing to search for.
  if (layers.length > 1) {
    let best = GUTTER_STEPS[0];
    let bestCovered = Number.MAX_SAFE_INTEGER;
    for (const gutter of GUTTER_STEPS) {
      applyGutter(gutter);
      const covered = countCoveredLines(schema, group);
      if (covered < bestCovered) {
        bestCovered = covered;
        best = gutter;
      }
      if (covered === 0) break;
    }
    applyGutter(best);
  } else {
    applyGutter(GUTTER_STEPS[0]);
  }
  return { width, height: tallest };
}

/**
 * Lay the schema out so that related tables sit next to each other and the
 * relationship lines have somewhere to run. Tables are moved; nothing else
 * about them changes.
 */
/** Shift every table in a group by the same amount. */
function translate(group: DbTable[], dx: number, dy: number): void {
  for (const table of group) {
    table.X += dx;
    table.Y += dy;
  }
}

/**
 * Lay the schema out so that related tables sit next to each other and the
 * relationship lines have somewhere to run. Tables are moved; nothing else
 * about them changes.
 *
 * Groups of related tables are packed across the page as well as down it. A
 * database whose foreign keys are not declared — which is most SQLite files —
 * arrives as one group per table, and stacking those in a single column gives
 * a diagram a mile long and one table wide. How many go in a row comes from how
 * many there are, so ten tables land in a block rather than a ribbon.
 */
export function autoArrange(schema: DbSchema): void {
  if (!schema) return;
  ensureInitialized(schema);
  if (schema.Tables.length === 0) return;

  fitTableWidths(schema);
  const edges = collectEdges(schema);
  const components = connectedComponents(schema.Tables, edges);

  const placed = components.map((group) => ({ group, size: placeComponent(schema, group, edges) }));

  // Aim for a squarish block: the square root of the group count, rounded up,
  // is the usual answer and needs no measurement of the window.
  const columns = Math.max(1, Math.ceil(Math.sqrt(placed.length)));
  const widest = Math.max(...placed.map((p) => p.size.width));
  const rowLimit = columns * (widest + COMPONENT_GAP);

  let x = ORIGIN_X;
  let y = ORIGIN_Y;
  let rowHeight = 0;
  for (const { group, size } of placed) {
    // Wrap once the row is full, but never leave a row empty: a group wider
    // than the limit simply gets a row of its own.
    if (x > ORIGIN_X && x + size.width > ORIGIN_X + rowLimit) {
      x = ORIGIN_X;
      y += rowHeight + COMPONENT_GAP;
      rowHeight = 0;
    }
    translate(group, x, y);
    x += size.width + COMPONENT_GAP;
    rowHeight = Math.max(rowHeight, size.height);
  }
}
