/* node --test — renderer modules that do not need a real DOM: themes, i18n, icons, dialogs registry, platform paths. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fakeWindow, loadScript } = require('./helpers/dom');

const SRC = path.join(__dirname, '..', 'src');
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

test('themes: exactly 20 built-in themes, unique ids, complete variable sets', () => {
  const w = loadScript('js/themes.js', fakeWindow());
  const list = w.Themes.list();
  assert.equal(list.length, 20);
  assert.equal(new Set(list.map((t) => t.id)).size, 20);
  const keys = Object.keys(list[0].vars);
  for (const th of list) {
    assert.ok(['dark', 'light'].includes(th.scheme), th.id);
    assert.deepEqual(Object.keys(th.vars), keys, `${th.id} variable set`);
    for (const [k, v] of Object.entries(th.vars)) assert.ok(v && typeof v === 'string', `${th.id} ${k}`);
  }
  assert.ok(list.filter((t) => t.scheme === 'dark').length >= 10);
  assert.equal(w.Themes.get('dark').id, 'midnight', 'legacy value maps to a theme');
  assert.equal(w.Themes.get('no-such').id, 'midnight');
  const th = w.Themes.apply('nord');
  assert.equal(th.id, 'nord');
  assert.equal(w.document.body.dataset.theme, 'nord');
  assert.equal(w.document.body.dataset.scheme, 'dark');
});

test('i18n: Korean and English have the same keys and every data-i18n key in the HTML exists', () => {
  const w = fakeWindow();
  loadScript('i18n/en.js', w); loadScript('i18n/ko.js', w); loadScript('js/i18n.js', w);
  const en = w.I18N_DATA.en, ko = w.I18N_DATA.ko;
  const missingKo = Object.keys(en).filter((k) => !(k in ko));
  const missingEn = Object.keys(ko).filter((k) => !(k in en));
  assert.deepEqual(missingKo, [], 'keys missing in ko');
  assert.deepEqual(missingEn, [], 'keys missing in en');
  const used = new Set([...html.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g)].map((m) => m[1]));
  const undefinedKeys = [...used].filter((k) => !(k in en));
  assert.deepEqual(undefinedKeys, [], 'HTML keys without translation');
  w.I18n.setLang('ko');
  assert.equal(w.I18n.t('menu.file'), '파일');
  assert.equal(w.I18n.t('status.frame', { n: 2, total: 9 }), '프레임 2/9');
  w.I18n.setLang('xx');
  assert.equal(w.I18n.lang, 'en', 'unknown language falls back to English');
  assert.equal(w.I18n.t('does.not.exist'), 'does.not.exist');
});

test('icons: every data-icon used in the HTML has an SVG, flags exist', () => {
  const w = loadScript('js/icons.js', fakeWindow());
  const used = new Set([...html.matchAll(/data-icon="([^"]+)"/g)].map((m) => m[1]));
  const missing = [...used].filter((n) => !w.Icons.svg(n));
  assert.deepEqual(missing, []);
  assert.ok(w.Icons.svg('open').startsWith('<svg'));
  assert.equal(w.Icons.svg('nope'), '');
  assert.ok(w.Icons.flag('kr').includes('<svg') && w.Icons.flag('us').includes('<svg'));
  assert.ok(w.Icons.names().length > 60);
});

test('dialogs: registry and window size hints', () => {
  const w = fakeWindow();
  loadScript('i18n/en.js', w); loadScript('i18n/ko.js', w); loadScript('js/i18n.js', w); loadScript('js/themes.js', w);
  loadScript('js/dialogs.js', w);
  const kinds = w.Dialogs.kinds();
  for (const k of ['about', 'shortcuts', 'error', 'prompt', 'settings', 'batch', 'anonymize', 'mpr', 'progress', 'print']) assert.ok(kinds.includes(k), k);
  for (const k of kinds) assert.ok(w.Dialogs.size(k).width >= 400, `${k} width`);
  assert.equal(w.Dialogs.size('mpr').height, undefined, 'MPR window fits its content');
  assert.ok(w.Dialogs.PHI_TAGS.length > 30);
  assert.ok(w.Dialogs.PHI_TAGS.every(([tag]) => /^[0-9A-F]{8}$/.test(tag)));
});

test('platform (browser mode): path helpers and the virtual file system', async () => {
  const w = fakeWindow();
  loadScript('js/platform.js', w);
  const P = w.Platform;
  assert.equal(P.isElectron, false);
  assert.equal(P.join('/Samples', 'sub', 'a.dcm'), '/Samples/sub/a.dcm');
  assert.equal(P.dirname('/Samples/sub/a.dcm'), '/Samples/sub');
  assert.equal(P.dirname('/Samples'), '/');
  assert.equal(P.basename('/Samples/sub/a.dcm'), 'a.dcm');
  assert.equal(P.extname('x/CT_small.DCM'), 'dcm');
  assert.equal(P.extname('DICOMDIR'), '');
  const root = P.web.mountUrls('Samples', [{ name: 'a.dcm', url: '/samples/a.dcm' }, { name: 'b.dcm', url: '/samples/b.dcm' }]);
  assert.equal(root, '/Samples');
  const list = await P.readDir(root);
  assert.deepEqual(list.map((e) => e.name), ['a.dcm', 'b.dcm']);
  const roots = await P.roots();
  assert.equal(roots.length, 1);
  assert.equal(P.canWriteInto(root), false, 'URL roots are read only');
  const files = [{ name: 'x.dcm', size: 10, webkitRelativePath: 'Folder/sub/x.dcm' }, { name: 'y.png', size: 20, webkitRelativePath: 'Folder/y.png' }];
  const r2 = P.web.mountFiles(files, 'Folder');
  const top = await P.readDir(r2);
  assert.deepEqual(top.map((e) => `${e.isDir ? 'd' : 'f'}:${e.name}`), ['d:sub', 'f:y.png']);
  const sub = await P.readDir(`${r2}/sub`);
  assert.deepEqual(sub.map((e) => e.name), ['x.dcm']);
  assert.equal((await P.stat(`${r2}/y.png`)).exists, true);
  assert.equal((await P.stat('/nowhere')).exists, false);
});

test('index.html / popup.html reference existing scripts and the toolbar is icon-only', () => {
  for (const page of ['index.html', 'popup.html']) {
    const src = fs.readFileSync(path.join(SRC, page), 'utf8');
    for (const m of src.matchAll(/<script src="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(SRC, m[1])), `${page}: ${m[1]}`);
  }
  const toolbar = html.slice(html.indexOf('<div class="toolbar"'), html.indexOf('<!-- ── Workspace ── -->')).replace(/<div class="menu-panel[\s\S]*?<\/div>\s*<\/div>/g, '');
  const buttons = [...toolbar.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim());
  const textual = buttons.filter((t) => t && !/^(▾|100%)$/.test(t));
  assert.deepEqual(textual, [], 'toolbar buttons must be icon-only');
  assert.ok(html.includes('id="exportMenu"'), 'single export dropdown');
  assert.ok(html.includes('id="zoomLabel"') && html.includes('data-key="ruler"') && html.includes('data-key="grid"'));
});

test('package.json: scripts, dependencies and builder config are consistent', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  for (const dep of ['dicom-parser', '@cornerstonejs/codec-openjpeg', '@cornerstonejs/codec-charls', 'jpeg-lossless-decoder-js', 'utif', 'libheif-js', 'pako']) assert.ok(pkg.dependencies[dep], dep);
  assert.ok(pkg.scripts.test.includes('--test-reporter'));
  assert.equal(pkg.main, 'main.js');
  assert.ok(pkg.build.fileAssociations.some((a) => a.ext.includes('dcm')));
  for (const f of ['build/icon.ico', 'build/icon.png', 'build/dcmfile.ico']) assert.ok(fs.existsSync(path.join(__dirname, '..', f)), `${f} (run npm run create-icons)`);
});
