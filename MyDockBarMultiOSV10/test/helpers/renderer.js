'use strict';

/**
 * Loads a renderer script that attaches itself to `window`, so the pure logic
 * in `src/renderer/js/*.js` can be tested on plain Node without a browser.
 *
 * The scripts are wrapped and run in *this* realm rather than a fresh vm
 * context: objects that cross a realm boundary have a different prototype, and
 * `deepStrictEqual` rejects them even when the contents match.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

/**
 * @param {string[]} files paths relative to the repo root, loaded in order
 * @returns {object} the shared fake `window` the scripts populated
 */
function loadRenderer(files) {
  const window = {};

  for (const file of files) {
    const full = path.join(ROOT, file);
    const source = fs.readFileSync(full, 'utf8');
    const factory = vm.runInThisContext(
      `(function (window, globalThis, module, exports) {\n${source}\n})`,
      { filename: full },
    );
    const stub = { exports: {} };
    factory(window, window, stub, stub.exports);

    // i18n.js is a UMD module: in Node it picks the CommonJS branch, so its
    // exports land on the stub rather than on `window`.
    if (stub.exports && Object.keys(stub.exports).length && !window.DockI18n) {
      window.DockI18n = stub.exports;
    }
  }
  return window;
}

module.exports = { loadRenderer, ROOT };
