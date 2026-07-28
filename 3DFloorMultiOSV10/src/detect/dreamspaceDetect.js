import { i18nError } from '../i18n/index.js';
import { loadOrientedPlanBitmap } from '../util/loadPlanImage.js';
import { normalizeDreamspaceParams } from './dreamspaceParams.js';

/**
 * DreamSpaceAI-style floor-plan processor (inspired by
 * https://github.com/jevintanjh/DreamSpaceAI floorPlanProcessor + 3dConversionEngine).
 *
 * Upstream ships mock data only; this port extracts walls from the image:
 * 1) ink mask → full H/V scanlines (vertical path uses extra H-dilate)
 * 2) collinear stubs → single wall; door/window gaps → hasOpening
 * 3) fixed architectural thickness (meters)
 * 4) optional room flood-fill for labels
 *
 * Does NOT import or call heuristic.js.
 */

const WALL_THICKNESS_M = 0.15;
/** Max short-axis thickness kept for wall boxes (working image px). */
const MAX_WALL_THICK_PX = 36;
/** Short side above this + low aspect → reject as filled hatch / room blob. */
const BLOB_SHORT_SIDE_PX = 48;
/** Cap for parallel double-line collapse (must not grow with wall thickness). */
const MAX_PARALLEL_CENTER_GAP_PX = 18;

/**
 * Process an image into DreamSpace FloorPlanData (meter space).
 * @param {File | Blob} file
 * @param {Partial<import('./dreamspaceParams.js').DreamspaceParams>} [options]
 */
export async function processFloorPlanFromImage(file, options = {}) {
  const params = normalizeDreamspaceParams(options);
  const bitmap = await loadOrientedPlanBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const maxSide = params.maxSide;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const width = Math.max(80, Math.round(srcW * scale));
  const height = Math.max(80, Math.round(srcH * scale));
  const minSide = Math.min(width, height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const { data } = ctx.getImageData(0, 0, width, height);
  let binary = inkMask(data, width, height, params.inkMeanScale);
  // Open (drop ticks). Avoid morphological close — it seals door/window gaps.
  if (params.morphOpen) {
    binary = dilate(erode(binary, width, height), width, height);
  }
  for (let i = 0; i < params.extraDilate; i += 1) {
    binary = dilate(binary, width, height);
  }

  // Vertical walls: thicken in X so 1px strokes survive column scans.
  let binaryV = binary;
  for (let i = 0; i < params.verticalDilate; i += 1) {
    binaryV = dilateHorizontal(binaryV, width, height);
  }

  const minRunH = Math.max(params.minRunFloorH, Math.round(minSide * params.minRunRatioH));
  const minRunV = Math.max(params.minRunFloorV, Math.round(minSide * params.minRunRatioV));

  let segs = [
    ...extractScanlineWalls(binary, width, height, 'h', minRunH),
    ...extractScanlineWalls(binaryV, width, height, 'v', minRunV),
  ];

  const mergeGap = Math.max(3, Math.round(minSide * params.mergeGapRatio));
  // Cap parallel collapse — thick walls must not merge across rooms
  const parallelGap = Math.min(
    MAX_PARALLEL_CENTER_GAP_PX,
    Math.max(6, Math.round(minSide * params.parallelGapRatio)),
  );
  const vCenterTol = Math.max(4, Math.round(Math.max(3, minSide * 0.008) * params.verticalMergeScale));

  const hCenterTol = Math.max(4, Math.round(minSide * 0.008));
  segs = consolidateNearby(segs, 'v', vCenterTol);
  segs = consolidateNearby(segs, 'h', hCenterTol);
  segs = mergeCollinearPx(segs, mergeGap, params.verticalMergeScale);
  segs = collapseParallelPx(segs, parallelGap);
  segs = segs
    .map((s) => snapWallThickness(s))
    .filter((s) => isWallLikePx(s, width, height, params));

  if (!segs.length) {
    throw i18nError('error.dreamspaceEmpty');
  }

  const doorWidthM = params.doorWidthM;
  const windowWidthM = params.windowWidthM;
  const openingGapsPx = collectOpeningGapsPx(segs, width, height, doorWidthM, windowWidthM);
  let mPerPx;
  if (openingGapsPx.door.length) {
    mPerPx = doorWidthM / Math.max(8, median(openingGapsPx.door));
  } else if (openingGapsPx.window.length) {
    mPerPx = windowWidthM / Math.max(10, median(openingGapsPx.window));
  } else {
    mPerPx = params.planSpanM / Math.max(width, height);
  }

  const wallsPx = joinOpeningsAsDreamspaceWalls(
    segs,
    width,
    height,
    mPerPx,
    doorWidthM,
    windowWidthM,
  );
  const walls = wallsPx.map((w) => pxWallToMeters(w, mPerPx, doorWidthM, windowWidthM));
  const rooms = segmentRooms(binary, width, height, walls, mPerPx);
  const mPerSrcPx = mPerPx * scale;

  return {
    dimensions: {
      width: srcW * mPerSrcPx,
      height: srcH * mPerSrcPx,
    },
    rooms,
    walls,
    imageUrl: '',
    metadata: {
      processor: 'dreamspace-scanline',
      workingSize: { width, height },
      metersPerPixel: mPerPx,
      metersPerSourcePixel: mPerSrcPx,
      sourceSize: { width: srcW, height: srcH },
      params,
    },
  };
}

/**
 * @param {File | Blob} file
 * @param {(data: object) => object} toDetection
 * @param {Partial<import('./dreamspaceParams.js').DreamspaceParams>} [options]
 */
export async function detectDreamspaceImage(file, toDetection, options = {}) {
  const plan = await processFloorPlanFromImage(file, options);
  const detection = toDetection(plan);
  if (!detection?.points?.length) {
    throw i18nError('error.dreamspaceEmpty');
  }
  return detection;
}

/** Dark / colored ink on light paper. */
function inkMask(data, width, height, inkMeanScale = 0.82) {
  const n = width * height;
  const gray = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    sum += gray[i];
  }
  const mean = sum / n;
  const threshold = Math.max(48, Math.min(205, mean * inkMeanScale));
  const binary = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const y = gray[i];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    binary[i] = y < threshold || (sat > 24 && y < mean * 0.94) ? 1 : 0;
  }
  return binary;
}

