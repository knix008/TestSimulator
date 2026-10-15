// Print layout, settings, recent files, translations, themes, icons, tools and the viewport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import { defaultPrintOptions, pageSize, pageSvg, paginate, parseScale, scaleLabel, selectContent } from '../../src/domain/print.js';
import { addRecent, MAX_RECENT, removeRecent, loadRecent, storeRecent } from '../../src/domain/recent.js';
import { defaultSettings, loadSettings, normalizeSettings, STORAGE_KEY, storeSettings } from '../../src/domain/settings.js';
import { DICTIONARIES, formatBytes, setLanguage, t } from '../../src/i18n.js';
import { hasIcon, icon, ICON_NAMES } from '../../src/icons.js';
import { contrast, CUSTOM, customTheme, DARK_THEMES, LIGHT_THEMES, nextThemeId, resolveTheme, SYSTEM, THEME_IDS, themeName, themeVariables } from '../../src/themes.js';
import { CROSSHAIR_DASH, GRID_MAX_PX, GRID_MIN_PX, gridStepFor, PX_PER_MM, Viewport } from '../../src/view/renderer.js';
import { createTool, DIM_TOOLS, DRAW_TOOLS, MODIFY_TOOLS, readout, TOOL_ICONS } from '../../src/view/tools.js';
import { CATEGORY_ICONS, PART_KINDS, PARTS } from '../../src/domain/parts.js';
import { ALL_SOLID_KINDS, REVOLVE_AXES, SOLID_KINDS, SOLIDS, solidProperties } from '../../src/domain/solids.js';
import { normalizeEntity } from '../../src/domain/entities.js';
import '../../src/view/partIcons.js';
// The workbench command modules register their own icons.
import '../../src/commands/std.js';
import '../../src/commands/std2.js';
import '../../src/commands/part.js';
import '../../src/commands/partdesign.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data }; };

test('print: paper sizes, scales, ranges', () => {
  assert.deepEqual(pageSize({ paper: 'A4', orientation: 'landscape' }), { width: 297, height: 210 });
  assert.deepEqual(pageSize({ paper: 'A3', orientation: 'portrait' }), { width: 297, height: 420 });
  assert.equal(parseScale('1:2'), 0.5);
  assert.equal(parseScale('5:1'), 5);
  assert.equal(parseScale('fit'), null);
  assert.equal(scaleLabel(0.5), '1:2');
  assert.equal(scaleLabel(2), '2:1');
  const a = createDrawing({ title: 'A' });
  const b = createDrawing({ title: 'B' });
  const keep = addEntity(a, 'line', { x1: 0, y1: 0, x2: 100, y2: 0 });
  addEntity(a, 'circle', { cx: 0, cy: 0, r: 5, layer: 'center' });
  addEntity(b, 'circle', { cx: 0, cy: 0, r: 5 });
  assert.equal(selectContent([a, b], 0, { range: 'all' }).length, 2);
  assert.equal(selectContent([a, b], 1, { range: 'current' })[0].drawing.title, 'B');
  assert.equal(selectContent([a, b], 0, { range: 'custom', layers: ['0'] })[0].entities.length, 1);
  assert.deepEqual(selectContent([a, b], 0, { range: 'custom', selectedOnly: true }, [keep.id])[0].entities.map((e) => e.id), [keep.id]);
});

test('print: fit makes one page per drawing, a fixed scale tiles pages', () => {
  const drawing = createDrawing({ title: '판' });
  addEntity(drawing, 'rect', { x: 0, y: 0, width: 600, height: 300 });
  const options = defaultPrintOptions();
  const fit = paginate(selectContent([drawing], 0, options), options);
  assert.equal(fit.pages.length, 1);
  assert.ok(fit.pages[0].k < 1);
  const real = { ...options, scale: '1:1' };
  const tiles = paginate(selectContent([drawing], 0, real), real);
  assert.ok(tiles.pages.length >= 4, `${tiles.pages.length} tiles`);
  assert.equal(tiles.pages[0].tile.rows * tiles.pages[0].tile.columns, tiles.pages.length);
  assert.equal(tiles.pages.at(-1).number, tiles.pages.length);
  const svg = pageSvg(fit.pages[0], fit, options, { labels: { title: '도명' } });
  assert.match(svg, /width="297mm" height="210mm"/);
  assert.ok(svg.includes('도명') && svg.includes('판'), 'title block with the drawing name');
  const bare = pageSvg(fit.pages[0], fit, { ...options, titleBlock: false, frame: false });
  assert.ok(!bare.includes('도명'));
});

