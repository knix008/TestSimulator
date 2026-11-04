// The start screen, the same design as My Git Master's: a moving background behind a board of
// translucent cards that can be moved and resized, with launcher tiles and one-line pickers.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import appIcon from "../assets/icons/128x128.png";
import { Flag, Icon } from "./icons.jsx";
import { THEMES, themeById } from "./themes.js";
import { BACKGROUND_KINDS, drawBackground, themePalette } from "./start/backgrounds.js";
import { COLS, GAP, ROW, autoArrange, cardsOf, compact, layoutKey, layoutValue, place, rowsFor } from "./start/layout.js";
import { OPACITY_MAX, OPACITY_MIN, OPACITY_STEP, SHUFFLE_SECONDS, SPEED_MAX, SPEED_MIN, SPEED_STEP, START_CARDS, effectiveSpeed } from "./settings.js";

const FRAME_MS = 1000 / 30;
const DEFAULT_SPAN = { hero: 3, actions: 3, recent: 3, theme: 3, background: 3 };

function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => !!window.matchMedia?.(query).matches);
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
function dragGhost(element, event, container) {
  const rect = element.getBoundingClientRect();
  const offX = event.clientX - rect.left;
  const offY = event.clientY - rect.top;
  const ghost = element.cloneNode(true);
  ghost.classList.add("start-ghost");
  ghost.removeAttribute("data-card");
  ghost.setAttribute("aria-hidden", "true");
  for (const node of ghost.querySelectorAll("[data-recent],[data-start],[data-background],[data-start-theme],[data-card-handle]")) {
    for (const name of ["data-recent", "data-start", "data-background", "data-start-theme", "data-card-handle"]) node.removeAttribute(name);
  }
  Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, transformOrigin: `${offX}px ${offY}px`, gridColumn: "auto", gridRow: "auto" });
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
    move(next) {
      last = { x: next.clientX, y: next.clientY };
      put();
    },
    destroy: () => ghost.remove(),
  };
}

/** A small live-coloured still of a background: its icon on the picker tile. */
function BackgroundChip({ kind, themeId }) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    if (element) drawBackground(kind, element.getContext("2d"), element.width, element.height, 12.5, themePalette());
  }, [kind, themeId]);
  return <canvas className="bg-chip" ref={canvas} width={44} height={30} aria-hidden="true" />;
}

export function BackgroundGrid({ t, value, themeId, onChange, shuffle }) {
  return (
    <div className="bg-grid" role="radiogroup" aria-label={t("start.background")}>
      {BACKGROUND_KINDS.map((kind) => (
        <button type="button" role="radio" key={kind} aria-checked={value === kind} className={value === kind ? "bg-tile on" : "bg-tile"} data-background={kind} title={t(`bg.${kind}`)} onClick={() => onChange(kind)}>
          <BackgroundChip kind={kind} themeId={themeId} />
          <span>{t(`bg.${kind}`)}</span>
        </button>
      ))}
      {shuffle && (
        <button type="button" role="switch" aria-checked={shuffle.on} className={shuffle.on ? "bg-tile shuffle on" : "bg-tile shuffle"} data-background-shuffle="" title={t("start.shuffle", { seconds: SHUFFLE_SECONDS })} onClick={shuffle.onToggle}>
          <Icon name="sync" />
          <span>{t("start.shuffleShort")}</span>
        </button>
      )}
    </div>
  );
}

/** [−] [slider bar] [value, centred] [+]. */
export function RangeStepper({ name, label, value, min, max, step, suffix, onChange }) {
  const clamp = (next) => Math.max(min, Math.min(max, Math.round(next / step) * step));
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const bar = useRef(null);
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const fromPointer = (clientX) => {
    const rect = bar.current.getBoundingClientRect();
    return clamp(min + ((clientX - rect.left) / (rect.width || 1)) * (max - min));
  };
  const beginDrag = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    let last = fromPointer(event.clientX);
    if (last !== value) onChange(last);
    const move = (moved) => {
      const next = fromPointer(moved.clientX);
      if (next !== last) {
        last = next;
        onChange(next);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onBarKey = (event) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? step : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -step : 0;
    if (!delta) return;
    event.preventDefault();
    onChange(clamp(value + delta));
  };
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(parsed)) {
      const next = clamp(parsed);
      setDraft(String(next));
      if (next !== value) onChange(next);
    } else {
      setDraft(String(value));
    }
  };
  return (
    <span className="range-stepper" data-range={name}>
      <button type="button" className="range-step" data-step={`${name}:down`} title={`${label} −`} aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <div ref={bar} className="range-bar" data-range-bar={name} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} title={`${label}: ${value}${suffix ?? ""}`} onPointerDown={beginDrag} onKeyDown={onBarKey}>
        <span className="range-fill" style={{ width: `${fraction * 100}%` }} />
        <span className="range-thumb" style={{ left: `${fraction * 100}%` }} />
      </div>
      <span className="range-value">
        <input type="number" data-field={name} min={min} max={max} step={step} value={draft} aria-label={label} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && commit()} />
        {suffix && <span className="range-suffix">{suffix}</span>}
      </span>
      <button type="button" className="range-step" data-step={`${name}:up`} title={`${label} +`} aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
    </span>
  );
}

