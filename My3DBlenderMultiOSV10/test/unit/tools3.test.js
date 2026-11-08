// SVG import as Blender reads it, and the curve model it needs (Bézier handles, filled 2D curves); physics that was missing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import { Vector3 } from 'three';
import { addObject, createDocument, curveToMesh, evaluatedMesh, sampleSpline, setFrame, worldMatrix } from '../../src/core/doc.js';
import { createModifier } from '../../src/core/modifiers.js';
import { encodePNG } from '../../src/core/paint.js';
import { createMesh, cubeMesh, gridMesh, planeMesh, signedVolume, uvSphereMesh } from '../../src/core/mesh.js';
import { bakeCloth, bakeParticles, bakeSoftBody, defaultCloth, defaultField, defaultParticles, defaultSoftBody, fieldForce, particlesAt, separateFromFaces } from '../../src/core/physics.js';
import { bakeDynamicPaint, bakeSmoke, defaultDynamicPaint, defaultSmokeDomain, defaultSmokeFlow, dynamicPaintImages } from '../../src/core/simulation.js';
import { importSVGScene, parsePath, parseTransform, readSVG, svgColor } from '../../src/core/svg.js';

const close = (a, b, eps = 1e-9) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= eps, `${a} is not ${b} (±${eps})`));
const area = (m) => m.faces.reduce((s, f) => { const [a, b, c] = f.map((i) => m.verts[i]); return s + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; }, 0);
const fixture = fs.readFileSync(new URL('../fixtures/every-element.svg', import.meta.url), 'utf8');

