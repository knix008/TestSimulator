// PDF pages as pictures (pdf.js). Used for thumbnails and the viewer's page
// navigation; runs in the page (pdf.js has its own worker).
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { t } from '../i18n.js';
import { makeCanvas } from './canvas.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_SIDE = 2400;

/** Data files pdf.js loads by URL (public/vendor, see scripts/vendor-assets.mjs): CMaps for non-embedded CJK fonts, standard fonts, image decoders, CMYK colours. */
const assets = () => {
  const base = new URL('vendor/pdfjs-dist/', document.baseURI).href;
  return { cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, iccUrl: `${base}iccs/` };
};

/** The reason in the user's words, pdf.js's own message after it and the original error as the cause. */
function explained(error) {
  const name = error?.name ?? '';
  const key = name === 'PasswordException' ? 'pdf.password' : /^(InvalidPDF|MissingPDF|FormatError)/.test(name) ? 'pdf.invalid' : 'pdf.failed';
  return new Error(`${t(key)} (${error?.message ?? error})`, { cause: error });
}

/** { source: canvas, pages } for page `number` (1-based). */
export async function renderPdfPage(bytes, number = 1, scale = 2) {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, ...assets() });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(Math.min(Math.max(1, number), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const k = Math.min(scale, MAX_SIDE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale: k });
    const canvas = makeCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    return { source: canvas, pages: doc.numPages };
  } catch (error) {
    throw explained(error);
  } finally {
    task.destroy(); // pdf.js 6: the loading task frees the document and its worker data (also when opening failed)
  }
}
