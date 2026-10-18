// A diagram's own background (meta.js BACKGROUND_FIELDS, render/notation.js
// diagramBackground / backgroundLayers): colour, picture (fill, fit, tile,
// centre, stretch) or pattern (ten kinds, ink colour, size), every layer with
// its own opacity; in the SVG export, printing (with its "print the
// background" option) and the controls; the transparent export still wins;
// saved in .myuml and .mdj, left out of XMI, documents and new diagrams.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import { BACKGROUND_FIELDS, DIAGRAM_BG_PATTERNS, DIAGRAM_TYPES, fieldsOf } from '../../src/domain/meta.js';
import { normalizeBackground, parseProject, serialize } from '../../src/domain/format.js';
import { exportMdj, importMdj } from '../../src/domain/interop/staruml.js';
import { exportXmi } from '../../src/domain/interop/xmi.js';
import { compareModels } from '../../src/domain/diff.js';
import { htmlDocs } from '../../src/domain/docs.js';
import { BG_PATTERN_TILES, backgroundLayers, createRenderContext, diagramBackground, DIAGRAM_THEMES, renderDiagramSvg } from '../../src/render/notation.js';
import { renderPrintSheets } from '../../src/print/render.js';
import { BACKGROUND_IMAGE_MAX, encodeBmp, fitWithin } from '../../src/export/image-encode.js';
import { backgroundControlsHtml, backgroundValue, BG_KEYS } from '../../src/ui/diagram-background.js';
import ko from '../../src/i18n/ko.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function sample(fields = {}, type = 'UMLClassDiagram') {
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  const diagram = M.addDiagram(project, project.ownedElements[0]._id, type);
  const cls = M.addElement(project, project.ownedElements[0]._id, 'UMLClass', { name: 'Order' });
  M.showElement(project, diagram, cls._id, { x: 40, y: 40 });
  Object.assign(diagram, fields);
  return { project, diagram };
}
const svgOf = (fields, options = {}) => { const { project, diagram } = sample(fields); return renderDiagramSvg(project, diagram, options).svg; };

test('every diagram type has the background fields; a new or existing diagram has none and draws as before', () => {
  for (const type of Object.keys(DIAGRAM_TYPES)) {
    const keys = fieldsOf(type).map((f) => f.key);
    for (const key of BG_KEYS) assert.ok(keys.includes(key), `${type} accepts ${key}`);
    const { project, diagram } = sample({}, type);
    for (const key of BG_KEYS) assert.equal(diagram[key], undefined, `${type}: a new diagram has no ${key}`);
    const { svg } = renderDiagramSvg(project, diagram);
    assert.ok(!svg.includes('diagram-background'), `${type}: no background layers without a background`);
  }
  // The scheme's background, exactly as before (one rect after the defs).
  assert.match(svgOf({}), /<\/defs><rect x="-?\d+" y="-?\d+" width="\d+" height="\d+" fill="#ffffff"\/>/);
  assert.match(svgOf({}, { theme: 'dark' }), /<\/defs><rect [^>]*fill="#1e1f24"\/>/);
  assert.equal(diagramBackground({}), null);
  assert.equal(diagramBackground({ backgroundKind: '', backgroundColor: '#ff0000' }), null, "kind '' is the scheme's background");
});

test('a colour background replaces the scheme background of that diagram only, with its opacity', () => {
  const svg = svgOf({ backgroundKind: 'color', backgroundColor: '#123456' });
  assert.match(svg, /<g class="diagram-background"[^>]*><rect [^>]*fill="#123456"\/><\/g>/);
  assert.ok(!svg.includes('fill="#ffffff"/>'), 'the scheme background rect is gone');
  assert.match(svgOf({ backgroundKind: 'color', backgroundColor: '#123456', backgroundColorOpacity: 40 }), /fill="#123456" fill-opacity="0.4"/);
  assert.ok(!svgOf({ backgroundKind: 'color', backgroundColor: '#123456', backgroundColorOpacity: 0 }).includes('#123456'), '0 % leaves the colour out (transparent)');
  // Older data without a kind: a colour alone counts.
  assert.match(svgOf({ backgroundColor: '#abcdef' }), /fill="#abcdef"/);
  // Text and line colours stay those of the scheme; hollow arrowheads take the background colour.
  const { project, diagram } = sample({ backgroundKind: 'color', backgroundColor: '#fde2e4' });
  const ctx = createRenderContext({ project, diagram, theme: 'dark' });
  assert.equal(ctx.background, '#fde2e4');
  assert.equal(ctx.palette.line, DIAGRAM_THEMES.dark.line);
  // No colour chosen: the scheme's colour under a pattern or a picture.
  assert.equal(diagramBackground({ backgroundKind: 'pattern' }, DIAGRAM_THEMES.blueprint).color, DIAGRAM_THEMES.blueprint.background);
});

