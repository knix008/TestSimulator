// The start page's sample thumbnails, drawn off the main thread so the app
// never freezes while they are made (src/ui/start.js). One job at a time:
//   → { id, text, w, h, want3d }        the sample's file text and the card size
//   ← { id, plan: Blob }                 the floor plan, at once
//   ← { id, img3d: Blob }                the 3D picture (when want3d)
//   ← { id, done: true } | { id, error }
//   ← { ready: true, webgl: bool }       once, at start: false → the page draws them itself
// and the furniture library's pictures of registered items (src/ui/thumbclient.js):
//   → { id, type: "items", items, models, w, h }   ← { id, img: Blob } | { id, error }
import * as THREE from "../vendor/three/three.module.js";
import { parseProject } from "../core/project.js";
import { PLAN_THEMES, drawPlan, planBounds } from "../plan/render.js";
import { createProjectThumbRenderer } from "./projthumb.js";
import { createThumbRenderer } from "./thumbs.js";

let webgl = false;
try { webgl = typeof OffscreenCanvas !== "undefined" && !!new OffscreenCanvas(4, 4).getContext("webgl2"); } catch { webgl = false; }
self.postMessage({ ready: true, webgl });

let r3 = null;
let size = "";
let rItems = null;
let itemSize = "";

async function planImage(p, w, h) {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f6f5f0";
  ctx.fillRect(0, 0, w, h);
  const level = p.levels[0] && p.levels[0].id;
  const b = level ? planBounds(p, level) : null;
  if (b) {
    const pad = 800;
    const s = Math.min(w / (b.x2 - b.x1 + pad * 2), h / (b.y2 - b.y1 + pad * 2));
    ctx.setTransform(s, 0, 0, s, w / 2 - ((b.x1 + b.x2) / 2) * s, h / 2 - ((b.y1 + b.y2) / 2) * s);
    drawPlan(ctx, p, { ...PLAN_THEMES.light, bg: "#f6f5f0" }, { level, lw: 1 / s, px: 1 / s, print: true, show: { dims: false, tags: false, roofs: false, ghost: false } });
  }
  return c.convertToBlob({ type: "image/webp", quality: 0.9 });
}

const jobs = [];
let running = false;
self.onmessage = (e) => { jobs.push(e.data); if (!running) run(); };

async function run() {
  running = true;
  while (jobs.length) {
    const job = jobs.shift();
    if (job.type === "items") {
      try {
        const { w = 160, h = 128 } = job;
        if (!webgl) throw new Error("no WebGL in the worker");
        if (!rItems || itemSize !== `${w}x${h}`) { if (rItems) rItems.dispose(); rItems = createThumbRenderer(THREE, { width: w, height: h, canvas: new OffscreenCanvas(w, h) }); itemSize = `${w}x${h}`; }
        self.postMessage({ id: job.id, img: await rItems.render(job.items || [], job.models || []) });
      } catch (err) {
        self.postMessage({ id: job.id, error: String((err && err.message) || err) });
      }
      continue;
    }
    const { id, text, w = 460, h = 260, want3d } = job;
    try {
      const p = parseProject(text);
      self.postMessage({ id, plan: await planImage(p, w, h) });
      if (want3d && webgl) {
        if (!r3 || size !== `${w}x${h}`) { if (r3) r3.dispose(); r3 = createProjectThumbRenderer(THREE, { width: w, height: h }); size = `${w}x${h}`; }
        self.postMessage({ id, img3d: await r3.render(p) });
      }
      self.postMessage({ id, done: true });
    } catch (err) {
      self.postMessage({ id, error: String((err && err.message) || err) });
    }
  }
  running = false;
}
