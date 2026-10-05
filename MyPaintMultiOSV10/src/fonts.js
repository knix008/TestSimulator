(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintFonts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FALLBACK = [
    "Arial", "Calibri", "Cambria", "Consolas", "Courier New", "Georgia",
    "Malgun Gothic", "Segoe UI", "Tahoma", "Times New Roman", "Verdana",
    "monospace", "sans-serif", "serif",
  ];

  function familyName(raw) {
    return String(raw || "")
      .replace(/\s*\(TrueType\)$/i, "")
      .replace(/\s*\(OpenType\)$/i, "")
      .replace(/\s*\(All Res\)$/i, "")
      .replace(/\s+(Bold Italic|Bold Oblique|Bold|Italic|Oblique|Regular|Light|Medium|Semibold|SemiBold|Black|Narrow|ExtraBold|Extra Light)$/i, "")
      .trim();
  }

  function parseWindowsFontQuery(text) {
    const families = new Set();
    String(text || "").split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s+(.+?)\s+REG_SZ\s+/i);
      if (!match) return;
      const name = familyName(match[1]);
      if (name) families.add(name);
    });
    return Array.from(families).sort((a, b) => a.localeCompare(b));
  }

  function uniqueFamilies(names) {
    const seen = new Set();
    const out = [];
    (names || []).forEach((name) => {
      const clean = String(name || "").trim();
      if (!clean || seen.has(clean.toLowerCase())) return;
      seen.add(clean.toLowerCase());
      out.push(clean);
    });
    return out.sort((a, b) => a.localeCompare(b));
  }

  return {
    FALLBACK: FALLBACK,
    familyName: familyName,
    parseWindowsFontQuery: parseWindowsFontQuery,
    uniqueFamilies: uniqueFamilies,
  };
});