test('pictures: fill, fit, stretch, centre and tile, with the picture opacity', () => {
  const base = { backgroundKind: 'image', backgroundImage: PNG, backgroundImageWidth: 300, backgroundImageHeight: 200 };
  assert.match(svgOf(base), /<image href="data:image\/png;base64,[^"]+" x="[-\d.]+" y="[-\d.]+" width="[\d.]+" height="[\d.]+" preserveAspectRatio="xMidYMid slice"\/>/, 'fill is the default');
  assert.match(svgOf({ ...base, backgroundFit: 'fit' }), /preserveAspectRatio="xMidYMid meet"/);
  assert.match(svgOf({ ...base, backgroundFit: 'stretch' }), /preserveAspectRatio="none"/);
  const centre = svgOf({ ...base, backgroundFit: 'center' });
  assert.match(centre, /<svg x="[-\d.]+" y="[-\d.]+" width="[\d.]+" height="[\d.]+" overflow="hidden"><image href="data:[^"]+" x="[-\d.]+" y="[-\d.]+" width="300" height="200"\/><\/svg>/);
  const { project, diagram } = sample({ ...base, backgroundFit: 'tile' });
  const tiled = renderDiagramSvg(project, diagram).svg;
  assert.match(tiled, new RegExp(`<pattern id="bg-${diagram._id.replace(/[^\w-]/g, '_')}-img" patternUnits="userSpaceOnUse" x="0" y="0" width="300" height="200"><image href="data:image/png`));
  assert.match(tiled, /fill="url\(#bg-[\w-]+-img\)"/);
  assert.match(svgOf({ ...base, backgroundOpacity: 35 }), /preserveAspectRatio="xMidYMid slice" opacity="0.35"\/>/);
  assert.match(svgOf({ ...base, backgroundFit: 'tile', backgroundOpacity: 50 }), /fill="url\(#bg-[\w-]+-img\)" opacity="0.5"/);
  assert.ok(!svgOf({ ...base, backgroundOpacity: 0 }).includes('<image'), '0 % leaves the picture out');
  // The colour under the picture has its own opacity.
  assert.match(svgOf({ ...base, backgroundColor: '#ffeecc', backgroundColorOpacity: 60 }), /fill="#ffeecc" fill-opacity="0.6"\/><image /);
  // A picture kind without a picture: just the colour.
  assert.ok(!svgOf({ backgroundKind: 'image' }).includes('<image'));
});

test('every pattern kind draws as an SVG <pattern> in the chosen ink colour, size and opacity', () => {
  assert.ok(DIAGRAM_BG_PATTERNS.length >= 8);
  for (const pattern of DIAGRAM_BG_PATTERNS) {
    assert.ok(BG_PATTERN_TILES[pattern], `${pattern} has a tile`);
    const svg = svgOf({ backgroundKind: 'pattern', backgroundPattern: pattern, backgroundColor: '#fafafa', backgroundPatternColor: '#3366cc' });
    const tile = /<pattern id="bg-[\w-]+-pat" patternUnits="userSpaceOnUse" x="0" y="0" width="[\d.]+" height="[\d.]+">(.*?)<\/pattern>/.exec(svg);
    assert.ok(tile, `${pattern}: a <pattern>`);
    assert.match(tile[1], /(fill|stroke)="#3366cc"/, `${pattern}: drawn in the pattern colour`);
    assert.match(svg, /fill="#fafafa"\/>/, `${pattern}: over the background colour`);
    assert.match(svg, /fill="url\(#bg-[\w-]+-pat\)"\/>/, `${pattern}: the area is filled with it`);
  }
  assert.match(svgOf({ backgroundKind: 'pattern', backgroundPatternScale: 200 }), /patternTransform="scale\(2\)"/);
  assert.match(svgOf({ backgroundKind: 'pattern', backgroundPatternScale: 50 }), /patternTransform="scale\(0.5\)"/);
  assert.ok(!svgOf({ backgroundKind: 'pattern' }).includes('patternTransform'), '100 % needs no transform');
  assert.match(svgOf({ backgroundKind: 'pattern', backgroundPatternOpacity: 30 }), /fill="url\(#bg-[\w-]+-pat\)" opacity="0.3"\/>/);
  assert.ok(!svgOf({ backgroundKind: 'pattern', backgroundPatternOpacity: 0 }).includes('<pattern'), '0 % leaves the pattern out');
  // Default ink: the scheme's soft grid colour.
  assert.equal(diagramBackground({ backgroundKind: 'pattern' }).patternColor, DIAGRAM_THEMES.classic.gridMajor);
  assert.equal(diagramBackground({ backgroundKind: 'pattern', backgroundPattern: 'nonsense' }).pattern, 'dots');
  assert.equal(diagramBackground({ backgroundKind: 'pattern', backgroundPatternScale: 999 }).patternScale, 300);
  // Several drawings in one document keep their pattern ids apart.
  assert.notEqual(backgroundLayers(diagramBackground({ backgroundKind: 'pattern' }), { x: 0, y: 0, w: 9, h: 9 }, { id: 'a' }), backgroundLayers(diagramBackground({ backgroundKind: 'pattern' }), { x: 0, y: 0, w: 9, h: 9 }, { id: 'b' }));
});

