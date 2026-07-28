import { i18nError } from '../i18n/index.js';
import { detectDreamspaceImage, processFloorPlanFromImage } from './dreamspaceDetect.js';

/**
 * DreamSpaceAI offline mode — aligned with
 * https://github.com/jevintanjh/DreamSpaceAI
 *
 * Data model: FloorPlanData { rooms, walls[{start,end,thickness,hasOpening,opening}] }
 * Conversion: 3dConversionEngine-style fixed thickness + mid/positioned door openings.
 *
 * Separate Next.js UI: npm run dreamspace
 */

const PX_PER_M = 100;
const DEFAULT_WALL_THICKNESS_M = 0.15;
const DEFAULT_DOOR_WIDTH_M = 0.9;

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ start: Point, end: Point, thickness: number, hasOpening?: boolean, opening?: { type?: string, width?: number, height?: number, position?: number } }} Wall */
/** @typedef {{ id: string, name: string, area: number, walls: Wall[], center: Point }} Room */
/** @typedef {{ dimensions: { width: number, height: number }, rooms: Room[], walls: Wall[], imageUrl?: string }} FloorPlanData */

/**
 * @param {File | Blob | null} [file]
 * @param {Partial<import('./dreamspaceParams.js').DreamspaceParams>} [options]
 */
export async function detectDreamspace(file = null, options = {}) {
  if (file) {
    return detectDreamspaceImage(file, floorPlanToDetection, options);
  }

  const plan = await processFloorPlan('');
  const detection = floorPlanToDetection(plan);
  if (!detection.points.length) {
    throw i18nError('error.dreamspaceEmpty');
  }
  return detection;
}

/** @param {string} imageData */
export async function processFloorPlan(imageData) {
  return mockProcessFloorPlan(imageData || '');
}

export { processFloorPlanFromImage };

/**
 * Upstream sample apartment (floorPlanProcessor mockProcessFloorPlan).
 * @param {string} imageData
 * @returns {FloorPlanData}
 */
