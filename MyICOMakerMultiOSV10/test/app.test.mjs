import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ko from '../src/i18n/ko.js';
import en from '../src/i18n/en.js';
import { t, setLanguage } from '../src/i18n.js';
import { ALL_SHAPE_IDS, SHAPE_CATEGORIES } from '../src/lib/shapes.js';
import { TEMPLATES } from '../src/lib/templates.js';
import { ANIMATIONS, DEFAULTS, applyInstallLanguage, loadSettings, resetForNewInstall, saveSettings } from '../src/lib/settings.js';
import { THEMES, THEME_KEYS, applyTheme, customTheme, themeById } from '../src/lib/themes.js';
import { DEFAULT_PRINT, contentBox, layoutItems, normalizePrint, pageSize, PAPERS } from '../src/lib/printLayout.js';
import { gridSteps } from '../src/lib/iconCanvas.js';
import { autoArrange, cardsOf, overlaps, place } from '../src/start/startlayout.js';
import { START_CARD_SPAN } from '../src/start/startboard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function sources(dir = path.join(root, 'src')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

test('Korean and English have the same keys', () => {
  assert.deepEqual(Object.keys(ko).filter((k) => !(k in en)), [], 'missing in English');
  assert.deepEqual(Object.keys(en).filter((k) => !(k in ko)), [], 'missing in Korean');
});