test("the export's transparent background option and a fixed colour still win over the diagram's", () => {
  const fields = { backgroundKind: 'pattern', backgroundColor: '#112233' };
  const transparent = svgOf(fields, { background: 'none' });
  assert.ok(!transparent.includes('diagram-background') && !transparent.includes('#112233'));
  assert.match(svgOf(fields, { background: '#ffffff' }), /<\/defs><rect [^>]*fill="#ffffff"\/>/);
});

test('printing: with the background option the diagram background prints, without it the sheet is white', () => {
  const { project } = sample({ backgroundKind: 'color', backgroundColor: '#ffeedd', backgroundColorOpacity: 50 });
  const on = renderPrintSheets(project, { background: true, range: 'all' }).pages[0].svg;
  assert.match(on, /fill="#ffeedd" fill-opacity="0.5"/);
  assert.match(on, /^<svg[^>]*><rect width="100%" height="100%" fill="#ffffff"\/>/, 'transparent parts print over white');
  const off = renderPrintSheets(project, { background: false, range: 'all' }).pages[0].svg;
  assert.ok(!off.includes('#ffeedd') && !off.includes('diagram-background'));
});

const ALL = { backgroundKind: 'pattern', backgroundColor: '#fff8e1', backgroundColorOpacity: 80, backgroundImage: PNG, backgroundImageWidth: 1, backgroundImageHeight: 1, backgroundFit: 'tile', backgroundOpacity: 70, backgroundPattern: 'hexagon', backgroundPatternColor: '#90caf9', backgroundPatternOpacity: 45, backgroundPatternScale: 150 };

test('.myuml and StarUML .mdj keep every background field; XMI leaves them out', () => {
  const { project, diagram } = sample(ALL);
  const back = parseProject(serialize(project)).project;
  const read = M.findById(back, diagram._id);
  for (const [key, value] of Object.entries(ALL)) assert.deepEqual(read[key], value, `.myuml ${key}`);
  const mdj = importMdj(exportMdj(project));
  const fromMdj = M.findById(mdj, diagram._id);
  for (const [key, value] of Object.entries(ALL)) assert.deepEqual(fromMdj[key], value, `.mdj ${key}`);
  assert.equal(renderDiagramSvg(mdj, fromMdj).svg.includes('hexagon') || renderDiagramSvg(mdj, fromMdj).svg.includes('-pat'), true, 'drawn after the round trip');
  const xmi = exportXmi(project);
  assert.ok(!/background(Kind|Image|Pattern)/.test(xmi), 'XMI has no background fields');
});

