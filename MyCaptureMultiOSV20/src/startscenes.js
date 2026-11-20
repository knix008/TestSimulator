// Twenty general moving backgrounds for the start screen, the same set as MyUMLMaker's
// (src/ui/background.js there): aurora, waves, particles, constellation, bubbles, a
// flowing grid, a drifting flowchart, a star field, rain, snow, fireflies, ripples, code
// rain, hexagons, orbits, a lava lamp, a spiral galaxy, confetti, a node network and
// ribbons. MyCapture's own four capture scenes are in startbg.js. Colours are RGB arrays
// from the theme ({ accent, text, rec, dark }); each scene gets its seeded items.

export const GENERAL_SCENES = [
  'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'flowchart', 'starfield', 'rain', 'snow',
  'fireflies', 'ripples', 'coderain', 'hexagons', 'orbits', 'lava', 'spiral', 'confetti', 'nodes', 'ribbons',
];

const COUNTS = {
  particles: 90, constellation: 70, bubbles: 40, flowchart: 30, starfield: 220, rain: 140, snow: 120, fireflies: 45,
  ripples: 7, coderain: 34, orbits: 8, lava: 7, spiral: 160, confetti: 80, nodes: 28,
};

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** The scene's own random items (positions, sizes, speeds), the same every time. */
export function sceneItems(kind) {
  const r = seeded(kind.length * 9973 + 7);
  return Array.from({ length: COUNTS[kind] ?? 0 }, () => ({ x: r(), y: r(), z: r(), s: r(), v: r(), h: r() }));
}

/**
 * Draws `kind` at `time`. `boost` lifts the alphas (the start page shows them vividly,
 * light themes need more), `size` the dots.
 */
