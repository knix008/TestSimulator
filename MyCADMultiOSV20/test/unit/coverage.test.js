// The FreeCAD coverage table (Help → Feature list) names real MyCAD commands.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { coverageCommands, coverageSummary, FREECAD_COVERAGE } from '../../src/domain/freecad.js';
import { PART_CATEGORIES, PART_KINDS } from '../../src/domain/parts.js';
import { SOLID_KINDS } from '../../src/domain/solids.js';
import { DIM_TOOLS, DRAW_TOOLS, MODIFY_TOOLS } from '../../src/view/tools.js';
import { hasIcon } from '../../src/icons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');

/** Command ids of the app: the literal keys of `commands` and the families built from lists. */
function appCommands() {
  const block = source.slice(source.indexOf('const commands = {'), source.indexOf('function commandEnabled'));
  const ids = new Set([...block.matchAll(/^ {2}([a-zA-Z0-9]+): \{/gm)].map((m) => m[1]));
  for (const id of [...DRAW_TOOLS, ...DIM_TOOLS, ...MODIFY_TOOLS]) ids.add(`tool:${id}`);
  for (const kind of PART_KINDS) ids.add(`part:${kind}`);
  for (const category of Object.keys(PART_CATEGORIES)) ids.add(`partCategory:${category}`);
  for (const kind of [...SOLID_KINDS, 'pad', 'revolution', 'loft', 'sweep']) ids.add(`solid:${kind}`);
  for (const op of ['union', 'cut', 'common']) ids.add(`bool:${op}`);
  for (const format of ['3mf', 'amf', 'obj', 'ply', 'off', 'step', 'fcstd']) ids.add(`export3d:${format}`);
  return ids;
}

test('FreeCAD coverage: every workbench item has a status, both languages, and real commands', () => {
  const ids = appCommands();
  assert.ok(ids.has('freecadCoverage') && ids.has('import3d') && ids.has('toolbarRows'));
  assert.ok(source.includes("`solid:${kind}`") && source.includes("`bool:${op}`") && source.includes("`export3d:${format}`"), 'the command families are built in app.js');
  for (const group of FREECAD_COVERAGE) {
    assert.ok(group.ko && group.en && hasIcon(group.icon), group.id);
    for (const item of group.items) {
      assert.ok(['full', 'partial', 'none'].includes(item.status), item.en);
      assert.ok(item.ko && item.en, item.en);
      if (item.status === 'none') assert.equal(item.commands.length, 0, `${item.en}: nothing to point at`);
      else assert.ok(item.commands.length > 0, `${item.en}: names its commands`);
      if (item.status === 'partial') assert.ok(item.noteKo && item.noteEn, `${item.en}: says what is missing`);
    }
  }
  const missing = coverageCommands().filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], 'commands named in the table but missing in the app');
  const summary = coverageSummary();
  assert.equal(summary.total, summary.full + summary.partial + summary.none);
  assert.ok(summary.full >= 30, `${summary.full} supported items`);
  assert.ok(summary.none > 0, 'what MyCAD does not do is listed honestly');
});
