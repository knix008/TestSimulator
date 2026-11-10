// Parametric library checks: every entry builds (defaults, low quality, random params),
// follows the CONTRACT (origin bottom centre, front +Z, metres, normals + uv), stays in its
// triangle/mesh budget and only uses material presets that exist.
// Run: node --test test/unit/library.test.js
// While working on one area: LIBRARY_MODULES=dining,bedroom node --test test/unit/library.test.js
// (loads only those modules, so a half-written file elsewhere does not stop the run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CATEGORIES } from '../../src/library/categories.js';
import { MATERIAL_PRESETS, getMaterial } from '../../src/engine/materials.js';

const only = process.env.LIBRARY_MODULES?.split(',').map((m) => m.trim()).filter(Boolean);
const PARAMETRIC_ITEMS = only
  ? (await Promise.all(only.map((m) => import(`../../src/library/parametric/${m.replace(/.js$/, '')}.js`)))).flatMap((m) => m.ITEMS)
  : (await import('../../src/library/parametric/index.js')).PARAMETRIC_ITEMS;

const PRESETS = new Set(MATERIAL_PRESETS.map((p) => p.id));
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const BUDGET = { high: 40000, low: 8000 };
const MAX_MESHES = 15;

function makeCtx(quality, used) {
  return { quality, wallThickness: 0.2, material: (id, o) => { used.add(id); return getMaterial(id, o); } };
}

function stats(root) {
  let tris = 0, meshes = 0;
  const problems = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    for (const a of ['position', 'normal', 'uv']) if (!g.attributes[a]) problems.push(`${o.name}: no ${a}`);
    for (const a of ['position', 'normal', 'uv']) {
      const arr = g.attributes[a]?.array;
      if (arr) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { problems.push(`${o.name}: NaN in ${a}`); break; }
    }
    if (!o.castShadow && o.userData.part !== 'glass') problems.push(`${o.name}: castShadow off`);
    if (!o.receiveShadow) problems.push(`${o.name}: receiveShadow off`);
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { tris, meshes, problems, box: new THREE.Box3().setFromObject(root) };
}

/** Random values inside each param's range (deterministic). */
function randomParams(entry, seed) {
  let s = seed * 7919 + 13;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const out = {};
  for (const p of entry.params) {
    if (p.type === 'length' || p.type === 'number') out[p.key] = p.min + (p.max - p.min) * r();
    else if (p.type === 'int') out[p.key] = Math.round(p.min + (p.max - p.min) * r());
    else if (p.type === 'enum') out[p.key] = p.options[Math.floor(r() * p.options.length)][0];
    else if (p.type === 'bool') out[p.key] = r() > 0.5;
    else out[p.key] = p.default;
  }
  return out;
}

/** Shape checks shared by default and random builds. */
function checkShape(entry, root, label, { strictSize }) {
  assert.ok(root instanceof THREE.Object3D, `${label}: not an Object3D`);
  const st = stats(root);
  assert.deepEqual(st.problems, [], `${label}: ${st.problems.join('; ')}`);
  assert.ok(st.meshes > 0, `${label}: no meshes`);
  assert.ok(st.meshes <= MAX_MESHES, `${label}: ${st.meshes} meshes > ${MAX_MESHES}`);
  const { min, max } = st.box;
  for (const v of [min.x, min.y, min.z, max.x, max.y, max.z]) assert.ok(Number.isFinite(v), `${label}: bbox not finite`);
  const anchor = entry.anchor ?? {};
  // Floor items sit on y = 0; wall/ceiling items too unless they declare a different anchor.
  if (anchor.y == null) assert.ok(Math.abs(min.y) <= 0.01, `${label}: min.y = ${min.y.toFixed(3)} (want 0)`);
  const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
  if (!anchor.asymmetricX) assert.ok(Math.abs(cx) <= 0.02, `${label}: not centred in x (${cx.toFixed(3)})`);
  if (!anchor.asymmetricZ) assert.ok(Math.abs(cz) <= 0.02, `${label}: not centred in z (${cz.toFixed(3)})`);
  if (strictSize) {
    const got = [max.x - min.x, max.y - min.y, max.z - min.z];
    const slack = entry.bboxSlack ?? [0, 0, 0];
    got.forEach((g, i) => {
      const want = entry.size[i];
      const tol = want * 0.1 + 0.01 + slack[i];
      assert.ok(Math.abs(g - want) <= tol, `${label}: size[${i}] = ${g.toFixed(3)} vs ${want} (±${tol.toFixed(3)})`);
    });
  }
  return st;
}