test('every text the program asks for exists', () => {
  const used = new Set();
  for (const file of sources()) {
    if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
    const text = fs.readFileSync(file, 'utf8');
    // t('key'), t(cond ? 'a' : 'b') and friends: every quoted dotted key inside a t( … ) call.
    for (const call of text.matchAll(/\bt\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      for (const m of call[1].matchAll(/'([a-z][A-Za-z0-9]*\.[A-Za-z0-9.]+)'/g)) used.add(m[1]);
    }
  }
  // Keys built from lists.
  for (const id of ALL_SHAPE_IDS) used.add(`shape.${id}`);
  for (const c of SHAPE_CATEGORIES) used.add(`shapeCat.${c.id}`);
  for (const tpl of TEMPLATES) { used.add(`template.${tpl.id}`); used.add(`template.${tpl.id}.desc`); }
  for (const kind of ANIMATIONS) used.add(`animation.${kind}`);
  for (const id of ['select', 'hand', 'rect', 'roundRect', 'ellipse', 'line', 'arrowLine', 'poly', 'pen', 'brush', 'text', 'eyedropper', 'bucket', 'eraser']) { used.add(`tool.${id}`); used.add(`tip.${id}`); }
  for (const id of ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']) used.add(`align.${id}`);
  for (const id of ['sizes', 'large', 'sheet']) { used.add(`print.layout.${id}`); used.add(`print.layout.${id}.tip`); }
  for (const k of THEME_KEYS.filter((x) => x !== 'shadow')) used.add(`theme.key.${k}`);
  for (const id of ['general', 'theme', 'canvas']) used.add(`settings.tab.${id}`);
  for (const id of ['none', 'narrow', 'normal', 'wide', 'top', 'bottom', 'left', 'right']) used.add(`print.margin.${id}`);
  const missing = [...used].filter((k) => !(k in ko) || !(k in en));
  assert.deepEqual(missing, []);
});

test('t fills placeholders and falls back to the key', () => {
  setLanguage('en');
  assert.equal(t('status.objects', { n: 3 }), '3 objects');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLanguage('ko');
  assert.equal(t('status.objects', { n: 3 }), '개체 3개');
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('settings: defaults, damage, an installer reset once per token, the installer language', () => {
  const s = memoryStorage();
  assert.equal(loadSettings(s).theme, DEFAULTS.theme);
  s.setItem('myicomaker.settings', '{broken');
  assert.equal(loadSettings(s).language, 'ko');
  saveSettings({ ...loadSettings(s), theme: 'paper', recent: [{ path: 'x' }], animation: 'nope' }, s);
  assert.equal(loadSettings(s).animation, DEFAULTS.animation, 'unknown backgrounds fall back');
  assert.equal(resetForNewInstall(s, '42'), true);
  assert.equal(loadSettings(s).theme, DEFAULTS.theme, 'preferences reset');
  assert.deepEqual(loadSettings(s).recent, [{ path: 'x' }], 'recent files kept');
  assert.equal(resetForNewInstall(s, '42'), false, 'only once per installation');
  assert.equal(applyInstallLanguage(s, 'en'), true);
  assert.equal(loadSettings(s).language, 'en');
  assert.equal(applyInstallLanguage(s, 'fr'), false);
});

test('forty themes, twenty dark and twenty light, plus a custom theme', () => {
  assert.equal(THEMES.length, 40);
  assert.equal(THEMES.filter((th) => th.dark).length, 20);
  assert.equal(new Set(THEMES.map((th) => th.id)).size, 40, 'unique ids');
  for (const th of THEMES) {
    assert.deepEqual(Object.keys(th.vars), THEME_KEYS, th.id);
    assert.ok(th.name.ko && th.name.en, th.id);
    for (const [k, v] of Object.entries(th.vars)) if (k !== 'shadow') assert.match(v, /^#[0-9a-f]{6}$/, `${th.id}.${k}`);
  }
  assert.equal(themeById('nope').id, THEMES[0].id);
  const custom = customTheme({ base: 'paper', vars: { accent: '#ff0000' } });
  assert.equal(custom.vars.accent, '#ff0000');
  assert.equal(custom.vars.bg, themeById('paper').vars.bg, 'the rest comes from the base theme');
  assert.equal(custom.dark, false);
  assert.equal(themeById('custom', { base: 'midnight', vars: {} }).dark, true);
  const style = new Map();
  const root = { style: { setProperty: (k, v) => style.set(k, v) }, dataset: {} };
  applyTheme('custom', root, { base: 'paper', vars: { canvas: '#123456' } });
  assert.equal(style.get('--canvas'), '#123456', 'the canvas follows the theme');
  assert.ok(style.has('--checker-a') && style.has('--grid') && style.has('--ruler'));
  assert.equal(root.dataset.theme, 'custom');
});

test('the grid divides every major cell 5 × 5 and changes step with the zoom', () => {
  let last = Infinity;
  for (const zoom of [0.2, 0.5, 1, 2, 4, 8]) {
    const { major, minor } = gridSteps(zoom);
    assert.equal(major / minor, 5);
    assert.ok(major * zoom >= 48 || major === 500, `zoom ${zoom}: major lines ${major * zoom}px apart`);
    assert.ok(major <= last, 'zooming in never makes the grid coarser');
    last = major;
  }
  assert.notEqual(gridSteps(1).major, gridSteps(8).major, 'the grid is redrawn finer when zoomed in');
});

test('print layouts stay inside the margins on every paper and orientation', () => {
  for (const paper of [...Object.keys(PAPERS), 'Custom']) {
    for (const orientation of ['portrait', 'landscape']) {
      for (const layout of ['sizes', 'large', 'sheet']) {
        const opts = normalizePrint({ ...DEFAULT_PRINT, paper, orientation, layout, width: 120, height: 180 });
        const box = contentBox(opts);
        const [pw, ph] = pageSize(opts);
        assert.ok(orientation === 'landscape' ? pw >= ph : ph >= pw);
        const items = layoutItems(opts, [16, 24, 32, 48, 64, 128, 256]);
        assert.ok(items.length > 0, `${paper} ${orientation} ${layout}`);
        for (const it of items) {
          assert.ok(it.x >= box.x - 0.01 && it.y >= box.y - 0.01 && it.x + it.size <= box.x + box.w + 0.01 && it.y + it.size <= box.y + box.h + 0.01, `${paper} ${orientation} ${layout}: ${JSON.stringify(it)}`);
        }
      }
    }
  }
  const sizes = layoutItems({ ...DEFAULT_PRINT, magnify: 3 }, [16, 32]);
  assert.deepEqual(sizes.map((it) => it.label), ['16×16', '16×16 ×3', '32×32', '32×32 ×3']);
  const sheet = layoutItems({ ...DEFAULT_PRINT, layout: 'sheet', sheetSize: 40, sheetGap: 5 }, [16]);
  assert.equal(sheet[1].x - sheet[0].x, 45, 'sticker spacing');
  const big = normalizePrint({ copies: 5000, margins: { top: -3 }, paper: 'Nope', layout: 'odd' });
  assert.deepEqual([big.copies, big.margins.top, big.paper, big.layout], [999, 0, 'A4', 'sizes']);
});

test('start screen cards never overlap, also after moving one', () => {
  const ids = Object.keys(START_CARD_SPAN);
  const check = (cards) => {
    const list = Object.values(cards);
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.equal(overlaps(list[i], list[j]), false);
  };
  const first = autoArrange(ids, START_CARD_SPAN, { hero: 6, actions: 10, recent: 10, templates: 12, examples: 14, theme: 8, background: 8 });
  check(first);
  check(place(first, 'recent', { col: 0, row: 0 }));
  check(cardsOf({ version: 1, cards: { hero: { col: 0, row: 0, w: 3, h: 6 } } }, ids, START_CARD_SPAN));
  check(cardsOf({ version: 2, cards: { hero: { col: 0, row: 0, w: 3, h: 6 }, examples: { col: 0, row: 2, w: 3, h: 9 } } }, ids, START_CARD_SPAN));
  assert.ok(ids.includes('examples'), 'the examples card is on the board');
});

test('name and version are the same everywhere', () => {
  const pkg = JSON.parse(read('package.json'));
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  const cargo = read('src-tauri/Cargo.toml');
  assert.equal(pkg.version, '1.0.1');
  assert.equal(pkg.productName, 'MyICOMaker');
  assert.equal(conf.productName, 'MyICOMaker');
  assert.equal(conf.mainBinaryName, 'MyICOMaker');
  assert.equal(conf.version, '../package.json');
  assert.match(cargo, /^version = "1\.0\.1"$/m);
  assert.ok(pkg.scripts.clean && pkg.scripts['clean:all'], 'clean and clean:all');
  assert.deepEqual(conf.bundle.windows.nsis.languages, ['Korean', 'English']);
  assert.equal(conf.bundle.windows.nsis.displayLanguageSelector, true, 'the user picks the installer language');
  const hooks = fs.readFileSync(path.join(root, 'src-tauri/windows/hooks.nsh'));
  assert.deepEqual([...hooks.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'hooks.nsh keeps its UTF-8 BOM (Korean texts)');
  assert.doesNotMatch(hooks.toString('utf8'), /UML|myuml/i);
  assert.match(hooks.toString('utf8'), /MUI_LANGDLL_ALWAYSSHOW/);
  for (const file of ['public/docs/UsersGuide.html', 'public/docs/UsersGuide.en.html', 'public/docs/guide.css', 'public/icon.png', 'src-tauri/icons/icon.ico']) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  assert.match(read('public/docs/UsersGuide.html'), new RegExp(`v${pkg.version.replace(/\./g, '\\.')}`), 'the guide is built for this version');
});
