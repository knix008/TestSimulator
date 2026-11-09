// Print layout, packages (download, check, cancel, retry), the code editor's colours and tools, and the site's own code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bandTexts, layoutSheets, normalizePrintOptions, PAPERS, paperSize, printableHtml, PX_PER_MM, selectPrintPages, MAX_SHEETS } from '../../src/print/layout.js';
import { fileUrls, formatSize, PACKAGES, packageProgress, packageSize, packageState, sha256Hex } from '../../src/domain/packages.js';
import { PackageManager, packageView, readPackageStates } from '../../src/platform/packages.js';
import { findAll, highlight, isCodeFileName, languageOf, lineColumn, lineOffset, plainOf, toggleComment } from '../../src/domain/highlight.js';
import { checkCode, checkCss, checkJson, formatCode, PARSERS } from '../../src/domain/codetools.js';
import { drainQueue, pushQueue, readQueue } from '../../src/domain/codebus.js';
import * as S from '../../src/domain/site.js';
import { inlineScript, pageHtml, siteCss, siteStyles } from '../../src/domain/render.js';
import { siteFiles, singlePageHtml } from '../../src/domain/publish.js';
import { defaultSettings, loadSettings } from '../../src/domain/settings.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

// ───────── print

test('print: paper, landscape and the options are kept inside their limits', () => {
  assert.deepEqual(paperSize({ paper: 'A4' }), PAPERS.A4);
  assert.deepEqual(paperSize({ paper: 'A4', orientation: 'landscape' }), { width: 297, height: 210 });
  const o = normalizePrintOptions({ paper: 'X', margin: 'huge', fit: 'zoom', scale: 9999, copies: 0, device: 'watch', range: 'odd' });
  assert.equal(o.paper, 'A4');
  assert.equal(o.margin, 'normal');
  assert.equal(o.fit, 'width');
  assert.equal(o.scale, 400);
  assert.equal(o.copies, 1);
  assert.equal(o.device, 'desktop');
  assert.equal(o.range, 'all');
});

test('print: a long page at page width takes as many sheets as its height needs; one sheet when fitted', () => {
  const options = { paper: 'A4', margin: 'none', header: false, footer: false, device: 'desktop' };
  const areaPx = { w: 210 * PX_PER_MM, h: 297 * PX_PER_MM };
  const scale = areaPx.w / 1280;
  const height = Math.ceil((areaPx.h / scale) * 2.5);
  const layout = layoutSheets([{ id: 'a', name: 'Home', height }], options);
  assert.equal(layout.count, 3);
  assert.ok(Math.abs(layout.sheets[0].scale - scale) < 1e-9);
  assert.equal(layout.sheets[1].offset, areaPx.h / scale);
  assert.deepEqual(layout.sheets.map((s) => [s.part, s.parts, s.number]), [[0, 3, 1], [1, 3, 2], [2, 3, 3]]);
  const one = layoutSheets([{ id: 'a', name: 'Home', height }], { ...options, fit: 'page' });
  assert.equal(one.count, 1);
  assert.ok(one.sheets[0].scale < scale);
  assert.ok(one.sheets[0].left > 0, 'a shrunk page is centred');
  // Header and footer take their bands off the printable height.
  const banded = layoutSheets([{ id: 'a', name: 'Home', height: 100 }], { ...options, header: true, footer: true });
  assert.equal(banded.area.height, 297 - 16);
});

