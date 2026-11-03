/**
 * The start screen: what the main window shows while no repository is open, at
 * startup (Preferences › Start screen › Show at startup), or whenever the menu bar's
 * Start button brings it forward.
 *
 * A moving 3D background (startBackground.ts) fills the window under the menu bar and
 * toolbar, and over it sits a board of translucent cards that can be dragged to other
 * places and resized (startLayout.ts): the hero (icon, name, version, the quickest
 * ways in), the recent repositories, the recent remote URLs, the themes and the
 * background. The background, its speed, the card opacity and the card layout are app
 * settings (`settings.startScreen`, core/startScreen.ts), shared with Preferences.
 *
 * Every action is handed in by App, so the start screen does exactly what the menus do.
 */
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
} from "../core/startScreen";
import { THEMES, themeById, type Theme } from "../core/themes";
import type { Settings } from "./api";
import appIcon from "./appIcon";
import type { Lang } from "./i18n";
import { StartBackground } from "./startBackground";
import { BackgroundGrid, RangeStepper, saveStartScreen, startPrefs } from "./startControls";
import { StartIcon, type StartIconName } from "./startIcons";
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
} from "./startLayout";
import "./start.css";

type CardId = "hero" | "actions" | "recent" | "urls" | "theme" | "background";

export const START_CARD_IDS: CardId[] = ["hero", "actions", "recent", "urls", "theme", "background"];
// The launcher, theme and background cards span the board so every choice is a readable tile.
const DEFAULT_SPAN: Record<CardId, number> = { hero: 3, actions: 3, recent: 2, urls: 1, theme: 3, background: 3 };
/** Where the tutorial can point. */
const TOUR: Record<CardId, string> = {
  hero: "start-hero",
  actions: "start-actions",
  recent: "start-recent",
  urls: "start-urls",
  theme: "start-theme",
  background: "start-background",
};

type Drag = { id: CardId; mode: "move" | "resize"; target: Partial<Cell> | null };

export type StartPageProps = {
  settings: Settings;
  lang: Lang;
  t: (key: string) => string;
  version: string;
  /** Saves part of the settings (App's applyPrefs). */
  onPrefs: (patch: Partial<Settings>) => void;
  onOpen: () => void;
  onOpenPath: (path: string) => void;
  onClone: (url?: string) => void;
  onBrowse: (url?: string) => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  onRemoveUrl: (url: string) => void;
  onTheme: (id: string) => void;
  onPreferences: (tab?: "theme" | "start") => void;
  onTutorial: () => void;
  onGuide?: () => void;
  onOpenFolder: () => void;
  /** Switches Korean ⇄ English. */
  onLanguage: () => void;
  /** The workspace with the terminal panel open. */
  onTerminal: () => void;
  onAbout: () => void;
  /** Ends the program (desktop only). */
  onExit?: () => void;
};

