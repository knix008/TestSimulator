// The print window's drawing: the site's pages measured in hidden frames at the chosen device
// width, then laid on sheets (print/layout.js) — each sheet a clip box holding the page's frame,
// scaled and moved up to the part of the page that sheet shows. The sheets live outside the
// popup's own markup (#print-host), so changing a setting that does not move them (the
// printer, the copies) does not reload a single frame. On screen they are the preview (zoomed
// to fit, scrolled sheet by sheet); in print they are the only thing on the page.
import { bandTexts, layoutSheets, normalizePrintOptions, PRINT_DEVICES, printableHtml } from './layout.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Heights of the pages at each device width: { [device]: Map(pageId → px) }. Measured once each. */
const heights = {};
let measuring = null;

/** Measures every page of the job at the device width; resolves to a Map(pageId → height). */
export function measurePages(job, device) {
  const known = heights[device];
  if (known && job.pages.every((page) => known.has(page.id))) return Promise.resolve(known);
  if (measuring?.device === device) return measuring.promise;
  const width = PRINT_DEVICES[device] ?? PRINT_DEVICES.desktop;
  const box = document.createElement('div');
  box.className = 'print-measure';
  box.setAttribute('aria-hidden', 'true');
  document.body.append(box);
  const promise = Promise.all(job.pages.map((page) => new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.width = `${width}px`;
    frame.style.height = '800px';
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      let height = 800;
      try {
        await frame.contentDocument?.fonts?.ready;
        const doc = frame.contentDocument;
        height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 1);
      } catch { /* the frame could not be read: a screen's height */ }
      resolve([page.id, height]);
    };
    frame.addEventListener('load', finish, { once: true });
    // A picture that never answers does not hold the window forever.
    setTimeout(finish, 8000);
    frame.srcdoc = printableHtml(page.html);
    box.append(frame);
  }))).then((pairs) => {
    box.remove();
    heights[device] = new Map(pairs);
    measuring = null;
    return heights[device];
  });
  measuring = { device, promise };
  return promise;
}

/** The sheets as HTML. Each frame shows the whole page; the clip box shows the part of it this sheet holds. */
export function sheetsHtml(job, layout, options, { t, siteName = '', date = new Date() }) {
  const o = normalizePrintOptions(options);
  const byId = new Map(job.pages.map((page) => [page.id, page]));
  const mm = (value) => `${value.toFixed(3)}mm`;
  return layout.sheets.map((sheet) => {
    const page = byId.get(sheet.pageId);
    const bands = bandTexts(sheet, layout, o, { siteName, date, t });
    const height = heights[o.device]?.get(sheet.pageId) ?? 800;
    const header = o.header ? `<div class="print-band print-header"><span>${escapeHtml(bands.headerLeft)}</span><span>${escapeHtml(bands.headerRight)}</span></div>` : '';
    const footer = o.footer ? `<div class="print-band print-footer"><span>${escapeHtml(bands.footer)}</span></div>` : '';
    return `<div class="print-page" data-sheet="${sheet.number}" style="width:${mm(layout.paper.width)};height:${mm(layout.paper.height)};padding:${mm(layout.margin)}">
      ${header}
      <div class="print-clip" style="width:${mm(layout.area.width)};height:${mm(layout.area.height)}">
        <iframe sandbox="allow-same-origin" tabindex="-1" aria-hidden="true" data-page="${escapeHtml(sheet.pageId)}"
          style="width:${layout.deviceWidth}px;height:${height}px;left:${mm(sheet.left)};transform:scale(${sheet.scale}) translateY(${-sheet.offset}px)"></iframe>
      </div>
      ${footer}
    </div>`;
  }).join('');
}

/** Fills the sheets' frames (srcdoc is set after the markup, so the page HTML is never escaped into an attribute). */
export function fillFrames(host, job, options) {
  const o = normalizePrintOptions(options);
  const byId = new Map(job.pages.map((page) => [page.id, printableHtml(page.html, { background: o.background })]));
  const frames = [...host.querySelectorAll('iframe[data-page]')];
  return Promise.all(frames.map((frame) => new Promise((resolve) => {
    frame.addEventListener('load', resolve, { once: true });
    setTimeout(resolve, 8000);
    frame.srcdoc = byId.get(frame.dataset.page) ?? '';
  })));
}

/** The layout of a job with the options, once the heights are known. */
export function jobLayout(job, options, currentPageId, select) {
  const o = normalizePrintOptions(options);
  const chosen = select(job.pages, o, currentPageId);
  const known = heights[o.device];
  return layoutSheets(chosen.map((page) => ({ id: page.id, name: page.name, height: known?.get(page.id) ?? 800 })), o);
}

/** Only what moves a sheet or changes what it shows rebuilds the frames. */
export const sheetsKey = (options, layout) => {
  const o = normalizePrintOptions(options);
  return JSON.stringify([o.paper, o.orientation, o.margin, o.fit, o.scale, o.device, o.header, o.footer, o.headerText, o.footerText, o.background, layout.sheets.map((s) => [s.pageId, s.part])]);
};
