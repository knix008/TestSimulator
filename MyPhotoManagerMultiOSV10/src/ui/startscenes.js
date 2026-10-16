// Painted backgrounds for the start page. `valley` is the WebGL landscape in
// startbg.js. The other scenes keep a horizon and depth, and each one moves in
// its own way: a slow stroll, a turn, falling weather, or a breaking wave.

export const START_SCENE_IDS = [
  'valley', 'ocean', 'aurora', 'stars', 'rain', 'snow', 'dusk', 'forest', 'dunes', 'city',
  'nebula', 'bokeh', 'grid', 'ribbons', 'embers', 'lake', 'sunrise', 'fireflies', 'geometry', 'ink',
  'petals', 'mountains',
];

const LEGACY_SPEED = { off: 0, slow: 20, medium: 55, fast: 100 };

export function startSceneId(id) {
  return START_SCENE_IDS.includes(id) ? id : 'valley';
}

/** Motion as a percent, 0 (still) through 100. Older names map onto the same pace. */
export function startSpeedPercent(value) {
  if (typeof value === 'string' && value in LEGACY_SPEED) return LEGACY_SPEED[value];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 20;
  return Math.max(0, Math.min(100, n));
}

/** 0 holds one frame. 20 is the original slow pace; 100 is the old fast pace. */
export function motionScale(percent) {
  return startSpeedPercent(percent) / 100;
}

function rgba(channels, alpha = 1) {
  const [r, g, b] = channels.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  return `rgba(${r},${g},${b},${alpha})`;
}

function mix(a, b, k) {
  return a.map((v, i) => v + (b[i] - v) * k);
}

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FIELDS = new Map();

function field(id, n, seed) {
  const key = `${id}:${n}`;
  let list = FIELDS.get(key);
  if (list) return list;
  const next = rand(seed);
  list = Array.from({ length: n }, () => ({
    x: next() * 2 - 1,
    y: next() * 2 - 1,
    z: next(),
    s: 0.35 + next() * 1.5,
    p: next() * Math.PI * 2,
  }));
  FIELDS.set(key, list);
  return list;
}

function depthOf(z, travel) {
  let depth = (z - travel) % 1;
  if (depth < 0) depth += 1;
  return depth;
}

/**
 * A still camera. `pace` is how fast the ground scrolls toward the viewer.
 * Most scenes pass 0 so they turn, fall, or wave instead of rushing forward.
 * `t` is already scaled by the speed setting.
 */
function view(w, h, t, pace = 0) {
  return {
    w, h, t,
    travel: t * pace,
    horizon: h * (0.4 + Math.sin(t * 0.12) * 0.006),
    sway: Math.sin(t * 0.18) * w * 0.012,
  };
}

/** Turn a point around the middle of the view. `y` is flattened so the ring sits in perspective. */
function orbit(w, h, angle, radius, lift = 0) {
  return {
    x: w * 0.5 + Math.cos(angle) * radius * w * 0.42,
    y: h * 0.46 + Math.sin(angle) * radius * h * 0.22 + lift,
    s: 0.35 + radius * 0.75,
  };
}

/** A point on the ground. `x` is -1..1 across the view, `z` is depth. */
function projectGround(v, x, z) {
  const depth = depthOf(z, v.travel);
  const near = 1 - depth;
  const y = v.horizon + near * near * (v.h - v.horizon);
  return {
    x: v.w * 0.5 + v.sway * near + x * v.w * 0.58 * (0.07 + near),
    y,
    s: 0.08 + near * near * 0.92,
    near,
    depth,
  };
}

/** A point in the air, around the middle of the view. `y` is -1..1. */
function projectSpace(v, x, y, z) {
  const depth = depthOf(z, v.travel);
  const near = 1 - depth;
  const span = 0.06 + near * near;
  return {
    x: v.w * 0.5 + v.sway * near * 0.35 + x * v.w * 0.9 * span,
    y: v.h * 0.46 + y * v.h * 0.62 * span,
    s: span,
    near,
    depth,
  };
}

