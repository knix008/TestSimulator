(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyMergePrint = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROWS = 16;

  function paginate(text, rows) {
    const size = Math.max(1, rows || ROWS);
    const norm = String(text == null ? "" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = norm === "" ? [""] : norm.replace(/\n$/, "").split("\n");
    const pages = [];
    for (let i = 0; i < lines.length; i += size) pages.push(lines.slice(i, i + size));
    if (!pages.length) pages.push([""]);
    return pages;
  }

  function selectPages(documents, options) {
    const opts = options || {};
    const scope = opts.scope || "current";
    const rows = opts.rows || ROWS;
    let chosen = documents || [];
    if (scope === "current" || scope === "custom") {
      const index = Math.max(0, Math.min(chosen.length - 1, opts.currentIndex || 0));
      chosen = chosen.length ? [chosen[index]] : [];
    }
    let pages = [];
    chosen.forEach((doc) => {
      paginate(doc.text == null ? doc.resultText : doc.text, rows).forEach((lines) => {
        pages.push({ name: doc.name || "document", lines: lines });
      });
    });
    if (!pages.length) pages = [{ name: "document", lines: [""] }];
    if (scope === "custom") {
      const from = Math.max(1, Number(opts.from) || 1);
      const to = Math.max(from, Number(opts.to) || pages.length);
      pages = pages.filter((_page, index) => index + 1 >= from && index + 1 <= to);
      if (!pages.length) pages = [{ name: chosen[0] ? chosen[0].name : "document", lines: [""] }];
    }
    return pages;
  }

  return { ROWS: ROWS, paginate: paginate, selectPages: selectPages };
});
