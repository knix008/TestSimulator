/**
 * Print preview and page setup, in one window.
 *
 * The preview is the real printed page: the same DOM, at the same millimetre size,
 * scaled down to fit. Changing the paper, the orientation or the margin re-paginates
 * it immediately, and Print hands the very pages on screen to the printer — nothing
 * is laid out twice, so the preview cannot disagree with the output.
 *
 * The range is All, the current document (the page the preview is showing), or a
 * custom list like `1-3, 7`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { geometry, paginate, parsePageRange, type PrintRow } from "../../core/print.js";
import type { PrintSettings } from "../../core/settings.js";
import { api } from "../api.js";
import type { DialogProps } from "../DialogHost.js";
import * as host from "../host.js";
import { Icon } from "../icons.js";
import { Button, Buttons, CheckField, Field, StepperField } from "./parts.js";

export type PrintPayload = {
  kind: "compare" | "merge" | "directory" | "git";
  title: string;
  leftHeading: string;
  rightHeading: string;
  /** Set for a comparison: the rows are fetched from the server by id. */
  compareId?: string;
  rowCount?: number;
  /** Set for everything else: the rows travel with the payload. */
  rows?: PrintRow[];
};

const FETCH_CHUNK = 2000;
const MAX_ROWS = 50_000;

