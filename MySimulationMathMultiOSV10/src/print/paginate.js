// Lays a print document (printdoc.js buildPrintHtml) out into pages, in the
// document's own window (the preview iframe): the content of #msp-src is
// poured into page bodies of the exact printable size, block by block; a
// block taller than the room left goes to the next page, and one taller than
// a whole page is split into its children (code lines, table rows with the
// header repeated, list items, paragraphs, lines of a <pre>). Then the
// header / footer are filled in, the page range is applied and the pages are
// put on sheets (pages per sheet). What comes out is static HTML that any
// renderer prints the same way.
import { normalizeSetup, pageGeometry, nupLayout, esc, parsePageRanges } from './printdoc.js';

const ATOMIC = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'TR', 'THEAD', 'IFRAME', 'svg', 'MATH', 'math', 'BR', 'HR', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA']);
const HEADING = /^H[1-6]$/;

function blankText(n) { return n.nodeType === 3 && !/\S/.test(n.nodeValue); }

function splittable(n) {
  if (n.nodeType !== 1 || ATOMIC.has(n.tagName)) return false;
  return n.childNodes.length > 1 || (n.childNodes.length === 1 && n.firstChild.nodeType === 1 && splittable(n.firstChild));
}

/** A <pre> of plain text: one text node per line, so it can be split between pages. */
function splitPreLines(root) {
  for (const pre of root.querySelectorAll('pre')) {
    if (![...pre.childNodes].every((c) => c.nodeType === 3)) continue;
    const text = pre.textContent;
    if (text.indexOf('\n') < 0) continue;
    pre.textContent = '';
    const parts = text.split('\n');
    parts.forEach((p, i) => pre.appendChild(pre.ownerDocument.createTextNode(i < parts.length - 1 ? `${p}\n` : p)));
  }
}

/** The copy of an element that continues it on the next page. */
function shell(node, cont) {
  const s = node.cloneNode(false);
  if (cont) {
    if (s.removeAttribute) s.removeAttribute('id');
    if (node.tagName === 'TABLE') {
      const th = node.tHead || [...node.children].find((c) => c.tagName === 'THEAD');
      if (th) s.appendChild(th.cloneNode(true));
      const cap = [...s.children].find((c) => c.tagName === 'CAPTION');
      if (cap) cap.remove();
    }
  }
  return s;
}

/**
 * paginate(doc, setup, info) -> { pages, printed, sheets }
 * info: { title, date, pageRanges? (1-based page numbers or null = all) }
 */
