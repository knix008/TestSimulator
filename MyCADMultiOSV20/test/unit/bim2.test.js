// BIM additions: steel sections and presets, turning stairs, railing infill,
// radial axes, pipe elbows / cables / ducts, custom rebar, panel nesting.
import assert from 'node:assert/strict';
import test from 'node:test';
import { archFrom, archPlan, filletPath, rebarBars, sectionOf, sectionOutline, STEEL_PRESET_NAMES } from '../../src/domain/arch.js';
import { createEntity } from '../../src/domain/entities.js';
import { polygonArea } from '../../src/domain/geometry.js';
import { checkSolid } from '../../src/domain/meshcheck.js';
import { nestPanels } from '../../src/domain/nesting.js';
import { meshVolume, solidMesh } from '../../src/domain/solids.js';

const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-9, `${a} ≠ ${b}`);
const solid = (data) => createEntity('solid', data);
const valid = (e) => assert.deepEqual(checkSolid(e).issues, [], `${e.kind} closed`);
const sectionArea = (sec) => { const { outer, holes } = sectionOutline(sec); return Math.abs(polygonArea(outer)) - holes.reduce((s, h) => s + Math.abs(polygonArea(h)), 0); };

test('steel sections: areas of the shapes and the presets', () => {
  near(sectionArea({ shape: 'hsection', w: 150, d: 300, tw: 7.1, tf: 10.7 }), 2 * 150 * 10.7 + (300 - 21.4) * 7.1);
  near(sectionArea({ shape: 'channel', w: 75, d: 200, tw: 8.5, tf: 11.5 }), 2 * 75 * 11.5 + (200 - 23) * 8.5);
  near(sectionArea({ shape: 'angle', w: 100, d: 100, tw: 10, tf: 10 }), 100 * 10 + 90 * 10);
  near(sectionArea({ shape: 'tee', w: 100, d: 100, tw: 11, tf: 11 }), 100 * 11 + 89 * 11);
  near(sectionArea({ shape: 'rhs', w: 100, d: 200, tw: 8, tf: 8 }), 100 * 200 - 84 * 184);
  assert.ok(STEEL_PRESET_NAMES.includes('IPE300') && STEEL_PRESET_NAMES[0] === 'customSize');
  const ipe = sectionOf({ preset: STEEL_PRESET_NAMES.indexOf('IPE300') });
  assert.deepEqual([ipe.shape, ipe.w, ipe.d], ['hsection', 150, 300]);
  // A column and a beam of that preset: section × length.
  const column = solid({ kind: 'column', params: { height: 1000, preset: STEEL_PRESET_NAMES.indexOf('IPE300') } });
  near(meshVolume(solidMesh(column)), 1000 * sectionArea(ipe), 1e-9);
  const beam = solid({ kind: 'beam', params: { preset: STEEL_PRESET_NAMES.indexOf('HEA200') }, shape: { path: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }] } });
  valid(beam);
  // An older H column (no web / flange given) keeps its proportions.
  const old = solid({ kind: 'column', params: { width: 300, depth: 300, height: 1000, profile: 2 } });
  near(meshVolume(solidMesh(old)), 1000 * sectionArea({ shape: 'hsection', w: 300, d: 300, tw: 13.5, tf: 21 }), 1e-9);
});

test('stairs: straight, L, U and spiral are closed; turning stairs keep the rise', () => {
  for (let type = 0; type < 4; type++) {
    const e = solid({ kind: 'stairs', params: { stairType: type, height: 2800, steps: 16 } });
    valid(e);
    const zs = solidMesh(e).flat().map((p) => p[2]);
    near(Math.max(...zs), 2800, 1e-9);
    assert.ok(archPlan(e).length > 5, 'a plan');
  }
});

