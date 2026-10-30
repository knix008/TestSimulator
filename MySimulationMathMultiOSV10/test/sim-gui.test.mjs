// Block-diagram editor logic that runs without a browser: zoom stepping,
// branch removal, dropdown / context-menu icons, library search, grid ↔ ruler
// alignment. (The editor itself is checked by driving the real app.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stepZoom, removeSeg, enumIcon, withModelExt } from '../src/sim/logic.js';
import { majorStep, niceStep, cssColor } from '../src/sim/render.js';
import { LIBRARY, searchLibrary, blockDef } from '../core/sim/blocks/index.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('zoom stepper: −/+ go to the next multiple of 10 %, typed values stay', () => {
  assert.equal(stepZoom(47, 48), 50);
  assert.equal(stepZoom(47, 46), 40);
  assert.equal(stepZoom(50, 51), 60);
  assert.equal(stepZoom(50, 49), 40);
  assert.equal(stepZoom(10, 9), 10);
  assert.equal(stepZoom(100, 250), 250);
  assert.equal(stepZoom(100, 37), 37);
});

test('removeSeg: deleting one branch keeps the rest of the line and merges a lone child', () => {
  const a = { points: [], dst: { block: 'b2', port: 1 }, branches: [] };
  const b = { points: [[5, 5]], dst: { block: 'b3', port: 1 }, branches: [] };
  const line = { id: 'l1', src: { block: 'b1', port: 1 }, points: [[1, 1]], dst: null, branches: [a, b] };
  assert.equal(removeSeg(line, a), true);
  assert.deepEqual(line.dst, { block: 'b3', port: 1 });
  assert.deepEqual(line.points, [[1, 1], [5, 5]]);
  assert.equal(line.branches.length, 0);
  assert.equal(removeSeg(line, line), false);
});

test('every block option value gets a dropdown icon that exists in the shared icon set', () => {
  const chrome = read('../src/components/Chrome.jsx');
  const body = chrome.slice(chrome.indexOf('PATHS = {'));
  const names = new Set([...body.matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map((m) => m[1]));
  const seen = new Set();
  for (const it of LIBRARY) {
    for (const p of blockDef(it.type).params || []) {
      if (p.type !== 'enum') continue;
      for (const o of p.options || []) {
        const icon = enumIcon(o.value);
        assert.ok(names.has(icon), `icon '${icon}' for option '${o.value}' is not in Chrome.jsx PATHS`);
        seen.add(icon);
      }
    }
  }
  assert.equal(enumIcon('sine'), 'waves');
  assert.equal(enumIcon('round'), 'circleDot');
  assert.equal(enumIcon('floor'), 'plotStairs');
  assert.equal(enumIcon('AND'), 'gate');
  assert.ok(seen.size > 10, 'option icons are varied');
});

test('every context-menu / toolbar icon of the editor exists in the editor icon set', () => {
  const icons = read('../src/sim/icons.jsx');
  const have = new Set([...icons.matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map((m) => m[1]));
  const editor = read('../src/sim/ModelEditor.jsx');
  const used = new Set([...editor.matchAll(/icon[:=]\s*[{]?\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]));
  for (const m of editor.matchAll(/icon="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  assert.ok(used.size > 15);
  for (const n of used) assert.ok(have.has(n), `editor icon '${n}' is missing from src/sim/icons.jsx`);
});

test('library search: either language, any case, several words', () => {
  const ids = (q) => searchLibrary(q).map((i) => i.id);
  assert.ok(ids('PID 제어기').includes('PIDController'));
  assert.ok(ids('pid').includes('PIDController'));
  assert.ok(ids('transfer fcn').includes('TransferFcn'));
  assert.ok(ids('적분').includes('Integrator'));
  assert.deepEqual(ids('zzzz-no-block'), []);
  assert.equal(searchLibrary('').length, LIBRARY.length);
});

test('the 5×5 grid has its major lines at the ruler labels', () => {
  for (const zoom of [0.1, 0.33, 0.5, 1, 1.82, 2.5, 4, 8]) {
    const major = majorStep(zoom);
    assert.equal(major, niceStep(70 / zoom));
    assert.ok(major * zoom >= 70 && major * zoom < 70 * 2.5 + 1e-9, `major ${major} at zoom ${zoom}`);
  }
});

test('model save paths always get a model extension', () => {
  const exts = ['.smdl', '.msim'];
  assert.equal(withModelExt('C:/work/pendulum', exts), 'C:/work/pendulum.smdl');
  assert.equal(withModelExt('/work/pendulum.smdl', exts), '/work/pendulum.smdl');
  assert.equal(withModelExt('/work/a.MSIM', exts), '/work/a.MSIM');
  assert.equal(withModelExt('/work/notes.txt', exts), '/work/notes.txt.smdl');
  assert.equal(withModelExt('/work/v1.2/model', exts), '/work/v1.2/model.smdl', 'a dot in a folder name is not an extension');
  assert.equal(withModelExt('  ', exts), '');
});

test('user colours of blocks and lines: CSS colours as they are, [r g b] in 0…1 as rgb(), empty / auto = theme', () => {
  assert.equal(cssColor('#e03131'), '#e03131');
  assert.equal(cssColor('red'), 'red');
  assert.equal(cssColor('[1 0 0]'), 'rgb(255, 0, 0)');
  assert.equal(cssColor('[0.5, 1, 0]'), 'rgb(128, 255, 0)');
  assert.equal(cssColor(''), null);
  assert.equal(cssColor('auto'), null);
  assert.equal(cssColor(undefined), null);
});
