// Render passes shared by the path tracer and the compositor: Blender's light pass names and Cryptomatte's ids.

/**
 * The light passes, as Blender names them: each lobe's light that arrived straight from a light (direct) or after more bounces
 * (indirect), the colour of each lobe at the first surface, what glows, and the world seen straight on. Light is kept with its
 * colour while tracing; the colour is divided out once a pixel's samples are all in.
 */
export const LIGHT_PASSES = ['Diffuse Direct', 'Diffuse Indirect', 'Glossy Direct', 'Glossy Indirect', 'Transmission Direct', 'Transmission Indirect', 'Volume Direct', 'Volume Indirect', 'Emit', 'Environment', 'Diffuse Color', 'Glossy Color', 'Transmission Color', 'Ambient Occlusion', 'Mist'];
/** The view layer's switch for each light pass: 'Diffuse Direct' → usePass.diffuseDirect. */
export const passKey = (name) => name.toLowerCase().replace(/ (\w)/g, (_, c) => c.toUpperCase());

/**
 * The passes a view layer shows on the Render Layers node, and its light groups: kept on the node so that its sockets follow the
 * view layer's switches (sockets cannot see the document).
 */
export function syncRenderLayers(doc, graph = doc.compositor) {
  const layer = doc.viewLayers?.[0];
  if (!graph || !layer) return;
  const on = layer.usePass ?? {};
  const passes = [...LIGHT_PASSES.filter((name) => on[passKey(name)]), ...['Object', 'Material', 'Asset'].filter((k) => on[`crypto${k}`]).flatMap((k) => Array.from({ length: CRYPTO_RANKS / 2 }, (_, i) => `Crypto${k}0${i}`))];
  for (const node of graph.nodes) {
    if (node.type !== 'CMP_RENDER_LAYERS') continue;
    node.values.passes = passes;
    node.values.lightGroups = (layer.lightGroups ?? []).map((g) => g.name);
  }
}

/** Cryptomatte ranks kept per pixel. */
export const CRYPTO_RANKS = 6;

/** MurmurHash3 (x86, 32 bit, seed 0) of a name's UTF-8 bytes, as Cryptomatte asks. */
export function murmur3(text) {
  const bytes = new TextEncoder().encode(text);
  const [c1, c2] = [0xcc9e2d51, 0x1b873593];
  let h = 0;
  let i = 0;
  const mix = (k) => { k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); return Math.imul(k, c2); };
  for (; i + 4 <= bytes.length; i += 4) {
    h ^= mix(bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  const left = bytes.length & 3;
  if (left === 3) k ^= bytes[i + 2] << 16;
  if (left >= 2) k ^= bytes[i + 1] << 8;
  if (left >= 1) { k ^= bytes[i]; h ^= mix(k); }
  h ^= bytes.length;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const hashView = new DataView(new ArrayBuffer(4));
/** A name's Cryptomatte id: its hash read as a float, kept away from the exponents that make infinities, NaNs and denormals. */
export function cryptoHash(name) {
  let h = murmur3(String(name));
  const exponent = (h >>> 23) & 255;
  if (exponent === 0 || exponent === 255) h = (h ^ (1 << 23)) >>> 0;
  hashView.setUint32(0, h);
  return hashView.getFloat32(0);
}
/** A matte from cryptomatte layers: the share of each pixel covered by the named things. */
export function cryptoMatte(layers, names) {
  const wanted = new Set(names.map((name) => cryptoHash(name)));
  const first = layers[0];
  const out = { width: first.width, height: first.height, data: new Float32Array(first.width * first.height * 4) };
  for (let p = 0; p < first.width * first.height; p++) {
    let share = 0;
    for (const layer of layers) for (const r of [0, 2]) if (wanted.has(layer.data[p * 4 + r])) share += layer.data[p * 4 + r + 1];
    out.data.fill(share, p * 4, p * 4 + 3);
    out.data[p * 4 + 3] = 1;
  }
  return out;
}
