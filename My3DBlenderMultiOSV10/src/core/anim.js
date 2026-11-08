// Keyframe animation: F-curves on named properties, interpolation, NLA strips, drivers.
//
// An animated thing has  anim: { fcurves: { 'location.0': [ { f, v, interp, easing, hl, hr, handleType, sel } … ] }, modifiers: { path: [mod…] }, extrapolation: { path: kind }, nla: [strip…] }.
// A path walks the object ('modifiers.0.levels'); a number at the end is an array index.

export const HANDLE_TYPES = ['AUTO', 'VECTOR', 'ALIGNED', 'FREE'];
export const INTERPOLATIONS = ['CONSTANT', 'LINEAR', 'BEZIER', 'SINE', 'QUAD', 'CUBIC', 'QUART', 'QUINT', 'EXPO', 'CIRC', 'BACK', 'BOUNCE', 'ELASTIC'];

const EASE = {
  SINE: (t) => 1 - Math.cos((t * Math.PI) / 2),
  QUAD: (t) => t * t,
  CUBIC: (t) => t * t * t,
  QUART: (t) => t ** 4,
  QUINT: (t) => t ** 5,
  EXPO: (t) => (t === 0 ? 0 : 2 ** (10 * (t - 1))),
  CIRC: (t) => 1 - Math.sqrt(1 - t * t),
  BACK: (t) => t * t * (2.70158 * t - 1.70158),
  ELASTIC: (t) => (t === 0 || t === 1 ? t : -(2 ** (10 * (t - 1))) * Math.sin(((t - 1.075) * (2 * Math.PI)) / 0.3)),
  BOUNCE: (t) => {
    const b = (x) => {
      if (x < 1 / 2.75) return 7.5625 * x * x;
      if (x < 2 / 2.75) { const y = x - 1.5 / 2.75; return 7.5625 * y * y + 0.75; }
      if (x < 2.5 / 2.75) { const y = x - 2.25 / 2.75; return 7.5625 * y * y + 0.9375; }
      const y = x - 2.625 / 2.75;
      return 7.5625 * y * y + 0.984375;
    };
    return 1 - b(1 - t);
  },
};

function ease(name, easing, t) {
  const fn = EASE[name];
  if (easing === 'OUT') return 1 - fn(1 - t);
  if (easing === 'IN_OUT') return t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2;
  return fn(t);
}

/** The curve parameter at time x on a cubic with control times x0…x3 (bisection: x is monotonic). */
function solveBezierX(x0, x1, x2, x3, x) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    const m = 1 - t;
    const value = m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3;
    if (value < x) lo = t; else hi = t;
  }
  return (lo + hi) / 2;
}

/** Automatic handles: flat at extremes, otherwise along the line between the neighbours. */
export function autoHandles(keys) {
  keys.forEach((k, i) => {
    const prev = keys[i - 1];
    const next = keys[i + 1];
    if (k.handleType === 'FREE' || k.handleType === 'ALIGNED') return;
    if (k.handleType === 'VECTOR') {
      // Straight at the neighbour on each side.
      const [l, r] = [prev ?? k, next ?? k];
      k.hl = [k.f + (l.f - k.f) / 3, k.v + (l.v - k.v) / 3];
      k.hr = [k.f + (r.f - k.f) / 3, k.v + (r.v - k.v) / 3];
      return;
    }
    if (!prev || !next) {
      const d = ((next ?? k).f - (prev ?? k).f) / 3;
      k.hl = [k.f - d, k.v];
      k.hr = [k.f + d, k.v];
      return;
    }
    const extreme = (k.v - prev.v) * (next.v - k.v) <= 0;
    const slope = extreme ? 0 : (next.v - prev.v) / (next.f - prev.f);
    const [dl, dr] = [(k.f - prev.f) / 3, (next.f - k.f) / 3];
    k.hl = [k.f - dl, k.v - slope * dl];
    k.hr = [k.f + dr, k.v + slope * dr];
  });
  return keys;
}

