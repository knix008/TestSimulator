import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  addMonths,
  buildMonthWeeks,
  formatISODate,
  isSameDay,
  monthTitle,
  parseISODate,
  shiftDays,
  weekdayLabels,
} from "../domain/calendar";
import { clampEventsHeight, dateFontFor, MIN_EVENTS_HEIGHT, writeFullscreen, type Settings } from "../domain/settings";
import { holidayTitle, isDisplayedHoliday, loadYear, requestHolidayRefresh, type Holiday } from "../domain/holidays";
import { dayNote } from "../domain/lunar";
import { countryName } from "../domain/countries";
import { formatMessage } from "../domain/i18n";
import type { Language } from "../domain/messages";
import {
  hideMain,
  isTauri,
  minimizeMain,
  onMaximizedChange,
  resizeWindow,
  minWindowWidth,
  setWindowMinSize,
  setWindowSize,
  toggleMaximizeMain,
} from "../platform/desktop";
import { blankEvent, eventsOn, type CalendarEvent } from "../domain/events";
import { EventEditor, reminderLabel, repeatLabel } from "./EventEditor";
import {
  BellIcon,
  ChevronIcon,
  CollapseIcon,
  CloseIcon,
  GearIcon,
  HideIcon,
  ListIcon,
  MaximizeIcon,
  MinimizeIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  PrintIcon,
  RefreshIcon,
  RepeatIcon,
  ResizeGripIcon,
  RestoreIcon,
  TodayIcon,
  TrashIcon,
} from "./icons";
import { dateFontStyle } from "./dateFont";
import { DayMenu, type DayMenuItem } from "./DayMenu";
import type { SettingsTab } from "./settingsTab";
import { useEvents } from "./useEvents";
import { usePanelDrag } from "./usePanelDrag";
import { usePanelResize } from "./usePanelResize";
import type { ReadyContext } from "./useSettings";
import { useCountries } from "./useCountries";

type SyncState = "checking" | "live" | "cached" | "builtin" | "error";

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
      setStatus((current) => (current.state === "checking" || current.state === "error" ? { state: "checking" } : current));
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
      let builtin = false;
      for (const bundle of results) {
        if (!bundle) {
          failed = true;
          continue;
        }
        fromCache = fromCache || bundle.fromCache;
        builtin = builtin || Boolean(bundle.builtin);
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
      setStatus({ state: builtin ? "builtin" : failed || fromCache ? "cached" : "live", fetchedAt });
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

/** A saved size that fills the whole screen is a full screen caught on its way out, so it is not restored. */
function normalWindowSize(size: Settings["windowSize"]): Settings["windowSize"] {
  if (!size || (size.width >= window.screen.availWidth && size.height >= window.screen.availHeight)) return null;
  return size;
}

/** Height of everything around the grid and the events list, and the grid's height with square cells. */
function measureLayout(panel: HTMLElement): { chrome: number; squareDays: number } | null {
  const days = panel.querySelector(".days")?.getBoundingClientRect();
  if (!days) return null;
  const height = (element: Element | null | undefined) => element?.getBoundingClientRect().height ?? 0;
  // The footer can be squeezed below its content, so it is added up from its rows rather than measured.
  const footer = panel.querySelector<HTMLElement>(":scope > .footer");
  let footerRows = 0;
  if (footer) {
    const style = getComputedStyle(footer);
    const rows = [...footer.children].filter((child) => child.id !== "calendar-events");
    footerRows =
      rows.reduce((sum, row) => sum + height(row), 0) +
      Math.max(0, rows.length - 1) * (parseFloat(style.rowGap) || 0) +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth);
    if (rows.length < footer.children.length) footerRows += parseFloat(style.rowGap) || 0;
  }
  const border = panel.offsetHeight - panel.clientHeight;
  const chrome = height(panel.querySelector(":scope > .toolbar")) + height(panel.querySelector(":scope > .weekdays")) + footerRows + border;
  return { chrome, squareDays: (days.width * 5) / 7 };
}

