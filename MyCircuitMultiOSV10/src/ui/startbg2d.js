// Animated 2D start page backgrounds, each showing something different:
// growing PCB traces, a schematic or board drifting by, an oscilloscope,
// falling parts, current flowing in wires, net names raining down, a
// blueprint being drawn, a Bode plot sweep, a spectrum analyser, a logic
// analyser and a netlist graph.
//
//   const bg = start2D(host, kind, { project, speed })   speed() → 0…3
//   bg.dispose()
//
// Pace: every scene is tuned so that at speed 1 things move about 65 px/s
// (≈ 100 px/s at the default 50 %, which is speed 1.5), and nothing moves at
// speed 0. Time-based effects use the scaled time; nothing advances per frame.

import { drawSchematic, SCH_THEMES } from "../sch/render.js";
import { schematicBounds } from "../sch/ops.js";
import { pageView } from "../core/netlist.js";
import { drawBoard, PCB_THEMES } from "../pcb/render.js";
import { boardBounds } from "../pcb/board.js";

const TAU = Math.PI * 2;
// Deterministic random numbers, so a scene looks the same every time.
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export const SCENES_2D = ["traces", "schematic", "pcb2d", "scope", "rain", "current", "matrix", "blueprint", "bode", "spectrum", "logic", "netgraph"];

