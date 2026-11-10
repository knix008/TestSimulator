// Sofas and armchairs by seat count (1/2/3/4-seat); each entry has a `seats` field.
//
// One flexible upholstered builder (`upholstered`) combines arm shapes (track, rolled, scroll,
// flared, sloped, wing, scooped, tuxedo, armless), backs (tight, loose cushions, pillow back,
// channel-tufted, button-tufted chesterfield, camel back, arched), bases (tapered / splayed /
// turned / cabriole / bun / block / hairpin / sled / plinth / skirt / platform) and seat
// cushions (split, bench, T-cushion, tight). Special shapes have their own builders: curved
// sofas and barrel chairs (`curved`), recliners, exposed wood frames (mid-century, rattan,
// futon), click-clack sofa beds, French cabriole settees and the egg chair.
// Origin: bottom centre, back towards −z, front +z (every build is re-centred at the end).
import { THREE, Kit, item, P, variant, T, clamp, pillowGeo, shellGeo, gridGeo } from './helpers.js';

const sm = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

/* ------------------------------------------------------------ shapes */

/** Closed polygon with filleted corners (radius per point or one radius). Points [x, y]. */
function fillet(pts, radii = 0.01) {
  const n = pts.length, s = new THREE.Shape();
  const R = (i) => (Array.isArray(radii) ? radii[i] ?? 0 : radii);
  let started = false;
  const go = (x, y) => { if (!started) { s.moveTo(x, y); started = true; } else s.lineTo(x, y); };
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const ax = p0[0] - p1[0], ay = p0[1] - p1[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const r = Math.min(R(i), la / 2.05, lb / 2.05);
    if (r < 0.0015 || la < 1e-6 || lb < 1e-6) { go(p1[0], p1[1]); continue; }
    go(p1[0] + (ax / la) * r, p1[1] + (ay / la) * r);
    s.quadraticCurveTo(p1[0], p1[1], p1[0] + (bx / lb) * r, p1[1] + (by / lb) * r);
  }
  s.closePath();
  return s;
}

const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

/** Outline in x / y extruded along z (thick, centred on z), rounded front/back edges. */
function extrudeX(k, role, mat, shape, thick, x, z, bevel = 0.025, o = {}) {
  k.panel(role, mat, shape, thick, x, 0, z, { bevel: Math.min(bevel, thick / 2.3), bevelSegs: k.hi ? 3 : 1, curveSegs: k.hi ? 6 : 2, ...o });
}

/** Side profile [z, y] extruded along x (thick, centred on x). */
function extrudeZ(k, role, mat, pts, radii, thick, x, z = 0, bevel = 0.03) {
  k.panel(role, mat, fillet(pts.map(([zz, y]) => [-zz, y]), radii), thick, x, 0, z, { ry: Math.PI / 2, bevel: Math.min(bevel, thick / 2.3), bevelSegs: k.hi ? 3 : 1, curveSegs: k.hi ? 6 : 2 });
}

function flip(g) {
  const a = g.index.array;
  for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

const M4 = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

/**
 * Diamond button tufting (chesterfield): a quilted surface w × h (local x ∈ ±w/2, y ∈ 0..h,
 * bulging towards +z) with creases between the buttons; its border tucks back by 3 cm so it
 * disappears into the panel it lies on. `M` places it. Buttons sit in the dimples.
 */
function tuft(k, mat, w, h, M, { px = 0.2, py = 0.17, puff = 0.026, base = 0.005, dimple = 0.013, buttons = true, btnMat } = {}) {
  if (w < 0.1 || h < 0.08) return;
  const xo = -w / 2 + px * 0.5, yo = Math.min(py * 0.55, h / 2);
  const tri = (t) => 2 * Math.abs(t - Math.round(t));
  const inZone = (x, y) => x >= xo - 1e-6 && x <= w / 2 - px * 0.5 + 1e-6 && y >= yo - 1e-6 && y <= h - py * 0.35;
  const zAt = (x, y) => {
    const ex = Math.min(x + w / 2, w / 2 - x), ey = Math.min(y, h - y);
    const b = sm(ex / 0.035) * sm(ey / 0.035);
    const p = (x - xo) / (px / 2), q = (y - yo) / py;
    const e = Math.min(tri((p + q) / 2), tri((p - q) / 2));
    let z = base + puff * (1 - (1 - e) ** 2);
    const A = Math.round((p + q) / 2), B = Math.round((p - q) / 2);
    const tx = xo + ((A + B) * px) / 2, ty = yo + (A - B) * py;
    if (inZone(tx, ty)) z -= dimple * Math.exp(-((x - tx) ** 2 + (y - ty) ** 2) / 0.0004);
    return b * z - (1 - b) * 0.03;
  };
  const nu = Math.max(8, Math.ceil((w / (px / 2)) * (k.hi ? 4 : 2))), nv = Math.max(4, Math.ceil((h / py) * (k.hi ? 8 : 4)));
  const g = flip(gridGeo(nu, nv, (s, t) => { const x = -w / 2 + s * w, y = t * h; return [x, y, zAt(x, y)]; }));
  g.applyMatrix4(M);
  k.add('upholstery', mat, g);
  if (!buttons) return;
  for (let j = 0; yo + j * py <= h - py * 0.35 + 1e-6; j++) {
    for (let i = 0; ; i++) {
      const x = xo + i * px + (j % 2 ? px / 2 : 0), y = yo + j * py;
      if (x > w / 2 - px * 0.5 + 1e-6) break;
      const b = new THREE.SphereGeometry(0.011, k.seg(10, 6), k.seg(6, 3));
      b.scale(1, 1, 0.5);
      b.translate(x, y, zAt(x, y) + 0.003);
      b.applyMatrix4(M);
      k.add('buttons', btnMat ?? mat, b);
    }
  }
}

/** Plain buttons on a cushion face (a grid), local frame as in `tuft`. */
function buttonGrid(k, mat, w, h, M, cols, rows) {
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const b = new THREE.SphereGeometry(0.012, k.seg(10, 6), k.seg(6, 3));
    b.scale(1, 1, 0.45);
    b.translate(-w / 2 + (w / cols) * (i + 0.5), (h / rows) * (j + 0.5), 0);
    b.applyMatrix4(M);
    k.add('buttons', mat, b);
  }
}

/* --------------------------------------------------------------- legs */

const LEG_H = { tapered: 0.16, splay: 0.17, turned: 0.13, hairpin: 0.17, sled: 0.15, metal: 0.15, cabriole: 0.15, bun: 0.075, block: 0.05, plinth: 0.07, skirt: 0, floor: 0, platform: 0.07, cone: 0.11 };

function legAt(k, style, mat, x, z, h, sx, sz, r = 0.022) {
  if (style === 'tapered' || style === 'splay') {
    const g = new THREE.CylinderGeometry(r, r * 0.55, h, k.seg(14, 6), 1);
    g.translate(0, -h / 2, 0);
    const a = Math.atan2(style === 'splay' ? 0.05 : 0.016, h);
    T(g, 0, 0, 0, -a * sz, 0, a * sx);
    g.translate(x, h, z);
    g.computeBoundingBox();
    g.translate(0, -g.boundingBox.min.y, 0);
    k.add('legs', mat, g);
    if (style === 'splay') k.cyl('legs', 'metal-brass', r * 0.62, r * 0.62, 0.025, x + 0.05 * sx * 0.93, 0, z + 0.05 * sz * 0.93, { segs: k.seg(12, 6) });
  } else if (style === 'turned') {
    const q = r * 1.25;
    k.lathe('legs', mat, [[0, 0], [q * 0.55, 0], [q * 0.62, 0.012], [q * 0.48, 0.03], [q * 0.95, h * 0.36], [q * 0.52, h * 0.6], [q * 0.75, h * 0.7], [q * 0.55, h * 0.78], [q, h * 0.9], [q, h], [0, h]], x, 0, z, { smooth: 22, segs: k.seg(16, 6) });
  } else if (style === 'bun') {
    const q = 0.05;
    k.lathe('legs', mat, [[0, 0], [q * 0.55, 0], [q * 0.92, h * 0.3], [q, h * 0.55], [q * 0.8, h * 0.85], [q * 0.55, h * 0.95], [q * 0.55, h], [0, h]], x, 0, z, { smooth: 16, segs: k.seg(16, 6) });
  } else if (style === 'cabriole') {
    k.box('legs', mat, 0.055, 0.05, 0.055, x, h - 0.025, z, { r: 0.006 });
    const dx = sx || 0, dz = sz || 0;
    k.tube('legs', mat, [[x, h - 0.03, z], [x + dx * 0.022, h * 0.66, z + dz * 0.026], [x - dx * 0.004, h * 0.25, z - dz * 0.004], [x + dx * 0.006, 0.05, z + dz * 0.008], [x + dx * 0.014, 0.018, z + dz * 0.018]], 0.017, { radial: k.seg(10, 5), segs: k.seg(20, 8) });
    k.sphere('legs', mat, 0.022, x + dx * 0.016, 0.0132, z + dz * 0.02, { scale: [1, 0.6, 1.15], segs: k.seg(12, 6), rings: k.seg(8, 4) });
  } else if (style === 'metal') {
    k.cyl('legs', mat, r * 0.55, r * 0.45, h, x, 0, z, { segs: k.seg(12, 6) });
  } else if (style === 'cone') {
    k.cyl('legs', mat, r * 1.1, r * 0.6, h, x, 0, z, { segs: k.seg(16, 6) });
  } else if (style === 'block') {
    k.box('legs', mat, 0.06, h, 0.06, x, h / 2, z, { r: 0.006, segs: 2 });
  } else if (style === 'hairpin') {
    const s = 0.035, d = sx || 1;
    k.tube('legs', mat, [[x - s * d, h, z - s], [x - 0.003 * d, h * 0.35, z], [x, 0.006, z], [x + 0.003 * d, h * 0.35, z], [x - s * d, h, z + s]], 0.0055, { radial: k.seg(8, 4), segs: k.seg(28, 8) });
  }
}

/** Legs / base under a w × d body whose bottom is at y = h. */
function legsUnder(k, style, mat, w, d, h, { inset = 0.06 } = {}) {
  if (h <= 0.002) return;
  const xs = w / 2 - inset, zs = d / 2 - inset;
  if (style === 'plinth' || style === 'platform') {
    if (style === 'plinth') k.box('legs', mat, w - 0.14, h, d - 0.14, 0, h / 2, 0, { r: 0.004 });
    else k.box('legs', mat, w + 0.04, h, d + 0.04, 0, h / 2, 0, { r: 0.006, segs: 2 });
    return;
  }
  if (style === 'sled') {
    for (const sx of [-1, 1]) k.bentTube('legs', mat, [[sx * xs, h + 0.005, -zs], [sx * xs, 0.011, -zs], [sx * xs, 0.011, zs], [sx * xs, h + 0.005, zs]], 0.011, 0.04, { radial: k.seg(10, 5) });
    return;
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) legAt(k, style, mat, sx * xs, sz * zs, h, sx, sz);
  if (w > 1.9 && !['hairpin', 'cabriole'].includes(style)) {
    const mids = w > 2.7 ? [-w / 6, w / 6] : [0];
    for (const mx of mids) for (const sz of [-1, 1]) legAt(k, style === 'splay' ? 'tapered' : style, mat, mx, sz * zs, h, 0, sz);
  }
}

/* --------------------------------------------------------------- arms */

const PROFILE_ARMS = new Set(['slope', 'wing', 'scoop']);

/** Arm cross-section (x across the arm, + = outwards) from y0 to top. */
function armSection(style, aw, y0, top, n) {
  const a = aw / 2;
  if (style === 'round') return { pts: [[-a, y0], [a, y0], [a, top], [-a, top]], r: [0.008, 0.008, a * 0.98, a * 0.98] };
  if (style === 'flare') return { pts: [[-a, y0], [a - 0.05, y0], [a - 0.035, top - 0.13], [a, top - 0.015], [a - 0.012, top], [-a, top]], r: [0.008, 0.01, 0.08, 0.03, 0.02, 0.03] };
  if (style === 'roll' || style === 'scroll') {
    const R = style === 'scroll' ? a : a * 0.98, cx = a - R, cy = top - R;
    const bo = style === 'scroll' ? a - 1.3 * R : a - 0.3 * R;
    const t0 = -Math.acos(clamp((bo - cx) / R, -1, 1));
    const pts = [[-a, y0], [bo, y0], ...arc(cx, cy, R, t0, Math.PI, n)];
    return { pts, r: pts.map((_, i) => (i < 2 ? 0.008 : 0)), R, cx, cy };
  }
  // track / low / tuxedo
  return { pts: [[-a, y0], [a, y0], [a, top], [-a, top]], r: [0.008, 0.008, 0.032, 0.032] };
}

