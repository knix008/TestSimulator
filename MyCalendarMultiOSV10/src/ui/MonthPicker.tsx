import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Messages } from "../domain/messages";
import { ChevronIcon } from "./icons";

const GAP = 4;
const MARGIN = 6;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;

/**
 * Opened from the month title: the year with −/+ beside it and the twelve months under it. Picking a month moves
 * the calendar there and closes the popup; the year alone only changes what the popup shows.
 */
export function MonthPicker({
  anchor,
  year,
  month,
  t,
  language,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  year: number;
  month: number;
  t: Messages;
  language: "ko" | "en";
  onPick: (year: number, month: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shownYear, setShownYear] = useState(year);
  const [active, setActive] = useState(month);
  const [place, setPlace] = useState<CSSProperties>({ visibility: "hidden" });
  const today = new Date();
  const stepYear = (delta: number) => setShownYear((value) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, value + delta)));

  // Below the title, centred on it, and kept inside the calendar window.
  useLayoutEffect(() => {
    const position = () => {
      const popup = ref.current;
      if (!popup) return;
      const box = anchor.getBoundingClientRect();
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      const left = Math.min(Math.max(MARGIN, box.left + box.width / 2 - width / 2), window.innerWidth - MARGIN - width);
      const below = box.bottom + GAP;
      const top = below + height <= window.innerHeight - MARGIN ? below : Math.max(MARGIN, box.top - GAP - height);
      setPlace({ left: Math.max(MARGIN, left), top });
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [anchor]);

  // Focus waits until the popup is placed: a hidden button cannot take it.
  const placed = place.visibility !== "hidden";
  const focused = useRef(false);
  useEffect(() => {
    if (!placed || focused.current) return;
    focused.current = true;
    ref.current?.querySelector<HTMLButtonElement>(`[data-month="${month}"]`)?.focus({ preventScroll: true });
  }, [placed, month]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onBlur = () => onClose();
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [anchor, onClose]);

  const focusMonth = (next: number) => {
    setActive(next);
    ref.current?.querySelector<HTMLButtonElement>(`[data-month="${next}"]`)?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      stepYear(event.key === "PageUp" ? -1 : 1);
    } else if (event.key in moves && event.target instanceof HTMLElement && event.target.dataset.month !== undefined) {
      event.preventDefault();
      const next = active + moves[event.key];
      if (next < 0) {
        stepYear(-1);
        focusMonth(next + 12);
      } else if (next > 11) {
        stepYear(1);
        focusMonth(next - 12);
      } else {
        focusMonth(next);
      }
    }
  };

  const monthLabel = (index: number) => (language === "ko" ? t.months[index] : t.months[index].slice(0, 3));
  const yearLabel = language === "ko" ? `${shownYear}년` : String(shownYear);

  // On the body: the calendar panel is moved with a transform, which would make fixed positions relative to it.
  return createPortal(
    <div
      ref={ref}
      className="month-picker"
      role="dialog"
      aria-label={t.pickMonth}
      style={place}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onWheel={(event) => {
        if (event.deltaY !== 0) stepYear(event.deltaY > 0 ? 1 : -1);
      }}
    >
      <div className="month-picker-year">
        <button
          type="button"
          className="icon-btn"
          aria-label={t.prevYear}
          title={t.prevYear}
          disabled={shownYear <= MIN_YEAR}
          onClick={() => stepYear(-1)}
        >
          <ChevronIcon direction="left" />
        </button>
        <span className="month-picker-year-label" aria-live="polite">
          {yearLabel}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={t.nextYear}
          title={t.nextYear}
          disabled={shownYear >= MAX_YEAR}
          onClick={() => stepYear(1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>
      <div className="month-picker-grid" role="grid" aria-label={yearLabel}>
        {t.months.map((name, index) => {
          const current = shownYear === year && index === month;
          const thisMonth = shownYear === today.getFullYear() && index === today.getMonth();
          return (
            <button
              key={name}
              type="button"
              data-month={index}
              className={["month-picker-month", current ? "current" : "", thisMonth ? "this-month" : ""].filter(Boolean).join(" ")}
              aria-label={language === "ko" ? `${shownYear}년 ${name}` : `${name} ${shownYear}`}
              aria-current={current ? "date" : undefined}
              tabIndex={index === active ? 0 : -1}
              onFocus={() => setActive(index)}
              onClick={() => onPick(shownYear, index)}
            >
              {monthLabel(index)}
            </button>
          );
        })}
      </div>
      <button type="button" className="month-picker-today" onClick={() => onPick(today.getFullYear(), today.getMonth())}>
        {t.thisMonth}
      </button>
    </div>,
    document.body,
  );
}