export function drawGeneralScene(kind, c, w, h, time, colors, items, { boost = 1, size = 1 } = {}) {
  const rgba = (rgb, a) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${Math.max(0, Math.min(1, a * boost))})`;
  const SIZE = size;
  const accent2 = colors.rec ?? colors.accent;
  const danger = colors.rec ?? colors.accent;
  const scenes = {
    aurora() {
      const hues = [colors.accent, accent2, colors.text];
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      for (let i = 0; i < 5; i++) {
        const x = w * (0.5 + 0.42 * Math.sin(time * 0.17 + i * 1.7));
        const y = h * (0.45 + 0.38 * Math.cos(time * 0.13 + i * 2.3));
        const r = Math.max(w, h) * (0.32 + 0.08 * Math.sin(time * 0.3 + i));
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(hues[i % hues.length], colors.dark ? 0.32 : 0.22));
        g.addColorStop(1, rgba(hues[i % hues.length], 0));
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }
      c.globalCompositeOperation = 'source-over';
    },
    waves() {
      for (let layer = 0; layer < 5; layer++) {
        c.beginPath();
        const base = h * (0.45 + layer * 0.1);
        const amp = h * (0.05 + layer * 0.012);
        c.moveTo(0, h);
        for (let x = 0; x <= w; x += Math.max(4, w / 160)) {
          c.lineTo(x, base + Math.sin((x / w) * Math.PI * (2 + layer * 0.6) + time * (0.6 + layer * 0.2)) * amp + Math.sin((x / w) * 9 + time * 1.3 + layer) * amp * 0.25);
        }
        c.lineTo(w, h);
        c.closePath();
        c.fillStyle = rgba(layer % 2 ? colors.accent : colors.text, 0.06 + layer * 0.025);
        c.fill();
      }
    },
    particles() {
      for (const p of items) {
        const x = ((p.x + time * 0.02 * (0.3 + p.v)) % 1) * w;
        const y = ((p.y + Math.sin(time * 0.5 + p.h * 6) * 0.02 + 1) % 1) * h;
        const r = (1 + p.s * 3) * (w / 1400 + 0.6) * SIZE;
        c.fillStyle = rgba(p.h > 0.5 ? colors.accent : colors.text, 0.25 + p.z * 0.45);
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    },
    constellation() {
      const points = items.map((p) => [((((p.x + Math.sin(time * 0.15 + p.h * 9) * 0.04) % 1) + 1) % 1) * w, ((((p.y + Math.cos(time * 0.12 + p.v * 9) * 0.04) % 1) + 1) % 1) * h]);
      const limit = Math.min(w, h) * 0.16;
      c.lineWidth = Math.max(1, w / 1600) * SIZE;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
          if (d < limit) {
            c.strokeStyle = rgba(colors.accent, 0.35 * (1 - d / limit));
            c.beginPath();
            c.moveTo(points[i][0], points[i][1]);
            c.lineTo(points[j][0], points[j][1]);
            c.stroke();
          }
        }
      }
      for (const [x, y] of points) {
        c.fillStyle = rgba(colors.text, 0.6);
        c.beginPath();
        c.arc(x, y, Math.max(1.5, w / 900) * SIZE, 0, Math.PI * 2);
        c.fill();
      }
    },
    bubbles() {
      for (const p of items) {
        const r = (10 + p.s * 40) * (w / 1600 + 0.5);
        const y = h + r - ((p.y + time * 0.03 * (0.4 + p.v)) % 1) * (h + 2 * r);
        const x = p.x * w + Math.sin(time * (0.4 + p.v) + p.h * 10) * 30;
        c.strokeStyle = rgba(colors.accent, 0.35);
        c.fillStyle = rgba(colors.accent, 0.08);
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    },
    gridflow() {
      const horizon = h * 0.42;
      c.strokeStyle = rgba(colors.accent, 0.35);
      c.lineWidth = Math.max(1, w / 1400) * SIZE;
      for (let i = -20; i <= 20; i++) {
        c.beginPath();
        c.moveTo(w / 2 + i * w * 0.01, horizon);
        c.lineTo(w / 2 + i * w * 0.12, h);
        c.stroke();
      }
      for (let i = 0; i < 18; i++) {
        const f = (i / 18 + time * 0.06) % 1;
        const y = horizon + (h - horizon) * f * f;
        c.strokeStyle = rgba(colors.accent, 0.1 + 0.4 * f);
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(w, y);
        c.stroke();
      }
      const g = c.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, rgba(colors.accent, 0));
      g.addColorStop(1, rgba(colors.accent, 0.18));
      c.fillStyle = g;
      c.fillRect(0, 0, w, horizon);
    },
    flowchart() {
      const cols = 6;
      const rowsN = Math.ceil(items.length / cols);
      const cw = w / cols;
      const rh = h / rowsN;
      const points = [];
      c.lineWidth = Math.max(1, w / 1400) * SIZE;
      items.forEach((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const drift = Math.sin(time * 0.25 * (0.4 + p.v) + p.h * 6) * cw * 0.12;
        const x = (col + 0.5) * cw + drift;
        const y = (((row + 0.5) * rh + time * 6 * (0.5 + p.v * 0.2)) % (h + rh)) - rh / 2;
        const sz = Math.min(cw, rh) * (0.18 + p.s * 0.12);
        points.push({ x, y, size: sz });
        c.fillStyle = rgba(p.h > 0.8 ? danger : colors.accent, 0.16);
        c.strokeStyle = rgba(colors.accent, 0.45);
        c.beginPath();
        if (p.z < 0.3) { c.moveTo(x, y - sz); c.lineTo(x + sz * 1.3, y); c.lineTo(x, y + sz); c.lineTo(x - sz * 1.3, y); c.closePath(); }
        else if (p.z < 0.45) c.ellipse(x, y, sz * 1.4, sz * 0.7, 0, 0, Math.PI * 2);
        else c.rect(x - sz * 1.4, y - sz * 0.7, sz * 2.8, sz * 1.4);
        c.fill();
        c.stroke();
      });
      c.strokeStyle = rgba(colors.text, 0.16);
      for (let i = 0; i + cols < points.length; i++) {
        const a = points[i];
        const b = points[i + cols];
        if (b.y < a.y) continue;
        c.beginPath();
        c.moveTo(a.x, a.y + a.size * 0.8);
        c.lineTo(a.x, (a.y + b.y) / 2);
        c.lineTo(b.x, (a.y + b.y) / 2);
        c.lineTo(b.x, b.y - b.size * 0.8);
        c.stroke();
      }
    },
    starfield() {
      const cx = w / 2;
      const cy = h / 2;
      for (const p of items) {
        const z = 1 - ((p.z + time * 0.08 * (0.5 + p.v)) % 1);
        const x = cx + ((p.x - 0.5) * w) / (z * 1.4 + 0.05);
        const y = cy + ((p.y - 0.5) * h) / (z * 1.4 + 0.05);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const r = Math.max(0.6, (1 - z) * 2.6) * (w / 1600 + 0.6) * SIZE;
        c.fillStyle = rgba(p.h > 0.7 ? colors.accent : colors.text, Math.min(1, (1 - z) * 1.4));
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    },
    rain() {
      c.lineWidth = Math.max(1, w / 1400) * SIZE;
      c.lineCap = 'round';
      for (const p of items) {
        const length = (0.03 + p.s * 0.05) * h;
        const y = (((p.y + time * (0.35 + p.v * 0.45)) % 1.2) - 0.1) * h;
        const x = (p.x * 1.1 - 0.05) * w - y * 0.12;
        c.strokeStyle = rgba(p.h > 0.65 ? colors.accent : colors.text, 0.12 + p.z * 0.28);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + length * 0.12, y - length);
        c.stroke();
      }
      c.lineCap = 'butt';
    },
    snow() {
      const scale = (w / 1600 + 0.6) * SIZE;
      for (const p of items) {
        const y = (((p.y + time * (0.025 + p.v * 0.045)) % 1.1) - 0.05) * h;
        const x = ((((p.x + time * 0.004 + Math.sin(time * 0.6 + p.h * 12) * 0.02) % 1) + 1) % 1) * w;
        c.fillStyle = rgba(p.h > 0.8 ? colors.accent : colors.text, 0.3 + p.z * 0.45);
        c.beginPath();
        c.arc(x, y, (1 + p.s * 3) * scale, 0, Math.PI * 2);
        c.fill();
      }
    },
    fireflies() {
      const scale = (w / 1600 + 0.6) * SIZE;
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      for (const p of items) {
        const x = (0.5 + 0.46 * Math.sin(time * 0.11 * (0.5 + p.v) + p.x * 20)) * w;
        const y = (0.5 + 0.44 * Math.cos(time * 0.09 * (0.5 + p.s) + p.y * 20)) * h;
        const glow = 0.5 + 0.5 * Math.sin(time * (1 + p.h * 2) + p.z * 10);
        const r = (5 + p.s * 9) * scale * (0.7 + glow * 0.6);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(colors.accent, 0.25 + glow * 0.55));
        g.addColorStop(1, rgba(colors.accent, 0));
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.globalCompositeOperation = 'source-over';
    },
    ripples() {
      const reach = Math.max(w, h) * 0.32;
      c.lineWidth = Math.max(1, w / 1000);
      items.forEach((p, i) => {
        const period = 6 + p.v * 4;
        const t = time + p.h * period;
        const round = Math.floor(t / period);
        const phase = (t % period) / period;
        const at = (n) => { const v = Math.sin(i * 12.9898 + round * 78.233 + n) * 43758.5453; return v - Math.floor(v); };
        const x = (0.1 + at(1) * 0.8) * w;
        const y = (0.1 + at(2) * 0.8) * h;
        for (const k of [1, 0.7, 0.4]) {
          c.strokeStyle = rgba(k === 1 ? colors.accent : colors.text, (1 - phase) * 0.4 * k);
          c.beginPath();
          c.arc(x, y, Math.max(0, phase * reach * k), 0, Math.PI * 2);
          c.stroke();
        }
      });
    },
    coderain() {
      const glyphs = '0123456789ABCDEF<>{}[]=+*';
      const column = w / items.length;
      const sz = column * 0.62;
      c.font = `${Math.round(sz)}px Consolas, Menlo, monospace`;
      c.textAlign = 'center';
      const heads = items.map((p) => [(((p.y + time * (0.06 + p.v * 0.1)) % 1.3) - 0.1) * h, Math.floor(time * 6 + p.h * 10)]);
      for (let k = 0; k < 12; k++) {
        c.fillStyle = k === 0 ? rgba(colors.text, 0.75) : rgba(colors.accent, 0.5 * (1 - k / 12));
        heads.forEach(([head, tick], i) => {
          const y = head - k * sz * 1.15;
          if (y < -sz || y > h + sz) return;
          c.fillText(glyphs[(i * 7 + k * 13 + tick) % glyphs.length], (i + 0.5) * column, y);
        });
      }
      c.textAlign = 'start';
    },
    hexagons() {
      const r = Math.max(w, h) / 24;
      const step = Math.sqrt(3) * r;
      const LEVELS = 8;
      const cells = Array.from({ length: LEVELS }, () => []);
      for (let row = 0; row * r * 1.5 < h + r; row++) {
        for (let col = 0; col * step < w + step; col++) {
          const x = col * step + ((row % 2) * step) / 2;
          const y = row * r * 1.5;
          const pulse = 0.5 + 0.5 * Math.sin(time * 0.9 - Math.hypot(x - w / 2, y - h / 2) / (r * 3));
          cells[Math.min(LEVELS - 1, Math.floor(pulse * LEVELS))].push(x, y);
        }
      }
      c.lineWidth = Math.max(1, w / 1600) * SIZE;
      cells.forEach((list, level) => {
        if (!list.length) return;
        c.beginPath();
        for (let i = 0; i < list.length; i += 2) {
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            c[k ? 'lineTo' : 'moveTo'](list[i] + Math.cos(a) * r * 0.92, list[i + 1] + Math.sin(a) * r * 0.92);
          }
          c.closePath();
        }
        const pulse = (level + 0.5) / LEVELS;
        if (pulse > 0.8) {
          c.fillStyle = rgba(colors.accent, (pulse - 0.8) * 0.9);
          c.fill();
        }
        c.strokeStyle = rgba(colors.accent, 0.08 + pulse * pulse * 0.22);
        c.stroke();
      });
    },
    orbits() {
      const cx = w / 2;
      const cy = h / 2;
      const unit = Math.min(w, h);
      const scale = (w / 1600 + 0.6) * SIZE;
      const sun = c.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.09);
      sun.addColorStop(0, rgba(colors.accent, 0.5));
      sun.addColorStop(1, rgba(colors.accent, 0));
      c.fillStyle = sun;
      c.fillRect(cx - unit * 0.09, cy - unit * 0.09, unit * 0.18, unit * 0.18);
      c.lineWidth = Math.max(1, w / 1600) * SIZE;
      items.forEach((p, i) => {
        const radius = unit * (0.1 + i * 0.05);
        c.strokeStyle = rgba(colors.text, 0.09);
        c.beginPath();
        c.ellipse(cx, cy, radius * 1.35, radius, 0, 0, Math.PI * 2);
        c.stroke();
        const a = time * (0.5 / (1 + i * 0.5)) * (p.v > 0.3 ? 1 : -1) + p.h * Math.PI * 2;
        c.fillStyle = rgba(p.z > 0.7 ? colors.text : colors.accent, 0.55);
        c.beginPath();
        c.arc(cx + Math.cos(a) * radius * 1.35, cy + Math.sin(a) * radius, (3 + p.s * 6) * scale, 0, Math.PI * 2);
        c.fill();
      });
    },
    lava() {
      const hues = [colors.accent, accent2, danger];
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      items.forEach((p, i) => {
        const x = (0.12 + 0.76 * p.x + 0.06 * Math.sin(time * 0.2 + p.h * 9)) * w;
        const y = (0.5 + 0.42 * Math.sin(time * 0.12 * (0.5 + p.v) + p.h * 9)) * h;
        const r = Math.min(w, h) * (0.1 + p.s * 0.12) * (1 + 0.08 * Math.sin(time * 0.7 + i));
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        const hue = hues[i % hues.length];
        g.addColorStop(0, rgba(hue, 0.42));
        g.addColorStop(0.6, rgba(hue, 0.3));
        g.addColorStop(1, rgba(hue, 0));
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      });
      c.globalCompositeOperation = 'source-over';
    },
    spiral() {
      const cx = w / 2;
      const cy = h / 2;
      const reach = Math.min(w, h) * 0.5;
      const scale = (w / 1600 + 0.6) * SIZE;
      const n = items.length;
      items.forEach((p, i) => {
        const k = i / n;
        const a = k * Math.PI * 6 + time * 0.12 + (p.h > 0.5 ? Math.PI : 0) + (p.s - 0.5) * 0.4;
        const d = k * reach * (0.9 + p.v * 0.2);
        c.fillStyle = rgba(p.z > 0.75 ? colors.text : colors.accent, 0.2 + 0.55 * (1 - k));
        c.beginPath();
        c.arc(cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d, (0.8 + p.z * 2.2) * scale, 0, Math.PI * 2);
        c.fill();
      });
    },
    confetti() {
      const hues = [colors.accent, accent2, danger, colors.text];
      const scale = (w / 1600 + 0.6) * SIZE;
      for (const p of items) {
        const y = (((p.y + time * (0.035 + p.v * 0.05)) % 1.1) - 0.05) * h;
        const x = ((((p.x + Math.sin(time * 0.7 + p.h * 10) * 0.03) % 1) + 1) % 1) * w;
        const turn = time * (1 + p.s * 2) + p.h * 6;
        const sz = (6 + p.s * 8) * scale;
        c.setTransform(Math.cos(turn), Math.sin(turn), -Math.sin(turn), Math.cos(turn), x, y);
        c.fillStyle = rgba(hues[Math.floor(p.z * hues.length)], 0.45);
        c.fillRect(-sz / 2, -sz * 0.3, sz, sz * 0.6 * Math.abs(Math.cos(turn * 1.3)) + 1);
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    },
    nodes() {
      const pts = items.map((p) => ({
        x: (p.x + Math.sin(time * 0.15 * (0.3 + p.v) + p.h * 9) * 0.06) * w,
        y: (p.y + Math.cos(time * 0.12 * (0.3 + p.s) + p.z * 9) * 0.06) * h,
        r: 5 + p.s * 9, hub: p.h > 0.78,
      }));
      c.lineWidth = Math.max(1, w / 1500);
      const reach = Math.min(w, h) * 0.24;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d > reach) continue;
          c.strokeStyle = rgba(colors.accent, 0.3 * (1 - d / reach));
          c.beginPath();
          c.moveTo(pts[i].x, pts[i].y);
          c.lineTo(pts[j].x, pts[j].y);
          c.stroke();
        }
      }
      for (const p of pts) {
        c.fillStyle = rgba(p.hub ? danger : colors.accent, p.hub ? 0.35 : 0.22);
        c.strokeStyle = rgba(colors.accent, 0.55);
        c.beginPath();
        if (p.hub) c.rect(p.x - p.r, p.y - p.r * 0.7, p.r * 2, p.r * 1.4);
        else c.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    },
    ribbons() {
      const stepX = Math.max(4, w / 120);
      c.lineCap = 'round';
      for (let layer = 0; layer < 6; layer++) {
        c.beginPath();
        for (let x = 0; x <= w + stepX; x += stepX) {
          const y = h * (0.5 + 0.28 * Math.sin((x / w) * Math.PI * 2 * (0.8 + layer * 0.25) + time * (0.35 + layer * 0.08) + layer) * Math.sin(time * 0.15 + layer * 1.1));
          c[x ? 'lineTo' : 'moveTo'](x, y);
        }
        c.lineWidth = h * 0.008 * (1 + (layer % 3));
        c.strokeStyle = rgba(layer % 2 ? colors.accent : accent2, 0.16);
        c.stroke();
      }
      c.lineCap = 'butt';
    },
  };
  scenes[kind]?.();
}