function armProfile(style, D, y0, top, h) {
  const z0 = -D / 2, z1 = D / 2;
  if (style === 'slope') return { pts: [[z0, y0], [z1 - 0.06, y0], [z1, top], [z0, top + 0.03]], r: [0.008, 0.01, 0.05, 0.04] };
  if (style === 'scoop') return { pts: [[z0, y0], [z1, y0], [z1, top - 0.03], [z0 + D * 0.45, top + 0.02], [z0, top + 0.1]], r: [0.008, 0.008, 0.07, 0.25, 0.05] };
  // wing: high at the back, sweeping down to the arm
  return { pts: [[z0, y0], [z1, y0], [z1, top], [z0 + D * 0.5, top + 0.01], [z0 + D * 0.24, h - 0.05], [z0, h - 0.01]], r: [0.008, 0.008, 0.05, 0.14, 0.16, 0.04] };
}

/* --------------------------------------------------------- pillows */

function throwPillows(k, n, mat, x0, x1, y, z, { size = 0.44, lean = 0.32 } = {}) {
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1, rank = Math.floor(i / 2);
    const s = size * (rank ? 0.88 : 1);
    const g = pillowGeo(s, s, 0.14, k.seg(14, 5));
    T(g, 0, 0, 0, -lean, side * -(rank ? 0.15 : 0.5), side * 0.1);
    const x = side < 0 ? x0 + 0.24 + rank * 0.34 : x1 - 0.24 - rank * 0.34;
    if (x1 - x0 < 0.6 && rank) continue;
    g.translate(x, y + s * 0.43, z + 0.06 + rank * 0.03);
    k.add('pillows', mat, g);
  }
}

/* ------------------------------------------------------ upholstered */

/**
 * The general sofa / armchair. o: w, d, seats, h, seatH, seatT, arm, armW, armH, back, backD,
 * base, legMat, cushion ('split'|'bench'|'t'|'tight'), nSeat, nBack, fabric, seatFabric,
 * pillows, pillowMat, piping, tuftArms, tuftSeat, lean, modular, channelW, hump.
 */
function upholstered(k, o) {
  const { w, d, seats = 3, fabric: fab } = o;
  const h = o.h ?? 0.82, seatH = o.seatH ?? 0.44, seatT = o.seatT ?? 0.14;
  const arm = o.arm ?? 'track', back = o.back ?? 'loose', base = o.base ?? 'tapered', cushion = o.cushion ?? 'split';
  const seatFab = o.seatFabric ?? fab, legMat = o.legMat ?? 'wood-oak';
  const armless = arm === 'none';
  const armW = armless ? 0 : Math.min(o.armW ?? 0.17, w * 0.24);
  const armH = arm === 'tuxedo' ? h : Math.min(o.armH ?? 0.62, h);
  const backD = o.backD ?? 0.2, lean = o.lean ?? 0.14;
  const legH = o.legH ?? LEG_H[base] ?? 0.12;
  const bodyY0 = base === 'skirt' ? 0.07 : legH;
  const deckTop = cushion === 'tight' ? seatH - 0.075 : seatH - seatT;
  const tDepth = cushion === 't' && !armless ? 0.12 : 0;
  const armD = d - tDepth, armZ = -tDepth / 2;
  const x0 = -w / 2 + armW, x1 = w / 2 - armW, iw = x1 - x0;
  const zBack = -d / 2, zb = zBack + backD;
  const bw = armless ? w - 0.004 : iw + 0.02;

  // ---- body (deck) and base
  if (o.modular) {
    const n = seats, mw = iw / n;
    for (let i = 0; i < n; i++) k.soft('upholstery', fab, mw - 0.006, deckTop - bodyY0, d - 0.006, 0.03, x0 + mw * (i + 0.5), (bodyY0 + deckTop) / 2, 0, { flat: 4, puff: 0.004 });
  } else {
    k.soft('upholstery', fab, w - (armless ? 0.004 : 0.012), deckTop - bodyY0, d - 0.012, 0.028, 0, (bodyY0 + deckTop) / 2, 0, { flat: 4, puff: 0.004 });
  }
  if (base === 'skirt') {
    k.soft('upholstery', fab, w + 0.008, 0.125, d + 0.008, 0.012, 0, 0.004 + 0.0625, 0, { flat: 3 });
    const pts = [[-w / 2 - 0.005, -d / 2 - 0.005], [w / 2 + 0.005, -d / 2 - 0.005], [w / 2 + 0.005, d / 2 + 0.005], [-w / 2 - 0.005, d / 2 + 0.005]];
    for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; k.rod('piping', fab, [a[0], 0.128, a[1]], [b[0], 0.128, b[1]], 0.006, { segs: k.seg(8, 4) }); }
    // kick pleats at the front corners and the middle
    for (const px of [-w / 2 + 0.002, w / 2 - 0.002]) k.box('legs', 'paint-black-matte', 0.004, 0.11, 0.06, px + (px < 0 ? -0.003 : 0.003), 0.065, d / 2 - 0.04, { r: 0 });
  } else {
    legsUnder(k, base, legMat, w - 0.02, d - 0.02, legH, { inset: base === 'cabriole' ? 0.045 : 0.06 });
  }

  // ---- arms
  if (!armless) {
    for (const sx of [-1, 1]) {
      const ax = sx * (w / 2 - armW / 2);
      if (PROFILE_ARMS.has(arm)) {
        const pr = armProfile(arm, armD, bodyY0, armH, h);
        extrudeZ(k, 'upholstery', fab, pr.pts, pr.r, armW, ax, armZ, arm === 'scoop' ? 0.06 : 0.04);
      } else {
        const sec = armSection(arm, armW, bodyY0, armH, k.seg(14, 6));
        extrudeX(k, 'upholstery', fab, fillet(sec.pts.map(([x, y]) => [x * sx, y]), sec.r), armD, ax, armZ, 0.03);
        if (arm === 'roll' || arm === 'scroll') {
          // the arm's front face panel (proud, with a welt) + for scroll a curl
          const face = fillet(sec.pts.map(([x, y]) => [x * sx * 1.0, y]), sec.r);
          k.panel('upholstery', fab, face, 0.02, ax, 0, armZ + armD / 2 + 0.004, { bevel: 0.008, bevelSegs: k.hi ? 2 : 1, curveSegs: k.hi ? 4 : 2 });
          if (arm === 'scroll') {
            const sp = [];
            for (let i = 0; i <= 24; i++) { const t = i / 24, a = Math.PI * 0.5 + t * Math.PI * 2.2, rr = sec.R * (0.78 - 0.55 * t); sp.push([ax + sx * (sec.cx + rr * Math.cos(a)), sec.cy + rr * Math.sin(a), armZ + armD / 2 + 0.016]); }
            k.tube('piping', fab, sp, 0.006, { radial: k.seg(6, 4), segs: k.seg(40, 14) });
          }
        }
      }
      if (o.tuftArms && !PROFILE_ARMS.has(arm)) {
        const sec = armSection(arm, armW, bodyY0, armH, 4);
        const top = sec.cy != null ? sec.cy - 0.01 : armH - 0.05;
        const za = zb + 0.01, zf = armZ + armD / 2 - 0.05;
        const ht = top - (seatH - 0.05);
        tuft(k, fab, zf - za, ht, M4(sx * (w / 2 - armW), seatH - 0.05, (za + zf) / 2, 0, -sx * Math.PI / 2, 0), { px: 0.2, py: Math.max(0.12, ht * 0.55), btnMat: fab });
      }
    }
  }

  // ---- back
  const by0 = deckTop - 0.03;
  const frameAt = (top, depth = backD, rr = 0.04) => {
    const bh = top - by0;
    if (o.modular) {
      const n = seats, mw = iw / n;
      for (let i = 0; i < n; i++) k.soft('upholstery', fab, mw - 0.006, bh, depth, rr, x0 + mw * (i + 0.5), by0 + bh / 2, zBack + depth / 2 + 0.003, { puff: 0.004 });
    } else k.soft('upholstery', fab, bw, bh, depth, rr, 0, by0 + bh / 2, zBack + depth / 2 + 0.003, { puff: 0.004 });
  };
  const nBack = o.nBack ?? seats;
  if (back === 'loose' || back === 'pillow') {
    const frameTop = back === 'pillow' ? Math.min(h, seatH + 0.25) : h - 0.11;
    frameAt(frameTop);
    const cw = iw / nBack - 0.008;
    for (let i = 0; i < nBack; i++) {
      const cx = x0 + (iw / nBack) * (i + 0.5);
      if (back === 'loose') {
        const bct = o.backCushT ?? 0.2, bch = h - seatH - 0.02;
        k.soft('cushions', seatFab, cw, bch, bct, 0.06, cx, seatH + bch / 2 + 0.008, zb + bct / 2 + 0.005, { puff: 0.028, rx: -lean });
        if (o.backButtons) { const yc = seatH + bch / 2 + 0.008, zc = zb + bct / 2 + 0.005, sN = Math.sin(lean), cN = Math.cos(lean), f = bct / 2 + 0.022; buttonGrid(k, fab, cw, bch, M4(cx, yc + f * sN - (bch / 2) * cN, zc + f * cN + (bch / 2) * sN, -lean, 0, 0), Math.max(1, Math.round(cw / 0.3)), 2); }
      } else {
        const ph = Math.min(0.58, h - seatH + 0.06);
        const g = pillowGeo(cw * 0.98, ph, 0.24, k.seg(16, 6), { pinch: 0.04 });
        T(g, 0, 0, 0, -0.3, 0, 0);
        g.translate(cx, seatH + ph / 2 - 0.01, zb + 0.07);
        k.add('cushions', seatFab, g);
      }
    }
  } else if (back === 'channel') {
    frameAt(h);
    const n = Math.max(3, Math.round(bw / (o.channelW ?? 0.15)));
    const cw = (bw - 0.03) / n, chH = h - seatH - 0.035;
    for (let i = 0; i < n; i++) {
      k.rbox('cushions', seatFab, cw - 0.004, chH, 0.1, Math.min(0.045, cw / 2.2), -bw / 2 + 0.015 + cw * (i + 0.5), seatH - 0.02 + chH / 2, zb + 0.035, { segs: k.hi ? 3 : 1, rx: -lean * 0.4 });
    }
  } else if (back === 'tufted') {
    frameAt(h, backD, 0.06);
    tuft(k, fab, bw - 0.05, h - seatH - 0.03, M4(0, seatH - 0.04, zb + 0.003), { btnMat: o.buttonMat });
  } else if (back === 'camel' || back === 'arched') {
    // back panel with a shaped top line (camel hump / arched), extruded through the depth
    const half = bw / 2, top = h - (o.hump ?? (back === 'camel' ? 0.12 : 0.08)), hump = o.hump ?? (back === 'camel' ? 0.12 : 0.08);
    const N = k.seg(20, 8), pts = [[-half, by0], [half, by0]];
    for (let i = 0; i <= N; i++) {
      const t = 1 - (2 * i) / N; // +1 → −1 (right to left)
      const f = back === 'camel' ? Math.cos((t * Math.PI) / 2) ** 2 * 1.0 + 0.12 * Math.cos(t * Math.PI * 1.5) ** 2 * (Math.abs(t) > 0.55 ? 1 : 0) : Math.sqrt(Math.max(0, 1 - t * t));
      pts.push([t * half, top + hump * f]);
    }
    const r = pts.map((_, i) => (i < 2 ? 0.01 : i === 2 || i === pts.length - 1 ? 0.04 : 0));
    extrudeX(k, 'upholstery', fab, fillet(pts, r), backD, 0, zBack + backD / 2 + 0.003, 0.035);
    if (o.tuftBack) tuft(k, fab, bw - 0.08, top - seatH - 0.03, M4(0, seatH - 0.04, zb + 0.003));
    else {
      // tight inner pad following the same line
      const pad = pts.map(([x, y], i) => [x * 0.96, i < 2 ? seatH - 0.05 : y - 0.04]);
      extrudeX(k, 'upholstery', fab, fillet(pad, r), 0.08, 0, zb + 0.03, 0.035);
    }
  } else {
    // tight / low: a frame with one continuous tight pad leaning a little
    frameAt(h, backD, 0.045);
    if (back === 'tight') {
      const ph = h - seatH - 0.03;
      k.soft('cushions', seatFab, bw - 0.03, ph, 0.1, 0.045, 0, seatH + ph / 2 - 0.01, zb + 0.04, { puff: 0.02, rx: -lean * 0.5 });
    }
  }

  // ---- seat
  const zs0 = zb - 0.005, zs1 = d / 2 + 0.012, sd = zs1 - zs0, szc = (zs0 + zs1) / 2;
  if (cushion === 'tight') {
    const th = seatH - by0;
    k.soft('upholstery', seatFab, (armless ? w - 0.01 : iw + 0.01), th, sd + 0.01, 0.045, 0, by0 + th / 2, szc - 0.003, { puff: 0.014, sag: 0.004 });
    if (o.tuftSeat) tuft(k, seatFab, iw - 0.06, sd - 0.07, M4(0, seatH + 0.004, zs1 - 0.03, -Math.PI / 2, 0, 0), { px: 0.22, py: 0.2, puff: 0.018, buttons: true });
  } else if (cushion === 't') {
    const f = zs1 - (tDepth + 0.01), L = -w / 2 + 0.006, R = w / 2 - 0.006;
    const sh = fillet([[x0 + 0.004, zs0], [x1 - 0.004, zs0], [x1 - 0.004, f], [R, f], [R, zs1], [L, zs1], [L, f], [x0 + 0.004, f]], [0.02, 0.02, 0.02, 0.05, 0.05, 0.05, 0.05, 0.02]);
    k.slab('cushions', seatFab, sh, seatT + 0.01, deckTop - 0.005, { bevel: 0.04, bevelSegs: k.hi ? 3 : 1, curveSegs: 6 });
  } else {
    const n = cushion === 'bench' ? 1 : (o.nSeat ?? seats);
    const cw = iw / n - (n > 1 ? 0.008 : 0.002);
    for (let i = 0; i < n; i++) {
      const cx = x0 + (iw / n) * (i + 0.5);
      k.soft('cushions', seatFab, cw, seatT + 0.005, sd, 0.05, cx, deckTop + seatT / 2 - 0.002, szc, { puff: 0.016, sag: 0.006 });
      if (o.piping) for (const yy of [seatH - 0.012, deckTop + 0.012]) k.rod('piping', o.pipeMat ?? seatFab, [cx - cw / 2 + 0.035, yy, zs1 - 0.003], [cx + cw / 2 - 0.035, yy, zs1 - 0.003], 0.0055, { segs: k.seg(8, 4) });
      if (o.seatButtons) buttonGrid(k, fab, cw, sd - 0.1, M4(cx, seatH + 0.012, zs1 - 0.05, -Math.PI / 2, 0, 0), Math.max(1, Math.round(cw / 0.3)), 2);
    }
  }
  throwPillows(k, o.pillows ?? 0, o.pillowMat ?? 'fabric-linen-white', x0, x1, seatH, zb + ({ loose: (o.backCushT ?? 0.2) * 0.85, pillow: 0.17, channel: 0.09, tight: 0.09, low: 0.02, tufted: 0.03, camel: 0.06, arched: 0.06 }[back] ?? 0.05));
  // back roll along the top of a chesterfield back
  if (o.backRoll) k.add('upholstery', fab, T(new THREE.CapsuleGeometry(0.055, bw - 0.12, k.seg(6, 2), k.seg(14, 6)), 0, h - 0.055, zBack + backD / 2 + 0.003, 0, 0, Math.PI / 2));
}