/** The curve's value at a frame; before the first and after the last key it holds (or follows `extrapolation`). */
export function evalCurve(keys, frame, extrapolation = 'CONSTANT') {
  if (!keys?.length) return 0;
  const first = keys[0];
  const last = keys.at(-1);
  if (frame <= first.f) {
    if (extrapolation === 'LINEAR' && keys.length > 1) return first.v + ((keys[1].v - first.v) / (keys[1].f - first.f)) * (frame - first.f);
    return first.v;
  }
  if (frame >= last.f) {
    if (extrapolation === 'LINEAR' && keys.length > 1) { const p = keys.at(-2); return last.v + ((last.v - p.v) / (last.f - p.f)) * (frame - last.f); }
    return last.v;
  }
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].f <= frame) lo = mid; else hi = mid;
  }
  const [a, b] = [keys[lo], keys[hi]];
  const span = b.f - a.f;
  if (span <= 0) return b.v;
  const interp = a.interp ?? 'BEZIER';
  const t = (frame - a.f) / span;
  if (interp === 'CONSTANT') return a.v;
  if (interp === 'LINEAR') return a.v + (b.v - a.v) * t;
  if (interp === 'BEZIER') {
    const h1 = a.hr ?? [a.f + span / 3, a.v];
    const h2 = b.hl ?? [b.f - span / 3, b.v];
    const s = solveBezierX(a.f, h1[0], h2[0], b.f, frame);
    const m = 1 - s;
    return m * m * m * a.v + 3 * m * m * s * h1[1] + 3 * m * s * s * h2[1] + s * s * s * b.v;
  }
  return a.v + (b.v - a.v) * ease(interp, a.easing ?? 'IN', t);
}

// ─────────────── F-curve modifiers

const noise1 = (x, seed) => {
  // Smooth value noise, the same everywhere for the same place.
  const hash = (i) => { const v = Math.sin((i + seed * 57.13) * 127.1) * 43758.5453; return v - Math.floor(v); };
  const i = Math.floor(x);
  const t = x - i;
  const k = t * t * (3 - 2 * t);
  return hash(i) * (1 - k) + hash(i + 1) * k;
};

export const FCURVE_MODIFIERS = {
  CYCLES: { en: 'Cycles', ko: '순환', props: { before: { def: 'REPEAT', options: ['NONE', 'REPEAT', 'OFFSET', 'MIRROR'] }, after: { def: 'REPEAT', options: ['NONE', 'REPEAT', 'OFFSET', 'MIRROR'] }, countBefore: { def: 0, min: 0, step: 1 }, countAfter: { def: 0, min: 0, step: 1 } } },
  NOISE: { en: 'Noise', ko: '노이즈', props: { strength: { def: 1, step: 0.1 }, scale: { def: 1, min: 0.001, step: 0.1 }, phase: { def: 0, step: 1 }, offset: { def: 0, step: 1 }, blend: { def: 'ADD', options: ['ADD', 'REPLACE', 'MULTIPLY'] } } },
  GENERATOR: { en: 'Generator', ko: '다항식', props: { coefficients: { def: [0, 1] }, additive: { def: 0, min: 0, step: 1 } } },
  BUILTIN: { en: 'Built-In Function', ko: '내장 함수', props: { fn: { def: 'SIN', options: ['SIN', 'COS', 'TAN', 'SQRT', 'LN'] }, amplitude: { def: 1, step: 0.1 }, phaseMultiplier: { def: 1, step: 0.1 }, phaseOffset: { def: 0, step: 0.1 }, valueOffset: { def: 0, step: 0.1 }, additive: { def: 0, min: 0, step: 1 } } },
  STEPPED: { en: 'Stepped', ko: '계단', props: { step: { def: 2, min: 0.01, step: 1 }, offset: { def: 0, step: 1 } } },
  LIMITS: { en: 'Limits', ko: '제한', props: { minValue: { def: -1, step: 0.1 }, maxValue: { def: 1, step: 0.1 } } },
};
export const defaultFModifier = (type) => {
  const out = { type };
  for (const [name, def] of Object.entries(FCURVE_MODIFIERS[type].props)) out[name] = Array.isArray(def.def) ? [...def.def] : def.def;
  return out;
};