type Action = { id: string; icon: StartIconName; label: string; tip: string; run: () => void };

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
  for (const node of ghost.querySelectorAll("[data-tour],[data-recent],[data-start-action]")) {
    node.removeAttribute("data-tour");
    node.removeAttribute("data-recent");
    node.removeAttribute("data-start-action");
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

export function StartPage(props: StartPageProps) {
  const { t, settings, lang } = props;
  const en = lang === "en";
  const repos = settings.recentRepositoryPaths ?? [];
  const urls = settings.recentCloneUrls ?? [];
  const reduced = useReducedMotion();

  /* ------------------------------------------------------ preferences */

  const prefs: StartScreenSettings = startPrefs(settings);
  const speedPercent = effectiveSpeed(prefs, reduced);
  const onPrefs = props.onPrefs;
  const save = useCallback(
    (patch: Partial<StartScreenSettings>) => saveStartScreen(onPrefs, prefs, patch),
    [onPrefs, prefs],
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
    // The theme is applied as data-theme on <html>; repaint in the new colours.
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
    // A speed of zero keeps the last frame rather than redrawing the same one.
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
      title={t("startMoveCard")}
      aria-label={t("startMoveCard")}
      onPointerDown={(event) => startMove(event, id)}
      onKeyDown={(event) => keyMove(event, id)}
    >
      <StartIcon name="drag" size={14} mono />
    </button>
  );

  const card = (id: CardId, icon: StartIconName, title: string, body: ReactNode, extra?: ReactNode, bare = false) => {
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
            <StartIcon name={icon} size={16} />
            <span className="start-card-title">{title}</span>
            <span className="grow" />
            {extra}
          </h2>
        )}
        <div className="card-body">{body}</div>
        <span
          className="card-resize"
          title={t("startResizeCard")}
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

  const current = themeById(settings.theme);
  const themeName = (item: Theme) => (en ? item.nameEn : item.nameKo);
  // One line, like the background buttons: the theme's colours as a small chip
  // (its desktop, a panel and the accent) and its name beside it.
  const themeTile = (item: Theme, label = themeName(item)) => (
    <button
      key={item.id}
      type="button"
      role="radio"
      aria-checked={settings.theme === item.id}
      className={`bg-tile st-theme-tile${settings.theme === item.id ? " on" : ""}`}
      data-theme-id={item.id}
      title={label}
      onClick={() => props.onTheme(item.id)}
    >
      <span className="st-theme-chip" aria-hidden="true" style={{ background: item.swatch[0], borderColor: item.swatch[2] }}>
        <i style={{ background: item.swatch[1] }} />
        <i style={{ background: item.swatch[2] }} />
      </span>
      <span>{label}</span>
    </button>
  );
  const customThemes = Array.isArray(settings.customThemes)
    ? (settings.customThemes as { id?: unknown; name?: unknown }[]).filter((item) => typeof item?.id === "string")
    : [];

  /* ---------------------------------------------------------- launcher */

  const actions: Action[] = [
    { id: "open", icon: "folder", label: t("startOpen"), tip: t("startOpenTip"), run: props.onOpen },
    { id: "open-folder", icon: "tree", label: t("startOpenFolder"), tip: t("startOpenFolderTip"), run: props.onOpenFolder },
    { id: "clone", icon: "clone", label: t("startClone"), tip: t("startCloneTip"), run: () => props.onClone() },
    { id: "browse", icon: "globe", label: t("startBrowse"), tip: t("startBrowseTip"), run: () => props.onBrowse() },
    { id: "terminal", icon: "terminal", label: t("startTerminal"), tip: t("startTerminalTip"), run: props.onTerminal },
    { id: "theme", icon: "palette", label: t("startThemeSettings"), tip: t("startThemeSettingsTip"), run: () => props.onPreferences("theme") },
    { id: "language", icon: "language", label: en ? "한국어" : "English", tip: t("startLanguageTip"), run: props.onLanguage },
    { id: "preferences", icon: "settings", label: t("startPreferences"), tip: t("startPreferencesTip"), run: () => props.onPreferences() },
    { id: "start-settings", icon: "home", label: t("startSettings"), tip: t("startSettingsTip"), run: () => props.onPreferences("start") },
    ...(props.onGuide ? [{ id: "guide", icon: "book" as const, label: t("startGuide"), tip: t("startGuideTip"), run: props.onGuide }] : []),
    { id: "tutorial", icon: "tutorial", label: t("startTutorial"), tip: t("startTutorialTip"), run: props.onTutorial },
    { id: "about", icon: "info", label: t("startAbout"), tip: t("startAboutTip"), run: props.onAbout },
    ...(props.onExit ? [{ id: "exit", icon: "power" as const, label: t("startExit"), tip: t("startExitTip"), run: props.onExit }] : []),
  ];

  /* ------------------------------------------------------------ cards */

  const cards: Record<CardId, ReactNode> = {
    hero: card("hero", "home", "", (
      <>
        <img className="start-icon" src={appIcon} width={76} height={76} alt="" />
        <div className="start-hero-text">
          <h1>
            <span>My Git Master</span>
            {props.version ? <small>v{props.version}</small> : null}
          </h1>
          <p>{t("startDescription")}</p>
        </div>
        <div className="start-hero-actions">
          <div className="start-docs">
            {props.onGuide ? (
              <button type="button" className="start-btn" data-start-action="guide" onClick={props.onGuide}>
                <StartIcon name="book" size={16} />
                <span>{t("startGuide")}</span>
              </button>
            ) : null}
            <button type="button" className="start-btn" data-start-action="tutorial" onClick={props.onTutorial}>
              <StartIcon name="tutorial" size={16} />
              <span>{t("startTutorial")}</span>
            </button>
          </div>
          <button type="button" className="start-btn primary" data-start-action="open" title={t("startOpenTip")} onClick={props.onOpen}>
            <StartIcon name="folder" size={17} mono />
            <span>{t("startOpen")}</span>
          </button>
          <button type="button" className="start-btn" data-start-action="clone" title={t("startCloneTip")} onClick={() => props.onClone()}>
            <StartIcon name="clone" size={17} />
            <span>{t("startClone")}</span>
          </button>
          <button type="button" className="start-btn" data-start-action="browse" title={t("startBrowseTip")} onClick={() => props.onBrowse()}>
            <StartIcon name="globe" size={17} />
            <span>{t("startBrowse")}</span>
          </button>
        </div>
      </>
    ), null, true),

    actions: card("actions", "grid", t("startActions"), (
      <div className="start-actions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="start-tile"
            data-start-action={action.id}
            title={action.tip}
            onClick={action.run}
          >
            <StartIcon name={action.icon} size={20} />
            <b>{action.label}</b>
            <small>{action.tip}</small>
          </button>
        ))}
      </div>
    )),

    recent: card("recent", "clock", t("startRecent"), (
      <div className="start-list">
        {repos.length === 0 ? (
          <div className="start-empty"><StartIcon name="info" size={14} /><span>{t("startNoRecent")}</span></div>
        ) : null}
        {repos.map((repo, index) => (
          <div className="start-row" key={repo}>
            <button
              type="button"
              className="start-link"
              data-recent={index}
              title={repo}
              onClick={() => props.onOpenPath(repo)}
            >
              <StartIcon name="branch" size={16} />
              <span className="name">{shortName(repo)}</span>
              <span className="path">{parentOf(repo)}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              data-recent-remove={index}
              title={t("startRemove")}
              aria-label={t("startRemove")}
              onClick={() => props.onRemoveRecent(repo)}
            >
              <StartIcon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    ), repos.length ? (
      <button type="button" className="start-btn small" data-start-action="clear-recent" onClick={props.onClearRecent}>
        <StartIcon name="trash" size={14} />
        <span>{t("startClearRecent")}</span>
      </button>
    ) : null),

    urls: card("urls", "globe", t("startUrls"), (
      <div className="start-list">
        {urls.length === 0 ? (
          <div className="start-empty"><StartIcon name="info" size={14} /><span>{t("startNoUrls")}</span></div>
        ) : null}
        {urls.map((url, index) => (
          <div className="start-row" key={url}>
            <button
              type="button"
              className="start-link"
              data-url={index}
              title={`${t("startClone")} — ${url}`}
              onClick={() => props.onClone(url)}
            >
              <StartIcon name="link" size={16} />
              <span className="name">{shortName(url.replace(/\.git$/i, ""))}</span>
              <span className="path">{hostOf(url)}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              data-url-browse={index}
              title={t("startBrowse")}
              aria-label={t("startBrowse")}
              onClick={() => props.onBrowse(url)}
            >
              <StartIcon name="eye" size={14} />
            </button>
            <button
              type="button"
              className="icon-button"
              data-url-remove={index}
              title={t("startRemove")}
              aria-label={t("startRemove")}
              onClick={() => props.onRemoveUrl(url)}
            >
              <StartIcon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    )),

    // My themes first with the settings button, then Dark | Light — the same order as
    // the toolbar's theme drop-down.
    theme: card("theme", "palette", t("startTheme"), (
      <div className="st-theme-groups">
        <div className="st-theme-custom-row" role="radiogroup" aria-label={t("startMyThemes")}>
          {customThemes.map((item) => themeTile(themeById(String(item.id)), typeof item.name === "string" ? item.name : String(item.id)))}
          <button
            type="button"
            className="start-btn"
            data-start-action="theme-settings"
            title={t("startThemeSettings")}
            onClick={() => props.onPreferences("theme")}
          >
            <StartIcon name="settings" size={15} />
            <span>{t("startThemeSettings")}</span>
          </button>
        </div>
        <div className="st-theme-columns">
          {(["dark", "light"] as const).map((mode) => (
            <section key={mode} className="st-theme-group" data-theme-kind={mode}>
              <h3>
                <StartIcon name={mode === "light" ? "sun" : "moon"} size={14} />
                <span>{mode === "light" ? t("startThemeLight") : t("startThemeDark")}</span>
              </h3>
              <div className="bg-grid st-theme-tiles" role="radiogroup" aria-label={mode === "light" ? t("startThemeLight") : t("startThemeDark")}>
                {THEMES.filter((item) => item.mode === mode).map((item) => themeTile(item))}
              </div>
            </section>
          ))}
        </div>
      </div>
    ), <span className="start-card-note">{themeName(current)}</span>),

    background: card("background", "image", t("startBackground"), (
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
<div className="start-ranges inline">
          <label className="start-range inline">
            <span className="start-range-label"><StartIcon name="clock" size={14} />{t("startSpeed")}</span>
            <RangeStepper
              compact
              name="startSpeed"
              label={t("startSpeed")}
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={SPEED_STEP}
              suffix="%"
              value={speedPercent}
              onChange={(value) => save({ speed: value })}
            />
          </label>
          <label className="start-range inline">
            <span className="start-range-label"><StartIcon name="eye" size={14} />{t("startCardOpacity")}</span>
            <RangeStepper
              compact
              name="startCardOpacity"
              label={t("startCardOpacity")}
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
          ? <p className="start-note"><StartIcon name="info" size={14} /><span>{t("startReducedMotion")}</span></p>
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
            <label className="start-btn start-startup" title={t("startShowAtStartup")}>
              <input
                type="checkbox"
                data-field="startShowOnStartup"
                checked={prefs.showOnStartup}
                onChange={(event) => save({ showOnStartup: event.target.checked })}
              />
              <span>{t("startShowAtStartup")}</span>
            </label>
            <button type="button" className="start-btn" data-start-action="start-settings" title={t("startSettings")} onClick={() => props.onPreferences("start")}>
              <StartIcon name="settings" size={15} />
              <span>{t("startSettings")}</span>
            </button>
            <button type="button" className="start-btn" data-tour="start-arrange" title={t("startAutoArrangeTip")} onClick={arrange}>
              <StartIcon name="grid" size={15} />
              <span>{t("startAutoArrange")}</span>
            </button>
          </div>
          <div className="start-board" data-tour="start-board" ref={board}>
            {START_CARD_IDS.map((id) => cards[id])}
            {dropOutline}
          </div>
          <footer className="start-foot">
            <StartIcon name="info" size={14} />
            <span className="grow">My Git Master {props.version ? `V${props.version}` : ""}</span>
            <span className="muted">© SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function shortName(target: string): string {
  const parts = target.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? target;
}

function parentOf(target: string): string {
  const index = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  return index > 0 ? target.slice(0, index) : target;
}

function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host ? `${parsed.host}${parsed.pathname.replace(/\/[^/]*$/, "")}` : parentOf(url);
  } catch {
    return parentOf(url);
  }
}
