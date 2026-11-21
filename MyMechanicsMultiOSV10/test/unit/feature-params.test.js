// Every feature type and every one of its settings has an effect on the geometry.
//
// The types come from the app's own registry (FEATURE_TYPES, with the defaults in FEATURE_DEFAULTS), so a
// type added later is covered at once: it must build with its defaults on a base part and change the
// result. Every numeric and on/off setting of every type is then changed one at a time and the model must
// change — in the expected direction where it is obvious (deeper extrude → more volume, bigger fillet →
// less volume, more pattern instances → more volume). A setting that rightly changes nothing in a given
// setup is listed in the fixture with `skip` and the reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, FEATURE_TYPES, FEATURE_DEFAULTS } from '../../src/cad/features.js';
import { addRectangle } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';
import { FIXTURES, fixtureOf, specOf, newPart, sketchOn, top } from '../fixtures/feature-fixtures.js';

await loadKernel();
const R = rep();
const built = (part) => regenerate(part).body;

// ───────────────────────── what the model looks like (a signature) and single measures of it

const round = (v) => Math.round(v * 1e4) / 1e4;
function shapeStats(s) {
  const out = {};
  try { const [lo, hi] = s.boundingBox.bounds; out.bb = [...lo, ...hi].map(round); } catch { /* no box */ }
  try { const p = R.measureShapeVolumeProperties(s); out.V = round(p.volume); out.com = p.centerOfMass.map(round); p.delete?.(); } catch { /* not a solid */ }
  try { out.A = round(R.measureArea(s)); } catch { /* no faces */ }
  // Face count and the sum of face centres: a form moved on a sheet keeps volume, area and box.
  try { const fs = s.faces; out.nf = fs.length; out.fc = fs.reduce((acc, f) => { const c = f.center; return [acc[0] + c.x, acc[1] + c.y, acc[2] + c.z]; }, [0, 0, 0]).map(round); } catch { /* no faces */ }
  try { out.L = round(R.measureLength(s)); } catch { /* no edges */ }
  // Ends and a point along it (a left-hand helix of whole turns has the same ends as a right-hand one).
  try { out.ends = [...s.startPoint.toTuple(), ...s.endPoint.toTuple(), ...s.pointAt(0.13).toTuple()].map(round); } catch { /* not a curve */ }
  return out;
}
function signature(r, f) {
  const res = r.results.get(f.id) ?? {};
  const sig = { ok: res.ok };
  if (r.body) sig.body = shapeStats(r.body);
  if (res.surface) sig.surface = shapeStats(res.surface);
  if (res.curve) sig.curve = shapeStats(res.curve);
  if (res.frame) sig.frame = [...res.frame.origin, ...res.frame.normal].map(round);
  // Everything else the feature reports as plain data (members, parting line, axis, point, copies …).
  const SHAPES = new Set(['ok', 'body', 'tool', 'surface', 'curve', 'frame']);
  const extra = Object.fromEntries(Object.entries(res).filter(([k]) => !SHAPES.has(k)));
  sig.extra = JSON.stringify(extra, (k, v) => (v && typeof v === 'object' && 'wrapped' in v ? undefined : typeof v === 'number' ? round(v) : v));
  return sig;
}
const bbSize = (bb, i) => (bb ? bb[i + 3] - bb[i] : NaN);
/** Single measures for the direction checks. */
const METRICS = {
  V: (s) => s.body?.V, // body volume
  BA: (s) => s.body?.A, // body area
  BX: (s) => bbSize(s.body?.bb, 0), BY: (s) => bbSize(s.body?.bb, 1), BZ: (s) => bbSize(s.body?.bb, 2), // body box sizes
  CX: (s) => s.body?.com?.[0], CY: (s) => s.body?.com?.[1], CZ: (s) => s.body?.com?.[2], // body centre of mass
  SA: (s) => s.surface?.A, // surface area
  L: (s) => s.curve?.L, // curve length
  PY: (s) => s.frame?.[1], // plane origin y
};

function regen(fx, part, { __flat, ...over }, project) {
  if (__flat) part.flat = true;
  const f = fx.make(part, over);
  part.features.push(f);
  const r = regenerate(part, project ? { project } : {});
  return { f, r, sig: signature(r, f) };
}
const projectOf = (fx) => (fx.project ? fx.project() : null);
const cache = new Map();
function build(type, fx, over = {}) {
  const key = `${type} ${JSON.stringify(over)}`;
  if (!cache.has(key)) cache.set(key, buildNow(type, fx, over));
  return cache.get(key);
}
function buildNow(type, fx, over) {
  const part = newPart();
  const project = projectOf(fx);
  if (project) project.parts.push(part);
  const out = regen(fx, part, over, project);
  const res = out.r.results.get(out.f.id);
  return { ...out, res };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);


// ───────────────────────── the tests

test('every feature type has a fixture here (or builds on the generic base)', () => {
  const missing = FEATURE_TYPES.filter((t) => !FIXTURES[t]);
  // Not a failure by itself — the generic base is tried below — but listed so a new type gets a real fixture.
  if (missing.length) console.log(`  feature types without a fixture (generic base used): ${missing.join(', ')}`);
  assert.ok(FEATURE_TYPES.length >= 40, `only ${FEATURE_TYPES.length} feature types registered`);
});