function mockProcessFloorPlan(imageData) {
  const rooms = [
    {
      id: 'living',
      name: 'Living Room',
      area: 24,
      walls: [
        { start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, thickness: 0.2 },
        { start: { x: 6, y: 0 }, end: { x: 6, y: 4 }, thickness: 0.2 },
        {
          start: { x: 6, y: 4 },
          end: { x: 0, y: 4 },
          thickness: 0.2,
          hasOpening: true,
          opening: { type: 'door', width: 0.9, height: 2.0, position: 0.5 },
        },
        { start: { x: 0, y: 4 }, end: { x: 0, y: 0 }, thickness: 0.2 },
      ],
      center: { x: 3, y: 2 },
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      area: 12,
      walls: [
        { start: { x: 6, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.2 },
        { start: { x: 10, y: 0 }, end: { x: 10, y: 3 }, thickness: 0.2 },
        { start: { x: 10, y: 3 }, end: { x: 6, y: 3 }, thickness: 0.2 },
        {
          start: { x: 6, y: 3 },
          end: { x: 6, y: 0 },
          thickness: 0.2,
          hasOpening: true,
          opening: { type: 'door', width: 0.9, height: 2.0, position: 0.5 },
        },
      ],
      center: { x: 8, y: 1.5 },
    },
    {
      id: 'bedroom',
      name: 'Bedroom',
      area: 16,
      walls: [
        { start: { x: 0, y: 4 }, end: { x: 0, y: 8 }, thickness: 0.2 },
        { start: { x: 0, y: 8 }, end: { x: 4, y: 8 }, thickness: 0.2 },
        { start: { x: 4, y: 8 }, end: { x: 4, y: 4 }, thickness: 0.2 },
        {
          start: { x: 4, y: 4 },
          end: { x: 0, y: 4 },
          thickness: 0.2,
          hasOpening: true,
          opening: { type: 'door', width: 0.9, height: 2.0, position: 0.5 },
        },
      ],
      center: { x: 2, y: 6 },
    },
    {
      id: 'bathroom',
      name: 'Bathroom',
      area: 6,
      walls: [
        {
          start: { x: 4, y: 4 },
          end: { x: 6, y: 4 },
          thickness: 0.2,
          hasOpening: true,
          opening: { type: 'door', width: 0.9, height: 2.0, position: 0.5 },
        },
        { start: { x: 6, y: 4 }, end: { x: 6, y: 7 }, thickness: 0.2 },
        { start: { x: 6, y: 7 }, end: { x: 4, y: 7 }, thickness: 0.2 },
        { start: { x: 4, y: 7 }, end: { x: 4, y: 4 }, thickness: 0.2 },
      ],
      center: { x: 5, y: 5.5 },
    },
  ];

  return {
    dimensions: { width: 10, height: 8 },
    rooms,
    walls: rooms.flatMap((room) => room.walls),
    imageUrl: imageData,
  };
}

/**
 * Convert DreamSpace meter walls → detection boxes
 * (mirrors 3dConversionEngine: fixed thickness, opening at position).
 * @param {FloorPlanData} data
 */
export function floorPlanToDetection(data) {
  const seen = new Set();
  const points = [];
  const classes = [];

  for (const wall of data.walls || []) {
    const ax = wall.start?.x ?? 0;
    const ay = wall.start?.y ?? 0;
    const bx = wall.end?.x ?? 0;
    const by = wall.end?.y ?? 0;
    const key = [
      Math.min(ax, bx).toFixed(3),
      Math.min(ay, by).toFixed(3),
      Math.max(ax, bx).toFixed(3),
      Math.max(ay, by).toFixed(3),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const thickM = Math.max(0.05, wall.thickness || DEFAULT_WALL_THICKNESS_M);
    const t = thickM * PX_PER_M;
    const x1m = ax * PX_PER_M;
    const y1m = ay * PX_PER_M;
    const x2m = bx * PX_PER_M;
    const y2m = by * PX_PER_M;
    const horiz = Math.abs(x2m - x1m) >= Math.abs(y2m - y1m);

    let x1;
    let y1;
    let x2;
    let y2;
    if (horiz) {
      x1 = Math.min(x1m, x2m);
      x2 = Math.max(x1m, x2m);
      const y = (y1m + y2m) / 2;
      y1 = y - t / 2;
      y2 = y + t / 2;
    } else {
      y1 = Math.min(y1m, y2m);
      y2 = Math.max(y1m, y2m);
      const x = (x1m + x2m) / 2;
      x1 = x - t / 2;
      x2 = x + t / 2;
    }

    if (wall.hasOpening || wall.opening) {
      const doorLen = Math.max(
        0.6 * PX_PER_M,
        (wall.opening?.width ?? DEFAULT_DOOR_WIDTH_M) * PX_PER_M,
      );
      const pos = clamp01(wall.opening?.position ?? 0.5);
      if (horiz) {
        const span = x2 - x1;
        const half = Math.min(doorLen / 2, span / 2);
        const mid = x1 + span * pos;
        const d1 = Math.max(x1, mid - half);
        const d2 = Math.min(x2, mid + half);
        points.push({ x1: d1, y1, x2: d2, y2 });
        classes.push({ name: wall.opening?.type === 'window' ? 'window' : 'door' });
        if (d1 - x1 > t) {
          points.push({ x1, y1, x2: d1, y2 });
          classes.push({ name: 'wall' });
        }
        if (x2 - d2 > t) {
          points.push({ x1: d2, y1, x2, y2 });
          classes.push({ name: 'wall' });
        }
      } else {
        const span = y2 - y1;
        const half = Math.min(doorLen / 2, span / 2);
        const mid = y1 + span * pos;
        const d1 = Math.max(y1, mid - half);
        const d2 = Math.min(y2, mid + half);
        points.push({ x1, y1: d1, x2, y2: d2 });
        classes.push({ name: wall.opening?.type === 'window' ? 'window' : 'door' });
        if (d1 - y1 > t) {
          points.push({ x1, y1, x2, y2: d1 });
          classes.push({ name: 'wall' });
        }
        if (y2 - d2 > t) {
          points.push({ x1, y1: d2, x2, y2 });
          classes.push({ name: 'wall' });
        }
      }
    } else {
      points.push({ x1, y1, x2, y2 });
      classes.push({ name: 'wall' });
    }
  }

  const widthM = data.dimensions?.width ?? 10;
  const heightM = data.dimensions?.height ?? 8;

  return {
    Width: widthM * PX_PER_M,
    Height: heightM * PX_PER_M,
    averageDoor: DEFAULT_DOOR_WIDTH_M * PX_PER_M,
    points,
    classes,
    source: 'dreamspace',
    rooms: (data.rooms || []).map((r) => ({
      id: r.id,
      name: r.name,
      area: r.area,
      center: r.center,
    })),
  };
}

function clamp01(v) {
  return Math.max(0.05, Math.min(0.95, Number(v) || 0.5));
}
