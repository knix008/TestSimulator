"use strict";

const fs = require("fs");
const path = require("path");
const { encodePng } = require("./png-rgba");
const { ensureIco } = require("./ensure-ico");

function clamp(v, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function sdfRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

function sdfCapsule(px, py, x1, y1, x2, y2, r) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const t = clamp(((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy));
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t)) - r;
}

function makeIcon(size = 512) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size * 0.5;
  const cy = size * 0.48;
  const hw = size * 0.33;
  const hh = size * 0.33;
  const rad = size * 0.12;
  const aa = 1.15;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = sdfRoundRect(x, y, cx, cy, hw, hh, rad);
      const ds = sdfRoundRect(x, y, cx + size * 0.012, cy + size * 0.038, hw * 0.98, hh * 0.98, rad);
      let a = 0;
      let r = 0;
      let g = 0;
      let b = 0;

      const shadow = 1 - clamp(ds / (size * 0.045));
      if (shadow > 0 && d > 0) {
        a = Math.round(shadow * 70);
        r = 4;
        g = 10;
        b = 22;
      }

      const cover = 1 - clamp(d / aa);
      if (cover > 0) {
        const nx = clamp((x - (cx - hw * 0.55)) / (hw * 1.6));
        const ny = clamp((y - (cy - hh * 0.55)) / (hh * 1.6));
        const light = clamp(1.15 - nx * 0.35 - ny * 0.45);
        const rim = 1 - clamp((-d) / (size * 0.034));
        const face = 1 - rim;
          const metalR = mix(28, 168, light);
          const metalG = mix(36, 184, light);
          const metalB = mix(48, 204, light);
          r = mix(18, metalR, rim);
          g = mix(28, metalG, rim);
          b = mix(40, metalB, rim);

          const inset = sdfRoundRect(x, y, cx, cy - size * 0.02, hw * 0.78, hh * 0.62, rad * 0.55);
          if (inset < 0) {
            const glow = clamp(0.2 + (1 - ny) * 0.55);
            r = mix(2, 10, glow);
            g = mix(28, 72, glow);
            b = mix(42, 88, glow);
            const spec = Math.exp(-((x - (cx - hw * 0.42)) ** 2 + (y - (cy - hh * 0.42)) ** 2) / (size * 18) ** 2);
            r = mix(r, 230, spec * 0.55);
            g = mix(g, 255, spec * 0.7);
            b = mix(b, 255, spec * 0.75);

            const pts = [
              [cx - hw * 0.58, cy - hh * 0.08],
              [cx - hw * 0.4, cy - hh * 0.3],
              [cx - hw * 0.22, cy - hh * 0.04],
              [cx - hw * 0.04, cy - hh * 0.26],
              [cx + hw * 0.16, cy + hh * 0.02],
              [cx + hw * 0.36, cy - hh * 0.2],
              [cx + hw * 0.58, cy - hh * 0.06]
            ];
            let line = 0;
            for (let i = 0; i < pts.length - 1; i++) {
              line = Math.max(
                line,
                1 - clamp(sdfCapsule(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], size * 0.012) / aa)
              );
            }

            const baseY = cy + hh * 0.12;
            const base = 1 - clamp(sdfCapsule(x, y, cx - hw * 0.56, baseY, cx + hw * 0.56, baseY, size * 0.004) / aa);

            const barBottom = cy + hh * 0.48;
            const barW = hw * 0.11;
            const bars = [
              [cx - hw * 0.3, hh * 0.28],
              [cx, hh * 0.42],
              [cx + hw * 0.3, hh * 0.34]
            ];
            let barA = 0;
            for (const [bx, barH] of bars) {
              const barCy = barBottom - barH / 2;
              barA = Math.max(barA, 1 - clamp(sdfRoundRect(x, y, bx, barCy, barW, barH / 2, size * 0.012) / aa));
            }

            const glyph = Math.max(line, barA, base * 0.4);
            if (glyph > 0) {
              r = mix(r, 48, glyph);
              g = mix(g, 246, glyph);
              b = mix(b, 222, glyph);
            }
          }

        const corner = Math.exp(-((x - (cx - hw * 0.62)) ** 2 + (y - (cy - hh * 0.62)) ** 2) / (size * 0.05) ** 2);
        r = mix(r, 255, corner * 0.85 * face);
        g = mix(g, 255, corner * 0.9 * face);
        b = mix(b, 255, corner * 0.95 * face);

        a = Math.max(a, Math.round(cover * 255));
      }

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = a;
    }
  }
  return rgba;
}

function writeIcon(destPng) {
  const size = 512;
  const png = encodePng(size, size, makeIcon(size));
  fs.writeFileSync(destPng, png);
  return destPng;
}

if (require.main === module) {
  const dest = path.join(__dirname, "..", "app", "assets", "icon.png");
  writeIcon(dest);
  const ico = path.join(__dirname, "..", "app", "assets", "icon.ico");
  if (fs.existsSync(ico)) fs.unlinkSync(ico);
  ensureIco(dest, ico);
  console.log(`[make-icon] ${path.relative(path.join(__dirname, ".."), dest)}`);
}

module.exports = { writeIcon, makeIcon };
