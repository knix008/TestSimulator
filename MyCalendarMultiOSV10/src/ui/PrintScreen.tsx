import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { formatISODate, isSameDay, monthTitle, weekdayLabels } from "../domain/calendar";
import { eventsOn, type CalendarEvent } from "../domain/events";
import { holidayTitle, isDisplayedHoliday, loadYear } from "../domain/holidays";
import { formatMessage } from "../domain/i18n";
import { dayNote } from "../domain/lunar";
import type { Language, Messages } from "../domain/messages";
import {
  MARGIN_IDS,
  MARGINS,
  MAX_PRINT_MONTHS,
  ORIENTATIONS,
  PAPER_IDS,
  PAPERS,
  pageRule,
  pageSize,
  parsePrintRequest,
  PRINT_REQUEST_KEY,
  printMonths,
  printWeeks,
  readPrintOptions,
  writePrintOptions,
  type PrintOptions,
} from "../domain/print";
import type { Weekday } from "../domain/settings";
import { dragWindow, isTauri, resizeWindow } from "../platform/desktop";
import { PanelBackdrop } from "./BackgroundImage";
import { Dropdown } from "./Dropdown";
import { ChevronIcon, PageSetupIcon, PlusIcon, PrintIcon, ResizeGripIcon } from "./icons";
import { useEvents } from "./useEvents";
import type { ReadyContext } from "./useSettings";
import { WindowChrome } from "./WindowChrome";

const MM_TO_PX = 96 / 25.4;
const PT_TO_MM = 25.4 / 72;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

type HolidayNames = Record<string, string[]>;

function usePrintHolidays(country: string, years: number[], language: Language): HolidayNames {
  const key = years.join(",");
  const [names, setNames] = useState<HolidayNames>({});
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(
      key.split(",").map((year) => loadYear(country, Number(year), controller.signal, false).catch(() => null)),
    ).then((bundles) => {
      if (controller.signal.aborted) return;
      const next: HolidayNames = {};
      for (const bundle of bundles) {
        for (const holiday of bundle?.holidays ?? []) {
          if (isDisplayedHoliday(holiday)) (next[holiday.date] ??= []).push(holidayTitle(holiday, language));
        }
      }
      setNames(next);
    });
    return () => controller.abort();
  }, [country, key, language]);
  return names;
}

function takeRequestedMonth(): { year: number; month: number } | null {
  const request = parsePrintRequest(localStorage.getItem(PRINT_REQUEST_KEY));
  localStorage.removeItem(PRINT_REQUEST_KEY);
  return request;
}