/* ---------------------------------------------------------- curved */

/** Annular sector in plan (x, shape y = z) between radii r0 < r1 and angles ±phi (from −z), centre z = zc. */
function sector(r0, r1, phi, zc, n, rad = 0.05, disc = false) {
  if (disc) { const s = new THREE.Shape(); s.absarc(0, zc, r1, 0, Math.PI * 2, false); return s; }
  const P = (r, t) => [r * Math.sin(t), zc - r * Math.cos(t)];
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(P(r1, -phi + (2 * phi * i) / n));
  for (let i = 0; i <= n; i++) pts.push(P(r0, phi - (2 * phi * i) / n));
  const r = pts.map((_, i) => (i === 0 || i === n || i === n + 1 || i === 2 * n + 1 ? rad : 0));
  return fillet(pts, r);
}

/**
 * Curved sofa / tub / barrel chair. o: w, seats, h, seatH, seatT, bt (back thickness), b (band
 * depth from the back), sag (arc depth) or phi + R, disc (round seat), base, legMat, channel, pillows.
 */
function curved(k, o) {
  const { fabric: fab, seats = 3 } = o;
  const h = o.h ?? 0.76, seatH = o.seatH ?? 0.43, seatT = o.seatT ?? 0.13, bt = o.bt ?? 0.2, b = o.b ?? 0.88;
  let R, phi;
  if (o.phi) { phi = o.phi; R = o.R ?? o.w / 2; } else { const c = o.w, s = o.sag ?? 0.35; phi = 2 * Math.atan((2 * s) / c); R = c / 2 / Math.sin(phi); }
  const zc = 0, base = o.base ?? 'plinth';
  const legH = LEG_H[base] ?? 0.06, bodyY0 = legH, deckTop = seatH - seatT;
  const n = k.seg(Math.max(16, Math.round(phi * R * 18)), 8);
  const ri = Math.max(0.05, R - b);
  const dPhi = 0.004 / R;
  // back band
  k.slab('upholstery', fab, sector(R - bt, R, phi, zc, n, 0.07), h - bodyY0, bodyY0, { bevel: 0.035, bevelSegs: k.hi ? 3 : 1, curveSegs: 4 });
  // body under the seat
  k.slab('upholstery', fab, sector(ri + 0.006, R - bt + 0.012, phi - dPhi, zc, n, 0.04, o.disc), deckTop - bodyY0, bodyY0, { bevel: 0.02, bevelSegs: k.hi ? 2 : 1, curveSegs: k.hi ? 32 : 12 });
  // arms at the ends (sectors through the whole depth), seat cushions (angular segments) between
  const aA = o.armW ? o.armW / ((ri + R) / 2) : 0;
  if (aA) for (const sx of [-1, 1]) sectorSlab(k, 'upholstery', fab, ri - 0.004, R - 0.004, aA / 2, sx * (phi - aA / 2), bodyY0, (o.armH ?? 0.6) - bodyY0, 0.04, n);
  const ns = o.disc ? 1 : (o.nSeat ?? seats);
  const gap = 0.007 / ((ri + R) / 2);
  const p0 = phi - dPhi * 2 - aA;
  for (let i = 0; i < ns; i++) {
    const a0 = -p0 + ((2 * p0) / ns) * i, a1 = a0 + (2 * p0) / ns;
    const half = (a1 - a0) / 2 - (ns > 1 ? gap : 0), mid = (a0 + a1) / 2;
    if (o.disc) k.slab('cushions', o.seatFabric ?? fab, sector(0, R - bt + 0.005, 0, zc, 1, 0, true), seatT, deckTop - 0.003, { bevel: 0.03, bevelSegs: k.hi ? 3 : 1, curveSegs: k.hi ? 40 : 14 });
    else sectorSlab(k, 'cushions', o.seatFabric ?? fab, ri - 0.01, R - bt + 0.006, half, mid, deckTop - 0.003, seatT, 0.03, n);
  }
  if (o.channel) {
    const rr = R - bt - 0.02, span = 2 * (phi - 0.09 / R);
    const nc = Math.max(5, Math.round((span * rr) / 0.13)), cw = (span * rr) / nc;
    const chH = h - seatH - 0.03;
    for (let i = 0; i < nc; i++) {
      const t = -span / 2 + (span / nc) * (i + 0.5);
      const g = new THREE.BoxGeometry(1, 1, 1);
      void g;
      k.rbox('cushions', o.seatFabric ?? fab, cw - 0.006, chH, 0.08, Math.min(0.035, cw / 2.3), rr * Math.sin(t), seatH - 0.02 + chH / 2, zc - rr * Math.cos(t) + 0.02 * Math.cos(t), { segs: k.hi ? 2 : 1, ry: -t });
    }
  } else if (o.backPillows) {
    const nb = o.backPillows, rr = R - bt - 0.13;
    for (let i = 0; i < nb; i++) {
      const t = -phi * 0.78 + ((2 * phi * 0.78) / Math.max(1, nb - 1)) * i * (nb > 1 ? 1 : 0);
      const pw = Math.min(0.62, (2 * phi * rr) / nb - 0.02);
      const g = pillowGeo(pw, Math.min(0.5, h - seatH + 0.04), 0.2, k.seg(14, 5));
      T(g, 0, 0, 0, -0.28, 0, 0);
      g.rotateY(-t);
      g.translate(rr * Math.sin(t), seatH + 0.22, zc - rr * Math.cos(t));
      k.add('cushions', o.seatFabric ?? fab, g);
    }
  }
  // base
  if (base === 'plinth' || base === 'swivel') {
    if (o.disc || base === 'swivel') k.cyl('legs', o.legMat, Math.max(0.12, (R - bt) * 0.6), Math.max(0.12, (R - bt) * 0.62), legH, 0, 0, zc - (o.disc ? 0 : 0), { segs: k.seg(32, 10) });
    else k.slab('legs', o.legMat, sector(ri + 0.07, R - 0.07, phi - 0.08 / R, zc, n, 0.02), legH, 0, { bevel: 0.003 });
  } else if (base !== 'floor') {
    const pts = o.disc ? [0.6, 1.6, 2.6, 3.6, 4.6].slice(0, 4).map((a, i) => i * (Math.PI / 2) + Math.PI / 4) : [-phi * 0.8, -phi * 0.3, phi * 0.3, phi * 0.8];
    const rIn = o.disc ? (R - bt) * 0.7 : ri + 0.08, rOut = o.disc ? (R - bt) * 0.7 : R - 0.08;
    for (const t of pts) {
      if (o.disc) legAt(k, base, o.legMat, rIn * Math.sin(t), zc - rIn * Math.cos(t), legH, Math.sign(Math.sin(t)), -Math.sign(Math.cos(t)));
      else for (const rr of [rIn, rOut]) legAt(k, base === 'splay' && rr === rIn ? 'tapered' : base, o.legMat, rr * Math.sin(t), zc - rr * Math.cos(t), legH, Math.sign(Math.sin(t)) * (Math.abs(t) > 0.3 ? 1 : 0), rr === rIn ? 1 : -1);
    }
  }
  throwPillows(k, o.pillows ?? 0, o.pillowMat ?? 'fabric-linen-white', -R * Math.sin(phi * 0.75), R * Math.sin(phi * 0.75), seatH, zc - (R - bt) * Math.cos(phi * 0.5) + 0.02);
}

/** A horizontal annular-sector slab (half angle `half`) turned to angle `mid` (from −z) around the origin. */
function sectorSlab(k, role, mat, r0, r1, half, mid, y0, thick, bevel, n) {
  const sh = sector(r0, r1, half, 0, Math.max(4, Math.round((n * half) / 0.6)), 0.05);
  const bv = Math.min(bevel, thick / 2.2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, thick - 2 * bv), bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: k.hi ? 3 : 1, curveSegments: 4 });
  g.translate(0, 0, bv);
  g.rotateX(Math.PI / 2);
  g.translate(0, thick, 0);
  g.rotateY(-mid);
  g.translate(0, y0, 0);
  g.computeVertexNormals();
  k.add(role, mat, g);
}

/* -------------------------------------------------------- recliner */

