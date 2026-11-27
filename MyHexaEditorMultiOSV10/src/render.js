// The render window (desktop, label "render", opened by lib.rs open_render_window): takes its job, puts
// the standalone HTML document in place of this page, lays it out in A4 pages with paged.js and fills
// the contents' page numbers. Then
//   pdf    — writes the pages to the job's path (WebView2 PrintToPdf) and reports to the main window;
//   direct — prints the pages to the job's printer without a dialog (the print window's Print button);
//   print — shows itself (a print preview of the pages) and opens the system print dialog.
// The answer is the event `render-done` to the main window: { ok, pages, error? }.
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as native from './platform/native.js';
import { fillIndexPages, loadHtml, runPaged } from './lib/paginate.js';

const done = (answer) => native.emitTo('main', 'render-done', answer).catch(() => {});

async function run() {
  const job = await native.takeRenderJob();
  if (!job) return done({ ok: false, error: 'no job' });
  loadHtml(document, job.html);
  let pages = 0;
  try {
    pages = await runPaged(window);
    fillIndexPages(document);
  } catch (error) {
    // Printed as the browser lays it out (no page boxes): better than nothing.
    console.warn(error);
  }
  // Two frames: the filled-in numbers are painted before the pages are captured.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (job.mode === 'pdf') {
    await native.printPagesToPdf(job.path, job.widthMm ?? 210, job.heightMm ?? 297);
    return done({ ok: true, pages });
  }
  if (job.mode === 'direct') {
    // The print window's Print button: straight to the chosen printer, no dialog.
    await native.invoke('print_direct', { job: { printer: job.printer ?? '', copies: job.copies ?? 1, widthMm: job.widthMm ?? 210, heightMm: job.heightMm ?? 297, pageRanges: job.pageRanges ?? '' } });
    return done({ ok: true, pages });
  }
  const win = getCurrentWindow();
  await win.show();
  await win.setFocus().catch(() => {});
  done({ ok: true, pages, shown: true });
  await native.printWindow();
  return undefined;
}

run().catch((error) => done({ ok: false, error: native.errorText(error) }));
