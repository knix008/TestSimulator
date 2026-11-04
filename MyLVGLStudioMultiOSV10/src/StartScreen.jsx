// The start screen: a moving background behind cards the user can rearrange.
import { useEffect, useRef, useState } from "react";
import appIcon from "../assets/icons/128x128.png";
import { Icon } from "./icons.jsx";
import { Stepper, Toggle } from "./controls.jsx";
import { allThemes } from "./themes.js";
import { BACKGROUND_KINDS, drawBackground, themePalette } from "./start/backgrounds.js";
import { OPACITY_MAX, OPACITY_MIN, OPACITY_STEP, SHUFFLE_SECONDS, SPEED_MAX, SPEED_MIN, SPEED_STEP, effectiveSpeed } from "./settings.js";

const FRAME_MS = 1000 / 30;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** A still of one background, for the pickers. */
export function BackgroundThumb({ kind, themeId }) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    drawBackground(kind, element.getContext("2d"), element.width, element.height, 12.5, themePalette());
  }, [kind, themeId]);
  return <canvas ref={canvas} width={112} height={70} />;
}

export function BackgroundGrid({ t, value, themeId, onChange }) {
  return (
    <div className="background-grid">
      {BACKGROUND_KINDS.map((kind) => (
        <button type="button" key={kind} data-background={kind} className={kind === value ? "background-tile selected" : "background-tile"} title={t(`bg.${kind}`)} aria-pressed={kind === value} onClick={() => onChange(kind)}>
          <BackgroundThumb kind={kind} themeId={themeId} />
          <span>{t(`bg.${kind}`)}</span>
        </button>
      ))}
    </div>
  );
}

/** The controls shared by the start screen's card and the settings window. */
export function StartOptions({ t, start, onChange }) {
  return (
    <div className="form-grid start-options">
      <span>{t("start.speed")}</span>
      <Stepper id="startSpeed" value={effectiveSpeed(start.speed, reducedMotion())} min={SPEED_MIN} max={SPEED_MAX} step={SPEED_STEP} onChange={(speed) => onChange({ speed })} />
      <span>{t("start.opacity")}</span>
      <Stepper id="startOpacity" value={start.cardOpacity} min={OPACITY_MIN} max={OPACITY_MAX} step={OPACITY_STEP} onChange={(cardOpacity) => onChange({ cardOpacity })} />
      <span>{t("start.shuffle", { seconds: SHUFFLE_SECONDS })}</span>
      <Toggle id="startShuffle" checked={start.shuffle} onChange={(shuffle) => onChange({ shuffle })} />
      <span>{t("start.showOnStartup")}</span>
      <Toggle id="startShow" checked={start.showOnStartup} onChange={(showOnStartup) => onChange({ showOnStartup })} />
    </div>
  );
}

const nameOf = (file) => file.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");

export function StartScreen({ t, language, themeId, start, recent, onStart, onNew, onOpen, onContinue, onOpenRecent, onRemoveRecent, onTheme, onPreferences }) {
  const canvas = useRef(null);
  const board = useRef(null);
  const [dragging, setDragging] = useState(null);
  const speed = effectiveSpeed(start.speed, reducedMotion());

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
    const onTheme = () => {
      palette = themePalette();
    };
    document.documentElement.addEventListener("mls-theme", onTheme);
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
      document.documentElement.removeEventListener("mls-theme", onTheme);
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

  /** Dragging a card's header moves it to the place of the card under the pointer. */
  const beginCardDrag = (id) => (event) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
    event.preventDefault();
    setDragging(id);
    const up = (done) => {
      window.removeEventListener("pointerup", up);
      setDragging(null);
      const under = document.elementFromPoint(done.clientX, done.clientY)?.closest("[data-card]")?.dataset.card;
      if (!under || under === id) return;
      const order = [...start.order];
      const from = order.indexOf(id);
      const to = order.indexOf(under);
      order.splice(from, 1);
      order.splice(to, 0, id);
      onStart({ order });
    };
    window.addEventListener("pointerup", up);
  };

  const CARDS = {
    hero: {
      title: null,
      body: (
        <div className="start-hero">
          <img src={appIcon} alt="" />
          <div>
            <h1>My LVGL Studio</h1>
            <p>{t("about.text")}</p>
          </div>
        </div>
      ),
    },
    actions: {
      title: t("start.actions"),
      body: (
        <div className="start-actions">
          <button type="button" data-start="new" onClick={onNew}><Icon name="new" size={22} /><span>{t("cmd.new")}</span></button>
          <button type="button" data-start="open" onClick={onOpen}><Icon name="open" size={22} /><span>{t("cmd.open")}</span></button>
          <button type="button" data-start="continue" onClick={onContinue}><Icon name="design" size={22} /><span>{t("start.continue")}</span></button>
          <button type="button" data-start="preferences" onClick={onPreferences}><Icon name="settings" size={22} /><span>{t("cmd.preferences")}</span></button>
        </div>
      ),
    },
    recent: {
      title: t("start.recent"),
      body: recent.length ? (
        <div className="start-recent">
          {recent.map((file) => (
            <div className="start-recent-row" key={file}>
              <button type="button" data-recent={file} title={file} onClick={() => onOpenRecent(file)}>
                <Icon name="screen" />
                <span className="recent-name">{nameOf(file)}</span>
                <span className="recent-path">{file}</span>
              </button>
              <button type="button" className="mini" data-recent-remove={file} title={t("start.removeRecent")} aria-label={t("start.removeRecent")} onClick={() => onRemoveRecent(file)}><Icon name="close" size={12} /></button>
            </div>
          ))}
        </div>
      ) : <p className="start-empty">{t("start.noRecent")}</p>,
    },
    theme: {
      title: t("cmd.theme"),
      body: (
        <div className="start-themes">
          {allThemes().map((item) => (
            <button type="button" key={item.id} data-start-theme={item.id} className={item.id === themeId ? "selected" : undefined} title={language === "en" ? item.nameEn : item.nameKo} aria-pressed={item.id === themeId} onClick={() => onTheme(item.id)}>
              <span className="swatches">{item.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
            </button>
          ))}
        </div>
      ),
    },
    background: {
      title: t("start.background"),
      body: <BackgroundGrid t={t} value={start.background} themeId={themeId} onChange={(background) => onStart({ background })} />,
    },
    options: { title: t("start.options"), body: <StartOptions t={t} start={start} onChange={onStart} /> },
  };

  return (
    <div className="start-screen" data-start-screen="" ref={board} style={{ "--card-opacity": `${start.cardOpacity}%` }}>
      <canvas ref={canvas} className="start-canvas" data-start-canvas="" />
      <div className="start-board">
        {start.order.map((id) => (
          <section key={id} data-card={id} className={`start-card card-${id}${dragging === id ? " dragging" : ""}`} onPointerDown={CARDS[id].title ? undefined : beginCardDrag(id)}>
            {CARDS[id].title && <h3 data-card-head={id} onPointerDown={beginCardDrag(id)}>{CARDS[id].title}</h3>}
            {CARDS[id].body}
          </section>
        ))}
      </div>
    </div>
  );
}