function recliner(k, o) {
  const { w, d, seats = 1, fabric: fab } = o;
  const h = o.h ?? 1.02, seatH = o.seatH ?? 0.48, armW = o.armW ?? 0.2, armH = o.armH ?? 0.64;
  const bodyY0 = 0.045, legMat = o.legMat ?? 'plastic-black';
  const x0 = -w / 2 + armW, x1 = w / 2 - armW, iw = x1 - x0;
  const cw = iw / seats;
  const F = seats > 2 ? 3 : 4; // fewer face segments on long recliners (triangle budget)
  legsUnder(k, 'block', legMat, w - 0.03, d - 0.05, bodyY0, { inset: 0.05 });
  // arms: plush padded boxes with a pillow-top pad
  for (const sx of [-1, 1]) {
    const ax = sx * (w / 2 - armW / 2);
    k.soft('upholstery', fab, armW, armH - bodyY0 - 0.05, d, 0.06, ax, bodyY0 + (armH - bodyY0 - 0.05) / 2, 0, { flat: F, puff: 0.012 });
    k.soft('upholstery', fab, armW + 0.012, 0.09, d * 0.92, 0.04, ax, armH - 0.05, d * 0.04, { flat: F, puff: 0.02 });
  }
  for (let i = 0; i < seats; i++) {
    const cx = x0 + cw * (i + 0.5), sw = cw - 0.012;
    // lower body + footrest panel at the front
    k.soft('upholstery', fab, sw + 0.004, 0.3 - bodyY0, d - 0.1, 0.03, cx, (0.3 + bodyY0) / 2, -0.05, { flat: 3 });
    if (o.open) {
      k.soft('cushions', fab, sw - 0.02, 0.08, 0.46, 0.035, cx, 0.4, d / 2 + 0.2, { flat: F, puff: 0.015, rx: 0.08 });
      for (const s of [-1, 1]) {
        k.rod('legs', 'metal-black', [cx + s * (sw / 2 - 0.08), 0.12, d / 2 - 0.12], [cx + s * (sw / 2 - 0.08), 0.37, d / 2 + 0.26], 0.009);
        k.rod('legs', 'metal-black', [cx + s * (sw / 2 - 0.08), 0.33, d / 2 - 0.12], [cx + s * (sw / 2 - 0.08), 0.37, d / 2 + 0.06], 0.009);
      }
      k.soft('upholstery', fab, sw, 0.07, d - 0.1, 0.02, cx, 0.33, -0.05, { flat: 2 });
    } else k.soft('cushions', fab, sw, 0.27, 0.07, 0.03, cx, bodyY0 + 0.135 + 0.01, d / 2 - 0.035, { flat: F, puff: 0.012 });
    // seat: thick pillow-top
    k.soft('cushions', fab, sw, seatH - 0.29, d - 0.24, 0.06, cx, (0.29 + seatH) / 2, 0.08 + (o.open ? 0.02 : 0), { flat: F, puff: 0.03, sag: 0.008 });
    // back: frame + three stacked waterfall pads
    const lean = o.open ? 0.42 : 0.2;
    k.soft('upholstery', fab, sw, h - 0.3 - 0.02, 0.2, 0.06, cx, 0.3 + (h - 0.32) / 2, -d / 2 + 0.1 - (o.open ? 0.04 : 0), { flat: F, puff: 0.01, rx: -lean * 0.5 });
    const ph = (h - seatH - 0.02) / 3;
    for (let j = 0; j < 3; j++) {
      const y = seatH + ph * (j + 0.5);
      const z = -d / 2 + 0.28 - (y - seatH) * Math.sin(lean) - (j === 2 ? 0.02 : 0);
      k.soft('cushions', fab, sw - 0.03, ph + 0.02, 0.17 - j * 0.02, 0.06, cx, y, z, { flat: F, puff: 0.03, rx: -lean });
    }
  }
  if (seats > 1 && o.console) void 0;
}

/* ---------------------------------------------------- wood frames */

/**
 * Exposed wood / cane frame with cushions. o: w, d, seats, h, seatH, armH, frameMat, fabric,
 * side ('cane'|'slats'|'open'|'panel'), backFill ('cushion'|'cane'|'slats'), post, round, futon, open.
 */
function framed(k, o) {
  const { w, d, seats = 2, fabric: fab } = o;
  const h = o.h ?? 0.8, seatH = o.seatH ?? 0.43, armH = o.armH ?? 0.6, fm = o.frameMat ?? 'wood-oak';
  const p = o.post ?? 0.045, side = o.side ?? 'open', seatT = o.seatT ?? 0.13;
  const deckY = seatH - seatT;
  const x0 = -w / 2 + p + 0.005, x1 = w / 2 - p - 0.005, iw = x1 - x0;
  const zf = d / 2 - p / 2 - 0.02, zr = -d / 2 + p / 2 + 0.01;
  const postAt = (x, z, top, taper = o.taper) => {
    if (o.round) k.cyl('frame', fm, p / 2, p / 2 * (taper ? 0.65 : 1), top, x, 0, z, { segs: k.seg(14, 6) });
    else if (taper) { const g = new THREE.CylinderGeometry(p * 0.7, p * 0.45, top, 4, 1); g.rotateY(Math.PI / 4); g.translate(x, top / 2, z); k.add('frame', fm, g); }
    else k.box('frame', fm, p, top, p, x, top / 2, z, { r: 0.006, segs: 2 });
  };
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - p / 2);
    postAt(x, zf, armH - 0.015);
    postAt(x, zr, o.backPost ? h - 0.02 : armH - 0.015);
    // arm rail (paddle) with a front overhang
    const aw = o.armRailW ?? p + 0.03;
    k.box('frame', fm, aw, 0.03, d + 0.03, x - sx * (aw - p) / 2 * 0.5, armH, 0.015, { r: 0.012, segs: 2 });
    // side rails
    k.box('frame', fm, p * 0.8, 0.06, zf - zr, x, deckY - 0.03, (zf + zr) / 2, { r: 0.004 });
    if (side !== 'open') k.box('frame', fm, p * 0.8, 0.035, zf - zr, x, 0.12, (zf + zr) / 2, { r: 0.004 });
    const yA = side === 'open' ? deckY : 0.14, yB = armH - 0.015;
    if (side === 'cane') {
      k.box('cane', 'rattan', 0.012, yB - yA + 0.01, zf - zr - p + 0.004, x, (yA + yB) / 2, (zf + zr) / 2, { r: 0.002 });
    } else if (side === 'slats') {
      const n = Math.max(3, Math.round((zf - zr) / 0.1));
      for (let i = 1; i < n; i++) k.box('frame', fm, p * 0.6, yB - yA, 0.03, x, (yA + yB) / 2, zr + ((zf - zr) / n) * i, { r: 0.004 });
    } else if (side === 'panel') {
      k.box('frame', fm, 0.02, yB - yA, zf - zr - p, x, (yA + yB) / 2, (zf + zr) / 2, { r: 0.003 });
    }
  }
  // front / back rails and the seat deck
  k.box('frame', fm, w - 2 * p + 0.004, 0.07, p * 0.8, 0, deckY - 0.035, zf, { r: 0.005 });
  k.box('frame', fm, w - 2 * p + 0.004, 0.07, p * 0.8, 0, deckY - 0.035, zr, { r: 0.005 });
  k.box('frame', o.futon ? fm : 'fabric-wool-charcoal', iw, 0.02, zf - zr - p * 0.8, 0, deckY - 0.012, (zf + zr) / 2, { r: 0.003 });
  // back frame: posts leaning back with a top rail and an optional infill
  const lean = o.open ? 1.35 : (o.backLean ?? 0.2), bTop = h - 0.02, bh = (bTop - deckY) / Math.cos(Math.min(lean, 1.2));
  const pivotZ = zr + p / 2, pivotY = deckY - 0.02;
  const bpt = (u, v) => [pivotY + v * Math.cos(lean), pivotZ - v * Math.sin(lean) + u];
  if (!o.open || o.futon) {
    for (const sx of [-1, 1]) {
      const [y, z] = bpt(0, bh / 2);
      k.box('frame', fm, p * 0.85, bh, p * 0.8, sx * (w / 2 - p - 0.03), y, z, { r: 0.006, rx: -lean });
    }
    const [ty, tz] = bpt(0, bh - 0.03);
    k.box('frame', fm, w - 2 * p - 0.02, 0.06, p * 0.7, 0, ty, tz, { r: 0.008, rx: -lean });
    const bf = o.backFill ?? 'cushion';
    if (bf === 'cane') { const [cy, cz] = bpt(0, bh * 0.5); k.box('cane', 'rattan', w - 2 * p - 0.1, bh - 0.14, 0.012, 0, cy, cz, { r: 0.002, rx: -lean }); }
    else if (bf === 'slats') for (let i = 0; i < Math.round(iw / 0.12); i++) { const [cy, cz] = bpt(0, bh * 0.5); k.box('frame', fm, 0.04, bh - 0.1, 0.015, -iw / 2 + 0.06 + i * 0.12, cy, cz, { r: 0.003, rx: -lean }); }
  }
  // cushions / mattress
  if (o.futon) {
    const mt = 0.15, sd = zf - zr + 0.02;
    if (o.open) {
      const L = sd + bh;
      k.soft('cushions', fab, iw - 0.01, mt, L, 0.05, 0, deckY + mt / 2, zf + 0.01 - L / 2, { puff: 0.012 });
      buttonGrid(k, fab, iw - 0.1, L - 0.1, M4(0, deckY + mt + 0.006, zf - 0.04, -Math.PI / 2, 0, 0), Math.round(iw / 0.33), Math.round(L / 0.33));
    } else {
      k.soft('cushions', fab, iw - 0.01, mt, sd, 0.05, 0, deckY + mt / 2, (zf + zr) / 2 + 0.01, { puff: 0.012 });
      buttonGrid(k, fab, iw - 0.1, sd - 0.12, M4(0, deckY + mt + 0.006, zf - 0.04, -Math.PI / 2, 0, 0), Math.round(iw / 0.33), 2);
      const bl = bh - 0.05;
      const [cy, cz] = bpt(0.03 + mt / 2 + p * 0.4, bl / 2 + mt * 0.6);
      k.soft('cushions', fab, iw - 0.01, bl, mt, 0.05, 0, cy, cz, { puff: 0.012, rx: -lean });
      buttonGrid(k, fab, iw - 0.1, bl - 0.12, (() => { const [yy, zz] = bpt(0.03 + mt + p * 0.4 + 0.004, mt * 0.6 + 0.06); return M4(0, yy, zz, -lean, 0, 0); })(), Math.round(iw / 0.33), 2);
    }
  } else {
    const n = o.cushion === 'bench' ? 1 : seats, cw = iw / n - (n > 1 ? 0.008 : 0);
    for (let i = 0; i < n; i++) {
      const cx = x0 + (iw / n) * (i + 0.5);
      k.soft('cushions', fab, cw, seatT, zf - zr + 0.03, 0.045, cx, deckY + seatT / 2, (zf + zr) / 2 + 0.01, { puff: 0.016, sag: 0.005 });
    }
    if ((o.backFill ?? 'cushion') === 'cushion' || o.backCushions) {
      const nb = o.nBack ?? seats, bw = iw / nb - 0.008, bch = Math.min(0.5, h - seatH - 0.02);
      for (let i = 0; i < nb; i++) {
        const cx = x0 + (iw / nb) * (i + 0.5);
        const [cy, cz] = bpt(0.02 + 0.085 + p * 0.5, seatT + bch / 2 + 0.01);
        k.soft('cushions', fab, bw, bch, 0.17, 0.055, cx, cy, cz, { puff: 0.025, rx: -lean });
      }
    }
  }
  throwPillows(k, o.pillows ?? 0, o.pillowMat ?? 'fabric-linen-white', x0, x1, seatH, zr + 0.24);
}

/* --------------------------------------------------- click-clack bed */