/** Speed and card opacity on one line, used by the card and the settings window. */
export function StartRanges({ t, start, speed, onChange }) {
  return (
    <div className="start-ranges inline">
      <div className="start-range inline">
        <span className="start-range-label"><Icon name="clock" size={14} />{t("start.speed")}</span>
        <RangeStepper name="startSpeed" label={t("start.speed")} min={SPEED_MIN} max={SPEED_MAX} step={SPEED_STEP} suffix="%" value={speed} onChange={(next) => onChange({ speed: next })} />
      </div>
      <div className="start-range inline">
        <span className="start-range-label"><Icon name="eye" size={14} />{t("start.opacity")}</span>
        <RangeStepper name="startOpacity" label={t("start.opacity")} min={OPACITY_MIN} max={OPACITY_MAX} step={OPACITY_STEP} suffix="%" value={start.cardOpacity} onChange={(next) => onChange({ cardOpacity: next })} />
      </div>
    </div>
  );
}

const nameOf = (file) => file.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
const parentOf = (file) => file.split(/[\\/]/).slice(0, -1).join("/");

export function StartScreen({ t, language, themeId, customThemes, start, recent, onStart, onNew, onOpen, onContinue, onOpenRecent, onRemoveRecent, onClearRecent, onTheme, onPreferences, onManager, onSettings, onLanguage, onAbout, onExit }) {
  const en = language === "en";
  const reduced = useReducedMotion();
  const speed = effectiveSpeed(start.speed, reduced);

  /* ------------------------------------------------------- background */

  const canvas = useRef(null);
  // The clock lives outside React: a frame must not depend on a render.
  const motion = useRef({ t: Math.random() * 1000, speed, kind: start.background });
  motion.current.speed = speed;
  motion.current.kind = start.background;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return undefined;
    let frame = 0;
    let last = performance.now();
    let palette = themePalette();
    let width = 0;
    let height = 0;
    const observer = new MutationObserver(() => {
      palette = themePalette();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode"] });
    const onThemeEvent = () => {
      palette = themePalette();
    };
    document.documentElement.addEventListener("mls-theme", onThemeEvent);
    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      const elapsed = now - last;
      if (elapsed < FRAME_MS - 1) return;
      last = now;
      motion.current.t += (Math.min(elapsed, 100) / 1000) * (motion.current.speed / 100);
      if (element.clientWidth !== width || element.clientHeight !== height) {
        width = element.clientWidth;
        height = element.clientHeight;
        element.width = width;
        element.height = height;
      }
      if (width && height) drawBackground(motion.current.kind, element.getContext("2d"), width, height, motion.current.t, palette);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.documentElement.removeEventListener("mls-theme", onThemeEvent);
    };
  }, []);

  useEffect(() => {
    if (!start.shuffle) return undefined;
    const timer = setInterval(() => {
      const index = BACKGROUND_KINDS.indexOf(motion.current.kind);
      onStart({ background: BACKGROUND_KINDS[(index + 1) % BACKGROUND_KINDS.length] });
    }, SHUFFLE_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [start.shuffle, onStart]);

  /* ------------------------------------------------------- card board */

  const board = useRef(null);
  const [drag, setDrag] = useState(null);
  const [measured, setMeasured] = useState({});
  const burst = useRef({ at: 0, n: 0 });
  const saved = useMemo(() => cardsOf(start.layout, START_CARDS, DEFAULT_SPAN, measured), [start.layout, measured]);
  const pending = drag?.target ? place(saved, drag.id, drag.target) : null;
  const shown = pending ?? saved;
  const saveLayout = useCallback((cards) => onStart({ layout: layoutValue(compact(cards)) }), [onStart]);
  const arrange = () => saveLayout(autoArrange(START_CARDS, DEFAULT_SPAN, measured));

  // Fit cards take the height of their content, measured in rows.
  const measure = useCallback(() => {
    const element = board.current;
    if (!element) return;
    const next = {};
    for (const card of element.querySelectorAll(":scope > .start-card.fit")) next[card.dataset.card ?? ""] = rowsFor(card.offsetHeight);
    // Growing always applies; shrinking by a single row does not, so a card whose height
    // depends on where compaction put it cannot flip between two heights.
    const now = performance.now();
    if (now - burst.current.at > 1000) burst.current = { at: now, n: 0 };
    if (burst.current.n > 12) return;
    setMeasured((current) => {
      const changed = Object.keys(next).filter((key) => current[key] === undefined || next[key] > current[key] || current[key] - next[key] > 1);
      if (!changed.length) return current;
      burst.current.n += 1;
      return { ...current, ...Object.fromEntries(changed.map((key) => [key, next[key]])) };
    });
  }, []);
  useLayoutEffect(() => {
    measure();
  });
  useEffect(() => {
    const element = board.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => measure());
    for (const card of element.querySelectorAll(":scope > .start-card")) observer.observe(card);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  // The other cards slide to their new places rather than jumping.
  const rects = useRef(new Map());
  const shownKey = layoutKey(shown);
  useLayoutEffect(() => {
    const element = board.current;
    if (!element) return;
    const now = new Map();
    for (const card of element.querySelectorAll(":scope > .start-card")) {
      const id = card.dataset.card ?? "";
      const rect = card.getBoundingClientRect();
      now.set(id, rect);
      const old = rects.current.get(id);
      if (!old || reduced || card.classList.contains("drag-origin") || !card.animate) continue;
      const dx = old.left - rect.left;
      const dy = old.top - rect.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 180, easing: "ease-out" });
    }
    rects.current = now;
  }, [shownKey, reduced]);

  const columnWidth = () => (board.current.getBoundingClientRect().width - GAP * (COLS - 1)) / COLS;
  const cellAt = (x, y, w) => {
    const rect = board.current.getBoundingClientRect();
    const size = columnWidth();
    return { col: Math.max(0, Math.min(COLS - w, Math.round((x - rect.left) / (size + GAP)))), row: Math.max(0, Math.round((y - rect.top) / ROW)) };
  };
  const autoScroll = (event) => {
    const scroller = board.current?.closest(".start-scroll");
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (event.clientY > rect.bottom - 36) scroller.scrollTop += 14;
    else if (event.clientY < rect.top + 36) scroller.scrollTop -= 14;
  };
  const follow = (move, done) => {
    const up = (event) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      done(event);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const startMove = (event, id) => {
    if (event.button !== 0 || !board.current) return;
    event.preventDefault();
    const element = event.currentTarget.closest(".start-card");
    if (!element) return;
    const ghost = dragGhost(element, event, board.current);
    const cell = saved[id];
    let target = { col: cell.col, row: cell.row };
    setDrag({ id, mode: "move", target });
    follow((moved) => {
      // Scroll first: the ghost is placed against the board, which scrolling moves.
      autoScroll(moved);
      ghost.move(moved);
      const point = ghost.topLeft();
      const next = cellAt(point.x, point.y, cell.w);
      if (next.col !== target.col || next.row !== target.row) {
        target = next;
        setDrag({ id, mode: "move", target });
      }
    }, (ended) => {
      ghost.destroy();
      setDrag(null);
      if (ended.type === "pointerup" && (target.col !== cell.col || target.row !== cell.row)) saveLayout(place(saved, id, target));
    });
  };

  const startResize = (event, id) => {
    if (event.button !== 0 || !board.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    const size = columnWidth();
    const cell = saved[id];
    const startX = event.clientX;
    const startY = event.clientY;
    let target = { w: cell.w, h: cell.h };
    setDrag({ id, mode: "resize", target: null });
    follow((moved) => {
      autoScroll(moved);
      const w = Math.max(1, Math.min(COLS - cell.col, Math.round((rect.width + moved.clientX - startX + GAP) / (size + GAP))));
      const h = Math.max(4, Math.round((rect.height + moved.clientY - startY + GAP) / ROW));
      if (w !== target.w || h !== target.h) {
        target = { w, h };
        setDrag({ id, mode: "resize", target: { ...target, fit: false } });
      }
    }, (ended) => {
      setDrag(null);
      if (ended.type === "pointerup" && (target.w !== cell.w || target.h !== cell.h)) saveLayout(place(saved, id, { ...target, fit: false }));
    });
  };

  const cellStyle = (cell) => ({ gridColumn: `${cell.col + 1} / span ${cell.w}`, gridRow: `${cell.row + 1} / span ${cell.h}` });
  const handle = (id) => (
    <button type="button" className="card-handle" data-card-handle={id} title={t("start.moveCard")} aria-label={t("start.moveCard")} onPointerDown={(event) => startMove(event, id)}>
      <Icon name="drag" size={14} />
    </button>
  );

  const card = (id, icon, title, body, extra = null, bare = false) => {
    const mine = drag?.id === id;
    const cell = mine ? saved[id] : shown[id];
    const classes = ["start-card", `start-card-${id}`, bare ? "bare" : "", cell.fit ? "fit" : "fixed-height", mine && drag.mode === "move" ? "drag-origin" : "", mine && drag.mode === "resize" ? "resizing" : ""].filter(Boolean).join(" ");
    return (
      <section key={id} data-card={id} className={classes} style={{ ...cellStyle(cell), height: cell.fit ? undefined : `${cell.h * ROW - GAP}px` }} aria-label={title || undefined}>
        {bare ? <span className="card-handle-float">{handle(id)}</span> : (
          <h2>
            {handle(id)}
            <Icon name={icon} />
            <span className="start-card-title">{title}</span>
            <span className="grow" />
            {extra}
          </h2>
        )}
        <div className="card-body">{body}</div>
        <span className="card-resize" data-card-resize={id} title={t("start.resizeCard")} onPointerDown={(event) => startResize(event, id)} onDoubleClick={() => saveLayout(place(saved, id, { fit: true }))} />
      </section>
    );
  };

  const dropOutline = drag?.target ? <div key="drop-outline" className="card-drop-outline" aria-hidden="true" style={{ ...cellStyle(shown[drag.id]), height: `${shown[drag.id].h * ROW - GAP}px` }} /> : null;

  /* ------------------------------------------------------------ pickers */

  const themeName = (item) => (en ? item.nameEn : item.nameKo);
  const themeTile = (item, label = themeName(item)) => (
    <button type="button" role="radio" key={item.id} aria-checked={themeId === item.id} className={themeId === item.id ? "bg-tile st-theme-tile on" : "bg-tile st-theme-tile"} data-start-theme={item.id} title={label} onClick={() => onTheme(item.id)}>
      <span className="st-theme-chip" aria-hidden="true" style={{ background: item.swatch[0], borderColor: item.swatch[2] }}>
        <i style={{ background: item.swatch[1] }} />
        <i style={{ background: item.swatch[2] }} />
      </span>
      <span>{label}</span>
    </button>
  );

  const actions = [
    { id: "new", icon: "new", label: t("cmd.new"), tip: t("start.tipNew"), run: onNew },
    { id: "open", icon: "open", label: t("cmd.open"), tip: t("start.tipOpen"), run: onOpen },
    { id: "continue", icon: "design", label: t("start.continue"), tip: t("start.tipContinue"), run: onContinue },
    { id: "manager", icon: "manager", label: t("cmd.manager"), tip: t("start.tipManager"), run: onManager },
    { id: "settings", icon: "project", label: t("cmd.settings"), tip: t("start.tipSettings"), run: onSettings },
    { id: "theme", icon: "theme", label: t("start.themeSettings"), tip: t("start.tipTheme"), run: () => onPreferences("theme") },
    { id: "language", icon: "language", flag: en ? "kr" : "gb", label: en ? "한국어" : "English", tip: t("start.tipLanguage"), run: onLanguage },
    { id: "preferences", icon: "settings", label: t("cmd.preferences"), tip: t("start.tipPreferences"), run: () => onPreferences() },
    { id: "start-settings", icon: "home", label: t("start.settings"), tip: t("start.tipStart"), run: () => onPreferences("start") },
    { id: "about", icon: "about", label: t("cmd.about"), tip: t("start.tipAbout"), run: onAbout },
    { id: "exit", icon: "power", label: t("cmd.exit"), tip: t("start.tipExit"), run: onExit },
  ];

  /* -------------------------------------------------------------- cards */

  const cards = {
    hero: card("hero", "home", "", (
      <>
        <img className="start-icon" src={appIcon} width={76} height={76} alt="" />
        <div className="start-hero-text">
          <h1><span>My LVGL Studio</span><small>v1.0.0</small></h1>
          <p>{t("about.text")}</p>
        </div>
        <div className="start-hero-actions">
          <button type="button" className="start-btn primary" data-start="hero-new" onClick={onNew}><Icon name="new" /><span>{t("cmd.new")}</span></button>
          <button type="button" className="start-btn" data-start="hero-open" onClick={onOpen}><Icon name="open" /><span>{t("cmd.open")}</span></button>
        </div>
      </>
    ), null, true),

    actions: card("actions", "grid", t("start.actions"), (
      <div className="start-actions">
        {actions.map((action) => (
          <button type="button" key={action.id} className="start-tile" data-start={action.id} title={action.tip} onClick={action.run}>
            {action.flag ? <Flag country={action.flag} /> : <Icon name={action.icon} size={20} />}
            <b>{action.label}</b>
            <small>{action.tip}</small>
          </button>
        ))}
      </div>
    )),

    recent: card("recent", "clock", t("start.recent"), (
      <div className="start-list">
        {recent.length === 0 && <div className="start-empty"><Icon name="about" size={14} /><span>{t("start.noRecent")}</span></div>}
        {recent.map((file) => (
          <div className="start-row" key={file}>
            <button type="button" className="start-link" data-recent={file} title={file} onClick={() => onOpenRecent(file)}>
              <Icon name="screen" />
              <span className="name">{nameOf(file)}</span>
              <span className="path">{parentOf(file)}</span>
            </button>
            <button type="button" className="icon-button" data-recent-remove={file} title={t("start.removeRecent")} aria-label={t("start.removeRecent")} onClick={() => onRemoveRecent(file)}><Icon name="delete" size={14} /></button>
          </div>
        ))}
      </div>
    ), recent.length ? <button type="button" className="start-btn small" data-start="clear-recent" onClick={onClearRecent}><Icon name="delete" size={14} /><span>{t("start.clearRecent")}</span></button> : null),

    theme: card("theme", "theme", t("cmd.theme"), (
      <div className="st-theme-groups">
        <div className="st-theme-custom-row">
          {customThemes.map((item) => themeTile(themeById(item.id), item.name))}
          <button type="button" className="start-btn" data-start="theme-settings" onClick={() => onPreferences("theme")}><Icon name="settings" /><span>{t("start.themeSettings")}</span></button>
        </div>
        <div className="st-theme-columns">
          {["dark", "light"].map((mode) => (
            <section key={mode} className="st-theme-group" data-theme-kind={mode}>
              <h3><Icon name={mode === "light" ? "sun" : "moon"} size={14} /><span>{t(`theme.${mode}`)}</span></h3>
              <div className="bg-grid st-theme-tiles">{THEMES.filter((item) => item.mode === mode).map((item) => themeTile(item))}</div>
            </section>
          ))}
        </div>
      </div>
    ), <span className="start-card-note">{themeName(themeById(themeId))}</span>),

    background: card("background", "image", t("start.background"), (
      <>
        <BackgroundGrid t={t} value={start.background} themeId={themeId} onChange={(background) => onStart({ background })} shuffle={{ on: start.shuffle, onToggle: () => onStart({ shuffle: !start.shuffle }) }} />
        <StartRanges t={t} start={start} speed={speed} onChange={onStart} />
      </>
    )),
  };

  return (
    <div className="start-page" data-start-screen="" style={{ "--start-card-alpha": `${start.cardOpacity}%` }}>
      <canvas ref={canvas} className="start-bg" data-start-canvas="" aria-hidden="true" />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            <label className="start-btn start-startup" title={t("start.showOnStartup")}>
              <input type="checkbox" data-field="startShow" checked={start.showOnStartup} onChange={(event) => onStart({ showOnStartup: event.target.checked })} />
              <span>{t("start.showOnStartup")}</span>
            </label>
            <button type="button" className="start-btn" data-start="tools-settings" onClick={() => onPreferences("start")}><Icon name="settings" /><span>{t("start.settings")}</span></button>
            <button type="button" className="start-btn" data-start="arrange" title={t("start.arrangeTip")} onClick={arrange}><Icon name="grid" /><span>{t("start.arrange")}</span></button>
          </div>
          <div className="start-board" ref={board}>
            {START_CARDS.map((id) => cards[id])}
            {dropOutline}
          </div>
          <footer className="start-foot">
            <Icon name="about" size={14} />
            <span className="grow">My LVGL Studio V1.0.0</span>
            <span className="muted">© SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