describe('SVG import', () => {
  test('a rectangle lands where Blender 4.5 puts it: 1/90 inch to the pixel, Y up, single-precision scale', () => {
    const [c] = readSVG('<svg xmlns="http://www.w3.org/2000/svg"><rect id="a" x="10" y="20" width="30" height="40"/></svg>');
    assert.equal(c.name, 'a');
    assert.equal(c.fill, true, 'no fill attribute: black, filled');
    close(c.color, [0, 0, 0]);
    const s = c.splines[0];
    assert.equal(s.cyclic, true);
    // Read from Blender 4.5's own importer.
    close(s.points[0], [0.002822279930114746, -0.005643367767333984, 0], 1e-9);
    close(s.points[2], [0.011289119720458984, -0.016930103302001953, 0], 1e-9);
    close(s.handles[0][0], [0.002822279930114746, -0.00940561294555664, 0], 1e-9);
  });
  test('every element kind of the fixture: shapes, groups, use and symbol, fill or outline', () => {
    const curves = readSVG(fixture);
    assert.deepEqual(curves.map((c) => c.name), ['wave', 'ring', 'relative', 'box', 'rounded', 'dot', 'egg', 'stick', 'zig', 'tri', 'grouped', 'skewed', 'star', 'star', 'Curve']);
    const by = Object.fromEntries(curves.map((c) => [c.name, c]));
    assert.equal(by.wave.fill, false, 'fill="none"');
    assert.equal(by.wave.splines[0].points.length, 5, 'C, S, Q, T: one point each');
    assert.equal(by.ring.splines.length, 2, 'two arcs, two splines');
    assert.equal(by.rounded.splines[0].points.length, 8, 'rounded corners');
    assert.equal(by.dot.splines[0].points.length, 4);
    assert.equal(by.stick.dimensions, '2D', 'a line is 2D, unfilled, as in Blender');
    assert.equal(by.stick.fill, false);
    assert.equal(by.zig.splines[0].cyclic, false);
    assert.equal(by.tri.splines[0].cyclic, true);
    close(by.relative.color, [0.5775804404296506, 0.012983032342173012, 0.021219010376003558], 1e-6);
    close(by.grouped.color, svgColor('purple'), 1e-12);
    // The symbol: a 10×10 view box shown 12 wide, so its 8-wide square is 9.6 across.
    const xs = by.Curve.splines[0].points.map((p) => p[0]);
    const k = 0.0002822279930114746 * (200 * 90 / 25.4) / 200 * (1000 / (25.4 * 39.3701));
    assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) / k - 9.6) < 1e-3, `${(Math.max(...xs) - Math.min(...xs)) / k}`);
  });
  test('filled curves become faces, a spline inside another a hole', () => {
    const [ring] = readSVG('<svg><path d="M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z"/></svg>');
    const mesh = curveToMesh({ splines: ring.splines, resolution: 12, fill: true });
    const px = 0.0002822279930114746;
    const py = 0.0002821683883666992;
    assert.ok(Math.abs(area(mesh) - (100 * 100 - 50 * 50) * px * py) < 1e-12, `${area(mesh)}`);
    const unfilled = curveToMesh({ splines: ring.splines, resolution: 12, fill: false });
    assert.equal(unfilled.faces.length, 0, 'outline only');
  });
  test('path data: arcs, smooth curves, implicit commands and numbers that run together', () => {
    const [s] = parsePath('M0,0L10-5.5.5.5z', false);
    assert.deepEqual(s.points.map((p) => [p.x, p.y]), [[0, 0], [10, -5.5], [0.5, 0.5]]);
    assert.equal(s.closed, true);
    const [arc] = parsePath('M0 0 a10 10 0 01 20 0', false);
    const last = arc.points[arc.points.length - 1];
    close([last.x, last.y], [20, 0], 1e-9);
    assert.ok(arc.points.some((p) => p.y < -9.9), 'a half circle bulges 10 up (SVG Y down)');
    const [smooth] = parsePath('M0 0 C0 10 10 10 10 0 S20 -10 20 0', false);
    close(smooth.points[1].hr, [10, -10], 1e-12, 'S mirrors the last handle');
  });
  test('transforms compose as SVG writes them', () => {
    const m = parseTransform('translate(10 20) rotate(90) scale(2)');
    // A point at (1, 0): scaled to 2, turned to (0, 2), moved to (10, 22).
    const x = m[0] * 1 + m[2] * 0 + m[4];
    const y = m[1] * 1 + m[3] * 0 + m[5];
    close([x, y], [10, 22], 1e-6);
    assert.throws(() => parseTransform('bogus(1)'), /Unknown transform/);
  });
  test('colours: hex, short hex, rgb() and CSS names, linear like Blender', () => {
    close(svgColor('#ff0000'), [1, 0, 0]);
    close(svgColor('#f00'), [1, 0, 0]);
    close(svgColor('rgb(255, 255,255)'), [1, 1, 1]);
    close(svgColor('gold'), [1, 0.6795424696330938, 0], 1e-6);
    assert.equal(svgColor('url(#grad)'), null);
  });
  test('File › Import › SVG: a collection named after the file, one SVGMat per colour, curves drawn with their fill', () => {
    const doc = createDocument();
    const before = doc.materials.length;
    const made = importSVGScene(doc, fixture, { name: 'every-element.svg' });
    assert.equal(made.length, 15);
    const col = doc.collections.find((c) => c.name === 'every-element.svg');
    assert.ok(col);
    assert.ok(made.every((o) => o.collection === col.id && o.type === 'CURVE'));
    const mats = doc.materials.slice(before);
    assert.ok(mats.every((m) => m.name === 'SVGMat'));
    const stars = made.filter((o) => o.name.startsWith('star'));
    assert.equal(stars.length, 2);
    assert.equal(stars[0].materials[0], stars[1].materials[0], 'one material per colour');
    assert.equal(new Set(made.flatMap((o) => o.materials)).size, mats.length);
    const box = made.find((o) => o.name === 'box');
    assert.ok(evaluatedMesh(doc, box).faces.length >= 2, 'a filled rectangle has faces');
    const wave = made.find((o) => o.name === 'wave');
    assert.equal(evaluatedMesh(doc, wave).faces.length, 0);
    assert.ok(evaluatedMesh(doc, wave).loose.length > 40, 'drawn along its handles, 12 steps a segment');
  });
  test('Bézier points with handles are sampled as cubic segments', () => {
    const s = { kind: 'BEZIER', cyclic: false, points: [[0, 0, 0], [3, 0, 0]], handles: [[[0, 0, 0], [1, 1, 0]], [[2, 1, 0], [3, 0, 0]]] };
    const pts = sampleSpline(s, 4);
    assert.equal(pts.length, 5);
    close(pts[2], [1.5, 0.75, 0], 1e-12);
  });
});

