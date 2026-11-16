// Renders catalogue items (src/lib/furniture.js) with the app's own 3D
// builder (src/view3d/thumbs.js): the library thumbnails
// (scripts/render-furniture.mjs) and review sheets. Query: ?kinds=a,b,c
// (default: all) &w=160&h=128 &dir=x,y,z (camera direction, world frame)
// &bg=transparent|#rrggbb
import * as THREE from "../../src/vendor/three/three.module.js";
import { createThumbRenderer } from "../../src/view3d/thumbs.js";
import { allFurniture, furnitureDef, makeFurniture } from "../../src/lib/furniture.js";

const qs = new URLSearchParams(location.search);
const W = +qs.get("w") || 160, H = +qs.get("h") || 128;
const kinds = qs.get("kinds") ? qs.get("kinds").split(",").filter(Boolean) : allFurniture().map((d) => d.kind);
const dir = (qs.get("dir") || "0.62,0.5,1").split(",").map(Number);
const bg = qs.get("bg") || "transparent";

async function run() {
  const r = createThumbRenderer(THREE, { width: W, height: H, dir, background: bg === "transparent" ? null : bg });
  document.body.append(r.canvas);
  const out = {};
  for (const kind of kinds) {
    if (!furnitureDef(kind)) continue;
    out[kind] = await r.render([{ ...makeFurniture(kind, 0, 0), elevation: 0 }]);
  }
  window.__renders = { ok: true, items: out, w: W, h: H };
}
run().catch((e) => { window.__renders = { ok: false, error: String((e && e.stack) || e) }; });