function farFirst(list, travel, draw) {
  const rows = list.map((d) => ({ d, depth: depthOf(d.z, travel) }));
  rows.sort((a, b) => b.depth - a.depth);
  for (const row of rows) draw(row.d);
}

function sky(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(top));
  g.addColorStop(1, rgba(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Ground plane: a fade to the horizon and lines that meet there. `turn` rotates those lines. */
function floor(ctx, v, color, turn = null) {
  const g = ctx.createLinearGradient(0, v.horizon, 0, v.h);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.2, rgba(color, 0.4));
  g.addColorStop(1, rgba(mix(color, [0, 0, 0], 0.28), 0.94));
  ctx.fillStyle = g;
  ctx.fillRect(0, v.horizon, v.w, v.h - v.horizon);
  ctx.strokeStyle = rgba(mix(color, [1, 1, 1], 0.45), 0.28);
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const p = projectGround(v, 0, i / 14);
    ctx.beginPath();
    ctx.moveTo(0, p.y);
    ctx.lineTo(v.w, p.y);
    ctx.stroke();
  }
  ctx.beginPath();
  if (turn == null) {
    for (let i = -7; i <= 7; i++) {
      ctx.moveTo(v.w * 0.5 + v.sway * 0.15, v.horizon);
      ctx.lineTo(v.w * 0.5 + i * v.w * 0.15, v.h);
    }
  } else {
    for (let i = 0; i < 18; i++) {
      const a = turn + (i / 18) * Math.PI;
      ctx.moveTo(v.w * 0.5 + v.sway * 0.15, v.horizon);
      ctx.lineTo(v.w * 0.5 + Math.cos(a) * v.w * 0.95, v.h + 8);
    }
  }
  ctx.stroke();
}

/** One rank of a wave. The crest leans forward and carries a single line of foam. */
function waveRank(ctx, v, z, phase, tone, foam, scale = 1) {
  const p = projectGround(v, 0, z);
  const amp = (16 + p.near * 72) * scale;
  const pts = [];
  for (let x = -40; x <= v.w + 40; x += 6) {
    const u = x * 0.0054 + phase;
    const s = Math.sin(u);
    const front = Math.pow(Math.max(0, s), 0.5);
    const lean = Math.max(0, Math.cos(u)) * front * amp * 0.42;
    pts.push({ x: x + lean, y: p.y - front * amp, front });
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, v.h);
  for (const pt of pts) ctx.lineTo(pt.x, pt.y);
  ctx.lineTo(v.w, v.h);
  ctx.closePath();
  const face = mix(tone.water, tone.cloud, 0.28);
  const deep = mix(tone.water, [0.02, 0.04, 0.08], 0.35);
  const g = ctx.createLinearGradient(0, p.y - amp, 0, Math.min(v.h, p.y + amp));
  g.addColorStop(0, rgba(face, 0.15 + p.near * 0.55));
  g.addColorStop(0.45, rgba(tone.water, 0.35 + p.near * 0.4));
  g.addColorStop(1, rgba(deep, 0.05));
  ctx.fillStyle = g;
  ctx.fill();
  if (foam) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(tone.cloud, 0.92);
    ctx.lineWidth = 2.2 + p.near * 4;
    let drawing = false;
    ctx.beginPath();
    for (const pt of pts) {
      if (pt.front > 0.62) {
        if (!drawing) { ctx.moveTo(pt.x, pt.y); drawing = true; }
        else ctx.lineTo(pt.x, pt.y);
      } else if (drawing) {
        ctx.stroke();
        ctx.beginPath();
        drawing = false;
      }
    }
    if (drawing) ctx.stroke();
    ctx.strokeStyle = rgba(mix(tone.cloud, tone.water, 0.35), 0.7);
    ctx.lineWidth = 1.4 + p.near * 2.4;
    drawing = false;
    ctx.beginPath();
    for (const pt of pts) {
      const x = pt.x + amp * 0.06;
      const y = pt.y + pt.front * amp * 0.2;
      if (pt.front > 0.78) {
        if (!drawing) { ctx.moveTo(x, y); drawing = true; }
        else ctx.lineTo(x, y);
      } else if (drawing) {
        ctx.stroke();
        ctx.beginPath();
        drawing = false;
      }
    }
    if (drawing) ctx.stroke();
  }
  ctx.restore();
}

