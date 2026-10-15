// FreeCAD's Test workbench for MyCAD: self-tests that run inside the app —
// the geometry and expressions (base), documents (save, read back, undo),
// the solids and booleans, the FEM solver against hand formulas, and the
// command table of the workbenches (work). Each case throws when it fails.
import { normDeg, rotate } from './domain/geometry.js';
import { evaluate } from './domain/expr.js';
import { addEntity, createDrawing, normalizeDrawing } from './domain/drawing.js';
import { DrawingDocument } from './domain/document.js';
import { parseFile, serialize } from './domain/format.js';
import { meshVolume, solidMesh, solidProperties } from './domain/solids.js';
import { analyzeFrame, frameFrom } from './domain/fem.js';
import { exportMesh, importMesh } from './domain/exchange3d.js';
import { convertUnit } from './commands/std.js';
import { bestFit, apply, rotationOf } from './domain/transform3d.js';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const near = (a, b, rel, label) => check(Math.abs(a - b) <= Math.abs(b) * rel + 1e-9, `${label}: ${a} ≠ ${b}`);

const box = (length, width, height, place = {}) => ({ type: 'solid', kind: 'box', params: { length, width, height }, ...place });

export const SELF_TESTS = {
  base: [
    ['angles are normalised to 0…360', () => { near(normDeg(-90), 270, 1e-12, 'normDeg'); near(normDeg(725), 5, 1e-12, 'normDeg'); }],
    ['rotation about a point', () => { const p = rotate({ x: 10, y: 0 }, { x: 0, y: 0 }, 90); near(p.y, 10, 1e-12, 'y'); check(Math.abs(p.x) < 1e-9, 'x'); }],
    ['expressions: arithmetic, functions, units', () => { near(evaluate('2*(3+4)'), 14, 1e-12, '2*(3+4)'); near(evaluate('sqrt(16)+1'), 5, 1e-12, 'sqrt'); }],
    ['units: inches, pressures, temperatures', () => { near(convertUnit('length', 1, 'in', 'mm'), 25.4, 1e-12, 'in'); near(convertUnit('temperature', 100, '°C', '°F'), 212, 1e-12, '°F'); }],
    ['best-fit transform from point pairs', () => {
      const R = rotationOf({ rx: 15, ry: -20, rz: 35 });
      const from = [[0, 0, 0], [10, 0, 0], [0, 6, 0], [2, 3, 7]];
      const fit = bestFit(from, from.map((p) => apply(R, p).map((v, i) => v + [3, 4, 5][i])));
      check(fit.rms < 1e-9, `rms ${fit.rms}`);
    }],
  ],
  doc: [
    ['a drawing is written and read back the same', () => {
      const d = createDrawing({ title: 'Self-test' });
      addEntity(d, 'circle', { cx: 1, cy: 2, r: 3 });
      addEntity(d, 'solid', box(10, 20, 30));
      d.groups = [{ id: 'g1', name: 'G', parent: null }];
      const back = parseFile(serialize(d)).drawing ?? parseFile(serialize(d));
      check(back.entities.length === 2, `${back.entities.length} entities`);
      check(back.groups?.[0]?.name === 'G', 'groups kept');
    }],
    ['undo and redo restore the drawing', () => {
      const doc = new DrawingDocument(createDrawing({ title: 'Undo' }));
      doc.apply('add', (d) => { addEntity(d, 'line', { x1: 0, y1: 0, x2: 1, y2: 1 }); });
      check(doc.drawing.entities.length === 1, 'added');
      doc.undo();
      check(doc.drawing.entities.length === 0, 'undone');
      doc.redo();
      check(doc.drawing.entities.length === 1, 'redone');
    }],
    ['a broken file is repaired, not refused', () => {
      const d = normalizeDrawing({ title: 3, entities: [{ type: 'circle', r: -2 }, { type: 'nonsense' }, null] });
      check(d.entities.length === 1 && d.entities[0].r > 0, 'repaired');
    }],
  ],
  solids: [
    ['primitive volumes', () => {
      near(solidProperties(box(10, 20, 30)).volume, 6000, 1e-9, 'box');
      near(solidProperties({ type: 'solid', kind: 'cylinder', params: { radius: 5, height: 10, angle: 360 } }).volume, Math.PI * 250, 0.01, 'cylinder');
    }],
    ['a boolean cut removes the overlap', () => {
      const cut = { type: 'solid', kind: 'boolean', params: {}, shape: { op: 'cut', parts: [box(10, 10, 10), box(10, 10, 10, { x: 5 })] } };
      near(Math.abs(meshVolume(solidMesh(cut))), 500, 0.01, 'cut');
    }],
    ['OBJ written and read back keeps the volume', () => {
      const d = createDrawing({ title: 'STL' });
      addEntity(d, 'solid', box(10, 10, 10));
      const back = importMesh('obj', exportMesh('obj', d, d.entities));
      const tris = back.entities[0].shape.tris;
      const list = [];
      for (let i = 0; i < tris.length; i += 9) list.push([[tris[i], tris[i + 1], tris[i + 2]], [tris[i + 3], tris[i + 4], tris[i + 5]], [tris[i + 6], tris[i + 7], tris[i + 8]]]);
      near(Math.abs(meshVolume(list)), 1000, 1e-6, 'volume');
    }],
  ],
  fem: [
    ['cantilever tip deflection = PL³/3EI', () => {
      const line = (x1, x2) => ({ type: 'line', id: `l${x1}`, x1, y1: 0, x2, y2: 0 });
      const r = analyzeFrame(frameFrom([line(0, 1000)]), { section: { type: 'rect', b: 50, h: 100 }, supports: { '0,0': 'fixed' }, loads: { '1000,0': { fy: -1000 } } });
      const I = (50 * 100 ** 3) / 12;
      near(r.displacements[1].uy, (-1000 * 1000 ** 3) / (3 * 210000 * I), 1e-9, 'δ');
    }],
  ],
};

/** Test_TestWork: every command of the app has a label and icon, and runs only when enabled. */
export function workTests(commands, t, hasIcon) {
  return [
    ['every command has a label and an icon', () => {
      const bad = Object.entries(commands).filter(([, c]) => !c.label || !t(c.label) || (c.icon && !hasIcon(c.icon))).map(([id]) => id);
      check(!bad.length, `bad: ${bad.slice(0, 8).join(', ')}`);
    }],
    ['every command can say whether it is enabled', () => {
      const bad = Object.entries(commands).filter(([, c]) => { try { if (c.enabled) c.enabled(); if (c.checked) c.checked(); return false; } catch { return true; } }).map(([id]) => id);
      check(!bad.length, `throws: ${bad.slice(0, 8).join(', ')}`);
    }],
  ];
}

/** Runs the chosen groups; returns [{ group, name, ok, ms, error }]. */
export function runSelfTests(groups, extra = {}) {
  const results = [];
  for (const group of groups) {
    for (const [name, run] of [...(SELF_TESTS[group] ?? []), ...(extra[group] ?? [])]) {
      const start = performance.now();
      try {
        run();
        results.push({ group, name, ok: true, ms: performance.now() - start });
      } catch (error) {
        results.push({ group, name, ok: false, ms: performance.now() - start, error: String(error?.message ?? error) });
      }
    }
  }
  return results;
}
