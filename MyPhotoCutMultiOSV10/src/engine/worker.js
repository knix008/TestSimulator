// Draws caricatures off the page's thread (ui/renderer.js keeps a few of these busy).
// Messages in:
//   { type: 'source', key, width, height, pixels (ArrayBuffer RGBA), mask (ArrayBuffer Float32 | null) }
//   { type: 'render', job, key, features, item }
//   { type: 'forget', key }
// Messages out:
//   { type: 'done', job, width, height, pixels (ArrayBuffer), features, mask (ArrayBuffer | null), ms }
//   { type: 'error', job, message, stack }
// The style's drawing (before effects) is kept per caricature, so changing only an effect is quick.
import { createRaster } from './raster.js';
import { finish, renderBase } from './pipeline.js';

const sources = new Map();
/** key → Map(item id → { baseKey, rendered }) */
const cache = new Map();
const MAX_CACHED = 48;

const baseKeyOf = (features, item) => JSON.stringify([features, item.styleId, item.seed, item.warp, item.options]);

function render({ job, key, features, item }) {
  const started = performance.now();
  const source = sources.get(key);
  if (!source) throw new Error(`no picture "${key}"`);
  let byItem = cache.get(key);
  if (!byItem) { byItem = new Map(); cache.set(key, byItem); }
  const baseKey = baseKeyOf(features, item);
  let entry = byItem.get(item.id);
  if (!entry || entry.baseKey !== baseKey) {
    entry = { baseKey, rendered: renderBase(source.raster, features, item, source.mask) };
    byItem.delete(item.id);
    byItem.set(item.id, entry);
    while (byItem.size > MAX_CACHED) byItem.delete(byItem.keys().next().value);
  }
  const image = finish(entry.rendered, item);
  const pixels = image.data.buffer.slice(0);
  const mask = entry.rendered.mask ? entry.rendered.mask.buffer.slice(0) : null;
  const transfer = mask ? [pixels, mask] : [pixels];
  self.postMessage({ type: 'done', job, width: image.width, height: image.height, pixels, features: entry.rendered.features, mask, ms: Math.round(performance.now() - started) }, transfer);
}

self.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === 'source') {
      const raster = createRaster(message.width, message.height, new Uint8ClampedArray(message.pixels));
      sources.set(message.key, { raster, mask: message.mask ? new Float32Array(message.mask) : null });
      cache.delete(message.key);
    } else if (message.type === 'forget') {
      sources.delete(message.key);
      cache.delete(message.key);
    } else if (message.type === 'render') {
      render(message);
    }
  } catch (error) {
    self.postMessage({ type: 'error', job: message.job, message: String(error?.message ?? error), stack: String(error?.stack ?? '') });
  }
};
