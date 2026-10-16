// Painted backgrounds for the start page. `valley` is the WebGL landscape in
// startbg.js; every other id is drawn here. Motion scales time: 0 holds one frame.

export const START_SCENE_IDS = [
  'valley', 'ocean', 'aurora', 'stars', 'rain', 'snow', 'dusk', 'forest', 'dunes', 'city',
  'nebula', 'bokeh', 'grid', 'ribbons', 'embers', 'lake', 'sunrise', 'fireflies', 'geometry', 'ink',
  'petals', 'mountains',
];

const MOTION = { off: 0, slow: 0.2, medium: 0.55, fast: 1 };

export const START_MOTION_IDS = Object.keys(MOTION);

export function startSceneId(id) {
  return START_SCENE_IDS.includes(id) ? id : 'valley';
}

export function startMotionId(id) {
  return id in MOTION ? id : 'slow';
}

/** 0 holds the picture still. `slow` matches the original valley speed. */
export function motionScale(id) {
  return MOTION[startMotionId(id)];
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

function dots(cache, id, n, seed) {
  const key = `${id}:${n}`;
  let list = cache.get(key);
  if (list) return list;
  const next = rand(seed);
  list = Array.from({ length: n }, () => ({
    x: next(), y: next(), s: 0.35 + next() * 1.8, p: next() * Math.PI * 2, v: 0.15 + next() * 1.1, w: 0.4 + next() * 2.2,
  }));
  cache.set(key, list);
  return list;
}

function sky(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(top));
  g.addColorStop(1, rgba(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function ocean(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  for (let i = 0; i < 8; i++) {
    const y = h * (0.42 + i * 0.07);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const wave = Math.sin(x * 0.012 + t * (0.8 + i * 0.15) + i) * (10 + i * 3) + Math.sin(x * 0.005 - t * 0.4) * 8;
      ctx.lineTo(x, y + wave);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = rgba(mix(tone.water, tone.horizon, i / 10), 0.55 + i * 0.04);
    ctx.fill();
  }
}

function aurora(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0.02, 0.04, 0.08], 0.65), mix(tone.horizon, [0.02, 0.05, 0.06], 0.4));
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = w * (0.15 + i * 0.16) + Math.sin(t * 0.4 + i) * 40;
    const g = ctx.createLinearGradient(x, 0, x + 80, h * 0.75);
    const hue = i % 2 ? tone.glow : mix(tone.grass, tone.glow, 0.4);
    g.addColorStop(0, rgba(hue, 0));
    g.addColorStop(0.45, rgba(hue, 0.35));
    g.addColorStop(1, rgba(hue, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.05);
    for (let y = 0; y <= h * 0.8; y += 16) ctx.lineTo(x + Math.sin(y * 0.02 + t + i) * 36, y);
    ctx.lineTo(x + 70, h * 0.8);
    ctx.lineTo(x + 70, 0);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function stars(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0, 0, 0.05], 0.75), mix(tone.horizon, [0.02, 0.03, 0.08], 0.5));
  const list = dots(stars.cache, 'stars', 140, 7);
  for (const d of list) {
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * d.v * 2 + d.p));
    ctx.fillStyle = rgba(tone.cloud, tw);
    ctx.beginPath();
    ctx.arc((d.x * w + t * 4) % w, d.y * h, d.s * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
stars.cache = new Map();

function rain(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0.15, 0.18, 0.22], 0.5), mix(tone.horizon, [0.2, 0.22, 0.26], 0.35));
  ctx.strokeStyle = rgba(tone.cloud, 0.45);
  ctx.lineWidth = 1.2;
  const list = dots(rain.cache, 'rain', 90, 11);
  for (const d of list) {
    const y = ((d.y + t * d.v * 0.35) % 1) * h;
    const x = (d.x * w + y * 0.2) % w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 6, y + 18 + d.s * 8);
    ctx.stroke();
  }
}
rain.cache = new Map();

