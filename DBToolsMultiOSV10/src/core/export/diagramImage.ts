// Port of Export/DiagramImageExporter.cs — renders the tables and relationship
// lines (no ruler, no grid) to a bitmap.
import type { DbSchema } from '../../types';
import { getAllTablesBounds } from '../geometry';
import { getPathPoints, getRelationshipConnection } from '../relationshipPath';
import { drawSchema } from '../../render/drawDiagram';
import { getPalette, isDarkTheme, type ThemeId } from '../../render/theme';

export type DiagramImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif';

const MARGIN = 24;
/** Cap total pixels so a huge diagram cannot exhaust memory. */
const MAX_PIXELS = 40_000_000;

const MIME: Record<DiagramImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

/** Union of the table bounds and every relationship path point. */
function getContentBounds(schema: DbSchema) {
  const tableBounds = getAllTablesBounds(schema);
  if (!tableBounds) return null;
  let minX = tableBounds.x;
  let minY = tableBounds.y;
  let maxX = tableBounds.x + tableBounds.w;
  let maxY = tableBounds.y + tableBounds.h;

  for (const rel of schema.Relationships) {
    const connection = getRelationshipConnection(schema, rel);
    if (!connection) continue;
    for (const p of getPathPoints(rel, connection)) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export interface DiagramImageOptions {
  theme?: ThemeId;
  scale?: number;
  /** PNG keeps the area around the diagram transparent; others fill white. */
  transparent?: boolean;
}

export function renderDiagramToCanvas(
  schema: DbSchema,
  options: DiagramImageOptions = {},
): HTMLCanvasElement {
  const bounds = getContentBounds(schema);
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
    throw new Error('내보낼 다이어그램이 없습니다.');
  }

  const palette = getPalette(options.theme ?? 'light');
  const contentW = bounds.w + MARGIN * 2;
  const contentH = bounds.h + MARGIN * 2;

  let scale = options.scale ?? 2;
  if (contentW * contentH * scale * scale > MAX_PIXELS) {
    scale = Math.max(1, Math.sqrt(MAX_PIXELS / (contentW * contentH)));
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(contentW * scale));
  canvas.height = Math.max(1, Math.round(contentH * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');

  if (!options.transparent) {
    ctx.fillStyle = options.theme && isDarkTheme(options.theme) ? palette.canvasBackground : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.scale(scale, scale);
  ctx.translate(MARGIN - bounds.x, MARGIN - bounds.y);
  drawSchema(ctx, schema, { palette, zoom: 1, plain: true });
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/** GIF via gifenc — canvas.toBlob does not encode GIF in any browser. */
async function encodeGif(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);
  const encoder = GIFEncoder();
  encoder.writeFrame(index, width, height, { palette });
  encoder.finish();
  return encoder.bytes();
}

export async function exportDiagramImage(
  schema: DbSchema,
  format: DiagramImageFormat,
  options: DiagramImageOptions = {},
): Promise<Uint8Array> {
  const canvas = renderDiagramToCanvas(schema, {
    ...options,
    transparent: options.transparent ?? format === 'png',
  });

  if (format === 'gif') return encodeGif(canvas);

  const mime = MIME[format];
  const blob = await canvasToBlob(canvas, mime, format === 'jpeg' ? 0.92 : undefined);
  if (!blob) throw new Error(`${format.toUpperCase()} 인코딩에 실패했습니다.`);
  if (blob.type !== mime) {
    // Chromium silently falls back to PNG for formats it cannot encode.
    throw new Error(`이 플랫폼은 ${format.toUpperCase()} 인코딩을 지원하지 않습니다.`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/** PNG data URL of the diagram — embedded in the HTML/PDF and Excel reports. */
export function renderDiagramDataUrl(schema: DbSchema, options: DiagramImageOptions = {}): string {
  const canvas = renderDiagramToCanvas(schema, { ...options, transparent: false });
  return canvas.toDataURL('image/png');
}