/** Cycles maps time into the keyed range; `shift` is what Offset adds per cycle. */
function cycleTime(keys, frame, m) {
  const [first, last] = [keys[0].f, keys.at(-1).f];
  const span = last - first;
  if (span <= 0) return { frame, shift: 0 };
  const before = frame < first;
  if (!before && frame <= last) return { frame, shift: 0 };
  const mode = before ? m.before ?? 'REPEAT' : m.after ?? 'REPEAT';
  if (mode === 'NONE') return { frame, shift: 0 };
  const limit = (before ? m.countBefore : m.countAfter) ?? 0;
  const raw = before ? (first - frame) / span : (frame - last) / span;
  let cycles = Math.ceil(raw);
  if (limit > 0 && cycles > limit) {
    // Past the last allowed cycle it holds.
    cycles = limit;
    frame = before ? first - limit * span : last + limit * span;
  }
  const dir = before ? -1 : 1;
  const local = frame - dir * cycles * span;
  if (mode === 'MIRROR' && cycles % 2 === 1) {
    return { frame: first + last - local, shift: 0 };
  }
  return { frame: local, shift: mode === 'OFFSET' ? dir * cycles * (keys.at(-1).v - keys[0].v) : 0 };
}

/** The value of a curve at a frame with its extrapolation and modifiers, in order: time first, then value. */
export function evalFCurve(anim, path, frame) {
  const keys = anim.fcurves?.[path];
  if (!keys?.length) return 0;
  const mods = (anim.modifiers?.[path] ?? []).filter((m) => !m.mute);
  let time = frame;
  let shift = 0;
  for (const m of mods) {
    if (m.type === 'STEPPED') { const step = m.step || 1; time = Math.floor((time - (m.offset ?? 0)) / step) * step + (m.offset ?? 0); }
    if (m.type === 'CYCLES') { const c = cycleTime(keys, time, m); time = c.frame; shift += c.shift; }
  }
  let value = evalCurve(keys, time, anim.extrapolation?.[path]) + shift;
  for (const m of mods) {
    if (m.type === 'NOISE') {
      const n = (noise1((frame + (m.offset ?? 0)) / (m.scale || 1), m.phase ?? 0) - 0.5) * 2 * (m.strength ?? 1);
      if (m.blend === 'REPLACE') value = n; else if (m.blend === 'MULTIPLY') value *= n; else value += n;
    } else if (m.type === 'GENERATOR') {
      let g = 0;
      (m.coefficients ?? []).forEach((c, i) => { g += c * frame ** i; });
      value = m.additive ? value + g : g;
    } else if (m.type === 'BUILTIN') {
      const x = (m.phaseMultiplier ?? 1) * frame + (m.phaseOffset ?? 0);
      const f = { SIN: Math.sin, COS: Math.cos, TAN: Math.tan, SQRT: (v) => Math.sqrt(Math.max(0, v)), LN: (v) => (v > 0 ? Math.log(v) : 0) }[m.fn ?? 'SIN'] ?? Math.sin;
      const g = (m.amplitude ?? 1) * f(x) + (m.valueOffset ?? 0);
      value = m.additive ? value + g : g;
    } else if (m.type === 'LIMITS') {
      value = Math.max(m.minValue ?? -Infinity, Math.min(m.maxValue ?? Infinity, value));
    }
  }
  return value;
}

// ─────────────── keys: selection, handles, moving

/** Moves one handle by hand: it stops being automatic, cannot cross its neighbour key, and an Aligned one keeps its partner in line. */
export function moveHandle(keys, key, side, to) {
  if (!key.handleType || key.handleType === 'AUTO' || key.handleType === 'VECTOR') key.handleType = 'ALIGNED';
  const i = keys.indexOf(key);
  const [prev, next] = [keys[i - 1], keys[i + 1]];
  const f = side === 'hl' ? Math.min(key.f, Math.max(prev ? prev.f : -Infinity, to[0])) : Math.max(key.f, Math.min(next ? next.f : Infinity, to[0]));
  key[side] = [f, to[1]];
  if (key.handleType === 'ALIGNED') {
    const other = side === 'hl' ? 'hr' : 'hl';
    const [dx, dy] = [key.f - f, key.v - to[1]];
    const len = Math.hypot(dx, dy) || 1;
    const keep = Math.hypot(key[other][0] - key.f, key[other][1] - key.v);
    key[other] = [key.f + (dx / len) * keep, key.v + (dy / len) * keep];
  }
}