function ocean(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, tone.zenith, mix(tone.horizon, tone.water, 0.25));
  for (let i = 0; i < 7; i++) {
    const z = 0.92 - i * 0.11;
    const phase = t * (0.42 + i * 0.05) + i * 1.35;
    waveRank(ctx, v, z, phase, tone, true);
  }
}

function aurora(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, mix(tone.zenith, [0.02, 0.04, 0.08], 0.7), mix(tone.horizon, [0.02, 0.05, 0.06], 0.45));
  floor(ctx, v, mix(tone.grass, [0, 0, 0], 0.55));
  const sheets = field('aurora', 7, 3);
  ctx.globalCompositeOperation = 'lighter';
  farFirst(sheets, 0, (d) => {
    const p = projectSpace(v, d.x * 0.8, 0.15, d.z);
    const hue = d.s > 1 ? tone.glow : mix(tone.grass, tone.glow, 0.45);
    ctx.fillStyle = rgba(hue, 0.22 + p.near * 0.4);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 90 * p.s);
    for (let i = 0; i <= 8; i++) {
      const yy = p.y - 90 * p.s + i * 24 * p.s;
      const sway = Math.sin(t * 0.7 + d.p + i * 0.45) * 42 * p.s;
      ctx.lineTo(p.x + sway, yy);
    }
    ctx.lineTo(p.x + 28 * p.s, p.y + 30 * p.s);
    ctx.lineTo(p.x + 28 * p.s, p.y - 90 * p.s);
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
}