for (const type of FEATURE_TYPES) {
  const fx = fixtureOf(type);
  test(`${type}: builds with its defaults and changes the model`, () => {
    const part = newPart();
    const project = projectOf(fx);
    if (project) project.parts.push(part);
    const f = fx.make(part, {});
    const before = signature(regenerate(part, project ? { project } : {}), f);
    part.features.push(f);
    const r = regenerate(part, project ? { project } : {});
    const res = r.results.get(f.id);
    assert.ok(res?.ok, `${type}${fx.generic ? ' (no fixture: generic base)' : ''} failed: ${res?.error} ${res?.detail ?? ''}`);
    const after = signature(r, f);
    assert.ok(!same(before, after), `${type} built but changed nothing: ${JSON.stringify(after)}`);
  });

  const defaults = FEATURE_DEFAULTS[type]();
  const numKeys = new Set([...Object.keys(defaults).filter((k) => typeof defaults[k] === 'number'), ...Object.keys(fx.num ?? {})]);
  const boolKeys = new Set([...Object.keys(defaults).filter((k) => typeof defaults[k] === 'boolean'), ...Object.keys(fx.bool ?? {})]);
  const settings = [...[...numKeys].map((k) => ['num', k]), ...[...boolKeys].map((k) => ['bool', k])];
  if (settings.length || fx.opt) {
    test(`${type}: every setting changes the model (${settings.map(([, k]) => k).concat(Object.keys(fx.opt ?? {})).join(', ')})`, (t) => {
      for (const [kind, key] of settings) {
        const spec = specOf((kind === 'num' ? fx.num : fx.bool)?.[key]);
        if (spec.skip) { t.diagnostic(`${key}: skipped — ${spec.skip}`); continue; }
        const base = { ...(spec.with ?? {}) };
        if (spec.from !== undefined) base[key] = spec.from;
        const a = build(type, fx, base);
        assert.ok(a.res?.ok, `${type}.${key}: base build failed (${JSON.stringify(base)}): ${a.res?.error} ${a.res?.detail ?? ''}`);
        // The value the fixture really builds with (its make() may set its own).
        const value = a.f[key] ?? base[key] ?? defaults[key];
        let to = spec.to;
        if (to === undefined) to = kind === 'bool' ? !value : value ? value * 1.3 : 5;
        const b = build(type, fx, { ...base, [key]: to });
        assert.ok(b.res?.ok, `${type}.${key} = ${to}: build failed: ${b.res?.error} ${b.res?.detail ?? ''}`);
        const was = a.f[key] ?? value;
        assert.ok(!same(a.sig, b.sig), `${type}.${key}: ${was} → ${to} changed nothing (the setting is not applied)`);
        if (spec.m && spec.dir && spec.dir !== '~') {
          const m0 = METRICS[spec.m](a.sig); const m1 = METRICS[spec.m](b.sig);
          assert.ok(Number.isFinite(m0) && Number.isFinite(m1), `${type}.${key}: metric ${spec.m} not measurable (${m0}, ${m1})`);
          const eps = 1e-6 * Math.max(1, Math.abs(m0));
          if (spec.dir === '+') assert.ok(m1 > m0 + eps, `${type}.${key}: ${was} → ${to} should increase ${spec.m}: ${m0} → ${m1}`);
          else assert.ok(m1 < m0 - eps, `${type}.${key}: ${was} → ${to} should decrease ${spec.m}: ${m0} → ${m1}`);
        }
      }
      for (const [key, raw] of Object.entries(fx.opt ?? {})) {
        if (raw.skip) { t.diagnostic(`${key}: skipped — ${raw.skip}`); continue; }
        const { values, with: w = {} } = Array.isArray(raw) ? { values: raw } : raw;
        const a = build(type, fx, w);
        assert.ok(a.res?.ok, `${type}.${key}: base build failed: ${a.res?.error} ${a.res?.detail ?? ''}`);
        for (const v of values) {
          const b = build(type, fx, { ...w, [key]: v });
          assert.ok(b.res?.ok, `${type}.${key} = ${v}: build failed: ${b.res?.error} ${b.res?.detail ?? ''}`);
          assert.ok(!same(a.sig, b.sig), `${type}.${key}: ${a.f[key]} → ${v} changed nothing (the option is not applied)`);
        }
      }
    });
  }
}

test('sheet defaults reach the bends: base flange radius and K-factor change an edge flange and its flat pattern', () => {
  const run = (radius, kFactor, flat = false) => {
    const part = newPart();
    const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
    part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 2, radius, kFactor }));
    const edge = built(part).edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.y > 1.9 && e.endPoint.y > 1.9);
    part.features.push(createFeature(part, 'edgeFlange', { edge: edgeSignature(edge), length: 30, angle: 90 }));
    const r = regenerate({ ...part, flat });
    for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`);
    const [lo, hi] = r.body.boundingBox.bounds;
    return { V: R.measureVolume(r.body), X: hi[0] - lo[0] };
  };
  const a = run(2, 0.4); const b = run(6, 0.4);
  assert.ok(Math.abs(a.V - b.V) > 1, `bend radius 2 → 6 did not change the flanged sheet: ${a.V} vs ${b.V}`);
  const fa = run(2, 0.3, true); const fb = run(2, 0.5, true);
  assert.ok(fb.X > fa.X + 1e-3, `K-factor 0.3 → 0.5 should lengthen the flat pattern: ${fa.X} → ${fb.X}`);
});

test('sheet metal flanges take a sharp bend (radius 0, which the PropertyManager allows)', () => {
  for (const type of ['edgeFlange', 'miterFlange']) {
    const sharp = build(type, FIXTURES[type], { radius: 0 });
    assert.ok(sharp.res?.ok, `${type} radius 0: ${sharp.res?.error} ${sharp.res?.detail ?? ''}`);
    const round = build(type, FIXTURES[type], { radius: 2 });
    assert.ok(sharp.sig.body.V < round.sig.body.V, `${type}: a sharp bend has less material (${sharp.sig.body.V} vs ${round.sig.body.V})`);
  }
});