export function PrintDialog({ payload, settings, t, close }: DialogProps) {
  const job = (payload ?? {}) as PrintPayload;
  const [print, setPrint] = useState<PrintSettings>(settings.print);
  const [rows, setRows] = useState<PrintRow[]>(job.rows ?? []);
  const [loading, setLoading] = useState(Boolean(job.compareId));
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"all" | "current" | "custom">("all");
  const [custom, setCustom] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  /* --------------------------------------------------- gather rows */

  useEffect(() => {
    if (!job.compareId) return;
    let cancelled = false;
    const total = Math.min(job.rowCount ?? 0, MAX_ROWS);
    const collected: PrintRow[] = [];
    (async () => {
      for (let start = 0; start < total; start += FETCH_CHUNK) {
        const data = await api.rows(job.compareId as string, start, FETCH_CHUNK, false);
        if (cancelled) return;
        if (data.mode === "text") {
          for (const row of data.rows) {
            collected.push({
              left: row.left,
              right: row.right,
              leftNo: row.leftNo,
              rightNo: row.rightNo,
              kind: row.kind,
            });
          }
        } else {
          for (const row of data.rows) {
            const hex = (bytes: (number | null)[]) =>
              bytes.map((byte) => (byte === null ? ".." : byte.toString(16).toUpperCase().padStart(2, "0"))).join(" ");
            collected.push({
              left: hex(row.left.bytes),
              right: hex(row.right.bytes),
              leftNo: row.offset,
              rightNo: row.offset,
              kind: row.kind,
            });
          }
        }
      }
      if (!cancelled) {
        setRows(collected);
        setLoading(false);
      }
    })().catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [job.compareId, job.rowCount]);

  /* ---------------------------------------------------- pagination */

  const page_ = useMemo(() => geometry(print, settings.font.size), [print, settings.font.size]);
  const pages = useMemo(() => paginate(rows, page_.linesPerPage), [rows, page_.linesPerPage]);

  useEffect(() => {
    if (page > pages.length) setPage(pages.length || 1);
  }, [page, pages.length]);

  const selected = useMemo(() => {
    if (mode === "current") return [page];
    if (mode === "custom") return parsePageRange(custom, pages.length);
    return pages.map((item) => item.number);
  }, [custom, mode, page, pages]);

  /* ------------------------------------ fit the sheet to the window */

  useEffect(() => {
    const frame = sheetRef.current?.parentElement;
    if (!frame) return;
    const fit = () => {
      const available = { width: frame.clientWidth - 24, height: frame.clientHeight - 24 };
      const mmToPx = 96 / 25.4;
      const next = Math.min(
        available.width / (page_.width * mmToPx),
        available.height / (page_.height * mmToPx),
      );
      setScale(Math.max(0.15, Math.min(1.4, next)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [page_.height, page_.width]);

  const update = async (patch: Partial<PrintSettings>) => {
    const next = { ...print, ...patch };
    setPrint(next);
    const saved = await api.updateSettings({ print: next }).catch(() => null);
    if (saved) host.publishSettings(saved);
  };

  const doPrint = async () => {
    // `@page` has to match the preview exactly, or the printer re-flows the content.
    const style = document.getElementById("print-page-rule") ?? document.createElement("style");
    style.id = "print-page-rule";
    style.textContent = `@page { size: ${page_.width}mm ${page_.height}mm; margin: 0; }`;
    document.head.appendChild(style);
    document.body.classList.add("printing");
    try {
      await host.printCurrentWindow({
        landscape: print.orientation === "landscape",
        printBackground: print.colorBackgrounds,
      });
    } finally {
      document.body.classList.remove("printing");
    }
  };

  const current = pages[page - 1];

  return (
    <div className="print-dialog">
      <div className="print-side">
        <Field label={t("print.range")}>
          <select
            className="select"
            data-field="range"
            value={mode}
            onChange={(event) => setMode(event.target.value as typeof mode)}
          >
            <option value="all">{t("print.range.all")}</option>
            <option value="current">{t("print.range.current")}</option>
            <option value="custom">{t("print.range.custom")}</option>
          </select>
        </Field>
        <Field label={t("print.range.custom")} hint={t("print.rangeHint")}>
          <input
            className="text-input"
            data-field="customRange"
            value={custom}
            placeholder={t("print.rangeHint")}
            disabled={mode !== "custom"}
            onChange={(event) => setCustom(event.target.value)}
          />
        </Field>

        <h3>{t("print.pageSetup")}</h3>
        <Field label={t("print.paper")}>
          <select
            className="select"
            data-field="paper"
            value={print.paper}
            onChange={(event) => void update({ paper: event.target.value as PrintSettings["paper"] })}
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
        </Field>
        <Field label={t("print.orientation")}>
          <select
            className="select"
            data-field="orientation"
            value={print.orientation}
            onChange={(event) =>
              void update({ orientation: event.target.value as PrintSettings["orientation"] })}
          >
            <option value="portrait">{t("print.portrait")}</option>
            <option value="landscape">{t("print.landscape")}</option>
          </select>
        </Field>
        <StepperField
          label={t("print.margin")} name="margin"
          min={0} max={50} suffix="mm"
          value={print.margin}
          onChange={(value) => void update({ margin: value })}
        />
        <CheckField label={t("print.lineNumbers")} name="lineNumbers" icon="hash"
          checked={print.lineNumbers} onChange={(value) => void update({ lineNumbers: value })} />
        <CheckField label={t("print.color")} name="colorBackgrounds" icon="theme"
          checked={print.colorBackgrounds} onChange={(value) => void update({ colorBackgrounds: value })} />
        <CheckField label={t("print.header")} name="headerFooter" icon="page"
          checked={print.headerFooter} onChange={(value) => void update({ headerFooter: value })} />

        <div className="print-pager">
          <button type="button" className="icon-button" data-action="prevPage" title={t("print.prevPage")}
            disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <Icon name="prev" size={16} />
          </button>
          <span data-testid="print-page">{t("print.pageOf", page, pages.length)}</span>
          <button type="button" className="icon-button" data-action="nextPage" title={t("print.nextPage")}
            disabled={page >= pages.length} onClick={() => setPage((value) => Math.min(pages.length, value + 1))}>
            <Icon name="next" size={16} />
          </button>
        </div>

        <Buttons>
          <Button icon="close" name="cancel" onClick={close}>{t("dlg.cancel")}</Button>
          <Button icon="print" name="print" primary disabled={loading || selected.length === 0}
            onClick={() => void doPrint()}>
            {t("print.print")}
          </Button>
        </Buttons>
      </div>

      <div className="print-preview-frame">
        {loading ? (
          <div className="print-loading">{t("progress.printing")}</div>
        ) : (
          /*
           * The sheet is scaled to fit, and a scaled element still occupies its
           * full unscaled size in the layout — so centring the sheet itself puts
           * the *unscaled* box in the middle and the visible page off to one side.
           * The wrapper is the size the page actually appears, and that is what
           * gets centred; the sheet scales from its top-left corner inside it.
           */
          <div
            className="print-sheet-fit"
            style={{
              width: `calc(${page_.width}mm * ${scale})`,
              height: `calc(${page_.height}mm * ${scale})`,
            }}
          >
          <div
            className="print-sheet"
            ref={sheetRef}
            style={{
              width: `${page_.width}mm`,
              height: `${page_.height}mm`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {current ? (
              <Sheet
                page={current.number}
                total={pages.length}
                rows={current.rows}
                job={job}
                print={print}
                margin={page_.margin}
              />
            ) : null}
          </div>
          </div>
        )}
      </div>

      {/* The actual print output: only the selected pages, at their true size. */}
      <div className="print-output" aria-hidden="true">
        {pages.filter((item) => selected.includes(item.number)).map((item) => (
          <div
            key={item.number}
            className="print-page"
            style={{ width: `${page_.width}mm`, height: `${page_.height}mm` }}
          >
            <Sheet
              page={item.number}
              total={pages.length}
              rows={item.rows}
              job={job}
              print={print}
              margin={page_.margin}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Sheet({
  page,
  total,
  rows,
  job,
  print,
  margin,
}: {
  page: number;
  total: number;
  rows: PrintRow[];
  job: PrintPayload;
  print: PrintSettings;
  margin: number;
}) {
  return (
    <div className={`sheet-body${print.colorBackgrounds ? " colored" : ""}`} style={{ padding: `${margin}mm` }}>
      {print.headerFooter ? (
        <div className="sheet-header">
          <span>{job.title}</span>
          <span>{job.leftHeading} ↔ {job.rightHeading}</span>
        </div>
      ) : null}

      <div className="sheet-rows">
        {rows.map((row, index) => (
          <div className={`sheet-row kind-${row.kind}`} key={index}>
            {print.lineNumbers ? <span className="sheet-no">{row.leftNo ?? ""}</span> : null}
            <span className="sheet-text">{row.left ?? ""}</span>
            {print.lineNumbers ? <span className="sheet-no">{row.rightNo ?? ""}</span> : null}
            <span className="sheet-text">{row.right ?? ""}</span>
          </div>
        ))}
      </div>

      {print.headerFooter ? (
        <div className="sheet-footer">
          <span>{new Date().toLocaleString()}</span>
          <span>{page} / {total}</span>
        </div>
      ) : null}
    </div>
  );
}
