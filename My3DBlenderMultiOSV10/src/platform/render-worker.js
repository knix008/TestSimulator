// A render worker: holds a copy of the scene and traces the rows it is given.
import { buildBVH, renderRows } from '../core/pathtracer.js';

let scene = null;
let bvh = null;

self.onmessage = (e) => {
  const message = e.data;
  if (message.type === 'init') {
    scene = message.scene;
    bvh = buildBVH(scene.positions);
    self.postMessage({ type: 'ready' });
    return;
  }
  if (message.type === 'row') {
    const { y } = message;
    const data = new Float32Array(scene.width * 4);
    const depth = new Float32Array(scene.width);
    const normal = new Float32Array(scene.width * 3);
    renderRows(scene, bvh, y, y + 1, data, { baseRow: y, aovs: { depth, normal } });
    self.postMessage({ type: 'row', y, data, depth, normal }, [data.buffer, depth.buffer, normal.buffer]);
  }
};