function snow(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, tone.fog, 0.45), mix(tone.horizon, tone.cloud, 0.4));
  const list = dots(snow.cache, 'snow', 80, 13);
  for (const d of list) {
    const y = ((d.y + t * d.v * 0.08) % 1) * h;
    const x = (d.x * w + Math.sin(t * 0.6 + d.p) * 24) % w;
    ctx.fillStyle = rgba(tone.cloud, 0.75);
    ctx.beginPath();
    ctx.arc(x < 0 ? x + w : x, y, 1.2 + d.s * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
snow.cache = new Map();

function dusk(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const sunX = w * (0.5 + Math.sin(t * 0.15) * 0.28);
  const sunY = h * (0.62 + Math.cos(t * 0.12) * 0.06);
  const g = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, w * 0.45);
  g.addColorStop(0, rgba(tone.glow, 0.95));
  g.addColorStop(0.2, rgba(tone.horizon, 0.55));
  g.addColorStop(1, rgba(tone.horizon, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(mix(tone.grass, [0, 0, 0], 0.55));
  ctx.beginPath();
  ctx.moveTo(0, h * 0.72);
  for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * 0.72 - Math.abs(Math.sin(x * 0.01 + 1)) * h * 0.12);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
}

function forest(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, tone.fog, 0.25), tone.horizon);
  for (let layer = 0; layer < 3; layer++) {
    const base = h * (0.55 + layer * 0.14);
    ctx.fillStyle = rgba(mix(tone.grass, [0, 0, 0], 0.15 + layer * 0.22));
    ctx.beginPath();
    ctx.moveTo(0, h);
    const step = 28 - layer * 4;
    for (let x = -20; x <= w + step; x += step) {
      const sway = Math.sin(t * 0.8 + x * 0.02 + layer) * 6;
      const top = base - (50 + layer * 28 + (x % 17));
      ctx.lineTo(x + sway, top);
      ctx.lineTo(x + step * 0.55, base);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }
}

function dunes(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, tone.glow, 0.2), tone.horizon);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const y = h * (0.48 + i * 0.1);
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) {
      const d = Math.sin(x * 0.008 + t * 0.25 + i) * 18 + Math.sin(x * 0.02 + i) * 8;
      ctx.lineTo(x, y + d);
    }
    ctx.lineTo(w, h);
    ctx.fillStyle = rgba(mix(tone.sand, tone.horizon, i / 8));
    ctx.fill();
  }
}

function city(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0.05, 0.06, 0.12], 0.4), mix(tone.horizon, [0.1, 0.08, 0.16], 0.3));
  const list = dots(city.cache, 'city', 18, 19);
  list.forEach((d, i) => {
    const bw = w / 18;
    const bh = h * (0.22 + d.y * 0.4);
    const x = i * bw;
    ctx.fillStyle = rgba(mix(tone.grass, [0.04, 0.05, 0.08], 0.72));
    ctx.fillRect(x + 2, h - bh, bw - 4, bh);
    for (let wy = h - bh + 8; wy < h - 8; wy += 12) {
      for (let wx = x + 6; wx < x + bw - 8; wx += 8) {
        const on = 0.5 + 0.5 * Math.sin(t * 1.4 + wx * 0.2 + wy);
        ctx.fillStyle = rgba(tone.glow, on > 0.55 ? 0.85 : 0.12);
        ctx.fillRect(wx, wy, 3, 4);
      }
    }
  });
}
city.cache = new Map();

function nebula(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0.05, 0, 0.08], 0.5), mix(tone.horizon, [0.02, 0, 0.06], 0.4));
  ctx.globalCompositeOperation = 'lighter';
  const blobs = [[0.3, 0.4, tone.glow], [0.7, 0.55, tone.water], [0.5, 0.3, tone.grass]];
  blobs.forEach(([x, y, color], i) => {
    const cx = w * x + Math.sin(t * 0.3 + i) * 50;
    const cy = h * y + Math.cos(t * 0.25 + i) * 30;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.35);
    g.addColorStop(0, rgba(color, 0.55));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.globalCompositeOperation = 'source-over';
}

function bokeh(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, mix(tone.horizon, tone.zenith, 0.4));
  const list = dots(bokeh.cache, 'bokeh', 28, 23);
  for (const d of list) {
    const x = (d.x * w + Math.sin(t * d.v + d.p) * 30) % w;
    const y = (d.y * h + t * 8 * d.v) % h;
    const r = 18 + d.s * 36;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(d.s > 1 ? tone.glow : tone.cloud, 0.45));
    g.addColorStop(1, rgba(tone.glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
bokeh.cache = new Map();

function grid(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const horizon = h * 0.42;
  ctx.strokeStyle = rgba(tone.glow, 0.45);
  ctx.lineWidth = 1;
  const shift = (t * 40) % 40;
  for (let i = -2; i < 24; i++) {
    const z = (i * 40 + shift) / 400;
    const y = horizon + z * z * h * 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const vanish = w / 2 + Math.sin(t * 0.2) * 30;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(vanish, horizon);
    ctx.lineTo(vanish + i * w * 0.16, h);
    ctx.stroke();
  }
}

function ribbons(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const colors = [tone.glow, tone.water, tone.grass, tone.sand];
  colors.forEach((color, i) => {
    ctx.beginPath();
    const y0 = h * (0.28 + i * 0.14);
    ctx.moveTo(0, y0);
    for (let x = 0; x <= w; x += 10) {
      const y = y0 + Math.sin(x * 0.01 + t * (0.7 + i * 0.2)) * 28 + Math.sin(x * 0.03 - t) * 10;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(color, 0.8);
    ctx.lineWidth = 8;
    ctx.stroke();
  });
}

function embers(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0.08, 0.02, 0.02], 0.55), mix(tone.horizon, [0.2, 0.05, 0.02], 0.4));
  const list = dots(embers.cache, 'embers', 70, 29);
  for (const d of list) {
    const y = h - ((d.y + t * d.v * 0.12) % 1) * h;
    const x = (d.x * w + Math.sin(t + d.p) * 16) % w;
    ctx.fillStyle = rgba(d.s > 1 ? tone.glow : tone.sand, 0.8);
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + d.s, 0, Math.PI * 2);
    ctx.fill();
  }
}
embers.cache = new Map();

