// Moving backgrounds drawn from project planning itself: a timeline sliding by
// with its milestones and today line, a kanban board whose cards travel from
// "to do" to "done", a dependency network with the critical path lighting up,
// a burndown chart being drawn, a calendar filling with tasks, the critical
// path racing along a chain of bars, progress rings and bars filling up, a
// resource histogram against its capacity line, sprint cycles going round and
// a blueprint of a plan being sketched. They are methods of AnimatedBackground
// (ui/background.js): (context, width, height, time, colors).
// Colours follow the theme: accent, text, danger; quiet alphas so the cards on top stay readable.

const rgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128];
};
const cache = new Map();
const rgba = (hex, a) => {
  let v = cache.get(hex);
  if (!v) { v = rgb(hex); cache.set(hex, v); }
  return `rgba(${v[0]},${v[1]},${v[2]},${a})`;
};
const frac = (v) => ((v % 1) + 1) % 1;
const ease = (v) => v * v * (3 - 2 * v);
const lerp = (a, b, f) => a + (b - a) * f;

/** A rounded rectangle path; nothing for an empty or negative size (a small canvas can give one, and roundRect throws on a negative radius). */
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  if (!(w > 0.5 && h > 0.5)) return;
  if (c.roundRect) c.roundRect(x, y, w, h, Math.max(0, Math.min(r, h / 2, w / 2)));
  else c.rect(x, y, w, h);
}

function diamond(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y - s);
  c.lineTo(x + s, y);
  c.lineTo(x, y + s);
  c.lineTo(x - s, y);
  c.closePath();
}

/** How many seeded items each scene uses (x, y, z, s, v, h: numbers 0–1). */
export const PLAN_SCENE_ITEMS = {
  timeline: 14, kanban: 18, network: 16, burndown: 1, calendar: 42, critical: 12, progress: 9, resources: 24, sprint: 6, blueprint: 18,
  baseline: 16, swimlanes: 20,
};

