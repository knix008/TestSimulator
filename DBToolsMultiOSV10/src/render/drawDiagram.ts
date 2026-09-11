// Canvas 2D port of Controls/DiagramCanvas.cs drawing code.
// Used both by the on-screen editor and by the image exporter.
import type { DbRelationship, DbSchema, DbTable } from '../types';
import { getDbDisplayName } from '../types';
import { HEADER_HEIGHT, ROW_HEIGHT, type Point } from '../core/geometry';
import { getTableHeight } from '../core/geometry';
import {
  getCubicControls,
  getPathMidpoint,
  getPathPoints,
  getRelationshipConnection,
  type RelationshipConnectionInfo,
} from '../core/relationshipPath';
import { getTypeDisplay, isOutgoingForeignKey } from '../core/schema';
import { getHeaderColor, type Palette } from './theme';

const FONT_FAMILY = '"Malgun Gothic", "맑은 고딕", "Noto Sans KR", system-ui, sans-serif';
const MONO_FAMILY = 'Consolas, "D2Coding", monospace';

const FONT_TABLE_NAME = `bold 12.7px ${FONT_FAMILY}`;
const FONT_DB_BADGE = `9.3px ${FONT_FAMILY}`;
const FONT_COLUMN = `11.3px ${FONT_FAMILY}`;
const FONT_COLUMN_BOLD = `bold 11.3px ${FONT_FAMILY}`;
const FONT_KEY_BADGE = `9.3px ${MONO_FAMILY}`;
const FONT_KEY_BADGE_BOLD = `bold 9.3px ${MONO_FAMILY}`;
const FONT_REL_NAME = `10px ${FONT_FAMILY}`;

export interface DrawOptions {
  palette: Palette;
  zoom: number;
  selectedTableId?: string | null;
  /** Every selected table. Falls back to `selectedTableId` when absent. */
  selectedTableIds?: ReadonlySet<string>;
  selectedColumnId?: string | null;
  selectedRelationshipId?: string | null;
  highlightedColumnIds?: Set<string>;
  /** Skip selection chrome and route handles — used by the image exporter. */
  plain?: boolean;
  /** Relationship whose route is being recomputed live during a table drag. */
  liveRouteTableId?: string | null;
  /**
   * Transparent export: paint no backdrop behind a relationship label. The
   * label still needs to be readable where it sits on the line, so the line is
   * erased under it instead of being covered up — see `punchRelationshipLabel`.
   */
  transparentLabels?: boolean;
}

/** Draw a string clipped to `maxWidth`, appending an ellipsis when it overflows. */
function drawClippedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  if (!text) return;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  ctx.fillText(text.slice(0, lo) + ellipsis, x, y);
}

