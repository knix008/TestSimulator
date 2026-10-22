'use strict';
/* The page ↔ Tauri host contract: every command the page invokes is defined and registered in lib.rs,
 * every event it listens for is emitted, the bundle config and the NSIS hooks file are consistent. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const all = (src, re) => [...src.matchAll(re)].map((m) => m[1]);
const host = read('src-tauri/src/lib.rs');
const bridge = read('src/js/desktop-bridge.js');
const transport = read('src/js/net-transport.js');
const conf = JSON.parse(read('src-tauri/tauri.conf.json'));

const defined = new Set(all(host, /#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([a-z_0-9]+)/g));
const handlerBlock = host.slice(host.indexOf('generate_handler!['), host.indexOf('])', host.indexOf('generate_handler![')));
const registered = new Set(all(handlerBlock, /([a-z_0-9]+),/g));
const overlay = read('src/js/menu-overlay.js');   // the menu overlay window calls the host directly
const invoked = new Set([...all(bridge, /invoke\('([a-z_0-9]+)'/g), ...all(transport, /invoke\('([a-z_0-9]+)'/g), ...all(overlay, /invoke\('([a-z_0-9]+)'/g)]);

test('every command defined in lib.rs is registered, and every registered one exists', () => {
  assert.deepStrictEqual([...defined].filter((c) => !registered.has(c)), []);
  assert.deepStrictEqual([...registered].filter((c) => !defined.has(c)), []);
});

test('the page calls only commands the host has, and the host has none the page never calls', () => {
  assert.deepStrictEqual([...invoked].filter((c) => !registered.has(c)), [], 'invoked but missing');
  assert.deepStrictEqual([...registered].filter((c) => !invoked.has(c)), [], 'registered but never called');
});

test('every event the page listens for is emitted by the host', () => {
  const listened = new Set([...all(bridge, /on\('([a-z-]+)'/g), ...all(transport, /on\('([a-z-]+)'/g)]);
  const emitted = new Set(all(host, /emit(?:_to)?\((?:MAIN, )?"([a-z-]+)"/g));
  assert.deepStrictEqual([...listened].filter((e) => !emitted.has(e)), []);
  for (const e of ['net-data', 'net-closed', 'net-accept']) assert.ok(emitted.has(e), e);
  const overlayEvents = all(overlay, /listen\('([a-z-]+)'/g);
  assert.ok(overlayEvents.length >= 2);
  assert.deepStrictEqual(overlayEvents.filter((e) => !host.includes(`emit_to(MENU_OVERLAY, "${e}"`)), [], 'menu overlay events');
});

test('the DICOM network commands are wired to net.rs and close their sockets on exit', () => {
  assert.match(host, /^mod net;/m);
  for (const c of ['net_connect', 'net_send', 'net_close', 'net_listen', 'net_stop_listen']) assert.ok(registered.has(c), c);
  assert.match(host, /app\.manage\(net::Net::new\(/);
  assert.match(host, /RunEvent::Exit[\s\S]{0,200}close_all\(\)/);
});

test('test hooks are documented and only read from the environment', () => {
  for (const v of ['MYDCMVIEWER_TEST_SAVE_DIR', 'MYDCMVIEWER_TEST_OPEN', 'MYDCMVIEWER_TEST_FOLDER', 'MYDCMVIEWER_TEST_ANSWER', 'MYDCMVIEWER_TEST_PRINT_DIR']) {
    assert.ok(host.includes(`// ${v}`), `${v} documented`);
    assert.ok(host.includes(`test_env("${v}")`), `${v} used`);
  }
});

test('bundle: product, identifier, dev server, frontend and file association', () => {
  assert.strictEqual(conf.productName, 'MyDCMViewer');
  assert.strictEqual(conf.identifier, 'com.shkwon.mydcmviewer');
  assert.strictEqual(conf.build.devUrl, 'http://localhost:5193');
  assert.strictEqual(conf.build.frontendDist, '../dist');
  assert.match(conf.build.beforeBuildCommand, /build-web\.js --app/);
  assert.deepStrictEqual(conf.bundle.fileAssociations[0].ext, ['dcm', 'dicm', 'dicom']);
  assert.ok(fs.existsSync(path.join(ROOT, 'src-tauri', conf.bundle.windows.nsis.installerIcon)));
});

test('NSIS hooks file: UTF-8 with BOM, the hook macros, no template defines inside Functions', () => {
  const file = path.join(ROOT, 'src-tauri', conf.bundle.windows.nsis.installerHooks);
  const raw = fs.readFileSync(file);
  assert.deepStrictEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM (Korean text)');
  const s = raw.toString('utf8');
  for (const m of ['NSIS_HOOK_PREINSTALL', 'NSIS_HOOK_POSTINSTALL', 'NSIS_HOOK_POSTUNINSTALL']) assert.match(s, new RegExp(`!macro ${m}\\b`));
  // Tauri's template defines (PRODUCTNAME, APP_EXECUTABLE_FILENAME …) are set after this file is read:
  // a Function that uses them breaks the uninstaller build.
  for (const fn of s.split(/^Function /m).slice(1).map((b) => b.slice(0, b.indexOf('FunctionEnd')))) {
    assert.doesNotMatch(fn, /\$\{(PRODUCTNAME|APP_EXECUTABLE_FILENAME|MAINBINARYNAME|BUNDLEID|VERSION)\}/, fn.split('\n')[0]);
  }
  for (const fn of all(s, /Call\s+(?:un\.)?([A-Za-z_]+)/g)) assert.match(s, new RegExp(`^Function (un\\.)?${fn}\\b`, 'm'), `Function ${fn}`);
});

test('every vendor file the page loads on demand is copied by build-web.js', () => {
  const build = read('scripts/build-web.js');
  const want = [
    '@cornerstonejs/codec-openjpeg', 'dist/openjpegjs.js', '@cornerstonejs/codec-charls', 'dist/charlsjs.js',
    'codec/enc/avif_enc.wasm', 'codec/enc/jxl_enc.wasm', 'codec/enc/webp_enc.wasm', 'pako/dist/pako.min.js'.split('/')[0],
  ];
  for (const w of want) assert.ok(build.includes(w), w);
  for (const [pkg, files] of Object.entries({ '@jsquash/avif': ['codec/enc/avif_enc.js'], '@jsquash/jxl': ['codec/enc/jxl_enc.js'], '@jsquash/webp': ['codec/enc/webp_enc.js'] })) {
    for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, 'node_modules', pkg, f)), `${pkg}/${f} installed`);
  }
});
