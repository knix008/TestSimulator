/**
 * The start screen: what the workspace shows while no tab is open, or when the menu
 * bar's Start button brings it in front of the open tabs.
 *
 * A moving 3D background (startBackground.ts) fills the workspace, and over it sits a
 * board of translucent cards that can be dragged to other places and resized
 * (startLayout.ts): the hero (icon, name, version, the quickest ways in), one tile
 * per kind of session straight from the catalogue in core/sessions.ts, the recent
 * list, the saved sessions, the themes and the background. The background, its
 * speed, the card opacity and the card layout are app settings
 * (`settings.startScreen`, core/startScreen.ts), shared with Settings › Start screen.
 *
 * Every action goes through the same commands and store actions as the menus, so the
 * start screen can never offer something the rest of the app cannot do.
 */
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SESSION_TYPES, sessionType } from "../core/sessions.js";
import {
  effectiveSpeed,
  OPACITY_MAX,
  OPACITY_MIN,
  OPACITY_STEP,
  SHUFFLE_SECONDS,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  type StartScreenSettings,
} from "../core/startScreen.js";
import { CUSTOM_THEME_ID, THEMES, theme as themeOf, type Theme } from "../core/themes.js";
import { useCommands } from "./commands.js";
import * as host from "./host.js";
import { APP_ICON_URL } from "./appIcon.js";
import { Icon } from "./icons.js";
import { useApp } from "./state.js";
import { StartBackground } from "./startBackground.js";
import { BackgroundGrid, RangeStepper, saveStartScreen } from "./startControls.js";
import {
  autoArrange,
  type Cell,
  type Cells,
  cardsOf,
  COLS,
  compact,
  GAP,
  layoutKey,
  layoutValue,
  place,
  ROW,
  rowsFor,
  swapVertical,
} from "./startLayout.js";
import { hideStartScreen } from "./startScreen.js";
import "./start.css";

type CardId = "hero" | "sessions" | "recent" | "theme" | "saved" | "background";

export const START_CARD_IDS: CardId[] = ["hero", "sessions", "recent", "saved", "theme", "background"];
// The theme and background cards span the board so every choice is a readable tile.
const DEFAULT_SPAN: Record<CardId, number> = { hero: 3, sessions: 3, recent: 2, saved: 1, theme: 3, background: 3 };
/** Where the tutorial can point. */
const TOUR: Record<CardId, string> = {
  hero: "start-hero",
  sessions: "start-new-session",
  recent: "start-recent",
  saved: "start-saved",
  theme: "start-theme",
  background: "start-background",
};
/** The hero's quick actions: the three kinds most sessions are. */
const HERO_KINDS = ["text-compare", "folder-compare", "text-merge"];

type Drag = { id: CardId; mode: "move" | "resize"; target: Partial<Cell> | null };

function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const on = () => setReduced(list.matches);
    list.addEventListener("change", on);
    return () => list.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** A see-through copy of the dragged card that follows the pointer. */
function dragGhost(el: HTMLElement, event: ReactPointerEvent, container: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const offX = event.clientX - rect.left;
  const offY = event.clientY - rect.top;
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add("start-ghost");
  ghost.removeAttribute("data-card");
  ghost.removeAttribute("data-tour");
  ghost.setAttribute("aria-hidden", "true");
  for (const node of ghost.querySelectorAll("[data-tour],[data-command],[data-session-type],[data-recent]")) {
    node.removeAttribute("data-tour");
    node.removeAttribute("data-command");
    node.removeAttribute("data-session-type");
    node.removeAttribute("data-recent");
  }
  Object.assign(ghost.style, {
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transformOrigin: `${offX}px ${offY}px`,
    gridColumn: "auto",
    gridRow: "auto",
  });
  let last = { x: event.clientX, y: event.clientY };
  const put = () => {
    const c = container.getBoundingClientRect();
    ghost.style.left = `${last.x - offX - c.left}px`;
    ghost.style.top = `${last.y - offY - c.top}px`;
  };
  put();
  container.appendChild(ghost);
  return {
    topLeft: () => ({ x: last.x - offX, y: last.y - offY }),
    move(e: PointerEvent) {
      last = { x: e.clientX, y: e.clientY };
      put();
    },
    destroy() {
      ghost.remove();
    },
  };
}

