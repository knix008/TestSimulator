// Builds the path tracer's hierarchy off the main thread (large assemblies take a second or more).
import { buildBVH } from './bvh.js';

self.onmessage = (event) => {
  const { id, positions } = event.data;
  try {
    const r = buildBVH(positions);
    self.postMessage({ id, ...r }, [r.nodes.buffer, r.order.buffer]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