describe('physics: what was missing', () => {
  const scene = () => { const doc = createDocument(); doc.objects.length = 0; doc.frameStart = 1; doc.frameEnd = 96; doc.fps = 24; doc.gravity = [0, 0, -9.81]; return doc; };
  const centre = (verts) => [0, 1, 2].map((k) => verts.reduce((s, v) => s + v[k], 0) / verts.length);
  test('soft body aerodynamics: a falling sheet flat to the air falls slower than one without, and slower than an edge-on one', () => {
    const fall = (aero, rotation = [0, 0, 0]) => {
      const doc = scene();
      const o = addObject(doc, { type: 'MESH', name: 'S', data: gridMesh(6, 6, 2), location: [0, 0, 10], rotation });
      o.softBody = { ...defaultSoftBody(), goal: 0, stiffness: 0.9, aero };
      bakeSoftBody(doc, o, { start: 1, end: 24 });
      return -centre(o.cache.cloth[24])[2];
    };
    const free = fall(0);
    const flat = fall(20);
    assert.ok(flat < free * 0.8, `flat sheet fell ${flat}, without air ${free}`);
    // Edge-on, the same sheet cuts through the air: the drop measured in the world (local Z is sideways now).
    const doc = scene();
    const o = addObject(doc, { type: 'MESH', name: 'S', data: gridMesh(6, 6, 2), location: [0, 0, 10], rotation: [90, 0, 0] });
    o.softBody = { ...defaultSoftBody(), goal: 0, stiffness: 0.9, aero: 20 };
    bakeSoftBody(doc, o, { start: 1, end: 24 });
    const m = worldMatrix(doc, o);
    const worldZ = centre(o.cache.cloth[24].map((v) => { const p = new Vector3(...v).applyMatrix4(m); return [p.x, p.y, p.z]; }))[2];
    assert.ok(10 - worldZ > flat * 1.2, `edge-on fell ${10 - worldZ}, flat ${flat}`);
  });
  test('soft body self collision: a sheet folding onto itself keeps its vertices apart', () => {
    const run = (selfCollision) => {
      const doc = scene();
      const ground = addObject(doc, { type: 'MESH', name: 'G', data: planeMesh(20) });
      ground.collision = { friction: 0.8 };
      const o = addObject(doc, { type: 'MESH', name: 'S', data: gridMesh(10, 2, 2), location: [0, 0, 0.6], rotation: [0, 70, 0] });
      o.softBody = { ...defaultSoftBody(), goal: 0, stiffness: 0.6, selfCollision, ballSize: 0.12 };
      bakeSoftBody(doc, o, { start: 1, end: 48 });
      const v = o.cache.cloth[48];
      const joined = new Set([...o.data.faces.flatMap((f) => f.map((a, i) => [a, f[(i + 1) % f.length]].sort().join()))]);
      let closest = Infinity;
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (!joined.has([i, j].sort().join())) closest = Math.min(closest, Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]));
      return closest;
    };
    const apart = run(true);
    assert.ok(apart >= 0.05, `closest unjoined vertices ${apart}`);
  });
  test('force fields act on soft bodies', () => {
    const doc = scene();
    doc.gravity = [0, 0, 0];
    const o = addObject(doc, { type: 'MESH', name: 'S', data: cubeMesh(1) });
    o.softBody = { ...defaultSoftBody(), goal: 0 };
    const wind = addObject(doc, { type: 'EMPTY', name: 'W', rotation: [0, 90, 0], data: {} });
    wind.field = { ...defaultField('WIND'), strength: 4 };
    bakeSoftBody(doc, o, { start: 1, end: 24 });
    assert.ok(centre(o.cache.cloth[24])[0] > 0.5, `blown along +X: ${centre(o.cache.cloth[24])}`);
  });
  test('cloth pressure inflates a closed mesh; without it the same mesh sags', () => {
    const volume = (pressure) => {
      const doc = scene();
      doc.gravity = [0, 0, 0];
      const o = addObject(doc, { type: 'MESH', name: 'B', data: uvSphereMesh(16, 8, 1) });
      o.cloth = { ...defaultCloth(), stiffness: 0.3, pressure };
      bakeCloth(doc, o, { start: 1, end: 24 });
      return signedVolume({ ...o.data, verts: o.cache.cloth[24] });
    };
    const rest = signedVolume(uvSphereMesh(16, 8, 1));
    const blown = volume(4);
    assert.ok(blown > rest * 1.05, `inflated ${blown} against ${rest}`);
    assert.ok(Math.abs(volume(0) - rest) < rest * 0.02, 'no pressure, no change without gravity');
    assert.ok(volume(-4) < rest * 0.95, 'negative pressure sucks it in');
  });
  test('cloth sewing: loose edges pull two panels together', () => {
    const doc = scene();
    doc.gravity = [0, 0, 0];
    const mesh = createMesh();
    // Two squares a metre apart, sewn at their facing corners.
    mesh.verts.push([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [2, 0, 0], [3, 0, 0], [3, 1, 0], [2, 1, 0]);
    mesh.faces.push([0, 1, 2, 3], [4, 5, 6, 7]);
    mesh.loose.push([1, 4], [2, 7]);
    const o = addObject(doc, { type: 'MESH', name: 'P', data: mesh });
    o.cloth = { ...defaultCloth(), sewing: true, sewingForce: 1 };
    bakeCloth(doc, o, { start: 1, end: 30 });
    const v = o.cache.cloth[30];
    const gap = Math.hypot(v[1][0] - v[4][0], v[1][1] - v[4][1], v[1][2] - v[4][2]);
    assert.ok(gap < 0.05, `sewn shut: ${gap}`);
    const side = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]);
    assert.ok(Math.abs(side - 1) < 0.05, `the panels keep their size: ${side}`);
    o.cloth.sewing = false;
    bakeCloth(doc, o, { start: 1, end: 30 });
    const kept = o.cache.cloth[30];
    assert.ok(Math.abs(Math.hypot(kept[1][0] - kept[4][0], kept[1][1] - kept[4][1]) - 1) < 0.02, 'without sewing a loose edge keeps its length');
  });
  test('cloth self collision keeps vertices off its own faces: a coarse sheet folded onto itself does not pass through', () => {
    const doc = scene();
    doc.gravity = [0, 0, 0];
    // A big coarse square and one vertex of a far part of the same mesh flying through it.
    const mesh = createMesh();
    mesh.verts.push([-2, -2, 0], [2, -2, 0], [2, 2, 0], [-2, 2, 0], [0.1, 0.2, 0.5], [0.2, 0.2, 0.6], [0.2, 0.3, 0.6]);
    mesh.faces.push([0, 1, 2, 3], [4, 5, 6]);
    const pos = mesh.verts.map((v) => [...v]);
    const prev = pos.map((p) => [...p]);
    pos[4] = [0.1, 0.2, -0.3];
    pos[5] = [0.2, 0.2, -0.2];
    pos[6] = [0.2, 0.3, -0.2];
    const pinned = pos.map((_, i) => i < 4);
    const moved = separateFromFaces(pos, prev, pinned, mesh.faces, 0.02);
    assert.ok(moved >= 1);
    assert.ok(pos[4][2] > 0, `kept on the side it came from: ${pos[4][2]}`);
  });
  test('charge fields push like charges apart and pull unlike ones; a curve guide carries things along its curve', () => {
    const doc = scene();
    const c = addObject(doc, { type: 'EMPTY', name: 'C', data: {} });
    c.field = { ...defaultField('CHARGE'), strength: 2, charge: 1 };
    const away = fieldForce(doc, c, [2, 0, 0], [0, 0, 0], 1);
    const toward = fieldForce(doc, c, [2, 0, 0], [0, 0, 0], -1);
    assert.ok(away[0] > 0 && toward[0] < 0);
    assert.ok(Math.abs(fieldForce(doc, c, [4, 0, 0], [0, 0, 0], 1)[0] / away[0] - 0.25) < 1e-9, 'inverse square');
    const path = addObject(doc, { type: 'CURVE', name: 'Path', data: { splines: [{ kind: 'POLY', cyclic: false, points: [[0, 0, 0], [10, 0, 0]] }], bevelDepth: 0, resolution: 12 } });
    path.field = { ...defaultField('GUIDE'), strength: 3, guideFree: 0 };
    const onIt = fieldForce(doc, path, [5, 0, 0], [0, 0, 0]);
    assert.ok(onIt[0] > 2.9 && Math.abs(onIt[1]) < 1e-9, `along the curve: ${onIt}`);
    const off = fieldForce(doc, path, [5, 2, 0], [0, 0, 0]);
    assert.ok(off[1] < 0, 'pulled back onto it');
    // Particles with a negative charge fall into a positive field.
    const emitter = addObject(doc, { type: 'MESH', name: 'E', data: planeMesh(0.2), location: [3, 0, 0] });
    doc.gravity = [0, 0, 0];
    const system = { ...defaultParticles(), count: 20, velocity: 0, randomVelocity: 0, frameStart: 1, frameEnd: 1, lifetime: 100, charge: -1 };
    emitter.particles = [system];
    path.field = null;
    c.field.strength = 20;
    bakeParticles(doc, emitter, system, { start: 1, end: 20 });
    const ps = particlesAt(doc, emitter, system, 20);
    const mean = ps.reduce((s, p) => s + (p.position ?? p.p ?? p)[0], 0) / ps.length;
    assert.ok(mean < 2.9, `pulled toward the charge: ${mean}`);
  });
  test('smoke follows force fields', () => {
    const run = (withWind) => {
      const doc = scene();
      const domain = addObject(doc, { type: 'MESH', name: 'D', data: cubeMesh(4) });
      domain.smoke = { ...defaultSmokeDomain(), res: 16, buoyancy: 0, vorticity: 0, dissipation: 1 };
      const flow = addObject(doc, { type: 'MESH', name: 'F', data: uvSphereMesh(10, 5, 0.5) });
      flow.smokeFlow = { ...defaultSmokeFlow(), end: 2 };
      if (withWind) { const w = addObject(doc, { type: 'EMPTY', name: 'W', rotation: [0, 90, 0], data: {} }); w.field = { ...defaultField('WIND'), strength: 40 }; }
      const cache = bakeSmoke(doc, domain, { start: 1, end: 20 });
      const [nx, ny, nz] = cache.n;
      const d = cache.frames[20].density;
      let sx = 0;
      let s = 0;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = d[i + nx * (j + ny * k)]; sx += v * i; s += v; }
      return sx / s;
    };
    const still = run(false);
    const blown = run(true);
    assert.ok(blown > still + 1, `the smoke's centre moved from cell ${still} to ${blown}`);
  });
});