export const PLAN_SCENES = {
  /** A timeline sliding left: week ticks, task spans above and below, milestones, and a pulsing "today" line. */
  timeline(c, w, h, time, colors) {
    const unit = Math.max(60, w / 14);
    const shift = (time * unit * 0.25) % unit;
    const axis = h * 0.5;
    c.lineWidth = Math.max(1, w / 1400);
    c.strokeStyle = rgba(colors.text, 0.22);
    c.beginPath();
    c.moveTo(0, axis);
    c.lineTo(w, axis);
    c.stroke();
    for (let x = -shift; x < w + unit; x += unit) {
      c.strokeStyle = rgba(colors.text, 0.1);
      c.beginPath();
      c.moveTo(x, axis - h * 0.42);
      c.lineTo(x, axis + h * 0.42);
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.3);
      c.beginPath();
      c.moveTo(x, axis - 6);
      c.lineTo(x, axis + 6);
      c.stroke();
    }
    const span = w * 1.6;
    this.items.forEach((p, i) => {
      const x = frac(p.x - time * 0.012) * span - w * 0.3;
      const len = (0.06 + p.s * 0.18) * w;
      const above = i % 2 === 0;
      const lane = 1 + (i % 6 >> 1);
      const y = above ? axis - lane * h * 0.11 : axis + lane * h * 0.11 - h * 0.035;
      const bh = h * 0.035;
      c.fillStyle = rgba(p.h > 0.8 ? colors.danger : colors.accent, 0.18);
      c.strokeStyle = rgba(p.h > 0.8 ? colors.danger : colors.accent, 0.42);
      roundRect(c, x, y, len, bh, bh / 2);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.38);
      roundRect(c, x, y + bh * 0.3, len * p.z, bh * 0.4, bh * 0.2);
      c.fill();
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      c.moveTo(x, above ? y + bh : y);
      c.lineTo(x, axis);
      c.stroke();
      if (p.v > 0.55) {
        const mx = x + len;
        diamond(c, mx, axis, Math.max(5, h * 0.012));
        c.fillStyle = rgba(colors.accent, 0.45);
        c.fill();
      }
    });
    const today = w * 0.62;
    const pulse = 0.25 + 0.15 * Math.sin(time * 2);
    c.strokeStyle = rgba(colors.danger, pulse + 0.15);
    c.setLineDash([6, 5]);
    c.lineWidth = Math.max(1.5, w / 900);
    c.beginPath();
    c.moveTo(today, h * 0.06);
    c.lineTo(today, h * 0.94);
    c.stroke();
    c.setLineDash([]);
  },

  /** A kanban board: three columns, cards gliding from "to do" through "doing" to "done", then starting again. */
  kanban(c, w, h, time, colors) {
    const cols = 3;
    const margin = w * 0.06;
    const gap = w * 0.03;
    const colW = (w - margin * 2 - gap * (cols - 1)) / cols;
    const top = h * 0.1;
    const cardH = Math.max(26, h * 0.075);
    for (let k = 0; k < cols; k++) {
      const x = margin + k * (colW + gap);
      c.fillStyle = rgba(colors.text, 0.035);
      c.strokeStyle = rgba(colors.text, 0.1);
      roundRect(c, x, top, colW, h * 0.82, 14);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(k === 2 ? colors.accent : colors.text, k === 2 ? 0.35 : 0.18);
      roundRect(c, x + 14, top + 14, colW * 0.35, 8, 4);
      c.fill();
    }
    const per = this.items.length;
    this.items.forEach((p, i) => {
      // Each card's life: wait in a column, slide to the next; the cycle is offset per card.
      const cycle = frac(time * 0.035 * (0.6 + p.v * 0.5) + p.x);
      const stage = cycle * 3;
      const from = Math.min(2, Math.floor(stage));
      const local = stage - from;
      const move = local > 0.75 && from < 2 ? ease((local - 0.75) / 0.25) : 0;
      const slot = i % Math.ceil(per / 3);
      const xFrom = margin + from * (colW + gap) + colW * 0.08;
      const xTo = margin + Math.min(2, from + 1) * (colW + gap) + colW * 0.08;
      const x = lerp(xFrom, xTo, move);
      const y = top + 40 + slot * (cardH + 10) + Math.sin(time + i) * 1.5 - move * 8 * Math.sin(move * Math.PI);
      if (y + cardH > top + h * 0.82) return;
      const cw = colW * 0.84;
      c.fillStyle = rgba(colors.bg, 0.6);
      c.strokeStyle = rgba(from === 2 ? colors.accent : colors.text, from === 2 ? 0.4 : 0.2);
      roundRect(c, x, y, cw, cardH, 8);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(p.h > 0.8 ? colors.danger : colors.accent, 0.5);
      roundRect(c, x, y + 6, 4, cardH - 12, 2);
      c.fill();
      c.fillStyle = rgba(colors.text, 0.22);
      roundRect(c, x + 14, y + cardH * 0.28, cw * (0.35 + p.s * 0.4), 6, 3);
      c.fill();
      c.fillStyle = rgba(colors.accent, 0.3);
      roundRect(c, x + 14, y + cardH * 0.62, (cw - 28) * (from === 2 ? 1 : from === 1 ? 0.3 + p.z * 0.6 : 0.05), 4, 2);
      c.fill();
    });
  },

  /** A dependency network: task boxes linked by arrows; a light runs along the critical path. */
  network(c, w, h, time, colors) {
    const cols = 6;
    const rows = 3;
    const nodes = this.items.slice(0, cols * rows - 2).map((p, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      return { x: w * (0.08 + col * 0.17) + Math.sin(time * 0.3 + i) * 6, y: h * (0.22 + row * 0.28) + Math.cos(time * 0.25 + i * 1.3) * 6, p, col, row };
    });
    const bw = Math.max(60, w * 0.075);
    const bh = Math.max(26, h * 0.06);
    const critical = new Set(nodes.filter((n) => n.row === 1).map((n) => nodes.indexOf(n)));
    c.lineWidth = Math.max(1, w / 1300);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (b.col !== a.col + 1 || Math.abs(b.row - a.row) > 1 || (a.p.s > 0.7 && b.row !== a.row)) continue;
        const crit = critical.has(i) && critical.has(j);
        c.strokeStyle = rgba(crit ? colors.danger : colors.text, crit ? 0.35 : 0.14);
        c.beginPath();
        c.moveTo(a.x + bw, a.y + bh / 2);
        const mid = (a.x + bw + b.x) / 2;
        c.bezierCurveTo(mid, a.y + bh / 2, mid, b.y + bh / 2, b.x, b.y + bh / 2);
        c.stroke();
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.moveTo(b.x, b.y + bh / 2);
        c.lineTo(b.x - 7, b.y + bh / 2 - 4);
        c.lineTo(b.x - 7, b.y + bh / 2 + 4);
        c.fill();
      }
    }
    // The light travelling along the critical path (the middle row).
    const path = nodes.filter((n) => n.row === 1);
    const along = frac(time * 0.08) * (path.length - 1);
    const k = Math.floor(along);
    if (path[k + 1]) {
      const f = along - k;
      const x = lerp(path[k].x + bw, path[k + 1].x, f);
      const y = lerp(path[k].y, path[k + 1].y, f) + bh / 2;
      const g = c.createRadialGradient(x, y, 0, x, y, bh * 1.6);
      g.addColorStop(0, rgba(colors.danger, 0.55));
      g.addColorStop(1, rgba(colors.danger, 0));
      c.fillStyle = g;
      c.fillRect(x - bh * 2, y - bh * 2, bh * 4, bh * 4);
    }
    nodes.forEach((n, i) => {
      const crit = critical.has(i);
      c.fillStyle = rgba(colors.bg, 0.65);
      c.strokeStyle = rgba(crit ? colors.danger : colors.accent, crit ? 0.5 : 0.35);
      roundRect(c, n.x, n.y, bw, bh, 6);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(colors.text, 0.2);
      roundRect(c, n.x + 8, n.y + bh * 0.3, bw * (0.4 + n.p.s * 0.4), 5, 2.5);
      c.fill();
      c.fillStyle = rgba(crit ? colors.danger : colors.accent, 0.35);
      roundRect(c, n.x + 8, n.y + bh * 0.62, (bw - 16) * n.p.z, 4, 2);
      c.fill();
    });
  },

  /** A burndown chart being drawn: grid, the dashed ideal line, the scheduled line, and the actual line moving forward. */
  burndown(c, w, h, time, colors) {
    const left = w * 0.1;
    const right = w * 0.92;
    const top = h * 0.14;
    const bottom = h * 0.86;
    c.lineWidth = Math.max(1, w / 1400);
    for (let i = 0; i <= 8; i++) {
      const y = lerp(top, bottom, i / 8);
      c.strokeStyle = rgba(colors.text, i === 8 ? 0.25 : 0.07);
      c.beginPath();
      c.moveTo(left, y);
      c.lineTo(right, y);
      c.stroke();
    }
    for (let i = 0; i <= 14; i++) {
      const x = lerp(left, right, i / 14);
      c.strokeStyle = rgba(colors.text, i === 0 ? 0.25 : 0.05);
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, bottom);
      c.stroke();
    }
    c.setLineDash([10, 8]);
    c.strokeStyle = rgba(colors.text, 0.25);
    c.lineWidth = Math.max(1.5, w / 1000);
    c.beginPath();
    c.moveTo(left, top);
    c.lineTo(right, bottom);
    c.stroke();
    c.setLineDash([]);
    const n = 60;
    const seed = this.items[0] ?? { s: 0.5, v: 0.5 };
    const scheduled = (u) => 1 - u - 0.06 * Math.sin(u * Math.PI * 2 + seed.s * 4) * (1 - u);
    const actual = (u) => Math.min(1, scheduled(u) + 0.08 * Math.sin(u * 9 + seed.v * 6) * u + 0.04 * Math.sin(u * 23));
    const line = (fn, upTo, color, alpha, width) => {
      c.strokeStyle = rgba(color, alpha);
      c.lineWidth = width;
      c.beginPath();
      for (let i = 0; i <= n * upTo; i++) {
        const u = i / n;
        const x = lerp(left, right, u);
        const y = lerp(top, bottom, 1 - Math.max(0, fn(u)));
        c[i ? 'lineTo' : 'moveTo'](x, y);
      }
      c.stroke();
    };
    line(scheduled, 1, colors.accent, 0.35, Math.max(2, w / 700));
    // The actual line grows, holds, and starts again.
    const cycle = frac(time * 0.05);
    const upTo = Math.min(1, cycle * 1.25);
    line(actual, upTo, colors.accent, 0.7, Math.max(3, w / 450));
    const u = Math.floor(n * upTo) / n;
    const x = lerp(left, right, u);
    const y = lerp(top, bottom, 1 - Math.max(0, actual(u)));
    c.fillStyle = rgba(colors.accent, 0.8);
    c.beginPath();
    c.arc(x, y, Math.max(4, w / 300), 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = rgba(colors.danger, 0.35);
    c.setLineDash([5, 5]);
    c.beginPath();
    c.moveTo(x, top);
    c.lineTo(x, bottom);
    c.stroke();
    c.setLineDash([]);
  },

  /** A month calendar: day cells fill with task chips one after another, weekends shaded. */
  calendar(c, w, h, time, colors) {
    const cols = 7;
    const rows = 6;
    const left = w * 0.06;
    const top = h * 0.1;
    const cw = (w * 0.88) / cols;
    const ch = (h * 0.84) / rows;
    const fill = frac(time * 0.03) * (cols * rows + 8);
    c.lineWidth = 1;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const i = r * cols + k;
        const x = left + k * cw;
        const y = top + r * ch;
        c.fillStyle = rgba(k >= 5 ? colors.danger : colors.text, k >= 5 ? 0.035 : 0.02);
        c.fillRect(x, y, cw, ch);
        c.strokeStyle = rgba(colors.text, 0.09);
        c.strokeRect(x, y, cw, ch);
        c.fillStyle = rgba(colors.text, 0.18);
        roundRect(c, x + 8, y + 8, 14, 6, 3);
        c.fill();
        if (k >= 5) continue;
        const p = this.items[i % this.items.length];
        const shown = Math.max(0, Math.min(1, fill - i));
        const chips = 1 + Math.floor(p.s * 3);
        for (let j = 0; j < chips; j++) {
          const a = Math.max(0, Math.min(1, shown * chips - j));
          if (!a) continue;
          c.fillStyle = rgba(p.h > 0.8 && j === 0 ? colors.danger : colors.accent, 0.12 + 0.22 * a);
          roundRect(c, x + 8, y + 22 + j * (ch * 0.2), (cw - 16) * a * (0.5 + p.z * 0.5), ch * 0.14, 4);
          c.fill();
        }
      }
    }
  },

  /** The critical path: a chain of bars, each starting where the previous ends; red light runs along it, other bars float by. */
  critical(c, w, h, time, colors) {
    const n = this.items.length;
    const rowH = h / (n + 1);
    let x = w * 0.05;
    const total = this.items.reduce((sum, p) => sum + 0.4 + p.s, 0);
    const scale = (w * 0.9) / total;
    const run = frac(time * 0.06) * w * 0.9 + w * 0.05;
    this.items.forEach((p, i) => {
      const len = (0.4 + p.s) * scale;
      const y = (i + 0.6) * rowH;
      const bh = rowH * 0.42;
      // Floating, non-critical bar of the same row.
      const fx = frac(p.x + time * 0.01 * (0.5 + p.v)) * w * 1.3 - w * 0.15;
      c.fillStyle = rgba(colors.accent, 0.1);
      roundRect(c, fx, y + bh * 0.15, len * 0.7, bh * 0.7, bh * 0.35);
      c.fill();
      const lit = Math.max(0, Math.min(1, (run - x) / len));
      c.fillStyle = rgba(colors.danger, 0.12);
      c.strokeStyle = rgba(colors.danger, 0.4);
      roundRect(c, x, y, len, bh, bh / 2);
      c.fill();
      c.stroke();
      if (lit > 0) {
        c.fillStyle = rgba(colors.danger, 0.35);
        roundRect(c, x, y, len * lit, bh, bh / 2);
        c.fill();
      }
      if (i < n - 1) {
        c.strokeStyle = rgba(colors.danger, 0.3);
        c.beginPath();
        c.moveTo(x + len, y + bh / 2);
        c.lineTo(x + len + 6, y + bh / 2);
        c.lineTo(x + len + 6, y + rowH + bh / 2 - 4);
        c.stroke();
      }
      x += len;
    });
  },

  /** % complete: rings and bars filling up, each finishing with a check mark, then starting over. */
  progress(c, w, h, time, colors) {
    const cols = 3;
    const rows = 3;
    this.items.forEach((p, i) => {
      const cx = w * (0.2 + (i % cols) * 0.3);
      const cy = h * (0.2 + Math.floor(i / cols) * 0.3);
      if (Math.floor(i / cols) >= rows) return;
      const r = Math.min(w, h) * 0.085;
      const done = Math.min(1, frac(time * 0.04 * (0.6 + p.v * 0.6) + p.x) * 1.2);
      c.lineWidth = r * 0.16;
      c.strokeStyle = rgba(colors.text, 0.08);
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = rgba(done >= 1 ? colors.accent : colors.accent, done >= 1 ? 0.55 : 0.35);
      c.lineCap = 'round';
      c.beginPath();
      c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * done);
      c.stroke();
      c.lineCap = 'butt';
      if (done >= 1) {
        c.strokeStyle = rgba(colors.accent, 0.6);
        c.lineWidth = r * 0.14;
        c.beginPath();
        c.moveTo(cx - r * 0.35, cy);
        c.lineTo(cx - r * 0.08, cy + r * 0.28);
        c.lineTo(cx + r * 0.4, cy - r * 0.3);
        c.stroke();
      } else {
        c.fillStyle = rgba(colors.text, 0.16);
        roundRect(c, cx - r * 0.45, cy - r * 0.08, r * 0.9 * done, r * 0.16, r * 0.08);
        c.fill();
      }
      c.fillStyle = rgba(colors.text, 0.06);
      roundRect(c, cx - r * 1.2, cy + r * 1.45, r * 2.4, r * 0.18, r * 0.09);
      c.fill();
      c.fillStyle = rgba(colors.accent, 0.3);
      roundRect(c, cx - r * 1.2, cy + r * 1.45, r * 2.4 * done, r * 0.18, r * 0.09);
      c.fill();
    });
  },

  /** A resource histogram: daily load bars rising and falling against the capacity line; over it they turn red. */
  resources(c, w, h, time, colors) {
    const n = this.items.length;
    const left = w * 0.06;
    const bottom = h * 0.88;
    const top = h * 0.12;
    const bw = (w * 0.88) / n;
    const cap = lerp(bottom, top, 0.62);
    this.items.forEach((p, i) => {
      const load = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * 0.35 * (0.5 + p.v) + p.x * 9)) + p.s * 0.2;
      const y = lerp(bottom, top, Math.min(1, load));
      const x = left + i * bw + bw * 0.15;
      const over = y < cap;
      c.fillStyle = rgba(colors.accent, 0.22);
      c.fillRect(x, Math.max(y, cap), bw * 0.7, bottom - Math.max(y, cap));
      if (over) {
        c.fillStyle = rgba(colors.danger, 0.35);
        c.fillRect(x, y, bw * 0.7, cap - y);
      }
    });
    c.strokeStyle = rgba(colors.text, 0.2);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(left, bottom);
    c.lineTo(w * 0.94, bottom);
    c.stroke();
    c.strokeStyle = rgba(colors.accent, 0.55);
    c.lineWidth = Math.max(2, w / 700);
    c.setLineDash([12, 6]);
    c.beginPath();
    c.moveTo(left, cap);
    c.lineTo(w * 0.94, cap);
    c.stroke();
    c.setLineDash([]);
  },

  /** Sprint cycles: concentric rings of iterations going round, task dots riding each ring to its finish flag. */
  sprint(c, w, h, time, colors) {
    const cx = w * 0.5;
    const cy = h * 0.52;
    const base = Math.min(w, h) * 0.1;
    this.items.forEach((p, i) => {
      const r = base + i * Math.min(w, h) * 0.065;
      const dir = i % 2 ? -1 : 1;
      c.lineWidth = Math.max(1, r * 0.05);
      c.strokeStyle = rgba(colors.text, 0.08);
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      const head = time * 0.15 * (0.6 + p.v * 0.5) * dir + p.x * 6;
      c.strokeStyle = rgba(p.h > 0.8 ? colors.danger : colors.accent, 0.35);
      c.lineCap = 'round';
      c.beginPath();
      c.arc(cx, cy, r, head - 1.2 - p.s, head, dir < 0);
      c.stroke();
      c.lineCap = 'butt';
      for (let k = 0; k < 5; k++) {
        const a = head - (k / 5) * (1.2 + p.s) * dir;
        c.fillStyle = rgba(colors.accent, 0.45 - k * 0.07);
        c.beginPath();
        c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(2.5, r * 0.035), 0, Math.PI * 2);
        c.fill();
      }
      // The finish flag of this iteration.
      const fa = p.z * Math.PI * 2;
      const fx = cx + Math.cos(fa) * r;
      const fy = cy + Math.sin(fa) * r;
      c.strokeStyle = rgba(colors.text, 0.3);
      c.beginPath();
      c.moveTo(fx, fy);
      c.lineTo(fx, fy - 14);
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.4);
      c.beginPath();
      c.moveTo(fx, fy - 14);
      c.lineTo(fx + 10, fy - 10.5);
      c.lineTo(fx, fy - 7);
      c.fill();
    });
  },

  /** Baseline against schedule: each bar drifts ahead of or behind its grey baseline; the gap shows in green or red. */
  baseline(c, w, h, time, colors) {
    const n = this.items.length;
    const rowH = h / (n + 1);
    const status = w * 0.58;
    this.items.forEach((p, i) => {
      const y = (i + 0.7) * rowH;
      const len = (0.12 + p.s * 0.22) * w;
      const bx = w * (0.04 + p.x * 0.6);
      const slip = Math.sin(time * 0.3 * (0.5 + p.v) + p.z * 6) * w * 0.05 * (0.4 + p.h);
      const x = bx + slip;
      const bh = rowH * 0.36;
      c.fillStyle = rgba(colors.text, 0.12);
      roundRect(c, bx, y + bh + 3, len, bh * 0.45, bh * 0.2);
      c.fill();
      const late = slip > 0;
      c.fillStyle = rgba(colors.accent, 0.2);
      c.strokeStyle = rgba(colors.accent, 0.42);
      roundRect(c, x, y, len, bh, bh / 2);
      c.fill();
      c.stroke();
      // The slip between the plan and the baseline finish.
      c.fillStyle = rgba(late ? colors.danger : colors.accent, late ? 0.35 : 0.3);
      c.fillRect(Math.min(bx + len, x + len), y + bh * 0.35, Math.abs(slip), bh * 0.3);
    });
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.setLineDash([6, 5]);
    c.lineWidth = Math.max(1.5, w / 900);
    c.beginPath();
    c.moveTo(status, h * 0.04);
    c.lineTo(status, h * 0.96);
    c.stroke();
    c.setLineDash([]);
  },

  /** Team swimlanes: a lane per person, tasks gliding along it and handing over to the next lane with a link. */
  swimlanes(c, w, h, time, colors) {
    const lanes = 5;
    const laneH = h / lanes;
    for (let k = 0; k < lanes; k++) {
      const y = k * laneH;
      c.fillStyle = rgba(colors.text, k % 2 ? 0.025 : 0.045);
      c.fillRect(0, y, w, laneH);
      c.fillStyle = rgba(colors.accent, 0.3);
      c.beginPath();
      c.arc(w * 0.035, y + laneH / 2, Math.min(18, laneH * 0.22), 0, Math.PI * 2);
      c.fill();
      c.fillStyle = rgba(colors.text, 0.15);
      roundRect(c, w * 0.06, y + laneH / 2 - 4, w * 0.05, 8, 4);
      c.fill();
    }
    const left = w * 0.14;
    const span = w * 0.86;
    this.items.forEach((p, i) => {
      const lane = i % lanes;
      const x = left + frac(p.x + time * 0.012 * (0.5 + p.v)) * (span + w * 0.2) - w * 0.1;
      const len = (0.06 + p.s * 0.12) * w;
      const bh = laneH * 0.28;
      const y = lane * laneH + laneH * (0.2 + (i % 2) * 0.38);
      c.fillStyle = rgba(p.h > 0.82 ? colors.danger : colors.accent, 0.2);
      c.strokeStyle = rgba(p.h > 0.82 ? colors.danger : colors.accent, 0.42);
      roundRect(c, x, y, len, bh, bh / 2);
      c.fill();
      c.stroke();
      if (lane < lanes - 1 && p.z > 0.55) {
        // Hand-over to the next person: a link down to the next lane.
        const ny = (lane + 1) * laneH + laneH * 0.3;
        c.strokeStyle = rgba(colors.text, 0.16);
        c.beginPath();
        c.moveTo(x + len, y + bh / 2);
        c.lineTo(x + len + 10, y + bh / 2);
        c.lineTo(x + len + 10, ny);
        c.stroke();
        c.fillStyle = rgba(colors.text, 0.2);
        c.beginPath();
        c.moveTo(x + len + 10, ny + 5);
        c.lineTo(x + len + 6, ny - 2);
        c.lineTo(x + len + 14, ny - 2);
        c.fill();
      }
    });
  },

  /** A blueprint: grid paper and a Gantt plan being sketched — bars drawn line by line with links, then fading to start again. */
  blueprint(c, w, h, time, colors) {
    const cell = Math.max(18, Math.min(w, h) / 30);
    c.lineWidth = 1;
    for (let x = 0; x < w; x += cell) {
      c.strokeStyle = rgba(colors.accent, x % (cell * 5) === 0 ? 0.12 : 0.05);
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 0; y < h; y += cell) {
      c.strokeStyle = rgba(colors.accent, y % (cell * 5) === 0 ? 0.12 : 0.05);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    const n = this.items.length;
    const cycle = frac(time * 0.03);
    const drawn = cycle * (n + 4);
    const fade = cycle > 0.9 ? 1 - (cycle - 0.9) / 0.1 : 1;
    let x = w * 0.08;
    this.items.forEach((p, i) => {
      const a = Math.max(0, Math.min(1, drawn - i)) * fade;
      const len = Math.round((2 + p.s * 7)) * cell;
      const y = h * 0.08 + i * ((h * 0.84) / n);
      const bh = cell * 0.8;
      const start = p.h > 0.7 ? x - len * 0.4 : x;
      if (a > 0) {
        c.strokeStyle = rgba(colors.accent, 0.55 * a);
        c.lineWidth = 1.5;
        c.setLineDash([]);
        c.strokeRect(start, y, len * Math.min(1, a * 1.5), bh);
        c.fillStyle = rgba(colors.accent, 0.12 * a);
        c.fillRect(start, y, len * Math.min(1, a * 1.5), bh);
        if (i > 0 && a > 0.6) {
          c.setLineDash([4, 4]);
          c.strokeStyle = rgba(colors.text, 0.25 * a);
          c.beginPath();
          c.moveTo(start, y + bh / 2);
          c.lineTo(start - cell * 0.6, y + bh / 2);
          c.lineTo(start - cell * 0.6, y - h * 0.84 / n + bh);
          c.stroke();
          c.setLineDash([]);
        }
      }
      x = Math.min(w * 0.85 - len, start + len);
    });
  },
};
