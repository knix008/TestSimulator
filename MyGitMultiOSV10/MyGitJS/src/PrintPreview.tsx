import { useMemo } from "react";
import { chunks, layoutReport, MARGIN_CHOICES, runningBands, type PageAlign, type PageNumberPosition, type PageNumberStyle, type PageSetup, type PaperId, type PrintChunk, type RunningSlots } from "../core/printLayout";
import type { Report } from "../core/report";

const POSITIONS: PageNumberPosition[] = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

export function PrintPreview(props: {
  report: Report;
  setup: PageSetup;
  t: (key: string) => string;
  onSetup: (setup: PageSetup) => void;
}) {
  const { pages, box } = useMemo(() => layoutReport(props.report, props.setup), [props.report, props.setup]);
  const scale = 0.42;
  const patch = (next: Partial<PageSetup>) => props.onSetup({ ...props.setup, ...next });
  return (
    <div className="print-screen">
      <aside className="page-setup">
        <h3>{props.t("pageSetup")}</h3>
        <label>{props.t("paperSize")}
          <select value={props.setup.paper} onChange={(event) => patch({ paper: event.target.value as PaperId })}>
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
        </label>
        <label>{props.t("orientation")}
          <select value={props.setup.orientation} onChange={(event) => patch({ orientation: event.target.value as PageSetup["orientation"] })}>
            <option value="portrait">{props.t("portrait")}</option>
            <option value="landscape">{props.t("landscape")}</option>
          </select>
        </label>
        <label>{props.t("marginMm")}
          <select value={props.setup.marginMm} onChange={(event) => patch({ marginMm: Number(event.target.value) })}>
            {MARGIN_CHOICES.map((margin) => <option key={margin} value={margin}>{margin} mm</option>)}
          </select>
        </label>
        <h4>{props.t("pageHeader")}</h4>
        <label className="check-row">
          <input type="checkbox" checked={props.setup.showHeader} onChange={(event) => patch({ showHeader: event.target.checked })} />
          <span>{props.t("pageHeader")}</span>
        </label>
        <label>{props.t("headerText")}
          <input type="text" value={props.setup.headerText} onChange={(event) => patch({ headerText: event.target.value })} />
        </label>
        <AlignSelect label={props.t("headerAlign")} value={props.setup.headerAlign} t={props.t} onChange={(headerAlign) => patch({ headerAlign })} />
        <h4>{props.t("pageFooter")}</h4>
        <label className="check-row">
          <input type="checkbox" checked={props.setup.showFooter} onChange={(event) => patch({ showFooter: event.target.checked })} />
          <span>{props.t("pageFooter")}</span>
        </label>
        <label>{props.t("footerText")}
          <input type="text" value={props.setup.footerText} onChange={(event) => patch({ footerText: event.target.value })} />
        </label>
        <AlignSelect label={props.t("footerAlign")} value={props.setup.footerAlign} t={props.t} onChange={(footerAlign) => patch({ footerAlign })} />
        <label className="check-row">
          <input type="checkbox" checked={props.setup.showDate} onChange={(event) => patch({ showDate: event.target.checked })} />
          <span>{props.t("showPrintDate")}</span>
        </label>
        <h4>{props.t("showPageNumber")}</h4>
        <label className="check-row">
          <input type="checkbox" checked={props.setup.showPageNumber} onChange={(event) => patch({ showPageNumber: event.target.checked })} />
          <span>{props.t("showPageNumber")}</span>
        </label>
        <label>{props.t("pageNumberAt")}
          <select value={props.setup.pageNumberPosition} disabled={!props.setup.showPageNumber} onChange={(event) => patch({ pageNumberPosition: event.target.value as PageNumberPosition })}>
            {POSITIONS.map((position) => <option key={position} value={position}>{props.t(positionKey(position))}</option>)}
          </select>
        </label>
        <label>{props.t("pageNumberStyle")}
          <select value={props.setup.pageNumberStyle} disabled={!props.setup.showPageNumber} onChange={(event) => patch({ pageNumberStyle: event.target.value as PageNumberStyle })}>
            <option value="pageOf">{props.t("pageOf")}</option>
            <option value="number">{props.t("pageNumberOnly")}</option>
          </select>
        </label>
        <p className="meta">{props.t("printPreview")} {pages.length}</p>
      </aside>
      <div className="print-stage">
        {pages.map((blocks, index) => {
          const bands = runningBands(props.setup, index + 1, pages.length, props.report.generatedAt);
          return (
            <div key={index} className="print-scale" style={{ width: box.width * scale, height: box.height * scale }}>
              <article className="print-page" style={{ width: box.width, height: box.height, padding: box.margin, transform: `scale(${scale})` }}>
                {bands.top && <RunningLine edge="top" slots={bands.top} />}
                <Sheet chunks={chunks(blocks)} />
                {bands.bottom && <RunningLine edge="bottom" slots={bands.bottom} />}
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlignSelect(props: { label: string; value: PageAlign; t: (key: string) => string; onChange: (value: PageAlign) => void }) {
  return (
    <label>{props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.target.value as PageAlign)}>
        <option value="left">{props.t("alignLeft")}</option>
        <option value="center">{props.t("alignCenter")}</option>
        <option value="right">{props.t("alignRight")}</option>
      </select>
    </label>
  );
}

function positionKey(position: PageNumberPosition): string {
  switch (position) {
    case "top-left": return "posTopLeft";
    case "top-center": return "posTopCenter";
    case "top-right": return "posTopRight";
    case "bottom-left": return "posBottomLeft";
    case "bottom-center": return "posBottomCenter";
    case "bottom-right": return "posBottomRight";
  }
}

function RunningLine(props: { edge: "top" | "bottom"; slots: RunningSlots }) {
  return (
    <div className={props.edge === "top" ? "run top" : "run bottom"}>
      <span>{props.slots.left}</span>
      <span>{props.slots.center}</span>
      <span>{props.slots.right}</span>
    </div>
  );
}

function Sheet({ chunks: parts }: { chunks: PrintChunk[] }) {
  return (
    <div className="print-sheet">
      {parts.map((part, index) => {
        if (part.type === "title") return <h1 key={index}>{part.text}</h1>;
        if (part.type === "meta") return <p key={index}>{part.text}</p>;
        if (part.type === "heading") return <h2 key={index}>{part.text}</h2>;
        if (part.type === "line") return <pre key={index}>{part.text}</pre>;
        if (part.type === "kv") {
          return (
            <table key={index} className="kv">
              <tbody><tr><th>{part.label}</th><td>{part.value}</td></tr></tbody>
            </table>
          );
        }
        return (
          <table key={index}>
            {part.headers.length > 0 && <thead><tr>{part.headers.map((cell, cellIndex) => <th key={cellIndex}>{cell}</th>)}</tr></thead>}
            <tbody>
              {part.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