function stars(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0, 0, 0.04], 0.8), mix(tone.horizon, [0.02, 0.02, 0.08], 0.55));
  const list = field('stars', 150, 7);
  const rows = list.map((d) => ({ d, radius: 0.12 + d.z * 0.9 }));
  rows.sort((a, b) => a.radius - b.radius);
  for (const { d, radius } of rows) {
    const turn = t * (0.08 + d.z * 0.06);
    const p = orbit(w, h, d.p + turn, radius, (d.y * 0.15) * h);
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.2 + d.p));
    ctx.fillStyle = rgba(tone.cloud, tw);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (0.7 + d.s * 1.5) * p.s * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rain(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, mix(tone.zenith, [0.12, 0.14, 0.18], 0.55), mix(tone.horizon, [0.16, 0.18, 0.22], 0.4));
  floor(ctx, v, mix(tone.water, [0.05, 0.06, 0.08], 0.4));
  const list = field('rain', 90, 11);
  ctx.strokeStyle = rgba(tone.cloud, 0.55);
  for (const d of list) {
    const depth = 0.25 + d.z * 0.75;
    const fall = ((d.y + 1) * 0.5 + t * (0.22 + depth * 0.35)) % 1;
    const x = w * (0.5 + d.x * 0.48) + Math.sin(t * 0.15) * 16 * depth;
    const y = fall * h;
    const len = (14 + d.s * 20) * depth;
    ctx.lineWidth = Math.max(1, depth * 2.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * 0.18, y + len);
    ctx.stroke();
    if (fall > 0.92) {
      ctx.beginPath();
      ctx.ellipse(x, h * 0.72 + d.z * h * 0.2, (1 - (fall - 0.92) / 0.08) * 10 * depth, 3 * depth, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function snow(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, mix(tone.zenith, tone.fog, 0.5), mix(tone.horizon, tone.cloud, 0.35));
  floor(ctx, v, mix(tone.cloud, tone.fog, 0.4));
  const list = field('snow', 80, 13);
  for (const d of list) {
    const depth = 0.3 + d.z * 0.7;
    const fall = ((d.y + 1) * 0.5 + t * (0.06 + depth * 0.08)) % 1;
    const x = w * (0.5 + d.x * 0.46) + Math.sin(t * 0.4 + d.p) * 28 * depth;
    const y = fall * h;
    ctx.fillStyle = rgba(tone.cloud, 0.45 + depth * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, (1.6 + d.s * 2.2) * depth * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dusk(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const sunX = w * (0.5 + Math.sin(t * 0.08) * 0.28);
  const sunY = h * 0.34;
  const g = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, w * 0.42);
  g.addColorStop(0, rgba(tone.glow, 0.95));
  g.addColorStop(0.25, rgba(tone.horizon, 0.45));
  g.addColorStop(1, rgba(tone.horizon, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const clouds = field('dusk', 6, 5);
  for (const d of clouds) {
    const depth = 0.35 + d.z * 0.65;
    const x = ((d.x + 1) * 0.5 + t * 0.012 * depth) % 1;
    const px = (x * 1.3 - 0.15) * w;
    const py = h * (0.16 + d.s * 0.08);
    ctx.fillStyle = rgba(tone.cloud, 0.14 + depth * 0.2);
    ctx.beginPath();
    ctx.ellipse(px, py, (80 + d.s * 50) * depth, 20 * depth, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  floor(ctx, v, mix(tone.grass, [0, 0, 0], 0.45));
}

function forest(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, mix(tone.zenith, tone.fog, 0.2), tone.horizon);
  floor(ctx, v, mix(tone.grass, [0, 0, 0], 0.2));
  const trees = field('forest', 28, 17);
  const vx = v.w * 0.5;
  farFirst(trees, 0, (d) => {
    const side = d.x < 0 ? -1 : 1;
    const p = projectGround(v, side * (0.32 + Math.abs(d.x) * 0.7), d.z);
    const sway = Math.sin(t * 0.9 + d.p) * 16 * p.s;
    const th = (90 + d.s * 70) * p.s;
    const tw = (16 + d.s * 14) * p.s;
    ctx.fillStyle = rgba(mix(tone.grass, [0, 0, 0], 0.55), 1);
    ctx.beginPath();
    ctx.moveTo(p.x + (vx - p.x) * 0.22 + sway * 0.4, p.y - th * 0.78);
    ctx.lineTo(p.x - tw * 0.15, p.y);
    ctx.lineTo(p.x + tw * 0.9, p.y);
    ctx.fill();
    ctx.fillStyle = rgba(mix(tone.grass, [0, 0, 0], 0.08 + (1 - p.near) * 0.4), 1);
    ctx.beginPath();
    ctx.moveTo(p.x + sway, p.y - th);
    ctx.lineTo(p.x - tw, p.y);
    ctx.lineTo(p.x + tw, p.y);
    ctx.fill();
    ctx.fillStyle = rgba(mix(tone.grass, [0, 0, 0], 0.62), 1);
    ctx.fillRect(p.x - tw * 0.12, p.y - th * 0.08, tw * 0.24, th * 0.22);
  });
}

function dunes(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, mix(tone.zenith, tone.glow, 0.15), tone.horizon);
  for (let i = 0; i < 7; i++) {
    const p = projectGround(v, 0, 0.88 - i * 0.1);
    const amp = 12 + p.near * 40;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const roll = Math.sin(x * 0.006 + t * 0.22 + i * 0.8);
      const crest = Math.pow(Math.max(0, roll), 1.4);
      ctx.lineTo(x + crest * amp * 0.25, p.y - crest * amp);
    }
    ctx.lineTo(w, h);
    ctx.fillStyle = rgba(mix(tone.sand, tone.horizon, (1 - p.near) * 0.45));
    ctx.fill();
  }
  const gust = field('dunes', 24, 41);
  for (const d of gust) {
    const y = ((d.y + 1) * 0.5 + t * 0.04) % 1;
    const x = ((d.x + 1) * 0.5 + t * (0.03 + d.s * 0.02)) % 1;
    ctx.fillStyle = rgba(tone.sand, 0.35);
    ctx.fillRect(x * w, v.horizon + y * (h - v.horizon), (10 + d.s * 16), 2);
  }
}

function city(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0.035);
  sky(ctx, w, h, mix(tone.zenith, [0.04, 0.05, 0.1], 0.45), mix(tone.horizon, [0.08, 0.06, 0.14], 0.3));
  floor(ctx, v, mix([0.05, 0.06, 0.09], tone.horizon, 0.2));
  const blocks = field('city', 18, 19);
  const vx = v.w * 0.5 + v.sway * 0.15;
  farFirst(blocks, v.travel, (d) => {
    const side = d.x < 0 ? -1 : 1;
    const p = projectGround(v, side * (0.42 + Math.abs(d.y) * 0.55), d.z);
    const bw = (36 + d.s * 30) * p.s;
    const bh = (90 + d.s * 150) * p.s;
    const x0 = p.x - bw / 2;
    const y0 = p.y - bh;
    const nearX = side < 0 ? x0 + bw : x0;
    const farX = nearX + (vx - nearX) * 0.28;
    const topFar = y0 + (v.horizon - y0) * 0.28;
    const botFar = p.y + (v.horizon - p.y) * 0.28;
    ctx.fillStyle = rgba(mix([0.02, 0.03, 0.05], tone.horizon, 0.15), 1);
    ctx.beginPath();
    ctx.moveTo(nearX, y0);
    ctx.lineTo(farX, topFar);
    ctx.lineTo(farX, botFar);
    ctx.lineTo(nearX, p.y);
    ctx.fill();
    ctx.fillStyle = rgba(mix([0.07, 0.09, 0.14], tone.horizon, 0.25), 1);
    ctx.fillRect(x0, y0, bw, bh);
    const win = 0.5 + 0.5 * Math.sin(t * 3 + d.p);
    ctx.fillStyle = rgba(tone.glow, win > 0.35 ? 0.92 : 0.16);
    for (let row = 10 * p.s; row < bh - 8 * p.s; row += 14 * p.s) {
      ctx.fillRect(x0 + bw * 0.16, p.y - row, Math.max(2, bw * 0.2), Math.max(2, 4 * p.s));
      ctx.fillRect(x0 + bw * 0.58, p.y - row, Math.max(2, bw * 0.2), Math.max(2, 4 * p.s));
    }
  });
}

function nebula(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0.04, 0, 0.08], 0.55), mix(tone.horizon, [0.02, 0, 0.05], 0.4));
  const blobs = field('nebula', 9, 23);
  ctx.globalCompositeOperation = 'lighter';
  const rows = [...blobs].sort((a, b) => a.z - b.z);
  for (const d of rows) {
    const radius = 0.2 + d.z * 0.65;
    const spin = t * 0.1 * (d.s > 1 ? 1 : -1);
    const p = orbit(w, h, d.p + spin, radius, d.y * h * 0.08);
    const color = d.s > 1.2 ? tone.glow : d.s > 0.7 ? tone.water : tone.grass;
    const r = (50 + d.s * 80) * p.s;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, rgba(color, 0.45));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function bokeh(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, mix(tone.horizon, tone.zenith, 0.35));
  const list = field('bokeh', 22, 29);
  const rows = [...list].sort((a, b) => a.z - b.z);
  for (const d of rows) {
    const drift = t * 0.12 + d.p;
    const x = w * (0.5 + d.x * 0.38) + Math.cos(drift) * 24;
    const y = h * (0.5 + d.y * 0.32) + Math.sin(drift * 0.8) * 18;
    const r = (18 + d.s * 36) * (0.55 + 0.45 * Math.sin(t * 0.6 + d.p));
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.abs(r));
    g.addColorStop(0, rgba(d.s > 1 ? tone.glow : tone.cloud, 0.35));
    g.addColorStop(1, rgba(tone.glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, Math.abs(r), 0, Math.PI * 2);
    ctx.fill();
  }
}

function grid(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, tone.zenith, tone.horizon);
  floor(ctx, v, mix(tone.glow, tone.horizon, 0.65), t * 0.22);
}

