// The separate run window: its own LVGL engine running the project sent by the main window.
// It has the app's title bar, a red stop button, and passes log lines back.
import { useCallback, useEffect, useRef, useState } from "react";
import appIcon from "../assets/icons/32x32.png";
import { Icon } from "./icons.jsx";
import { host } from "./host.js";
import { translator } from "./i18n.js";
import { addImage, clearImages, decodeImage, extensionOf } from "./lvgl/images.js";
import { loadEngine } from "./lvgl/engine.js";
import { engineFor } from "./lvgl/versions.js";

export function RunWindow({ language }) {
  const t = translator(language);
  const canvas = useRef(null);
  const engineRef = useRef(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState(null);
  const [size, setSize] = useState({ w: 320, h: 240 });

  const start = useCallback(async () => {
    const payload = await host.runPayload();
    const { project, images } = payload;
    setTitle(`${project.name} - LVGL ${project.lvgl}`);
    setSize({ w: project.device.w, h: project.device.h });
    clearImages();
    for (const image of images) {
      addImage(image.name, { ...(await decodeImage(image.base64, extensionOf(image.file))), base64: image.base64 });
    }
    const engine = await loadEngine(engineFor(project.lvgl).engine);
    engine.width = 0;
    engine.load(project, project.screens[0].id, { events: true });
    engineRef.current = engine;
  }, []);

  useEffect(() => {
    start().catch((failure) => setError(String(failure?.message ?? failure))).finally(() => void host.ready());
    return host.on("run-reload", () => {
      start().catch((failure) => setError(String(failure?.message ?? failure)));
    });
  }, [start]);

  // The LVGL clock: timers, animations, input, and painting what changed.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let image = null;
    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      const engine = engineRef.current;
      const element = canvas.current;
      if (!engine || !element) return;
      const elapsed = Math.min(100, Math.max(1, Math.round(now - last)));
      last = now;
      const changed = engine.tick(elapsed);
      if (element.width !== engine.width || element.height !== engine.height) {
        element.width = engine.width;
        element.height = engine.height;
        image = null;
      }
      if (changed || !image) {
        const context = element.getContext("2d");
        image ??= context.createImageData(engine.width, engine.height);
        engine.frameRGBA(image.data);
        context.putImageData(image, 0, 0);
      }
      for (const line of engine.drainLog()) void host.emit("run-log", line);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const pointer = (down) => (event) => {
    const engine = engineRef.current;
    if (!engine) return;
    const rect = canvas.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * engine.width;
    const y = ((event.clientY - rect.top) / rect.height) * engine.height;
    const pressed = down === null ? (event.buttons & 1) === 1 : down;
    if (down !== null) event.currentTarget.setPointerCapture?.(event.pointerId);
    engine.pointer(Math.max(0, Math.min(engine.width - 1, x)), Math.max(0, Math.min(engine.height - 1, y)), pressed);
  };

  /** Read-only hook for the GUI test (test/gui.mjs). */
  useEffect(() => {
    window.__mlsRun = {
      ready: () => !!engineRef.current,
      engine: () => engineRef.current,
      canvas: () => canvas.current,
    };
  });

  const drag = (event) => {
    if (event.button === 0 && !(event.target instanceof Element && event.target.closest("button"))) host.startDrag();
  };

  return (
    <div className="run-window" data-run-window="" onContextMenu={(event) => event.preventDefault()}>
      <div className="menubar run-title" onPointerDown={drag}>
        <span className="app-title">
          <img src={appIcon} alt="" />
          <strong data-run-title="">{t("run.title")}</strong>
          <span className="app-version">{title}</span>
        </span>
        <div className="window-controls">
          <button type="button" className="run-stop" data-command="run-stop" aria-label={t("cmd.stop")} title={t("cmd.stop")} onClick={host.close}><Icon name="stop" /></button>
          <button type="button" aria-label={t("cmd.minimize")} title={t("cmd.minimize")} onClick={host.minimize}><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></button>
          <button type="button" className="close" aria-label={t("cmd.close")} title={t("cmd.close")} onClick={host.close}><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg></button>
        </div>
      </div>
      <div className="run-stage">
        {error ? <p className="form-note">{error}</p> : (
          <canvas
            ref={canvas}
            data-run-canvas=""
            style={{ aspectRatio: `${size.w} / ${size.h}` }}
            onPointerDown={pointer(true)}
            onPointerMove={pointer(null)}
            onPointerUp={pointer(false)}
            onPointerCancel={pointer(false)}
          />
        )}
      </div>
    </div>
  );
}
