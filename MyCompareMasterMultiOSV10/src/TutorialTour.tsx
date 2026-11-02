/**
 * The guided tour.
 *
 * Nothing is drawn until the tour starts (Help › Tutorial, or the welcome card on the
 * first run). Then the window dims, the part a step is about stays lit inside an accent
 * outline, and a card beside it says what it is, with Back / Next / Skip and "n of N".
 * Keys: → next, ← back, Esc closes.
 *
 * The steps (src/tourSteps.ts) find their parts by `data-tour` attributes, so the tour
 * follows whatever is on screen: a step whose part is missing is explained in the middle
 * of the window, and an optional one (the start screen's) is skipped. The tour never
 * clicks or changes anything in the app; it only points.
 *
 * App mounts <TutorialTour/> once. Anything may start it with `startTutorial()`. The
 * card carries a "Show at startup" checkbox bound to settings.showTutorial; that box
 * alone decides whether the tour is offered next time — finishing or skipping it does
 * not change the setting. `onEnd` only reports that the tour stopped.
 * `window.__mcmTour` exposes the same controls to scripts.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useDragCard } from "./dragCard.js";
import type { StringKey, Translate } from "../core/i18n.js";
import { Icon } from "./icons.js";
import { TOUR_STEPS, tourKeys, type TourStep } from "./tourSteps.js";
import "./tutorial.css";

/* ------------------------------------------------------------------ *
 * The switch, outside React, so a command can flip it
 * ------------------------------------------------------------------ */

let running = false;
const listeners = new Set<(on: boolean) => void>();

export function startTutorial(): void {
  running = true;
  for (const listener of listeners) listener(true);
  // Anything waiting to offer the tour (the welcome card) steps aside.
  window.dispatchEvent(new CustomEvent("mcm-tour-start"));
}

export function stopTutorial(): void {
  running = false;
  for (const listener of listeners) listener(false);
}

export function isTutorialRunning(): boolean {
  return running;
}

/* ------------------------------------------------------------------ *
 * Finding a step's part of the window
 * ------------------------------------------------------------------ */

type Box = { left: number; top: number; width: number; height: number };