/** Dilate only left/right — thickens vertical strokes without closing door gaps as much. */
function dilateHorizontal(src, width, height) {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const i = row + x;
      if (src[i] || (x > 0 && src[i - 1]) || (x + 1 < width && src[i + 1])) out[i] = 1;
    }
  }
  return out;
}

function erode(src, width, height) {
  const out = new Uint8Array(src.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (src[i] && src[i - 1] && src[i + 1] && src[i - width] && src[i + width]) out[i] = 1;
    }
  }
  return out;
}

function dilate(src, width, height) {
  const out = new Uint8Array(src.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (src[i] || src[i - 1] || src[i + 1] || src[i - width] || src[i + width]) out[i] = 1;
    }
  }
  return out;
}

/**
 * Full H/V scanline wall extraction (DreamSpace “identify walls” step).
 * Vertical uses a lower minRun (via caller) + optional pre-dilated mask.
 */
function extractScanlineWalls(binary, width, height, axis, minRun) {
  const out = [];
  const runMin = Math.max(4, minRun || 10);

  if (axis === 'h') {
    for (let y = 0; y < height; y += 1) {
      let x = 0;
      while (x < width) {
        while (x < width && !binary[y * width + x]) x += 1;
        const start = x;
        while (x < width && binary[y * width + x]) x += 1;
        if (x - start < runMin) continue;
        const mid = (start + x) >> 1;
        // Emit only on the stroke centerline so thick walls don't flood merges
        const band = thicknessBand(binary, width, height, mid, y, 'v');
        if (!band || y !== band.mid) continue;
        // Skip filled regions (furniture / solid rooms), keep wall strokes
        if (band.t > MAX_WALL_THICK_PX * 1.75) continue;
        const t = clampThickness(band.t);
        out.push({
          axis: 'h',
          x1: start,
          x2: x,
          y1: Math.max(0, band.mid - t / 2),
          y2: Math.min(height, band.mid + t / 2),
        });
      }
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      let y = 0;
      while (y < height) {
        while (y < height && !binary[y * width + x]) y += 1;
        const start = y;
        while (y < height && binary[y * width + x]) y += 1;
        if (y - start < runMin) continue;
        const mid = (start + y) >> 1;
        const band = thicknessBand(binary, width, height, x, mid, 'h');
        if (!band || x !== band.mid) continue;
        if (band.t > MAX_WALL_THICK_PX * 1.75) continue;
        const t = clampThickness(band.t);
        out.push({
          axis: 'v',
          x1: Math.max(0, band.mid - t / 2),
          x2: Math.min(width, band.mid + t / 2),
          y1: start,
          y2: y,
        });
      }
    }
  }
  return out;
}