test('print: ranges, a sheet limit, and the band texts', () => {
  const pages = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  assert.deepEqual(selectPrintPages(pages, { range: 'all' }).map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(selectPrintPages(pages, { range: 'current' }, 'b').map((p) => p.id), ['b']);
  assert.deepEqual(selectPrintPages(pages, { range: 'custom', from: 2, to: 3 }).map((p) => p.id), ['b', 'c']);
  assert.deepEqual(selectPrintPages(pages, { range: 'custom', from: 3, to: 1 }).map((p) => p.id), ['c']);
  const huge = layoutSheets([{ id: 'a', name: 'A', height: 10_000_000 }], {});
  assert.equal(huge.count, MAX_SHEETS);
  assert.equal(huge.truncated, true);
  const layout = layoutSheets([{ id: 'a', name: 'Home', height: 5000 }], {});
  const texts = bandTexts(layout.sheets[1], layout, {}, { siteName: 'Site', date: new Date(2026, 0, 2), t: (k, v) => `${v.n}/${v.total}` });
  assert.match(texts.headerLeft, /^Site · Home \(2\/\d+\)$/);
  assert.equal(texts.footer, `2/${layout.count}`);
  assert.equal(bandTexts(layout.sheets[0], layout, { headerText: 'Mine', footerText: 'Foot' }, { t: () => 'x' }).headerLeft, 'Mine');
});

test('print: pages print without scripts, with every picture loaded, and plain without backgrounds', () => {
  const html = '<html><head><title>x</title></head><body><img loading="lazy" src="a.png"><script>alert(1)</script></body></html>';
  const out = printableHtml(html);
  assert.ok(!/<script>alert/.test(out));
  assert.ok(!/loading=/.test(out));
  assert.match(out, /<style data-print>.*<\/style><\/head>/);
  assert.match(printableHtml(html, { background: false }), /background:transparent!important/);
});

// ───────── packages

test('packages: the catalogue has real addresses, sizes and checksums', () => {
  assert.deepEqual(PACKAGES.map((p) => p.id), ['prettier', 'jshint', 'htmlhint']);
  for (const pkg of PACKAGES) {
    assert.ok(pkg.ko && pkg.en && pkg.version && pkg.globals.length);
    for (const file of pkg.files) {
      assert.match(file.sha256, /^[0-9a-f]{64}$/);
      assert.ok(file.size > 1000);
      assert.deepEqual(fileUrls(file), [`https://cdn.jsdelivr.net/npm/${file.path}`, `https://unpkg.com/${file.path}`]);
    }
  }
  assert.equal(packageSize(PACKAGES[0]), PACKAGES[0].files.reduce((a, f) => a + f.size, 0));
  assert.equal(fileUrls(PACKAGES[1].files[0], 'http://127.0.0.1:9/x')[0], `http://127.0.0.1:9/x/${PACKAGES[1].files[0].path}`);
  assert.equal(formatSize(2 * 1048576), '2.0 MB');
  assert.equal(packageState(PACKAGES[0], null), 'missing');
  assert.equal(packageState(PACKAGES[0], { version: '0', files: [] }), 'outdated');
  assert.equal(packageState(PACKAGES[0], { version: PACKAGES[0].version, files: PACKAGES[0].files.map((f) => f.name) }), 'installed');
  assert.equal(packageProgress(PACKAGES[0], { 'standalone.js': 1e12 }), PACKAGES[0].files[0].size / packageSize(PACKAGES[0]));
});

/** A test package of two files and a fetch that serves them (slowly, or broken, as asked). */
async function fixture({ broken = new Set(), failFirst = false, slow = false } = {}) {
  const bodies = { 'one.js': 'globalThis.ONE = 1;', 'two.js': 'globalThis.TWO = 2;'.repeat(2000) };
  const files = [];
  for (const [name, text] of Object.entries(bodies)) files.push({ name, path: `t@1/${name}`, size: new TextEncoder().encode(text).length, sha256: await sha256Hex(new TextEncoder().encode(text)) });
  const pkg = { id: 'test', name: 'Test', version: '1.0.0', globals: ['ONE', 'TWO'], files };
  const calls = [];
  const fetchImpl = async (url, { signal } = {}) => {
    calls.push(url);
    const name = url.split('/').pop();
    if (failFirst && url.includes('jsdelivr')) return new Response('nope', { status: 503 });
    let text = bodies[name];
    if (broken.has(name)) text = `${text}// changed`;
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream({
      async pull(controller) {
        for (let i = 0; i < bytes.length; i += 4096) {
          if (signal?.aborted) { controller.error(new DOMException('aborted', 'AbortError')); return; }
          controller.enqueue(bytes.slice(i, i + 4096));
          if (slow) await new Promise((r) => setTimeout(r, 15));
        }
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  };
  const kept = new Map();
  const store = { get: async (k) => kept.get(k), set: async (k, v) => { kept.set(k, v); }, delete: async (k) => { kept.delete(k); } };
  const storage = new MemoryStorage();
  const changes = [];
  const manager = new PackageManager({ storage, fetchImpl, store, lookup: (id) => (id === 'test' ? pkg : null), onChange: () => changes.push(readPackageStates(storage).test?.phase) });
  return { pkg, manager, kept, storage, calls, changes };
}

test('packages: a download keeps every file after its checksum matched, with progress on the way', async () => {
  const { pkg, manager, kept, storage, changes } = await fixture();
  const outcome = await manager.install(['test', 'nothing']);
  assert.deepEqual(outcome, { ok: ['test'], failed: [], cancelled: false });
  assert.equal(kept.get('pkgfile:test:one.js'), 'globalThis.ONE = 1;');
  assert.deepEqual(kept.get('pkg:test').files, ['one.js', 'two.js']);
  const saved = readPackageStates(storage).test;
  assert.equal(saved.phase, 'done');
  assert.equal(saved.installed, '1.0.0');
  assert.equal(saved.received, packageSize(pkg));
  assert.ok(changes.includes('download'));
  assert.equal(manager.busy, false);
});

test('packages: the second address is used when the first fails; a wrong checksum is a failure that can be retried', async () => {
  const mirror = await fixture({ failFirst: true });
  assert.deepEqual((await mirror.manager.install(['test'])).ok, ['test']);
  assert.ok(mirror.calls.some((u) => u.startsWith('https://unpkg.com/')));

  const bad = await fixture({ broken: new Set(['two.js']) });
  const first = await bad.manager.install(['test']);
  assert.deepEqual(first.failed, ['test']);
  const state = readPackageStates(bad.storage).test;
  assert.equal(state.phase, 'failed');
  assert.match(state.error, /checksum/);
  assert.equal(bad.kept.has('pkg:test'), false, 'nothing is kept from a failed download');
  // Retry with a good server.
  const good = await fixture();
  good.kept = bad.kept;
  const retry = new PackageManager({ storage: bad.storage, fetchImpl: (u, o) => (good.manager.fetchImpl(u, o)), store: { get: async (k) => bad.kept.get(k), set: async (k, v) => { bad.kept.set(k, v); }, delete: async () => {} }, lookup: () => good.pkg });
  assert.deepEqual((await retry.install(['test'])).ok, ['test']);
  assert.equal(readPackageStates(bad.storage).test.phase, 'done');
  assert.equal(readPackageStates(bad.storage).test.error, null);
});

test('packages: a download can be cancelled, then started again', async () => {
  const { manager, storage, kept } = await fixture({ slow: true });
  const running = manager.install(['test']);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(manager.busy, true);
  manager.cancel();
  const outcome = await running;
  assert.equal(outcome.cancelled, true);
  assert.equal(readPackageStates(storage).test.phase, 'cancelled');
  assert.equal(kept.has('pkg:test'), false);
  const again = await manager.install(['test']);
  assert.deepEqual(again.ok, ['test']);
  await manager.remove('test');
  assert.equal(kept.size, 0);
  assert.equal(readPackageStates(storage).test.installed, null);
});

test('packages: the view a window draws from the shared state', () => {
  const storage = new MemoryStorage();
  storage.setItem('myhomemaker.packages.v1', JSON.stringify({ prettier: { phase: 'download', received: 10, total: 100, installed: null } }));
  assert.deepEqual(packageView('prettier', storage), { phase: 'download', received: 10, total: 100, error: null, installed: null, state: 'missing' });
  assert.equal(packageView('jshint', storage).phase, 'idle');
});

test('settings: packages download by themselves unless turned off', () => {
  assert.equal(defaultSettings('ko').autoDownloadPackages, true);
  const storage = new MemoryStorage();
  storage.setItem('myhomemaker.settings.v1', JSON.stringify({ autoDownloadPackages: false }));
  assert.equal(loadSettings(storage).autoDownloadPackages, false);
});

// ───────── code editor

test('code: languages by file name', () => {
  assert.equal(languageOf('index.HTML'), 'html');
  assert.equal(languageOf('a/b/style.css'), 'css');
  assert.equal(languageOf('app.mjs'), 'js');
  assert.equal(languageOf('data.json'), 'json');
  assert.equal(languageOf('notes'), 'text');
  assert.equal(isCodeFileName('x.js'), true);
  assert.equal(isCodeFileName('site.myhome'), false);
});

test('code: colours never change the text, in every language, with tricky input', () => {
  const samples = {
    html: '<!doctype html>\n<html lang="ko"><head><style>a { color: #f00; }\n.x:hover{margin:0 2px}</style>\n<script>const a = "x<y"; f(1); // hi\n</script></head><body class=\'a\'>&amp; <p>t &lt; 3</p><!-- c --><img src=x alt=\'\'>  <unclosed',
    css: '@media (max-width: 600px) { .a > b:hover { --x: 1px; color: red !important; content: "}" } } /* open',
    js: 'const s = `a${b}`; function f(x) { return x / 2 > 1 ? \'y\' : null; } /* c */ // end\nlet n = 0x1F + 1e3; "open',
    json: '{"a": [1, true, null, "s\\"q"], "b": {}}',
    text: '<b> & </b>',
  };
  for (const [language, text] of Object.entries(samples)) assert.equal(plainOf(highlight(text, language)), text, language);
  assert.match(highlight('const a = 1;', 'js'), /<span class="tk-keyword">const<\/span>/);
  assert.match(highlight('a { color: red; }', 'css'), /<span class="tk-property">color<\/span>/);
  assert.match(highlight('<p class="x">', 'html'), /<span class="tk-tag">p<\/span> <span class="tk-attr">class<\/span>/);
  assert.match(highlight('<style>a{color:red}</style>', 'html'), /tk-property">color/);
  assert.ok(!/<script>/.test(highlight('<script>x</script>', 'html')), 'tags are escaped');
});

test('code: line and column, comments, find', () => {
  const text = 'one\ntwo\nthree';
  assert.deepEqual(lineColumn(text, 5), { line: 2, column: 2 });
  assert.equal(lineOffset(text, 3), 8);
  assert.equal(lineOffset(text, 9), text.length);
  const on = toggleComment('a\n  b\nc', 0, 4, 'js');
  assert.equal(on.text, '// a\n  // b\nc');
  assert.equal(toggleComment(on.text, on.start, on.end, 'js').text, 'a\n  b\nc');
  assert.equal(toggleComment('a{}', 0, 0, 'css').text, '/* a{} */');
  assert.equal(toggleComment('/* a{} */', 0, 0, 'css').text, 'a{}');
  assert.equal(toggleComment('<p>', 0, 0, 'html').text, '<!-- <p> -->');
  assert.equal(toggleComment('x', 0, 0, 'json').text, 'x');
  assert.deepEqual(findAll('Aa aA', 'a'), [{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 3, end: 4 }, { start: 4, end: 5 }]);
  assert.equal(findAll('Aa aA', 'a', { caseSensitive: true }).length, 2);
  assert.equal(findAll('a1 b22', '\\d+', { regex: true }).length, 2);
  assert.deepEqual(findAll('x', '(', { regex: true }), []);
  assert.deepEqual(findAll('x.y', '.'), [{ start: 1, end: 2 }]);
});

test('code: checks without packages (JSON, CSS) and with them (fake JSHint, HTMLHint, Prettier)', async () => {
  assert.deepEqual(checkJson('{"a": 1}'), []);
  const json = checkJson('{\n  "a": 1,\n}');
  assert.equal(json.length, 1);
  assert.equal(json[0].severity, 'error');
  assert.ok(json[0].line >= 2);
  assert.deepEqual(checkCss('a { color: red; } /* ok */'), []);
  const css = checkCss('a {\n  color: red;\n\nb { }\n}\n}');
  assert.deepEqual(css.map((p) => [p.line, p.rule]), [[6, 'css-brace']]);
  assert.equal(checkCss('a { content: "x }').length >= 1, true);
  assert.equal(checkCss('/* open').at(0).rule, 'css-comment');

  const JSHINT = (text) => { JSHINT.errors = text.includes('foo(') ? [{ line: 2, character: 5, reason: 'Unmatched (', code: 'E019' }, { line: 1, character: 10, reason: 'Missing semicolon.', code: 'W033' }, null] : []; };
  const js = checkCode({ JSHINT }, 'var a = 1\nfoo(', 'js');
  assert.equal(js.tool, 'JSHint');
  assert.deepEqual(js.items.map((p) => [p.line, p.column, p.severity]), [[1, 10, 'warning'], [2, 5, 'error']]);
  const HTMLHint = { verify: () => [{ type: 'error', message: 'Tag must be paired', line: 3, col: 2, rule: { id: 'tag-pair' } }] };
  assert.deepEqual(checkCode({ HTMLHint }, '<div>', 'html').items[0], { line: 3, column: 2, severity: 'error', message: 'Tag must be paired', rule: 'tag-pair' });
  assert.throws(() => checkCode({}, 'x', 'js'), /JSHint/);

  const seen = [];
  const prettier = { format: async (text, options) => { seen.push(options); return `${text.trim()}\n`; } };
  assert.equal(await formatCode({ prettier, prettierPlugins: { a: 1, b: 2 } }, ' x ', 'js'), 'x\n');
  assert.equal(seen[0].parser, PARSERS.js);
  assert.deepEqual(seen[0].plugins, [1, 2]);
  await assert.rejects(() => formatCode({}, 'x', 'css'), /Prettier/);
  await assert.rejects(() => formatCode({ prettier }, 'x', 'text'), /no formatter/);
});

test('code: messages between the windows go through queues and are taken once', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readQueue('q', storage), []);
  assert.equal(pushQueue('q', { type: 'a' }, storage), true);
  pushQueue('q', { type: 'b' }, storage);
  const list = drainQueue('q', storage);
  assert.deepEqual(list.map((m) => m.type), ['a', 'b']);
  assert.ok(list.every((m) => m.id));
  assert.deepEqual(drainQueue('q', storage), []);
  storage.setItem('q', '{broken');
  assert.deepEqual(readQueue('q', storage), []);
  const full = { getItem: () => '[]', setItem: () => { throw new Error('quota'); } };
  assert.equal(pushQueue('q', { type: 'big' }, full), false);
});

test('site code: CSS after the design, JavaScript at the end of every page, HTML in every head; old files open without it', () => {
  const site = S.createSite({ L: 'ko' });
  assert.deepEqual(site.code, { css: '', js: '', head: '' });
  assert.equal(siteStyles(site), siteCss(site.design));
  site.code = { css: 'h1 { color: red; }', js: 'console.log("</script>")', head: '<meta name="x" content="y">' };
  const styles = siteStyles(site);
  assert.ok(styles.startsWith(siteCss(site.design)));
  assert.ok(styles.trimEnd().endsWith('h1 { color: red; }'));
  const single = singlePageHtml(site, site.pages[0]);
  assert.ok(single.includes('<meta name="x" content="y">\n</head>'));
  assert.ok(single.includes(`<script>\n${inlineScript(site.code.js)}\n</script>\n</body>`));
  assert.ok(!single.includes('log("</script>")'));
  const linked = pageHtml(site, site.pages[0], { css: 'style.css' });
  assert.ok(linked.includes('<script src="script.js"></script>'));
  const files = siteFiles(site);
  assert.equal(files.find((f) => f.path === 'script.js').data, `${site.code.js}\n`);
  assert.ok(files.find((f) => f.path === 'style.css').data.includes('h1 { color: red; }'));
  // A site saved before: no code, and no script.js is written.
  const old = JSON.parse(S.serializeSite(S.createSite({ L: 'en' })));
  delete old.code;
  const opened = S.parseSite(JSON.stringify(old));
  assert.deepEqual(opened.code, { css: '', js: '', head: '' });
  assert.equal(siteFiles(opened).some((f) => f.path === 'script.js'), false);
  assert.deepEqual(S.normalizeSite({ ...old, code: { css: 1, js: 'x', extra: 'y' } }).code, { css: '', js: 'x', head: '' });
});