function clickClack(k, o) {
  const { w, d, fabric: fab } = o;
  const legMat = o.legMat ?? 'metal-chrome', seatH = 0.42, legH = 0.16, t = 0.14;
  const sd = d - 0.08;
  const lean = o.open ? Math.PI / 2 - 0.02 : 0.42;
  k.box('legs', legMat, w - 0.06, 0.03, 0.03, 0, legH + 0.015, d / 2 - 0.08, { r: 0.01 });
  k.box('legs', legMat, w - 0.06, 0.03, 0.03, 0, legH + 0.015, -d / 2 + 0.08, { r: 0.01 });
  legsUnder(k, 'metal', legMat, w - 0.06, d - 0.06, legH, { inset: 0.06 });
  // seat mattress (quilted channels across the width)
  const seatD = o.open ? 0.62 : sd * 0.62;
  const sz = d / 2 - 0.02 - seatD / 2;
  k.soft('cushions', fab, w - 0.02, t, seatD, 0.04, 0, legH + 0.03 + t / 2, sz, { puff: 0.01 });
  const ny = Math.max(2, Math.round(w / 0.32));
  for (let i = 1; i < ny; i++) k.box('piping', fab, 0.012, 0.004, seatD - 0.06, -w / 2 + 0.01 + ((w - 0.02) / ny) * i, legH + 0.03 + t + 0.004, sz, { r: 0.0015 });
  // back mattress hinged at the seat's back edge
  const pz = sz - seatD / 2, py = legH + 0.03 + 0.02;
  const bl = o.open ? 0.62 : 0.6;
  const g = new THREE.Group(); void g;
  const cy = py + (bl / 2) * Math.cos(lean) + (t / 2) * Math.sin(lean), cz = pz - (bl / 2) * Math.sin(lean) - (o.open ? 0 : t / 2 * Math.cos(lean)) + 0.0;
  k.soft('cushions', fab, w - 0.02, bl, t, 0.04, 0, o.open ? legH + 0.03 + t / 2 : cy, o.open ? pz - bl / 2 - 0.004 : cz, { puff: 0.01, rx: o.open ? -Math.PI / 2 : -lean });
  // chrome hinge plates on the sides
  for (const sx of [-1, 1]) k.box('legs', legMat, 0.006, 0.12, 0.2, sx * (w / 2 - 0.006), legH + 0.1, pz, { r: 0.004 });
  throwPillows(k, o.open ? 0 : (o.pillows ?? 0), o.pillowMat ?? 'fabric-linen-white', -w / 2 + 0.05, w / 2 - 0.05, seatH, pz - 0.05, { lean: 0.42 });
}

/* ------------------------------------------------- French cabriole */

function french(k, o) {
  const { w, d, seats = 2, fabric: fab } = o;
  const h = o.h ?? 0.95, seatH = o.seatH ?? 0.46, fm = o.frameMat ?? 'wood-white', armH = 0.66;
  const legH = 0.3;
  const zf = d / 2 - 0.04, zr = -d / 2 + 0.05;
  // legs
  for (const sx of [-1, 1]) for (const z of [zf, zr]) legAt(k, 'cabriole', fm, sx * (w / 2 - 0.05), z, legH, sx, z > 0 ? 1 : -1);
  if (w > 1.3) legAt(k, 'cabriole', fm, 0, zf, legH, 0, 1);
  // serpentine front apron
  const N = k.seg(28, 10), ap = [];
  for (let i = 0; i <= N; i++) { const t = i / N, x = -w / 2 + 0.02 + t * (w - 0.04); ap.push([x, legH - 0.07 + 0.03 * Math.cos(t * Math.PI * 2 * Math.max(1, seats * 0.5)) - 0.02 * Math.sin(t * Math.PI) ]); }
  const apron = [...ap.reverse().map(([x, y]) => [x, y]), [-w / 2 + 0.02, legH + 0.04], [w / 2 - 0.02, legH + 0.04]].reverse();
  extrudeX(k, 'frame', fm, fillet(apron, 0), 0.03, 0, zf + 0.012, 0.008);
  for (const sx of [-1, 1]) k.box('frame', fm, 0.03, 0.09, zf - zr, sx * (w / 2 - 0.035), legH - 0.005, (zf + zr) / 2, { r: 0.006 });
  k.box('frame', fm, w - 0.06, 0.09, 0.03, 0, legH - 0.005, zr, { r: 0.006 });
  // tight upholstered seat with a rounded front
  k.soft('upholstery', fab, w - 0.05, seatH - legH - 0.03, zf - zr + 0.04, 0.05, 0, legH + 0.04 + (seatH - legH - 0.04) / 2, (zf + zr) / 2 + 0.005, { puff: 0.02 });
  // back: arched/serpentine upholstered panel framed by a carved rail
  const by = seatH + 0.03, top = h - 0.06, half = w / 2 - 0.07;
  const M = k.seg(24, 10), tp = [];
  for (let i = 0; i <= M; i++) {
    const t = 1 - (2 * i) / M;
    const f = seats > 1 ? Math.cos((t * Math.PI) / 2) ** 1.5 * 0.7 + 0.3 * Math.cos(t * Math.PI * 1.5) ** 2 : Math.sqrt(Math.max(0, 1 - t * t));
    tp.push([t * half, top - 0.1 + 0.1 * f]);
  }
  const bz = zr - 0.01, lean = 0.12;
  const backShape = fillet([[-half, by], [half, by], ...tp], [0.02, 0.02, ...tp.map((_, i) => (i === 0 || i === tp.length - 1 ? 0.04 : 0))]);
  // rotate the back around its bottom edge
  const tilt = (geo) => { geo.translate(0, -by, 0); geo.rotateX(-lean); geo.translate(0, by, bz); return geo; };
  const pg = new THREE.ExtrudeGeometry(backShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelOffset: -0.02, bevelSegments: k.hi ? 3 : 1, curveSegments: 4 });
  pg.translate(0, 0, -0.02);
  k.add('upholstery', fab, tilt(pg));
  const rail = [[-half - 0.012, by + 0.02], ...tp.map(([x, y]) => [x * (1 + 0.012 / half), y + 0.012]).reverse(), [half + 0.012, by + 0.02]];
  const curve = new THREE.CatmullRomCurve3(rail.map(([x, y]) => new THREE.Vector3(x, y, 0.028)));
  const rg = new THREE.TubeGeometry(curve, k.seg(60, 18), 0.018, k.seg(8, 4), false);
  k.add('frame', fm, tilt(rg));
  for (const sx of [-1, 1]) k.box('frame', fm, 0.04, by - legH + 0.03, 0.045, sx * (half + 0.012), (by + legH) / 2, zr, { r: 0.008 });
  // open arms: a sweeping rail from the back to the front post, padded manchette on top
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.04);
    const A = [[x - sx * 0.02, armH - 0.03, zr + 0.07], [x, armH, (zr + zf) / 2], [x + sx * 0.012, armH - 0.01, zf - 0.02]];
    k.tube('frame', fm, A, 0.018, { radial: k.seg(8, 4), segs: k.seg(18, 6) });
    k.tube('frame', fm, [[x + sx * 0.012, armH - 0.02, zf - 0.02], [x + sx * 0.02, (armH + seatH) / 2, zf + 0.01], [x, legH + 0.02, zf]], 0.02, { radial: k.seg(8, 4), segs: k.seg(14, 6) });
    k.soft('upholstery', fab, 0.06, 0.035, (zf - zr) * 0.45, 0.016, x, armH + 0.022, (zr + zf) / 2 - 0.02, { puff: 0.008 });
  }
  if (o.pillows) throwPillows(k, o.pillows, o.pillowMat ?? 'fabric-linen-white', -w / 2 + 0.06, w / 2 - 0.06, seatH, zr + 0.06);
}

/* ------------------------------------------------------ egg chair */

function eggChair(k, o) {
  const fab = o.fabric, H = 1.08, y0 = 0.27;
  const nu = k.seg(44, 16), nv = k.seg(26, 10);
  const prof = (v) => Math.sin(Math.PI * (0.12 + 0.8 * v)) ** 0.6;
  const lip = 0.4;
  // a closed bowl whose front is cut away along a smooth edge: full height at the back, down to the seat lip in front
  const fn = (u, v) => {
    const ph = (u * 2 - 1) * Math.PI, a = Math.abs(ph);
    const top = lip + (H - lip) * (1 - sm((a - 0.4 * Math.PI) / (0.55 * Math.PI)));
    const y = y0 + v * (top - y0), t = (y - y0) / (H - y0);
    const rx = 0.42 * prof(t), rz = 0.4 * prof(t);
    return [rx * Math.sin(ph), y, -rz * Math.cos(ph) - 0.03 * t];
  };
  k.add('upholstery', fab, shellGeo(nu, nv, fn, 0.035));
  // bottom cap and inner cushions
  k.cyl('upholstery', fab, 0.235, 0.235, 0.02, 0, y0 - 0.005, 0, { segs: k.seg(28, 10) });
  k.soft('cushions', o.seatFabric ?? fab, 0.56, 0.11, 0.5, 0.05, 0, 0.385, 0.02, { puff: 0.02 });
  const g = pillowGeo(0.42, 0.4, 0.13, k.seg(14, 5));
  T(g, 0, 0, 0, -0.32, 0, 0);
  g.translate(0, 0.7, -0.18);
  k.add('cushions', o.seatFabric ?? fab, g);
  // swivel: star base + column
  const lm = o.legMat ?? 'metal-chrome';
  k.cyl('legs', lm, 0.03, 0.03, y0, 0, 0, 0, { segs: k.seg(16, 6) });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.box('legs', lm, 0.06, 0.03, 0.36, Math.sin(a) * 0.17, 0.02, Math.cos(a) * 0.17, { r: 0.01, ry: a });
  }
}

/* ---------------------------------------------------------- finish */

function finish(k) {
  const g = k.group();
  const box = new THREE.Box3().setFromObject(g);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, cy = box.min.y;
  for (const m of g.children) {
    if (m.isMesh) { m.geometry.translate(-cx, -cy, -cz); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere(); }
  }
  return g;
}

/* --------------------------------------------------------- entries */

const SIZE_CTX = { quality: 'high', wallThickness: 0.2, material: () => SIZE_MAT };
const SIZE_MAT = new THREE.MeshBasicMaterial();

const SEAT_TAGS = {
  1: ['1인', '1-seat', '1인 소파', 'armchair', '안락의자', 'accent chair'],
  2: ['2인', '2-seat', '2인 소파', 'loveseat', '러브시트', 'sofa', '소파'],
  3: ['3인', '3-seat', '3인 소파', 'three seater', 'sofa', '소파'],
  4: ['4인', '4-seat', '4인 소파', 'four seater', 'sofa', '소파', 'large sofa'],
};

const BUILDERS = { upholstered, curved, recliner, framed, clickClack, french, egg: eggChair };

/**
 * Declares one sofa. `style` = fixed builder options, `defaults` = editable defaults:
 * width [def, min, max], depth [def, min, max], fabric, fabFilter, legMat (+ legFilter), pillows [def, max],
 * extra params (P…) whose values are passed through `map(p) → options`.
 */
function sofa({ id, ko, en, seats, tags = [], builder = 'upholstered', style = {}, width, depth, fabric = 'fabric-linen-grey', fabFilter = 'fabric', legMat, legFilter = 'wood', pillows, extra = [], map }) {
  const params = [P.len('width', '폭', 'Width', ...width)];
  if (depth) params.push(P.len('depth', '깊이', 'Depth', ...depth));
  params.push(P.mat('fabric', fabFilter === 'leather' ? '가죽' : '천', fabFilter === 'leather' ? 'Leather' : 'Fabric', fabric, fabFilter));
  if (legMat) params.push(P.mat('legMat', legFilter === 'wood' ? '다리/프레임 목재' : '다리 금속', legFilter === 'wood' ? 'Legs / frame wood' : 'Leg metal', legMat, legFilter));
  if (pillows) params.push(P.int('pillows', '쿠션 수', 'Throw pillows', pillows[0], 0, pillows[1]), P.mat('pillowFabric', '쿠션 천', 'Pillow fabric', pillows[2] ?? 'fabric-linen-white', 'fabric'));
  params.push(...extra);
  const fn = BUILDERS[builder];
  const e = item({
    id, category: 'living', ko, en, seats, params,
    tags: [...new Set([...SEAT_TAGS[seats], ...tags])],
    build: (p, ctx) => {
      const k = new Kit(ctx);
      const o = { seats, ...style, w: p.width, d: p.depth ?? style.d, fabric: p.fabric, legMat: p.legMat ?? style.legMat, pillows: p.pillows ?? 0, pillowMat: p.pillowFabric, ...(map ? map(p) : {}) };
      fn(k, o);
      return finish(k);
    },
  });
  let cached = null;
  Object.defineProperty(e, 'size', {
    enumerable: true, configurable: true,
    get() {
      if (!cached) {
        const b = new THREE.Box3().setFromObject(e.build({}, SIZE_CTX));
        cached = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(v * 1000) / 1000);
      }
      return cached;
    },
    set(v) { cached = v; },
  });
  return e;
}

const pick = (key, ko, en, def, options) => P.pick(key, ko, en, def, options);
const BASES_WOOD = [['tapered', '원목 테이퍼', 'Tapered wood'], ['turned', '선반 가공', 'Turned'], ['bun', '번 풋', 'Bun feet'], ['block', '블록', 'Block']];
const ARMS_STD = [['track', '각진', 'Track'], ['round', '둥근', 'Rounded'], ['roll', '롤', 'Rolled'], ['flare', '플레어', 'Flared'], ['none', '없음', 'Armless']];
const CUSHION = [['split', '좌석별', 'Per seat'], ['bench', '벤치(일체형)', 'Bench']];