function drawTable(ctx: CanvasRenderingContext2D, schema: DbSchema, table: DbTable, o: DrawOptions): void {
  const p = o.palette;
  const zoom = o.zoom;
  const height = getTableHeight(table);
  const x = table.X;
  const y = table.Y;
  const w = table.Width;
  const selected =
    !o.plain && (o.selectedTableIds?.has(table.Id) ?? o.selectedTableId === table.Id);

  ctx.save();
  ctx.textBaseline = 'middle';

  // Drop shadow
  ctx.fillStyle = p.canvasShadow;
  ctx.fillRect(x + 3, y + 3, w, height);

  // Body
  ctx.fillStyle = p.canvasRowOdd;
  ctx.fillRect(x, y, w, height);

  // Header band
  ctx.fillStyle = getHeaderColor(schema.TargetDb);
  ctx.fillRect(x, y, w, HEADER_HEIGHT);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, HEADER_HEIGHT);
  ctx.clip();
  ctx.font = FONT_TABLE_NAME;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  drawClippedText(ctx, table.Name, x + 8, y + HEADER_HEIGHT / 2 + 1, w - 16);

  ctx.font = FONT_DB_BADGE;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.63)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(getDbDisplayName(schema.TargetDb), x + w - 4, y + 3);
  ctx.restore();

  // Column rows
  ctx.textBaseline = 'middle';
  const columns = table.Columns ?? [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (!col) continue;
    const rowY = y + HEADER_HEIGHT + i * ROW_HEIGHT;
    const columnSelected = !o.plain && o.selectedTableId === table.Id && o.selectedColumnId === col.Id;
    const highlighted = o.highlightedColumnIds?.has(col.Id) ?? false;

    ctx.fillStyle =
      columnSelected || highlighted
        ? p.canvasHighlightRow
        : i % 2 === 0
          ? p.canvasRowEven
          : p.canvasRowOdd;
    ctx.fillRect(x, rowY, w, ROW_HEIGHT);

    ctx.strokeStyle = p.canvasBorderLight;
    ctx.lineWidth = 0.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(x, rowY + ROW_HEIGHT);
    ctx.lineTo(x + w, rowY + ROW_HEIGHT);
    ctx.stroke();

    const isOutgoingFk = isOutgoingForeignKey(schema, table.Id, col.Id);
    const badge = col.IsPrimaryKey ? 'PK' : isOutgoingFk ? 'FK' : '';
    const badgeColor = col.IsPrimaryKey
      ? p.canvasPkText
      : isOutgoingFk
        ? p.canvasFkText
        : p.canvasTextPrimary;

    if (badge) {
      ctx.font = col.IsPrimaryKey ? FONT_KEY_BADGE_BOLD : FONT_KEY_BADGE;
      ctx.fillStyle = badgeColor;
      ctx.textAlign = 'center';
      ctx.fillText(badge, x + 13, rowY + ROW_HEIGHT / 2);
    }

    ctx.textAlign = 'left';
    ctx.font = col.IsPrimaryKey ? FONT_COLUMN_BOLD : FONT_COLUMN;
    ctx.fillStyle = col.IsPrimaryKey ? p.canvasPkText : p.canvasTextPrimary;
    drawClippedText(ctx, col.Name, x + 26, rowY + ROW_HEIGHT / 2, w * 0.48 - 28);

    ctx.font = FONT_COLUMN;
    ctx.fillStyle = p.canvasTextSecondary;
    drawClippedText(ctx, getTypeDisplay(col), x + w * 0.48, rowY + ROW_HEIGHT / 2, w * 0.52 - 6);
  }

  // Outline
  ctx.strokeStyle = selected ? p.accent : p.canvasBorder;
  ctx.lineWidth = selected ? 2.5 / zoom : 1 / zoom;
  ctx.strokeRect(x, y, w, height);

  if (selected) {
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.31)';
    ctx.lineWidth = 6 / zoom;
    ctx.strokeRect(x - 3, y - 3, w + 6, height + 6);
  }

  ctx.restore();
}

/** Crow's-foot / single-bar cardinality marker — port of DrawCardinality. */
function drawCardinality(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  other: Point,
  isMany: boolean,
): void {
  const dx = tip.x - other.x;
  const dy = tip.y - other.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const line = (a: Point, b: Point) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  line(
    { x: tip.x - ux * 14 - px * 7, y: tip.y - uy * 14 - py * 7 },
    { x: tip.x - ux * 14 + px * 7, y: tip.y - uy * 14 + py * 7 },
  );

  if (isMany) {
    const base = { x: tip.x - ux * 28, y: tip.y - uy * 28 };
    line(base, tip);
    line(base, { x: tip.x - px * 7, y: tip.y - py * 7 });
    line(base, { x: tip.x + px * 7, y: tip.y + py * 7 });
  } else {
    line(
      { x: tip.x - ux * 21 - px * 7, y: tip.y - uy * 21 - py * 7 },
      { x: tip.x - ux * 21 + px * 7, y: tip.y - uy * 21 + py * 7 },
    );
  }
}

