// The design surface: a canvas drawn by the LVGL engine, with the editing overlay on top.
// In design mode the pointer edits the document; in run mode it goes to LVGL.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { engineFor } from "./lvgl/versions.js";
import { loadEngine } from "./lvgl/engine.js";
import { CONTAINERS } from "./lvgl/schema.js";
import { findNode, findParent, isInside, moveNode, setProp } from "./lvgl/project.js";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 4;

/** Every node of a screen, back to front. */
function flatten(screen) {
  const list = [];
  const step = (node) => {
    list.push(node);
    node.children.forEach(step);
  };
  step(screen);
  return list;
}

export const Surface = forwardRef(function Surface({ store, activeId, selected, onSelect, mode, zoom, onLog, onMeta, onError }, ref) {
  const project = store.project;
  const canvas = useRef(null);
  const engineRef = useRef(null);
  const imageRef = useRef(null);
  const drag = useRef(null);
  const [engineReady, setEngineReady] = useState(null);
  const [boxes, setBoxes] = useState(new Map());
  const { engine: engineVersion } = engineFor(project.lvgl);
  const screen = useMemo(() => project.screens.find((item) => item.id === activeId) ?? project.screens[0], [project, activeId]);
  const running = mode === "run";

  const paint = useCallback(() => {
    const engine = engineRef.current;
    const element = canvas.current;
    if (!engine || !element || !engine.width) return;
    if (element.width !== engine.width || element.height !== engine.height) {
      element.width = engine.width;
      element.height = engine.height;
      imageRef.current = null;
    }
    const context = element.getContext("2d");
    if (!imageRef.current) imageRef.current = context.createImageData(engine.width, engine.height);
    engine.frameRGBA(imageRef.current.data);
    context.putImageData(imageRef.current, 0, 0);
  }, []);

  useEffect(() => {
    let alive = true;
    setEngineReady(null);
    loadEngine(engineVersion).then(
      (engine) => {
        if (!alive) return;
        // A shared engine may have been left at another size; force a clean set-up.
        engine.width = 0;
        engineRef.current = engine;
        setEngineReady(engine);
      },
      (error) => onError?.(String(error)),
    );
    return () => {
      alive = false;
    };
  }, [engineVersion, onError]);

  // Design mode redraws with every change; a run starts from the document and then is LVGL's.
  const runProject = useRef(null);
  useEffect(() => {
    const engine = engineReady;
    if (!engine) return;
    if (running) {
      if (runProject.current) return;
      runProject.current = project;
    } else {
      runProject.current = null;
    }
    engine.load(project, screen.id, { events: running });
    if (engine.errors.length) onError?.(`engine rejected ${engine.errors.length} operation(s)`);
    paint();
    const next = new Map();
    for (const node of flatten(screen)) {
      const box = engine.coords(node.id);
      if (box) next.set(node.id, box);
    }
    setBoxes(next);
    onMeta?.({ runtime: engine.runtimeVersion() });
  }, [engineReady, project, screen, running, paint, onError, onMeta]);

  // The LVGL clock: timers, animations, input.
  useEffect(() => {
    const engine = engineReady;
    if (!engine) return undefined;
    let frame = 0;
    let last = performance.now();
    const loop = (now) => {
      const elapsed = Math.min(100, Math.max(1, Math.round(now - last)));
      last = now;
      if (engine.tick(elapsed)) paint();
      if (running) for (const line of engine.drainLog()) onLog?.(line);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engineReady, running, paint, onLog]);

  /** Display coordinates of a mouse position. */
  const toDisplay = useCallback((clientX, clientY) => {
    const rect = canvas.current.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }, [zoom]);

  // A drag outlives the render it started in, so it reads the latest boxes through these.
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const screenRef = useRef(screen);
  screenRef.current = screen;

  /** The frontmost widget under a point; `filter` narrows the search. */
  const hit = useCallback((x, y, filter = () => true) => {
    const list = flatten(screenRef.current);
    for (let i = list.length - 1; i >= 0; i--) {
      const node = list[i];
      const box = boxesRef.current.get(node.id);
      if (!box || node.props.hidden || !filter(node)) continue;
      if (x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h) return node;
    }
    return null;
  }, []);

  useImperativeHandle(ref, () => ({
    /** Where a palette drag ending at this point should put a new widget, or null if outside. */
    dropTarget(clientX, clientY) {
      if (!canvas.current || running) return null;
      const { x, y } = toDisplay(clientX, clientY);
      const engine = engineRef.current;
      if (!engine || x < 0 || y < 0 || x >= engine.width || y >= engine.height) return null;
      const parent = hit(x, y, (node) => CONTAINERS.has(node.type)) ?? screen;
      const origin = engine.contentOrigin(parent.id);
      return { parentId: parent.id, x: Math.round(x - origin.x), y: Math.round(y - origin.y) };
    },
    center() {
      const engine = engineRef.current;
      return engine ? { x: Math.round(engine.width / 2), y: Math.round(engine.height / 2) } : { x: 0, y: 0 };
    },
    engine: () => engineRef.current,
    boxes: () => boxes,
    canvas: () => canvas.current,
  }), [boxes, hit, running, screen, toDisplay]);

  const beginMove = (event, node, handle) => {
    const box = boxes.get(node.id);
    const start = toDisplay(event.clientX, event.clientY);
    drag.current = {
      id: node.id,
      handle,
      start,
      box,
      x: Number(node.props.x) || 0,
      y: Number(node.props.y) || 0,
      moved: false,
    };
    store.beginGesture();
    // On the window: the widget under the pointer moves and redraws while it is dragged.
    const finish = (up) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      onPointerUp(up);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const { x, y } = toDisplay(event.clientX, event.clientY);
    const node = hit(x, y);
    if (!node) {
      onSelect(screen.id);
      return;
    }
    onSelect(node.id);
    if (node.type !== "screen") beginMove(event, node, null);
  };

  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state) return;
    const { x, y } = toDisplay(event.clientX, event.clientY);
    const dx = Math.round(x - state.start.x);
    const dy = Math.round(y - state.start.y);
    if (!state.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    state.moved = true;
    store.update((draft) => {
      const node = findNode(draft, state.id);
      if (!node) return false;
      if (!state.handle) {
        setProp(node, "x", state.x + dx);
        setProp(node, "y", state.y + dy);
        return undefined;
      }
      const h = state.handle;
      if (h.includes("e")) node.props.width = Math.max(MIN_SIZE, state.box.w + dx);
      if (h.includes("s")) node.props.height = Math.max(MIN_SIZE, state.box.h + dy);
      if (h.includes("w")) {
        const width = Math.max(MIN_SIZE, state.box.w - dx);
        node.props.width = width;
        setProp(node, "x", state.x + (state.box.w - width));
      }
      if (h.includes("n")) {
        const height = Math.max(MIN_SIZE, state.box.h - dy);
        node.props.height = height;
        setProp(node, "y", state.y + (state.box.h - height));
      }
      return undefined;
    });
  };

  const onPointerUp = (event) => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (state.moved && !state.handle) {
      // Dropped on another container: it becomes the parent, the widget stays where it is.
      const { x, y } = toDisplay(event.clientX, event.clientY);
      const current = store.get();
      const target = hit(x, y, (node) => CONTAINERS.has(node.type) && !isInside(current, node.id, state.id));
      const parent = findParent(current, state.id);
      const box = boxesRef.current.get(state.id);
      if (target && parent && target.id !== parent.id && box && engineRef.current) {
        const origin = engineRef.current.contentOrigin(target.id);
        store.update((draft) => {
          if (!moveNode(draft, state.id, target.id)) return false;
          const node = findNode(draft, state.id);
          node.props.x = box.x - origin.x;
          node.props.y = box.y - origin.y;
          return undefined;
        });
      }
    }
    store.endGesture();
  };

  // Run mode: the pointer belongs to LVGL.
  const forward = (down) => (event) => {
    const engine = engineRef.current;
    if (!engine) return;
    const { x, y } = toDisplay(event.clientX, event.clientY);
    if (down !== null) event.currentTarget.setPointerCapture?.(event.pointerId);
    const pressed = down === null ? (event.buttons & 1) === 1 : down;
    engine.pointer(Math.max(0, Math.min(engine.width - 1, x)), Math.max(0, Math.min(engine.height - 1, y)), pressed);
  };

  const box = selected ? boxes.get(selected) : null;
  const selectedNode = selected ? findNode(project, selected) : null;
  const width = project.device.w * zoom;
  const height = project.device.h * zoom;

  return (
    <div className={running ? "device running" : "device"} style={{ width: width + 16, height: height + 16 }}>
      <div className="device-screen" style={{ width, height }}>
        <canvas ref={canvas} data-surface="" style={{ width, height, imageRendering: zoom > 1 ? "pixelated" : "auto" }} />
        {running ? (
          <div
            className="overlay run"
            data-overlay="run"
            onPointerDown={forward(true)}
            onPointerMove={forward(null)}
            onPointerUp={forward(false)}
            onPointerCancel={forward(false)}
          />
        ) : (
          <div
            className="overlay"
            data-overlay="design"
            onPointerDown={onPointerDown}
          >
            {box && selectedNode && (
              <div className="selection" data-selection={selected} style={{ left: box.x * zoom, top: box.y * zoom, width: box.w * zoom, height: box.h * zoom }}>
                {selectedNode.type !== "screen" && HANDLES.map((handle) => (
                  <i
                    key={handle}
                    className={`handle ${handle}`}
                    data-handle={handle}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      if (event.button === 0) beginMove(event, selectedNode, handle);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