export const ITEMS = [];
const add = (...e) => { ITEMS.push(...e); return e[0]; };

/* ---------------------------------------------------------- 1-seat */

const club = add(sofa({
  id: 'sofa1-club', ko: '1인 클럽 체어', en: '1-seat club chair', seats: 1, tags: ['club chair', '클럽 체어', 'leather', '가죽'],
  style: { h: 0.78, seatH: 0.43, arm: 'round', armW: 0.2, armH: 0.6, back: 'tight', backD: 0.2, base: 'block', cushion: 'split', piping: true, pipeMat: 'leather-brown' },
  width: [0.88, 0.75, 1.05], depth: [0.9, 0.8, 1.0], fabric: 'leather-cognac', fabFilter: 'leather', legMat: 'wood-dark',
}));
const wingback = add(sofa({
  id: 'sofa1-wingback', ko: '1인 윙백 체어', en: '1-seat wingback chair', seats: 1, tags: ['wingback', '윙백', 'wing chair', '윙체어', 'classic'],
  style: { h: 1.08, seatH: 0.45, arm: 'wing', armW: 0.13, armH: 0.63, back: 'arched', hump: 0.06, backD: 0.17, base: 'cabriole', cushion: 't', lean: 0.1 },
  width: [0.82, 0.72, 0.95], depth: [0.88, 0.8, 0.98], fabric: 'fabric-velvet-green', legMat: 'wood-walnut',
  extra: [pick('base', '다리', 'Legs', 'cabriole', [['cabriole', '카브리올', 'Cabriole'], ['turned', '선반 가공', 'Turned'], ['tapered', '테이퍼', 'Tapered']])],
  map: (p) => ({ base: p.base }),
}));
const barrel = add(sofa({
  id: 'sofa1-barrel', ko: '1인 배럴 체어', en: '1-seat barrel chair', seats: 1, builder: 'curved', tags: ['barrel chair', '배럴 체어', 'tub chair', '터브 체어', 'channel', '채널'],
  style: { h: 0.74, seatH: 0.44, seatT: 0.12, bt: 0.13, phi: 2.15, disc: true, channel: true, base: 'swivel' },
  width: [0.8, 0.68, 0.95], fabric: 'fabric-velvet-rose', legMat: 'metal-brass', legFilter: 'metal',
  map: (p) => ({ R: p.width / 2 }),
}));
const slipper = add(sofa({
  id: 'sofa1-slipper', ko: '1인 슬리퍼 체어', en: '1-seat slipper chair', seats: 1, tags: ['slipper chair', '슬리퍼 체어', 'armless', '팔걸이 없는', 'tufted', '버튼'],
  style: { h: 0.9, seatH: 0.42, arm: 'none', back: 'tufted', backD: 0.14, base: 'tapered', cushion: 'tight' },
  width: [0.62, 0.52, 0.75], depth: [0.78, 0.7, 0.86], fabric: 'fabric-mustard', legMat: 'wood-walnut',
}));
const mcm1 = add(sofa({
  id: 'sofa1-midcentury', ko: '1인 미드센추리 우드암 체어', en: '1-seat mid-century wood-arm chair', seats: 1, builder: 'framed', tags: ['mid-century', '미드센추리', 'wood arm', '원목 팔걸이', 'retro'],
  style: { h: 0.8, seatH: 0.42, armH: 0.6, side: 'open', taper: true, post: 0.045, armRailW: 0.09, backPost: false, backLean: 0.22 },
  width: [0.74, 0.65, 0.85], depth: [0.8, 0.72, 0.9], fabric: 'fabric-terracotta', legMat: 'wood-teak',
  map: (p) => ({ frameMat: p.legMat }),
}));
const recl1 = add(sofa({
  id: 'sofa1-recliner', ko: '1인 리클라이너', en: '1-seat recliner', seats: 1, builder: 'recliner', tags: ['recliner', '리클라이너', 'footrest', '발받침', 'leather', '가죽'],
  style: {}, width: [0.92, 0.82, 1.05], depth: [0.98, 0.9, 1.05], fabric: 'leather-brown', fabFilter: 'leather',
  extra: [P.bool('open', '발받침 펼침', 'Footrest raised', false)], map: (p) => ({ open: p.open }),
}));
const egg = add(sofa({
  id: 'sofa1-egg', ko: '1인 에그 라운지 체어', en: '1-seat egg lounge chair', seats: 1, builder: 'egg', tags: ['egg chair', '에그 체어', 'lounge', '라운지', 'swivel', '회전'],
  style: {}, width: [0.86, 0.86, 0.86], fabric: 'fabric-terracotta', legMat: 'metal-chrome', legFilter: 'metal',
}));
const rattan1 = add(sofa({
  id: 'sofa1-rattan', ko: '1인 라탄 암체어', en: '1-seat rattan armchair', seats: 1, builder: 'framed', tags: ['rattan', '라탄', 'cane', '등나무', 'boho'],
  style: { h: 0.82, seatH: 0.42, armH: 0.6, side: 'cane', backFill: 'cane', backCushions: false, round: true, post: 0.04, backLean: 0.16 },
  width: [0.72, 0.62, 0.85], depth: [0.78, 0.7, 0.88], fabric: 'fabric-linen-white', legMat: 'wood-teak',
  map: (p) => ({ frameMat: p.legMat }),
}));
const chester1 = add(sofa({
  id: 'sofa1-chesterfield', ko: '1인 체스터필드 체어', en: '1-seat chesterfield chair', seats: 1, tags: ['chesterfield', '체스터필드', 'tufted', '버튼 터프팅', 'leather', '가죽'],
  style: { h: 0.74, seatH: 0.45, arm: 'roll', armW: 0.2, back: 'tufted', backD: 0.2, base: 'bun', cushion: 'split', tuftArms: true, armH: 0.74 },
  width: [0.98, 0.88, 1.1], depth: [0.88, 0.8, 0.95], fabric: 'leather-brown', fabFilter: 'leather', legMat: 'wood-dark',
}));
const scandi1 = add(sofa({
  id: 'sofa1-scandi', ko: '1인 북유럽 암체어', en: '1-seat Scandinavian armchair', seats: 1, tags: ['scandinavian', '북유럽', 'nordic', 'oak', '오크'],
  style: { h: 0.8, seatH: 0.43, arm: 'slope', armW: 0.11, armH: 0.6, back: 'loose', backD: 0.15, base: 'splay', cushion: 'split' },
  width: [0.78, 0.68, 0.9], depth: [0.84, 0.76, 0.92], fabric: 'fabric-linen-beige', legMat: 'wood-oak',
}));
const tux1 = add(sofa({
  id: 'sofa1-tuxedo', ko: '1인 턱시도 체어', en: '1-seat tuxedo chair', seats: 1, tags: ['tuxedo', '턱시도', 'modern', '모던', 'velvet', '벨벳'],
  style: { h: 0.74, seatH: 0.44, arm: 'tuxedo', armW: 0.14, back: 'channel', channelW: 0.12, backD: 0.15, base: 'metal', cushion: 'tight' },
  width: [0.78, 0.68, 0.9], depth: [0.82, 0.75, 0.9], fabric: 'fabric-velvet-blue', legMat: 'metal-brass', legFilter: 'metal',
}));
add(
  variant(club, 'black', '1인 블랙 가죽 클럽 체어', '1-seat black leather club chair', { fabric: 'leather-black', legMat: 'wood-black', width: 0.92 }, { tags: ['black', '블랙'], seats: 1 }),
  variant(wingback, 'tartan', '1인 윙백 체어 (린넨·턴드 다리)', '1-seat wingback chair, linen + turned legs', { fabric: 'fabric-linen-beige', base: 'turned', legMat: 'wood-oak' }, { tags: ['linen', '린넨'], seats: 1 }),
  variant(barrel, 'boucle', '1인 부클레 배럴 체어', '1-seat boucle barrel chair', { fabric: 'fabric-boucle', legMat: 'metal-black', width: 0.86 }, { tags: ['boucle', '부클레'], seats: 1 }),
);

/* ---------------------------------------------------------- 2-seat */