function visible(element: Element): boolean {
  if (element.closest(".tour-layer")) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Every element of the first selector that has something on screen. */
export function findTargets(step: TourStep): Element[] {
  for (const selector of step.target ?? []) {
    let found: Element[] = [];
    try {
      found = Array.from(document.querySelectorAll(selector)).filter(visible);
    } catch {
      /* a selector the browser does not understand matches nothing */
    }
    if (found.length > 0) return found;
  }
  return [];
}

function unionBox(elements: Element[]): Box | null {
  if (elements.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  // Only the part inside the window can be lit.
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(window.innerWidth, right);
  bottom = Math.min(window.innerHeight, bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1
    && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);

const available = (step: TourStep) => !step.optional || findTargets(step).length > 0;

/** The next step to show from `from` in direction `dir`, skipping absent optional ones. */
function seek(from: number, dir: 1 | -1): number {
  for (let index = from; index >= 0 && index < TOUR_STEPS.length; index += dir) {
    if (available(TOUR_STEPS[index])) return index;
  }
  return -1;
}

/* ------------------------------------------------------------------ *
 * The overlay
 * ------------------------------------------------------------------ */

const PAD = 6;
const GAP = 14;
const MARGIN = 12;

export function TutorialTour({
  t,
  showAtStart,
  onShowAtStart,
  onEnd,
}: {
  t: Translate;
  /** settings.showTutorial: offer the tour when the app starts. */
  showAtStart: boolean;
  onShowAtStart: (value: boolean) => void;
  onEnd?: (finished: boolean) => void;
}) {
  const [on, setOn] = useState(running);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState({ width: 380, height: 210 });
  // Once the user moves the card it stays put, step after step, until the tour ends.
  const drag = useDragCard();
  const { setPosition: setDragPosition } = drag;
  useEffect(() => {
    if (!on) setDragPosition(null);
  }, [on, setDragPosition]);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  useEffect(() => {
    const listener = (value: boolean) => {
      setOn(value);
      if (value) setIndex(Math.max(0, seek(0, 1)));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const finish = useCallback((finished: boolean) => {
    if (!running) return;
    stopTutorial();
    endRef.current?.(finished);
  }, []);

  const next = useCallback(() => {
    const target = seek(index + 1, 1);
    if (target < 0) finish(true);
    else setIndex(target);
  }, [finish, index]);

  const back = useCallback(() => {
    const target = seek(index - 1, -1);
    if (target >= 0) setIndex(target);
  }, [index]);

  // Scripts (and the GUI test) drive the tour through the same calls as the buttons.
  useEffect(() => {
    const api = {
      start: startTutorial,
      stop: () => finish(false),
      next,
      back,
      go: (to: number) => setIndex(Math.max(0, Math.min(TOUR_STEPS.length - 1, to))),
      state: () => ({ active: running, index, id: TOUR_STEPS[index]?.id, total: TOUR_STEPS.length }),
      steps: TOUR_STEPS,
    };
    (window as unknown as { __mcmTour?: typeof api }).__mcmTour = api;
  }, [back, finish, index, next]);

  // Follow the step's part as the layout moves (panels open, the window resizes).
  useEffect(() => {
    if (!on) return;
    const step = TOUR_STEPS[index];
    let scrolled = false;
    const measure = () => {
      const elements = findTargets(step);
      if (!scrolled && elements.length > 0) {
        scrolled = true;
        const rect = elements[0].getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) elements[0].scrollIntoView({ block: "nearest" });
      }
      const next = unionBox(elements);
      setBox((current) => (sameBox(current, next) ? current : next));
    };
    measure();
    const timer = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [on, index]);

  // The card's own size decides where it fits beside the part.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    setCardSize((current) => (current.width === width && current.height === height ? current : { width, height }));
  });

  useEffect(() => {
    if (on) nextRef.current?.focus({ preventScroll: true });
  }, [on, index]);

  // Keys, ahead of the app's own shortcuts.
  useEffect(() => {
    if (!on) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      } else if (!typing && event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        next();
      } else if (!typing && event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        back();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [back, finish, next, on]);

  if (!on) return null;
  const step = TOUR_STEPS[index];
  if (!step) return null;
  const moved = drag.position;

  const keys = tourKeys(step);
  const shown = TOUR_STEPS.filter(available);
  const position = Math.max(1, shown.indexOf(step) + 1);
  const last = seek(index + 1, 1) < 0;
  const first = seek(index - 1, -1) < 0;
  const missing = !box && (step.target?.length ?? 0) > 0;
  const lit = box
    ? { left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }
    : null;

  return (
    <div className={`tour-layer${lit ? "" : " dimmed"}`} data-testid="tour" data-step={step.id}>
      {lit ? <div className="tour-spotlight" style={lit} aria-hidden="true" /> : null}
      <div
        ref={cardRef}
        className={`tour-card${lit || moved ? "" : " centred"}${moved ? " moved" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        data-drag-card=""
        style={moved ?? (lit ? placeCard(lit, cardSize) : undefined)}
      >
        <header className="tour-head" onPointerDown={drag.onPointerDown}>
          <Icon name="graduation" size={16} mono />
          <span className="tour-head-title">{t("tour.title")}</span>
          <span className="tour-count" data-testid="tour-count">{t("tour.stepOf", position, shown.length)}</span>
          <button type="button" className="tour-close" title={t("tour.skip")} aria-label={t("tour.skip")}
            onClick={() => finish(false)}>
            <Icon name="close" size={14} mono />
          </button>
        </header>
        <div className="tour-progress" aria-hidden="true">
          <i style={{ width: `${(position / shown.length) * 100}%` }} />
        </div>
        <div className="tour-body">
          <h3 id="tour-title">{t(keys.title as StringKey)}</h3>
          <p>{t(keys.text as StringKey)}</p>
          {missing ? (
            <p className="tour-missing">
              <Icon name="about" size={14} />
              <span>{t("tour.missing")}</span>
            </p>
          ) : null}
        </div>
        <label className="tour-startup" title={t("settings.showTutorial")}>
          <input
            type="checkbox"
            data-field="tourShowAtStart"
            checked={showAtStart}
            onChange={(event) => onShowAtStart(event.target.checked)}
          />
          <span>{t("tour.showAtStart")}</span>
        </label>
        <footer className="tour-foot">
          <button type="button" className="tour-button ghost" data-tour-action="skip" onClick={() => finish(false)}>
            {t("tour.skip")}
          </button>
          <span className="tour-keys">{t("tour.keys")}</span>
          <button type="button" className="tour-button" data-tour-action="back" disabled={first} onClick={back}>
            <Icon name="prev" size={13} mono />
            <span>{t("tour.back")}</span>
          </button>
          <button ref={nextRef} type="button" className="tour-button primary" data-tour-action="next" onClick={next}>
            <span>{last ? t("tour.done") : t("tour.next")}</span>
            <Icon name={last ? "check" : "next"} size={13} mono />
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Where the card goes: below the lit part if it fits, else above, else beside it, else
 * inside the window's bottom-right corner. Always wholly inside the window.
 */
function placeCard(lit: Box, card: { width: number; height: number }): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(MARGIN, Math.min(vw - card.width - MARGIN, x));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(vh - card.height - MARGIN, y));
  const centreX = lit.left + lit.width / 2 - card.width / 2;
  const centreY = lit.top + lit.height / 2 - card.height / 2;

  if (lit.top + lit.height + GAP + card.height + MARGIN <= vh) {
    return { left: clampX(centreX), top: lit.top + lit.height + GAP };
  }
  if (lit.top - GAP - card.height >= MARGIN) {
    return { left: clampX(centreX), top: lit.top - GAP - card.height };
  }
  if (lit.left + lit.width + GAP + card.width + MARGIN <= vw) {
    return { left: lit.left + lit.width + GAP, top: clampY(centreY) };
  }
  if (lit.left - GAP - card.width >= MARGIN) {
    return { left: lit.left - GAP - card.width, top: clampY(centreY) };
  }
  // The part fills the window: the card sits over its bottom-right corner.
  return { left: vw - card.width - MARGIN * 2, top: vh - card.height - MARGIN * 3 };
}
