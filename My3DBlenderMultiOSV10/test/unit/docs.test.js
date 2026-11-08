import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { allOps, getOp } from '../../src/core/ops.js';
import { iconNames } from '../../src/ui/icons.js';
import { THEMES, themeById, themeVars } from '../../src/core/themes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const shape = (text) => ({
  headings: text.split('\n').filter((l) => /^#{1,4}\s/.test(l)).map((l) => l.match(/^#+/)[0].length),
  tableRows: text.split('\n').filter((l) => l.startsWith('|')).length,
  steps: text.split('\n').filter((l) => /^\d+\.\s/.test(l)).length,
  code: text.split('\n').filter((l) => l.startsWith('```')).length,
});

describe('documents', () => {
  for (const name of ['UsersGuide', 'Tutorial']) {
    test(`${name}: Korean and English have the same structure`, () => {
      assert.deepEqual(shape(read(`doc/${name}.md`)), shape(read(`doc/${name}.en.md`)));
    });
    test(`${name}: the page the Help menu opens has been generated`, () => {
      for (const suffix of ['', '.en']) {
        const page = read(`public/doc/${name}${suffix}.html`);
        assert.match(page, /<h1/);
        const md = read(`doc/${name}${suffix}.md`);
        const firstHeading = md.split('\n').find((l) => l.startsWith('## ')).slice(3);
        assert.ok(page.includes(firstHeading), `run npm run build:docs: "${firstHeading}" is missing`);
      }
    });
  }
  test('the guide names the real operators it tells people to use', () => {
    const guide = read('doc/UsersGuide.en.md');
    for (const id of ['mesh.extrude_region', 'mesh.inset', 'mesh.bevel', 'mesh.loopcut', 'object.duplicate', 'object.join', 'anim.keyframe_insert']) {
      const op = getOp(id);
      assert.ok(op, id);
      assert.ok(op.key, `${id} has a shortcut`);
      assert.ok(guide.includes(op.key.replace('Shift+', 'Shift + ').replace('Ctrl+', 'Ctrl + ')), `${id}: the guide lists ${op.key}`);
    }
  });
  test('the guide does not claim formats the code lacks', () => {
    const guide = read('doc/UsersGuide.en.md');
    // Each format it claims has its reader in the code.
    const uiops = read('src/ui/uiops.js');
    for (const [row, reader] of [['Blender (.blend)', 'importBlendScene'], ['FBX', 'importFBXScene'], ['USD (.usda, .usdc, .usdz)', 'importUSDA'], ['Alembic (.abc)', 'importABC'], ['Collada (.dae)', 'importDAE']]) {
      assert.ok(guide.includes(`| ${row} | Yes |`), row);
      assert.ok(uiops.includes(reader), reader);
    }
  });
  test('the installer commands in the README exist', () => {
    const scripts = JSON.parse(read('package.json')).scripts;
    for (const name of ['build:win', 'build:mac', 'build:linux', 'build:all', 'build:web', 'coverage', 'test:js', 'test:web']) {
      assert.ok(scripts[name], name);
      assert.ok(read('README.md').includes(`npm run ${name}`), `README: ${name}`);
    }
  });
});

describe('icons and themes', () => {
  test('every icon an operator asks for is drawn', () => {
    const names = new Set(iconNames());
    for (const op of allOps()) if (op.icon) assert.ok(names.has(op.icon), `${op.id}: ${op.icon}`);
  });
  test('the default theme exists, every theme fills every variable, names in both languages', () => {
    assert.equal(themeById('studio').id, 'studio');
    assert.equal(THEMES[0].id, 'studio');
    const keys = Object.keys(themeVars(THEMES[0]));
    for (const theme of THEMES) {
      assert.deepEqual(Object.keys(themeVars(theme)), keys, theme.id);
      for (const value of Object.values(themeVars(theme))) assert.match(value, /^#[0-9a-f]{6}$/i, theme.id);
      assert.ok(theme.name.ko && theme.name.en, theme.id);
    }
  });
});