export function setHandleType(keys, type) {
  for (const k of keys) if (k.sel) k.handleType = type;
  autoHandles(keys);
  // Newly Aligned handles are put in line now rather than at the next drag.
  for (const k of keys) {
    if (!k.sel || type !== 'ALIGNED' || !k.hl || !k.hr) continue;
    const [dx, dy] = [k.hr[0] - k.hl[0], k.hr[1] - k.hl[1]];
    const len = Math.hypot(dx, dy) || 1;
    const [l, r] = [Math.hypot(k.hl[0] - k.f, k.hl[1] - k.v), Math.hypot(k.hr[0] - k.f, k.hr[1] - k.v)];
    k.hl = [k.f - (dx / len) * l, k.v - (dy / len) * l];
    k.hr = [k.f + (dx / len) * r, k.v + (dy / len) * r];
  }
}

export function selectInBox(keys, { f0, f1, v0 = -Infinity, v1 = Infinity }) {
  for (const k of keys) if (k.f >= f0 && k.f <= f1 && k.v >= v0 && k.v <= v1) k.sel = true;
}

const curvesOf = (target) => Object.values(target.anim?.fcurves ?? {});
export const hasSelectedKeys = (target) => curvesOf(target).some((keys) => keys.some((k) => k.sel));

export function moveSelectedKeys(target, offset) {
  for (const keys of curvesOf(target)) {
    for (const k of keys) {
      if (!k.sel) continue;
      k.f += offset;
      if (k.hl) k.hl[0] += offset;
      if (k.hr) k.hr[0] += offset;
    }
    keys.sort((a, b) => a.f - b.f);
    autoHandles(keys);
  }
}

export function deleteSelectedKeys(target) {
  let n = 0;
  for (const [path, keys] of Object.entries(target.anim?.fcurves ?? {})) {
    const kept = keys.filter((k) => !k.sel);
    n += keys.length - kept.length;
    if (kept.length) { target.anim.fcurves[path] = kept; autoHandles(kept); } else delete target.anim.fcurves[path];
  }
  return n;
}

/** Copies of the selected keys, `offset` frames later; the copies end up selected, as they are what comes next. */
export function duplicateSelectedKeys(target, offset) {
  for (const keys of curvesOf(target)) {
    const copies = keys.filter((k) => k.sel).map((k) => ({ ...k, f: k.f + offset, hl: k.hl && [k.hl[0] + offset, k.hl[1]], hr: k.hr && [k.hr[0] + offset, k.hr[1]] }));
    for (const k of keys) delete k.sel;
    for (const c of copies) {
      const at = keys.findIndex((k) => k.f === c.f);
      if (at >= 0) keys[at] = c; else keys.push(c);
    }
    keys.sort((a, b) => a.f - b.f);
    autoHandles(keys);
  }
}

const AXES = { location: 'XYZ', rotation: 'XYZ', scale: 'XYZ' };
const CAPITAL = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** A curve's property group: 'location.2' is in Location. */
export const pathGroupName = (path) => {
  const parts = path.split('.');
  const last = parts.at(-1);
  const base = /^\d+$/.test(last) ? parts.slice(0, -1) : parts;
  return base.map((p) => (/^\d+$/.test(p) ? p : CAPITAL(p))).join(' ');
};
/** A curve's name in a list: 'location.2' is Z Location. */
export const pathLabel = (path) => {
  const parts = path.split('.');
  if (parts.length === 2 && AXES[parts[0]] && /^[012]$/.test(parts[1])) return `${AXES[parts[0]][Number(parts[1])]} ${CAPITAL(parts[0])}`;
  return path;
};