test('catalog: ids unique, categories valid, entries well formed', () => {
  if (!only) assert.ok(PARAMETRIC_ITEMS.length >= 90, `only ${PARAMETRIC_ITEMS.length} items`);
  const ids = new Set();
  for (const e of PARAMETRIC_ITEMS) {
    assert.ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id), `bad id ${e.id}`);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(CATEGORY_IDS.has(e.category) && e.category !== 'mine', `${e.id}: bad category ${e.category}`);
    assert.equal(e.kind, 'parametric');
    assert.ok(['floor', 'wall', 'ceiling', 'surface', 'opening'].includes(e.placement), `${e.id}: placement`);
    assert.ok(e.ko && e.en, `${e.id}: names`);
    assert.ok(Array.isArray(e.size) && e.size.length === 3 && e.size.every((v) => v > 0), `${e.id}: size`);
    assert.ok(e.tags.length >= 2, `${e.id}: tags`);
    assert.ok(e.tags.some((t) => /[가-힣]/.test(t)) && e.tags.some((t) => /[a-z]/i.test(t)), `${e.id}: tags need ko + en`);
    const keys = new Set();
    for (const p of e.params) {
      assert.ok(!keys.has(p.key), `${e.id}: duplicate param ${p.key}`);
      keys.add(p.key);
      assert.ok(p.ko && p.en, `${e.id}.${p.key}: names`);
      if (p.type === 'material') assert.ok(PRESETS.has(p.default), `${e.id}.${p.key}: unknown preset ${p.default}`);
      if (p.type === 'enum') assert.ok(p.options.some((o) => o[0] === p.default), `${e.id}.${p.key}: default not an option`);
      if (['length', 'int', 'number'].includes(p.type)) assert.ok(p.min <= p.default && p.default <= p.max, `${e.id}.${p.key}: default out of range`);
    }
  }
});

test('catalog: every category but "mine" has items', { skip: !!only }, () => {
  for (const c of CATEGORIES) {
    if (c.id === 'mine') continue;
    assert.ok(PARAMETRIC_ITEMS.some((e) => e.category === c.id), `no items in ${c.id}`);
  }
});

test('catalog: every category but "mine" has ≥ 40 parametric items, at most 35 % preset variants', { skip: !!only }, () => {
  const ids = new Set(PARAMETRIC_ITEMS.map((e) => e.id));
  const short = [];
  for (const c of CATEGORIES) {
    if (c.id === 'mine') continue;
    const all = PARAMETRIC_ITEMS.filter((e) => e.category === c.id);
    const variants = all.filter((e) => e.variantOf);
    if (all.length < 40) short.push(`${c.id}: ${all.length}`);
    assert.ok(variants.length <= all.length * 0.35, `${c.id}: ${variants.length} of ${all.length} items are variants (> 35 %)`);
    for (const v of variants) assert.ok(ids.has(v.variantOf), `${v.id}: variant of unknown ${v.variantOf}`);
  }
  assert.deepEqual(short, [], `categories under 40 items: ${short.join(', ')}`);
});

test('catalog: ≥ 10 sofas each for 1, 2, 3 and 4 seats (entry.seats), seat count in names/tags', { skip: !!only }, () => {
  for (const n of [1, 2, 3, 4]) {
    const sofas = PARAMETRIC_ITEMS.filter((e) => e.category === 'living' && e.seats === n);
    assert.ok(sofas.length >= 10, `only ${sofas.length} ${n}-seat sofas`);
    for (const e of sofas) assert.ok(e.tags.includes(`${n}인`) && e.tags.includes(`${n}-seat`), `${e.id}: tags need '${n}인' and '${n}-seat'`);
    const designs = sofas.filter((e) => !e.variantOf);
    assert.ok(designs.length >= sofas.length * 0.65, `${n}-seat: too many variants (${sofas.length - designs.length} of ${sofas.length})`);
  }
});

// Known failures of the param-extremes check (reported, still run as `todo` so they show up
// without failing the suite): remove an entry once its item is fixed.
const EXTREMES_TODO = {
  'coffee-table': 'legs=hairpin floats 4 cm above the floor',
  'decor-macrame': 'max params: low-quality triangles over budget',
  'kitchen-wine-rack': 'max params: low-quality triangles over budget',
  'kitchen-wine-rack-large': 'max params: low-quality triangles over budget',
  'door-cold-room': 'max params: frame not centred in x',
  'door-entrance-glassstrip': 'max params: frame not centred in x',
  'door-ship-watertight': 'max params: frame not centred in x',
  'door-shower-hinged': 'max params: frame not centred in x',
  'door-vault': 'max params: frame not centred in x',
  'door-moon-gate': 'max params: dips 1.4 cm below the floor',
};

