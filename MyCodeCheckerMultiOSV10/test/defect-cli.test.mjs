// defect-analysis CLI: capture, analysis options, JSON v8, model stubs, annotations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const compat = require('../core/compat/index.js');
const cli = require('../core/defect-cli.js');
const { analyzeSources, analyzePath, listRules, defectAnnotations } = require('../core/analyze.js');

test('compiler command lines: GCC/Clang and MSVC flags', () => {
  const g = cli.parseCompilerArgs('gcc -Iinc -I "my dir" -DA -DB=2 -UA -std=c11 -c src/a.c -o a.o', '/p');
  assert.deepEqual(g.sources, [path.resolve('/p', 'src/a.c')]);
  assert.deepEqual(g.includeDirs, [path.resolve('/p', 'inc'), path.resolve('/p', 'my dir')]);
  assert.deepEqual(g.defines, { B: '2' });
  assert.equal(g.std, 'c11');
  const m = cli.parseCompilerArgs(['cl.exe', '/nologo', '/Iinclude', '/DWIN32', '/c', 'main.cpp'], 'C:\\w');
  assert.equal(m.compiler, 'cl');
  assert.deepEqual(m.defines, { WIN32: '1' });
  assert.equal(path.basename(m.sources[0]), 'main.cpp');
});

test('compile_commands.json with command and arguments forms', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-cc-'));
  const file = path.join(dir, 'compile_commands.json');
  fs.writeFileSync(file, JSON.stringify([
    { directory: dir, command: 'cc -DX=1 -Iinc -c a.c', file: 'a.c' },
    { directory: dir, arguments: ['c++', '-Iinc2', '-c', 'b.cpp'], file: 'b.cpp' },
  ]));
  const units = cli.readCompileCommands(file);
  assert.equal(units.length, 2);
  assert.equal(units[0].defines.X, '1');
  assert.deepEqual(cli.mergeUnits(units).includeDirs, [path.join(dir, 'inc'), path.join(dir, 'inc2')]);
});

test('build capture records the compiler calls made by a build command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-build-'));
  // A fake build: a Node script that calls "cc" through the shell, like make would.
  const build = path.join(dir, 'build.cjs');
  fs.writeFileSync(build, "require('child_process').spawnSync('cc', ['-DFROM_BUILD=7', '-Iinc', '-c', 'x.c'], { shell: true, stdio: 'ignore' });\n");
  const r = cli.runBuild(`"${process.execPath}" build.cjs`, dir, path.join(dir, '.mcc'));
  assert.equal(r.units.length, 1);
  assert.equal(r.units[0].defines.FROM_BUILD, '7');
  assert.equal(path.basename(r.units[0].file), 'x.c');
});

test('analysis options: coding standards off by default, enable/disable by checker, aggressiveness', () => {
  const rules = listRules();
  const def = cli.analysisOptions({}, rules);
  assert.ok(def.inactive.has(rules.find((r) => r.key.startsWith('misra-c:')).key));
  const withMisra = cli.analysisOptions({ codingStandards: ['misra-c2012'] }, rules);
  assert.ok(!withMisra.inactive.has(rules.find((r) => r.key.startsWith('misra-c:')).key));
  const all = cli.analysisOptions({ all: true }, rules);
  assert.equal(all.inactive.size, 0);
  const noNull = cli.analysisOptions({ disable: ['FORWARD_NULL'] }, rules);
  assert.equal(noNull.filter({ checker: 'FORWARD_NULL' }), false);
  assert.equal(noNull.filter({ checker: 'RESOURCE_LEAK' }), true);
  const only = cli.analysisOptions({ disableDefault: true, enable: ['RESOURCE_LEAK'] }, rules);
  assert.equal(only.filter({ checker: 'FORWARD_NULL' }), false);
  assert.equal(only.filter({ checker: 'RESOURCE_LEAK' }), true);
  assert.equal(cli.analysisOptions({ aggressiveness: 'high' }, rules).absint.allocNull, true);
  assert.throws(() => cli.analysisOptions({ aggressiveness: 'max' }, rules), /aggressiveness/);
});

