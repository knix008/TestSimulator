// The C/C++ path: every MATLAB example is offered, both languages name the
// controls, and the desktop commands and buttons stay wired together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeSpec } from '../../src/core/catalog.js';
import { MESSAGES } from '../../src/core/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const CPP_KEYS = [
  'tabCpp', 'cppHelp', 'cppDesktopOnly', 'cppManaged', 'cppSystem', 'cppNone',
  'cppInstall', 'cppRemove', 'cppReinstall', 'cppWorking', 'cppDownloading', 'cppExtracting', 'cppCompiling',
  'cppRun', 'cppShow', 'cppRunAll', 'cppResult', 'cppSource', 'cppNoOutput', 'cppPath', 'cppUseNow',
];

test('C/C++ settings text exists in Korean and English', () => {
  for (const key of CPP_KEYS) {
    assert.equal(typeof MESSAGES.ko[key], 'string', `ko ${key}`);
    assert.equal(typeof MESSAGES.en[key], 'string', `en ${key}`);
    assert.ok(MESSAGES.ko[key].trim() && MESSAGES.en[key].trim(), key);
  }
  assert.match(MESSAGES.ko.cppHelp, /설치/);
  assert.match(MESSAGES.en.cppHelp, /Install/);
  assert.match(MESSAGES.ko.cppDesktopOnly, /데스크톱/);
  assert.match(MESSAGES.en.cppDesktopOnly, /desktop/);
});

test('every built-in MATLAB example is a script the C/C++ runner can be given', () => {
  const spec = nodeSpec('script.matlab');
  const ids = spec.presets.map((preset) => preset.id);
  assert.deepEqual(ids, ['basics', 'ode', 'signal', 'fit', 'control', 'surface', 'table']);
  for (const preset of spec.presets) {
    assert.ok(preset.params.code.trim().length > 40, preset.id);
    assert.ok(preset.ko && preset.en, preset.id);
  }
  const damped = spec.params.find((param) => param.key === 'code').def;
  assert.match(damped, /plot\(x, y\)/);
  assert.match(spec.help[0], /C\/C\+\+/);
  assert.match(spec.help[1], /C\/C\+\+/);
});

test('the desktop commands and the screen buttons call the same C/C++ path', () => {
  const host = read('src-tauri/src/lib.rs');
  for (const command of ['cpp_toolchain_status', 'cpp_toolchain_install', 'cpp_toolchain_remove', 'cpp_toolchain_reinstall', 'cpp_transpile', 'cpp_run']) {
    assert.match(host, new RegExp(`cpp::${command}`), command);
  }
  const native = read('src/platform/native.js');
  for (const command of ['cpp_toolchain_status', 'cpp_toolchain_install', 'cpp_toolchain_remove', 'cpp_toolchain_reinstall', 'cpp_transpile', 'cpp_run']) {
    assert.match(native, new RegExp(`invoke\\('${command}'`), command);
  }
  const dialogs = read('src/ui/dialogs.js');
  assert.match(dialogs, /tabCpp/);
  assert.match(dialogs, /cpp-install/);
  assert.match(dialogs, /cpp-remove/);
  assert.match(dialogs, /cpp-reinstall/);
  assert.match(dialogs, /showCppResult/);
  assert.match(dialogs, /id: 'cpp-result'/);
  const matlab = read('src/ui/matlab.js');
  assert.match(matlab, /ml-run-cpp/);
  assert.match(matlab, /dialogs\.runCpp/);
  assert.match(matlab, /dialogs\.runAllCppExamples/);
  const app = read('src/ui/app.js');
  assert.match(app, /testid: 'cpp-run'/);
  assert.match(app, /dialogs\.runCpp/);
  assert.match(app, /dialogs\.showCppSource/);
});