export function paginate(doc, setup, info = {}) {
  const s = normalizeSetup(setup);
  const g = pageGeometry(s);
  const body = doc.body;
  const src = doc.getElementById('msp-src');
  const kind = body.dataset.kind || 'text';
  const content = src ? [...src.childNodes] : [];
  if (src) src.remove();
  const staging = doc.createElement('div');
  staging.className = 'msp-staging';
  body.appendChild(staging);

  const pages = [];
  let zoom = s.scaleMode === 'custom' && kind !== 'image' ? s.scale / 100 : 1;
  const mkPage = () => {
    const page = doc.createElement('div');
    page.className = 'msp-page';
    const b = doc.createElement('div');
    b.className = 'msp-body';
    const z = doc.createElement('div');
    z.className = 'msp-zoom';
    if (zoom !== 1) { z.style.zoom = String(zoom); z.style.width = `${g.cw / zoom}mm`; }
    b.appendChild(z);
    page.appendChild(b);
    staging.appendChild(page);
    pages.push(page);
    return { page, body: b, zoom: z };
  };

  if (kind === 'image') {
    const p = mkPage();
    content.forEach((n) => p.zoom.appendChild(n));
    p.zoom.style.height = '100%';
  } else {
    content.forEach((n) => { if (n.nodeType === 1) splitPreLines(n); });
    // Fit: shrink (never enlarge) so the widest line / table fits the width.
    if (s.scaleMode === 'fit') {
      const probe = mkPage();
      content.forEach((n) => probe.zoom.appendChild(n));
      const need = probe.zoom.scrollWidth;
      const have = probe.body.clientWidth;
      if (need > have + 1 && have > 0) zoom = Math.max(0.1, have / need);
      content.forEach((n) => n.remove());
      probe.page.remove();
      pages.pop();
    }
    let cur = mkPage();
    let placed = 0;
    const fits = (extra = 0) => cur.body.scrollHeight <= cur.body.clientHeight + 0.5 - extra;
    const top = () => { cur = mkPage(); placed = 0; return cur.zoom; };
    const pour = (nodes, start, rebuild) => {
      let container = start;
      for (const node of nodes) {
        if (blankText(node)) { container.appendChild(node); continue; }
        const keep = node.nodeType === 1 && HEADING.test(node.tagName) ? 28 : 0; // a heading keeps a line or two with it
        container.appendChild(node);
        if (fits(keep)) { placed += 1; continue; }
        // A splittable block taller than a whole page is split here, not moved: moving it would leave
        // this page nearly empty (e.g. a contents list after its title).
        const huge = node.nodeType === 1 && splittable(node) && node.getBoundingClientRect().height > cur.body.getBoundingClientRect().height;
        node.remove();
        if (placed > 0 && !huge) {
          container = rebuild();
          container.appendChild(node);
          if (fits()) { placed += 1; continue; }
          node.remove();
        }
        if (!splittable(node)) { container.appendChild(node); placed += 1; continue; } // taller than a page: clipped
        let mine = shell(node, false);
        container.appendChild(mine);
        const kids = [...node.childNodes];
        pour(kids, mine, () => {
          if (!mine.textContent.trim() && !mine.querySelector('img,svg,canvas')) mine.remove();
          container = rebuild();
          mine = shell(node, true);
          container.appendChild(mine);
          return mine;
        });
      }
    };
    pour(content, cur.zoom, top);
    // A last page holding only empty shells (whitespace) is dropped.
    if (pages.length > 1 && !cur.zoom.textContent.trim() && !cur.zoom.querySelector('img,svg,canvas,table')) { cur.page.remove(); pages.pop(); }
  }

  // Header / footer.
  const total = pages.length;
  const headText = s.headerText || info.title || '';
  pages.forEach((page, i) => {
    page.dataset.page = String(i + 1);
    if (g.head) {
      const h = doc.createElement('div');
      h.className = 'msp-head';
      h.innerHTML = `<span class="msp-title">${s.header ? esc(headText) : ''}</span><span class="msp-date">${s.date ? esc(info.date || '') : ''}</span>`;
      page.appendChild(h);
    }
    if (g.foot) {
      const f = doc.createElement('div');
      f.className = 'msp-foot';
      f.textContent = `${i + 1} / ${total}`;
      page.appendChild(f);
    }
  });

  // Page range.
  const list = typeof info.pageRanges === 'string' ? parsePageRanges(info.pageRanges, total) : info.pageRanges;
  const wanted = Array.isArray(list) && list.length ? new Set(list) : null;
  const kept = wanted ? pages.filter((p, i) => wanted.has(i + 1)) : pages;
  pages.forEach((p) => { if (!kept.includes(p)) p.remove(); });

  // Sheets.
  const L = nupLayout(s);
  if (L.n > 1) body.classList.add('msp-nup');
  let sheets = 0;
  for (let i = 0; i < kept.length; i += L.n) {
    const sheet = doc.createElement('div');
    sheet.className = 'msp-sheet';
    kept.slice(i, i + L.n).forEach((page, k) => {
      if (L.n > 1) {
        const col = k % L.cols;
        const row = Math.floor(k / L.cols);
        const x = col * L.cellW + (L.cellW - g.pw * L.scale) / 2;
        const y = row * L.cellH + (L.cellH - g.ph * L.scale) / 2;
        page.style.transform = `translate(${x}mm, ${y}mm) scale(${L.scale})`;
      }
      sheet.appendChild(page);
    });
    body.appendChild(sheet);
    sheets += 1;
  }
  staging.remove();
  return { pages: total, printed: kept.length, sheets, zoom };
}

/** Waits for the images and fonts of a document (at most `limitMs`: a stuck image never blocks the preview). */
export async function settle(doc, limitMs = 15000) {
  const imgs = [...doc.images];
  // loading="lazy" images in a hidden frame never start loading: load them all now.
  for (const img of imgs) if (img.loading === 'lazy') { img.loading = 'eager'; const src = img.src; img.src = ''; img.src = src; }
  const all = (async () => {
    await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }))));
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
    if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch { /* no fonts API */ } }
  })();
  await Promise.race([all, new Promise((r) => setTimeout(r, limitMs))]);
}

/** The finished document as a string (to print it elsewhere). */
export function serialize(doc) {
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