test('settings: defaults, repair of bad values, storage', () => {
  const s = normalizeSettings({ theme: 'nope', transparency: 40, textHeight: -2, snapModes: { endpoint: false, bogus: 1 }, language: 'en' });
  assert.equal(s.theme, 'light');
  assert.equal('transparency' in s, false, 'an old transparency setting is dropped');
  assert.equal(s.textHeight, 1);
  assert.equal(s.snapModes.endpoint, false);
  assert.equal(s.snapModes.midpoint, true);
  assert.equal('bogus' in s.snapModes, false);
  const storage = memory();
  assert.ok(storeSettings(storage, { ...defaultSettings('ko'), gridSize: 25, fontFamily: 'Malgun Gothic' }));
  const back = loadSettings(storage);
  assert.equal(back.gridSize, 25);
  assert.equal(back.fontFamily, 'Malgun Gothic');
  storage.setItem(STORAGE_KEY, '{broken');
  assert.equal(loadSettings(storage).gridSize, 10);
});

test('recent files: newest first, ten at most, no duplicates, remove one or all', () => {
  let list = [];
  for (let i = 0; i < 14; i++) list = addRecent(list, { path: `C:/d/${i}.mcad` });
  assert.equal(list.length, MAX_RECENT);
  assert.equal(list[0].path, 'C:/d/13.mcad');
  list = addRecent(list, { path: 'c:\\d\\9.MCAD' });
  assert.equal(list.length, MAX_RECENT);
  assert.equal(list.filter((item) => item.path.toLowerCase().includes('9.mcad')).length, 1);
  list = removeRecent(list, 'C:/d/13.mcad');
  assert.ok(!list.some((item) => item.path === 'C:/d/13.mcad'));
  const storage = memory();
  storeRecent(storage, list);
  assert.equal(loadRecent(storage).length, list.length);
  storeRecent(storage, []);
  assert.deepEqual(loadRecent(storage), []);
});

