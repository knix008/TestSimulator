// Every FreeCAD 1.1 command and the MyCAD command that does the same.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FREECAD_COMMANDS, freecadCommandList } from '../../src/domain/freecad-commands.js';
import { FREECAD_MAP, freecadCoverage, freecadTotals } from '../../src/domain/freecad-map.js';

const totals = freecadTotals();

test('FreeCAD command list: every command once, in its workbench', () => {
  const names = freecadCommandList().map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length > 1000, `${names.length} commands`);
  for (const [workbench, list] of Object.entries(FREECAD_COMMANDS)) for (const [name, menu] of list) assert.ok(name && menu, `${workbench}: ${name}`);
});

test('FreeCAD map: only real FreeCAD commands, each mapped to MyCAD command ids, a group or a reason', () => {
  const names = new Set(freecadCommandList().map((c) => c.name));
  for (const [name, value] of Object.entries(FREECAD_MAP)) {
    assert.ok(names.has(name), `${name} is not a FreeCAD command`);
    const ok = value === 'group' || typeof value === 'string' || (Array.isArray(value) && value.length && value.every((id) => typeof id === 'string')) || (value && typeof value.na === 'string');
    assert.ok(ok, name);
  }
});

test(`FreeCAD coverage: ${totals.done} of ${totals.total} commands have a MyCAD equivalent (${totals.todo} to do)`, () => {
  const list = freecadCoverage();
  assert.equal(list.length, totals.total);
  // A drop-down group counts only when it gathers commands of its workbench.
  for (const item of list.filter((c) => c.status === 'group')) assert.ok(FREECAD_COMMANDS[item.workbench].length > 1, item.name);
  assert.ok(totals.done <= totals.total);
});
