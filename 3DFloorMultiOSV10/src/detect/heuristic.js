import { i18nError } from '../i18n/index.js';
import { loadOrientedPlanBitmap } from '../util/loadPlanImage.js';

/**
 * Offline heuristic detector (no ML weights).
 * Tuned for high-contrast architectural floor plans:
 * - removes hairline dimension ticks (morphological opening)
 * - merges only collinear wall runs (avoids giant hatch blobs)
 * - keeps thicker wall-like segments
 * - door/window from collinear wall gaps (not short-stub heuristics alone)
 * - drop room labels / dimension text (small CCs + sparse centerlines)
 *
 * Boxes are in EXIF-oriented image pixels (same as floor texture).
 */

/** Max short-axis thickness kept for wall boxes (working image px). */
const MAX_WALL_THICK_PX = 36;
/** Short side above this + low aspect → reject as filled hatch / room blob. */
const BLOB_SHORT_SIDE_PX = 48;
/**
 * Max center distance when collapsing double-line walls.
 * Must NOT scale with wall thickness — otherwise thick walls merge across rooms.
 */
const MAX_PARALLEL_CENTER_GAP_PX = 16;
/** Only bridge hairline breaks — must stay below typical window/door gaps. */
const MAX_TINY_GAP_MERGE_PX = 5;

export async function detectHeuristic(file) {
  const bitmap = await loadOrientedPlanBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const maxSide = 720;
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
  // Strip letter-sized blobs / sparse word bands before run extraction
  binary = removeTextComponents(binary, width, height);

  const binaryH = dilateAxis(binary, width, height, 'h');
  const binaryV = dilateAxis(binary, width, height, 'v');

  const minSide = Math.min(width, height);
  const segments = [
    ...extractRuns(binaryH, width, height, 'h', Math.max(10, Math.round(minSide * 0.02))),
    ...extractRuns(binaryV, width, height, 'v', Math.max(8, Math.round(minSide * 0.014))),
  ];

  // Tiny merge only — larger gaps are door/window openings, not wall joins
  const tinyMerge = Math.max(2, Math.min(MAX_TINY_GAP_MERGE_PX, Math.round(minSide * 0.006)));
  const merged = mergeParallelWalls(
    consolidateNearby(mergeCollinear(segments), tinyMerge),
    Math.max(8, Math.min(MAX_PARALLEL_CENTER_GAP_PX, Math.round(minSide * 0.028))),
  );
  const filtered = rejectTextClusters(
    merged
      .map((s) => snapThinAxis(s))
      .filter((s) => isWallLike(s, width, height))
      .filter((s) => centerlineSolid(s, binary, width, height)),
    width,
    height,
  );

  const { points: workPoints, classes: workClasses } = wallsAndOpenings(
    filtered,
    width,
    height,
  );

  const inv = 1 / scale;
  const points = workPoints.map((p) => ({
    x1: p.x1 * inv,
    y1: p.y1 * inv,
    x2: p.x2 * inv,
    y2: p.y2 * inv,
  }));
  const classes = workClasses;

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
    source: 'heuristic',
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

function dilateAxis(src, width, height, axis) {
  const out = new Uint8Array(src.length);
  const offsets = axis === 'h'
    ? [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
    : [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-2, 0], [2, 0]];

  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const i = y * width + x;
      for (const [dx, dy] of offsets) {
        if (src[(y + dy) * width + (x + dx)]) {
          out[i] = 1;
          break;
        }
      }
    }
  }
  return out;
}

