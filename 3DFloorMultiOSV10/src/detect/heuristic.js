import { i18nError } from '../i18n/index.js';

/**
 * Offline heuristic detector (no ML weights).
 * Tuned for high-contrast architectural floor plans:
 * - removes hairline dimension ticks (morphological opening)
 * - merges only collinear wall runs (avoids giant hatch blobs)
 * - keeps thicker wall-like segments
 */
export async function detectHeuristic(file) {
  const bitmap = await createImageBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const width = Math.max(48, Math.round(srcW * scale));
  const height = Math.max(48, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const { data } = ctx.getImageData(0, 0, width, height);
  let binary = inkMask(data, width, height);

  // Remove 1px dimension lines / text underlines; keep thicker wall ink
  binary = dilate(erode(binary, width, height), width, height);
  binary = dilate(binary, width, height);

  const segments = [
    ...extractRuns(binary, width, height, 'h'),
    ...extractRuns(binary, width, height, 'v'),
  ];

  const merged = mergeParallelWalls(mergeCollinear(segments));
  const filtered = merged
    .map((s) => snapThinAxis(s))
    .filter((s) => isWallLike(s, width, height));

  const inv = 1 / scale;
  const points = [];
  const classes = [];

  for (const seg of filtered) {
    const box = {
      x1: seg.x1 * inv,
      y1: seg.y1 * inv,
      x2: seg.x2 * inv,
      y2: seg.y2 * inv,
    };
    const className = classifyOpening(seg, filtered);
    points.push(box);
    classes.push({ name: className });
  }

  if (points.length === 0) {
    throw i18nError('error.heuristicEmpty');
  }

  const doors = points.filter((_, i) => classes[i].name === 'door');
  let averageDoor = Math.max(24, Math.min(srcW, srcH) * 0.045);
  if (doors.length) {
    averageDoor =
      doors.reduce((acc, d) => acc + Math.max(d.x2 - d.x1, d.y2 - d.y1), 0) /
      doors.length;
  }

  return {
    Width: srcW,
    Height: srcH,
    averageDoor,
    points,
    classes,
  };
}

/** Dark OR strongly colored ink on light paper (handles green hand-drawn walls). */
function inkMask(data, width, height) {
  const binary = new Uint8Array(width * height);
  let sum = 0;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < binary.length; i += 1) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    sum += y;
  }
  const mean = sum / binary.length;
  const threshold = Math.max(50, Math.min(200, mean * 0.78));

  for (let i = 0; i < binary.length; i += 1) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const y = gray[i];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const coloredInk = sat > 28 && y < mean * 0.92;
    binary[i] = y < threshold || coloredInk ? 1 : 0;
  }
  return binary;
}

function erode(src, width, height) {
  const out = new Uint8Array(src.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (
        src[i]
        && src[i - 1]
        && src[i + 1]
        && src[i - width]
        && src[i + width]
      ) {
        out[i] = 1;
      }
    }
  }
  return out;
}

function dilate(src, width, height) {
  const out = new Uint8Array(src.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (
        src[i]
        || src[i - 1]
        || src[i + 1]
        || src[i - width]
        || src[i + width]
      ) {
        out[i] = 1;
      }
    }
  }
  return out;
}

function extractRuns(binary, width, height, axis) {
  const out = [];
  const minRun = 16;

  if (axis === 'h') {
    for (let y = 0; y < height; y += 1) {
      let x = 0;
      while (x < width) {
        while (x < width && !binary[y * width + x]) x += 1;
        const start = x;
        while (x < width && binary[y * width + x]) x += 1;
        const len = x - start;
        if (len >= minRun) {
          // Measure local thickness at mid-run
          const mid = (start + x) >> 1;
          const t = measureThickness(binary, width, height, mid, y, 'v');
          out.push({
            x1: start,
            y1: Math.max(0, y - Math.floor(t / 2)),
            x2: x,
            y2: Math.min(height, y + Math.ceil(t / 2)),
            axis: 'h',
          });
        }
      }
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      let y = 0;
      while (y < height) {
        while (y < height && !binary[y * width + x]) y += 1;
        const start = y;
        while (y < height && binary[y * width + x]) y += 1;
        const len = y - start;
        if (len >= minRun) {
          const mid = (start + y) >> 1;
          const t = measureThickness(binary, width, height, x, mid, 'h');
          out.push({
            x1: Math.max(0, x - Math.floor(t / 2)),
            y1: start,
            x2: Math.min(width, x + Math.ceil(t / 2)),
            y2: y,
            axis: 'v',
          });
        }
      }
    }
  }
  return out;
}

function measureThickness(binary, width, height, x, y, dir) {
  let t = 1;
  if (dir === 'v') {
    let y0 = y;
    let y1 = y;
    while (y0 > 0 && binary[(y0 - 1) * width + x]) y0 -= 1;
    while (y1 < height - 1 && binary[(y1 + 1) * width + x]) y1 += 1;
    t = y1 - y0 + 1;
  } else {
    let x0 = x;
    let x1 = x;
    while (x0 > 0 && binary[y * width + (x0 - 1)]) x0 -= 1;
    while (x1 < width - 1 && binary[y * width + (x1 + 1)]) x1 += 1;
    t = x1 - x0 + 1;
  }
  return Math.max(2, Math.min(14, t));
}

