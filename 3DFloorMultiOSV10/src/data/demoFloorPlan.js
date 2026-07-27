/**
 * Sample detection payload matching FloorPlanTo3D-API response shape:
 * { points: [{x1,y1,x2,y2}], classes: [{name}], Width, Height, averageDoor }
 *
 * Coordinates are axis-aligned bounding boxes in image space.
 */
export const demoFloorPlan = {
  Width: 400,
  Height: 320,
  averageDoor: 36,
  points: [
    // outer walls
    { x1: 40, y1: 40, x2: 360, y2: 52 },
    { x1: 40, y1: 268, x2: 360, y2: 280 },
    { x1: 40, y1: 40, x2: 52, y2: 280 },
    { x1: 348, y1: 40, x2: 360, y2: 280 },
    // inner walls
    { x1: 180, y1: 40, x2: 192, y2: 180 },
    { x1: 40, y1: 168, x2: 180, y2: 180 },
    { x1: 192, y1: 168, x2: 360, y2: 180 },
    { x1: 260, y1: 180, x2: 272, y2: 280 },
    // windows
    { x1: 90, y1: 38, x2: 140, y2: 54 },
    { x1: 230, y1: 38, x2: 290, y2: 54 },
    { x1: 346, y1: 90, x2: 362, y2: 140 },
    // doors
    { x1: 100, y1: 166, x2: 140, y2: 182 },
    { x1: 210, y1: 166, x2: 245, y2: 182 },
    { x1: 258, y1: 210, x2: 274, y2: 250 },
  ],
  classes: [
    { name: 'wall' },
    { name: 'wall' },
    { name: 'wall' },
    { name: 'wall' },
    { name: 'wall' },
    { name: 'wall' },
    { name: 'wall' },
    { name: 'wall' },
    { name: 'window' },
    { name: 'window' },
    { name: 'window' },
    { name: 'door' },
    { name: 'door' },
    { name: 'door' },
  ],
};
