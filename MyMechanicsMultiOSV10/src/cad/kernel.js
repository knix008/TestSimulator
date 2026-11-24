// The geometry kernel: OpenCASCADE (the B-rep kernel of many commercial CAD programs) compiled to
// WebAssembly (replicad-opencascadejs), driven through replicad's API. Loaded once, on demand: the app
// starts without it (the start page needs no geometry) and the first part waits for it.
//
// Under Node (the unit tests) the wasm file is read from node_modules; in the app Vite hands out its URL.
import * as R from 'replicad';
// Node-only modules (the unit tests), named through variables: Vite leaves a non-literal specifier alone.
const NODE_FS = 'node:fs';
const NODE_URL = 'node:url';

let loading = null;
let ready = false;
let fontReady = false;

/** True once the sketch-text font is loaded. */
export const fontLoaded = () => fontReady;

/** True once the kernel can be used synchronously (every modelling call after loadKernel resolved). */
export const kernelReady = () => ready;

/** The replicad module (shapes, sketches, finders, measurements, exports). */
export const rep = () => R;

/**
 * The sub-shapes of a shape (faces, edges, wires, solids) in the order a topology explorer meets them, each once
 * — what replicad's getters give, but duplicates are found in hash buckets instead of by comparing every new item
 * with every earlier one (a faceted body of 6 000 faces and 11 000 edges listed its edges in 22 s, now in a few
 * hundred ms).
 */
export function subShapes(wrapped, kind) {
  const oc = R.getOC();
  const E = oc.TopAbs_ShapeEnum;
  const type = { face: E.TopAbs_FACE, edge: E.TopAbs_EDGE, wire: E.TopAbs_WIRE, solid: E.TopAbs_SOLID, shell: E.TopAbs_SHELL, vertex: E.TopAbs_VERTEX }[kind];
  const cast = { face: (s) => oc.TopoDS.Face(s), edge: (s) => oc.TopoDS.Edge(s), wire: (s) => oc.TopoDS.Wire(s), solid: (s) => oc.TopoDS.Solid(s), shell: (s) => oc.TopoDS.Shell(s), vertex: (s) => oc.TopoDS.Vertex(s) }[kind];
  const explorer = new oc.TopExp_Explorer(wrapped, type, E.TopAbs_SHAPE);
  const buckets = new Map(); const out = [];
  try {
    while (explorer.More()) {
      const item = explorer.Current();
      const h = oc.ReplicadShapeHasher.HashCode(item, R.HASH_CODE_MAX);
      let bucket = buckets.get(h);
      if (!bucket) { bucket = []; buckets.set(h, bucket); }
      if (!bucket.some((s) => s.IsSame(item))) { bucket.push(item); out.push(cast(item)); }
      explorer.Next();
    }
  } finally { explorer.delete(); }
  return out;
}

/** replicad's faces / edges / wires / solids getters on the shape base class, listed by subShapes. */
function fastTopologyGetters() {
  let proto = R.Solid?.prototype;
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'faces')) proto = Object.getPrototypeOf(proto);
  if (!proto) return;
  const wrap = { face: R.Face, edge: R.Edge, wire: R.Wire, solid: R.Solid };
  for (const [name, kind] of [['faces', 'face'], ['edges', 'edge'], ['wires', 'wire'], ['solids', 'solid']]) {
    if (!wrap[kind] || !Object.getOwnPropertyDescriptor(proto, name)?.get) continue;
    Object.defineProperty(proto, name, { configurable: true, get() { return subShapes(this.wrapped, kind).map((s) => new wrap[kind](s)); } });
  }
}

/**
 * Loads OpenCASCADE once. `wasmUrl` (optional): where the .wasm file is; by default Vite's URL of it in the
 * app, the file in node_modules under Node.
 */
export function loadKernel({ wasmUrl = null, onProgress = null } = {}) {
  loading ??= (async () => {
    onProgress?.(0.05);
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node) && typeof window === 'undefined';
    let url = wasmUrl;
    if (!url && isNode) {
      const nodeUrl = 'node:url';
      const { fileURLToPath } = await import(/* @vite-ignore */ nodeUrl);
      url = fileURLToPath(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url));
    }
    if (!url) url = (await import('replicad-opencascadejs/wasm?url')).default;
    onProgress?.(0.2);
    const { default: init } = await import('replicad-opencascadejs');
    onProgress?.(0.4);
    const oc = await init({ locateFile: () => url });
    R.setOC(oc);
    fastTopologyGetters();
    // The OpenSCAD engine (Manifold) next to OpenCASCADE: OpenSCAD features build synchronously with the part.
    try { await (await import('./openscad/index.js')).loadManifold(); } catch (error) { console.warn('OpenSCAD engine', error); }
    // The font of sketch text (Roboto, SIL OFL): read from node_modules under Node, a bundled URL in the app.
    try {
      let bytes;
      if (isNode) {
        const fsName = 'node:fs';
        const fs = await import(/* @vite-ignore */ fsName);
        const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
        const b = fs.readFileSync(fileURLToPath(new URL('../../node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff', import.meta.url)));
        bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      } else {
        const fontUrl = (await import('@fontsource/roboto/files/roboto-latin-400-normal.woff?url')).default;
        bytes = await (await fetch(fontUrl)).arrayBuffer();
      }
      await R.loadFont(bytes.slice(0), 'roboto');
      fontReady = true;
      // The drawing sheet's other fonts (Roboto Bold, the Korean font) and Roboto kept for embedding in SVG.
      try { await (await import('./text-metrics.js')).loadDrawingFonts(bytes); } catch (error) { console.warn('drawing fonts', error); }
    } catch (error) { console.warn('sketch text font', error); }
    // STEP writing prints transfer statistics on the console: not wanted in the app.
    ready = true;
    onProgress?.(1);
    return R;
  })();
  return loading;
}
