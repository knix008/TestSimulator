/**
 * How a board looks on paper. The preview and the printed page share this sheet so what
 * is on screen is what comes out of the printer. Everything is scoped under `.print-doc`
 * so it can sit inside the dark application window without taking its colours.
 */
export const PRINT_CSS = `
.print-doc { background: #fff; color: #10212f; font-family: "Segoe UI", "Malgun Gothic", sans-serif; }
.print-doc .sheet-head { display: flex; align-items: baseline; gap: 10px; border-bottom: 2px solid #10212f; padding-bottom: 6px; margin-bottom: 12px; }
.print-doc .sheet-city { font-size: 1.54em; font-weight: 800; letter-spacing: -0.2px; }
.print-doc .sheet-country { font-size: 0.92em; font-weight: 600; color: #5b6b7a; }
.print-doc .sheet-range { margin-left: auto; font-size: 1em; font-weight: 700; color: #1f4f82; }
.print-doc .sheet-when { font-size: 0.92em; color: #5b6b7a; margin-bottom: 10px; font-weight: 600; }
.print-doc .empty { font-size: 0.92em; color: #5b6b7a; }

.print-doc .print-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 0.85em; }
.print-doc .print-table th { text-align: left; font-size: 0.77em; font-weight: 700; color: #5b6b7a; border-bottom: 1px solid #10212f; padding: 4px 6px; }
.print-doc .print-table td { border-bottom: 1px solid #d7e1ea; padding: 5px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.print-doc .print-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.print-doc .print-table .name strong { font-weight: 700; }
.print-doc .print-table .name em { font-style: normal; color: #5b6b7a; margin-left: 6px; font-size: 0.77em; }
.print-doc .print-table tr.is-index td { background: #f2f6fa; font-weight: 700; }
.print-doc .print-table tr[data-tone="gain"] .tone { color: #1f8a5b; font-weight: 700; }
.print-doc .print-table tr[data-tone="loss"] .tone { color: #c0392b; font-weight: 700; }
.print-doc .news-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.print-doc .news-list li { border-bottom: 1px solid #d7e1ea; padding-bottom: 6px; }
.print-doc .news-list .title { display: block; font-size: 0.92em; font-weight: 700; }
.print-doc .news-list .meta { display: block; font-size: 0.77em; color: #5b6b7a; margin-top: 2px; }
.print-doc .sheet { display: flex; flex-direction: column; }
.print-doc .sheet-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.print-doc .sheet-foot { flex: 0 0 auto; margin-top: 10px; border-top: 1px solid #d7e1ea; padding-top: 4px; font-size: 0.77em; color: #5b6b7a; display: flex; }
.print-doc .sheet-foot[data-at="left"] { justify-content: flex-start; }
.print-doc .sheet-foot[data-at="center"] { justify-content: center; }
.print-doc .sheet-foot[data-at="right"] { justify-content: flex-end; }
`;

/** The same sheet plus the page rules, for the document that actually goes to the printer. */
export function printDocumentCss(setup) {
  return `${PRINT_CSS}
@page { size: ${setup.paper} ${setup.orientation}; margin: ${setup.margin}mm; }
html, body { margin: 0; padding: 0; }
/* The preview draws at 13px times the scale; paper uses the same measure. */
body { font-size: ${(13 * setup.scale) / 100}px; }
.print-doc .sheet { page-break-after: always; break-after: page; padding: 0; min-height: 100vh; }
.print-doc .sheet:last-child { page-break-after: auto; break-after: auto; }
`;
}