const chester2 = add(sofa({
  id: 'sofa2-chesterfield', ko: '2인 체스터필드 소파', en: '2-seat chesterfield sofa', seats: 2, tags: ['chesterfield', '체스터필드', 'tufted', '버튼 터프팅', 'leather', '가죽'],
  style: { h: 0.75, seatH: 0.45, arm: 'roll', armW: 0.21, armH: 0.75, back: 'tufted', backD: 0.2, base: 'bun', cushion: 'split', tuftArms: true },
  width: [1.7, 1.5, 1.9], depth: [0.9, 0.82, 0.98], fabric: 'leather-brown', fabFilter: 'leather', legMat: 'wood-dark',
}));
const mcm2 = add(sofa({
  id: 'sofa2-midcentury', ko: '2인 미드센추리 소파', en: '2-seat mid-century sofa', seats: 2, tags: ['mid-century', '미드센추리', 'retro', '레트로', 'button', '버튼'],
  style: { h: 0.8, seatH: 0.44, arm: 'track', armW: 0.1, armH: 0.6, back: 'loose', backButtons: true, backCushT: 0.15, backD: 0.15, base: 'splay', cushion: 'bench', lean: 0.18 },
  width: [1.6, 1.4, 1.8], depth: [0.84, 0.78, 0.92], fabric: 'fabric-mustard', legMat: 'wood-walnut',
  extra: [pick('cushion', '좌석 쿠션', 'Seat cushion', 'bench', CUSHION)], map: (p) => ({ cushion: p.cushion }),
}));
const camel2 = add(sofa({
  id: 'sofa2-camelback', ko: '2인 카멜백 소파', en: '2-seat camel-back sofa', seats: 2, tags: ['camel back', '카멜백', 'classic', '클래식', 'traditional'],
  style: { h: 0.92, seatH: 0.45, arm: 'roll', armW: 0.17, armH: 0.64, back: 'camel', hump: 0.14, backD: 0.18, base: 'turned', cushion: 'bench', piping: true },
  width: [1.72, 1.5, 1.9], depth: [0.88, 0.8, 0.95], fabric: 'fabric-linen-beige', legMat: 'wood-walnut', pillows: [2, 2, 'fabric-navy'],
}));
const curved2 = add(sofa({
  id: 'sofa2-curved', ko: '2인 커브드 부클레 소파', en: '2-seat curved boucle sofa', seats: 2, builder: 'curved', tags: ['curved', '곡선', 'boucle', '부클레', 'round', '라운드'],
  style: { h: 0.74, seatH: 0.42, bt: 0.22, b: 0.86, base: 'plinth', armW: 0.2, armH: 0.6 }, width: [1.8, 1.55, 2.1], fabric: 'fabric-boucle', legMat: 'wood-oak',
  extra: [P.len('sag', '휜 정도', 'Curve depth', 0.22, 0.12, 0.38)], map: (p) => ({ sag: p.sag }),
}));
const tux2 = add(sofa({
  id: 'sofa2-tuxedo', ko: '2인 턱시도 소파', en: '2-seat tuxedo sofa', seats: 2, tags: ['tuxedo', '턱시도', 'modern', '모던'],
  style: { h: 0.74, seatH: 0.44, arm: 'tuxedo', armW: 0.16, back: 'tight', backD: 0.18, base: 'plinth', cushion: 'split', lean: 0.1 },
  width: [1.6, 1.4, 1.85], depth: [0.86, 0.8, 0.95], fabric: 'fabric-wool-charcoal', legMat: 'wood-dark', pillows: [2, 2, 'fabric-mustard'],
}));
const scandi2 = add(sofa({
  id: 'sofa2-scandi', ko: '2인 북유럽 소파', en: '2-seat Scandinavian sofa', seats: 2, tags: ['scandinavian', '북유럽', 'nordic', 'oak', '오크'],
  style: { h: 0.8, seatH: 0.43, arm: 'slope', armW: 0.11, armH: 0.6, back: 'loose', backD: 0.16, base: 'splay', cushion: 'split' },
  width: [1.56, 1.4, 1.8], depth: [0.84, 0.78, 0.92], fabric: 'fabric-linen-grey', legMat: 'wood-oak', pillows: [1, 2, 'fabric-mustard'],
}));
const rattan2 = add(sofa({
  id: 'sofa2-rattan', ko: '2인 라탄 소파', en: '2-seat rattan sofa', seats: 2, builder: 'framed', tags: ['rattan', '라탄', 'cane', '등나무', 'boho'],
  style: { h: 0.8, seatH: 0.42, armH: 0.6, side: 'cane', backFill: 'cane', backCushions: true, nBack: 2, round: true, post: 0.042, backLean: 0.18 },
  width: [1.4, 1.2, 1.6], depth: [0.78, 0.7, 0.88], fabric: 'fabric-linen-white', legMat: 'wood-teak', pillows: [1, 2, 'fabric-terracotta'],
  map: (p) => ({ frameMat: p.legMat }),
}));
const bed2 = add(sofa({
  id: 'sofa2-sofabed', ko: '2인 클릭클락 소파베드', en: '2-seat click-clack sofa bed', seats: 2, builder: 'clickClack', tags: ['sofa bed', '소파베드', 'click clack', '접이식', 'guest bed'],
  style: {}, width: [1.4, 1.2, 1.6], depth: [0.92, 0.88, 0.98], fabric: 'fabric-cotton-grey', legMat: 'metal-chrome', legFilter: 'metal', pillows: [2, 2, 'fabric-navy'],
  extra: [P.bool('open', '침대로 펼침', 'Unfolded as bed', false)], map: (p) => ({ open: p.open }),
}));
const recl2 = add(sofa({
  id: 'sofa2-recliner', ko: '2인 리클라이너 소파', en: '2-seat recliner sofa', seats: 2, builder: 'recliner', tags: ['recliner', '리클라이너', 'footrest', '발받침'],
  style: {}, width: [1.62, 1.5, 1.8], depth: [0.98, 0.9, 1.05], fabric: 'fabric-wool-charcoal', fabFilter: 'fabric',
  extra: [P.bool('open', '발받침 펼침', 'Footrests raised', false)], map: (p) => ({ open: p.open }),
}));
const english2 = add(sofa({
  id: 'sofa2-english', ko: '2인 잉글리시 롤암 소파', en: '2-seat English roll-arm sofa', seats: 2, tags: ['english roll arm', '잉글리시', 'roll arm', '롤암', 'traditional'],
  style: { h: 0.86, seatH: 0.45, arm: 'roll', armW: 0.15, armH: 0.6, back: 'tight', backD: 0.18, base: 'turned', cushion: 'bench', piping: true, lean: 0.12 },
  width: [1.6, 1.4, 1.85], depth: [0.9, 0.82, 0.98], fabric: 'fabric-cotton-white', legMat: 'wood-walnut', pillows: [2, 2, 'fabric-velvet-blue'],
}));
const floor2 = add(sofa({
  id: 'sofa2-floor', ko: '2인 저상 좌식 소파', en: '2-seat low floor sofa', seats: 2, tags: ['floor sofa', '좌식 소파', 'low sofa', '저상', 'japanese', '일본식'],
  style: { h: 0.62, seatH: 0.3, seatT: 0.15, arm: 'round', armW: 0.16, armH: 0.44, back: 'pillow', backD: 0.16, base: 'platform', cushion: 'split' },
  width: [1.6, 1.3, 1.9], depth: [0.92, 0.82, 1.0], fabric: 'fabric-linen-beige', legMat: 'wood-ash',
}));
const french2 = add(sofa({
  id: 'sofa2-french', ko: '2인 프렌치 카브리올 소파', en: '2-seat French cabriole settee', seats: 2, builder: 'french', tags: ['french', '프렌치', 'cabriole', '카브리올', 'louis', 'classic'],
  style: { d: 0.74 }, width: [1.45, 1.3, 1.65], fabric: 'fabric-velvet-blue', legMat: 'wood-white', pillows: [0, 2, 'fabric-linen-white'],
  map: (p) => ({ frameMat: p.legMat, d: 0.74 }),
}));
add(
  variant(chester2, 'black', '2인 블랙 가죽 체스터필드 소파', '2-seat black leather chesterfield sofa', { fabric: 'leather-black', legMat: 'wood-black', width: 1.6 }, { tags: ['black', '블랙'], seats: 2 }),
  variant(curved2, 'deep', '2인 딥 커브 소파 (테라코타)', '2-seat deep-curve sofa, terracotta', { fabric: 'fabric-terracotta', sag: 0.34, width: 1.9 }, { tags: ['terracotta', '테라코타'], seats: 2 }),
  variant(mcm2, 'split', '2인 미드센추리 소파 (분리 쿠션)', '2-seat mid-century sofa, split cushions', { cushion: 'split', fabric: 'fabric-velvet-green', legMat: 'wood-teak' }, { tags: ['velvet', '벨벳'], seats: 2 }),
);

/* ---------------------------------------------------------- 3-seat */

const BASE_PICK = (def) => pick('base', '받침', 'Base', def, [['turned', '선반 가공 다리', 'Turned legs'], ['tapered', '테이퍼 다리', 'Tapered legs'], ['bun', '번 풋', 'Bun feet'], ['skirt', '스커트', 'Skirted']]);

const chester3 = add(sofa({
  id: 'sofa3-chesterfield', ko: '3인 체스터필드 소파', en: '3-seat chesterfield sofa', seats: 3, tags: ['chesterfield', '체스터필드', 'tufted', '버튼 터프팅', 'velvet', '벨벳'],
  style: { h: 0.76, seatH: 0.45, arm: 'roll', armW: 0.22, armH: 0.76, back: 'tufted', backD: 0.2, base: 'bun', cushion: 'split', tuftArms: true },
  width: [2.2, 1.9, 2.5], depth: [0.92, 0.84, 1.0], fabric: 'fabric-velvet-green', legMat: 'wood-dark',
}));
const lawson3 = add(sofa({
  id: 'sofa3-lawson', ko: '3인 로슨 소파', en: '3-seat Lawson sofa', seats: 3, tags: ['lawson', '로슨', 'loose back', '등쿠션', 'classic'],
  style: { h: 0.88, seatH: 0.45, arm: 'round', armW: 0.17, armH: 0.6, back: 'loose', backD: 0.18, cushion: 'split', piping: true, lean: 0.16 },
  width: [2.2, 1.9, 2.5], depth: [0.95, 0.86, 1.02], fabric: 'fabric-linen-beige', legMat: 'wood-walnut', pillows: [2, 4, 'fabric-terracotta'],
  extra: [BASE_PICK('turned')], map: (p) => ({ base: p.base }),
}));
const mcm3 = add(sofa({
  id: 'sofa3-midcentury', ko: '3인 미드센추리 버튼 소파', en: '3-seat mid-century button sofa', seats: 3, tags: ['mid-century', '미드센추리', 'button tufted', '버튼', 'retro', '레트로'],
  style: { h: 0.78, seatH: 0.43, arm: 'track', armW: 0.09, armH: 0.58, back: 'tight', backD: 0.16, base: 'splay', cushion: 'tight', tuftSeat: true, lean: 0.2 },
  width: [2.05, 1.8, 2.3], depth: [0.84, 0.78, 0.92], fabric: 'fabric-navy', legMat: 'wood-walnut',
}));
const boxy3 = add(sofa({
  id: 'sofa3-boxy', ko: '3인 모던 박스형 소파', en: '3-seat modern boxy sofa', seats: 3, tags: ['modern', '모던', 'boxy', '박스형', 'deep seat', '딥 시트'],
  style: { h: 0.72, seatH: 0.42, seatT: 0.16, arm: 'track', armW: 0.26, armH: 0.6, back: 'loose', backCushT: 0.22, backD: 0.2, base: 'plinth', cushion: 'split', lean: 0.1 },
  width: [2.3, 2.0, 2.7], depth: [1.0, 0.9, 1.1], fabric: 'fabric-wool-charcoal', legMat: 'wood-black', pillows: [2, 4, 'fabric-linen-white'],
}));
const curved3 = add(sofa({
  id: 'sofa3-curved', ko: '3인 커브드 소파', en: '3-seat curved sofa', seats: 3, builder: 'curved', tags: ['curved', '곡선', 'crescent', '반달형', 'velvet', '벨벳'],
  style: { h: 0.76, seatH: 0.43, bt: 0.2, b: 0.9, base: 'metal', armW: 0.18, armH: 0.6, backPillows: 3 }, width: [2.4, 2.1, 2.8], fabric: 'fabric-velvet-rose', legMat: 'metal-brass', legFilter: 'metal',
  extra: [P.len('sag', '휜 정도', 'Curve depth', 0.3, 0.15, 0.45)], map: (p) => ({ sag: p.sag }),
}));
const camel3 = add(sofa({
  id: 'sofa3-camelback', ko: '3인 터프티드 카멜백 소파', en: '3-seat tufted camel-back sofa', seats: 3, tags: ['camel back', '카멜백', 'tufted', '터프팅', 'traditional'],
  style: { h: 0.95, seatH: 0.45, arm: 'scroll', armW: 0.17, armH: 0.64, back: 'camel', hump: 0.16, tuftBack: true, backD: 0.18, base: 'cabriole', cushion: 'bench' },
  width: [2.15, 1.9, 2.4], depth: [0.9, 0.82, 0.98], fabric: 'fabric-velvet-blue', legMat: 'wood-walnut',
}));
const channel3 = add(sofa({
  id: 'sofa3-channel', ko: '3인 채널 소파', en: '3-seat channel-tufted sofa', seats: 3, tags: ['channel tufted', '채널', 'velvet', '벨벳', 'glam', '글램'],
  style: { h: 0.78, seatH: 0.44, arm: 'flare', armW: 0.18, armH: 0.64, back: 'channel', channelW: 0.16, backD: 0.17, base: 'metal', cushion: 'bench', lean: 0.15 },
  width: [2.15, 1.9, 2.4], depth: [0.9, 0.84, 0.98], fabric: 'fabric-velvet-green', legMat: 'metal-gold', legFilter: 'metal',
}));
const tux3 = add(sofa({
  id: 'sofa3-tuxedo', ko: '3인 턱시도 소파 (썰매 다리)', en: '3-seat tuxedo sofa, sled base', seats: 3, tags: ['tuxedo', '턱시도', 'sled', '썰매형', 'modern'],
  style: { h: 0.76, seatH: 0.44, arm: 'tuxedo', armW: 0.15, back: 'tight', backD: 0.17, base: 'sled', cushion: 'split', lean: 0.1 },
  width: [2.1, 1.85, 2.4], depth: [0.88, 0.82, 0.96], fabric: 'fabric-cotton-grey', legMat: 'metal-black', legFilter: 'metal', pillows: [2, 2, 'fabric-mustard'],
}));
const futon3 = add(sofa({
  id: 'sofa3-futon', ko: '3인 원목 퓨톤 소파베드', en: '3-seat wooden futon sofa bed', seats: 3, builder: 'framed', tags: ['futon', '퓨톤', 'sofa bed', '소파베드', 'wood frame', '원목'],
  style: { h: 0.86, seatH: 0.45, armH: 0.6, side: 'slats', post: 0.065, futon: true, backPost: false, backLean: 0.28, seatT: 0.15 },
  width: [2.0, 1.8, 2.2], depth: [0.92, 0.86, 1.0], fabric: 'fabric-cotton-grey', legMat: 'wood-pine',
  extra: [P.bool('open', '침대로 펼침', 'Unfolded as bed', false)], map: (p) => ({ frameMat: p.legMat, open: p.open }),
}));
const recl3 = add(sofa({
  id: 'sofa3-recliner', ko: '3인 리클라이너 소파', en: '3-seat recliner sofa', seats: 3, builder: 'recliner', tags: ['recliner', '리클라이너', 'home theater', '홈시어터', 'leather', '가죽'],
  style: {}, width: [2.2, 2.0, 2.45], depth: [0.98, 0.9, 1.05], fabric: 'leather-black', fabFilter: 'leather',
  extra: [P.bool('open', '발받침 펼침', 'Footrests raised', false)], map: (p) => ({ open: p.open }),
}));
const rattan3 = add(sofa({
  id: 'sofa3-rattan', ko: '3인 라탄 소파', en: '3-seat rattan sofa', seats: 3, builder: 'framed', tags: ['rattan', '라탄', 'cane', '등나무', 'resort', '리조트'],
  style: { h: 0.8, seatH: 0.42, armH: 0.62, side: 'cane', backFill: 'slats', backCushions: true, round: true, post: 0.045, backLean: 0.2, armRailW: 0.08 },
  width: [1.95, 1.7, 2.2], depth: [0.82, 0.74, 0.9], fabric: 'fabric-linen-beige', legMat: 'wood-teak', pillows: [2, 2, 'fabric-mustard'],
  map: (p) => ({ frameMat: p.legMat }),
}));
const skirt3 = add(sofa({
  id: 'sofa3-skirted', ko: '3인 스커트 롤암 소파', en: '3-seat skirted roll-arm sofa', seats: 3, tags: ['skirted', '스커트', 'roll arm', '롤암', 'cottage', '코티지'],
  style: { h: 0.9, seatH: 0.45, arm: 'roll', armW: 0.17, armH: 0.62, back: 'loose', backD: 0.18, base: 'skirt', cushion: 'split', lean: 0.16 },
  width: [2.2, 1.9, 2.5], depth: [0.94, 0.86, 1.0], fabric: 'fabric-cotton-white', pillows: [4, 4, 'fabric-velvet-blue'],
}));
const scroll3 = add(sofa({
  id: 'sofa3-scroll', ko: '3인 스크롤암 소파', en: '3-seat scroll-arm sofa', seats: 3, tags: ['scroll arm', '스크롤암', 'victorian', '빅토리안', 'arched back'],
  style: { h: 0.9, seatH: 0.45, arm: 'scroll', armW: 0.2, armH: 0.66, back: 'arched', hump: 0.08, backD: 0.17, base: 'turned', cushion: 'split', piping: true },
  width: [2.1, 1.85, 2.4], depth: [0.9, 0.82, 0.98], fabric: 'fabric-terracotta', legMat: 'wood-dark',
}));
add(
  variant(chester3, 'leather', '3인 가죽 체스터필드 소파', '3-seat leather chesterfield sofa', { fabric: 'leather-cognac', legMat: 'wood-walnut', width: 2.3 }, { tags: ['leather', '가죽'], seats: 3 }),
  variant(lawson3, 'skirted', '3인 로슨 소파 (스커트)', '3-seat Lawson sofa, skirted', { base: 'skirt', fabric: 'fabric-linen-grey', pillows: 4 }, { tags: ['skirted', '스커트'], seats: 3 }),
  variant(boxy3, 'wide', '3인 와이드 박스형 소파 (부클레)', '3-seat wide boxy sofa, boucle', { width: 2.6, depth: 1.08, fabric: 'fabric-boucle', legMat: 'wood-oak' }, { tags: ['boucle', '부클레'], seats: 3 }),
);