function shortDate(date: Date, language: Language, weekdays: string[]): string {
  return language === "ko"
    ? `${date.getMonth() + 1}/${date.getDate()} (${weekdays[date.getDay()]})`
    : `${weekdays[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
}

interface PageProps {
  year: number;
  month: number;
  page: number;
  total: number;
  options: PrintOptions;
  weekStartsOn: Weekday;
  language: Language;
  t: Messages;
  holidays: HolidayNames;
  events: CalendarEvent[];
  printedAt: Date;
}

/** One month on one sheet; sizes are in physical units so the preview and the paper agree. */
function PrintPage({ year, month, page, total, options, weekStartsOn, language, t, holidays, events, printedAt }: PageProps) {
  const size = pageSize(options);
  const margin = MARGINS[options.margin];
  const unit = Math.min(size.width, size.height) / 210;
  const weeks = printWeeks(year, month, weekStartsOn);
  const labels = weekdayLabels(t.weekdaysShort, weekStartsOn);
  const today = new Date();
  const monthDays = new Date(year, month + 1, 0).getDate();
  const listRows = options.eventList
    ? Array.from({ length: monthDays }, (_, index) => new Date(year, month, index + 1)).flatMap((date) =>
        eventsOn(events, date).map((event) => ({ date, event })),
      )
    : [];
  // Lines a day cell can hold, so long days end with "+N more" instead of being cut mid-line.
  const lineMm = 7.6 * unit * PT_TO_MM * 1.3;
  const contentHeight = size.height - margin * 2;
  const gridHeight = contentHeight * (options.eventList ? 0.6 : 0.84);
  const cellLines = Math.max(1, Math.floor(gridHeight / weeks.length / lineMm) - 1);

  return (
    <article
      className={options.grayscale ? "print-page grayscale" : "print-page"}
      style={
        {
          width: `${size.width}mm`,
          height: `${size.height}mm`,
          padding: `${margin}mm`,
          "--u": String(unit),
        } as CSSProperties
      }
    >
      <header className="print-head">
        <h2>{monthTitle(year, month, language, t.months)}</h2>
        <span>MyCalendar</span>
      </header>
      <div className="print-weekdays">
        {labels.map((label, index) => {
          const dow = (index + weekStartsOn) % 7;
          return (
            <span key={`${label}-${index}`} className={dow === 0 ? "sunday" : dow === 6 ? "saturday" : undefined}>
              {label}
            </span>
          );
        })}
      </div>
      <div className="print-grid" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.flat().map((date) => {
          const iso = formatISODate(date);
          const names = options.holidayNames ? (holidays[iso] ?? []) : [];
          const isHoliday = (holidays[iso] ?? []).length > 0;
          const dayEvents = options.cellEvents ? eventsOn(events, date) : [];
          const note = options.lunar ? dayNote(date, t) : null;
          const room = Math.max(0, cellLines - names.length);
          const shown = dayEvents.length > room ? dayEvents.slice(0, Math.max(0, room - 1)) : dayEvents;
          const hidden = dayEvents.length - shown.length;
          const className = [
            "print-day",
            date.getMonth() !== month ? "out" : "",
            date.getDay() === 0 || isHoliday ? "sunday" : date.getDay() === 6 ? "saturday" : "",
            isSameDay(date, today) ? "today" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={iso} className={className}>
              <div className="print-day-head">
                <b>{date.getDate()}</b>
                {note?.cell && <small className={note.term ? "term" : undefined}>{note.cell}</small>}
              </div>
              {names.map((name) => (
                <p key={name} className="print-holiday">
                  {name}
                </p>
              ))}
              {shown.map((event) => (
                <p key={event.id} className="print-event">
                  <i style={{ background: event.color }} />
                  {event.time && <time>{event.time}</time>}
                  {event.title}
                </p>
              ))}
              {hidden > 0 && <p className="print-more">{formatMessage(t.printMore, { n: hidden })}</p>}
            </div>
          );
        })}
      </div>
      {options.eventList && (
        <section className="print-list">
          <h3>{t.printMonthEvents}</h3>
          {listRows.length === 0 ? (
            <p className="print-empty">{t.noEvents}</p>
          ) : (
            <ul>
              {listRows.map(({ date, event }) => (
                <li key={`${formatISODate(date)}-${event.id}`}>
                  <i style={{ background: event.color }} />
                  <span className="print-list-date">{shortDate(date, language, t.weekdaysShort)}</span>
                  <span className="print-list-time">{event.time || t.allDay}</span>
                  <span className="print-list-title">{event.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <footer className="print-foot">
        <span>{formatMessage(t.printPrinted, { date: printedAt.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US") })}</span>
        <span>{formatMessage(t.printPageOf, { page, total })}</span>
      </footer>
    </article>
  );
}

export function PrintScreen({
  ctx,
  onClose,
  onHeaderMouseDown,
}: {
  ctx: ReadyContext;
  onClose: () => void;
  onHeaderMouseDown?: (event: MouseEvent) => void;
}) {
  const { settings, t } = ctx;
  const language = settings.language;
  const [options, setOptions] = useState<PrintOptions>(readPrintOptions);
  const [start, setStart] = useState(() => {
    const now = new Date();
    return takeRequestedMonth() ?? { year: now.getFullYear(), month: now.getMonth() };
  });
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(0.5);
  const previewRef = useRef<HTMLDivElement>(null);
  const store = useEvents();
  const printedAt = useMemo(() => new Date(), []);
  const months = useMemo(() => printMonths(start.year, start.month, options.months), [start, options.months]);
  const years = useMemo(() => {
    const all = new Set<number>();
    for (const { year, month } of months) {
      all.add(year);
      if (month === 0) all.add(year - 1);
      if (month === 11) all.add(year + 1);
    }
    return [...all].sort();
  }, [months]);
  const holidays = usePrintHolidays(settings.countryCode, years, language);
  const size = pageSize(options);

  const change = (patch: Partial<PrintOptions>) => {
    setOptions((current) => {
      const next = { ...current, ...patch };
      writePrintOptions(next);
      return next;
    });
  };

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PRINT_REQUEST_KEY || !event.newValue) return;
      const request = takeRequestedMonth();
      if (request) setStart(request);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.print = "page";
    style.textContent = pageRule(options);
    document.head.append(style);
    return () => style.remove();
  }, [options]);

  // The preview fits a page to the width of its area; the zoom buttons scale from there.
  useLayoutEffect(() => {
    const area = previewRef.current;
    if (!area) return;
    const measure = () => {
      const width = area.clientWidth - 32;
      if (width > 0) setFit(width / (size.width * MM_TO_PX));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [size.width]);

  const print = useCallback(() => window.print(), []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "p" || event.key === "P")) {
        event.preventDefault();
        print();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [print]);

  const onMouseDown = (event: MouseEvent) => {
    if (isTauri()) {
      void dragWindow(event);
      return;
    }
    onHeaderMouseDown?.(event);
  };

  const pages = months.map(({ year, month }, index) => (
    <PrintPage
      key={`${year}-${month}`}
      year={year}
      month={month}
      page={index + 1}
      total={months.length}
      options={options}
      weekStartsOn={settings.weekStartsOn}
      language={language}
      t={t}
      holidays={holidays}
      events={store.events}
      printedAt={printedAt}
    />
  ));
  const shift = (delta: number) => {
    const date = new Date(start.year, start.month + delta, 1);
    setStart({ year: date.getFullYear(), month: date.getMonth() });
  };
  const scale = fit * zoom;

  return (
    <section className="panel screen print-screen">
      <PanelBackdrop settings={ctx.settings} target="print" />
      <WindowChrome icon={<PrintIcon />} title={t.printTitle} closeLabel={t.close} onClose={onClose} onMouseDown={onMouseDown} />
      <div className="print-body">
        <aside className="print-options" aria-label={t.printSetup}>
          <h2 className="field with-icon">
            <PageSetupIcon />
            {t.printSetup}
          </h2>
          <div className="print-row">
            <span className="font-label">{t.printStart}</span>
            <div className="print-month">
              <button type="button" className="icon-btn" aria-label={t.prevMonth} onClick={() => shift(-1)}>
                <ChevronIcon direction="left" />
              </button>
              <strong>{monthTitle(start.year, start.month, language, t.months)}</strong>
              <button type="button" className="icon-btn" aria-label={t.nextMonth} onClick={() => shift(1)}>
                <ChevronIcon direction="right" />
              </button>
            </div>
          </div>
          <div className="print-row">
            <span className="font-label">{t.printMonths}</span>
            <Dropdown
              value={String(options.months)}
              ariaLabel={t.printMonths}
              options={Array.from({ length: MAX_PRINT_MONTHS }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))}
              onChange={(value) => change({ months: Number(value) })}
            />
          </div>
          <div className="print-row">
            <span className="font-label">{t.printPaper}</span>
            <Dropdown
              value={options.paper}
              ariaLabel={t.printPaper}
              options={PAPER_IDS.map((paper) => ({
                value: paper,
                label: `${PAPERS[paper].label} (${PAPERS[paper].width} × ${PAPERS[paper].height} mm)`,
              }))}
              onChange={(paper) => change({ paper: paper as PrintOptions["paper"] })}
            />
          </div>
          <div className="print-row">
            <span className="font-label" id="print-orientation-label">
              {t.printOrientation}
            </span>
            <div className="segment" role="group" aria-labelledby="print-orientation-label">
              {ORIENTATIONS.map((orientation) => (
                <button
                  key={orientation}
                  type="button"
                  aria-pressed={options.orientation === orientation}
                  onClick={() => change({ orientation })}
                >
                  <span className={`paper-glyph ${orientation}`} aria-hidden="true" />
                  {t.printOrientations[orientation]}
                </button>
              ))}
            </div>
          </div>
          <div className="print-row">
            <span className="font-label" id="print-margin-label">
              {t.printMargin}
            </span>
            <div className="segment" role="group" aria-labelledby="print-margin-label">
              {MARGIN_IDS.map((margin) => (
                <button
                  key={margin}
                  type="button"
                  aria-pressed={options.margin === margin}
                  title={`${MARGINS[margin]} mm`}
                  onClick={() => change({ margin })}
                >
                  {t.printMargins[margin]}
                </button>
              ))}
            </div>
          </div>
          <p className="field">{t.printContent}</p>
          {(
            [
              ["cellEvents", t.printCellEvents],
              ["eventList", t.printEventList],
              ["holidayNames", t.printHolidayNames],
              ["lunar", t.printLunar],
              ["grayscale", t.printGrayscale],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="check">
              <input type="checkbox" checked={options[key]} onChange={(event) => change({ [key]: event.target.checked } as Partial<PrintOptions>)} />
              <span>{label}</span>
            </label>
          ))}
          <div className="print-actions">
            <span className="hint">{formatMessage(t.printPages, { n: months.length })}</span>
            <button type="button" className="text-btn primary print-btn" onClick={print}>
              <PrintIcon />
              {t.print}
            </button>
          </div>
          <p className="hint">{t.printHint}</p>
        </aside>
        <div className="print-preview-wrap">
          <div className="print-zoom" role="group" aria-label={t.printTitle}>
            <button
              type="button"
              className="icon-btn"
              aria-label={t.zoomOut}
              title={t.zoomOut}
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Math.round((value - 0.25) * 100) / 100))}
            >
              <span className="minus-glyph" aria-hidden="true" />
            </button>
            <button type="button" className="text-btn" onClick={() => setZoom(1)}>
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t.zoomIn}
              title={t.zoomIn}
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Math.round((value + 0.25) * 100) / 100))}
            >
              <PlusIcon />
            </button>
          </div>
          <div ref={previewRef} className="print-preview" aria-label={t.printTitle}>
            <div className="print-sheets" style={{ zoom: scale } as CSSProperties}>
              {pages}
            </div>
          </div>
        </div>
      </div>
      {isTauri() && (
        <button
          type="button"
          className="resize-grip"
          aria-label={t.resizeWindow}
          title={t.resizeWindow}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void resizeWindow("SouthEast");
          }}
        >
          <ResizeGripIcon />
        </button>
      )}
      {createPortal(<div className="print-root">{pages}</div>, document.body)}
    </section>
  );
}
