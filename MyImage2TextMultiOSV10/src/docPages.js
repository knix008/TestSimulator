// Splits a rendered document (the user guide) into printed pages for the print window.
//
// The document is laid out once in a hidden box exactly as wide as the page's text area, then
// cut between blocks: paragraphs, pictures, headings, list items and table rows. A heading never
// ends a page, a table repeats its header row on the next page, and a numbered list keeps its
// numbering. A block taller than a whole page gets a page of its own and is clipped there.

/** Plain pagination over measured units: [{ top, bottom, keepWithNext }] in px → page index lists. */
export function planPages(units, pageHeight) {
  const pages = [];
  let current = [];
  let pageTop = 0;
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    if (!current.length) pageTop = unit.top;
    if (current.length && unit.bottom - pageTop > pageHeight + 0.5) {
      // Carry trailing "keep with next" units (headings) over to the new page.
      const carried = [];
      while (current.length > 1 && units[current[current.length - 1]].keepWithNext) carried.unshift(current.pop());
      pages.push(current);
      current = carried;
      pageTop = carried.length ? units[carried[0]].top : unit.top;
    }
    current.push(i);
  }
  if (current.length) pages.push(current);
  return pages;
}

const SPLIT_LIST = new Set(['UL', 'OL']);
const KEEP = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** Measures the children of `body` (already in the page and laid out) into units. */
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
    if (tall && child.tagName === 'TABLE' && child.tBodies.length) {
      const head = child.tHead;
      const rows = [...child.tBodies].flatMap((tbody) => [...tbody.rows]);
      rows.forEach((row, index) => {
        const r = box(row);
        units.push({
          node: row, parent: child, kind: 'row', head,
          top: index === 0 ? outer.top : r.top,
          bottom: index === rows.length - 1 ? outer.bottom : r.bottom,
          keepWithNext: false,
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

/** Rebuilds the units of one page as fresh elements: rows go back into a table, items into a list. */
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
        if (unit.head) shell.append(unit.head.cloneNode(true));
        const tbody = document.createElement('tbody');
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
  return out;
}

/** The natural size of a picture, or null when it does not load within a few seconds. */
function imageSize(src) {
  return new Promise((done) => {
    const img = new Image();
    const timer = setTimeout(() => done(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      done(img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    img.src = src;
  });
}

/**
 * Lays out `html` in `host` (an element styled like the printed text, already in the document)
 * at the given width and returns the pages as lists of elements.
 */
export async function paginate(host, html, { widthMm, heightMm }) {
  const MM_PX = 96 / 25.4;
  const pageHeight = heightMm * MM_PX;
  host.style.width = `${widthMm}mm`;
  host.style.setProperty('--page-text-h', `${heightMm}mm`);
  host.innerHTML = html;
  // The guide's pictures load lazily, which never happens in a box off screen. Load each one
  // first and write its size into the <img>, so the measured page and every copy of it lay out
  // the same before the picture itself has arrived.
  const pictures = [...host.querySelectorAll('img')];
  const sizes = new Map(await Promise.all([...new Set(pictures.map((img) => img.src))].map(async (src) => [src, await imageSize(src)])));
  for (const img of pictures) {
    img.loading = 'eager';
    const size = sizes.get(img.src);
    if (size) {
      img.width = size.width;
      img.height = size.height;
    }
  }
  const units = measureUnits(host, pageHeight);
  const pages = planPages(units, pageHeight).map((indexes) => buildPage(indexes.map((i) => units[i])));
  host.replaceChildren();
  return pages;
}