export function getPath(target, path) {
  let node = target;
  for (const part of path.split('.')) {
    if (node == null) return undefined;
    node = node[part];
  }
  return node;
}

export function setPath(target, path, value) {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node[parts[i]] == null) return false;
    node = node[parts[i]];
  }
  node[parts.at(-1)] = value;
  return true;
}

/** Inserts or replaces the key at a frame, keeping the curve sorted and its handles up to date. */
export function insertKey(target, path, frame, value = getPath(target, path), interp = 'BEZIER') {
  target.anim ??= { fcurves: {}, nla: [] };
  const keys = (target.anim.fcurves[path] ??= []);
  const existing = keys.find((k) => k.f === frame);
  if (existing) existing.v = value;
  else keys.push({ f: frame, v: value, interp });
  keys.sort((p, q) => p.f - q.f);
  autoHandles(keys);
  return keys;
}

export function deleteKey(target, path, frame) {
  const keys = target.anim?.fcurves?.[path];
  if (!keys) return false;
  const i = keys.findIndex((k) => k.f === frame);
  if (i < 0) return false;
  keys.splice(i, 1);
  if (!keys.length) delete target.anim.fcurves[path];
  else autoHandles(keys);
  return true;
}

/** The frames a strip's action covers. */
export function stripActionRange(strip) {
  const frames = Object.values(strip.action ?? {}).flat().map((k) => k.f);
  return frames.length ? [Math.min(...frames), Math.max(...frames)] : [0, 0];
}

/** A strip's length follows its action, scale and repeats. */
export function syncStripEnd(strip) {
  if (strip.type === 'TRANSITION') return strip;
  const [from, to] = stripActionRange(strip);
  strip.end = strip.start + (to - from) * (strip.scale || 1) * (strip.repeat || 1);
  return strip;
}

/** Scene time to the strip's own action time: scale, repeats, reversal. */
function stripTime(strip, frame) {
  const scale = strip.scale || 1;
  const [from, to] = stripActionRange(strip);
  const start = strip.actionStart ?? from;
  const len = to - start;
  let t = (frame - strip.start) / scale;
  if ((strip.repeat ?? 1) > 1 && len > 0) {
    // The very end of the last repeat is the end of the action, not its start again.
    const clamped = Math.min(t, len * strip.repeat);
    t = clamped >= len * strip.repeat ? len : clamped % len;
  }
  return strip.reverse ? to - t : start + t;
}

const stripValue = (strip, path, frame) => evalCurve(strip.action?.[path], stripTime(strip, frame));

/** How much a strip counts at a frame: its influence, faded by its blend in and out. */
function stripWeight(strip, frame) {
  let w = strip.influence ?? 1;
  if (strip.blendIn > 0 && frame < strip.start + strip.blendIn) w *= Math.max(0, (frame - strip.start) / strip.blendIn);
  if (strip.blendOut > 0 && frame > strip.end - strip.blendOut) w *= Math.max(0, (strip.end - frame) / strip.blendOut);
  return w;
}

/** Applies NLA strips (each maps scene time into its own stored action), then the curves, to the target. */
export function applyAnimation(target, frame) {
  const anim = target.anim;
  if (!anim) return;
  const strips = anim.nla ?? [];
  strips.forEach((strip, index) => {
    if (strip.mute) return;
    if (strip.type === 'TRANSITION') {
      if (frame < strip.start || frame > strip.end) return;
      // Between the strips on either side: from where one ends to where the other begins.
      const before = strips.slice(0, index).reverse().find((x) => x.type !== 'TRANSITION');
      const after = strips.slice(index + 1).find((x) => x.type !== 'TRANSITION');
      if (!before || !after) return;
      const k = strip.end > strip.start ? (frame - strip.start) / (strip.end - strip.start) : 1;
      for (const path of new Set([...Object.keys(before.action ?? {}), ...Object.keys(after.action ?? {})])) {
        const a = before.action?.[path] ? stripValue(before, path, before.end) : getPath(target, path);
        const c = after.action?.[path] ? stripValue(after, path, after.start) : getPath(target, path);
        if (typeof a === 'number' && typeof c === 'number') setPath(target, path, a + (c - a) * k);
      }
      return;
    }
    const hold = strip.extrapolate ?? 'NOTHING';
    let at = frame;
    if (frame < strip.start) { if (hold !== 'HOLD') return; at = strip.start; }
    if (frame > strip.end) { if (hold === 'NOTHING') return; at = strip.end; }
    const weight = hold !== 'NOTHING' && at !== frame ? strip.influence ?? 1 : stripWeight(strip, at);
    for (const path of Object.keys(strip.action ?? {})) {
      const value = stripValue(strip, path, at);
      const base = getPath(target, path);
      if (typeof base !== 'number') continue;
      if (strip.blend === 'ADD') setPath(target, path, base + value * weight);
      else setPath(target, path, base + (value - base) * weight);
    }
  });
  for (const path of Object.keys(anim.fcurves ?? {})) setPath(target, path, evalFCurve(anim, path, frame));
}