function ribbons(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const colors = [tone.glow, tone.water, tone.grass, tone.sand];
  colors.forEach((color, band) => {
    ctx.strokeStyle = rgba(color, 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const along = i / 48;
      const a = t * 0.45 + along * Math.PI * 3 + band * 1.15;
      const radius = 0.12 + along * 0.82;
      const x = w * 0.5 + Math.cos(a) * radius * w * 0.36;
      const y = h * 0.12 + along * h * 0.78 + Math.sin(a * 2) * 10;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  });
}

function embers(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, mix(tone.zenith, [0.08, 0.02, 0.02], 0.6), mix(tone.horizon, [0.18, 0.05, 0.02], 0.4));
  floor(ctx, v, mix(tone.glow, [0.05, 0.01, 0], 0.55));
  const list = field('embers', 60, 37);
  for (const d of list) {
    const rise = ((d.y + 1) * 0.5 - t * (0.05 + d.s * 0.04)) % 1;
    const yNorm = rise < 0 ? rise + 1 : rise;
    const depth = 0.35 + d.z * 0.65;
    const x = w * (0.5 + d.x * 0.32) + Math.sin(t * 0.5 + d.p) * 18;
    const y = h * (0.95 - yNorm * 0.8);
    ctx.fillStyle = rgba(d.s > 1 ? tone.glow : tone.sand, 0.4 + depth * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, (1.4 + d.s) * depth * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function lake(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, tone.zenith, tone.horizon);
  ctx.fillStyle = rgba(mix(tone.grass, [0, 0, 0], 0.2), 1);
  ctx.fillRect(0, v.horizon - 6, w, h);
  ctx.fillStyle = rgba(tone.water, 0.9);
  ctx.beginPath();
  ctx.moveTo(0, v.horizon + 18);
  for (let x = 0; x <= w; x += 16) ctx.lineTo(x, v.horizon + 8 + Math.sin(x * 0.012) * 7);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const z = 0.82 - i * 0.1;
    const phase = t * 0.55 + i * 0.9;
    waveRank(ctx, v, z, phase, tone, i > 2, 0.42);
  }
  const ripples = field('lake', 4, 71);
  for (const d of ripples) {
    const life = (t * 0.12 + d.z) % 1;
    const cx = w * (0.25 + (d.x * 0.5 + 0.5) * 0.5);
    const cy = v.horizon + (0.3 + (d.y * 0.5 + 0.5) * 0.4) * (h - v.horizon);
    const rx = 8 + life * (36 + d.s * 50);
    ctx.strokeStyle = rgba(tone.cloud, (1 - life) * 0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, rx * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function sunrise(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, tone.zenith, tone.horizon);
  floor(ctx, v, mix(tone.grass, [0, 0, 0], 0.35));
  const sun = projectGround(v, Math.sin(t * 0.12) * 0.35, 0.86);
  ctx.strokeStyle = rgba(tone.glow, 0.45);
  ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI + t * 0.35;
    ctx.beginPath();
    ctx.moveTo(sun.x + Math.cos(a) * 16, sun.y + Math.sin(a) * 6);
    ctx.lineTo(sun.x + Math.cos(a) * 90, sun.y + Math.sin(a) * 28);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(tone.glow);
  ctx.beginPath();
  ctx.ellipse(sun.x, sun.y, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function fireflies(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, mix(tone.zenith, [0, 0.04, 0.02], 0.72), mix(tone.grass, [0, 0, 0], 0.6));
  floor(ctx, v, mix(tone.grass, [0, 0, 0], 0.5));
  const list = field('flies', 36, 43);
  for (const d of list) {
    const depth = 0.3 + d.z * 0.7;
    const x = w * (0.5 + d.x * 0.4) + Math.cos(t * 0.5 + d.p) * 22 * depth;
    const y = h * (0.35 + (d.y * 0.5 + 0.5) * 0.5) + Math.sin(t * 0.7 * d.s + d.p) * 16;
    const r = 16 * depth;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(tone.glow, 0.7));
    g.addColorStop(1, rgba(tone.glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function geometry(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const shapes = field('geom', 8, 47);
  const colors = [tone.glow, tone.water, tone.grass, tone.sand, tone.cloud];
  const rows = [...shapes].sort((a, b) => a.z - b.z);
  for (const d of rows) {
    const dir = d.x < 0 ? -1 : 1;
    const p = orbit(w, h, d.p + t * 0.28 * dir, 0.28 + d.z * 0.7, d.y * 20);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t * (0.7 + d.s * 0.25) * dir);
    ctx.strokeStyle = rgba(colors[Math.floor(d.s * 2) % colors.length], 0.85);
    ctx.lineWidth = Math.max(1.5, 2.4 * p.s);
    ctx.beginPath();
    const sides = 3 + Math.floor(d.s * 2) % 4;
    const r = (22 + d.s * 18) * p.s * 1.6;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function ink(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, tone.fog, 0.3), tone.horizon);
  const drops = field('ink', 7, 53);
  const colors = [tone.water, tone.grass, tone.glow];
  for (const d of drops) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 0.5 + d.p);
    const p = orbit(w, h, d.p + t * 0.05, 0.2 + d.z * 0.6, d.y * 30);
    const r = (40 + d.s * 50) * pulse * p.s;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    const color = colors[Math.floor(d.s * 3) % 3];
    g.addColorStop(0, rgba(color, 0.4));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function petals(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, mix(tone.zenith, tone.cloud, 0.2), tone.horizon);
  floor(ctx, v, mix(tone.grass, tone.sand, 0.35));
  const list = field('petals', 28, 59);
  for (const d of list) {
    const fall = ((d.y + 1) * 0.5 + t * (0.05 + d.s * 0.03)) % 1;
    const x = w * (0.5 + d.x * 0.42) + Math.sin(t * 0.6 + d.p) * 30;
    const y = fall * h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * d.s + d.p);
    ctx.fillStyle = rgba(d.s > 1 ? tone.glow : tone.sand, 0.8);
    ctx.beginPath();
    ctx.ellipse(0, 0, (7 + d.s * 4) * (0.5 + d.z), (3 + d.s) * (0.5 + d.z), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function mountains(ctx, w, h, t, tone) {
  const v = view(w, h, t, 0);
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const layers = [tone.fog, mix(tone.grass, tone.fog, 0.4), tone.grass, mix(tone.grass, [0, 0, 0], 0.35)];
  layers.forEach((color, i) => {
    const p = projectGround(v, 0, 0.72 - i * 0.08);
    const drift = t * (6 + i * 4);
    ctx.fillStyle = rgba(color, 0.62 + p.near * 0.35);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = -80; x <= w + 80; x += 16) {
      const n = Math.sin((x + drift) * 0.006 + i) * 0.65 + Math.sin((x + drift) * 0.016 + i * 2) * 0.35;
      ctx.lineTo(x, p.y - (0.35 + Math.abs(n) * 0.65) * (36 + p.near * 110));
    }
    ctx.lineTo(w, h);
    ctx.fill();
  });
}

const PAINT = {
  ocean, aurora, stars, rain, snow, dusk, forest, dunes, city, nebula, bokeh, grid, ribbons, embers, lake, sunrise, fireflies, geometry, ink, petals, mountains,
};

/** Draws one frame. `valley` is the WebGL landscape, not painted here. */
export function paintStartScene(id, ctx, width, height, time, tone) {
  const paint = PAINT[id];
  if (!paint || width < 2 || height < 2) return;
  ctx.clearRect(0, 0, width, height);
  paint(ctx, width, height, time, tone);
}
