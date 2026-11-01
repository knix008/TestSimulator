// Start-screen backgrounds: 21 moving 3D scenes about reading, books and
// paper, drawn on a 2D canvas through a small perspective projection (no 3D
// library). Each scene is { id, init(w, h, rand), draw(ctx, state, f) } where
// f = { t, dt, w, h, c } — t and dt are already scaled by the chosen speed,
// and c holds the theme's colours as [r, g, b].

export const START_BG_IDS = [
  'books', 'pages', 'stars', 'letters', 'planes',
  'tunnel', 'waves', 'galaxy', 'cubes', 'helix',
  'knot', 'sphere', 'bubbles', 'snow', 'fireflies',
  'constellation', 'aurora', 'hexgrid', 'orbits', 'terrain',
  'ink',
];

export const START_BG_DEFAULT = 'books';
export const START_OPACITY_MIN = 0.1;
export const START_OPACITY_MAX = 1;
export const START_OPACITY_DEFAULT = 0.6;
export const START_SPEED_MIN = 0.1;
export const START_SPEED_MAX = 3;
export const START_SPEED_DEFAULT = 1;

// Change the background by itself every n seconds (0 = never).
export const START_INTERVALS = [0, 15, 30, 60, 120, 300];

export function normalizeStartInterval(n) {
  const v = Number(n);
  return START_INTERVALS.includes(v) ? v : 0;
}

// The next background: a random other one, or simply the next in the list.
export function nextStartBg(id, { random = false, rand = Math.random } = {}) {
  const cur = normalizeStartBg(id);
  if (random) {
    const others = START_BG_IDS.filter((x) => x !== cur);
    return others[Math.floor(rand() * others.length) % others.length];
  }
  return START_BG_IDS[(START_BG_IDS.indexOf(cur) + 1) % START_BG_IDS.length];
}

export function normalizeStartBg(id) {
  return START_BG_IDS.includes(id) ? id : START_BG_DEFAULT;
}

function clampNum(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, Math.round(n * 100) / 100));
}

export const clampStartOpacity = (v) => clampNum(v, START_OPACITY_MIN, START_OPACITY_MAX, START_OPACITY_DEFAULT);
export const clampStartSpeed = (v) => clampNum(v, START_SPEED_MIN, START_SPEED_MAX, START_SPEED_DEFAULT);

// ── tiny 3D helpers ─────────────────────────────────────────
const TAU = Math.PI * 2;
const SPHERE_POINTS = 600;

// Deterministic random numbers, so a scene looks the same each time it starts.
export function makeRandom(seed = 7) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Camera at the origin looking down +z; returns screen x, y and scale.
export function project(x, y, z, w, h, fov = 0.85) {
  if (z <= 0.05) return null;
  const f = Math.min(w, h) * fov;
  const s = f / z;
  return { x: w / 2 + x * s, y: h / 2 + y * s, s };
}