export function StartPage() {
  const app = useApp();
  const { commands, run } = useCommands();
  const { t, settings, language } = app;
  const en = language === "en";
  const entries = settings.recent ?? [];
  const savedSessions = settings.sessions ?? [];
  const reduced = useReducedMotion();

  /* ------------------------------------------------------ preferences */

  const prefs: StartScreenSettings = settings.startScreen;
  const speedPercent = effectiveSpeed(prefs, reduced);
  const save = useCallback(
    (patch: Partial<StartScreenSettings>) => void saveStartScreen(prefs, patch),
    [prefs],
  );

  /* ------------------------------------------------------- background */

  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef<StartBackground | null>(null);
  const speed = useRef(speedPercent);
  speed.current = speedPercent;

  useEffect(() => {
    if (!canvas.current) return undefined;
    const background = new StartBackground(canvas.current, {
      kind: prefs.background,
      speed: () => (speed.current || 0) / 100,
    });
    anim.current = background;
    background.start();
    // The theme is applied as inline custom properties on <html>; repaint in the new colours.
    const observer = new MutationObserver(() => background.refreshColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
    return () => {
      observer.disconnect();
      background.destroy();
      anim.current = null;
    };
    // Built once; the kind and speed are passed on by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { anim.current?.setKind(prefs.background); }, [prefs.background]);
  useEffect(() => {
    // Reduced motion only slows the default (core/startScreen.ts); a speed of zero
    // keeps the last frame rather than redrawing the same one 30 times a second.
    const background = anim.current;
    if (!background) return;
    if (speedPercent > 0) background.start();
    else background.stop();
  }, [speedPercent]);
  useEffect(() => {
    if (!prefs.shuffleSec) return undefined;
    const timer = window.setInterval(() => anim.current?.shuffle(), prefs.shuffleSec * 1000);
    return () => window.clearInterval(timer);
  }, [prefs.shuffleSec]);

  /* ------------------------------------------------------- card board */

  const board = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const burst = useRef({ at: 0, n: 0 });
  const saved = useMemo(
    () => cardsOf(prefs.layout, START_CARD_IDS, DEFAULT_SPAN, measured),
    [prefs.layout, measured],
  );
  const pending = drag && drag.target ? place(saved, drag.id, drag.target) : null;
  const shown = pending ?? saved;
  const saveLayout = useCallback((cards: Cells) => save({ layout: layoutValue(compact(cards)) }), [save]);
  const arrange = () => saveLayout(autoArrange(START_CARD_IDS, DEFAULT_SPAN, measured));

  // Fit cards take the height of their content, measured in rows.
  const measure = useCallback(() => {
    const el = board.current;
    if (!el) return;
    const next: Record<string, number> = {};
    for (const card of el.querySelectorAll<HTMLElement>(":scope > .start-card.fit")) {
      next[card.dataset.card ?? ""] = rowsFor(card.offsetHeight);
    }
    // Growing always applies; shrinking by a single row does not, so a card whose
    // height depends on where compaction put it cannot flip between two heights.
    // A burst of updates stops after a dozen; the next resize measures again.
    const now = performance.now();
    if (now - burst.current.at > 1000) burst.current = { at: now, n: 0 };
    if (burst.current.n > 12) return;
    setMeasured((current) => {
      const changed = Object.keys(next).filter((k) => current[k] === undefined || next[k] > current[k] || current[k] - next[k] > 1);
      if (!changed.length) return current;
      burst.current.n += 1;
      return { ...current, ...Object.fromEntries(changed.map((k) => [k, next[k]])) };
    });
  }, []);
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const el = board.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measure());
    for (const card of el.querySelectorAll(":scope > .start-card")) observer.observe(card);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  // The other cards slide to their new places rather than jumping.
  const rects = useRef(new Map<string, DOMRect>());
  const shownKey = layoutKey(shown);
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const now = new Map<string, DOMRect>();
    for (const card of el.querySelectorAll<HTMLElement>(":scope > .start-card")) {
      const id = card.dataset.card ?? "";
      const r = card.getBoundingClientRect();
      now.set(id, r);
      const old = rects.current.get(id);
      if (!old || reduced || card.classList.contains("drag-origin") || !card.animate) continue;
      const dx = old.left - r.left;
      const dy = old.top - r.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 180, easing: "ease-out" });
      }
    }
    rects.current = now;
  }, [shownKey, reduced]);

  const columnWidth = () => {
    const r = board.current!.getBoundingClientRect();
    return (r.width - GAP * (COLS - 1)) / COLS;
  };
  const cellAt = (x: number, y: number, w: number) => {
    const r = board.current!.getBoundingClientRect();
    const colW = columnWidth();
    return {
      col: Math.max(0, Math.min(COLS - w, Math.round((x - r.left) / (colW + GAP)))),
      row: Math.max(0, Math.round((y - r.top) / ROW)),
    };
  };
  const autoScroll = (event: PointerEvent) => {
    const scroller = board.current?.closest(".start-scroll");
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    if (event.clientY > r.bottom - 36) scroller.scrollTop += 14;
    else if (event.clientY < r.top + 36) scroller.scrollTop -= 14;
  };
  const focusHandle = (id: CardId) => window.setTimeout(() => {
    board.current?.querySelector<HTMLElement>(`[data-card="${id}"] .card-handle`)?.focus();
  }, 30);

  const follow = (move: (event: PointerEvent) => void, done: (event: PointerEvent) => void) => {
    const up = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      done(event);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const startMove = (event: ReactPointerEvent<HTMLElement>, id: CardId) => {
    if (event.button !== 0 || !board.current) return;
    event.preventDefault();
    const el = event.currentTarget.closest<HTMLElement>(".start-card");
    if (!el) return;
    const ghost = dragGhost(el, event, board.current);
    const c = saved[id];
    let target = { col: c.col, row: c.row };
    setDrag({ id, mode: "move", target });
    follow((ev) => {
      // Scroll first: the ghost is placed against the board, which scrolling moves.
      autoScroll(ev);
      ghost.move(ev);
      const p = ghost.topLeft();
      const next = cellAt(p.x, p.y, c.w);
      if (next.col !== target.col || next.row !== target.row) {
        target = next;
        setDrag({ id, mode: "move", target });
      }
    }, (ev) => {
      ghost.destroy();
      setDrag(null);
      if (ev.type === "pointerup" && (target.col !== c.col || target.row !== c.row)) saveLayout(place(saved, id, target));
    });
  };

  const startResize = (event: ReactPointerEvent<HTMLElement>, id: CardId) => {
    if (event.button !== 0 || !board.current) return;
    event.preventDefault();
    event.stopPropagation();
    const card = event.currentTarget.parentElement as HTMLElement;
    const rect = card.getBoundingClientRect();
    const colW = columnWidth();
    const c = saved[id];
    const startX = event.clientX;
    const startY = event.clientY;
    let target = { w: c.w, h: c.h };
    setDrag({ id, mode: "resize", target: null });
    follow((ev) => {
      autoScroll(ev);
      const w = Math.max(1, Math.min(COLS - c.col, Math.round((rect.width + ev.clientX - startX + GAP) / (colW + GAP))));
      const h = Math.max(4, Math.round((rect.height + ev.clientY - startY + GAP) / ROW));
      if (w !== target.w || h !== target.h) {
        target = { w, h };
        setDrag({ id, mode: "resize", target: { ...target, fit: false } });
      }
    }, (ev) => {
      setDrag(null);
      if (ev.type === "pointerup" && (target.w !== c.w || target.h !== c.h)) saveLayout(place(saved, id, { ...target, fit: false }));
    });
  };

  // Alt+arrows move a card one cell; Alt+Shift+arrows resize it.
  const keyMove = (event: ReactKeyboardEvent, id: CardId) => {
    if (!event.altKey || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    event.stopPropagation();
    const c = { ...saved[id] };
    const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (event.shiftKey) {
      c.w = Math.max(1, Math.min(COLS - c.col, c.w + dx));
      if (dy) {
        c.h = Math.max(4, c.h + dy);
        c.fit = false;
      }
    } else if (dy) {
      // A plain move up or down would compact straight back: swap with the neighbour.
      saveLayout(swapVertical(saved, id, dy));
      focusHandle(id);
      return;
    } else {
      c.col = Math.max(0, Math.min(COLS - c.w, c.col + dx));
    }
    saveLayout(place(saved, id, c));
    focusHandle(id);
  };

  const cellStyle = (c: Cell): CSSProperties => ({ gridColumn: `${c.col + 1} / span ${c.w}`, gridRow: `${c.row + 1} / span ${c.h}` });

  const handle = (id: CardId) => (
    <button
      type="button"
      className="card-handle"
      data-card-handle={id}
      title={t("start.moveCard")}
      aria-label={t("start.moveCard")}
      onPointerDown={(event) => startMove(event, id)}
      onKeyDown={(event) => keyMove(event, id)}
    >
      <Icon name="drag" size={14} />
    </button>
  );

  const card = (id: CardId, icon: string, title: string, body: ReactNode, extra?: ReactNode, bare = false) => {
    const mine = drag?.id === id;
    const c = mine ? saved[id] : shown[id];
    const classes = [
      "start-card",
      `start-card-${id}`,
      bare ? "bare" : "",
      c.fit ? "fit" : "fixed-height",
      mine && drag?.mode === "move" ? "drag-origin" : "",
      mine && drag?.mode === "resize" ? "resizing" : "",
    ].filter(Boolean).join(" ");
    return (
      <section
        key={id}
        data-card={id}
        data-tour={TOUR[id]}
        className={classes}
        style={{ ...cellStyle(c), height: c.fit ? undefined : `${c.h * ROW - GAP}px` }}
        aria-label={title || undefined}
      >
        {bare ? <span className="card-handle-float">{handle(id)}</span> : (
          <h2>
            {handle(id)}
            <Icon name={icon} size={16} className="start-accent" />
            <span className="start-card-title">{title}</span>
            <span className="grow" />
            {extra}
          </h2>
        )}
        <div className="card-body">{body}</div>
        <span
          className="card-resize"
          title={t("start.resizeCard")}
          onPointerDown={(event) => startResize(event, id)}
          onDoubleClick={() => saveLayout(place(saved, id, { fit: true }))}
        />
      </section>
    );
  };

  const dropOutline = drag && drag.target ? (
    <div
      key="drop-outline"
      className="card-drop-outline"
      aria-hidden="true"
      style={{ ...cellStyle(shown[drag.id]), height: `${shown[drag.id].h * ROW - GAP}px` }}
    />
  ) : null;

  /* ------------------------------------------------------------ theme */

  const current = themeOf(settings.theme, settings.customTheme);
  const setTheme = (id: string) => void app.updateSettings({ theme: id });
  const themeLabel = (item: Theme) => (item.id === CUSTOM_THEME_ID ? t("settings.themeCustom") : en ? item.en : item.ko);
  // In a Light or Dark column the kind is already said by the heading.
  const shortLabel = (item: Theme) => themeLabel(item).replace(/\s*\((밝게|어둡게)\)$/, "").replace(/\s+(Light|Dark)$/, "");
  const customTheme = themeOf(CUSTOM_THEME_ID, settings.customTheme);
  // One line, like the background buttons: the theme's colours as a small chip
  // (its desktop, a panel and the accent) and its name beside it.
  const themeTile = (item: Theme) => (
    <button
      key={item.id}
      type="button"
      role="radio"
      aria-checked={settings.theme === item.id}
      className={`bg-tile st-theme-tile${settings.theme === item.id ? " on" : ""}`}
      data-theme-id={item.id}
      title={themeLabel(item)}
      onClick={() => setTheme(item.id)}
    >
      <span className="st-theme-chip" aria-hidden="true" style={{ background: item.bg, borderColor: item.accent }}>
        <i style={{ background: item.panel }} />
        <i style={{ background: item.accent }} />
      </span>
      <span>{shortLabel(item)}</span>
    </button>
  );

  /* ------------------------------------------------------------ cards */

  const typeName = (kind: string) => {
    const type = SESSION_TYPES.find((item) => item.kind === kind);
    return type ? (en ? type.en : type.ko) : kind;
  };
  const helpButtons = (["help.guide", "help.tutorial"] as const)
    .filter((id) => commands[id])
    .map((id) => (
      <button
        key={id}
        type="button"
        className="start-btn"
        data-command={id}
        disabled={!commands[id].enabled}
        onClick={() => run(id)}
      >
        <Icon name={id === "help.guide" ? "help" : "bookmark"} size={16} />
        <span>{t(id === "help.guide" ? "start.guide" : "start.tutorial")}</span>
      </button>
    ));

  const version = app.bootstrap?.app.version ?? "";
  const cards: Record<CardId, ReactNode> = {
    hero: card("hero", "home", "", (
      <>
        <img className="start-icon" src={APP_ICON_URL} alt="" width={76} height={76} />
        <div className="start-hero-text">
          <h1>
            <span>{app.bootstrap?.app.name ?? "My Compare Master"}</span>
            {version ? <small title={t("start.version", version)}>v{version}</small> : null}
          </h1>
          <p>{t("about.description")}</p>
        </div>
        <div className="start-hero-actions">
          {helpButtons.length ? <div className="start-docs">{helpButtons}</div> : null}
          {HERO_KINDS.map((kind, index) => {
            const type = SESSION_TYPES.find((item) => item.kind === kind);
            if (!type) return null;
            return (
              <button
                key={kind}
                type="button"
                className={`start-btn${index === 0 ? " primary" : ""}`}
                data-command={type.command}
                title={en ? type.enHint : type.koHint}
                disabled={!commands[type.command]?.enabled}
                onClick={() => run(type.command)}
              >
                <Icon name={type.icon} size={17} />
                <span>{typeName(kind)}</span>
              </button>
            );
          })}
        </div>
      </>
    ), null, true),

    // One tile per kind of session, straight from the catalogue, so the start screen
    // can never fall out of step with what the app can actually open.
    sessions: card("sessions", "plus", t("start.newSession"), (
      <div className="start-tiles">
        {SESSION_TYPES.map((type) => (
          <button
            key={type.kind}
            type="button"
            className="start-tile"
            data-session-type={type.kind}
            data-command={type.command}
            title={en ? type.enHint : type.koHint}
            disabled={!commands[type.command]?.enabled}
            onClick={() => run(type.command)}
          >
            <Icon name={type.icon} size={20} className="start-accent" />
            <b>{en ? type.en : type.ko}</b>
            <small>{en ? type.enHint : type.koHint}</small>
          </button>
        ))}
      </div>
    )),

    recent: card("recent", "clock", t("start.recent"), (
      <>
        <div className="start-list">
          {entries.length === 0 ? (
            <div className="start-empty"><Icon name="about" size={14} /><span>{t("settings.noRecent")}</span></div>
          ) : null}
          {entries.map((entry, index) => (
            <div className="start-row" key={`${entry.kind}-${index}`}>
              <button
                type="button"
                className="start-link"
                data-recent={index}
                title={entry.paths.join("  ↔  ")}
                onClick={() => void app.openRecentEntry(entry.kind, entry.paths).then(hideStartScreen)}
              >
                <Icon name={recentIcon(entry.kind)} size={16} className="start-accent" />
                <span className="name">{entry.paths.slice(0, 2).map(shortName).join("  ↔  ")}</span>
                <span className="path">{entry.paths[0] ? parentOf(entry.paths[0]) : ""}</span>
              </button>
              <button
                type="button"
                className="icon-button"
                data-recent-remove={index}
                title={t("start.recentRemove")}
                aria-label={t("start.recentRemove")}
                onClick={() => void app.removeRecent(entry)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
        <p className="start-hint">
          <Icon name="drag" size={15} />
          <span>{t("pane.dropHint")}</span>
        </p>
      </>
    ), entries.length ? (
      <button type="button" className="start-btn small" data-command="recent.clear" onClick={() => void app.clearRecent()}>
        <Icon name="clearAll" size={14} />
        <span>{t("cmd.file.clearRecent")}</span>
      </button>
    ) : null),

    // Custom first with its own gear, then Light | Dark — the same order as the
    // toolbar's theme drop-down.
    theme: card("theme", "palette", t("start.theme"), (
      <div className="st-theme-groups">
        <div className="st-theme-custom-row" role="radiogroup" aria-label={t("settings.themeCustom")}>
          {themeTile(customTheme)}
          <button
            type="button"
            className="start-btn"
            data-start-edit-custom=""
            title={t("ctx.editCustomTheme")}
            onClick={() => void host.openDialog("settings", { tab: "custom" })}
          >
            <Icon name="settings" size={15} />
            <span>{t("ctx.editCustomTheme")}</span>
          </button>
        </div>
        <div className="st-theme-columns">
          {(["light", "dark"] as const).map((kind) => (
            <section key={kind} className="st-theme-group" data-theme-kind={kind}>
              <h3>
                <Icon name={kind === "light" ? "sun" : "moon"} size={14} />
                <span>{kind === "light" ? t("settings.themeLight") : t("settings.themeDark")}</span>
              </h3>
              <div className="bg-grid st-theme-tiles" role="radiogroup" aria-label={kind === "light" ? t("settings.themeLight") : t("settings.themeDark")}>
                {THEMES.filter((item) => item.kind === kind).map(themeTile)}
              </div>
            </section>
          ))}
        </div>
      </div>
    ), <span className="start-card-note">{themeLabel(current)}</span>),

    // The sessions the user named and kept: the start screen has no session panel,
    // so they are reopened from here.
    saved: card("saved", "session", t("session.saved"), (
      <div className="start-list">
        {savedSessions.length === 0 ? (
          <div className="start-empty"><Icon name="about" size={14} /><span>{t("session.noneSaved")}</span></div>
        ) : null}
        {savedSessions.map((session) => (
          <div className="start-row" key={session.id}>
            <button
              type="button"
              className="start-link"
              data-session={session.id}
              title={session.paths.join("\n")}
              onClick={() => void app.openSavedSession(session).then(hideStartScreen)}
            >
              <Icon name={sessionType(session.kind)?.icon ?? "session"} size={16} className="start-accent" />
              <span className="name">{session.name}</span>
              <span className="path">{typeName(session.kind)}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              data-session-remove={session.id}
              title={t("session.remove")}
              aria-label={t("session.remove")}
              onClick={() => void app.removeSession(session.id)}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    )),

    background: card("background", "image", t("start.background"), (
      <>
        <BackgroundGrid
          value={prefs.background}
          t={t}
          onChange={(background) => save({ background })}
          shuffle={{
            on: prefs.shuffleSec > 0,
            seconds: SHUFFLE_SECONDS,
            onToggle: () => save({ shuffleSec: prefs.shuffleSec > 0 ? 0 : SHUFFLE_SECONDS }),
          }}
        />
        <div className="start-ranges">
          <label className="start-range">
            <span className="start-range-label"><Icon name="clock" size={14} className="start-accent" />{t("start.speed")}</span>
            <RangeStepper
              name="startSpeed"
              label={t("start.speed")}
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={SPEED_STEP}
              suffix="%"
              value={speedPercent}
              onChange={(value) => save({ speed: value })}
            />
          </label>
          <label className="start-range">
            <span className="start-range-label"><Icon name="eye" size={14} className="start-accent" />{t("start.cardOpacity")}</span>
            <RangeStepper
              name="startCardOpacity"
              label={t("start.cardOpacity")}
              min={OPACITY_MIN}
              max={OPACITY_MAX}
              step={OPACITY_STEP}
              suffix="%"
              value={prefs.cardOpacity}
              onChange={(value) => save({ cardOpacity: value })}
            />
          </label>
        </div>
        {reduced && prefs.speed === null
          ? <p className="start-note"><Icon name="about" size={14} /><span>{t("start.reducedMotion")}</span></p>
          : null}
      </>
    )),
  };

  return (
    <div
      className="start-page"
      data-tour="start-page"
      style={{ "--start-card-alpha": `${prefs.cardOpacity}%` } as CSSProperties}
    >
      <canvas ref={canvas} className="start-bg" aria-hidden="true" data-background-kind={prefs.background} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            <button type="button" className="start-btn" data-tour="start-arrange" title={t("start.autoArrangeTip")} onClick={arrange}>
              <Icon name="grid" size={15} />
              <span>{t("start.autoArrange")}</span>
            </button>
          </div>
          <div className="start-board" data-tour="start-board" ref={board}>
            {START_CARD_IDS.map((id) => cards[id])}
            {dropOutline}
          </div>
          <footer className="start-foot">
            <Icon name="about" size={14} className="start-accent" />
            <span className="grow">{app.bootstrap?.app.title ?? ""}</span>
            <span className="muted">{app.bootstrap?.app.author ? `© ${app.bootstrap.app.author}` : ""}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function recentIcon(kind: string): string {
  return kind === "directories" ? "folders"
    : kind === "merge" ? "merge"
      : kind === "conflict" ? "conflict"
        : kind === "repository" ? "repository"
          : kind === "session" ? "session"
            : "compareFiles";
}

function shortName(target: string): string {
  const parts = target.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? target;
}

function parentOf(target: string): string {
  const index = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  return index > 0 ? target.slice(0, index) : target;
}
