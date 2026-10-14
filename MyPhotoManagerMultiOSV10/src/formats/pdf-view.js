// PDF pages as pictures (pdf.js). Used for thumbnails and the viewer's page
// navigation; runs in the page (pdf.js has its own worker).
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { makeCanvas } from './canvas.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_SIDE = 2400;

/** { source: canvas, pages } for page `number` (1-based). */
export async function renderPdfPage(bytes, number = 1, scale = 2) {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  const doc = await task.promise;
  try {
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
  } finally {
    task.destroy(); // pdf.js 6: the loading task frees the document and its worker data
  }
}