function rotY(p, a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}
function rotX(p, a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}
function rotZ(p, a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

export function rgba(c, a) {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

// Fades things in from far away and out well before they reach the camera,
// so nothing swells into a screen-filling block as it passes.
const depthAlpha = (z, near = 1, far = 12) => Math.max(0, Math.min(1, (far - z) / (far - near)))
  * Math.max(0, Math.min(1, (z - near * 0.6) / (near * 1.4)));

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

const wrap = (v, lo, hi) => {
  const span = hi - lo;
  return ((((v - lo) % span) + span) % span) + lo;
};

// ── the scenes ──────────────────────────────────────────────
const SCENES = {
  // 1. Books floating toward you, turning slowly.
  books: {
    init: (w, h, r) => ({
      items: Array.from({ length: 46 }, () => ({
        x: (r() - 0.5) * 7, y: (r() - 0.5) * 4.5, z: 1 + r() * 13,
        ay: r() * TAU, ax: (r() - 0.5) * 0.8, spin: (r() - 0.5) * 0.8, tone: r(),
      })),
    }),
    draw(ctx, st, { dt, w, h, c }) {
      const list = st.items;
      for (const b of list) {
        b.z -= dt * 0.9;
        b.ay += dt * b.spin;
        if (b.z < 1.4) b.z += 13;
      }
      list.sort((a, b) => b.z - a.z);
      const W = 0.32; const H = 0.44; const D = 0.07;
      for (const b of list) {
        const corner = (dx, dy, dz) => {
          let p = rotX(rotY({ x: dx, y: dy, z: dz }, b.ay), b.ax);
          p = { x: p.x + b.x, y: p.y + b.y, z: p.z + b.z };
          return project(p.x, p.y, p.z, w, h);
        };
        const f = [corner(-W, -H, -D), corner(W, -H, -D), corner(W, H, -D), corner(-W, H, -D)];
        const s = [corner(-W, -H, -D), corner(-W, -H, D), corner(-W, H, D), corner(-W, H, -D)];
        if (f.some((p) => !p) || s.some((p) => !p)) continue;
        const a = depthAlpha(b.z, 2, 14);
        if (a <= 0.01) continue;
        const col = b.tone > 0.5 ? c.accent : c.text;
        ctx.fillStyle = rgba(col, a * 0.55);
        poly(ctx, f); ctx.fill();
        ctx.fillStyle = rgba(c.accent, a * 0.85);
        poly(ctx, s); ctx.fill();
        ctx.strokeStyle = rgba(c.text, a * 0.35);
        ctx.lineWidth = 1;
        poly(ctx, f); ctx.stroke();
      }
    },
  },

  // 2. Loose pages fluttering down.
  pages: {
    init: (w, h, r) => ({
      items: Array.from({ length: 42 }, () => ({
        x: (r() - 0.5) * 8, y: (r() - 0.5) * 6, z: 2 + r() * 10,
        ph: r() * TAU, sp: 0.4 + r() * 0.6,
      })),
    }),
    draw(ctx, st, { t, dt, w, h, c }) {
      st.items.sort((a, b) => b.z - a.z);
      for (const p of st.items) {
        p.y += dt * 0.35 * p.sp;
        p.x += Math.sin(t * 0.7 + p.ph) * dt * 0.3;
        if (p.y > 3.5) p.y -= 7;
        const ax = Math.sin(t * p.sp + p.ph) * 1.1;
        const ay = Math.cos(t * 0.6 * p.sp + p.ph) * 1.3;
        const pts = [[-0.22, -0.3], [0.22, -0.3], [0.22, 0.3], [-0.22, 0.3]].map(([dx, dy]) => {
          const q = rotY(rotX({ x: dx, y: dy, z: 0 }, ax), ay);
          return project(q.x + p.x, q.y + p.y, q.z + p.z, w, h);
        });
        if (pts.some((q) => !q)) continue;
        const a = depthAlpha(p.z, 1, 13);
        ctx.fillStyle = rgba(c.text, a * 0.22);
        poly(ctx, pts); ctx.fill();
        ctx.strokeStyle = rgba(c.accent, a * 0.6);
        ctx.lineWidth = 1;
        poly(ctx, pts); ctx.stroke();
        // a few lines of "text" on the page
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
          const k = i / 4;
          const l = { x: pts[0].x + (pts[3].x - pts[0].x) * k, y: pts[0].y + (pts[3].y - pts[0].y) * k };
          const rr = { x: pts[1].x + (pts[2].x - pts[1].x) * k, y: pts[1].y + (pts[2].y - pts[1].y) * k };
          ctx.moveTo(l.x + (rr.x - l.x) * 0.15, l.y + (rr.y - l.y) * 0.15);
          ctx.lineTo(l.x + (rr.x - l.x) * 0.85, l.y + (rr.y - l.y) * 0.85);
        }
        ctx.strokeStyle = rgba(c.text, a * 0.35);
        ctx.stroke();
      }
    },
  },

  // 3. A starfield you fly through.
  stars: {
    init: (w, h, r) => ({
      items: Array.from({ length: 420 }, () => ({ x: (r() - 0.5) * 16, y: (r() - 0.5) * 10, z: r() * 16 + 0.2 })),
    }),
    draw(ctx, st, { dt, w, h, c }) {
      for (const s of st.items) {
        const pz = s.z;
        s.z -= dt * 3;
        if (s.z < 0.2) { s.z += 16; continue; }
        const a = project(s.x, s.y, s.z, w, h);
        const b = project(s.x, s.y, pz, w, h);
        if (!a || !b) continue;
        const al = depthAlpha(s.z, 0.3, 16);
        ctx.strokeStyle = rgba(s.x > 0 ? c.text : c.accent, al);
        ctx.lineWidth = Math.max(0.6, a.s * 0.012);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
      }
    },
  },

  // 4. Letters falling through space.
  letters: {
    init: (w, h, r) => {
      const glyphs = '가나다라마바사아자차카타파하ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789§¶';
      return {
        items: Array.from({ length: 140 }, () => ({
          ch: glyphs[Math.floor(r() * glyphs.length)],
          x: (r() - 0.5) * 9, y: (r() - 0.5) * 7, z: 1.5 + r() * 11, sp: 0.4 + r(),
        })),
      };
    },
    draw(ctx, st, { dt, w, h, c }) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      st.items.sort((a, b) => b.z - a.z);
      for (const l of st.items) {
        l.y += dt * 0.6 * l.sp;
        if (l.y > 3.6) l.y -= 7.2;
        const p = project(l.x, l.y, l.z, w, h);
        if (!p) continue;
        const a = depthAlpha(l.z, 1, 13);
        ctx.font = `${Math.max(6, p.s * 0.28).toFixed(1)}px serif`;
        ctx.fillStyle = rgba(l.sp > 0.9 ? c.accent : c.text, a * 0.7);
        ctx.fillText(l.ch, p.x, p.y);
      }
    },
  },

  // 5. Paper planes gliding across, banking as they go.
  planes: {
    init: (w, h, r) => ({
      items: Array.from({ length: 26 }, () => ({
        x: (r() - 0.5) * 12, y: (r() - 0.5) * 4, z: 2 + r() * 9, ph: r() * TAU, sp: 0.6 + r() * 0.8,
      })),
    }),
    draw(ctx, st, { t, dt, w, h, c }) {
      st.items.sort((a, b) => b.z - a.z);
      for (const p of st.items) {
        p.x += dt * p.sp;
        if (p.x > 7) p.x -= 14;
        const bank = Math.sin(t * 1.2 + p.ph) * 0.5;
        const yy = p.y + Math.sin(t * 0.8 + p.ph) * 0.3;
        const local = [[0.35, 0, 0], [-0.25, 0, -0.18], [-0.18, 0.04, 0], [-0.25, 0, 0.18]];
        const pts = local.map(([dx, dy, dz]) => {
          const q = rotX({ x: dx, y: dy, z: dz }, bank);
          return project(q.x + p.x, q.y + yy, q.z + p.z, w, h);
        });
        if (pts.some((q) => !q)) continue;
        const a = depthAlpha(p.z, 1, 12);
        ctx.fillStyle = rgba(c.text, a * 0.55);
        poly(ctx, [pts[0], pts[1], pts[2]]); ctx.fill();
        ctx.fillStyle = rgba(c.accent, a * 0.75);
        poly(ctx, [pts[0], pts[2], pts[3]]); ctx.fill();
      }
    },
  },

  // 6. A tunnel lined with book spines.
  tunnel: {
    init: (w, h, r) => ({
      rings: Array.from({ length: 24 }, (_, i) => ({
        z: 0.6 + i * 0.6,
        books: Array.from({ length: 22 }, () => ({ hgt: 0.5 + r() * 0.4, tone: r() })),
      })),
    }),
    draw(ctx, st, { t, dt, w, h, c }) {
      for (const ring of st.rings) {
        ring.z -= dt * 1.4;
        if (ring.z < 0.4) ring.z += st.rings.length * 0.6;
      }
      const sorted = [...st.rings].sort((a, b) => b.z - a.z);
      for (const ring of sorted) {
        const n = ring.books.length;
        const a = depthAlpha(ring.z, 0.5, st.rings.length * 0.6);
        ring.books.forEach((b, i) => {
          const ang = (i / n) * TAU + t * 0.1;
          const R = 1.6;
          const inner = project(Math.cos(ang) * R * (1 - b.hgt * 0.4), Math.sin(ang) * R * (1 - b.hgt * 0.4), ring.z, w, h);
          const outer = project(Math.cos(ang) * R, Math.sin(ang) * R, ring.z, w, h);
          if (!inner || !outer) return;
          ctx.strokeStyle = rgba(b.tone > 0.5 ? c.accent : c.text, a * 0.75);
          ctx.lineWidth = Math.max(1, outer.s * 0.12);
          ctx.beginPath(); ctx.moveTo(inner.x, inner.y); ctx.lineTo(outer.x, outer.y); ctx.stroke();
        });
      }
    },
  },

  // 7. A wireframe sea of rolling waves.
  waves: {
    init: () => ({}),
    draw(ctx, st, { t, w, h, c }) {
      const N = 34;
      ctx.lineWidth = 1;
      for (let j = 0; j < N; j++) {
        const z = 1.2 + j * 0.35;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 50; i++) {
          const x = (i / 50 - 0.5) * 14;
          const y = 1.2 + Math.sin(x * 0.9 + t * 1.3) * 0.25 + Math.cos(z * 0.8 - t) * 0.25;
          const p = project(x, y, z, w, h);
          if (!p) continue;
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = rgba(j % 4 === 0 ? c.accent : c.text, depthAlpha(z, 1, 13) * 0.6);
        ctx.stroke();
      }
    },
  },

  // 8. A spiral galaxy turning.
  galaxy: {
    init: (w, h, r) => ({
      items: Array.from({ length: 900 }, () => {
        const arm = Math.floor(r() * 3);
        const d = Math.pow(r(), 0.7) * 3;
        return { d, a: arm * (TAU / 3) + d * 1.7 + (r() - 0.5) * 0.6, y: (r() - 0.5) * 0.15 * (3 - d), tone: r() };
      }),
    }),
    draw(ctx, st, { t, w, h, c }) {
      for (const s of st.items) {
        const ang = s.a + t * 0.12 / (0.4 + s.d * 0.3);
        let p = { x: Math.cos(ang) * s.d, y: s.y, z: Math.sin(ang) * s.d };
        p = rotX(p, 1.05);
        const q = project(p.x, p.y, p.z + 5, w, h);
        if (!q) continue;
        ctx.fillStyle = rgba(s.tone > 0.7 ? c.accent : c.text, 0.35 + (1 - s.d / 3) * 0.5);
        const r = Math.max(0.6, q.s * 0.012);
        ctx.fillRect(q.x - r / 2, q.y - r / 2, r, r);
      }
    },
  },

  // 9. A field of turning wireframe cubes.
  cubes: {
    init: (w, h, r) => ({
      items: Array.from({ length: 30 }, () => ({
        x: (r() - 0.5) * 8, y: (r() - 0.5) * 5, z: 2 + r() * 10, ax: r() * TAU, ay: r() * TAU, sz: 0.15 + r() * 0.3,
      })),
    }),
    draw(ctx, st, { dt, w, h, c }) {
      const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const q of st.items) {
        q.ax += dt * 0.5; q.ay += dt * 0.7;
        q.z -= dt * 0.5; if (q.z < 1) q.z += 11;
        const s = q.sz;
        const V = [[-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s], [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]]
          .map(([x, y, z]) => {
            const p = rotY(rotX({ x, y, z }, q.ax), q.ay);
            return project(p.x + q.x, p.y + q.y, p.z + q.z, w, h);
          });
        if (V.some((v) => !v)) continue;
        ctx.strokeStyle = rgba(q.sz > 0.3 ? c.accent : c.text, depthAlpha(q.z, 1, 12) * 0.8);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const [a, b] of E) { ctx.moveTo(V[a].x, V[a].y); ctx.lineTo(V[b].x, V[b].y); }
        ctx.stroke();
      }
    },
  },

  // 10. A double helix, like a spiral binding.
  helix: {
    init: () => ({}),
    draw(ctx, st, { t, w, h, c }) {
      const N = 60;
      for (let i = 0; i < N; i++) {
        const y = (i / N - 0.5) * 6;
        const a = i * 0.32 + t * 0.9;
        const p1 = rotZ({ x: Math.cos(a) * 1.1, y, z: Math.sin(a) * 1.1 + 5 }, 0.5);
        const p2 = rotZ({ x: Math.cos(a + Math.PI) * 1.1, y, z: Math.sin(a + Math.PI) * 1.1 + 5 }, 0.5);
        const q1 = project(p1.x, p1.y, p1.z, w, h);
        const q2 = project(p2.x, p2.y, p2.z, w, h);
        if (!q1 || !q2) continue;
        ctx.strokeStyle = rgba(c.text, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
        ctx.fillStyle = rgba(c.accent, 0.85);
        ctx.beginPath(); ctx.arc(q1.x, q1.y, Math.max(1.5, q1.s * 0.05), 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(c.text, 0.75);
        ctx.beginPath(); ctx.arc(q2.x, q2.y, Math.max(1.5, q2.s * 0.05), 0, TAU); ctx.fill();
      }
    },
  },

  // 11. A torus knot drawn in points.
  knot: {
    init: () => ({}),
    draw(ctx, st, { t, w, h, c }) {
      const N = 520;
      for (let i = 0; i < N; i++) {
        const u = (i / N) * TAU;
        const r = 1.2 + 0.45 * Math.cos(3 * u);
        let p = { x: r * Math.cos(2 * u), y: r * Math.sin(2 * u), z: 0.45 * Math.sin(3 * u) };
        p = rotX(rotY(p, t * 0.4), 0.6 + Math.sin(t * 0.2) * 0.3);
        const q = project(p.x, p.y, p.z + 5, w, h);
        if (!q) continue;
        ctx.fillStyle = rgba(i % 3 ? c.text : c.accent, 0.35 + (1.6 - p.z) * 0.25);
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, q.s * 0.025), 0, TAU); ctx.fill();
      }
    },
  },

  // 12. A globe of points (a Fibonacci sphere).
  sphere: {
    init: () => ({
      pts: Array.from({ length: SPHERE_POINTS }, (_, i) => {
        const k = i + 0.5;
        const phi = Math.acos(1 - (2 * k) / SPHERE_POINTS);
        const th = Math.PI * (1 + Math.sqrt(5)) * k;
        return { x: Math.cos(th) * Math.sin(phi), y: Math.cos(phi), z: Math.sin(th) * Math.sin(phi) };
      }),
    }),
    draw(ctx, st, { t, w, h, c }) {
      for (const p0 of st.pts) {
        const p = rotX(rotY(p0, t * 0.35), 0.4);
        const q = project(p.x * 1.8, p.y * 1.8, p.z * 1.8 + 5, w, h);
        if (!q) continue;
        const front = (1 - p.z) / 2;
        ctx.fillStyle = rgba(p.y > 0.6 ? c.accent : c.text, 0.15 + front * 0.7);
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.8, q.s * 0.022 * (0.5 + front)), 0, TAU); ctx.fill();
      }
    },
  },

  // 13. Bubbles rising.
  bubbles: {
    init: (w, h, r) => ({
      items: Array.from({ length: 70 }, () => ({
        x: (r() - 0.5) * 9, y: (r() - 0.5) * 7, z: 1.5 + r() * 10, rad: 0.05 + r() * 0.15, ph: r() * TAU,
      })),
    }),
    draw(ctx, st, { t, dt, w, h, c }) {
      st.items.sort((a, b) => b.z - a.z);
      for (const b of st.items) {
        b.y -= dt * (0.3 + b.rad * 2);
        if (b.y < -3.6) b.y += 7.2;
        const p = project(b.x + Math.sin(t + b.ph) * 0.15, b.y, b.z, w, h);
        if (!p) continue;
        const a = depthAlpha(b.z, 1, 12);
        ctx.strokeStyle = rgba(c.accent, a * 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, b.rad * p.s, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba(c.text, a * 0.35);
        ctx.beginPath(); ctx.arc(p.x - b.rad * p.s * 0.35, p.y - b.rad * p.s * 0.35, b.rad * p.s * 0.18, 0, TAU); ctx.fill();
      }
    },
  },

  // 14. Snow drifting down.
  snow: {
    init: (w, h, r) => ({
      items: Array.from({ length: 360 }, () => ({ x: (r() - 0.5) * 10, y: (r() - 0.5) * 7, z: 1 + r() * 11, ph: r() * TAU })),
    }),
    draw(ctx, st, { t, dt, w, h, c }) {
      for (const s of st.items) {
        s.y += dt * 0.45;
        if (s.y > 3.6) s.y -= 7.2;
        const p = project(s.x + Math.sin(t * 0.8 + s.ph) * 0.25, s.y, s.z, w, h);
        if (!p) continue;
        ctx.fillStyle = rgba(c.text, depthAlpha(s.z, 1, 12) * 0.8);
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, p.s * 0.018), 0, TAU); ctx.fill();
      }
    },
  },

  // 15. Fireflies wandering in the dark.
  fireflies: {
    init: (w, h, r) => ({
      items: Array.from({ length: 60 }, () => ({
        x: (r() - 0.5) * 8, y: (r() - 0.5) * 5, z: 2 + r() * 8, a: r() * TAU, b: r() * TAU, sp: 0.3 + r() * 0.7,
      })),
    }),
    draw(ctx, st, { t, w, h, c }) {
      for (const f of st.items) {
        const x = f.x + Math.sin(t * f.sp + f.a) * 0.8;
        const y = f.y + Math.cos(t * f.sp * 0.7 + f.b) * 0.6;
        const z = f.z + Math.sin(t * 0.3 + f.a) * 0.8;
        const p = project(x, y, z, w, h);
        if (!p) continue;
        const glow = 0.5 + 0.5 * Math.sin(t * 2 * f.sp + f.b);
        const rad = Math.max(2, p.s * 0.12);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        g.addColorStop(0, rgba(c.accent, 0.9 * glow));
        g.addColorStop(1, rgba(c.accent, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.fill();
      }
    },
  },

  // 16. A constellation: stars linked when close.
  constellation: {
    init: (w, h, r) => ({
      pts: Array.from({ length: 90 }, () => ({ x: (r() - 0.5) * 6, y: (r() - 0.5) * 4, z: (r() - 0.5) * 4 })),
    }),
    draw(ctx, st, { t, w, h, c }) {
      const P = st.pts.map((p0) => {
        const p = rotX(rotY(p0, t * 0.12), 0.25);
        return { p, q: project(p.x, p.y, p.z + 6, w, h) };
      });
      ctx.lineWidth = 1;
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const a = P[i]; const b = P[j];
          if (!a.q || !b.q) continue;
          const d = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y, a.p.z - b.p.z);
          if (d > 1.15) continue;
          ctx.strokeStyle = rgba(c.text, (1 - d / 1.15) * 0.45);
          ctx.beginPath(); ctx.moveTo(a.q.x, a.q.y); ctx.lineTo(b.q.x, b.q.y); ctx.stroke();
        }
      }
      for (const { q } of P) {
        if (!q) continue;
        ctx.fillStyle = rgba(c.accent, 0.9);
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.2, q.s * 0.025), 0, TAU); ctx.fill();
      }
    },
  },

  // 17. Aurora curtains rippling.
  aurora: {
    init: () => ({}),
    draw(ctx, st, { t, w, h, c }) {
      for (let band = 0; band < 4; band++) {
        const z = 3 + band * 1.5;
        for (let i = 0; i <= 90; i++) {
          const x = (i / 90 - 0.5) * 12;
          const top = -1.6 + Math.sin(x * 0.6 + t * 0.7 + band) * 0.5 + Math.sin(x * 1.7 - t * 0.4) * 0.15;
          const p1 = project(x, top, z, w, h);
          const p2 = project(x, top + 1.6 + band * 0.2, z, w, h);
          if (!p1 || !p2) continue;
          const g = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
          const col = band % 2 ? c.accent : c.text;
          g.addColorStop(0, rgba(col, 0));
          g.addColorStop(0.3, rgba(col, 0.35 - band * 0.05));
          g.addColorStop(1, rgba(col, 0));
          ctx.strokeStyle = g;
          ctx.lineWidth = Math.max(1, (w / 90) * 0.9);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }
      }
    },
  },

  // 18. A floor of hexagons rising and falling.
  hexgrid: {
    init: () => ({}),
    draw(ctx, st, { t, w, h, c }) {
      const R = 0.35;
      for (let row = 14; row >= 0; row--) {
        for (let col = -12; col <= 12; col++) {
          const x = col * R * 1.75 + (row % 2) * R * 0.87;
          const z = 1.5 + row * R * 1.5;
          const y = 1.4 - Math.max(0, Math.sin(x * 0.7 + t) * Math.cos(z * 0.6 - t * 0.8)) * 0.5;
          const pts = [];
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + Math.PI / 6;
            const q = project(x + Math.cos(a) * R * 0.9, y, z + Math.sin(a) * R * 0.9, w, h);
            if (!q) break;
            pts.push(q);
          }
          if (pts.length < 6) continue;
          const lift = (1.4 - y) / 0.5;
          ctx.fillStyle = rgba(c.accent, lift * 0.45 * depthAlpha(z, 1, 9));
          poly(ctx, pts); ctx.fill();
          ctx.strokeStyle = rgba(c.text, 0.25 * depthAlpha(z, 1, 9));
          ctx.lineWidth = 1;
          poly(ctx, pts); ctx.stroke();
        }
      }
    },
  },

  // 19. Orbits, like an atom: tilted rings with travelling dots.
  orbits: {
    init: () => ({ rings: [0, 1, 2, 3, 4].map((i) => ({ tilt: i * 0.65, rad: 1 + i * 0.35, sp: 1.2 - i * 0.18 })) }),
    draw(ctx, st, { t, w, h, c }) {
      for (const r of st.rings) {
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const a = (i / 80) * TAU;
          let p = { x: Math.cos(a) * r.rad, y: 0, z: Math.sin(a) * r.rad };
          p = rotZ(rotX(p, 1.1), r.tilt + t * 0.05);
          const q = project(p.x, p.y, p.z + 6, w, h);
          if (!q) continue;
          if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        }
        ctx.strokeStyle = rgba(c.text, 0.35);
        ctx.lineWidth = 1;
        ctx.stroke();
        for (let k = 0; k < 2; k++) {
          const a = t * r.sp + k * Math.PI;
          let p = { x: Math.cos(a) * r.rad, y: 0, z: Math.sin(a) * r.rad };
          p = rotZ(rotX(p, 1.1), r.tilt + t * 0.05);
          const q = project(p.x, p.y, p.z + 6, w, h);
          if (!q) continue;
          ctx.fillStyle = rgba(c.accent, 0.95);
          ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(2, q.s * 0.06), 0, TAU); ctx.fill();
        }
      }
      const core = project(0, 0, 6, w, h);
      if (core) {
        ctx.fillStyle = rgba(c.accent, 0.6);
        ctx.beginPath(); ctx.arc(core.x, core.y, core.s * 0.12, 0, TAU); ctx.fill();
      }
    },
  },

  // 20. Wireframe hills scrolling toward you.
  terrain: {
    init: () => ({ offset: 0 }),
    draw(ctx, st, { dt, w, h, c }) {
      st.offset += dt * 1.2;
      const height = (x, z) => Math.sin(x * 0.7 + z * 0.3) * 0.35 + Math.cos(z * 0.9 - x * 0.4) * 0.3 + Math.sin(x * 2.1 + z * 1.7) * 0.08;
      const step = 0.4;
      const base = Math.floor(st.offset / step) * step;
      ctx.lineWidth = 1;
      for (let j = 30; j >= 0; j--) {
        const zw = base + j * step;
        const z = zw - st.offset + 1;
        if (z <= 0.3) continue;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 44; i++) {
          const x = (i / 44 - 0.5) * 14;
          const p = project(x, 1.3 - height(x, zw), z, w, h);
          if (!p) continue;
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = rgba(j % 5 === 0 ? c.accent : c.text, depthAlpha(z, 0.5, 12) * 0.65);
        ctx.stroke();
      }
    },
  },
};