function lake(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const split = h * 0.48;
  ctx.fillStyle = rgba(tone.water, 0.85);
  ctx.fillRect(0, split, w, h - split);
  ctx.strokeStyle = rgba(tone.cloud, 0.35);
  for (let i = 0; i < 10; i++) {
    const y = split + 12 + i * ((h - split) / 11);
    ctx.beginPath();
    const amp = 3 + i;
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.02 + t * 1.2 + i) * amp);
    ctx.stroke();
  }
}

function sunrise(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const ang = t * 0.2;
  const sunX = w * 0.5 + Math.sin(ang) * w * 0.32;
  const sunY = h * 0.72 - Math.abs(Math.sin(ang)) * h * 0.38;
  ctx.strokeStyle = rgba(tone.glow, 0.35);
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI + t * 0.1;
    ctx.beginPath();
    ctx.moveTo(sunX + Math.cos(a) * 28, sunY + Math.sin(a) * 28);
    ctx.lineTo(sunX + Math.cos(a) * 90, sunY + Math.sin(a) * 90);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(tone.glow);
  ctx.beginPath();
  ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(mix(tone.grass, [0, 0, 0], 0.45));
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
}

function fireflies(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, [0, 0.04, 0.02], 0.7), mix(tone.grass, [0, 0, 0], 0.65));
  const list = dots(fireflies.cache, 'flies', 36, 31);
  for (const d of list) {
    const x = w * (0.5 + Math.sin(t * d.v * 0.35 + d.p) * d.x * 0.45);
    const y = h * (0.5 + Math.cos(t * d.v * 0.28 + d.p) * d.y * 0.4);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
    g.addColorStop(0, rgba(tone.glow, 0.9));
    g.addColorStop(1, rgba(tone.glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}
fireflies.cache = new Map();

function geometry(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const colors = [tone.glow, tone.water, tone.grass, tone.sand, tone.cloud];
  for (let i = 0; i < 7; i++) {
    const x = w * (0.12 + (i % 4) * 0.24);
    const y = h * (0.28 + Math.floor(i / 4) * 0.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * (0.25 + i * 0.05) * (i % 2 ? 1 : -1));
    ctx.strokeStyle = rgba(colors[i % colors.length], 0.85);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const sides = 3 + (i % 4);
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const r = 28 + (i % 3) * 16;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function ink(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, tone.fog, 0.3), tone.horizon);
  const colors = [tone.water, tone.grass, tone.glow];
  colors.forEach((color, i) => {
    const x = w * (0.3 + i * 0.2) + Math.sin(t * 0.4 + i) * 40;
    const y = h * 0.5 + Math.cos(t * 0.3 + i * 2) * 30;
    const r = 70 + Math.sin(t + i) * 24;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, 0.55));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function petals(ctx, w, h, t, tone) {
  sky(ctx, w, h, mix(tone.zenith, tone.cloud, 0.25), tone.horizon);
  const list = dots(petals.cache, 'petals', 24, 37);
  for (const d of list) {
    const y = ((d.y + t * d.v * 0.06) % 1) * h;
    const x = (d.x * w + Math.sin(t * 0.5 + d.p) * 40) % w;
    ctx.save();
    ctx.translate(x < 0 ? x + w : x, y);
    ctx.rotate(t * d.v + d.p);
    ctx.fillStyle = rgba(d.s > 1 ? tone.glow : tone.sand, 0.8);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
petals.cache = new Map();

function mountains(ctx, w, h, t, tone) {
  sky(ctx, w, h, tone.zenith, tone.horizon);
  const layers = [tone.fog, mix(tone.grass, tone.fog, 0.45), tone.grass, mix(tone.grass, [0, 0, 0], 0.35)];
  layers.forEach((color, i) => {
    const base = h * (0.42 + i * 0.12);
    const drift = t * (8 + i * 10);
    ctx.fillStyle = rgba(color);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = -40; x <= w + 40; x += 16) {
      const n = Math.sin((x + drift) * 0.008 + i) * 0.6 + Math.sin((x + drift) * 0.02 + i * 2) * 0.4;
      ctx.lineTo(x, base - Math.abs(n) * (70 - i * 8));
    }
    ctx.lineTo(w, h);
    ctx.fill();
  });
}

const PAINT = {
  ocean, aurora, stars, rain, snow, dusk, forest, dunes, city, nebula, bokeh, grid, ribbons, embers, lake, sunrise, fireflies, geometry, ink, petals, mountains,
};

/** Draws one frame of a flat scene. `valley` is not painted here. */
export function paintStartScene(id, ctx, width, height, time, tone) {
  const paint = PAINT[id];
  if (!paint || width < 2 || height < 2) return;
  ctx.clearRect(0, 0, width, height);
  paint(ctx, width, height, time, tone);
}