/* ---------------------------------------------------------- 4-seat */

const chester4 = add(sofa({
  id: 'sofa4-chesterfield', ko: '4인 체스터필드 소파', en: '4-seat chesterfield sofa', seats: 4, tags: ['chesterfield', '체스터필드', 'tufted', '버튼 터프팅', 'leather', '가죽'],
  style: { h: 0.76, seatH: 0.45, arm: 'roll', armW: 0.23, armH: 0.76, back: 'tufted', backD: 0.2, base: 'turned', cushion: 'split', nSeat: 3, tuftArms: true },
  width: [2.75, 2.5, 3.1], depth: [0.95, 0.86, 1.02], fabric: 'leather-cognac', fabFilter: 'leather', legMat: 'wood-dark',
}));
const modular4 = add(sofa({
  id: 'sofa4-modular', ko: '4인 모듈 소파', en: '4-seat modular sofa', seats: 4, tags: ['modular', '모듈', 'sectional', '조합형', 'low', '로우'],
  style: { h: 0.72, seatH: 0.41, seatT: 0.16, arm: 'track', armW: 0.22, armH: 0.56, back: 'loose', backCushT: 0.22, backD: 0.2, base: 'block', legH: 0.03, cushion: 'split', modular: true, lean: 0.12 },
  width: [3.0, 2.6, 3.3], depth: [1.02, 0.92, 1.1], fabric: 'fabric-linen-grey', legMat: 'wood-black', pillows: [3, 4, 'fabric-terracotta'],
}));
const lounge4 = add(sofa({
  id: 'sofa4-lounge', ko: '4인 로우 라운지 소파', en: '4-seat low lounge sofa', seats: 4, tags: ['lounge', '라운지', 'low back', '로우백', 'pillow back', '필로우'],
  style: { h: 0.68, seatH: 0.4, seatT: 0.17, arm: 'round', armW: 0.24, armH: 0.52, back: 'pillow', backD: 0.2, base: 'plinth', cushion: 'bench' },
  width: [3.0, 2.6, 3.3], depth: [1.08, 0.98, 1.2], fabric: 'fabric-boucle', legMat: 'wood-oak', pillows: [2, 4, 'fabric-mustard'],
}));
const lawson4 = add(sofa({
  id: 'sofa4-lawson', ko: '4인 로슨 소파', en: '4-seat Lawson sofa', seats: 4, tags: ['lawson', '로슨', 'loose back', '등쿠션', 'family', '패밀리'],
  style: { h: 0.88, seatH: 0.45, arm: 'round', armW: 0.17, armH: 0.6, back: 'loose', backD: 0.18, base: 'tapered', cushion: 'split', piping: true, lean: 0.16 },
  width: [2.8, 2.5, 3.1], depth: [0.96, 0.88, 1.04], fabric: 'fabric-linen-white', legMat: 'wood-oak', pillows: [4, 4, 'fabric-navy'],
}));
const curved4 = add(sofa({
  id: 'sofa4-curved', ko: '4인 대형 커브드 소파', en: '4-seat large curved sofa', seats: 4, builder: 'curved', tags: ['curved', '곡선', 'crescent', '반달형', 'boucle', '부클레'],
  style: { h: 0.74, seatH: 0.42, bt: 0.22, b: 0.92, base: 'plinth', armW: 0.22, armH: 0.6, backPillows: 4 }, width: [3.0, 2.6, 3.4], fabric: 'fabric-linen-beige', legMat: 'wood-walnut',
  extra: [P.len('sag', '휜 정도', 'Curve depth', 0.36, 0.18, 0.55)], map: (p) => ({ sag: p.sag }),
}));
const channel4 = add(sofa({
  id: 'sofa4-channel', ko: '4인 암리스 채널 소파', en: '4-seat armless channel sofa', seats: 4, tags: ['armless', '팔걸이 없는', 'channel tufted', '채널', 'banquette', '벤치형'],
  style: { h: 0.8, seatH: 0.45, arm: 'none', back: 'channel', channelW: 0.18, backD: 0.17, base: 'plinth', cushion: 'tight', lean: 0.12 },
  width: [2.7, 2.4, 3.1], depth: [0.86, 0.8, 0.95], fabric: 'fabric-mustard', legMat: 'metal-brass', legFilter: 'metal',
}));
const mcm4 = add(sofa({
  id: 'sofa4-midcentury', ko: '4인 미드센추리 원목 프레임 소파', en: '4-seat mid-century wood-frame sofa', seats: 4, builder: 'framed', tags: ['mid-century', '미드센추리', 'wood frame', '원목 프레임', 'slatted', '슬랫'],
  style: { h: 0.8, seatH: 0.42, armH: 0.6, side: 'slats', post: 0.05, taper: true, armRailW: 0.1, backLean: 0.22, nBack: 4 },
  width: [2.7, 2.4, 3.0], depth: [0.86, 0.78, 0.94], fabric: 'fabric-wool-charcoal', legMat: 'wood-teak', pillows: [2, 2, 'fabric-mustard'],
  map: (p) => ({ frameMat: p.legMat }),
}));
const tux4 = add(sofa({
  id: 'sofa4-tuxedo', ko: '4인 턱시도 소파', en: '4-seat tuxedo sofa', seats: 4, tags: ['tuxedo', '턱시도', 'button', '버튼', 'classic modern'],
  style: { h: 0.76, seatH: 0.44, arm: 'tuxedo', armW: 0.17, back: 'tight', backD: 0.18, base: 'tapered', cushion: 'split', seatButtons: true, lean: 0.1 },
  width: [2.7, 2.4, 3.0], depth: [0.9, 0.84, 0.98], fabric: 'fabric-velvet-blue', legMat: 'wood-dark',
}));
const recl4 = add(sofa({
  id: 'sofa4-recliner', ko: '4인 리클라이너 소파', en: '4-seat recliner sofa', seats: 4, builder: 'recliner', tags: ['recliner', '리클라이너', 'home theater', '홈시어터', 'footrest', '발받침'],
  style: {}, width: [2.9, 2.7, 3.2], depth: [0.98, 0.9, 1.05], fabric: 'fabric-cotton-grey',
  extra: [P.bool('open', '발받침 펼침', 'Footrests raised', false)], map: (p) => ({ open: p.open }),
}));
const floor4 = add(sofa({
  id: 'sofa4-floor', ko: '4인 저상 좌식 소파', en: '4-seat low floor sofa', seats: 4, tags: ['floor sofa', '좌식 소파', 'low sofa', '저상', 'japanese', '일본식'],
  style: { h: 0.58, seatH: 0.28, seatT: 0.16, arm: 'track', armW: 0.14, armH: 0.4, back: 'loose', backCushT: 0.18, backD: 0.14, base: 'floor', cushion: 'split', lean: 0.22 },
  width: [2.6, 2.2, 3.0], depth: [0.95, 0.85, 1.05], fabric: 'fabric-linen-grey', pillows: [2, 4, 'fabric-linen-beige'],
}));
const english4 = add(sofa({
  id: 'sofa4-english', ko: '4인 잉글리시 롤암 소파', en: '4-seat English roll-arm sofa', seats: 4, tags: ['english roll arm', '잉글리시', 'roll arm', '롤암', 'traditional', '클래식'],
  style: { h: 0.86, seatH: 0.45, arm: 'roll', armW: 0.16, armH: 0.6, back: 'tight', backD: 0.18, base: 'turned', cushion: 'split', nSeat: 3, piping: true, lean: 0.12 },
  width: [2.7, 2.4, 3.0], depth: [0.92, 0.84, 1.0], fabric: 'fabric-linen-grey', legMat: 'wood-walnut', pillows: [4, 4, 'fabric-linen-white'],
}));
const scandi4 = add(sofa({
  id: 'sofa4-scandi', ko: '4인 북유럽 소파', en: '4-seat Scandinavian sofa', seats: 4, tags: ['scandinavian', '북유럽', 'nordic', 'sloped arm', '경사 팔걸이'],
  style: { h: 0.8, seatH: 0.43, arm: 'slope', armW: 0.12, armH: 0.6, back: 'loose', backD: 0.16, base: 'splay', cushion: 'split' },
  width: [2.75, 2.4, 3.0], depth: [0.88, 0.8, 0.96], fabric: 'fabric-linen-beige', legMat: 'wood-oak', pillows: [2, 4, 'fabric-velvet-green'],
}));
add(
  variant(modular4, 'velvet', '4인 모듈 소파 (와이드·벨벳)', '4-seat modular sofa, wide velvet', { width: 3.3, depth: 1.08, fabric: 'fabric-velvet-green', pillows: 4 }, { tags: ['velvet', '벨벳'], seats: 4 }),
  variant(recl4, 'open', '4인 리클라이너 소파 (발받침 펼침)', '4-seat recliner sofa, footrests raised', { open: true, fabric: 'fabric-wool-charcoal' }, { tags: ['open', '펼침'], seats: 4 }),
  variant(curved4, 'terracotta', '4인 반달형 커브드 소파 (테라코타)', '4-seat crescent curved sofa, terracotta', { fabric: 'fabric-terracotta', sag: 0.5, width: 3.2 }, { tags: ['terracotta', '테라코타'], seats: 4 }),
);
void [lawson4, lounge4, channel4, mcm4, tux4, floor4, english4, scandi4, mcm3, camel3, channel3, tux3, futon3, recl3, rattan3, skirt3, scroll3, curved3];
void [mcm1, recl1, egg, rattan1, chester1, scandi1, tux1, slipper, camel2, tux2, scandi2, rattan2, bed2, recl2, english2, floor2, french2];

export { upholstered, curved, recliner, framed, clickClack, french, eggChair, sofa as sofaEntry, BASES_WOOD, ARMS_STD };
