(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintPrint = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MM_TO_PX = 96 / 25.4;

  const PAPERS = {
    A3: { width: 297, height: 420 },
    A4: { width: 210, height: 297 },
    A5: { width: 148, height: 210 },
    B4: { width: 250, height: 353 },
    B5: { width: 176, height: 250 },
    Letter: { width: 215.9, height: 279.4 },
    Legal: { width: 215.9, height: 355.6 },
    Tabloid: { width: 279.4, height: 431.8 },
  };

  function paperSize(paper, orientation) {
    const size = PAPERS[paper] || PAPERS.A4;
    if (orientation === "landscape") return { width: size.height, height: size.width };
    return { width: size.width, height: size.height };
  }

  /* A margin is either one number for all four sides or a box of four. */
  function marginsOf(margin) {
    const edge = (value, fallback) => {
      const number = Number(value == null ? fallback : value);
      return Math.max(0, Math.min(60, Number.isFinite(number) ? number : 0));
    };
    if (margin && typeof margin === "object") {
      const all = edge(margin.all, 0);
      return {
        top: edge(margin.top, all),
        right: edge(margin.right, all),
        bottom: edge(margin.bottom, all),
        left: edge(margin.left, all),
      };
    }
    const all = edge(margin, 0);
    return { top: all, right: all, bottom: all, left: all };
  }

  function printable(paper, orientation, margin) {
    const size = paperSize(paper, orientation);
    const box = marginsOf(margin);
    return {
      width: Math.max(10, size.width - box.left - box.right),
      height: Math.max(10, size.height - box.top - box.bottom),
      paper: size,
      margin: box,
    };
  }

  function printablePixels(paper, orientation, margin) {
    const area = printable(paper, orientation, margin);
    return {
      width: Math.max(1, Math.round(area.width * MM_TO_PX)),
      height: Math.max(1, Math.round(area.height * MM_TO_PX)),
      margin: area.margin,
      mm: area,
    };
  }

  function tilesFor(doc, options) {
    const opts = options || {};
    const area = printablePixels(opts.paper, opts.orientation, opts.margin);
    const width = Math.max(1, Number(doc.width) || 1);
    const height = Math.max(1, Number(doc.height) || 1);
    if (width <= area.width && height <= area.height) {
      return [{
        name: doc.name,
        doc: doc,
        source: { x: 0, y: 0, w: width, h: height },
        column: 1,
        row: 1,
        columns: 1,
        rows: 1,
        area: area,
      }];
    }
    const columns = Math.ceil(width / area.width);
    const rows = Math.ceil(height / area.height);
    const pages = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        pages.push({
          name: doc.name,
          doc: doc,
          source: {
            x: column * area.width,
            y: row * area.height,
            w: Math.min(area.width, width - column * area.width),
            h: Math.min(area.height, height - row * area.height),
          },
          column: column + 1,
          row: row + 1,
          columns: columns,
          rows: rows,
          area: area,
        });
      }
    }
    return pages;
  }

  function selectPages(documents, options) {
    const opts = options || {};
    const scope = opts.scope || "current";
    let chosen = documents || [];
    if (scope === "current" || scope === "custom") {
      const index = Math.max(0, Math.min(chosen.length - 1, opts.currentIndex || 0));
      chosen = chosen.length ? [chosen[index]] : [];
    }
    let pages = [];
    chosen.forEach((doc) => {
      tilesFor(doc, opts).forEach((page) => pages.push(page));
    });
    if (!pages.length) {
      pages = [{
        name: "untitled",
        doc: { name: "untitled", width: 1, height: 1, background: "#ffffff", shapes: [] },
        source: { x: 0, y: 0, w: 1, h: 1 },
        column: 1,
        row: 1,
        columns: 1,
        rows: 1,
        area: printablePixels(opts.paper, opts.orientation, opts.margin),
      }];
    }
    if (scope === "custom") {
      const from = Math.max(1, Number(opts.from) || 1);
      const to = Math.max(from, Number(opts.to) || pages.length);
      const picked = pages.filter((_page, index) => index + 1 >= from && index + 1 <= to);
      if (picked.length) pages = picked;
      else pages = [pages[0]];
    }
    return pages.map((page, index) => Object.assign({}, page, { index: index + 1, total: pages.length }));
  }

  function pageLabel(page, lang) {
    if (!page) return "";
    if (page.columns * page.rows <= 1) return page.name;
    const of = lang === "en" ? "part" : "조각";
    return page.name + " " + of + " " + page.column + "x" + page.row;
  }

  return {
    MM_TO_PX: MM_TO_PX,
    PAPERS: PAPERS,
    PAPER_IDS: Object.keys(PAPERS),
    marginsOf: marginsOf,
    paperSize: paperSize,
    printable: printable,
    printablePixels: printablePixels,
    tilesFor: tilesFor,
    selectPages: selectPages,
    pageLabel: pageLabel,
  };
});