// 21. Ink drops falling onto a page and spreading in rings.
SCENES.ink = {
  init: (w, h, r) => ({ r, drops: [], clock: 0, next: 0 }),
  draw(ctx, st, { dt, w, h, c }) {
    st.clock += dt;
    if (st.clock >= st.next) {
      st.drops.push({ x: (st.r() - 0.5) * 9, z: 2.5 + st.r() * 8, born: st.clock, fall: 1.2, tone: st.r() });
      st.next = st.clock + 0.25 + st.r() * 0.45;
    }
    const PLANE = 1.4;
    st.drops = st.drops.filter((d) => st.clock - d.born < 5.5);
    st.drops.sort((a, b) => b.z - a.z);
    for (const d of st.drops) {
      const age = st.clock - d.born;
      const col = d.tone > 0.5 ? c.accent : c.text;
      if (age < d.fall) {
        // still falling: a short streak above the page
        const y = PLANE - (1 - age / d.fall) * 3;
        const p = project(d.x, y, d.z, w, h);
        const q = project(d.x, y - 0.18, d.z, w, h);
        if (!p || !q) continue;
        ctx.strokeStyle = rgba(col, 0.8);
        ctx.lineWidth = Math.max(1, p.s * 0.03);
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        continue;
      }
      const spread = age - d.fall;
      for (let k = 0; k < 3; k++) {
        const rad = spread * 0.55 - k * 0.22;
        if (rad <= 0) continue;
        const fade = Math.max(0, 1 - spread / 4.3) * (1 - k * 0.25);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * TAU;
          const p = project(d.x + Math.cos(a) * rad, PLANE, d.z + Math.sin(a) * rad, w, h);
          if (!p) continue;
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = rgba(col, fade * depthAlpha(d.z, 1, 12) * 0.85);
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }
  },
};

export function getScene(id) {
  return SCENES[normalizeStartBg(id)];
}

// "#e0574d" or "rgb(…)" → [r, g, b]
export function parseColor(str, fallback = [200, 200, 200]) {
  const s = String(str || '').trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let hx = hex[1];
    if (hx.length === 3) hx = hx.split('').map((ch) => ch + ch).join('');
    return [0, 2, 4].map((i) => parseInt(hx.slice(i, i + 2), 16));
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => Math.round(v));
  return fallback;
}
