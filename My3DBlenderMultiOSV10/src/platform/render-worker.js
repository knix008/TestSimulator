// A render worker: holds a copy of the scene and traces the rows it is given.
import { buildBVH, lightPassBuffers, renderRows } from '../core/pathtracer.js';

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
    const extra = { position: new Float32Array(scene.width * 3), uv: new Float32Array(scene.width * 2), albedo: new Float32Array(scene.width * 3), emission: new Float32Array(scene.width * 3), materialIndex: new Float32Array(scene.width), objectIndex: new Float32Array(scene.width) };
    const light = lightPassBuffers(scene, scene.width);
    renderRows(scene, bvh, y, y + 1, data, { baseRow: y, aovs: { depth, normal, extra }, light });
    self.postMessage({ type: 'row', y, data, depth, normal, extra, light }, [data.buffer, depth.buffer, normal.buffer, ...Object.values(extra).map((a) => a.buffer), ...Object.values(light).map((a) => a.buffer)]);
  }
};