/** Merge nearly-collinear overlapping stubs of one axis (helps vertical walls). */
function consolidateNearby(segs, axis, centerTol) {
  const items = segs.filter((s) => s.axis === axis).map((s) => ({ ...s }));
  const others = segs.filter((s) => s.axis !== axis);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (axis === 'v') {
          const ax = (a.x1 + a.x2) / 2;
          const bx = (b.x1 + b.x2) / 2;
          const ta = Math.max(1, a.x2 - a.x1);
          const tb = Math.max(1, b.x2 - b.x1);
          const overlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
          const gap = Math.max(0, Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2));
          const bandOverlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          const sameBand = bandOverlap >= Math.min(ta, tb) * 0.7;
          const nearCenter = Math.abs(ax - bx) <= centerTol;
          if (!sameBand && !nearCenter) continue;
          // Only bridge tiny ink breaks — keep door/window gaps for opening join.
          if (gap > Math.max(4, centerTol * 0.75) && overlap < 0) continue;
          const x1 = Math.min(a.x1, b.x1);
          const x2 = Math.max(a.x2, b.x2);
          const t = Math.min(MAX_WALL_THICK_PX, x2 - x1);
          const cx = (x1 + x2) / 2;
          items[i] = {
            axis: 'v',
            x1: cx - t / 2,
            x2: cx + t / 2,
            y1: Math.min(a.y1, b.y1),
            y2: Math.max(a.y2, b.y2),
          };
        } else {
          const ay = (a.y1 + a.y2) / 2;
          const by = (b.y1 + b.y2) / 2;
          const ta = Math.max(1, a.y2 - a.y1);
          const tb = Math.max(1, b.y2 - b.y1);
          const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          const gap = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
          const bandOverlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
          const sameBand = bandOverlap >= Math.min(ta, tb) * 0.7;
          const nearCenter = Math.abs(ay - by) <= centerTol;
          if (!sameBand && !nearCenter) continue;
          if (gap > Math.max(4, centerTol * 0.75) && overlap < 0) continue;
          const y1 = Math.min(a.y1, b.y1);
          const y2 = Math.max(a.y2, b.y2);
          const t = Math.min(MAX_WALL_THICK_PX, y2 - y1);
          const cy = (y1 + y2) / 2;
          items[i] = {
            axis: 'h',
            x1: Math.min(a.x1, b.x1),
            x2: Math.max(a.x2, b.x2),
            y1: cy - t / 2,
            y2: cy + t / 2,
          };
        }
        items.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return [...others, ...items];
}

function clampThickness(t) {
  return Math.max(2, Math.min(MAX_WALL_THICK_PX, t || 0));
}

function thicknessAt(binary, width, height, x, y, dir) {
  const band = thicknessBand(binary, width, height, x, y, dir);
  return band ? band.t : 0;
}

