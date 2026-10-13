// Start page thumbnails of 3D samples: meshing (booleans above all) can take
// seconds, so it runs here instead of on the main thread. In: { id, solids }.
// Out: { id, shaded } — the iso view as a Float32Array of x1 y1 x2 y2 x3 y3 light
// per triangle (back to front), or null when there is nothing (or too much) to draw.
import { shadedView, solidMesh } from '../domain/solids.js';

const MAX_TRIANGLES = 120000;

globalThis.onmessage = ({ data: { id, solids } }) => {
  let shaded = null;
  try {
    const tris = solids.flatMap((entity) => solidMesh(entity));
    if (tris.length && tris.length <= MAX_TRIANGLES) {
      const view = shadedView(tris, 'iso');
      shaded = new Float32Array(view.length * 7);
      view.forEach((tri, i) => {
        tri.points.forEach((p, j) => { shaded[i * 7 + j * 2] = p.x; shaded[i * 7 + j * 2 + 1] = p.y; });
        shaded[i * 7 + 6] = tri.light;
      });
    }
  } catch {
    shaded = null;
  }
  globalThis.postMessage({ id, shaded }, shaded ? [shaded.buffer] : []);
};