test('defect JSON v8 output round-trips through the importer', () => {
  const src = 'int f(int *p) {\n  if (p == 0) { return *p; }\n  return 0;\n}\n';
  const a = analyzeSources([{ path: 'a.c', text: src }]);
  const v8 = cli.toJsonV8(a);
  assert.equal(v8.formatVersion, 8);
  const fn = v8.issues.find((i) => i.checkerName === 'FORWARD_NULL');
  assert.ok(fn, 'FORWARD_NULL in v8 output');
  assert.equal(fn.mainEventLineNumber, 2);
  assert.ok(fn.events.some((e) => e.main));
  assert.ok(fn.stateOnServer.triage.classification);
  const external = require('../core/platform/external.js');
  const back = external.importExternal(JSON.stringify(v8), {});
  assert.equal(back.format, 'defect-json');
  assert.ok(back.findings.some((f) => /FORWARD_NULL/.test(f.rule || f.ruleId || '')));
});

test('cov-make-library turns __mcc_*__ stubs into models', () => {
  const { models, unsupported } = cli.makeLibrary(`
    void *pool_get(int n) { return __mcc_alloc__(n); }
    void pool_put(void *p) { __mcc_free__(p); }
    char *net_read(void) { return __mcc_tainted_data_return__(); }
    void run(char *c) { __mcc_os_cmd_sink__(c); }
    void stop(void) { __mcc_panic__(); }
  `);
  assert.deepEqual(models.map((m) => [m.name, m.kind]), [['pool_get', 'allocator'], ['pool_put', 'free'], ['net_read', 'source'], ['run', 'sink']]);
  assert.equal(models[3].checker, 'OS_CMD_INJECTION');
  assert.deepEqual(unsupported, [{ name: 'stop', primitive: '__mcc_panic__' }]);
});

test('mcc[...] annotations suppress only the named checker on that or the next code line', () => {
  const map = defectAnnotations('// mcc[FORWARD_NULL]\n\nx = *p;\ny(); /* mcc[resource_leak : FALSE] */\n');
  assert.deepEqual([...map.get(3)], ['forward_null']);
  assert.deepEqual([...map.get(4)], ['resource_leak']);
  const src = 'int f(int *p) {\n  // mcc[FORWARD_NULL]\n  if (p == 0) { return *p; }\n  return 0;\n}\nint g(int *p) {\n  // mcc[RESOURCE_LEAK]\n  if (p == 0) { return *p; }\n  return 0;\n}\n';
  const a = analyzeSources([{ path: 'a.c', text: src }]);
  const fn = a.issues.filter((i) => i.checker === 'FORWARD_NULL').map((i) => i.line);
  assert.deepEqual(fn, [8], 'the other checker name does not suppress');
});

test('the cov script runs build, analyze and format-errors end to end', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-cov-'));
  fs.writeFileSync(path.join(dir, 'a.c'), 'int f(int *p) {\n  if (!p) { return *p; }\n  return 0;\n}\n');
  const run = (...a) => spawnSync(process.execPath, ['scripts/defect-cli.mjs', ...a], { encoding: 'utf8' });
  assert.equal(run('capture', '--path', dir).status, 0);
  const an = run('analyze', '--path', dir, '--aggressiveness-level', 'low');
  assert.equal(an.status, 0, an.stderr);
  assert.match(an.stdout, /FORWARD_NULL/);
  const out = path.join(dir, 'v8.json');
  assert.equal(run('format-errors', '--dir', path.join(dir, '.mcc'), '--json-output-v8', out).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).type, compat.DEFECT_JSON_TYPE);
  assert.equal(run('nope').status, 2);
  assert.ok(!analyzePath(dir, {}).issues.some((i) => i.file.startsWith('.mcc')), 'the intermediate directory is not analyzed');
});