/** A transition strip in the gap after strip `index`, up to the next one. */
export function addTransition(target, index) {
  const strips = target.anim?.nla ?? [];
  const before = strips[index];
  const after = strips.slice(index + 1).find((x) => x.type !== 'TRANSITION');
  if (!before || before.type === 'TRANSITION' || !after || after.start <= before.end) return null;
  const strip = { type: 'TRANSITION', name: 'Transition', start: before.end, end: after.start, mute: false };
  strips.splice(index + 1, 0, strip);
  return strip;
}

/** Splits a strip at a scene frame into two that play the same together. */
export function splitStrip(target, index, frame) {
  const strips = target.anim?.nla ?? [];
  const strip = strips[index];
  if (!strip || strip.type === 'TRANSITION' || frame <= strip.start || frame >= strip.end || (strip.repeat ?? 1) > 1) return null;
  const local = stripTime(strip, frame);
  const pick = (test) => Object.fromEntries(Object.entries(strip.action).map(([path, keys]) => {
    const kept = keys.filter(test).map((k) => ({ ...k }));
    // Each part keeps a key at the cut, so that it ends and begins on the right value.
    const atCut = { f: local, v: evalCurve(keys, local), interp: 'LINEAR' };
    return [path, autoHandles([...kept, atCut].sort((p, q) => p.f - q.f))];
  }));
  const second = { ...strip, name: `${strip.name}.001`, action: pick((k) => k.f > local), start: frame, actionStart: local };
  strip.action = pick((k) => k.f < local);
  strip.end = frame;
  strip.blendOut = 0;
  second.blendIn = 0;
  strips.splice(index + 1, 0, second);
  return second;
}

/** Moves the current action into an NLA strip, leaving the curves empty. */
export function pushDownAction(target, name = 'Action') {
  const curves = target.anim?.fcurves;
  if (!curves || !Object.keys(curves).length) return null;
  const frames = Object.values(curves).flat().map((k) => k.f);
  const [start, end] = [Math.min(...frames), Math.max(...frames)];
  const strip = { name, action: curves, start, end, actionStart: start, scale: 1, influence: 1, blend: 'REPLACE', mute: false };
  (target.anim.nla ??= []).push(strip);
  target.anim.fcurves = {};
  return strip;
}

/** Evaluates a driver expression with variables; a syntax error reads as no change. */
const DRIVER_MATH = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'abs', 'sqrt', 'min', 'max', 'floor', 'ceil', 'round', 'pow', 'PI', 'exp', 'log', 'sign']);
/** A driver's expression is arithmetic only: a project file must not be able to run code through one. */
export function driverExpressionIsSafe(expression, names) {
  if (typeof expression !== 'string' || /[^\w\s.+\-*/%(),?:<>=!&|]/.test(expression)) return false;
  // No property access: a dot belongs to a number.
  if (/[A-Za-z_]\w*\s*\.|\)\s*\./.test(expression)) return false;
  for (const word of expression.match(/\b[A-Za-z_]\w*\b/g) ?? []) {
    if (/^\d/.test(word)) continue;
    if (!DRIVER_MATH.has(word) && !names.includes(word)) return false;
  }
  return true;
}

