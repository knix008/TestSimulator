import { i18nError } from '../i18n/index.js';
import { detectHeuristic } from './heuristic.js';

/**
 * DreamSpaceAI layout engine (ported from
 * https://github.com/jevintanjh/DreamSpaceAI floorPlanProcessor).
 *
 * When a floor-plan image is provided, walls are detected from that image
 * (heuristic CV). The upstream mock apartment is used only when no image
 * is selected (offline layout demo).
 */

const PX_PER_M = 100;

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ start: Point, end: Point, thickness: number, hasOpening?: boolean }} Wall */
/** @typedef {{ id: string, name: string, area: number, walls: Wall[], center: Point }} Room */
/** @typedef {{ dimensions: { width: number, height: number }, rooms: Room[], walls: Wall[], imageUrl?: string }} FloorPlanData */

/**
 * @param {File | Blob | null} [file]
 * @returns {Promise<{ Width: number, Height: number, averageDoor: number, points: object[], classes: object[] }>}
 */
export async function detectDreamspace(file = null) {
  // Prefer real image analysis — never ignore a selected floor-plan file
  if (file) {
    const detection = await detectHeuristic(file);
    return { ...detection, source: 'dreamspace-image' };
  }

  const plan = await processFloorPlan('');
  const detection = floorPlanToDetection(plan);
  if (!detection.points.length) {
    throw i18nError('error.dreamspaceEmpty');
  }
  return detection;
}

/**
 * @param {string} imageData
 * @returns {Promise<FloorPlanData>}
 */
export async function processFloorPlan(imageData) {
  // Upstream DreamSpaceAI: mock structural layout (offline, no ML weights)
  return mockProcessFloorPlan(imageData || '');
}

/**
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
        { start: { x: 6, y: 4 }, end: { x: 0, y: 4 }, thickness: 0.2, hasOpening: true },
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
        { start: { x: 6, y: 3 }, end: { x: 6, y: 0 }, thickness: 0.2, hasOpening: true },
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
        { start: { x: 4, y: 4 }, end: { x: 0, y: 4 }, thickness: 0.2, hasOpening: true },
      ],
      center: { x: 2, y: 6 },
    },
    {
      id: 'bathroom',
      name: 'Bathroom',
      area: 6,
      walls: [
        { start: { x: 4, y: 4 }, end: { x: 6, y: 4 }, thickness: 0.2, hasOpening: true },
        { start: { x: 6, y: 4 }, end: { x: 6, y: 7 }, thickness: 0.2 },
        { start: { x: 6, y: 7 }, end: { x: 4, y: 7 }, thickness: 0.2 },
        { start: { x: 4, y: 7 }, end: { x: 4, y: 4 }, thickness: 0.2 },
      ],
      center: { x: 5, y: 5.5 },
    },
  ];

  const walls = rooms.flatMap((room) => room.walls);
  return {
    dimensions: { width: 10, height: 8 },
    rooms,
    walls,
    imageUrl: imageData,
  };
}

/**
 * Convert DreamSpace meter-space walls → FloorPlanTo3D detection boxes.
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

    const t = Math.max(0.05, wall.thickness || 0.15) * PX_PER_M;
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

    // Short opening segments along walls marked hasOpening → door class
    if (wall.hasOpening) {
      const doorLen = 0.9 * PX_PER_M;
      if (horiz) {
        const mid = (x1 + x2) / 2;
        const half = Math.min(doorLen / 2, (x2 - x1) / 2);
        points.push({ x1: mid - half, y1, x2: mid + half, y2 });
        classes.push({ name: 'door' });
        // Keep wall stubs around the door when the wall is long enough
        if (mid - half - x1 > t) {
          points.push({ x1, y1, x2: mid - half, y2 });
          classes.push({ name: 'wall' });
        }
        if (x2 - (mid + half) > t) {
          points.push({ x1: mid + half, y1, x2, y2 });
          classes.push({ name: 'wall' });
        }
      } else {
        const mid = (y1 + y2) / 2;
        const half = Math.min(doorLen / 2, (y2 - y1) / 2);
        points.push({ x1, y1: mid - half, x2, y2: mid + half });
        classes.push({ name: 'door' });
        if (mid - half - y1 > t) {
          points.push({ x1, y1, x2, y2: mid - half });
          classes.push({ name: 'wall' });
        }
        if (y2 - (mid + half) > t) {
          points.push({ x1, y1: mid + half, x2, y2 });
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
    averageDoor: 0.9 * PX_PER_M,
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