test('railing infill: balusters at most 120 apart, glass panels', () => {
  const path = [{ x: 0, y: 0 }, { x: 2400, y: 0 }];
  const rails = solid({ kind: 'railing', params: { infill: 0, spacing: 1200 }, shape: { path } });
  const balusters = solid({ kind: 'railing', params: { infill: 1, spacing: 1200 }, shape: { path } });
  const glass = solid({ kind: 'railing', params: { infill: 2, spacing: 1200 }, shape: { path } });
  for (const e of [rails, balusters, glass]) valid(e);
  assert.ok(meshVolume(solidMesh(balusters)) > meshVolume(solidMesh(rails)));
  assert.ok(meshVolume(solidMesh(glass)) > meshVolume(solidMesh(rails)));
});

test('radial axes: numbered radial lines and lettered rings', () => {
  const plan = archPlan(solid({ kind: 'axis', params: { axisType: 1, countX: 5, angleStep: 45, countY: 2, spacingY: 3000 } }));
  const texts = plan.filter((p) => p.kind === 'text').map((p) => p.text);
  assert.deepEqual(texts, ['1', '2', '3', '4', '5', 'A', 'B']);
});

test('pipes: elbows round the corners, cables are solid, ducts are rectangular', () => {
  const bent = filletPath([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], 200);
  // The corner is replaced by a quarter circle of radius 200 about (800, 200).
  for (const q of bent.slice(1, -1)) near(Math.hypot(q.x - 800, q.y - 200), 200, 1e-9);
  const path = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }];
  for (let service = 0; service < 3; service++) valid(solid({ kind: 'pipe', params: { diameter: 100, wall: 5, bend: 300, service }, shape: { path } }));
  const cable = solid({ kind: 'pipe', params: { diameter: 20, service: 1 }, shape: { path: [{ x: 0, y: 0 }, { x: 1000, y: 0 }] } });
  near(meshVolume(solidMesh(cable)), Math.PI * 100 * 1000, 0.03);
  const duct = solid({ kind: 'pipe', params: { diameter: 400, wall: 0, service: 2 }, shape: { path: [{ x: 0, y: 0 }, { x: 1000, y: 0 }] } });
  near(meshVolume(solidMesh(duct)), 400 * 240 * 1000, 1e-9);
});

test('custom rebar: bars along a drawn polyline, spaced across it', () => {
  const [raw] = archFrom('rebar', { paths: [{ points: [{ x: 100, y: 100 }, { x: 1100, y: 100 }, { x: 1100, y: 600 }], closed: false }] }, { diameter: 12, bars: 3, spacing: 100, cover: 30 });
  const e = solid(raw);
  const bars = rebarBars(e);
  assert.equal(bars.length, 3);
  // Middle bar ~ the drawn length less the bend: 1000 + 500 − (2 − π/2)·36.
  near(bars[1].length, 1500 - (2 - Math.PI / 2) * 36, 1e-3);
  valid(e);
});

test('nesting: parts on sheets without overlap, turned to fit, too-big ones left', () => {
  const rect = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const items = [...Array(6)].map((_, i) => ({ id: `p${i}`, name: `P${i}`, outer: rect(1000, 500) })).concat([{ id: 'tall', name: 'T', outer: rect(300, 2000) }, { id: 'huge', name: 'H', outer: rect(5000, 5000) }]);
  const { sheets, left } = nestPanels(items, { width: 2440, height: 1220, gap: 10 });
  assert.deepEqual(left.map((p) => p.id), ['huge']);
  const placed = sheets.flatMap((s) => s.parts);
  assert.equal(placed.length, 7);
  assert.ok(placed.find((p) => p.id === 'tall').turned, 'the tall part is turned to fit');
  for (const s of sheets) {
    const boxes = s.parts.map((p) => { const xs = p.outer.map((q) => q.x); const ys = p.outer.map((q) => q.y); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
    for (const [x0, y0, x1, y1] of boxes) assert.ok(x0 >= 10 - 1e-9 && y0 >= 10 - 1e-9 && x1 <= 2430 + 1e-9 && y1 <= 1210 + 1e-9, 'inside the sheet');
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      assert.ok(a[2] <= b[0] + 1e-9 || b[2] <= a[0] + 1e-9 || a[3] <= b[1] + 1e-9 || b[3] <= a[1] + 1e-9, 'no overlap');
    }
  }
});
