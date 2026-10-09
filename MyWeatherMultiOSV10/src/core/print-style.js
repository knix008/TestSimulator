/**
 * How the forecast looks on paper. The preview and the printed page share this sheet so what
 * is on screen is what comes out of the printer. Everything is scoped under `.print-doc`
 * so it can sit inside the dark application window without taking its colours.
 */
export const PRINT_CSS = `
.print-doc { background: #fff; color: #10212f; font-family: "Segoe UI", "Malgun Gothic", sans-serif; }
.print-doc .sheet-head { display: flex; align-items: baseline; gap: 10px; border-bottom: 2px solid #10212f; padding-bottom: 6px; margin-bottom: 12px; }
.print-doc .sheet-city { font-size: 20px; font-weight: 800; letter-spacing: -0.2px; }
.print-doc .sheet-country { font-size: 12px; font-weight: 600; color: #5b6b7a; }
.print-doc .sheet-range { margin-left: auto; font-size: 13px; font-weight: 700; color: #1f4f82; }
.print-doc .sheet-when { font-size: 12px; color: #5b6b7a; margin-bottom: 10px; font-weight: 600; }
.print-doc .range-title { font-size: 14px; font-weight: 700; margin: 0 0 8px; color: #10212f; }
.print-doc .empty { font-size: 12px; color: #5b6b7a; }

.print-doc .hour-board { display: flex; flex-direction: column; gap: 8px; }
.print-doc .hour-band { display: grid; grid-template-columns: 54px repeat(6, 1fr); align-items: center; gap: 4px; }
.print-doc .band-name { font-size: 11px; font-weight: 700; color: #1f4f82; }
.print-doc .hour {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  border: 1px solid #d7e1ea; border-radius: 6px; background: #f7fafd; padding: 4px 2px;
  font-size: 10px; font-weight: 600; color: #10212f;
}
.print-doc .hour.is-empty { color: #9aa8b5; background: #fff; }
.print-doc .hour svg { width: 22px; height: 22px; }

.print-doc .week-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.print-doc .month-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.print-doc .month-head { text-align: center; font-size: 11px; font-weight: 700; color: #5b6b7a; padding-bottom: 2px; }
.print-doc .day {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  border: 1px solid #d7e1ea; border-radius: 6px; background: #f7fafd; padding: 5px 2px;
  font-size: 10px; color: #10212f;
}
.print-doc .day.is-outside { background: #fff; border-style: dashed; color: #b6c2cd; }
.print-doc .day.is-today { border-color: #1f4f82; border-width: 2px; background: #eaf2fb; }
.print-doc .day.is-alert { border-color: #c0392b; }
.print-doc .day .weekday { font-size: 10px; font-weight: 700; color: #1f4f82; }
.print-doc .day .day-num { font-size: 13px; font-weight: 800; }
.print-doc .day svg { width: 24px; height: 24px; }
.print-doc .day .temps { display: flex; gap: 4px; font-size: 10px; font-weight: 600; }
.print-doc .day .temps span:first-child { color: #5b6b7a; }
.print-doc .day .temps span:last-child { color: #c0392b; }
.print-doc .hour-gap { color: #b6c2cd; }
.print-doc .sheet { display: flex; flex-direction: column; }
.print-doc .sheet-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.print-doc .sheet-foot { flex: 0 0 auto; margin-top: 10px; border-top: 1px solid #d7e1ea; padding-top: 4px; font-size: 10px; color: #5b6b7a; display: flex; }
.print-doc .sheet-foot[data-at="left"] { justify-content: flex-start; }
.print-doc .sheet-foot[data-at="center"] { justify-content: center; }
.print-doc .sheet-foot[data-at="right"] { justify-content: flex-end; }
`;

/** The same sheet plus the page rules, for the document that actually goes to the printer. */
export function printDocumentCss(setup) {
  return `${PRINT_CSS}
@page { size: ${setup.paper} ${setup.orientation}; margin: ${setup.margin}mm; }
html, body { margin: 0; padding: 0; }
body { font-size: ${setup.scale}%; }
.print-doc .sheet { page-break-after: always; break-after: page; padding: 0; min-height: 100vh; }
.print-doc .sheet:last-child { page-break-after: auto; break-after: auto; }
`;
}