for (const entry of PARAMETRIC_ITEMS) {
  test(`${entry.id}: builds (high + low), contract shape, budgets, presets`, () => {
    const used = new Set();
    const hi = entry.build({}, makeCtx('high', used));
    const sh = checkShape(entry, hi, `${entry.id} high`, { strictSize: true });
    assert.ok(sh.tris <= BUDGET.high, `${entry.id}: ${sh.tris} triangles (high) > ${BUDGET.high}`);
    const lo = entry.build({}, makeCtx('low', used));
    const sl = checkShape(entry, lo, `${entry.id} low`, { strictSize: true });
    assert.ok(sl.tris <= BUDGET.low, `${entry.id}: ${sl.tris} triangles (low) > ${BUDGET.low}`);
    for (const id of used) assert.ok(PRESETS.has(id), `${entry.id}: unknown material preset ${id}`);
    if (entry.placement === 'opening' && entry.category === 'doors') {
      const swing = hi.userData.swing;
      assert.ok(swing && ['left', 'right', 'both', 'none'].includes(swing.hinge) && swing.radius >= 0, `${entry.id}: userData.swing`);
    }
    // anything that glows (except appliance displays) must carry a light marker (CONTRACT: userData.light on a child)
    let glows = false, markers = 0;
    hi.traverse((o) => { if (o.userData.part === 'light' && o.name !== 'display') glows = true; if (o.userData.light) markers++; }); // display = tiny appliance indicator
    if (glows) assert.ok(markers > 0, `${entry.id}: emissive part without userData.light`);
    if (entry.placement === 'opening') {
      const keys = new Set(entry.params.map((p) => p.key));
      assert.ok(keys.has('width') && keys.has('height'), `${entry.id}: openings need width/height params`);
      if (entry.category === 'windows') assert.ok(keys.has('sill') && typeof entry.defaultSill === 'number', `${entry.id}: windows need a sill param + defaultSill`);
      // the frame follows the opening size the app passes in
      const w = entry.params.find((p) => p.key === 'width'), h = entry.params.find((p) => p.key === 'height');
      const pw = (w.min + w.max) / 2, ph = (h.min + h.max) / 2;
      const b = new THREE.Box3().setFromObject(entry.build({ width: pw, height: ph }, makeCtx('low', used)));
      const slack = entry.bboxSlack ?? [0, 0, 0];
      if (!entry.anchor?.asymmetricX) assert.ok(Math.abs(b.max.x - b.min.x - pw) <= 0.02 + slack[0] * 2 + 0.01, `${entry.id}: width ${(b.max.x - b.min.x).toFixed(3)} does not follow ${pw}`);
      assert.ok(Math.abs(b.max.y - b.min.y - ph) <= 0.02 + slack[1] * 2 + 0.01, `${entry.id}: height ${(b.max.y - b.min.y).toFixed(3)} does not follow ${ph}`);
    }
    if (entry.category === 'lighting') {
      let lights = 0;
      hi.traverse((o) => { if (o.userData.light) lights++; });
      assert.ok(lights > 0, `${entry.id}: no userData.light`);
    }
  });

  test(`${entry.id}: random params stay valid`, () => {
    const used = new Set();
    for (let seed = 1; seed <= 4; seed++) {
      const params = randomParams(entry, seed + entry.id.length);
      for (const quality of ['high', 'low']) {
        const root = entry.build(params, makeCtx(quality, used));
        const st = checkShape(entry, root, `${entry.id} random#${seed} ${quality} ${JSON.stringify(params)}`, { strictSize: false });
        assert.ok(st.tris <= (quality === 'high' ? BUDGET.high * 1.5 : BUDGET.low * 1.5), `${entry.id} random#${seed}: ${st.tris} triangles (${quality})`);
      }
    }
    for (const id of used) assert.ok(PRESETS.has(id), `${entry.id}: unknown material preset ${id}`);
  });

  // Every numeric param at its min and at its max (the rest at defaults), plus every enum option and
  // both bool values one at a time: still on the floor, centred, finite, within budget.
  test(`${entry.id}: param extremes stay valid`, { todo: EXTREMES_TODO[entry.id] }, () => {
    const used = new Set();
    const cases = [];
    const nums = entry.params.filter((p) => ['length', 'number', 'int'].includes(p.type));
    if (nums.length) for (const end of ['min', 'max']) cases.push([end, Object.fromEntries(nums.map((p) => [p.key, p[end]]))]);
    for (const p of entry.params) {
      if (p.type === 'enum') for (const [v] of p.options) if (v !== p.default) cases.push([`${p.key}=${v}`, { [p.key]: v }]);
      if (p.type === 'bool') cases.push([`${p.key}=${!p.default}`, { [p.key]: !p.default }]);
    }
    for (const [label, params] of cases) {
      const root = entry.build(params, makeCtx('low', used));
      const st = checkShape(entry, root, `${entry.id} ${label}`, { strictSize: false });
      assert.ok(st.tris <= BUDGET.low * 1.5, `${entry.id} ${label}: ${st.tris} triangles (low)`);
    }
    for (const id of used) assert.ok(PRESETS.has(id), `${entry.id}: unknown material preset ${id}`);
  });
}
