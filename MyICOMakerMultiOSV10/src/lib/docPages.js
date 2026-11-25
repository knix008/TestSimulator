// Cuts the user's guide into printed pages for the print window (as in MyImage2Text).
//
// The guide is laid out once in a hidden box exactly as wide as the page's text area, then cut
// between blocks: paragraphs, pictures, headings, list items and table rows. A heading never
// ends a page, a table repeats its header row on the next page and a numbered list keeps its
// numbering. A block taller than a whole page gets a page of its own and is clipped there.

export const MM_PX = 96 / 25.4;

/** The guide file of a language, relative to the page. */
export const guideFile = (lang) => (lang === 'en' ? 'docs/UsersGuide.en.html' : 'docs/UsersGuide.html');

/**
 * The guide's printable content: <main> without the table of contents, with picture paths made
 * absolute (the print window is not in docs/), and the document's title.
 */
export function guideContent(html, baseUrl) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const main = parsed.querySelector('main') ?? parsed.body;
  main.querySelectorAll('nav.toc, script').forEach((el) => el.remove());
  main.querySelectorAll('img[src]').forEach((img) => { img.setAttribute('src', new URL(img.getAttribute('src'), baseUrl).href); });
  main.querySelectorAll('a[href^="#"]').forEach((a) => a.removeAttribute('href'));
  return { html: main.innerHTML, title: parsed.title.trim() };
}

/**
 * Plain pagination over measured units: [{ top, bottom, keepWithNext, lead }] in px → page index
 * lists. `lead` is what a unit brings along when it starts a page (a table row: the repeated
 * header row).
 */
export function planPages(units, pageHeight) {
  const pages = [];
  let current = [];
  let pageTop = 0;
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    if (!current.length) pageTop = unit.top - (unit.lead ?? 0);
    if (current.length && unit.bottom - pageTop > pageHeight + 0.5) {
      // Carry trailing "keep with next" units (headings) over to the new page.
      const carried = [];
      while (current.length > 1 && units[current[current.length - 1]].keepWithNext) carried.unshift(current.pop());
      pages.push(current);
      current = carried;
      const first = carried.length ? units[carried[0]] : unit;
      pageTop = first.top - (first.lead ?? 0);
    }
    current.push(i);
  }
  if (current.length) pages.push(current);
  return pages;
}

const SPLIT_LIST = new Set(['UL', 'OL']);
const KEEP = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** Measures the children of `body` (in the page and laid out) into units. */
function measureUnits(body, pageHeight) {
  const base = body.getBoundingClientRect().top;
  const units = [];
  const box = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { top: r.top - base - parseFloat(cs.marginTop || 0), bottom: r.bottom - base + parseFloat(cs.marginBottom || 0) };
  };
  for (const child of body.children) {
    const outer = box(child);
    const tall = outer.bottom - outer.top > pageHeight * 0.6;
    if (tall && child.tagName === 'TABLE' && child.rows.length > 1) {
      const rows = [...child.rows];
      // The guide's tables have their header as the first row (no <thead>).
      const head = child.tHead ?? (rows[0].querySelector('th') ? rows[0] : null);
      const body = head && !child.tHead ? rows.slice(1) : rows;
      const headHeight = head ? head.getBoundingClientRect().height : 0;
      body.forEach((row, index) => {
        const r = box(row);
        units.push({
          node: row, parent: child, kind: 'row', head,
          top: index === 0 ? outer.top : r.top,
          bottom: index === body.length - 1 ? outer.bottom : r.bottom,
          keepWithNext: false,
          lead: index === 0 ? 0 : headHeight,
        });
      });
      continue;
    }
    if (tall && SPLIT_LIST.has(child.tagName) && child.children.length > 1) {
      const items = [...child.children];
      items.forEach((item, index) => {
        const r = box(item);
        units.push({
          node: item, parent: child, kind: 'item', index,
          top: index === 0 ? outer.top : r.top,
          bottom: index === items.length - 1 ? outer.bottom : r.bottom,
          keepWithNext: false,
        });
      });
      continue;
    }
    units.push({ node: child, parent: null, kind: 'block', ...outer, keepWithNext: KEEP.has(child.tagName) });
  }
  return units;
}

/** Rebuilds the units of one page as HTML: rows go back into a table, items into a list. */
function buildPage(units) {
  const out = [];
  let group = null;
  for (const unit of units) {
    if (unit.kind === 'block') {
      group = null;
      out.push(unit.node.cloneNode(true));
      continue;
    }
    if (!group || group.source !== unit.parent) {
      const shell = unit.parent.cloneNode(false);
      if (unit.kind === 'row') {
        const tbody = document.createElement('tbody');
        if (unit.head) tbody.append(unit.head.cloneNode(true));
        shell.append(tbody);
        group = { source: unit.parent, shell, into: tbody };
      } else {
        if (unit.parent.tagName === 'OL') {
          const start = Number(unit.parent.getAttribute('start') || 1);
          shell.setAttribute('start', String(start + unit.index));
        }
        group = { source: unit.parent, shell, into: shell };
      }
      out.push(shell);
    }
    group.into.append(unit.node.cloneNode(true));
  }
  return out.map((el) => el.outerHTML).join('');
}

/** The natural size of a picture, or null when it does not load within a few seconds. */
function imageSize(src) {
  return new Promise((done) => {
    const img = new Image();
    const timer = setTimeout(() => done(null), 8000);
    img.onload = () => { clearTimeout(timer); done(img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null); };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = src;
  });
}

/**
 * Lays out `html` in `host` (an element styled like the printed text, already in the document)
 * at the given text area and returns the pages as HTML strings.
 */
export async function paginate(host, html, { widthMm, heightMm }) {
  const pageHeight = heightMm * MM_PX;
  host.style.width = `${widthMm}mm`;
  host.innerHTML = html;
  // The guide's pictures load lazily, which never happens in a box off screen: load each one
  // first and write its size into the <img>, so every page lays out as measured.
  const pictures = [...host.querySelectorAll('img')];
  const sizes = new Map(await Promise.all([...new Set(pictures.map((img) => img.src))].map(async (src) => [src, await imageSize(src)])));
  for (const img of pictures) {
    img.loading = 'eager';
    const size = sizes.get(img.src);
    if (size) { img.width = size.width; img.height = size.height; }
    // A picture that does not load is left out: its "broken" box has no reliable size, so the
    // measured page and the printed one would differ.
    else img.remove();
  }
  const units = measureUnits(host, pageHeight);
  // The plan comes from the measured blocks; each planned page is then laid out on its own in a
  // probe of the same style (margins collapse differently once a page starts with a cut table
  // or list) and gives back trailing blocks until it really fits.
  const probe = host.cloneNode(false);
  probe.removeAttribute('aria-hidden');
  host.after(probe);
  const fits = (pageHtml) => {
    probe.innerHTML = pageHtml;
    const top = probe.getBoundingClientRect().top;
    const last = probe.lastElementChild;
    return !last || last.getBoundingClientRect().bottom - top <= pageHeight + 0.5;
  };
  const pages = [];
  let rest = units.map((_, i) => i);
  while (rest.length) {
    const page = planPages(rest.map((i) => units[i]), pageHeight)[0].map((k) => rest[k]);
    while (page.length > 1 && !fits(buildPage(page.map((i) => units[i])))) {
      page.pop();
      // A heading does not end a page: it goes along with what it heads.
      while (page.length > 1 && units[page[page.length - 1]].keepWithNext) page.pop();
    }
    pages.push(buildPage(page.map((i) => units[i])));
    rest = rest.slice(page.length);
  }
  probe.remove();
  host.replaceChildren();
  return pages;
}