export function start2D(host, kind, { project = null, speed = () => 1 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "start-bg-2d";
  host.append(canvas);
  const g = canvas.getContext("2d");
  let W = 1, H = 1, dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, host.clientWidth);
    H = Math.max(1, host.clientHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (scene.resize) scene.resize();
  };
  const scene = (MAKERS[kind] || MAKERS.traces)({ g, size: () => [W, H], project });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(host);
  resize();
  let alive = true;
  let last = performance.now();
  let time = 0;
  const loop = (now) => {
    if (!alive) return;
    if (!canvas.isConnected) { dispose(); return; }
    const dt = Math.min(0.1, (now - last) / 1000) * speed();
    last = now;
    time += dt;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.frame(time, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  function dispose() {
    alive = false;
    if (ro) ro.disconnect();
    canvas.remove();
  }
  return { dispose, canvas };
}

// One still frame of a scene into a small canvas (the chooser's tiles). The
// scene is laid out for a 960 × 540 screen and scaled down.
export function preview2D(canvas, kind, project = null) {
  const g = canvas.getContext("2d");
  const k = canvas.width / 960;
  const scene = (MAKERS[kind] || MAKERS.traces)({ g, size: () => [960, 540], project });
  let t = 0;
  for (let i = 0; i < 40; i++) {
    t += 0.1;
    g.setTransform(k, 0, 0, k, 0, 0);
    scene.frame(t, 0.1);
  }
}

// ---------------------------------------------------------------- scenes
const MAKERS = {
  // PCB traces growing on a 45° grid, ending in vias, slowly fading.
  traces({ g, size }) {
    const r = rng(7);
    let agents = [];
    const step = 14;
    const spawn = () => {
      const [W, H] = size();
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      const d = dirs[Math.floor(r() * 4)];
      return { x: Math.round((r() * W) / step) * step, y: Math.round((r() * H) / step) * step, d, left: 8 + Math.floor(r() * 30), w: r() < 0.25 ? 4 : 2, c: r() < 0.5 ? "#d9a441" : "#c96a3a", acc: 0 };
    };
    let cleared = false;
    return {
      resize() { cleared = false; },
      frame(t, dt) {
        const [W, H] = size();
        if (!cleared) { g.fillStyle = "#0b2a1c"; g.fillRect(0, 0, W, H); cleared = true; }
        g.fillStyle = `rgba(11, 42, 28, ${Math.min(0.2, dt * 0.25)})`;
        g.fillRect(0, 0, W, H);
        while (agents.length < 26) agents.push(spawn());
        g.lineCap = "round";
        for (const a of agents) {
          a.acc += dt * 5; // grid steps per second at speed 1 (14 px each)
          while (a.acc >= 1 && a.left > 0) {
            a.acc -= 1;
            const nx = a.x + a.d[0] * step, ny = a.y + a.d[1] * step;
            g.strokeStyle = a.c; g.lineWidth = a.w;
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(nx, ny); g.stroke();
            a.x = nx; a.y = ny; a.left--;
            // bend by 45° now and then
            if (r() < 0.22) {
              const turns = { "1,0": [[1, 1], [1, -1]], "-1,0": [[-1, 1], [-1, -1]], "0,1": [[1, 1], [-1, 1]], "0,-1": [[1, -1], [-1, -1]] };
              const k = `${a.d[0]},${a.d[1]}`;
              a.d = turns[k] ? turns[k][Math.floor(r() * 2)] : (Math.abs(a.d[0]) ? [a.d[0], 0] : [0, a.d[1]]);
            }
            if (a.left === 0) {
              g.fillStyle = "#e8c36a"; g.beginPath(); g.arc(a.x, a.y, a.w + 3, 0, TAU); g.fill();
              g.fillStyle = "#0b2a1c"; g.beginPath(); g.arc(a.x, a.y, a.w * 0.7, 0, TAU); g.fill();
            }
          }
        }
        agents = agents.filter((a) => a.left > 0 && a.x > -40 && a.y > -40 && a.x < W + 40 && a.y < H + 40);
        if (t < 0) return;
      },
    };
  },

  // The sample's schematic drifting slowly across the screen.
  schematic({ g, size, project }) {
    const th = SCH_THEMES.dark;
    const b = project ? schematicBounds(pageView(project.schematic)) : null;
    return {
      frame(t) {
        const [W, H] = size();
        g.fillStyle = th.bg; g.fillRect(0, 0, W, H);
        drawGrid(g, W, H, 24, th.grid, (t * 14) % 24, (t * 7) % 24);
        if (!b) return;
        const bw = b.x2 - b.x1 + 400, bh = b.y2 - b.y1 + 400;
        const s = Math.max(W / bw, H / bh) * 1.35;
        const cx = (b.x1 + b.x2) / 2 + Math.sin(t * 0.16) * bw * 0.16;
        const cy = (b.y1 + b.y2) / 2 + Math.sin(t * 0.12 + 1) * bh * 0.16;
        g.save();
        g.setTransform(g.getTransform().a * s, 0, 0, g.getTransform().d * s, g.getTransform().a * (W / 2 - cx * s), g.getTransform().d * (H / 2 - cy * s));
        drawSchematic(g, project, th, s, { sheet: false });
        g.restore();
      },
    };
  },

  // The board as the PCB editor draws it, panning and slowly zooming.
  pcb2d({ g, size, project }) {
    const th = PCB_THEMES.dark;
    const b = project && project.pcb ? boardBounds(project.pcb) : null;
    return {
      frame(t) {
        const [W, H] = size();
        g.fillStyle = th.bg; g.fillRect(0, 0, W, H);
        if (!b) return;
        const bw = b.x2 - b.x1 + 4, bh = b.y2 - b.y1 + 4;
        const s = Math.max(W / bw, H / bh) * (1.25 + 0.25 * Math.sin(t * 0.18));
        const cx = (b.x1 + b.x2) / 2 + Math.sin(t * 0.14) * bw * 0.2;
        const cy = (b.y1 + b.y2) / 2 + Math.cos(t * 0.11) * bh * 0.2;
        const k = g.getTransform().a;
        g.save();
        g.setTransform(k * s, 0, 0, k * s, k * (W / 2 - cx * s), k * (H / 2 - cy * s));
        try { drawBoard(g, project, th, s, { activeLayer: "F.Cu", padLabels: false, courtyards: false }); } catch { /* a board that can't draw just shows the grid */ }
        g.restore();
      },
    };
  },

  // Oscilloscope: sine, square and triangle traces with phosphor glow.
  scope({ g, size }) {
    return {
      frame(t) {
        const [W, H] = size();
        g.fillStyle = "#06120d"; g.fillRect(0, 0, W, H);
        drawGrid(g, W, H, Math.max(40, W / 12), "rgba(80,200,140,0.18)");
        g.strokeStyle = "rgba(80,200,140,0.35)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
        const traces = [
          ["#ffe14d", H * 0.28, (x) => Math.sin(x)],
          ["#4dd2ff", H * 0.52, (x) => (Math.sin(x * 0.5) >= 0 ? 1 : -1)],
          ["#ff6ad5", H * 0.76, (x) => (2 / Math.PI) * Math.asin(Math.sin(x * 0.75))],
        ];
        for (const [c, y0, f] of traces) {
          g.shadowColor = c; g.shadowBlur = 12; g.strokeStyle = c; g.lineWidth = 2.2;
          g.beginPath();
          for (let x = 0; x <= W; x += 3) {
            const v = f(x / 38 - t * 1.7);
            if (x === 0) g.moveTo(x, y0 - v * H * 0.09); else g.lineTo(x, y0 - v * H * 0.09);
          }
          g.stroke();
        }
        g.shadowBlur = 0;
      },
    };
  },

  // Component symbols falling and turning.
  rain({ g, size }) {
    const r = rng(11);
    const kinds = ["res", "cap", "diode", "chip", "led", "tr"];
    const parts = Array.from({ length: 46 }, () => ({ x: r(), y: r(), s: 0.6 + r() * 1.4, v: 0.045 + r() * 0.05, a: r() * TAU, va: (r() - 0.5) * 0.6, k: kinds[Math.floor(r() * kinds.length)], c: ["#e0716b", "#4cc674", "#45c8c8", "#e7a54a", "#b79cff"][Math.floor(r() * 5)] }));
    return {
      frame(t, dt) {
        const [W, H] = size();
        g.fillStyle = "#14161c"; g.fillRect(0, 0, W, H);
        for (const p of parts) {
          p.y += p.v * dt; p.a += p.va * dt;
          if (p.y > 1.1) { p.y = -0.1; p.x = r(); }
          g.save();
          g.translate(p.x * W, p.y * H); g.rotate(p.a); g.scale(p.s * 1.6, p.s * 1.6);
          g.strokeStyle = p.c; g.lineWidth = 1.6 / (p.s * 1.6); g.globalAlpha = 0.35 + p.s * 0.3;
          symbol(g, p.k);
          g.restore();
        }
        g.globalAlpha = 1;
      },
    };
  },

  // A wire network with current dots flowing through it.
  current({ g, size }) {
    const r = rng(5);
    let wires = [];
    const build = () => {
      const [W, H] = size();
      wires = [];
      const n = 18;
      for (let i = 0; i < n; i++) {
        const pts = [[r() * W, r() * H]];
        for (let k = 0; k < 4; k++) {
          const [x, y] = pts[pts.length - 1];
          pts.push(k % 2 ? [x, y + (r() - 0.5) * H * 0.6] : [x + (r() - 0.5) * W * 0.6, y]);
        }
        let len = 0;
        for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        wires.push({ pts, len, c: r() < 0.5 ? "#4cc674" : "#4a8bdc", off: r() * 100 });
      }
    };
    const at = (w, d) => {
      for (let k = 1; k < w.pts.length; k++) {
        const [x0, y0] = w.pts[k - 1], [x1, y1] = w.pts[k];
        const l = Math.hypot(x1 - x0, y1 - y0);
        if (d <= l) return [x0 + ((x1 - x0) * d) / (l || 1), y0 + ((y1 - y0) * d) / (l || 1)];
        d -= l;
      }
      return w.pts[w.pts.length - 1];
    };
    return {
      resize: build,
      frame(t) {
        const [W, H] = size();
        if (!wires.length) build();
        g.fillStyle = "#101318"; g.fillRect(0, 0, W, H);
        for (const w of wires) {
          g.strokeStyle = w.c; g.globalAlpha = 0.35; g.lineWidth = 2.5;
          g.beginPath(); w.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
          g.globalAlpha = 1;
          for (const [x, y] of [w.pts[0], w.pts[w.pts.length - 1]]) { g.fillStyle = w.c; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
          g.shadowColor = "#fff6a0"; g.shadowBlur = 10; g.fillStyle = "#fff6a0";
          for (let d = (t * 65 + w.off) % 40; d < w.len; d += 40) { const [x, y] = at(w, d); g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); }
          g.shadowBlur = 0;
        }
      },
    };
  },

  // Columns of net names and references streaming down.
  matrix({ g, size }) {
    const r = rng(3);
    const words = ["GND", "VCC", "+5V", "+3V3", "SCK", "MISO", "MOSI", "RESET", "TXD", "RXD", "D13", "U1", "R1", "C4", "Q2", "D1", "J1", "Y1", "SW1", "NET-(R1-2)", "LED", "CLK", "SDA", "SCL", "VBUS", "IRQ"];
    let cols = [];
    const build = () => {
      const [W] = size();
      cols = Array.from({ length: Math.ceil(W / 46) }, (_, i) => ({ x: i * 46 + 6, y: r() * -600, v: 45 + r() * 40, words: Array.from({ length: 14 }, () => words[Math.floor(r() * words.length)]) }));
    };
    return {
      resize: build,
      frame(t, dt) {
        const [W, H] = size();
        if (!cols.length) build();
        g.fillStyle = "#050a08"; g.fillRect(0, 0, W, H);
        g.font = "12px Consolas, 'Cascadia Mono', monospace";
        for (const c of cols) {
          c.y += c.v * dt;
          if (c.y - c.words.length * 18 > H) c.y = r() * -300;
          c.words.forEach((w, i) => {
            const y = c.y - i * 18;
            if (y < -20 || y > H + 20) return;
            g.fillStyle = i === 0 ? "#d8ffe8" : `rgba(70, 220, 130, ${Math.max(0.1, 1 - i / c.words.length)})`;
            g.fillText(w, c.x, y);
          });
        }
      },
    };
  },

  // A blueprint: package outlines with dimensions drawn line by line.
  blueprint({ g, size }) {
    const drawings = [dipDrawing, qfpDrawing, toDrawing];
    return {
      frame(t) {
        const [W, H] = size();
        g.fillStyle = "#123a6b"; g.fillRect(0, 0, W, H);
        drawGrid(g, W, H, 20, "rgba(255,255,255,0.06)");
        drawGrid(g, W, H, 100, "rgba(255,255,255,0.12)");
        const cycle = 9;
        const i = Math.floor(t / cycle) % drawings.length;
        const p = Math.min(1, (t % cycle) / (cycle * 0.7));
        const s = Math.min(W, H) / 260;
        g.save();
        g.translate(W * 0.62, H * 0.5); g.scale(s, s);
        g.strokeStyle = "#e8f2ff"; g.fillStyle = "#e8f2ff"; g.lineWidth = 1.4 / s;
        g.font = `${12}px Consolas, monospace`;
        const lines = drawings[i]();
        const n = Math.floor(lines.length * p);
        lines.slice(0, n).forEach((ln) => { if (ln.text) g.fillText(ln.text, ln.x, ln.y); else { g.beginPath(); g.moveTo(ln[0], ln[1]); g.lineTo(ln[2], ln[3]); g.stroke(); } });
        g.restore();
      },
    };
  },

  // Bode plot of a low-pass filter with a sweeping cursor.
  bode({ g, size }) {
    return {
      frame(t) {
        const [W, H] = size();
        g.fillStyle = "#11141b"; g.fillRect(0, 0, W, H);
        const x0 = W * 0.08, x1 = W * 0.95, y0 = H * 0.1, y1 = H * 0.9;
        g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 1;
        for (let dec = 0; dec <= 5; dec++) for (let k = 1; k < 10; k++) {
          const x = x0 + ((dec + Math.log10(k)) / 5) * (x1 - x0);
          if (x > x1) continue;
          g.globalAlpha = k === 1 ? 1 : 0.4;
          g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
        }
        g.globalAlpha = 1;
        for (let k = 0; k <= 8; k++) { const y = y0 + (k / 8) * (y1 - y0); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
        const fc = 1 + 2 * (0.5 + 0.5 * Math.sin(t * 0.25)); // corner moves between decades 1 and 3
        const mag = (u) => -10 * Math.log10(1 + Math.pow(10, 2 * 2 * (u - fc)));
        const ph = (u) => -2 * Math.atan(Math.pow(10, u - fc)) * (180 / Math.PI);
        const plot = (f, lo, hi, c) => {
          g.strokeStyle = c; g.lineWidth = 2.4; g.shadowColor = c; g.shadowBlur = 8;
          g.beginPath();
          for (let i = 0; i <= 200; i++) { const u = (i / 200) * 5; const y = y0 + ((hi - f(u)) / (hi - lo)) * (y1 - y0); const x = x0 + (u / 5) * (x1 - x0); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
          g.stroke(); g.shadowBlur = 0;
        };
        plot(mag, -80, 5, "#4dd2ff");
        plot(ph, -190, 10, "#ffb84d");
        const cu = (t * 0.2) % 5;
        const cx = x0 + (cu / 5) * (x1 - x0);
        g.strokeStyle = "rgba(255,255,255,0.5)"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, y1); g.stroke(); g.setLineDash([]);
      },
    };
  },

  // Spectrum analyser: bars plus a scrolling waterfall.
  spectrum({ g, size }) {
    let water = null;
    let scroll = 0;
    return {
      resize() { water = null; },
      frame(t, dt) {
        const r = rng(1 + Math.floor(t * 8)); // noise changes 8 times per scaled second
        const [W, H] = size();
        const n = 64;
        const levels = Array.from({ length: n }, (_, i) => {
          const f = i / n;
          return Math.max(0.03, 0.55 * Math.exp(-Math.pow((f - 0.22 - 0.05 * Math.sin(t * 0.7)) * 9, 2)) + 0.4 * Math.exp(-Math.pow((f - 0.63) * 14, 2)) * (0.6 + 0.4 * Math.sin(t * 1.3)) + 0.12 * r());
        });
        const split = H * 0.55;
        if (!water || water.width !== Math.round(W) || water.height !== Math.round(H - split)) { water = document.createElement("canvas"); water.width = Math.round(W); water.height = Math.max(1, Math.round(H - split)); }
        const wg = water.getContext("2d");
        scroll += dt * 50; // waterfall px per second at speed 1
        const step = Math.floor(scroll);
        if (step > 0) {
          scroll -= step;
          wg.drawImage(water, 0, step);
          levels.forEach((v, i) => { wg.fillStyle = heat(v); wg.fillRect((i / n) * W, 0, W / n + 1, step); });
        }
        g.fillStyle = "#0a0c12"; g.fillRect(0, 0, W, H);
        drawGrid(g, W, split, Math.max(40, W / 16), "rgba(255,255,255,0.06)");
        levels.forEach((v, i) => { const bh = v * split * 0.9; g.fillStyle = heat(v); g.fillRect((i / n) * W + 1, split - bh, W / n - 2, bh); });
        g.drawImage(water, 0, split);
      },
    };
  },

  // Logic analyser: clock, data and a bus scrolling past.
  logic({ g, size }) {
    const r = rng(13);
    const bits = Array.from({ length: 6 }, (_, ch) => Array.from({ length: 400 }, (_, i) => (ch === 0 ? i % 2 : r() < 0.5 ? 1 : 0)));
    const names = ["CLK", "MOSI", "MISO", "CS", "SDA", "SCL"];
    return {
      frame(t) {
        const [W, H] = size();
        g.fillStyle = "#0f1116"; g.fillRect(0, 0, W, H);
        const rowH = H / (bits.length + 1);
        const unit = 22;
        const off = (t * 65) % (unit * 400);
        g.font = "12px Consolas, monospace";
        bits.forEach((row, ch) => {
          const y = rowH * (ch + 0.8);
          const hi = y - rowH * 0.3, lo = y + rowH * 0.3;
          g.fillStyle = "rgba(255,255,255,0.45)"; g.fillText(names[ch], 10, y + 4);
          g.strokeStyle = ["#4cc674", "#4dd2ff", "#ffb84d", "#ff6ad5", "#b79cff", "#e0e070"][ch]; g.lineWidth = 2;
          g.beginPath();
          let prev = null;
          for (let x = 60; x < W + unit; x += unit) {
            const i = Math.floor((x + off) / unit) % row.length;
            const yy = row[i] ? hi : lo;
            if (prev === null) g.moveTo(x, yy); else { if (prev !== yy) g.lineTo(x, prev); g.lineTo(x, yy); }
            g.lineTo(x + unit, yy);
            prev = yy;
          }
          g.stroke();
        });
      },
    };
  },

  // Netlist as a graph: parts (squares) and nets (dots) drifting, linked.
  netgraph({ g, size }) {
    const r = rng(17);
    const nodes = Array.from({ length: 34 }, (_, i) => ({ x: r(), y: r(), vx: (r() - 0.5) * 0.07, vy: (r() - 0.5) * 0.07, part: i % 3 === 0, label: i % 3 === 0 ? ["U", "R", "C", "Q", "D", "J"][i % 6] + (1 + (i % 9)) : "" }));
    const edges = [];
    nodes.forEach((n, i) => { for (let k = 0; k < 2; k++) edges.push([i, Math.floor(r() * nodes.length)]); });
    return {
      frame(t, dt) {
        const [W, H] = size();
        g.fillStyle = "#13121c"; g.fillRect(0, 0, W, H);
        for (const n of nodes) {
          n.x += n.vx * dt; n.y += n.vy * dt;
          if (n.x < 0.03 || n.x > 0.97) n.vx *= -1;
          if (n.y < 0.03 || n.y > 0.97) n.vy *= -1;
        }
        g.strokeStyle = "rgba(160,140,255,0.28)"; g.lineWidth = 1.2;
        for (const [a, b] of edges) { g.beginPath(); g.moveTo(nodes[a].x * W, nodes[a].y * H); g.lineTo(nodes[b].x * W, nodes[b].y * H); g.stroke(); }
        g.font = "11px 'Segoe UI', sans-serif";
        for (const n of nodes) {
          const x = n.x * W, y = n.y * H;
          if (n.part) { g.fillStyle = "#2b2350"; g.strokeStyle = "#b79cff"; g.lineWidth = 1.5; g.fillRect(x - 13, y - 9, 26, 18); g.strokeRect(x - 13, y - 9, 26, 18); g.fillStyle = "#e8e0ff"; g.fillText(n.label, x - 9, y + 4); }
          else { g.fillStyle = "#7fe0c0"; g.beginPath(); g.arc(x, y, 3.5 + Math.sin(t + x) * 0.8, 0, TAU); g.fill(); }
        }
      },
    };
  },
};

// ---------------------------------------------------------------- helpers
function drawGrid(g, W, H, step, color, ox = 0, oy = 0) {
  g.strokeStyle = color; g.lineWidth = 1;
  g.beginPath();
  for (let x = -ox % step; x <= W; x += step) { g.moveTo(x, 0); g.lineTo(x, H); }
  for (let y = -oy % step; y <= H; y += step) { g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();
}

function heat(v) {
  const h = 240 - Math.min(1, v) * 240;
  return `hsl(${h}, 90%, ${35 + v * 30}%)`;
}

function symbol(g, k) {
  g.beginPath();
  if (k === "res") { g.moveTo(-18, 0); g.lineTo(-9, 0); g.rect(-9, -4, 18, 8); g.moveTo(9, 0); g.lineTo(18, 0); }
  else if (k === "cap") { g.moveTo(-14, 0); g.lineTo(-3, 0); g.moveTo(-3, -8); g.lineTo(-3, 8); g.moveTo(3, -8); g.lineTo(3, 8); g.moveTo(3, 0); g.lineTo(14, 0); }
  else if (k === "diode" || k === "led") {
    g.moveTo(-14, 0); g.lineTo(-6, 0); g.moveTo(-6, -7); g.lineTo(-6, 7); g.lineTo(6, 0); g.closePath(); g.moveTo(6, -7); g.lineTo(6, 7); g.moveTo(6, 0); g.lineTo(14, 0);
    if (k === "led") { g.moveTo(2, -10); g.lineTo(8, -16); g.moveTo(6, -9); g.lineTo(12, -15); }
  } else if (k === "chip") { g.rect(-10, -13, 20, 26); for (let i = -9; i <= 9; i += 6) { g.moveTo(-10, i); g.lineTo(-15, i); g.moveTo(10, i); g.lineTo(15, i); } }
  else { g.arc(0, 0, 10, 0, TAU); g.moveTo(-4, -6); g.lineTo(-4, 6); g.moveTo(-4, -2); g.lineTo(5, -8); g.moveTo(-4, 2); g.lineTo(5, 8); }
  g.stroke();
}

// Blueprint drawings: lists of [x1, y1, x2, y2] lines and {text, x, y}.
function dim(x1, y1, x2, y2, text, o = 18) {
  const horiz = y1 === y2;
  const out = [];
  if (horiz) { out.push([x1, y1, x1, y1 - o - 4], [x2, y2, x2, y2 - o - 4], [x1, y1 - o, x2, y2 - o], { text, x: (x1 + x2) / 2 - text.length * 3.3, y: y1 - o - 5 }); }
  else { out.push([x1, y1, x1 + o + 4, y1], [x2, y2, x2 + o + 4, y2], [x1 + o, y1, x2 + o, y2], { text, x: x1 + o + 6, y: (y1 + y2) / 2 + 4 }); }
  return out;
}
function rectLines(x, y, w, h) { return [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]]; }
function dipDrawing() {
  const out = [...rectLines(-60, -90, 120, 180), [-12, -90, 12, -90]];
  for (let i = 0; i < 7; i++) { const y = -75 + i * 25; out.push(...rectLines(-75, y - 4, 15, 8), ...rectLines(60, y - 4, 15, 8)); }
  out.push(...dim(-60, -90, 60, -90, "7.62 mm"), ...dim(75, -79, 75, 79, "15.24 mm", 22), { text: "DIP-14", x: -20, y: 115 });
  return out;
}
function qfpDrawing() {
  const out = [...rectLines(-70, -70, 140, 140)];
  for (let i = 0; i < 8; i++) { const p = -56 + i * 16; out.push(...rectLines(p - 3, -88, 6, 18), ...rectLines(p - 3, 70, 6, 18), ...rectLines(-88, p - 3, 18, 6), ...rectLines(70, p - 3, 18, 6)); }
  out.push([-60, -50, -50, -60], ...dim(-88, -88, 88, -88, "9.00 mm", 14), ...dim(88, -88, 88, 88, "9.00 mm", 14), { text: "TQFP-32  0.8 mm pitch", x: -70, y: 120 });
  return out;
}
function toDrawing() {
  const out = [...rectLines(-50, -100, 100, 30), ...rectLines(-50, -70, 100, 80)];
  out.push([0, -85, 0, -85]);
  for (const x of [-25, 0, 25]) out.push(...rectLines(x - 4, 10, 8, 80));
  out.push(...dim(-50, -100, 50, -100, "10.0 mm"), ...dim(50, -100, 50, 90, "29.0 mm", 26), { text: "TO-220", x: -22, y: 115 });
  return out;
}