function extractRuns(binary, width, height, axis, minRun) {
  const out = [];
  const runMin = Math.max(6, minRun || 16);

  if (axis === 'h') {
    for (let y = 0; y < height; y += 1) {
      let x = 0;
      while (x < width) {
        while (x < width && !binary[y * width + x]) x += 1;
        const start = x;
        while (x < width && binary[y * width + x]) x += 1;
        const len = x - start;
        if (len >= runMin) {
          const mid = (start + x) >> 1;
          const band = thicknessBand(binary, width, height, mid, y, 'v');
          if (!band || y !== band.mid) continue;
          if (band.t > MAX_WALL_THICK_PX * 1.75) continue;
          const t = Math.max(2, Math.min(MAX_WALL_THICK_PX, band.t));
          out.push({
            x1: start,
            y1: Math.max(0, band.mid - Math.floor(t / 2)),
            x2: x,
            y2: Math.min(height, band.mid + Math.ceil(t / 2)),
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
        if (len >= runMin) {
          const mid = (start + y) >> 1;
          const band = thicknessBand(binary, width, height, x, mid, 'h');
          if (!band || x !== band.mid) continue;
          if (band.t > MAX_WALL_THICK_PX * 1.75) continue;
          const t = Math.max(2, Math.min(MAX_WALL_THICK_PX, band.t));
          out.push({
            x1: Math.max(0, band.mid - Math.floor(t / 2)),
            y1: start,
            x2: Math.min(width, band.mid + Math.ceil(t / 2)),
            y2: y,
            axis: 'v',
          });
        }
      }
    }
  }
  return out;
}

function thicknessBand(binary, width, height, x, y, dir) {
  if (y < 0 || y >= height || x < 0 || x >= width || !binary[y * width + x]) return null;
  if (dir === 'v') {
    let y0 = y;
    let y1 = y;
    while (y0 > 0 && binary[(y0 - 1) * width + x]) y0 -= 1;
    while (y1 < height - 1 && binary[(y1 + 1) * width + x]) y1 += 1;
    return { t: y1 - y0 + 1, mid: (y0 + y1) >> 1 };
  }
  let x0 = x;
  let x1 = x;
  while (x0 > 0 && binary[y * width + (x0 - 1)]) x0 -= 1;
  while (x1 < width - 1 && binary[y * width + (x1 + 1)]) x1 += 1;
  return { t: x1 - x0 + 1, mid: (x0 + x1) >> 1 };
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

function consolidateNearby(segments, centerTol) {
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
          const gap = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
          const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          if (Math.abs(ay - by) > centerTol || (gap > centerTol && overlap < 0)) continue;
          const cy = (ay + by) / 2;
          const t = Math.max(a.y2 - a.y1, b.y2 - b.y1);
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
          const gap = Math.max(0, Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2));
          const overlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
          if (Math.abs(ax - bx) > centerTol * 1.5 || (gap > centerTol && overlap < 0)) continue;
          const cx = (ax + bx) / 2;
          const t = Math.max(a.x2 - a.x1, b.x2 - b.x1);
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

/**
 * Collapse architectural double-line walls (two parallel strokes) into one box.
 * Gap is capped — never scales with stroke thickness (avoids merging across rooms).
 */
function mergeParallelWalls(segments, maxCenterGap = MAX_PARALLEL_CENTER_GAP_PX) {
  const items = segments.map((s) => ({ ...s }));
  const gapLimit = Math.max(6, Math.min(MAX_PARALLEL_CENTER_GAP_PX, maxCenterGap || MAX_PARALLEL_CENTER_GAP_PX));
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
          // Double-line only: faces nearly touch (thickness must not widen the budget)
          const faceGap = Math.abs(ay - by) - (ta + tb) / 2;
          if (faceGap > Math.max(2, gapLimit * 0.35)) continue;
          const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          const minLen = Math.min(a.x2 - a.x1, b.x2 - b.x1);
          if (overlap < minLen * 0.45) continue;
          const cy = (ay + by) / 2;
          const t = Math.min(MAX_WALL_THICK_PX, Math.max(ta, tb, Math.abs(ay - by) + Math.min(ta, tb)));
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
          const faceGap = Math.abs(ax - bx) - (ta + tb) / 2;
          if (faceGap > Math.max(2, gapLimit * 0.35)) continue;
          const overlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
          const minLen = Math.min(a.y2 - a.y1, b.y2 - b.y1);
          if (overlap < minLen * 0.45) continue;
          const cx = (ax + bx) / 2;
          const t = Math.min(MAX_WALL_THICK_PX, Math.max(ta, tb, Math.abs(ax - bx) + Math.min(ta, tb)));
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
    const t = Math.max(2, Math.min(MAX_WALL_THICK_PX, h));
    return {
      ...seg,
      axis: 'h',
      y1: cy - t / 2,
      y2: cy + t / 2,
    };
  }
  const cx = (seg.x1 + seg.x2) / 2;
  const t = Math.max(2, Math.min(MAX_WALL_THICK_PX, w));
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
  const minSide = Math.min(width, height);
  if (longSide < 18) return false;
  if (shortSide < 1.8) return false; // hairline dimensions
  if (shortSide > BLOB_SHORT_SIDE_PX && longSide / shortSide < 2.2) return false; // blob / filled hatch
  if (w * h < 36) return false;

  // Short medium bars with weak aspect are usually labels, not walls
  if (longSide < minSide * 0.07 && longSide / shortSide < 3.2) return false;

  // Drop thin ticks hugging the image border (typical dimension chains)
  const margin = minSide * 0.04;
  const nearBorder =
    seg.x1 <= margin
    || seg.y1 <= margin
    || seg.x2 >= width - margin
    || seg.y2 >= height - margin;
  if (nearBorder && shortSide <= 3 && longSide < minSide * 0.35) {
    return false;
  }
  return true;
}

/**
 * Clear letter-sized / sparse label blobs from the ink mask.
 * Long solid strokes (walls) are kept.
 */
function removeTextComponents(binary, width, height) {
  const n = width * height;
  const visited = new Uint8Array(n);
  const out = new Uint8Array(binary);
  const minSide = Math.min(width, height);
  const maxGlyphArea = Math.max(36, Math.round(minSide * minSide * 0.00055));
  const maxGlyphLong = Math.max(12, Math.round(minSide * 0.05));
  const maxWordArea = Math.max(80, Math.round(minSide * minSide * 0.0016));
  const maxWordShort = Math.max(5, Math.round(minSide * 0.028));
  const maxWordLong = Math.max(28, Math.round(minSide * 0.22));

  for (let seed = 0; seed < n; seed += 1) {
    if (!binary[seed] || visited[seed]) continue;

    const stack = [seed];
    visited[seed] = 1;
    const pixels = [];
    let minX = seed % width;
    let maxX = minX;
    let minY = (seed / width) | 0;
    let maxY = minY;

    while (stack.length) {
      const p = stack.pop();
      pixels.push(p);
      const x = p % width;
      const y = (p / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const candidates = [];
      if (x > 0) candidates.push(p - 1);
      if (x + 1 < width) candidates.push(p + 1);
      if (y > 0) candidates.push(p - width);
      if (y + 1 < height) candidates.push(p + width);
      for (const q of candidates) {
        if (visited[q] || !binary[q]) continue;
        visited[q] = 1;
        stack.push(q);
      }
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const area = pixels.length;
    const longSide = Math.max(bw, bh);
    const shortSide = Math.min(bw, bh);
    const fill = area / Math.max(1, bw * bh);
    const aspect = longSide / Math.max(1, shortSide);

    // Compact glyph / digit
    const glyph = area <= maxGlyphArea
      && longSide <= maxGlyphLong
      && aspect <= 3.6;

    // Sparse word / dimension string (broken letter ink)
    const wordBand = shortSide <= maxWordShort
      && longSide <= maxWordLong
      && area <= maxWordArea
      && fill < 0.52
      && aspect >= 2.2
      && longSide < minSide * 0.28;

    // Tiny stroke fragments (serif crumbs, dimension ticks)
    const crumb = area <= Math.max(18, maxGlyphArea * 0.35)
      && longSide <= maxGlyphLong * 0.85;

    if (!(glyph || wordBand || crumb)) continue;
    // Never wipe a long solid wall stroke
    if (aspect >= 5 && fill >= 0.55 && longSide >= maxGlyphLong * 1.6) continue;

    for (const p of pixels) out[p] = 0;
  }
  return out;
}

/** Walls are mostly solid along the centerline; labels are intermittent. */
function centerlineSolid(seg, binary, width, height) {
  const step = 1;
  let ink = 0;
  let n = 0;
  if (seg.axis === 'h') {
    const y = Math.max(0, Math.min(height - 1, Math.round((seg.y1 + seg.y2) / 2)));
    const x0 = Math.max(0, Math.floor(seg.x1));
    const x1 = Math.min(width - 1, Math.ceil(seg.x2));
    for (let x = x0; x <= x1; x += step) {
      n += 1;
      const i = y * width + x;
      if (
        binary[i]
        || (y > 0 && binary[i - width])
        || (y + 1 < height && binary[i + width])
      ) {
        ink += 1;
      }
    }
  } else {
    const x = Math.max(0, Math.min(width - 1, Math.round((seg.x1 + seg.x2) / 2)));
    const y0 = Math.max(0, Math.floor(seg.y1));
    const y1 = Math.min(height - 1, Math.ceil(seg.y2));
    for (let y = y0; y <= y1; y += step) {
      n += 1;
      const i = y * width + x;
      if (
        binary[i]
        || (x > 0 && binary[i - 1])
        || (x + 1 < width && binary[i + 1])
      ) {
        ink += 1;
      }
    }
  }
  if (n < 8) return ink >= n * 0.45;
  const longSide = Math.max(seg.x2 - seg.x1, seg.y2 - seg.y1);
  const minSide = Math.min(width, height);
  // Longer candidates need higher solidity; short stubs a bit looser
  const need = longSide > minSide * 0.12 ? 0.62 : 0.5;
  return ink / n >= need;
}

/**
 * Drop short segments that sit in a pack of other short segments (room labels).
 */
function rejectTextClusters(segs, width, height) {
  const minSide = Math.min(width, height);
  const shortLimit = Math.max(22, minSide * 0.09);
  const radius = Math.max(18, minSide * 0.055);
  const out = [];

  for (let i = 0; i < segs.length; i += 1) {
    const s = segs[i];
    const longSide = Math.max(s.x2 - s.x1, s.y2 - s.y1);
    if (longSide >= shortLimit) {
      out.push(s);
      continue;
    }
    const cx = (s.x1 + s.x2) / 2;
    const cy = (s.y1 + s.y2) / 2;
    let neighbors = 0;
    for (let j = 0; j < segs.length; j += 1) {
      if (i === j) continue;
      const o = segs[j];
      const oLong = Math.max(o.x2 - o.x1, o.y2 - o.y1);
      if (oLong >= shortLimit) continue;
      const ox = (o.x1 + o.x2) / 2;
      const oy = (o.y1 + o.y2) / 2;
      if (Math.hypot(ox - cx, oy - cy) <= radius) neighbors += 1;
    }
    // Isolated short stub (door plate / wall end) kept; label packs dropped
    if (neighbors >= 2) continue;
    out.push(s);
  }
  return out;
}

/**
 * Emit wall boxes plus door/window boxes in collinear gaps.
 * Floor-plan windows are usually breaks in outer walls, not short ink stubs.
 */
function wallsAndOpenings(segs, width, height) {
  const bands = openingBands(width, height);
  /** @type {{ x1: number, y1: number, x2: number, y2: number }[]} */
  const points = [];
  /** @type {{ name: string }[]} */
  const classes = [];

  for (const s of segs) {
    points.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
    // Keep short ink stubs that look like drawn door/window plates
    classes.push({ name: classifyOpeningStub(s, segs, width, height) });
  }

  for (const axis of ['h', 'v']) {
    const clusters = clusterByCenter(
      segs.filter((s) => s.axis === axis),
      axis,
      axis === 'v' ? 10 : 7,
    );
    for (const items of clusters) {
      items.sort((a, b) => (axis === 'h' ? a.x1 - b.x1 : a.y1 - b.y1));
      for (let i = 0; i < items.length - 1; i += 1) {
        const a = items[i];
        const b = items[i + 1];
        const gap = axis === 'h' ? b.x1 - a.x2 : b.y1 - a.y2;
        if (!(gap > MAX_TINY_GAP_MERGE_PX)) continue;

        const center = axis === 'h'
          ? ((a.y1 + a.y2) / 2 + (b.y1 + b.y2) / 2) / 2
          : ((a.x1 + a.x2) / 2 + (b.x1 + b.x2) / 2) / 2;
        const nearBorder = axis === 'h'
          ? center < height * 0.14 || center > height * 0.86
          : center < width * 0.14 || center > width * 0.86;
        const kind = classifyGapType(gap, bands, nearBorder);
        if (!kind) continue;

        if (axis === 'h') {
          const cy = center;
          const t = Math.max(2, Math.min(
            MAX_WALL_THICK_PX,
            Math.max(a.y2 - a.y1, b.y2 - b.y1),
          ));
          points.push({
            x1: a.x2,
            y1: cy - t / 2,
            x2: b.x1,
            y2: cy + t / 2,
          });
        } else {
          const cx = center;
          const t = Math.max(2, Math.min(
            MAX_WALL_THICK_PX,
            Math.max(a.x2 - a.x1, b.x2 - b.x1),
          ));
          points.push({
            x1: cx - t / 2,
            y1: a.y2,
            x2: cx + t / 2,
            y2: b.y1,
          });
        }
        classes.push({ name: kind });
      }
    }
  }

  return { points, classes };
}

function openingBands(width, height) {
  const minSide = Math.min(width, height);
  return {
    doorMin: Math.max(8, minSide * 0.022),
    doorMax: Math.max(24, minSide * 0.13),
    windowMin: Math.max(12, minSide * 0.028),
    windowMax: Math.max(40, minSide * 0.28),
  };
}

function classifyGapType(gap, bands, nearBorder) {
  const inDoor = gap >= bands.doorMin && gap <= bands.doorMax;
  const inWindow = gap >= bands.windowMin && gap <= bands.windowMax;
  if (inDoor && inWindow) {
    // Overlap band: exterior / wider → window, interior → door
    if (nearBorder) return gap > (bands.doorMin + bands.doorMax) * 0.5 ? 'window' : 'door';
    return 'door';
  }
  if (inDoor) {
    if (nearBorder && gap > (bands.doorMin + bands.doorMax) * 0.55) return 'window';
    return 'door';
  }
  if (inWindow) return 'window';
  return null;
}

function clusterByCenter(segs, axis, tol) {
  const clusters = [];
  for (const s of segs) {
    const key = axis === 'h' ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2;
    let cluster = clusters.find((c) => Math.abs(c.key - key) <= tol);
    if (!cluster) {
      cluster = { key, items: [] };
      clusters.push(cluster);
    }
    cluster.items.push(s);
  }
  return clusters.map((c) => c.items);
}

/** Fallback for drawn door/window plates (short ink), not gap openings. */
function classifyOpeningStub(seg, all, width, height) {
  const w = seg.x2 - seg.x1;
  const h = seg.y2 - seg.y1;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  if (longSide >= 56 || shortSide > 10) return 'wall';

  const cx = (seg.x1 + seg.x2) / 2;
  const cy = (seg.y1 + seg.y2) / 2;
  const nearBorder = seg.axis === 'h'
    ? cy < height * 0.14 || cy > height * 0.86
    : cx < width * 0.14 || cx > width * 0.86;

  // Must sit on / near a longer collinear wall (opening plate), not free noise
  const onWall = all.some((other) => {
    if (other === seg || other.axis !== seg.axis) return false;
    const oLong = Math.max(other.x2 - other.x1, other.y2 - other.y1);
    if (oLong < longSide * 1.4) return false;
    if (seg.axis === 'h') {
      return Math.abs(((other.y1 + other.y2) / 2) - cy) <= 8
        && cx >= other.x1 - 4
        && cx <= other.x2 + 4;
    }
    return Math.abs(((other.x1 + other.x2) / 2) - cx) <= 8
      && cy >= other.y1 - 4
      && cy <= other.y2 + 4;
  });
  if (!onWall && !nearBorder) return 'wall';

  if (nearBorder && longSide >= 18) return 'window';
  if (longSide < 36) return 'door';
  return nearBorder ? 'window' : 'door';
}