export function evalDriver(expression, variables) {
  const names = Object.keys(variables);
  if (!driverExpressionIsSafe(expression, names)) return null;
  const math = 'const {sin,cos,tan,asin,acos,atan,atan2,abs,sqrt,min,max,floor,ceil,round,pow,PI,exp,log,sign}=Math;';
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `${math} return (${expression});`);
    const value = fn(...names.map((n) => variables[n]));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** All key frames on a target (dope sheet). */
export function keyFrames(target) {
  const set = new Set();
  for (const keys of Object.values(target.anim?.fcurves ?? {})) for (const k of keys) set.add(k.f);
  return [...set].sort((a, b) => a - b);
}

// ─────────────── the action library: named actions a document keeps, to assign, lay into the NLA or read through an Action constraint

const copyCurves = (curves) => JSON.parse(JSON.stringify(curves ?? {}));

/** Stores a target's current curves as a new action in the document. `bones`: an armature's bone names, so that the action finds them by name. */
export function storeAction(doc, target, name = 'Action', bones = null) {
  doc.actions ??= [];
  const taken = new Set(doc.actions.map((a) => a.name));
  let unique = name;
  for (let i = 1; taken.has(unique); i++) unique = `${name}.${String(i).padStart(3, '0')}`;
  const action = { id: `act${Date.now().toString(36)}${doc.actions.length}`, name: unique, fcurves: copyCurves(target.anim?.fcurves), bones: bones ? [...bones] : null };
  doc.actions.push(action);
  return action;
}

/** The frames an action's keys span. */
export function actionRange(action) {
  const frames = Object.values(action?.fcurves ?? {}).flat().map((k) => k.f);
  return frames.length ? [Math.min(...frames), Math.max(...frames)] : [1, 1];
}

/** Makes an action the target's own curves (a copy: the library keeps its version). An armature's bones are matched by name. */
export function assignAction(target, action, bones = null) {
  target.anim ??= { fcurves: {}, nla: [] };
  target.anim.fcurves = remapBones(copyCurves(action.fcurves), action.bones, bones);
}

/** An NLA strip playing a library action from `start`. `prefix` ('data.') lets an armature object's strip move its bones. */
export function addActionStrip(target, action, start, bones = null, prefix = '') {
  const [from, to] = actionRange(action);
  const curves = remapBones(copyCurves(action.fcurves), action.bones, bones);
  const strip = { name: action.name, action: Object.fromEntries(Object.entries(curves).map(([path, keys]) => [`${prefix}${path}`, keys])), start, end: start + (to - from), actionStart: from, scale: 1, influence: 1, blend: 'REPLACE', mute: false, source: action.id };
  target.anim ??= { fcurves: {}, nla: [] };
  (target.anim.nla ??= []).push(strip);
  return strip;
}

/** Paths 'bones.N.…' renumbered from one list of bone names to another; curves for bones the other list lacks are dropped. */
function remapBones(curves, from, to) {
  if (!from || !to) return curves;
  const out = {};
  for (const [path, keys] of Object.entries(curves)) {
    const m = /^bones\.(\d+)\.(.*)$/.exec(path);
    if (!m) { out[path] = keys; continue; }
    const index = to.indexOf(from[Number(m[1])]);
    if (index >= 0) out[`bones.${index}.${m[2]}`] = keys;
  }
  return out;
}

/** One bone's pose from an action at a frame, or null when the action does not move it. Channels it lacks stay at rest. */
export function actionBonePose(action, boneName, boneIndex, frame) {
  const index = action.bones ? action.bones.indexOf(boneName) : boneIndex;
  if (index < 0) return null;
  const pose = { location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  let found = false;
  for (const name of ['location', 'rotation', 'scale']) for (let k = 0; k < 3; k++) {
    const path = `bones.${index}.pose.${name}.${k}`;
    if (!action.fcurves?.[path]?.length) continue;
    pose[name][k] = evalFCurve(action, path, frame);
    found = true;
  }
  return found ? pose : null;
}
