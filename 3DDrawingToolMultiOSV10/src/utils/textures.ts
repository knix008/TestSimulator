export type TexturePresetId =
  | 'none'
  | 'checker'
  | 'bricks'
  | 'wood'
  | 'metal'
  | 'noise'
  | 'stripes'
  | 'dots'
  | 'carbon'
  | 'marble';

export interface TexturePreset {
  id: TexturePresetId;
  labelKey: string;
}

export const TEXTURE_PRESETS: TexturePreset[] = [
  { id: 'none', labelKey: 'properties.textureNone' },
  { id: 'checker', labelKey: 'properties.textureChecker' },
  { id: 'bricks', labelKey: 'properties.textureBricks' },
  { id: 'wood', labelKey: 'properties.textureWood' },
  { id: 'metal', labelKey: 'properties.textureMetal' },
  { id: 'noise', labelKey: 'properties.textureNoise' },
  { id: 'stripes', labelKey: 'properties.textureStripes' },
  { id: 'dots', labelKey: 'properties.textureDots' },
  { id: 'carbon', labelKey: 'properties.textureCarbon' },
  { id: 'marble', labelKey: 'properties.textureMarble' },
];

const cache = new Map<string, string>();

function canvas2d(size = 256): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  return { canvas, ctx };
}

function toDataUrl(id: TexturePresetId, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const cached = cache.get(id);
  if (cached) return cached;
  const size = 256;
  const { canvas, ctx } = canvas2d(size);
  draw(ctx, size);
  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
}

function drawChecker(ctx: CanvasRenderingContext2D, size: number) {
  const n = 8;
  const cell = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f0f0f0' : '#303030';
      ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }
}

function drawBricks(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#6b3a2a';
  ctx.fillRect(0, 0, size, size);
  const rows = 8;
  const rowH = size / rows;
  ctx.strokeStyle = '#d4c4b0';
  ctx.lineWidth = 3;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const offset = r % 2 === 0 ? 0 : size / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    for (let x = offset; x < size + size / 2; x += size / 2) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + rowH);
      ctx.stroke();
    }
  }
}

function drawWood(ctx: CanvasRenderingContext2D, size: number) {
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, '#8b5a2b');
  g.addColorStop(0.35, '#c4a35a');
  g.addColorStop(0.55, '#7a4a22');
  g.addColorStop(0.8, '#d2b48c');
  g.addColorStop(1, '#6b3e1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(60,30,10,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 28; i++) {
    const x = (i / 28) * size + Math.sin(i * 1.7) * 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 8, size * 0.33, x - 6, size * 0.66, x + 4, size);
    ctx.stroke();
  }
}

function drawMetal(ctx: CanvasRenderingContext2D, size: number) {
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#dfe6ee');
  g.addColorStop(0.45, '#8b97a5');
  g.addColorStop(1, '#e8eef4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < size; i += 3) {
    ctx.fillRect(i, 0, 1, size);
  }
}

function drawNoise(ctx: CanvasRenderingContext2D, size: number) {
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 80 + Math.random() * 120;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function drawStripes(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#94a3b8';
  const band = size / 10;
  for (let y = 0; y < size; y += band * 2) {
    ctx.fillRect(0, y, size, band);
  }
}

function drawDots(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#334155';
  const step = size / 8;
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, step * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCarbon(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, size, size);
  const step = size / 16;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#1f2937' : '#0b1220';
      ctx.fillRect(x * step, y * step, step, step);
      ctx.fillStyle = 'rgba(148,163,184,0.12)';
      ctx.fillRect(x * step, y * step, step * 0.55, step * 0.55);
    }
  }
}

function drawMarble(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#e8e6e1';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(100,100,110,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < size) {
      x += (Math.random() - 0.5) * 40;
      y += 12 + Math.random() * 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(160,140,120,0.35)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.quadraticCurveTo(Math.random() * size, Math.random() * size, Math.random() * size, Math.random() * size);
    ctx.stroke();
  }
}

export function getPresetTextureUrl(id: TexturePresetId): string | undefined {
  if (id === 'none') return undefined;
  switch (id) {
    case 'checker':
      return toDataUrl(id, drawChecker);
    case 'bricks':
      return toDataUrl(id, drawBricks);
    case 'wood':
      return toDataUrl(id, drawWood);
    case 'metal':
      return toDataUrl(id, drawMetal);
    case 'noise':
      return toDataUrl(id, drawNoise);
    case 'stripes':
      return toDataUrl(id, drawStripes);
    case 'dots':
      return toDataUrl(id, drawDots);
    case 'carbon':
      return toDataUrl(id, drawCarbon);
    case 'marble':
      return toDataUrl(id, drawMarble);
    default:
      return undefined;
  }
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Tiny preview swatch for UI (reuses preset cache). */
export function getTexturePreview(id: TexturePresetId): string | null {
  if (id === 'none') return null;
  return getPresetTextureUrl(id) ?? null;
}