/** Full ink band through (x,y) and its integer centerline. */
function thicknessBand(binary, width, height, x, y, dir) {
  if (y < 0 || y >= height || x < 0 || x >= width || !binary[y * width + x]) return null;
  if (dir === 'v') {
    let y0 = y;
    let y1 = y;
    while (y0 > 0 && binary[(y0 - 1) * width + x]) y0 -= 1;
    while (y1 < height - 1 && binary[(y1 + 1) * width + x]) y1 += 1;
    return { t: y1 - y0 + 1, mid: (y0 + y1) >> 1, a: y0, b: y1 };
  }
  let x0 = x;
  let x1 = x;
  while (x0 > 0 && binary[y * width + (x0 - 1)]) x0 -= 1;
  while (x1 < width - 1 && binary[y * width + (x1 + 1)]) x1 += 1;
  return { t: x1 - x0 + 1, mid: (x0 + x1) >> 1, a: x0, b: x1 };
}

function snapWallThickness(seg) {
  if (seg.axis === 'h') {
    const cy = (seg.y1 + seg.y2) / 2;
    const t = clampThickness(seg.y2 - seg.y1);
    return { ...seg, y1: cy - t / 2, y2: cy + t / 2 };
  }
  const cx = (seg.x1 + seg.x2) / 2;
  const t = clampThickness(seg.x2 - seg.x1);
  return { ...seg, x1: cx - t / 2, x2: cx + t / 2 };
}

function isWallLikePx(seg, width, height, params = {}) {
  const w = Math.abs(seg.x2 - seg.x1);
  const h = Math.abs(seg.y2 - seg.y1);
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  const minSide = Math.min(width, height);
  const ratio = seg.axis === 'v'
    ? (params.minRunRatioV ?? 0.014)
    : (params.minRunRatioH ?? 0.022);
  const floor = seg.axis === 'v'
    ? (params.minRunFloorV ?? 8)
    : (params.minRunFloorH ?? 10);
  const minLen = Math.max(floor, minSide * ratio);
  if (longSide < minLen) return false;
  if (shortSide < 1.4) return false;
  // Reject filled hatch / room-sized blobs (slightly looser for vertical)
  const aspectCut = seg.axis === 'v' ? 1.7 : 2.0;
  if (shortSide > BLOB_SHORT_SIDE_PX && longSide / shortSide < aspectCut) return false;
  if (w * h < 24) return false;
  return true;
}

function mergeCollinearPx(segs, gapTol, verticalMergeScale = 1.6) {
  const items = segs.map((s) => ({ ...s }));
  // Cap how far centers may differ when thickness is large (avoid merging across rooms).
  const centerCap = Math.max(6, 8 * Math.min(2.2, Number(verticalMergeScale) || 1.6));
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
          const gap = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
          const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          // Require thickness bands to overlap (same wall), not merely nearby parallels.
          const bandOverlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
          const centerTol = Math.min(centerCap, Math.max(3, Math.min(ta, tb) * 0.35));
          const sameBand = bandOverlap >= Math.min(ta, tb) * 0.7;
          const nearCenter = Math.abs(ay - by) <= centerTol;
          if (!sameBand && !nearCenter) continue;
          if (gap > gapTol && overlapX < 0) continue;
          const y1 = Math.min(a.y1, b.y1);
          const y2 = Math.max(a.y2, b.y2);
          const t = Math.min(MAX_WALL_THICK_PX, y2 - y1);
          const cy = (y1 + y2) / 2;
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
          const gap = Math.max(0, Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2));
          const overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
          const bandOverlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          const centerTol = Math.min(
            centerCap * Math.min(2, Number(verticalMergeScale) || 1.6),
            Math.max(3, Math.min(ta, tb) * 0.35) * Math.min(2, Number(verticalMergeScale) || 1.6),
          );
          const sameBand = bandOverlap >= Math.min(ta, tb) * 0.7;
          const nearCenter = Math.abs(ax - bx) <= centerTol;
          if (!sameBand && !nearCenter) continue;
          if (gap > gapTol && overlapY < 0) continue;
          const x1 = Math.min(a.x1, b.x1);
          const x2 = Math.max(a.x2, b.x2);
          const t = Math.min(MAX_WALL_THICK_PX, x2 - x1);
          const cx = (x1 + x2) / 2;
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

