'use strict';
// Workaround for Electron 31 + Node.js 20.18.0 ESM/CJS interop bug:
// Static `import { app } from 'electron'` in an ESM main process resolves to
// the Electron custom URL `electron:electron`. The ESM linker then calls
// cjsPreparseModuleExports('electron:electron', source), which looks up the
// module in CJSModule._cache. Because 'electron:electron' is an Electron
// built-in (not a disk file), it is NOT in the standard CJS module cache and
// the lookup returns undefined, causing:
//   TypeError: Cannot read properties of undefined (reading 'exports')
//
// Fix: in this CJS bootstrap, call require('electron') so that Electron's
// C++ interception fires and the real Electron API is loaded, then register
// a synthetic Module entry under the 'electron:electron' key so that
// cjsPreparseModuleExports can find it when the ESM linker runs.
const Module = require('module');

if (!Module._cache['electron:electron']) {
  const electronExports = require('electron');
  Module._cache['electron:electron'] = {
    id: 'electron:electron',
    filename: 'electron:electron',
    loaded: true,
    exports: electronExports,
    parent: null,
    children: [],
    paths: [],
  };
}

// Now load the real ESM main entry. Using import() here is a dynamic import
// which runs after the synchronous CJS bootstrap body, giving the cache patch
// above time to take effect before the ESM linker resolves 'electron'.
import('./main.js').catch((err) => {
  console.error('[bootstrap] Failed to load electron/main.js:', err);
  process.exit(1);
});
