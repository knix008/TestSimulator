// Port of Import/SchemaLayout.cs
// Text measurement uses a canvas 2D context in the browser and a width
// approximation when no canvas is available (Node scripts).
import type { DbSchema, DbTable, DbTargetType } from '../types';
import { getDbDisplayName } from '../types';
import { ensureInitialized, getTypeDisplay } from './schema';
import { getTableHeight } from './geometry';

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

export function autoArrange(schema: DbSchema): void {
  if (!schema) return;
  ensureInitialized(schema);
  if (schema.Tables.length === 0) return;

  fitTableWidths(schema);
  const columns = Math.max(1, Math.ceil(Math.sqrt(schema.Tables.length)));
  const columnSpacing = Math.max(280, Math.max(...schema.Tables.map((t) => t.Width)) + 48);
  const rowSpacing = Math.max(220, Math.max(...schema.Tables.map((t) => getTableHeight(t))) + 36);
  schema.Tables.forEach((table, i) => {
    const row = Math.floor(i / columns);
    const col = i % columns;
    table.X = 40 + col * columnSpacing;
    table.Y = 60 + row * rowSpacing;
  });
}