function collapseParallelPx(segs, maxGap) {
  const items = segs.map((s) => ({ ...s }));
  const gapLimit = Math.max(6, Math.min(MAX_PARALLEL_CENTER_GAP_PX, maxGap || MAX_PARALLEL_CENTER_GAP_PX));
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
          // Double-line only: faces nearly touch (do not use thickness as center budget)
          const faceGap = Math.abs(ay - by) - (ta + tb) / 2;
          if (faceGap > Math.max(2, gapLimit * 0.35)) continue;
          const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          const minLen = Math.min(a.x2 - a.x1, b.x2 - b.x1);
          if (overlap < minLen * 0.45) continue;
          const cy = (ay + by) / 2;
          const t = Math.min(
            MAX_WALL_THICK_PX,
            Math.max(ta, tb, Math.abs(ay - by) + Math.min(ta, tb)),
          );
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
          const t = Math.min(
            MAX_WALL_THICK_PX,
            Math.max(ta, tb, Math.abs(ax - bx) + Math.min(ta, tb)),
          );
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

/** Shared gap bands (working px) for scale estimation + wall joining. */
function openingGapBands(width, height, mPerPx, doorWidthM = 0.9, windowWidthM = 1.2) {
  const minSide = Math.min(width, height);
  // Prefer meter-based bands when scale is known; otherwise image-relative.
  if (mPerPx > 0) {
    return {
      doorMin: doorWidthM * 0.5 / mPerPx,
      doorMax: doorWidthM * 1.8 / mPerPx,
      windowMin: windowWidthM * 0.45 / mPerPx,
      windowMax: windowWidthM * 2.2 / mPerPx,
    };
  }
  return {
    doorMin: Math.max(8, minSide * 0.022),
    doorMax: Math.max(24, minSide * 0.14),
    windowMin: Math.max(14, minSide * 0.035),
    windowMax: Math.max(36, minSide * 0.22),
  };
}

function classifyGapType(gap, bands, nearBorder) {
  if (gap >= bands.doorMin && gap <= bands.doorMax) {
    // Wider exterior openings tend to be windows.
    if (nearBorder && gap > (bands.doorMin + bands.doorMax) * 0.55) return 'window';
    return 'door';
  }
  if (gap >= bands.windowMin && gap <= bands.windowMax) return 'window';
  return null;
}

function collectOpeningGapsPx(segs, width, height, doorWidthM = 0.9, windowWidthM = 1.2) {
  const bands = openingGapBands(width, height, 0, doorWidthM, windowWidthM);
  const door = [];
  const window = [];
  const byAxis = { h: [], v: [] };
  for (const s of segs) byAxis[s.axis].push(s);

  for (const axis of ['h', 'v']) {
    const clusters = clusterByCenter(byAxis[axis], axis, 6);
    for (const items of clusters) {
      items.sort((a, b) => (axis === 'h' ? a.x1 - b.x1 : a.y1 - b.y1));
      for (let i = 0; i < items.length - 1; i += 1) {
        const a = items[i];
        const b = items[i + 1];
        const gap = axis === 'h' ? b.x1 - a.x2 : b.y1 - a.y2;
        const mid = axis === 'h' ? (a.x2 + b.x1) / 2 : (a.y2 + b.y1) / 2;
        const center = axis === 'h' ? (a.y1 + a.y2) / 2 : (a.x1 + a.x2) / 2;
        const nearBorder = axis === 'h'
          ? center < height * 0.12 || center > height * 0.88
          : center < width * 0.12 || center > width * 0.88;
        void mid;
        const kind = classifyGapType(gap, bands, nearBorder);
        if (kind === 'door') door.push(gap);
        else if (kind === 'window') window.push(gap);
      }
    }
  }
  return { door, window };
}

/**
 * DreamSpace wall model: bridge door/window gaps into one wall with hasOpening
 * (see 3dConversionEngine enhanceWall opening.position).
 */
function joinOpeningsAsDreamspaceWalls(
  segs,
  width,
  height,
  mPerPx,
  doorWidthM = 0.9,
  windowWidthM = 1.2,
) {
  const bands = openingGapBands(width, height, mPerPx, doorWidthM, windowWidthM);
  const tinyMerge = Math.max(3, bands.doorMin * 0.3);
  const out = [];

  for (const axis of ['h', 'v']) {
    const clusters = clusterByCenter(
      segs.filter((s) => s.axis === axis),
      axis,
      axis === 'v' ? 10 : 7,
    );
    for (const items of clusters) {
      items.sort((a, b) => (axis === 'h' ? a.x1 - b.x1 : a.y1 - b.y1));
      let cur = {
        ...items[0],
        hasOpening: false,
        openingPos: 0.5,
        openingWidthPx: 0,
        openingType: 'door',
      };
      for (let i = 1; i < items.length; i += 1) {
        const next = items[i];
        const gap = axis === 'h' ? next.x1 - cur.x2 : next.y1 - cur.y2;
        const center = axis === 'h'
          ? ((cur.y1 + cur.y2) / 2 + (next.y1 + next.y2) / 2) / 2
          : ((cur.x1 + cur.x2) / 2 + (next.x1 + next.x2) / 2) / 2;
        const nearBorder = axis === 'h'
          ? center < height * 0.12 || center > height * 0.88
          : center < width * 0.12 || center > width * 0.88;
        const openingType = classifyGapType(gap, bands, nearBorder);

        if (gap < 0 || gap <= tinyMerge) {
          // overlap / tiny break → merge solid
          if (axis === 'h') {
            const cy = ((cur.y1 + cur.y2) / 2 + (next.y1 + next.y2) / 2) / 2;
            const t = Math.max(cur.y2 - cur.y1, next.y2 - next.y1);
            cur = {
              ...cur,
              x1: Math.min(cur.x1, next.x1),
              x2: Math.max(cur.x2, next.x2),
              y1: cy - t / 2,
              y2: cy + t / 2,
            };
          } else {
            const cx = ((cur.x1 + cur.x2) / 2 + (next.x1 + next.x2) / 2) / 2;
            const t = Math.max(cur.x2 - cur.x1, next.x2 - next.x1);
            cur = {
              ...cur,
              x1: cx - t / 2,
              x2: cx + t / 2,
              y1: Math.min(cur.y1, next.y1),
              y2: Math.max(cur.y2, next.y2),
            };
          }
        } else if (openingType) {
          const total = axis === 'h'
            ? Math.max(cur.x2, next.x2) - Math.min(cur.x1, next.x1)
            : Math.max(cur.y2, next.y2) - Math.min(cur.y1, next.y1);
          const openingCenter = axis === 'h'
            ? (cur.x2 + next.x1) / 2 - Math.min(cur.x1, next.x1)
            : (cur.y2 + next.y1) / 2 - Math.min(cur.y1, next.y1);
          if (axis === 'h') {
            const cy = ((cur.y1 + cur.y2) / 2 + (next.y1 + next.y2) / 2) / 2;
            const t = Math.max(cur.y2 - cur.y1, next.y2 - next.y1);
            cur = {
              axis: 'h',
              x1: Math.min(cur.x1, next.x1),
              x2: Math.max(cur.x2, next.x2),
              y1: cy - t / 2,
              y2: cy + t / 2,
              hasOpening: true,
              openingPos: total > 0 ? openingCenter / total : 0.5,
              openingWidthPx: gap,
              openingType,
            };
          } else {
            const cx = ((cur.x1 + cur.x2) / 2 + (next.x1 + next.x2) / 2) / 2;
            const t = Math.max(cur.x2 - cur.x1, next.x2 - next.x1);
            cur = {
              axis: 'v',
              x1: cx - t / 2,
              x2: cx + t / 2,
              y1: Math.min(cur.y1, next.y1),
              y2: Math.max(cur.y2, next.y2),
              hasOpening: true,
              openingPos: total > 0 ? openingCenter / total : 0.5,
              openingWidthPx: gap,
              openingType,
            };
          }
        } else {
          out.push(cur);
          cur = {
            ...next,
            hasOpening: false,
            openingPos: 0.5,
            openingWidthPx: 0,
            openingType: 'door',
          };
        }
      }
      out.push(cur);
    }
  }
  return out;
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

function pxWallToMeters(w, mPerPx, doorWidthM = 0.9, windowWidthM = 1.2) {
  const horiz = w.axis === 'h';
  const thickness = WALL_THICKNESS_M;
  const openingType = w.openingType === 'window' ? 'window' : 'door';
  const defaultWidth = openingType === 'window' ? windowWidthM : doorWidthM;
  const opening = w.hasOpening
    ? {
      type: openingType,
      width: w.openingWidthPx ? w.openingWidthPx * mPerPx : defaultWidth,
      height: openingType === 'window' ? 1.4 : 2.0,
      position: clamp01(w.openingPos ?? 0.5),
    }
    : undefined;

  if (horiz) {
    const y = ((w.y1 + w.y2) / 2) * mPerPx;
    return {
      start: { x: w.x1 * mPerPx, y },
      end: { x: w.x2 * mPerPx, y },
      thickness,
      hasOpening: Boolean(w.hasOpening),
      opening,
    };
  }
  const x = ((w.x1 + w.x2) / 2) * mPerPx;
  return {
    start: { x, y: w.y1 * mPerPx },
    end: { x, y: w.y2 * mPerPx },
    thickness,
    hasOpening: Boolean(w.hasOpening),
    opening,
  };
}

function clamp01(v) {
  return Math.max(0.05, Math.min(0.95, v));
}

/**
 * Lightweight room hints via free-space flood fill (DreamSpace room list).
 */
function segmentRooms(binary, width, height, wallsM, mPerPx) {
  const step = Math.max(4, Math.round(Math.min(width, height) / 48));
  const visited = new Uint8Array(width * height);
  const rooms = [];
  let id = 0;

  const isFree = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return !binary[y * width + x];
  };

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = y * width + x;
      if (!isFree(x, y) || visited[i]) continue;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      let touchesBorder = false;
      const stack = [i];
      visited[i] = 1;
      while (stack.length) {
        const p = stack.pop();
        const px = p % width;
        const py = (p / width) | 0;
        area += 1;
        if (px <= 1 || py <= 1 || px >= width - 2 || py >= height - 2) touchesBorder = true;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (px > 0 && isFree(px - 1, py) && !visited[p - 1]) {
          visited[p - 1] = 1;
          stack.push(p - 1);
        }
        if (px + 1 < width && isFree(px + 1, py) && !visited[p + 1]) {
          visited[p + 1] = 1;
          stack.push(p + 1);
        }
        if (py > 0 && isFree(px, py - 1) && !visited[p - width]) {
          visited[p - width] = 1;
          stack.push(p - width);
        }
        if (py + 1 < height && isFree(px, py + 1) && !visited[p + width]) {
          visited[p + width] = 1;
          stack.push(p + width);
        }
      }

      // Exterior / page background touches the image border — not an interior room
      if (touchesBorder) continue;
      const areaM = area * mPerPx * mPerPx;
      if (areaM < 1.2 || areaM > width * height * mPerPx * mPerPx * 0.55) continue;

      const cx = ((minX + maxX) / 2) * mPerPx;
      const cy = ((minY + maxY) / 2) * mPerPx;
      const roomWalls = wallsM.filter((w) => wallNearRoom(w, minX * mPerPx, maxX * mPerPx, minY * mPerPx, maxY * mPerPx));
      rooms.push({
        id: `room-${id}`,
        name: `Room ${id + 1}`,
        area: Math.round(areaM * 10) / 10,
        walls: roomWalls,
        center: { x: cx, y: cy },
      });
      id += 1;
      if (rooms.length >= 10) return rooms;
    }
  }
  return rooms;
}

function wallNearRoom(w, minX, maxX, minY, maxY) {
  const pad = 0.35;
  const ax = w.start.x;
  const ay = w.start.y;
  const bx = w.end.x;
  const by = w.end.y;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  return (
    mx >= minX - pad
    && mx <= maxX + pad
    && my >= minY - pad
    && my <= maxY + pad
  );
}

function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  return a[(a.length / 2) | 0];
}