test('translations: Korean and English have the same keys and every key the code uses', () => {
  const ko = Object.keys(DICTIONARIES.ko).sort();
  const en = Object.keys(DICTIONARIES.en).sort();
  assert.deepEqual(ko.filter((key) => !en.includes(key)), [], 'missing in English');
  assert.deepEqual(en.filter((key) => !ko.includes(key)), [], 'missing in Korean');
  const sources = ['src/app.js', 'src/popup.js', 'src/view/tools.js', 'src/platform/native.js', 'src/view/view3d.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const used = new Set([...sources.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]));
  for (const m of sources.matchAll(/'((?:op|notice|error|action|prompt|tip|progress|format)\.[a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  // Keys built from ids.
  for (const id of [...DRAW_TOOLS, ...DIM_TOOLS, ...MODIFY_TOOLS, 'place']) used.add(`tool.${id}`);
  for (const kind of PART_KINDS) { used.add(`part.${kind}`); for (const param of PARTS[kind].params) used.add(`param.${param.key}`); }
  for (const type of ['line', 'polyline', 'rect', 'circle', 'arc', 'ellipse', 'polygon', 'text', 'dim', 'part', 'solid']) used.add(`entity.${type}`);
  for (const name of ['file', 'edit', 'view', 'draw', 'modify', 'parts', 'solid', 'help']) used.add(`menu.${name}`);
  // 3D solids: kinds, parameters, features, booleans, formats, axes, placement, coverage, measurements.
  for (const kind of ALL_SOLID_KINDS) { used.add(`solid.${kind}`); for (const param of SOLIDS[kind].params) used.add(`solidParam.${param.key}`); }
  for (const kind of SOLID_KINDS) used.add(`solidTip.${kind}`);
  for (const kind of ['pad', 'revolution', 'loft', 'sweep']) { used.add(`feature.${kind}`); used.add(`featureTip.${kind}`); used.add(`notice.feature.${kind}`); }
  for (const op of ['union', 'cut', 'common']) used.add(`bool.${op}`);
  for (const format of ['3mf', 'amf', 'obj', 'ply', 'off', 'step', 'fcstd']) used.add(`export3d.${format}`);
  for (const axis of REVOLVE_AXES) used.add(`axis.${axis}`);
  for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz']) used.add(`solidPlace.${key}`);
  for (const status of ['full', 'partial', 'none']) used.add(`coverage.${status}`);
  for (const key of Object.keys(solidProperties(normalizeEntity({ type: 'solid', kind: 'box', params: {} })))) used.add(`measure.${key}`);
  for (const view of ['iso', 'top', 'front', 'right']) used.add(`view3d.${view}`);
  for (const id of [...DRAW_TOOLS, ...DIM_TOOLS, ...MODIFY_TOOLS]) {
    if (['select', 'pan'].includes(id)) continue;
    const tool = createTool(id, { options: { sides: 6, offset: 5 }, selection: () => [], drawing: () => createDrawing(), settings: () => defaultSettings(), t: (k) => k, layerFor: () => '0' });
    used.add(tool.prompt());
  }
  for (const key of ['dimLinear', 'dimAligned', 'dimAngle', 'arc', 'ellipse', 'scale']) for (const n of [0, 1, 2]) used.add(`prompt.${key}.${n}`);
  const missing = [...used].filter((key) => !(key in DICTIONARIES.ko) && !key.endsWith('.'));
  assert.deepEqual(missing, [], 'keys used but not translated');
  setLanguage('en');
  assert.equal(t('tabs.untitled', { n: 3 }), 'Drawing 3');
  setLanguage('ko');
  assert.equal(t('tabs.untitled', { n: 3 }), '새 도면 3');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(formatBytes(1536), '1.5 KB');
});

test('themes: 20 dark, 20 light, custom and system; readable accents; canvas colours', () => {
  assert.equal(DARK_THEMES.length, 20);
  assert.equal(LIGHT_THEMES.length, 20);
  assert.ok(THEME_IDS.includes(SYSTEM) && THEME_IDS.includes(CUSTOM));
  for (const theme of [...DARK_THEMES, ...LIGHT_THEMES]) {
    assert.ok(contrast(theme.colors.accentText, theme.colors.accent) >= 3, `${theme.id} accent text readable`);
    assert.ok(contrast(theme.colors.text, theme.colors.canvas) >= 4.5, `${theme.id} ink on canvas readable`);
    assert.ok(theme.colors.grid && theme.colors.gridMajor);
    assert.ok(themeName(theme.id, 'ko') && themeName(theme.id, 'en'));
  }
  assert.equal(resolveTheme(SYSTEM, true).id, 'dark');
  assert.equal(resolveTheme(SYSTEM, false).id, 'light');
  assert.ok(customTheme(null).colors.canvas);
  assert.ok(themeVariables(resolveTheme('nord'))['--canvas']);
  // Cycling goes through every theme and back.
  let id = 'light';
  const seen = new Set();
  for (let i = 0; i < 50 && !seen.has(id); i++) { seen.add(id); id = nextThemeId(id); }
  assert.equal(seen.size, 41);
});

test('icons: every glyph the app references exists', () => {
  const sources = ['src/app.js', 'src/popup.js', 'src/view/tools.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const names = new Set([...sources.matchAll(/icon\('([a-zA-Z0-9]+)'/g)].map((m) => m[1]));
  for (const m of sources.matchAll(/\bicon: '([a-zA-Z0-9]+)'/g)) names.add(m[1]);
  for (const glyph of Object.values(TOOL_ICONS)) names.add(glyph);
  for (const kind of PART_KINDS) { assert.equal(PARTS[kind].icon, `part-${kind}`); names.add(PARTS[kind].icon); }
  for (const glyph of Object.values(CATEGORY_ICONS)) names.add(glyph);
  const missing = [...names].filter((name) => !hasIcon(name));
  assert.deepEqual(missing, []);
  assert.ok(ICON_NAMES.length > 90);
  assert.match(icon('gear'), /^<svg class="icon"/);
});

test('viewport: screen ↔ drawing, zoom about a point, fit', () => {
  const vp = new Viewport({ width: 800, height: 600 });
  assert.deepEqual(vp.toScreen({ x: 0, y: 0 }), { x: 400, y: 300 });
  const p = vp.toWorld(500, 200);
  assert.ok(p.x > 0 && p.y > 0, 'y grows upwards');
  const before = vp.toWorld(100, 100);
  vp.zoomAt(2, 100, 100);
  const after = vp.toWorld(100, 100);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9, 'the point under the cursor stays put');
  vp.fit({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 0);
  assert.equal(vp.cx, 50);
  assert.equal(vp.zoom, 8);
  vp.zoom = PX_PER_MM;
  assert.ok(Math.abs(vp.percent - 100) < 1e-9);
});

/** A minimal tool API on a real drawing. */
function api(drawing, selection = []) {
  const notes = [];
  let doneCalls = 0;
  return {
    notes,
    get doneCount() { return doneCalls; },
    drawing: () => drawing,
    settings: () => defaultSettings(),
    options: { sides: 6, offset: 5, mirrorKeep: true },
    t: (key) => key,
    layerFor: (kind) => (kind === 'dim' ? 'dim' : kind === 'center' ? 'center' : drawing.activeLayer),
    add: (type, data) => addEntity(drawing, type, data),
    change: (op, mutate) => mutate(drawing),
    selection: () => selection,
    select: () => {},
    hit: (p, filter) => drawing.entities.filter((e) => !filter || filter(e)).find((e) => e.type === 'circle' && Math.abs(Math.hypot(p.x - e.cx, p.y - e.cy) - e.r) < 1) ?? null,
    notify: (kind, key) => notes.push(key),
    measured: (info) => notes.push(info),
    setOption(key, value) { this.options[key] = value; },
    focusProperty: () => {},
    done: () => { doneCalls += 1; },
  };
}

test('drawing tools build entities from clicks and typed coordinates', () => {
  const drawing = createDrawing();
  const a = api(drawing);
  const line = createTool('line', a);
  line.click({ x: 0, y: 0 });
  line.typed('@50,0');
  line.typed('@0<90');
  assert.equal(drawing.entities.filter((e) => e.type === 'line').length, 1, '@0<90 is a zero-length step and adds nothing');
  line.typed('@0,20');
  assert.equal(drawing.entities.length, 2);
  assert.ok(line.finish());
  const rect = createTool('rect', a);
  rect.click({ x: 0, y: 0 });
  assert.ok(rect.preview({ x: 10, y: 10 }).previews.length);
  rect.typed('@40,20');
  const r = drawing.entities.at(-1);
  assert.equal(r.type, 'rect');
  assert.equal(r.width, 40);
  const circle = createTool('circle', a);
  circle.click({ x: 5, y: 5 });
  circle.typed('10');
  assert.equal(drawing.entities.at(-1).r, 10);
  const poly = createTool('polyline', a);
  for (const p of [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]) poly.click(p, { tolerance: 0.5 });
  poly.click({ x: 0.1, y: 0.1 }, { tolerance: 0.5 });
  assert.equal(drawing.entities.at(-1).closed, true, 'clicking the first point closes it');
  const polygon = createTool('polygon', a);
  polygon.click({ x: 0, y: 0 });
  polygon.click({ x: 10, y: 0 });
  assert.equal(drawing.entities.at(-1).sides, 6);
  const arc = createTool('arc', a);
  for (const p of [{ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }]) arc.click(p);
  assert.equal(drawing.entities.at(-1).type, 'arc');
  const dim = createTool('dimLinear', a);
  for (const p of [{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: 20, y: 30 }]) dim.click(p);
  assert.equal(drawing.entities.at(-1).kind, 'horizontal');
  assert.equal(drawing.entities.at(-1).layer, 'dim');
  const vertical = createTool('dimLinear', a);
  for (const p of [{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: 60, y: 5 }]) vertical.click(p);
  assert.equal(drawing.entities.at(-1).kind, 'vertical');
  const center = createTool('centerline', a);
  center.click({ x: 0, y: 0 });
  center.click({ x: 0, y: 50 });
  assert.equal(drawing.entities.at(-1).lineType, 'center');
  const radius = createTool('dimRadius', a);
  radius.click({ x: 15, y: 5 });
  radius.click({ x: 30, y: 30 });
  assert.equal(drawing.entities.at(-1).kind, 'radius');
  assert.equal(readout({ length: 12.5, angle: 450 }), 'L 12.5 mm  ∠ 90°');
});

test('modify tools: move, copy, rotate (typed angle), scale (typed factor), mirror, offset', () => {
  const drawing = createDrawing();
  const box = addEntity(drawing, 'rect', { x: 0, y: 0, width: 10, height: 10 });
  const a = api(drawing, [box.id]);
  const move = createTool('move', a);
  move.click({ x: 0, y: 0 });
  move.typed('@5,5');
  assert.equal(drawing.entities[0].x, 5);
  assert.equal(a.doneCount, 1);
  const copy = createTool('copy', a);
  copy.click({ x: 0, y: 0 });
  copy.click({ x: 20, y: 0 });
  copy.click({ x: 40, y: 0 });
  assert.equal(drawing.entities.length, 3, 'copy repeats');
  const rotate = createTool('rotate', a);
  rotate.click({ x: 5, y: 5 });
  assert.ok(rotate.typed('90'));
  assert.equal(drawing.entities[0].angle, 90);
  const scale = createTool('scale', a);
  scale.click({ x: 5, y: 5 });
  assert.ok(scale.typed('2'));
  assert.equal(drawing.entities[0].width, 20);
  const mirror = createTool('mirror', a);
  mirror.click({ x: -100, y: 0 });
  mirror.click({ x: -100, y: 10 });
  assert.equal(drawing.entities.length, 4, 'mirror keeps the original by default');
  const circleDrawing = createDrawing();
  addEntity(circleDrawing, 'circle', { cx: 0, cy: 0, r: 10 });
  const b = api(circleDrawing);
  const offset = createTool('offset', b);
  assert.ok(offset.typed('3'));
  assert.equal(b.options.offset, 3);
  offset.click({ x: 10, y: 0 });
  offset.click({ x: 30, y: 0 });
  assert.equal(circleDrawing.entities.at(-1).r, 13);
  const empty = api(createDrawing(), []);
  createTool('move', empty).click({ x: 0, y: 0 });
  assert.deepEqual(empty.notes, ['notice.selectFirst']);
});

test('measure and place-part tools', () => {
  const drawing = createDrawing();
  const a = api(drawing);
  const measure = createTool('measure', a);
  measure.click({ x: 0, y: 0 });
  measure.click({ x: 3, y: 4 });
  assert.equal(a.notes[0].distance, 5);
  assert.equal(drawing.entities.length, 0, 'measuring adds nothing');
  const place = createTool('place', a, { part: { kind: 'nut', params: { size: 12 } } });
  assert.equal(place.preview({ x: 1, y: 1 }).previews[0].kind, 'nut');
  place.click({ x: 50, y: 50 });
  assert.equal(drawing.entities[0].params.size, 12);
  assert.equal(a.doneCount, 1);
});

test('rulers: "nice" tick spacing; 3D thickness and ruler settings', async () => {
  const { niceStep, RULER } = await import('../../src/view/renderer.js');
  assert.equal(niceStep(7), 10);
  assert.equal(niceStep(13), 20);
  assert.equal(niceStep(0.3), 0.5);
  assert.equal(niceStep(51), 100);
  assert.ok(RULER >= 16);
  const s = normalizeSettings({ extrudeHeight: -4, showRulers: 'yes' });
  assert.equal(s.extrudeHeight, 0.1);
  assert.equal(s.showRulers, true);
  assert.equal(defaultSettings().extrudeHeight, 10);
});

test('grid: a minor cell is always 10–50 px on screen, major lines every 5 (5 × 5 cells at every zoom); dashed cross-hair', () => {
  for (const size of [1, 10, 25]) {
    for (let zoom = 0.0005; zoom < 5000; zoom *= 1.37) {
      const step = gridStepFor(size, zoom);
      assert.ok(step * zoom >= GRID_MIN_PX && step * zoom < GRID_MAX_PX, `size ${size} zoom ${zoom}: ${step * zoom}px`);
      const power = Math.log(step / size) / Math.log(5);
      assert.ok(Math.abs(power - Math.round(power)) < 1e-9, 'grid size × 5ⁿ, so the cells nest 5 × 5');
    }
  }
  assert.ok(CROSSHAIR_DASH.length >= 2 && CROSSHAIR_DASH.every((v) => v > 0));
});

test('save options: off by default, repaired from bad values; a compact .mcad has no line breaks and reads back the same', async () => {
  assert.deepEqual(normalizeSettings({}).saveOptions, { backup: false, compact: false, reveal: false });
  assert.deepEqual(normalizeSettings({ saveOptions: { backup: 1, compact: 'yes', reveal: null, other: true } }).saveOptions, { backup: true, compact: true, reveal: false });
  const { serialize, parseFile } = await import('../../src/domain/format.js');
  const { createDrawing, addEntity } = await import('../../src/domain/drawing.js');
  const d = createDrawing({ title: 'Plan' });
  addEntity(d, 'line', { x1: 0, y1: 0, x2: 10, y2: 5 });
  const compact = serialize(d, { compact: true });
  const normal = serialize(d);
  assert.equal(compact.trimEnd().split('\n').length, 1);
  assert.ok(normal.split('\n').length > 10 && compact.length < normal.length);
  assert.deepEqual(parseFile(compact).entities, parseFile(normal).entities);
});