export function CalendarScreen({
  ctx,
  onOpenSettings,
  onOpenEvents,
  onOpenPrint = () => {},
}: {
  ctx: ReadyContext;
  onOpenSettings: (tab?: SettingsTab) => void;
  onOpenEvents: () => void;
  onOpenPrint?: (year: number, month: number) => void;
}) {
  const { settings, update, t } = ctx;
  const drag = usePanelDrag();
  const store = useEvents();
  const [editing, setEditing] = useState<{ event: CalendarEvent; occurrence?: string } | null>(null);
  /** A day's menu when `date` is set, otherwise the calendar's own menu from the title bar or the panel. */
  const [menu, setMenu] = useState<{ x: number; y: number; date?: Date } | null>(null);
  const closeMenu = useCallback(() => {
    setMenu(null);
    panelRef.current?.focus({ preventScroll: true });
  }, []);
  const minWidth = minWindowWidth(settings.language);
  const resize = usePanelResize(
    drag.offset,
    settings.eventsHeight,
    (eventsHeight) => update({ eventsHeight }),
    drag.setOffset,
    minWidth,
  );
  const collapsed = settings.eventsCollapsed;
  const panelRef = useRef<HTMLElement>(null);
  const [maximized, setMaximized] = useState(false);
  // Collapsing or expanding the events keeps the calendar exactly as tall as it was until the user resizes the window.
  const [daysPin, setDaysPin] = useState<number | null>(null);
  const fitting = useRef(false);
  const minHeightRef = useRef(0);
  // Kept until it has been applied: a repeated first effect (React's strict mode) must restore it too.
  const restoring = useRef(normalWindowSize(settings.windowSize));
  const maximizedRef = useRef(false);
  const leavingMaximized = useRef(false);
  maximizedRef.current = maximized;

  useEffect(() => {
    let alive = true;
    let unlisten = () => {};
    void onMaximizedChange((value) => {
      if (alive) setMaximized(value);
    })
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      unlisten();
    };
  }, []);

  useEffect(() => {
    if (isTauri()) writeFullscreen(maximized);
    // A window button kept focus would get the keyboard focus ring from the next key, such as the Escape that
    // leaves full screen, so focus goes back to the calendar, which takes the shortcuts.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".window-controls")) panelRef.current?.focus({ preventScroll: true });
  }, [maximized]);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea, .sheet-back, .day-menu")) return;
      event.preventDefault();
      void toggleMaximizeMain().then(setMaximized);
    };
    // Capture phase, so this runs before the app-wide Escape that hides the calendar to the tray.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [maximized]);

  // The desktop window belongs to the user while they resize it; it is only fitted to the content when the
  // content changes shape (first show, collapsing or expanding the events, leaving maximized).
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !isTauri()) return;
    if (maximized) {
      leavingMaximized.current = true;
      return;
    }
    // Right after leaving full screen the window still has the screen's size, so the size from before is restored.
    const leaving = leavingMaximized.current;
    leavingMaximized.current = false;
    if (leaving) restoring.current = normalWindowSize(settings.windowSize);
    const layout = measureLayout(panel);
    if (!layout) return;
    let width = leaving ? minWidth : window.innerWidth;
    const squareDays = (layout.squareDays * width) / window.innerWidth;
    const minHeight = layout.chrome + squareDays + (collapsed ? 0 : MIN_EVENTS_HEIGHT);
    let height = layout.chrome + (daysPin ?? squareDays) + (collapsed ? 0 : settings.eventsHeight);
    const saved = restoring.current;
    if (saved) {
      // The minimum for another width is only known after the grid reflows; the resize follower corrects it.
      width = Math.min(Math.max(saved.width, minWidth), window.screen.availWidth);
      height = saved.height;
    } else if (width < minWidth) {
      width = minWidth;
    }
    fitting.current = true;
    minHeightRef.current = Math.min(minHeight, window.screen.availHeight);
    void setWindowMinSize(minWidth, minHeightRef.current)
      .then(() => setWindowSize(width, Math.min(height, window.screen.availHeight)))
      .then(() => {
        if (saved) restoring.current = null;
      })
      .catch(() => undefined)
      .finally(() => window.setTimeout(() => (fitting.current = false), 250));
    // Later eventsHeight changes come from the user's own resizing, which the window already reflects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, maximized]);

  // Changing only the height must leave the calendar alone, so the window never gets shorter than the square
  // grid at its current width plus the add-event row and one event; a wider window raises that minimum.
  useEffect(() => {
    if (!isTauri() || maximized) return;
    let frame = 0;
    let settle = 0;
    const follow = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      frame = window.requestAnimationFrame(() => {
        const layout = panelRef.current && measureLayout(panelRef.current);
        if (!layout) return;
        const minHeight = Math.min(
          layout.chrome + layout.squareDays + (collapsed ? 0 : MIN_EVENTS_HEIGHT),
          window.screen.availHeight,
        );
        if (Math.abs(minHeight - minHeightRef.current) < 1) return;
        minHeightRef.current = minHeight;
        void setWindowMinSize(minWidth, minHeight).catch(() => undefined);
      });
      // Widening at the minimum height grows the window once the drag pauses; during it the OS overrides the size.
      settle = window.setTimeout(() => {
        if (window.innerHeight < minHeightRef.current - 0.5) {
          void setWindowSize(window.innerWidth, minHeightRef.current).catch(() => undefined);
        }
      }, 200);
    };
    window.addEventListener("resize", follow);
    // A language switch changes the toolbar width; a window narrower than the new minimum is widened.
    if (minHeightRef.current > 0) {
      void setWindowMinSize(minWidth, minHeightRef.current)
        .then(() => (window.innerWidth < minWidth - 0.5 ? setWindowSize(minWidth, window.innerHeight) : undefined))
        .catch(() => undefined);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener("resize", follow);
    };
  }, [collapsed, maximized, minWidth]);

  useEffect(() => {
    if (daysPin === null) return;
    if (maximized) {
      setDaysPin(null);
      return;
    }
    const release = () => {
      if (!fitting.current) setDaysPin(null);
    };
    window.addEventListener("resize", release);
    return () => window.removeEventListener("resize", release);
  }, [daysPin, maximized]);

  const toggleEvents = () => {
    const days = panelRef.current?.querySelector(".days")?.getBoundingClientRect().height;
    if (isTauri() && !maximized && days) setDaysPin(days);
    update({ eventsCollapsed: !collapsed });
  };

  useEffect(() => {
    if (!isTauri() || collapsed || maximized) return;
    let timer = 0;
    const remember = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const height = panelRef.current?.querySelector("#calendar-events")?.getBoundingClientRect().height;
        if (height && Math.abs(height - settings.eventsHeight) > 1) update({ eventsHeight: clampEventsHeight(height) });
      }, 400);
    };
    window.addEventListener("resize", remember);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", remember);
    };
  }, [collapsed, maximized, settings.eventsHeight, update]);

  // Every settled size is kept, so quitting from the tray or the OS still finds the last one. Read through refs:
  // the events height saved by the same resize re-renders first, and must not cancel this save.
  const savedSizeRef = useRef(settings.windowSize);
  savedSizeRef.current = settings.windowSize;
  const updateRef = useRef(update);
  updateRef.current = update;
  useEffect(() => {
    if (!isTauri()) return;
    let timer = 0;
    const remember = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (maximizedRef.current || document.visibilityState === "hidden") return;
        const width = Math.round(window.innerWidth);
        const height = Math.round(window.innerHeight);
        const saved = savedSizeRef.current;
        if (saved && saved.width === width && saved.height === height) return;
        updateRef.current({ windowSize: { width, height } });
      }, 500);
    };
    window.addEventListener("resize", remember);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", remember);
    };
  }, []);
  const [selected, setSelected] = useState(() => new Date());
  const [view, setView] = useState(() => ({ year: selected.getFullYear(), month: selected.getMonth() }));
  const desktop = isTauri();
  const viewYear = view.year;
  const viewMonth = view.month;
  const cells = useMemo(
    () => buildMonthWeeks(viewYear, viewMonth, settings.weekStartsOn),
    [viewYear, viewMonth, settings.weekStartsOn],
  );
  const years = useMemo(() => [...new Set(cells.flat().map((date) => date.getFullYear()))], [cells]);
  const { map, status } = useHolidayMap(settings.countryCode, years);
  const { countries } = useCountries();
  const labels = weekdayLabels(t.weekdaysShort, settings.weekStartsOn);
  const eventsByDay = useMemo(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const date of cells.flat()) {
      const found = eventsOn(store.events, date);
      if (found.length) byDay.set(formatISODate(date), found);
    }
    return byDay;
  }, [cells, store.events]);
  const monthAgenda = useMemo(() => {
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const rows: Array<{ iso: string; day: number; holidays: string[]; events: CalendarEvent[] }> = [];
    for (let day = 1; day <= days; day += 1) {
      const iso = formatISODate(new Date(viewYear, viewMonth, day));
      const holidays = (map[iso] ?? []).map((holiday) => holidayTitle(holiday, settings.language));
      const events = eventsByDay.get(iso) ?? [];
      if (holidays.length || events.length) rows.push({ iso, day, holidays, events });
    }
    return rows;
  }, [viewYear, viewMonth, map, eventsByDay, settings.language]);
  const selectedKey = formatISODate(selected);
  // The event of the selected day waiting for its delete to be confirmed; another day starts with none.
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; day: string } | null>(null);
  const confirmingId = confirmingDelete?.day === selectedKey ? confirmingDelete.id : null;
  const deleteFromList = (event: CalendarEvent, onlyThisDay: boolean) => {
    if (onlyThisDay) store.skip(event.id, selectedKey);
    else store.remove(event.id);
    setConfirmingDelete(null);
    panelRef.current?.focus({ preventScroll: true });
  };
  const selectedNames = (map[selectedKey] ?? []).map((holiday) => holidayTitle(holiday, settings.language));
  const selectedEvents = eventsByDay.get(selectedKey) ?? eventsOn(store.events, selected);
  const selectedNote = settings.showLunar ? dayNote(selected, t) : null;
  const country = countries.find((item) => item.code === settings.countryCode);
  const countryLabel = country ? countryName(country, settings.language) : settings.countryCode;
  const today = new Date();

  const selectDate = (date: Date) => {
    setSelected(date);
    setView({ year: date.getFullYear(), month: date.getMonth() });
  };
  const shiftMonth = (delta: number) => {
    const inView = selected.getFullYear() === viewYear && selected.getMonth() === viewMonth;
    selectDate(addMonths(inView ? selected : new Date(viewYear, viewMonth, 1), delta));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, .sheet-back")) return;
    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      setEditing({ event: blankEvent(selected, settings.defaultReminder) });
      return;
    }
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
      shiftMonth(-1);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      shiftMonth(1);
    } else if (event.key === "t" || event.key === "T") {
      selectDate(new Date());
    }
  };

  const printView = () => onOpenPrint(viewYear, viewMonth);
  const printViewRef = useRef(printView);
  printViewRef.current = printView;
  // Ctrl+P would print the bare calendar window; the print preview lays the month out on paper instead.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || (event.key !== "p" && event.key !== "P")) return;
      event.preventDefault();
      // An open print dialog on the web prints its own pages.
      if (!document.querySelector(".print-screen")) printViewRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dayMenuItems = (date: Date): DayMenuItem[] => [
    {
      id: "add",
      label: t.addEventOn,
      icon: <PlusIcon />,
      onSelect: () => setEditing({ event: blankEvent(date, settings.defaultReminder) }),
    },
    ...(eventsByDay.get(formatISODate(date)) ?? []).slice(0, 6).map((event, index) => ({
      id: `event-${event.id}`,
      label: `${t.editEvent}: ${event.title}`,
      icon: <PencilIcon />,
      color: event.color,
      separated: index === 0,
      onSelect: () => setEditing({ event, occurrence: formatISODate(date) }),
    })),
    { id: "today", label: t.goToday, icon: <TodayIcon />, separated: true, onSelect: () => selectDate(new Date()) },
    { id: "events", label: t.manageEvents, icon: <ListIcon />, onSelect: onOpenEvents },
    { id: "print", label: t.print, icon: <PrintIcon />, onSelect: printView },
    { id: "settings", label: t.settings, icon: <GearIcon />, onSelect: () => onOpenSettings() },
  ];

  const windowMenuItems = (): DayMenuItem[] => [
    { id: "prev", label: t.prevMonth, icon: <ChevronIcon direction="left" />, onSelect: () => shiftMonth(-1) },
    { id: "next", label: t.nextMonth, icon: <ChevronIcon direction="right" />, onSelect: () => shiftMonth(1) },
    { id: "today", label: t.goToday, icon: <TodayIcon />, onSelect: () => selectDate(new Date()) },
    {
      id: "add",
      label: t.addEvent,
      icon: <PlusIcon />,
      separated: true,
      onSelect: () => setEditing({ event: blankEvent(selected, settings.defaultReminder) }),
    },
    { id: "events", label: t.manageEvents, icon: <ListIcon />, onSelect: onOpenEvents },
    { id: "print", label: t.print, icon: <PrintIcon />, separated: true, onSelect: printView },
    { id: "settings", label: t.settings, icon: <GearIcon />, onSelect: () => onOpenSettings() },
    ...(desktop
      ? [
          {
            id: "top",
            label: t.alwaysOnTop,
            icon: <PinIcon />,
            separated: true,
            checked: settings.alwaysOnTop,
            onSelect: () => update({ alwaysOnTop: !settings.alwaysOnTop }),
          },
          { id: "minimize", label: t.minimize, icon: <MinimizeIcon />, onSelect: () => void minimizeMain() },
          {
            id: "maximize",
            label: maximized ? t.restore : t.maximize,
            icon: maximized ? <RestoreIcon /> : <MaximizeIcon />,
            onSelect: () => void toggleMaximizeMain().then(setMaximized),
          },
          { id: "hide", label: t.hide, icon: <HideIcon />, onSelect: () => void hideMain() },
        ]
      : []),
  ];

  const onPanelMenu = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest("input, textarea, .sheet-back, .day-menu, .day, .day-pair")) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };

  const statusText =
    status.state === "checking"
      ? t.checking
      : status.state === "error"
        ? t.holidayError
        : status.state === "cached"
          ? t.holidayCached
          : status.state === "builtin"
            ? t.holidayBuiltin
            : t.holidayLive;

  return (
    <section
      ref={panelRef}
      className={maximized ? "panel calendar maximized" : "panel calendar"}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={drag.onMouseDown}
      onContextMenu={onPanelMenu}
      style={
        {
          transform: `translate(${drag.offset.x}px, ${drag.offset.y}px)`,
          "--events-height": `${settings.eventsHeight}px`,
          ...(resize.width ? { width: resize.width } : {}),
        } as CSSProperties
      }
    >
      <header className="toolbar">
        <div className="toolbar-group">
          <span className="app-brand">
            <img className="app-icon" src="/favicon.png" alt="" width={20} height={20} draggable={false} />
            <span className="app-name">MyCalendar</span>
          </span>
          <button type="button" className="icon-btn" aria-label={t.prevMonth} onClick={() => shiftMonth(-1)}>
            <ChevronIcon direction="left" />
          </button>
          <h1>{monthTitle(viewYear, viewMonth, settings.language, t.months)}</h1>
          <button type="button" className="icon-btn" aria-label={t.nextMonth} onClick={() => shiftMonth(1)}>
            <ChevronIcon direction="right" />
          </button>
          <button type="button" className="text-btn today-btn" onClick={() => selectDate(new Date())}>
            {t.today}
          </button>
        </div>
        <div className="toolbar-group toolbar-end">
          <button type="button" className="icon-btn" aria-label={t.settings} onClick={() => onOpenSettings()}>
            <GearIcon />
          </button>
        </div>
        {desktop && (
          <div className="toolbar-group window-controls">
            <button type="button" className="icon-btn" aria-label={t.minimize} title={t.minimize} onClick={() => void minimizeMain()}>
              <MinimizeIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={maximized ? t.restore : t.maximize}
              title={maximized ? t.restore : t.maximize}
              onClick={() => void toggleMaximizeMain().then(setMaximized)}
            >
              {maximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>
            <button type="button" className="icon-btn close-btn" aria-label={t.close} title={t.hide} onClick={() => void hideMain()}>
              <CloseIcon />
            </button>
          </div>
        )}
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
      <div
        className="days"
        role="grid"
        style={{ ...dateFontStyle(dateFontFor(settings, maximized)), ...(daysPin === null ? {} : { height: daysPin, flex: "none" }) }}
        aria-label={monthTitle(viewYear, viewMonth, settings.language, t.months)}>
        {cells.map((dates) => {
          const dayButton = (date: Date, inPair: boolean) => {
            const iso = formatISODate(date);
            const names = (map[iso] ?? []).map((holiday) => holidayTitle(holiday, settings.language));
            const dayEvents = eventsByDay.get(iso) ?? [];
            const outside = date.getMonth() !== viewMonth;
            const note = settings.showLunar ? dayNote(date, t) : null;
            const className = [
              "day",
              outside ? "out" : "",
              date.getDay() === 0 ? "sunday" : "",
              date.getDay() === 6 ? "saturday" : "",
              names.length ? "holiday" : "",
              isSameDay(date, today) ? "today" : "",
              isSameDay(date, selected) ? "selected" : "",
              note?.cell ? "has-sub" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const label = [
              formatFull(date, settings.language, t.months, t.weekdays),
              ...names,
              note?.full,
              ...dayEvents.map((event) => event.title),
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={iso}
                type="button"
                role={inPair ? undefined : "gridcell"}
                className={className}
                aria-pressed={isSameDay(date, selected)}
                aria-current={isSameDay(date, today) ? "date" : undefined}
                aria-label={label}
                title={note?.cell ? label : undefined}
                onClick={() => setSelected(date)}
                onDoubleClick={() => setEditing({ event: blankEvent(date, settings.defaultReminder) })}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setSelected(date);
                  setMenu({ x: event.clientX, y: event.clientY, date });
                }}
              >
                <span className="num">{date.getDate()}</span>
                {names.length > 0 && <span className="mark" />}
                {note?.cell && <span className={note.term ? "sub term" : "sub"}>{note.cell}</span>}
                {dayEvents.length > 0 && (
                  <span className="dots">
                    {dayEvents.slice(0, 3).map((event) => (
                      <i key={event.id} style={{ background: event.color }} />
                    ))}
                  </span>
                )}
              </button>
            );
          };
          if (dates.length === 1) return dayButton(dates[0], false);
          return (
            <div key={formatISODate(dates[0])} role="gridcell" className="day-pair">
              {dates.map((date) => dayButton(date, true))}
            </div>
          );
        })}
      </div>
      <footer className={collapsed ? "footer collapsed" : "footer"}>
        <div className="status-row">
          <span className={`dot ${status.state}`} />
          <span>{countryLabel}</span>
          <span aria-live="polite">{statusText}</span>
          {status.fetchedAt ? <span>{formatMessage(t.checkedAt, { time: formatWhen(status.fetchedAt, settings.language) })}</span> : null}
          <button type="button" className="icon-btn" aria-label={t.refreshHolidays} onClick={() => requestHolidayRefresh()}>
            <RefreshIcon />
          </button>
          <button
            type="button"
            className="icon-btn footer-toggle"
            aria-label={collapsed ? t.expandEvents : t.collapseEvents}
            aria-expanded={!collapsed}
            aria-controls="calendar-events"
            title={collapsed ? t.expandEvents : t.collapseEvents}
            onClick={toggleEvents}
          >
            <CollapseIcon />
          </button>
        </div>
        {!collapsed && (
          <div id="calendar-events" className="events" style={desktop ? undefined : { height: resize.eventsHeight }}>
            <div className="events-head">
              <p className="selected-date">
                {formatFull(selected, settings.language, t.months, t.weekdays)}
                {selectedNote?.full ? <span className="selected-lunar">{selectedNote.full}</span> : null}
              </p>
              <button
                type="button"
                className="icon-btn"
                aria-label={t.addEvent}
                title={t.addEvent}
                onClick={() => setEditing({ event: blankEvent(selected, settings.defaultReminder) })}
              >
                <PlusIcon />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t.manageEvents}
                title={t.manageEvents}
                onClick={onOpenEvents}
              >
                <ListIcon />
              </button>
            </div>
            <ul className="day-items" aria-label={formatFull(selected, settings.language, t.months, t.weekdays)}>
              {selectedNames.length > 0 && <li className="selected-holiday">{selectedNames.join(", ")}</li>}
              {selectedEvents.map((event) => {
                const repeat = repeatLabel(event, t);
                if (confirmingId === event.id) {
                  const repeating = event.repeat !== "none";
                  return (
                    <li key={event.id} className="day-confirm" role="alert">
                      <div
                        className="day-confirm-row"
                        onKeyDown={(key) => {
                          if (key.key !== "Escape") return;
                          // Cancels the delete without the app-wide Escape hiding the calendar.
                          key.preventDefault();
                          setConfirmingDelete(null);
                          panelRef.current?.focus({ preventScroll: true });
                        }}
                      >
                        <TrashIcon />
                        <span className="event-title">{formatMessage(t.confirmDelete, { title: event.title })}</span>
                        {repeating && (
                          <button type="button" className="text-btn danger" onClick={() => deleteFromList(event, true)}>
                            {t.deleteOccurrence}
                          </button>
                        )}
                        <button type="button" className="text-btn danger" onClick={() => deleteFromList(event, false)}>
                          {repeating ? t.deleteSeries : t.deleteEvent}
                        </button>
                        <button
                          type="button"
                          className="text-btn"
                          autoFocus
                          onClick={() => {
                            setConfirmingDelete(null);
                            panelRef.current?.focus({ preventScroll: true });
                          }}
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="day-event"
                      aria-label={`${t.editEvent}: ${event.title}`}
                      onClick={() => setEditing({ event, occurrence: selectedKey })}
                      onKeyDown={(key) => {
                        if (key.key !== "Delete") return;
                        key.preventDefault();
                        setConfirmingDelete({ id: event.id, day: selectedKey });
                      }}
                    >
                      <i className="event-dot" style={{ background: event.color }} />
                      <span className="event-time">{event.time || t.allDay}</span>
                      <span className="event-title">{event.title}</span>
                      {event.reminder !== null && (
                        <span className="event-repeat event-reminder" title={reminderLabel(event.reminder, t)}>
                          <BellIcon />
                        </span>
                      )}
                      {repeat && (
                        <span className="event-repeat" title={repeat}>
                          <RepeatIcon />
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="icon-btn day-delete"
                      aria-label={`${t.deleteEvent}: ${event.title}`}
                      title={t.deleteEvent}
                      onClick={() => setConfirmingDelete({ id: event.id, day: selectedKey })}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                );
              })}
              {selectedNames.length === 0 && selectedEvents.length === 0 && <li className="hint">{t.noEvents}</li>}
            </ul>
            <p className="field">{t.monthHolidays}</p>
            {monthAgenda.length === 0 ? (
              <p className="hint">{status.state === "checking" ? t.checking : t.noEvents}</p>
            ) : (
              <ul className="holiday-list">
                {monthAgenda.map((row) => (
                  <li key={row.iso}>
                    <button
                      type="button"
                      aria-current={row.iso === selectedKey ? "date" : undefined}
                      onClick={() => selectDate(parseISODate(row.iso))}
                    >
                      <span>{row.day}</span>
                      <span className="agenda">
                        {row.holidays.length > 0 && <em>{row.holidays.join(", ")}</em>}
                        {row.events.map((event) => (
                          <span key={event.id} className="agenda-event">
                            <i className="event-dot" style={{ background: event.color }} />
                            {event.title}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </footer>
      {desktop && !maximized && <div className="resize e" onMouseDown={() => void resizeWindow("East")} />}
      {!maximized && (
        <button
          type="button"
          className="resize-grip"
          aria-label={t.resizeWindow}
          title={t.resizeWindow}
          {...resize.gripProps}
        >
          <ResizeGripIcon />
        </button>
      )}
      {menu && panelRef.current && (
        <DayMenu
          x={menu.x}
          y={menu.y}
          bounds={panelRef.current}
          label={menu.date ? formatFull(menu.date, settings.language, t.months, t.weekdays) : t.windowMenu}
          onClose={closeMenu}
          items={menu.date ? dayMenuItems(menu.date) : windowMenuItems()}
        />
      )}
      {editing && (
        <EventEditor
          t={t}
          initial={editing.event}
          occurrence={editing.occurrence}
          onSave={store.save}
          onDelete={store.remove}
          onSkip={store.skip}
          onClose={() => {
            setEditing(null);
            panelRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}