describe('dynamic paint outputs', () => {
  const setup = (surface) => {
    const doc = createDocument();
    doc.objects.length = 0;
    doc.frameStart = 1;
    doc.frameEnd = 3;
    const canvas = addObject(doc, { type: 'MESH', name: 'Wall', data: gridMesh(16, 16, 4), dynamicPaint: { ...defaultDynamicPaint('CANVAS'), surface } });
    addObject(doc, { type: 'MESH', name: 'Brush', data: cubeMesh(0.4), dynamicPaint: { ...defaultDynamicPaint('BRUSH'), radius: 0.6, color: [0, 0, 1] } });
    bakeDynamicPaint(doc, canvas);
    return { doc, canvas };
  };
  test('a weight surface writes its wetness into a vertex group, before the modifiers', () => {
    const { doc, canvas } = setup('WEIGHT');
    canvas.dynamicPaint.outputGroup = 'wet';
    setFrame(doc, 3);
    const mesh = evaluatedMesh(doc, canvas);
    const g = mesh.vgroups.find((x) => x.name === 'wet');
    assert.ok(g, 'the group is there');
    const centre = canvas.data.verts.findIndex((v) => Math.hypot(v[0], v[1]) < 0.2);
    const corner = canvas.data.verts.findIndex((v) => v[0] > 1.9 && v[1] > 1.9);
    assert.ok(g.w[centre] > 0.5 && g.w[corner] === 0, `${g.w[centre]} at the brush, ${g.w[corner]} far away`);
    assert.equal(mesh.colors ?? null, null, 'not painted');
    // Mask by the group: only what the brush wetted is kept.
    canvas.modifiers = [{ ...createModifier('MASK'), group: 'wet' }];
    const masked = evaluatedMesh(doc, canvas);
    assert.ok(masked.faces.length > 0 && masked.faces.length < canvas.data.faces.length / 4, `${masked.faces.length} faces kept`);
  });
  test('the image sequence: one paint map and one wet map a frame, painted where the brush was, over the UVs', () => {
    const { canvas } = setup('PAINT');
    const paint = dynamicPaintImages(canvas, { size: 64 });
    assert.deepEqual(paint.map((p) => p.name), ['paintmap0001.png', 'paintmap0002.png', 'paintmap0003.png']);
    const px = (img, u, v) => { const i = (Math.floor((1 - v) * img.height) * img.width + Math.floor(u * img.width)) * 4; return [...img.rgba.slice(i, i + 4)]; };
    const middle = px(paint[2].image, 0.5, 0.5);
    assert.ok(middle[2] > 200 && middle[0] < 60, `blue at the middle: ${middle}`);
    assert.deepEqual(px(paint[2].image, 0.02, 0.02), [255, 255, 255, 255], 'the base colour at a corner');
    const wet = dynamicPaintImages(canvas, { size: 64, map: 'wetmap' });
    assert.equal(wet[0].name, 'wetmap0001.png');
    assert.ok(px(wet[2].image, 0.5, 0.5)[0] > 200 && px(wet[2].image, 0.02, 0.02)[0] === 0);
    const png = encodePNG(paint[2].image);
    assert.deepEqual([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join(''), 'PNG', 'writes as PNG');
  });
});

describe('force field kinds', () => {
  test('Lennard-Jones pushes inside its size, pulls just beyond it and fades far away', () => {
    const doc = createDocument();
    const o = addObject(doc, { type: 'EMPTY', name: 'L', data: {} });
    o.field = { ...defaultField('LENNARDJ'), strength: 1, size: 1 };
    assert.ok(fieldForce(doc, o, [0.9, 0, 0])[0] > 0, 'pushed out');
    assert.ok(fieldForce(doc, o, [1.5, 0, 0])[0] < 0, 'pulled in');
    assert.ok(Math.abs(fieldForce(doc, o, [2 ** (1 / 6), 0, 0])[0]) < 1e-9, 'no force at the balance distance');
    assert.ok(Math.abs(fieldForce(doc, o, [10, 0, 0])[0]) < 1e-4);
  });
});
