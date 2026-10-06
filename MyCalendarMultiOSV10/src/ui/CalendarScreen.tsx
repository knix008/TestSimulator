import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  addMonths,
  buildMonthGrid,
  formatISODate,
  isSameDay,
  monthTitle,
  parseISODate,
  shiftDays,
  weekdayLabels,
} from "../domain/calendar";
import { holidayTitle, isDisplayedHoliday, loadYear, requestHolidayRefresh, type Holiday } from "../domain/holidays";
import { countryName } from "../domain/countries";
import { formatMessage } from "../domain/i18n";
import type { Language } from "../domain/messages";
import { dragWindow, hideMain, isTauri, resizeWindow } from "../platform/desktop";
import { ChevronIcon, GearIcon, HideIcon, InfoIcon, RefreshIcon } from "./icons";
import type { ReadyContext } from "./useSettings";
import { useCountries } from "./useCountries";

type SyncState = "checking" | "live" | "cached" | "error";

interface SyncStatus {
  state: SyncState;
  fetchedAt?: number;
}

function formatWhen(timestamp: number, language: Language): string {
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatFull(date: Date, language: Language, months: string[], weekdays: string[]): string {
  if (language === "ko") {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}`;
  }
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function useHolidayMap(country: string, years: number[]) {
  const yearKey = years.join(",");
  const [map, setMap] = useState<Record<string, Holiday[]>>({});
  const [status, setStatus] = useState<SyncStatus>({ state: "checking" });
  const [forceToken, setForceToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void (async () => {
      setStatus((current) => (current.state === "live" || current.state === "cached" ? current : { state: "checking" }));
      const force = forceToken > 0;
      const results = await Promise.all(
        years.map(async (year) => {
          try {
            return await loadYear(country, year, controller.signal, force);
          } catch (error) {
            if (controller.signal.aborted) throw error;
            return null;
          }
        }),
      ).catch(() => null);
      if (!alive || controller.signal.aborted || results === null) return;
      const next: Record<string, Holiday[]> = {};
      let fetchedAt = 0;
      let fromCache = false;
      let failed = false;
      for (const bundle of results) {
        if (!bundle) {
          failed = true;
          continue;
        }
        fromCache = fromCache || bundle.fromCache;
        fetchedAt = Math.max(fetchedAt, bundle.fetchedAt);
        for (const holiday of bundle.holidays) {
          if (!isDisplayedHoliday(holiday)) continue;
          (next[holiday.date] ??= []).push(holiday);
        }
      }
      if (Object.keys(next).length === 0 && failed) {
        setMap({});
        setStatus({ state: "error" });
        return;
      }
      setMap(next);
      setStatus({ state: failed || fromCache ? "cached" : "live", fetchedAt });
    })();
    return () => {
      alive = false;
      controller.abort();
    };
    }, [country, yearKey, forceToken, years]);

  useEffect(() => {
    const refresh = () => setForceToken((value) => value + 1);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "mycalendar.holiday-refresh") refresh();
    };
    window.addEventListener("mycalendar-refresh-holidays", refresh);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(refresh, 30 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("mycalendar-refresh-holidays", refresh);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { map, status };
}

export function CalendarScreen({
  ctx,
  onOpenSettings,
  onOpenAbout,
}: {
  ctx: ReadyContext;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}) {
  const { settings, update, t } = ctx;
  const [selected, setSelected] = useState(() => new Date());
  const desktop = isTauri();
  const viewYear = selected.getFullYear();
  const viewMonth = selected.getMonth();
  const cells = useMemo(
    () => buildMonthGrid(viewYear, viewMonth, settings.weekStartsOn),
    [viewYear, viewMonth, settings.weekStartsOn],
  );
  const years = useMemo(() => [...new Set(cells.map((date) => date.getFullYear()))], [cells]);
  const { map, status } = useHolidayMap(settings.countryCode, years);
  const { countries } = useCountries();
  const labels = weekdayLabels(t.weekdaysShort, settings.weekStartsOn);
  const transparency = Math.round((1 - settings.opacity) * 100);
  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthHolidays = Object.entries(map)
    .filter(([date]) => date.startsWith(monthKey))
    .sort(([a], [b]) => a.localeCompare(b));
  const selectedKey = formatISODate(selected);
  const selectedNames = (map[selectedKey] ?? []).map((holiday) => holidayTitle(holiday, settings.language));
  const country = countries.find((item) => item.code === settings.countryCode);
  const countryLabel = country ? countryName(country, settings.language) : settings.countryCode;
  const today = new Date();

  const selectDate = (date: Date) => setSelected(date);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea")) return;
    if ((event.ctrlKey || event.metaKey) && event.key === ",") {
      event.preventDefault();
      onOpenSettings();
      return;
    }
    const move: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in move) {
      event.preventDefault();
      selectDate(shiftDays(selected, move[event.key]));
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      selectDate(addMonths(selected, -1));
    } else if (event.key === "PageDown") {
      event.preventDefault();
      selectDate(addMonths(selected, 1));
    } else if (event.key === "t" || event.key === "T") {
      selectDate(new Date());
    }
  };

  const statusText =
    status.state === "checking"
      ? t.checking
      : status.state === "error"
        ? t.holidayError
        : status.state === "cached"
          ? t.holidayCached
          : t.holidayLive;

  return (
    <section className="panel calendar" tabIndex={0} onKeyDown={onKeyDown}>
      <header className="toolbar" onMouseDown={(event) => void dragWindow(event)}>
        <div className="toolbar-row">
          <button type="button" className="icon-btn" aria-label={t.prevMonth} onClick={() => selectDate(addMonths(selected, -1))}>
            <ChevronIcon direction="left" />
          </button>
          <h1>{monthTitle(viewYear, viewMonth, settings.language, t.months)}</h1>
          <button type="button" className="icon-btn" aria-label={t.nextMonth} onClick={() => selectDate(addMonths(selected, 1))}>
            <ChevronIcon direction="right" />
          </button>
          <button type="button" className="text-btn today-btn" onClick={() => selectDate(new Date())}>
            {t.today}
          </button>
          <span className="grow" />
          <button type="button" className="icon-btn" aria-label={t.settings} onClick={onOpenSettings}>
            <GearIcon />
          </button>
          <button type="button" className="icon-btn" aria-label={t.about} onClick={onOpenAbout}>
            <InfoIcon />
          </button>
          {desktop && (
            <button type="button" className="icon-btn" aria-label={t.hide} onClick={() => void hideMain()}>
              <HideIcon />
            </button>
          )}
        </div>
        <label className="opacity" title={t.transparencyHint}>
          <span>{t.transparency}</span>
          <input
            type="range"
            min={0}
            max={85}
            aria-label={t.transparency}
            value={transparency}
            onChange={(event) => update({ opacity: 1 - Number(event.target.value) / 100 })}
          />
          <strong>{transparency}%</strong>
        </label>
      </header>
      <div className="weekdays" aria-hidden="true">
        {labels.map((label, index) => {
          const dow = (index + settings.weekStartsOn) % 7;
          const tone = dow === 0 ? "sunday" : dow === 6 ? "saturday" : "";
          return (
            <span key={`${label}-${index}`} className={tone}>
              {label}
            </span>
          );
        })}
      </div>
      <div className="days" role="grid" aria-label={monthTitle(viewYear, viewMonth, settings.language, t.months)}>
        {cells.map((date) => {
          const iso = formatISODate(date);
          const names = (map[iso] ?? []).map((holiday) => holidayTitle(holiday, settings.language));
          const outside = date.getMonth() !== viewMonth;
          const className = [
            "day",
            outside ? "out" : "",
            date.getDay() === 0 ? "sunday" : "",
            date.getDay() === 6 ? "saturday" : "",
            names.length ? "holiday" : "",
            isSameDay(date, today) ? "today" : "",
            isSameDay(date, selected) ? "selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              className={className}
              aria-pressed={isSameDay(date, selected)}
              aria-current={isSameDay(date, today) ? "date" : undefined}
              aria-label={`${formatFull(date, settings.language, t.months, t.weekdays)}${names.length ? `, ${names.join(", ")}` : ""}`}
              onClick={() => selectDate(date)}
            >
              <span className="num">{date.getDate()}</span>
              {names.length > 0 && <span className="mark" />}
            </button>
          );
        })}
      </div>
      <footer className="footer">
        <div className="status-row">
          <span className={`dot ${status.state}`} />
          <span>{countryLabel}</span>
          <span aria-live="polite">{statusText}</span>
          {status.fetchedAt ? <span>{formatMessage(t.checkedAt, { time: formatWhen(status.fetchedAt, settings.language) })}</span> : null}
          <button type="button" className="icon-btn" aria-label={t.refreshHolidays} onClick={() => requestHolidayRefresh()}>
            <RefreshIcon />
          </button>
        </div>
        <p className="selected-date">{formatFull(selected, settings.language, t.months, t.weekdays)}</p>
        <p className={selectedNames.length ? "selected-holiday" : "hint"}>{selectedNames.join(", ") || t.noHoliday}</p>
        <p className="field">{t.monthHolidays}</p>
        {monthHolidays.length === 0 ? (
          <p className="hint">{status.state === "checking" ? t.checking : t.noHoliday}</p>
        ) : (
          <ul className="holiday-list">
            {monthHolidays.map(([date, holidays]) => (
              <li key={date}>
                <button
                  type="button"
                  aria-current={date === selectedKey ? "date" : undefined}
                  onClick={() => selectDate(parseISODate(date))}
                >
                  <span>{parseISODate(date).getDate()}</span>
                  <span>{holidays.map((holiday) => holidayTitle(holiday, settings.language)).join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </footer>
      {desktop && (
        <>
          <div className="resize e" onMouseDown={() => void resizeWindow("East")} />
          <div className="resize s" onMouseDown={() => void resizeWindow("South")} />
          <div className="resize se" onMouseDown={() => void resizeWindow("SouthEast")} />
        </>
      )}
    </section>
  );
}
