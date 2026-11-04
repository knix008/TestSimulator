// The start screen's moving backgrounds, all drawn on a 2D canvas in the colours of the current
// theme. Each one is a pure function of time, so a frame can be drawn at any moment, which is
// also how the picker draws its thumbnails.
const TAU = Math.PI * 2;

/** A repeatable random number in 0..1 for an index. */
const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const wrap = (value, size) => ((value % size) + size) % size;

/** How large marks are drawn: thumbnails use the same drawings at a smaller scale. */
const unit = (w, h) => Math.max(0.35, Math.min(w, h) / 700);

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const DRAW = {
  /* A circuit board: traces with signals running along them. */
  circuit({ ctx, w, h, t, p, u }) {
    const step = 46 * u;
    ctx.lineWidth = 1.6 * u;
    for (let i = 0; i < 34; i++) {
      const x0 = Math.round((rnd(i) * w) / step) * step;
      const y0 = Math.round((rnd(i + 50) * h) / step) * step;
      const a = 3 + Math.floor(rnd(i + 90) * 7);
      const b = 2 + Math.floor(rnd(i + 130) * 5);
      const dir = rnd(i + 170) < 0.5 ? 1 : -1;
      const x1 = x0 + a * step;
      const y1 = y0 + dir * b * step;
      const x2 = x1 + b * step;
      ctx.strokeStyle = rgba(p.line, 0.75);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y0);
      ctx.lineTo(x1 + b * step * 0.5, y1);
      ctx.lineTo(x2, y1);
      ctx.stroke();
      ctx.fillStyle = rgba(p.line, 1);
      ctx.fillRect(x0 - 3 * u, y0 - 3 * u, 6 * u, 6 * u);
      const k = wrap(t * 0.18 + rnd(i + 210), 1);
      const px = k < 0.5 ? x0 + (x1 - x0) * k * 2 : x1 + (x2 - x1) * (k - 0.5) * 2;
      const py = k < 0.5 ? y0 : y0 + (y1 - y0) * Math.min(1, (k - 0.5) * 4);
      ctx.fillStyle = rgba(p.accent, 0.9);
      ctx.beginPath();
      ctx.arc(px, py, 3.4 * u, 0, TAU);
      ctx.fill();
    }
  },
  /* Wireframes of widgets drifting past. */
  widgets({ ctx, w, h, t, p, u }) {
    ctx.lineWidth = 1.5 * u;
    for (let i = 0; i < 26; i++) {
      const bw = (70 + rnd(i) * 130) * u;
      const bh = (34 + rnd(i + 40) * 60) * u;
      const x = wrap(rnd(i + 80) * w + t * (8 + rnd(i + 120) * 18) * u, w + bw * 2) - bw;
      const y = rnd(i + 160) * (h - bh);
      const kind = i % 4;
      ctx.strokeStyle = rgba(p.accent, 0.42);
      ctx.fillStyle = rgba(p.accent, 0.07);
      round(ctx, x, y, bw, bh, 8 * u);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(p.accent, 0.42);
      if (kind === 0) ctx.fillRect(x + bw * 0.2, y + bh * 0.45, bw * 0.6, 3 * u);
      if (kind === 1) ctx.fillRect(x + 8 * u, y + bh / 2 - 3 * u, (bw - 16 * u) * wrap(t * 0.08 + rnd(i), 1), 6 * u);
      if (kind === 2) {
        ctx.beginPath();
        ctx.arc(x + bw * (0.3 + 0.4 * (Math.sin(t + i) * 0.5 + 0.5)), y + bh / 2, bh * 0.24, 0, TAU);
        ctx.fill();
      }
      if (kind === 3) {
        for (let n = 0; n < 3; n++) ctx.fillRect(x + 10 * u, y + bh * (0.25 + n * 0.22), bw * (0.7 - n * 0.15), 2.5 * u);
      }
    }
  },
  /* A dot-matrix display running a wave. */
  ledMatrix({ ctx, w, h, t, p, u }) {
    const step = 18 * u;
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const v = Math.sin(x * 0.012 / u + t * 1.2) + Math.sin(y * 0.018 / u - t * 0.9) + Math.sin((x + y) * 0.008 / u + t * 0.5);
        const on = (v + 3) / 6;
        ctx.fillStyle = rgba(mix(p.line, p.accent, on), 0.2 + on * 0.7);
        ctx.beginPath();
        ctx.arc(x, y, step * 0.28, 0, TAU);
        ctx.fill();
      }
    }
  },
  /* An oscilloscope with a graticule and three traces. */
  oscilloscope({ ctx, w, h, t, p, u }) {
    const step = 70 * u;
    ctx.lineWidth = 1 * u;
    ctx.strokeStyle = rgba(p.line, 0.7);
    for (let x = 0; x < w; x += step) line(ctx, x, 0, x, h);
    for (let y = 0; y < h; y += step) line(ctx, 0, y, w, y);
    const colours = [p.accent, p.ink, p.muted];
    colours.forEach((colour, n) => {
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = rgba(colour, 0.6);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const k = x / (120 * u);
        const y = h * (0.3 + n * 0.2) + Math.sin(k * (1 + n * 0.6) + t * (1.4 + n * 0.5)) * 46 * u * (1 + 0.5 * Math.sin(k * 0.2 + t * 0.3));
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  },
  /* Round gauges, like LVGL arcs. */
  gauges({ ctx, w, h, t, p, u }) {
    const step = 180 * u;
    let i = 0;
    for (let y = step / 2; y < h + step; y += step) {
      for (let x = step / 2 + (Math.round(y / step) % 2) * step * 0.5; x < w + step; x += step) {
        const r = step * 0.34;
        const value = Math.sin(t * (0.4 + rnd(i) * 0.5) + rnd(i + 40) * TAU) * 0.5 + 0.5;
        const start = Math.PI * 0.75;
        ctx.lineCap = "round";
        ctx.lineWidth = 9 * u;
        ctx.strokeStyle = rgba(p.line, 0.8);
        ctx.beginPath();
        ctx.arc(x, y, r, start, start + Math.PI * 1.5);
        ctx.stroke();
        ctx.strokeStyle = rgba(p.accent, 0.65);
        ctx.beginPath();
        ctx.arc(x, y, r, start, start + Math.PI * 1.5 * value);
        ctx.stroke();
        ctx.lineCap = "butt";
        i++;
      }
    }
  },
  /* Rows of sliders settling at new values. */
  sliders({ ctx, w, h, t, p, u }) {
    const step = 54 * u;
    let row = 0;
    for (let y = step / 2; y < h; y += step) {
      const track = rnd(row) * 0.3 + 0.35;
      const x = rnd(row + 20) * w * 0.4 + 20 * u;
      const len = w * track;
      const value = Math.sin(t * (0.3 + rnd(row + 40) * 0.6) + row) * 0.5 + 0.5;
      ctx.fillStyle = rgba(p.line, 0.8);
      round(ctx, x, y - 4 * u, len, 8 * u, 4 * u);
      ctx.fill();
      ctx.fillStyle = rgba(p.accent, 0.55);
      round(ctx, x, y - 4 * u, len * value, 8 * u, 4 * u);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + len * value, y, 11 * u, 0, TAU);
      ctx.fill();
      row++;
    }
  },
  /* Spinners of different sizes. */
  spinners({ ctx, w, h, t, p, u }) {
    ctx.lineCap = "round";
    for (let i = 0; i < 30; i++) {
      const r = (14 + rnd(i) * 46) * u;
      const x = rnd(i + 40) * w;
      const y = rnd(i + 80) * h;
      const a = t * (1 + rnd(i + 120) * 2) * (i % 2 ? 1 : -1);
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.strokeStyle = rgba(p.line, 0.6);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(p.accent, 0.65);
      ctx.beginPath();
      ctx.arc(x, y, r, a, a + 1.4 + Math.sin(t + i) * 0.7);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  },
  /* A design grid with a selection box moving between cells. */
  blueprint({ ctx, w, h, t, p, u }) {
    const step = 40 * u;
    const drift = wrap(t * 10 * u, step * 5);
    ctx.lineWidth = 1;
    for (let x = -drift, n = 0; x < w; x += step, n++) {
      ctx.strokeStyle = rgba(p.line, n % 5 ? 0.35 : 0.9);
      line(ctx, x, 0, x, h);
    }
    for (let y = -drift, n = 0; y < h; y += step, n++) {
      ctx.strokeStyle = rgba(p.line, n % 5 ? 0.35 : 0.9);
      line(ctx, 0, y, w, y);
    }
    for (let i = 0; i < 7; i++) {
      const s = Math.floor(t * 0.25 + rnd(i) * 9);
      const x = Math.floor(rnd(s * 3 + i) * (w / step)) * step - drift;
      const y = Math.floor(rnd(s * 5 + i + 9) * (h / step)) * step - drift;
      const bw = (3 + Math.floor(rnd(s + i) * 6)) * step;
      const bh = (2 + Math.floor(rnd(s + i + 3) * 4)) * step;
      ctx.lineWidth = 1.6 * u;
      ctx.strokeStyle = rgba(p.accent, 0.8);
      ctx.fillStyle = rgba(p.accent, 0.08);
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = rgba(p.accent, 0.9);
      for (const [hx, hy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ctx.fillRect(x + hx * bw - 3 * u, y + hy * bh - 3 * u, 6 * u, 6 * u);
    }
  },
  /* Scrolling firmware memory in hex. */
  hexDump({ ctx, w, h, t, p, u }) {
    const size = Math.max(5, 13 * u);
    const lineHeight = size * 1.5;
    const columns = Math.ceil(w / (size * 1.9));
    ctx.font = `${size}px Consolas, monospace`;
    ctx.textBaseline = "top";
    const offset = (t * 22 * u) % lineHeight;
    const first = Math.floor((t * 22 * u) / lineHeight);
    for (let row = -1; row * lineHeight < h; row++) {
      for (let col = 0; col < columns; col++) {
        const v = Math.floor(rnd((row + first) * 97 + col * 13) * 256);
        const lit = rnd((row + first) * 7 + col * 41) > 0.93;
        ctx.fillStyle = lit ? rgba(p.accent, 0.85) : rgba(p.muted, 0.32);
        ctx.fillText(v.toString(16).padStart(2, "0"), col * size * 1.9, row * lineHeight - offset + lineHeight);
      }
    }
  },
  /* Seven-segment displays counting. */
  sevenSegment({ ctx, w, h, t, p, u }) {
    const DIGITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
    const dw = 62 * u;
    const dh = 110 * u;
    const th = 9 * u;
    const segs = [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 1, 2], [0, 2, 1, 2], [0, 1, 0, 2], [0, 0, 0, 1], [0, 1, 1, 1]];
    let i = 0;
    for (let y = 16 * u; y < h; y += dh + 34 * u) {
      for (let x = 16 * u; x < w; x += dw + 26 * u) {
        const digit = Math.floor(t * (0.5 + rnd(i) * 1.5) + rnd(i + 30) * 10) % 10;
        segs.forEach((seg, n) => {
          const on = DIGITS[digit] & (1 << n);
          ctx.lineCap = "round";
          ctx.lineWidth = th;
          ctx.strokeStyle = on ? rgba(p.accent, 0.62) : rgba(p.line, 0.35);
          line(ctx, x + seg[0] * dw, y + (seg[1] * dh) / 2, x + seg[2] * dw, y + (seg[3] * dh) / 2);
        });
        ctx.lineCap = "butt";
        i++;
      }
    }
  },
  /* A radar sweep with fading echoes. */
  radar({ ctx, w, h, t, p, u }) {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.hypot(w, h) / 2;
    ctx.lineWidth = 1.2 * u;
    ctx.strokeStyle = rgba(p.line, 0.8);
    for (let r = 90 * u; r < radius; r += 90 * u) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }
    const a = t * 0.7;
    for (let n = 0; n < 40; n++) {
      ctx.strokeStyle = rgba(p.accent, 0.3 * (1 - n / 40));
      ctx.lineWidth = 5 * u;
      const b = a - n * 0.016;
      line(ctx, cx, cy, cx + Math.cos(b) * radius, cy + Math.sin(b) * radius);
    }
    for (let i = 0; i < 44; i++) {
      const ang = rnd(i) * TAU;
      const r = rnd(i + 50) * radius;
      const age = wrap(a - ang, TAU) / TAU;
      ctx.fillStyle = rgba(p.accent, 0.9 * (1 - age));
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 4.5 * u, 0, TAU);
      ctx.fill();
    }
  },
  /* 3D: a landscape of lines flying by. */
  terrain({ ctx, w, h, t, p, u }) {
    const rows = 30;
    const cols = 34;
    const height = (x, z) => (Math.sin(x * 0.55 + z * 0.3) + Math.sin(x * 0.2 - z * 0.45) * 1.6 + Math.sin((x + z) * 0.9) * 0.4) * 0.55;
    const project = (x, z, y) => {
      const d = 1 + z * 0.32;
      return [w / 2 + (x * w * 0.22) / d, h * 0.28 + (h * 1.0 - y * h * 0.2) / d * 0.72];
    };
    ctx.lineWidth = 1.1 * u;
    const shift = t * 0.8;
    const offset = shift - Math.floor(shift);
    for (let r = rows; r >= 0; r--) {
      const z = r - offset;
      if (z < 0) continue;
      ctx.strokeStyle = rgba(mix(p.accent, p.line, r / rows), 0.75 * (1 - r / rows) + 0.1);
      ctx.beginPath();
      for (let c = -cols / 2; c <= cols / 2; c++) {
        const [px, py] = project(c, z, height(c * 0.5, r + Math.floor(shift)));
        if (c === -cols / 2) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  },
  /* 3D: flying through rings. */
  tunnel({ ctx, w, h, t, p, u }) {
    const cx = w / 2 + Math.sin(t * 0.4) * w * 0.08;
    const cy = h / 2 + Math.cos(t * 0.33) * h * 0.08;
    const scale = Math.hypot(w, h) * 0.35;
    const offset = wrap(t * 0.7, 1);
    for (let n = 22; n >= 1; n--) {
      const depth = n - offset;
      const r = scale / depth;
      ctx.lineWidth = Math.max(0.6, (5 * u) / depth);
      ctx.strokeStyle = rgba(mix(p.accent, p.line, Math.min(1, depth / 14)), Math.min(0.85, 1.6 / depth + 0.1));
      ctx.beginPath();
      for (let s = 0; s <= 8; s++) {
        const a = (s / 8) * TAU + t * 0.1;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(p.line, 0.5);
    ctx.lineWidth = 1 * u;
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * TAU + t * 0.1;
      line(ctx, cx + Math.cos(a) * (scale / 22), cy + Math.sin(a) * (scale / 22), cx + Math.cos(a) * scale * 2, cy + Math.sin(a) * scale * 2);
    }
  },
  /* 3D: chips on a slowly turning board. */
  chips({ ctx, w, h, t, p, u }) {
    const yaw = t * 0.12;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const project = (x, y, z) => {
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      const d = 5 + ry * 0.55;
      return [w / 2 + (rx * w * 0.42) / (d * 0.5), h * 0.5 + ((ry * 0.5 - z) * h * 0.42) / (d * 0.5)];
    };
    const items = [];
    for (let gx = -4; gx <= 4; gx++) for (let gy = -4; gy <= 4; gy++) items.push({ gx, gy, order: gx * sin + gy * cos });
    items.sort((a, b) => a.order - b.order);
    for (const { gx, gy } of items) {
      const i = gx * 19 + gy * 7 + 100;
      const lift = 0.1 + (Math.sin(t * 0.8 + rnd(i) * TAU) * 0.5 + 0.5) * 0.36;
      const s = 0.36;
      const corners = [[-s, -s], [s, -s], [s, s], [-s, s]];
      const top = corners.map(([a, b]) => project(gx + a, gy + b, lift));
      const low = corners.map(([a, b]) => project(gx + a, gy + b, 0));
      ctx.lineWidth = 1 * u;
      ctx.strokeStyle = rgba(p.accent, 0.5);
      ctx.fillStyle = rgba(p.line, 0.5);
      for (let e = 0; e < 4; e++) {
        const f = (e + 1) % 4;
        ctx.beginPath();
        ctx.moveTo(low[e][0], low[e][1]);
        ctx.lineTo(low[f][0], low[f][1]);
        ctx.lineTo(top[f][0], top[f][1]);
        ctx.lineTo(top[e][0], top[e][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = rgba(mix(p.line, p.accent, rnd(i + 9)), 0.75);
      ctx.beginPath();
      top.forEach(([x, y], e) => (e ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  },
  /* 3D: stars streaming past. */
  starfield({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 260; i++) {
      const z = 1 - wrap(rnd(i) + t * (0.05 + rnd(i + 300) * 0.05), 1);
      const x = (rnd(i + 600) - 0.5) * w * 1.4;
      const y = (rnd(i + 900) - 0.5) * h * 1.4;
      const d = z * 0.95 + 0.05;
      const px = w / 2 + x / d;
      const py = h / 2 + y / d;
      const qx = w / 2 + x / (d + 0.03);
      const qy = h / 2 + y / (d + 0.03);
      ctx.lineWidth = Math.max(0.6, 2.4 * u * (1 - z));
      ctx.strokeStyle = rgba(i % 5 ? p.muted : p.accent, 0.85 * (1 - z));
      line(ctx, px, py, qx, qy);
    }
  },
  /* 3D: a rotating wire cube lattice. */
  lattice({ ctx, w, h, t, p, u }) {
    const a = t * 0.3;
    const b = t * 0.21;
    const project = (x, y, z) => {
      const x1 = x * Math.cos(a) - z * Math.sin(a);
      const z1 = x * Math.sin(a) + z * Math.cos(a);
      const y1 = y * Math.cos(b) - z1 * Math.sin(b);
      const z2 = y * Math.sin(b) + z1 * Math.cos(b);
      const d = 5.4 + z2;
      return [w / 2 + (x1 * Math.min(w, h) * 1.15) / d, h / 2 + (y1 * Math.min(w, h) * 1.15) / d, d];
    };
    const n = 2;
    const stroke = (from, to) => {
      const depth = (from[2] + to[2]) / 2;
      ctx.lineWidth = Math.max(0.6, (6 * u) / depth);
      ctx.strokeStyle = rgba(mix(p.accent, p.line, Math.min(1, (depth - 2.5) / 5)), 0.65);
      line(ctx, from[0], from[1], to[0], to[1]);
    };
    for (let x = -n; x <= n; x++) {
      for (let y = -n; y <= n; y++) {
        for (let z = -n; z <= n; z++) {
          const here = project(x, y, z);
          if (x < n) stroke(here, project(x + 1, y, z));
          if (y < n) stroke(here, project(x, y + 1, z));
          if (z < n) stroke(here, project(x, y, z + 1));
        }
      }
    }
  },
  /* Falling columns of binary digits. */
  binaryRain({ ctx, w, h, t, p, u }) {
    const size = Math.max(6, 16 * u);
    ctx.font = `${size}px Consolas, monospace`;
    ctx.textBaseline = "top";
    const columns = Math.ceil(w / (size * 1.1));
    for (let c = 0; c < columns; c++) {
      const speed = 3 + rnd(c) * 9;
      const head = Math.floor(t * speed + rnd(c + 90) * 80);
      const rows = Math.ceil(h / size) + 16;
      const length = 8 + Math.floor(rnd(c + 40) * 16);
      for (let n = 0; n < length; n++) {
        const row = wrap(head - n, rows);
        ctx.fillStyle = n === 0 ? rgba(p.accent, 0.95) : rgba(p.accent, 0.38 * (1 - n / length));
        ctx.fillText(rnd(row * 11 + c * 3 + Math.floor(t * 2)) > 0.5 ? "1" : "0", c * size * 1.1, row * size);
      }
    }
  },
  /* Points that connect when close. */
  constellation({ ctx, w, h, t, p, u }) {
    const points = [];
    for (let i = 0; i < 64; i++) {
      points.push([
        wrap(rnd(i) * w + Math.sin(t * 0.2 + i) * 60 * u + t * (rnd(i + 80) - 0.5) * 18 * u, w),
        wrap(rnd(i + 160) * h + Math.cos(t * 0.17 + i * 2) * 60 * u + t * (rnd(i + 240) - 0.5) * 18 * u, h),
      ]);
    }
    const reach = 150 * u;
    ctx.lineWidth = 1 * u;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
        if (d < reach) {
          ctx.strokeStyle = rgba(p.accent, 0.4 * (1 - d / reach));
          line(ctx, points[i][0], points[i][1], points[j][0], points[j][1]);
        }
      }
    }
    ctx.fillStyle = rgba(p.accent, 0.75);
    for (const [x, y] of points) {
      ctx.beginPath();
      ctx.arc(x, y, 3 * u, 0, TAU);
      ctx.fill();
    }
  },
  /* Rings spreading from touch points. */
  touchRipples({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 16; i++) {
      const period = 3 + rnd(i) * 4;
      const n = Math.floor(t / period + rnd(i + 30));
      const age = wrap(t / period + rnd(i + 30), 1);
      const x = rnd(n * 13 + i) * w;
      const y = rnd(n * 17 + i + 5) * h;
      for (let ring = 0; ring < 3; ring++) {
        const k = age - ring * 0.1;
        if (k <= 0) continue;
        ctx.lineWidth = 2 * u;
        ctx.strokeStyle = rgba(p.accent, 0.6 * (1 - k));
        ctx.beginPath();
        ctx.arc(x, y, k * 230 * u, 0, TAU);
        ctx.stroke();
      }
    }
  },
  /* Soft moving bands of colour. */
  aurora({ ctx, w, h, t, p }) {
    for (let band = 0; band < 5; band++) {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      const colour = mix(p.accent, p.ink, band * 0.08);
      gradient.addColorStop(0, rgba(colour, 0));
      gradient.addColorStop(0.5, rgba(colour, 0.2));
      gradient.addColorStop(1, rgba(colour, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += Math.max(8, w / 60)) {
        const y = h * (0.3 + band * 0.09) + Math.sin(x * 0.004 + t * (0.3 + band * 0.08) + band) * h * 0.14 + Math.sin(x * 0.011 - t * 0.2) * h * 0.05;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  },
  /* A hexagon floor with light moving through it. */
  hexGrid({ ctx, w, h, t, p, u }) {
    const r = 30 * u;
    const dx = r * Math.sqrt(3);
    const dy = r * 1.5;
    for (let row = -1, y = 0; y < h + r; row++, y = row * dy) {
      for (let col = -1; (col - 1) * dx < w; col++) {
        const x = col * dx + (row % 2 ? dx / 2 : 0);
        const glow = Math.sin(x * 0.006 / u + y * 0.008 / u - t * 0.9) * 0.5 + 0.5;
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * TAU + Math.PI / 6;
          const px = x + Math.cos(a) * r * 0.92;
          const py = y + Math.sin(a) * r * 0.92;
          if (s) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = rgba(p.accent, glow * glow * 0.32);
        ctx.fill();
        ctx.lineWidth = 1 * u;
        ctx.strokeStyle = rgba(p.line, 0.75);
        ctx.stroke();
      }
    }
  },
  /* Bubbles rising. */
  bubbles({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 60; i++) {
      const r = (6 + rnd(i) * 36) * u;
      const y = wrap(rnd(i + 70) * h - t * (10 + rnd(i + 140) * 26) * u, h + r * 2) - r;
      const x = rnd(i + 210) * w + Math.sin(t * 0.6 + i) * 16 * u;
      ctx.lineWidth = 1.4 * u;
      ctx.strokeStyle = rgba(p.accent, 0.5);
      ctx.fillStyle = rgba(p.accent, 0.08);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  },
  /* A bar chart of a signal spectrum. */
  spectrum({ ctx, w, h, t, p, u }) {
    const bars = Math.ceil(w / (22 * u));
    const size = w / bars;
    for (let i = 0; i < bars; i++) {
      const v = (Math.sin(i * 0.3 + t * 1.5) + Math.sin(i * 0.11 - t * 0.9) + Math.sin(i * 0.67 + t * 2.3) + 3) / 6;
      const height = v * h * 0.8;
      const blocks = Math.floor(height / (14 * u));
      for (let b = 0; b < blocks; b++) {
        ctx.fillStyle = rgba(mix(p.line, p.accent, b / (h / (14 * u)) + 0.3), 0.7);
        ctx.fillRect(i * size + 2 * u, h - (b + 1) * 14 * u, size - 4 * u, 10 * u);
      }
    }
  },
  /* Packets moving along a bus between nodes. */
  dataBus({ ctx, w, h, t, p, u }) {
    const rows = 9;
    ctx.lineWidth = 2 * u;
    for (let r = 0; r < rows; r++) {
      const y = ((r + 0.5) / rows) * h;
      ctx.strokeStyle = rgba(p.line, 0.8);
      line(ctx, 0, y, w, y);
      const count = 5;
      for (let i = 0; i < count; i++) {
        const dir = r % 2 ? -1 : 1;
        const size = (30 + rnd(r * 5 + i) * 70) * u;
        const x = wrap(rnd(r * 9 + i * 3) * w + dir * t * (30 + rnd(r) * 60) * u, w + size * 2) - size;
        ctx.fillStyle = rgba(p.accent, 0.3 + rnd(r + i) * 0.45);
        ctx.fillRect(x, y - 7 * u, size, 14 * u);
      }
    }
  },
};

/** Every background, in the order the picker shows them. */
export const BACKGROUND_KINDS = Object.keys(DRAW);
export const isBackgroundKind = (value) => typeof value === "string" && BACKGROUND_KINDS.includes(value);

const toRgb = (value, fallback) => {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value).trim());
  if (!match) return fallback;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The colours of the current theme. */
export function themePalette() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => toRgb(style.getPropertyValue(name), fallback);
  return {
    bg: read("--bg", [243, 244, 246]),
    panel: read("--panel", [255, 255, 255]),
    ink: read("--ink", [31, 35, 40]),
    muted: read("--muted", [102, 112, 133]),
    line: read("--line", [216, 219, 226]),
    accent: read("--accent", [37, 99, 235]),
  };
}

/** Draws one frame of a background at time `t` (seconds). */
export function drawBackground(kind, ctx, w, h, t, palette) {
  ctx.fillStyle = rgba(palette.bg, 1);
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  (DRAW[kind] ?? DRAW[BACKGROUND_KINDS[0]])({ ctx, w, h, t, p: palette, u: unit(w, h) });
  ctx.restore();
}
