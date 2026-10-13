const BACKGROUND = '#121418';
const INK = '#f3f1ea';

export function layoutAspect(result) {
  if (!result.edited) return result.imageWidth / result.imageHeight;
  const lines = result.text.split('\n');
  const rows = Math.max(1, lines.length);
  const cols = Math.max(1, ...lines.map((line) => Array.from(line).length));
  return (cols * result.cellRatio) / rows;
}

const MAX_EDGE = 8192;

export function paintAscii(canvas, result, cssWidth, dpr = 1) {
  const aspect = layoutAspect(result);
  const lines = result.text.split('\n');
  const rows = result.edited ? Math.max(1, lines.length) : result.rows;
  const cols = result.edited
    ? Math.max(1, ...lines.map((line) => Array.from(line).length))
    : result.cols;

  const scale = Math.max(2, (dpr || 1) * 2);
  let pixelWidth = Math.max(cols, Math.round(cssWidth * scale));
  let pixelHeight = Math.max(rows, Math.round(pixelWidth / aspect));
  const longSide = Math.max(pixelWidth, pixelHeight);
  if (longSide > MAX_EDGE) {
    const fitted = MAX_EDGE / longSide;
    pixelWidth = Math.max(cols, Math.round(pixelWidth * fitted));
    pixelHeight = Math.max(rows, Math.round(pixelHeight * fitted));
  }

  let cellWidth = Math.max(1, Math.round(pixelWidth / cols));
  let cellHeight = Math.max(1, Math.round((cellWidth * cols) / aspect / rows));
  pixelWidth = cellWidth * cols;
  pixelHeight = cellHeight * rows;
  if (Math.max(pixelWidth, pixelHeight) > MAX_EDGE) {
    const fitted = MAX_EDGE / Math.max(pixelWidth, pixelHeight);
    cellWidth = Math.max(1, Math.floor(cellWidth * fitted));
    cellHeight = Math.max(1, Math.floor(cellHeight * fitted));
    pixelWidth = cellWidth * cols;
    pixelHeight = cellHeight * rows;
  }

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssWidth / aspect}px`;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, pixelWidth, pixelHeight);

  const fitted = fitFontSize(ctx, result.fontFamily, cellWidth, cellHeight, result);
  ctx.font = `${fitted.size}px ${result.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if ('fontKerning' in ctx) ctx.fontKerning = 'none';
  if ('textRendering' in ctx) ctx.textRendering = 'geometricPrecision';
  const baseline = Math.round((cellHeight - fitted.ink) / 2 + fitted.ascent);
  const useColor = result.colors && !result.edited;
  if (!useColor) ctx.fillStyle = INK;

  for (let y = 0; y < rows; y++) {
    const glyphs = Array.from(lines[y] ?? '');
    const top = y * cellHeight + baseline;
    for (let x = 0; x < cols; x++) {
      const glyph = glyphs[x] ?? ' ';
      if (glyph === ' ') continue;
      if (useColor) {
        const colorIndex = (y * result.cols + x) * 3;
        ctx.fillStyle = `rgb(${result.colors[colorIndex]},${result.colors[colorIndex + 1]},${result.colors[colorIndex + 2]})`;
      }
      ctx.fillText(glyph, x * cellWidth + cellWidth / 2, top);
    }
  }

  return canvas;
}

function fitFontSize(ctx, fontFamily, cellWidth, cellHeight, result) {
  const probe = 100;
  ctx.font = `${probe}px ${fontFamily}`;
  const wanted = cellWidth / cellHeight;
  const glyphs = [...new Set(Array.from(result.text))].filter((glyph) => glyph !== ' ' && glyph !== '\n');
  if (!glyphs.length) glyphs.push('M');
  let best = null;
  for (const glyph of glyphs) {
    const metrics = inkOf(ctx.measureText(glyph));
    if (!(metrics.advance > 0) || !(metrics.ink > 0)) continue;
    const error = Math.abs(metrics.advance / metrics.ink - wanted);
    if (!best || error < best.error) best = { error, ...metrics };
  }
  const chosen = best || { advance: probe * 0.6, ink: probe * 0.7, ascent: probe * 0.7 };
  const size = Math.max(1, Math.min(
    probe * (cellWidth / chosen.advance),
    probe * (cellHeight / chosen.ink),
  ));
  const scale = size / probe;
  return {
    size,
    ink: chosen.ink * scale,
    ascent: chosen.ascent * scale,
  };
}

function inkOf(metrics) {
  const ascent = metrics.actualBoundingBoxAscent || metrics.fontBoundingBoxAscent || 0;
  const descent = Math.max(0, metrics.actualBoundingBoxDescent || 0);
  return {
    advance: metrics.width,
    ascent,
    ink: ascent + descent,
  };
}

export function makePreviewUrl(bitmap, maxEdge = 720) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

export function exportPixelWidth(result, longSide = 3200) {
  const aspect = layoutAspect(result);
  const width = aspect >= 1 ? longSide : Math.max(1, Math.round(longSide * aspect));
  return Math.max(width, result.cols * 16);
}