test('reading repairs background fields: ranges, kinds, only data: pictures', () => {
  const d = normalizeBackground({ backgroundKind: 'video', backgroundFit: 'cover', backgroundPattern: 'stars', backgroundColorOpacity: 180, backgroundOpacity: -5, backgroundPatternScale: 10, backgroundImage: 'https://example.com/x.png', backgroundColor: '"><script>' });
  assert.equal(d.backgroundKind, undefined);
  assert.equal(d.backgroundFit, undefined);
  assert.equal(d.backgroundPattern, undefined);
  assert.equal(d.backgroundColorOpacity, 100);
  assert.equal(d.backgroundOpacity, 0);
  assert.equal(d.backgroundPatternScale, 50);
  assert.equal(d.backgroundImage, undefined, 'no pictures from the network');
  assert.equal(d.backgroundColor, undefined);
  const { project, diagram } = sample({ backgroundKind: 'image', backgroundImage: PNG, backgroundOpacity: '40' });
  const read = M.findById(parseProject(serialize(project)).project, diagram._id);
  assert.equal(read.backgroundOpacity, 40);
  assert.equal(read.backgroundImage, PNG);
});

test('baselines and comparing list a background change as a diagram field change (pictures shortened)', () => {
  const { project, diagram } = sample({});
  const before = JSON.parse(JSON.stringify(project));
  Object.assign(diagram, { backgroundKind: 'image', backgroundImage: `data:image/png;base64,${'A'.repeat(4000)}` });
  const diff = compareModels(before, project);
  const item = diff.items.find((i) => i.id === diagram._id);
  assert.equal(item?.category, 'diagram');
  assert.deepEqual(item.changes.map((c) => c.field).sort(), ['backgroundImage', 'backgroundKind']);
  const picture = item.changes.find((c) => c.field === 'backgroundImage').after;
  assert.ok(picture.length < 80 && picture.startsWith('data:image/png;base64,'), picture);
});

test('documents leave the background fields out of the property tables but draw the background', () => {
  const { project } = sample({ backgroundKind: 'color', backgroundColor: '#e3f2fd' });
  const html = htmlDocs(project, { language: 'en', renderDiagram: (d) => renderDiagramSvg(project, d).svg });
  assert.ok(!/Background (kind|colour)/.test(html), 'no background rows');
  assert.ok(html.includes('#e3f2fd'), 'the picture has the background');
});

test('controls: kinds, colours, pictures, patterns and every opacity, in both languages', () => {
  const t = (key) => ko[key] ?? key;
  assert.match(backgroundControlsHtml({}, { t }), /data-bg="backgroundKind" data-value="pattern"/);
  assert.ok(!backgroundControlsHtml({}, { t }).includes('backgroundColorOpacity'), 'the default kind shows no layers');
  const pattern = backgroundControlsHtml({ backgroundKind: 'pattern' }, { t });
  for (const p of DIAGRAM_BG_PATTERNS) assert.ok(pattern.includes(`data-bg="backgroundPattern" data-value="${p}"`), p);
  for (const key of ['backgroundColor', 'backgroundColorOpacity', 'backgroundPatternColor', 'backgroundPatternOpacity', 'backgroundPatternScale']) assert.ok(pattern.includes(`data-bg-input="${key}"`), key);
  const image = backgroundControlsHtml({ backgroundKind: 'image', backgroundImage: PNG, backgroundImageWidth: 640, backgroundImageHeight: 480 }, { t });
  assert.ok(image.includes('data-bg-action="pick"') && image.includes('data-bg-input="backgroundFit"') && image.includes('data-bg-input="backgroundOpacity"') && image.includes('640 × 480 px'));
  assert.ok(!/bg\.\w/.test(pattern + image), 'every text is translated');
  assert.equal(backgroundValue('backgroundOpacity', '140'), 100);
  assert.equal(backgroundValue('backgroundPatternScale', '20'), 50);
  assert.equal(backgroundValue('backgroundOpacity', 'x'), 100);
  assert.equal(backgroundValue('backgroundColor', '#abcdef'), '#abcdef');
  assert.deepEqual(BG_KEYS, BACKGROUND_FIELDS.map((f) => f.key));
});

test('pictures are scaled down to 2560 px on their longest side; exported pixels keep their alpha', () => {
  assert.equal(BACKGROUND_IMAGE_MAX, 2560);
  assert.deepEqual(fitWithin(5120, 2880), { width: 2560, height: 1440, scaled: true });
  assert.deepEqual(fitWithin(1200, 800), { width: 1200, height: 800, scaled: false });
  assert.deepEqual(fitWithin(1000, 4000), { width: 640, height: 2560, scaled: true });
  // A half-transparent background pixel stays half transparent in a 32-bit export (BMP: BGRA, bottom-up).
  const bmp = encodeBmp(new Uint8Array([10, 20, 30, 128]), 1, 1);
  assert.deepEqual([...bmp.slice(122, 126)], [30, 20, 10, 128]);
});
