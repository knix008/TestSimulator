// Printing (Ctrl+P): the file under the cursor, or what the viewer / editor
// shows, on paper — through the app's own print dialog (dialogs/PrintDialog.jsx:
// a preview and the page setup).
//
// A text file becomes a <pre> (optionally wrapped, with the file name in the
// header), an image an <img> scaled to the page. The document is
// self-contained — its own tiny stylesheet, black on white, nothing of the
// app's theme. The page setup (paper, orientation, margins, scale) is CSS in
// the document (@page + zoom), so the preview and the paper always agree. It
// goes to
//
//   desktop  — electron/main.js printHtml: a hidden BrowserWindow renders it
//              and prints it silently on the chosen printer (or through the
//              system dialog when none is chosen); printPreview turns it into
//              a PDF for the preview
//   web      — a hidden <iframe> and its window.print(): the browser's own
//              print dialog (the preview there is drawn by the dialog itself)
//
// Files the app cannot render itself (PDF, Office documents …) are handed to
// the OS instead (core: fs.print), which App decides on — see canPrintData.
import { isElectron } from './backend';

const electron = typeof window !== 'undefined' ? window.commandCenter : null;

export { canPrintData, PAPERS, MARGIN_PRESETS, PRINT_SETUP_DEFAULTS, normalizeSetup, contentSizeMm, parsePageRanges, buildPrintHtml } from './printdoc';

// Opens the print dialog for the document. Resolves { ok } when it was sent to the printer,
// { ok:false, cancelled:true } when the user backed out (not an error) — the browser cannot tell the
// two apart, so there every closed dialog counts as { ok: true }. Rejects on a real failure.
// options (desktop): { deviceName, copies, pageRanges, landscape, paper, color } — with a deviceName the
// document is printed silently on that printer, else the system dialog opens.
export async function printDocument({ html, title, options }) {
  if (isElectron && electron && electron.printHtml) {
    const r = await electron.printHtml({ html, title, options });
    if (!r || !r.ok) throw new Error(r && r.error ? r.error.message : 'print error');
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data || { ok: true };
  }
  return printInFrame(html);
}

// Desktop only: the document as a PDF (base64) and its page count, for the preview. null in the browser.
export async function printPreviewPdf({ html, title, options }) {
  if (!(isElectron && electron && electron.printPreview)) return null;
  const r = await electron.printPreview({ html, title, options });
  if (!r || !r.ok) throw new Error(r && r.error ? r.error.message : 'preview error');
  if (r.data && r.data.error) throw new Error(r.data.error);
  return r.data;
}

// Desktop only: [{ name, displayName, isDefault }]; [] in the browser (its print dialog picks the printer).
export async function listPrinters() {
  if (!(isElectron && electron && electron.printers)) return [];
  try { const r = await electron.printers(); return r && r.ok && Array.isArray(r.data) ? r.data : []; }
  catch { return []; }
}

let frame = null;
function printInFrame(html) {
  return new Promise((resolve, reject) => {
    if (frame) { try { frame.remove(); } catch { /* gone */ } frame = null; }
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    frame = f;
    let done = false;
    const finish = (fn) => { if (done) return; done = true; setTimeout(() => { if (frame === f) { f.remove(); frame = null; } }, 500); fn(); };
    f.onload = () => {
      const w = f.contentWindow;
      if (!w) { finish(() => reject(new Error('print frame unavailable'))); return; }
      // Wait for the image (if any) to decode, then print. afterprint fires once the dialog closes
      // — for a print or a cancel alike.
      const go = () => {
        w.addEventListener('afterprint', () => finish(() => resolve({ ok: true })));
        try { w.focus(); w.print(); } catch (err) { finish(() => reject(err)); return; }
        // Browsers that never fire afterprint (some mobile ones): tidy up after a while.
        setTimeout(() => finish(() => resolve({ ok: true })), 60000);
      };
      const img = w.document.querySelector('img');
      if (img && !img.complete) { img.onload = go; img.onerror = go; } else setTimeout(go, 50);
    };
    document.body.appendChild(f);
    f.srcdoc = html;
  });
}