function drawDiamond(ctx: CanvasRenderingContext2D, center: Point, r: number, fill: string, lineWidth: number): void {
  ctx.beginPath();
  ctx.moveTo(center.x, center.y - r);
  ctx.lineTo(center.x + r, center.y);
  ctx.lineTo(center.x, center.y + r);
  ctx.lineTo(center.x - r, center.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawRouteHandles(
  ctx: CanvasRenderingContext2D,
  rel: DbRelationship,
  connection: RelationshipConnectionInfo,
  o: DrawOptions,
): void {
  if (rel.LineStyle === 'Straight' || !rel.RoutePoints) return;
  const zoom = o.zoom;

  if (rel.LineStyle === 'Curved' && rel.RoutePoints.length >= 2) {
    const cp1 = { x: rel.RoutePoints[0].X, y: rel.RoutePoints[0].Y };
    const cp2 = { x: rel.RoutePoints[1].X, y: rel.RoutePoints[1].Y };

    ctx.save();
    ctx.setLineDash([2 / zoom, 3 / zoom]);
    ctx.strokeStyle = 'rgba(90, 140, 230, 0.71)';
    ctx.lineWidth = 1.2 / zoom;
    ctx.beginPath();
    ctx.moveTo(connection.start.x, connection.start.y);
    ctx.lineTo(cp1.x, cp1.y);
    ctx.moveTo(connection.end.x, connection.end.y);
    ctx.lineTo(cp2.x, cp2.y);
    ctx.stroke();
    ctx.restore();

    const r = 6 / zoom;
    drawDiamond(ctx, cp1, r, 'rgba(60, 130, 255, 0.94)', 1.5 / zoom);
    drawDiamond(ctx, cp2, r, 'rgba(40, 210, 140, 0.94)', 1.5 / zoom);
    return;
  }

  // Orthogonal: square handles at segment midpoints
  const pathPts = getPathPoints(rel, connection);
  const hr = 5 / zoom;
  for (let i = 0; i < pathPts.length - 1; i++) {
    const mid = {
      x: (pathPts[i].x + pathPts[i + 1].x) * 0.5,
      y: (pathPts[i].y + pathPts[i + 1].y) * 0.5,
    };
    ctx.fillStyle = 'rgba(255, 220, 60, 0.94)';
    ctx.fillRect(mid.x - hr, mid.y - hr, hr * 2, hr * 2);
    ctx.strokeStyle = 'rgba(160, 90, 0, 0.78)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(mid.x - hr, mid.y - hr, hr * 2, hr * 2);
  }
}

function drawRelationship(
  ctx: CanvasRenderingContext2D,
  schema: DbSchema,
  rel: DbRelationship,
  o: DrawOptions,
): void {
  const connection = getRelationshipConnection(schema, rel);
  if (!connection) return;

  const p = o.palette;
  const zoom = o.zoom;
  const liveRoute =
    !!o.liveRouteTableId &&
    rel.LineStyle === 'Orthogonal' &&
    (rel.SourceTableId === o.liveRouteTableId || rel.TargetTableId === o.liveRouteTableId);
  const pathPoints = getPathPoints(rel, connection, liveRoute);
  const selected = !o.plain && o.selectedRelationshipId === rel.Id;

  ctx.save();
  ctx.strokeStyle = selected ? p.accent : p.canvasRelLine;
  ctx.lineWidth = selected ? 3 / zoom : 2.2 / zoom;
  ctx.setLineDash([]);

  if (rel.LineStyle === 'Curved') {
    const [cp1, cp2] = getCubicControls(
      rel,
      connection.start,
      connection.end,
      connection.startEdge,
      connection.endEdge,
    );
    ctx.beginPath();
    ctx.moveTo(connection.start.x, connection.start.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, connection.end.x, connection.end.y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
    for (let i = 1; i < pathPoints.length; i++) ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
    ctx.stroke();
  }

  // Source end: "many" only for N:M. Target end: "many" for 1:N and N:M.
  const sourceMany = rel.Type === 'ManyToMany';
  const targetMany = rel.Type === 'OneToMany' || rel.Type === 'ManyToMany';
  drawCardinality(ctx, pathPoints[0], pathPoints[1], sourceMany);
  drawCardinality(
    ctx,
    pathPoints[pathPoints.length - 1],
    pathPoints[pathPoints.length - 2],
    targetMany,
  );

  if (selected && !liveRoute) drawRouteHandles(ctx, rel, connection, o);

  ctx.restore();
}

/**
 * Relationship name labels, painted after the tables so a label whose midpoint
 * falls under a table stays readable instead of being clipped by it.
 */
interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/**
 * Where a relationship's name sits, or null when it has none. Measuring is what
 * ties the erase pass and the text pass to the same rectangle, so the gap and
 * the label cannot drift apart.
 */
function measureRelationshipLabel(
  ctx: CanvasRenderingContext2D,
  schema: DbSchema,
  rel: DbRelationship,
  o: DrawOptions,
): LabelBox | null {
  if (!rel.Name || !rel.Name.trim()) return null;
  const connection = getRelationshipConnection(schema, rel);
  if (!connection) return null;

  const liveRoute =
    !!o.liveRouteTableId &&
    rel.LineStyle === 'Orthogonal' &&
    (rel.SourceTableId === o.liveRouteTableId || rel.TargetTableId === o.liveRouteTableId);
  const mid = getPathMidpoint(rel, connection, liveRoute);

  ctx.save();
  ctx.font = FONT_REL_NAME;
  const tw = ctx.measureText(rel.Name).width;
  ctx.restore();

  const th = 12;
  return {
    x: mid.x - tw / 2 - 3,
    y: mid.y - th / 2 - 2,
    w: tw + 6,
    h: th + 4,
    cx: mid.x,
    cy: mid.y,
  };
}

/**
 * Cut the relationship line out from under its label, leaving real
 * transparency rather than a painted chip. Runs between the line pass and the
 * table pass: erasing after the tables were drawn would punch a hole through a
 * table that happens to sit under the label.
 */
function punchRelationshipLabel(
  ctx: CanvasRenderingContext2D,
  schema: DbSchema,
  rel: DbRelationship,
  o: DrawOptions,
): void {
  const box = measureRelationshipLabel(ctx, schema, rel, o);
  if (!box) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

function drawRelationshipLabel(
  ctx: CanvasRenderingContext2D,
  schema: DbSchema,
  rel: DbRelationship,
  o: DrawOptions,
): void {
  const box = measureRelationshipLabel(ctx, schema, rel, o);
  if (!box) return;

  ctx.save();
  ctx.font = FONT_REL_NAME;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // On screen the chip hides the line behind the text. In a transparent export
  // that chip is exactly the painted background we do not want, and the line
  // has already been erased for us.
  if (!o.transparentLabels) {
    ctx.fillStyle = o.palette.canvasRelNameBg;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  ctx.fillStyle = o.palette.canvasRelText;
  ctx.fillText(rel.Name, box.cx, box.cy);
  ctx.restore();
}

/**
 * Draw the whole schema in canvas coordinates. The caller applies the pan/zoom
 * transform. Painted in three passes: relationship lines, then tables on top of
 * them, then the relationship labels above everything.
 */
export function drawSchema(ctx: CanvasRenderingContext2D, schema: DbSchema, o: DrawOptions): void {
  for (const rel of schema.Relationships) drawRelationship(ctx, schema, rel, o);
  if (o.transparentLabels) {
    for (const rel of schema.Relationships) punchRelationshipLabel(ctx, schema, rel, o);
  }
  for (const table of schema.Tables) drawTable(ctx, schema, table, o);
  for (const rel of schema.Relationships) drawRelationshipLabel(ctx, schema, rel, o);
}

/** Dashed preview line while a relationship is being dragged out. */
export function drawRelationPreview(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  zoom: number,
): void {
  ctx.save();
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.strokeStyle = 'rgba(255, 140, 0, 0.71)';
  ctx.lineWidth = 2.5 / zoom;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const r = 5 / zoom;
  ctx.fillStyle = 'orangered';
  ctx.beginPath();
  ctx.arc(from.x, from.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Minor/major grid — port of DrawGrid. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  originX: number,
  originY: number,
  width: number,
  height: number,
  zoom: number,
  interval: number,
): void {
  const minor = Math.max(5, interval);
  const major = minor * 5;
  const startX = Math.floor(originX / minor) * minor;
  const startY = Math.floor(originY / minor) * minor;

  ctx.save();
  ctx.lineWidth = 1 / zoom;
  for (let x = startX; x <= originX + width; x += minor) {
    ctx.strokeStyle = Math.round(x) % major === 0 ? palette.canvasGridMajor : palette.canvasGridMinor;
    ctx.beginPath();
    ctx.moveTo(x, originY);
    ctx.lineTo(x, originY + height);
    ctx.stroke();
  }
  for (let y = startY; y <= originY + height; y += minor) {
    ctx.strokeStyle = Math.round(y) % major === 0 ? palette.canvasGridMajor : palette.canvasGridMinor;
    ctx.beginPath();
    ctx.moveTo(originX, y);
    ctx.lineTo(originX + width, y);
    ctx.stroke();
  }
  ctx.restore();
}
