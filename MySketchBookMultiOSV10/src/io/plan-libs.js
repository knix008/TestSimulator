// The libraries of the plan readers, loaded only when a PDF or an IFC file is imported (browser and
// desktop WebView). Everything they need is a local file of the build, so the import works offline:
//   pdf.js (Apache-2.0): the module, its worker, the CMaps (Korean / Chinese / Japanese PDFs without
//     embedded fonts), the standard fonts and the image decoders (JPEG 2000 scans) as bundled assets
//   web-ifc (MPL-2.0): the module and its single-threaded .wasm (the app is not cross-origin isolated)
// Not for Node: the tests pass pdfjs-dist/legacy and web-ifc's Node build to the readers directly.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ifcWasmUrl from 'web-ifc/web-ifc.wasm?url';

const PDF_FILES = import.meta.glob(['/node_modules/pdfjs-dist/cmaps/*.bcmap', '/node_modules/pdfjs-dist/standard_fonts/*.pfb', '/node_modules/pdfjs-dist/standard_fonts/*.ttf', '/node_modules/pdfjs-dist/wasm/*.wasm', '/node_modules/pdfjs-dist/wasm/*.js'], { query: '?url', import: 'default', exhaustive: true });
const pdfFile = async (name) => {
  const entry = Object.entries(PDF_FILES).find(([key]) => key.endsWith(`/${name}`));
  if (!entry) throw new Error(`pdf.js file missing: ${name}`);
  const response = await fetch(await entry[1]());
  if (!response.ok) throw new Error(`pdf.js file ${name}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};
// pdf.js asks its factories for files by name; these serve them from the bundled assets.
class CMapFactory { constructor({ isCompressed = true } = {}) { this.isCompressed = isCompressed; } async fetch({ name }) { return { cMapData: await pdfFile(`${name}.bcmap`), isCompressed: true }; } }
class FileFactory { constructor() {} async fetch({ filename }) { return pdfFile(filename); } }

let pdf = null;
/** pdf.js and the getDocument options that keep it offline: { pdfjs, options }. */
export async function loadPdfjs() {
  if (!pdf) {
    pdf = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return { pdfjs, options: { CMapReaderFactory: CMapFactory, StandardFontDataFactory: FileFactory, WasmFactory: FileFactory, useWorkerFetch: false, cMapPacked: true } };
    });
    pdf.catch(() => { pdf = null; });
  }
  return pdf;
}

let ifc = null;
/** web-ifc, initialised: { WebIFC, api }. */
export async function loadWebIfc() {
  if (!ifc) {
    ifc = import('web-ifc').then(async (WebIFC) => {
      const api = new WebIFC.IfcAPI();
      await api.Init((path) => (path.endsWith('.wasm') ? ifcWasmUrl : path), true);
      return { WebIFC, api };
    });
    ifc.catch(() => { ifc = null; });
  }
  return ifc;
}