/** Merge only collinear wall runs so hatch fills don't become room-sized boxes. */
function mergeCollinear(segments) {
  const items = segments.map((s) => ({ ...s }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (a.axis !== b.axis) continue;
        if (a.axis === 'h') {
          const ay = (a.y1 + a.y2) / 2;
          const by = (b.y1 + b.y2) / 2;
          const xOverlap = !(a.x2 + 3 < b.x1 || b.x2 + 3 < a.x1);
          if (Math.abs(ay - by) <= 4 && xOverlap) {
            items[i] = {
              axis: 'h',
              x1: Math.min(a.x1, b.x1),
              x2: Math.max(a.x2, b.x2),
              y1: Math.min(a.y1, b.y1),
              y2: Math.max(a.y2, b.y2),
            };
            items.splice(j, 1);
            changed = true;
            break;
          }
        } else {
          const ax = (a.x1 + a.x2) / 2;
          const bx = (b.x1 + b.x2) / 2;
          const yOverlap = !(a.y2 + 3 < b.y1 || b.y2 + 3 < a.y1);
          if (Math.abs(ax - bx) <= 4 && yOverlap) {
            items[i] = {
              axis: 'v',
              x1: Math.min(a.x1, b.x1),
              x2: Math.max(a.x2, b.x2),
              y1: Math.min(a.y1, b.y1),
              y2: Math.max(a.y2, b.y2),
            };
            items.splice(j, 1);
            changed = true;
            break;
          }
        }
      }
      if (changed) break;
    }
  }
  return items;
}

/**
 * Collapse architectural double-line walls (two parallel strokes) into one box.
 * Wider gap than mergeCollinear — keeps a single centered wall.
 */
function mergeParallelWalls(segments) {
  const items = segments.map((s) => ({ ...s }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (a.axis !== b.axis) continue;

        if (a.axis === 'h') {
          const ay = (a.y1 + a.y2) / 2;
          const by = (b.y1 + b.y2) / 2;
          const ta = Math.max(1, a.y2 - a.y1);
          const tb = Math.max(1, b.y2 - b.y1);
          const maxGap = Math.max(10, Math.max(ta, tb) * 2.8);
          const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          const minLen = Math.min(a.x2 - a.x1, b.x2 - b.x1);
          if (Math.abs(ay - by) > maxGap || overlap < minLen * 0.4) continue;
          const cy = (ay + by) / 2;
          const t = Math.max(ta, tb);
          items[i] = {
            axis: 'h',
            x1: Math.min(a.x1, b.x1),
            x2: Math.max(a.x2, b.x2),
            y1: cy - t / 2,
            y2: cy + t / 2,
          };
        } else {
          const ax = (a.x1 + a.x2) / 2;
          const bx = (b.x1 + b.x2) / 2;
          const ta = Math.max(1, a.x2 - a.x1);
          const tb = Math.max(1, b.x2 - b.x1);
          const maxGap = Math.max(10, Math.max(ta, tb) * 2.8);
          const overlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
          const minLen = Math.min(a.y2 - a.y1, b.y2 - b.y1);
          if (Math.abs(ax - bx) > maxGap || overlap < minLen * 0.4) continue;
          const cx = (ax + bx) / 2;
          const t = Math.max(ta, tb);
          items[i] = {
            axis: 'v',
            x1: cx - t / 2,
            x2: cx + t / 2,
            y1: Math.min(a.y1, b.y1),
            y2: Math.max(a.y2, b.y2),
          };
        }

        items.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return items;
}

function snapThinAxis(seg) {
  const w = seg.x2 - seg.x1;
  const h = seg.y2 - seg.y1;
  if (w >= h) {
    // horizontal wall — clamp thickness
    const cy = (seg.y1 + seg.y2) / 2;
    const t = Math.max(2, Math.min(10, h));
    return {
      ...seg,
      axis: 'h',
      y1: cy - t / 2,
      y2: cy + t / 2,
    };
  }
  const cx = (seg.x1 + seg.x2) / 2;
  const t = Math.max(2, Math.min(10, w));
  return {
    ...seg,
    axis: 'v',
    x1: cx - t / 2,
    x2: cx + t / 2,
  };
}

function isWallLike(seg, width, height) {
  const w = seg.x2 - seg.x1;
  const h = seg.y2 - seg.y1;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  if (longSide < 18) return false;
  if (shortSide < 1.8) return false; // hairline dimensions
  if (shortSide > 16 && longSide / shortSide < 2.2) return false; // blob / filled hatch
  if (w * h < 36) return false;

  // Drop thin ticks hugging the image border (typical dimension chains)
  const margin = Math.min(width, height) * 0.04;
  const nearBorder =
    seg.x1 <= margin
    || seg.y1 <= margin
    || seg.x2 >= width - margin
    || seg.y2 >= height - margin;
  if (nearBorder && shortSide <= 3 && longSide < Math.min(width, height) * 0.35) {
    return false;
  }
  return true;
}

function classifyOpening(seg, all) {
  const w = seg.x2 - seg.x1;
  const h = seg.y2 - seg.y1;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  const area = w * h;

  if (longSide < 50 && shortSide <= 9) {
    return area < 260 ? 'door' : 'window';
  }
  if (longSide < 64 && shortSide <= 7) {
    const nearOuter = all.some((other) => other !== seg && nearEdge(seg, other));
    if (nearOuter) return longSide < 36 ? 'door' : 'window';
  }
  return 'wall';
}

function nearEdge(a, b) {
  const cx = (a.x1 + a.x2) / 2;
  const cy = (a.y1 + a.y2) / 2;
  return (
    cx >= b.x1 - 6
    && cx <= b.x2 + 6
    && cy >= b.y1 - 6
    && cy <= b.y2 + 6
  );
}
