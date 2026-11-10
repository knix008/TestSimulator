// Local copies of the WebAssembly decoders three's loaders fetch at run time (Draco meshes, Basis/KTX2
// textures, Rhino .3dm). Vite emits each file next to the app (?url), so they load offline — never from a
// CDN — and only when a file that needs them is opened (import.js imports this module lazily).
// Draco/KTX2 loaders do point at three/examples/jsm/libs through import.meta.url, but under the Vite dev
// server three is pre-bundled into .vite/deps, where those relative paths do not exist: naming the files
// here works in both the dev server and the build (Vite emits each file once either way).
// Browser only: Node cannot import ?url modules (the Node tests never reach these decoders).
import dracoWrapper from 'three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url';
import dracoWasm from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';
import basisJs from 'three/examples/jsm/libs/basis/basis_transcoder.js?url';
import basisWasm from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';
import rhinoJs from 'rhino3dm/rhino3dm.js?url';
import rhinoWasm from 'rhino3dm/rhino3dm.wasm?url';

/** File name a loader asks for → the URL of the shipped copy. */
export const DECODER_URLS = {
  'draco_wasm_wrapper.js': dracoWrapper,
  'draco_decoder.wasm': dracoWasm,
  'basis_transcoder.js': basisJs,
  'basis_transcoder.wasm': basisWasm,
  'rhino3dm.js': rhinoJs,
  'rhino3dm.wasm': rhinoWasm,
};
