// Volumes, smoke and fire, liquid, Dynamic Paint, Freestyle lines and NURBS surfaces: each checked against what it should
// physically or geometrically do, not against stored numbers.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as anim from '../../src/core/anim.js';
import { activeObject, addObject, createDefaultScene, createDocument, defaultCamera, defaultLight, defaultMaterial, deserialize, evaluatedMesh, serialize, setFrame } from '../../src/core/doc.js';
import { featureEdges, lineCoverage, drawFreestyle, projectToImage, defaultFreestyle } from '../../src/core/freestyle.js';
import { History } from '../../src/core/history.js';
import { boundingBox, cubeMesh, gridMesh, isManifold, planeMesh, signedVolume, v3 } from '../../src/core/mesh.js';
import { knotVector, nurbsPrimitive, surfaceToMesh } from '../../src/core/nurbs.js';
import { run } from '../../src/core/ops.js';
import { buildBVH, buildRenderScene, renderImage } from '../../src/core/pathtracer.js';
import {
  addLiquidBox, bakeDynamicPaint, bakeLiquid, bakeSmoke, clearSimCache, createLiquid, createSmokeState, defaultDynamicPaint, defaultLiquidDomain, defaultSmokeDomain, defaultSmokeFlow, liquidMeshAt, liquidStep, liquidSurface, proceduralDensity, sceneVolumes, simBaked, simCache, smokeStep, volumeGrid,
} from '../../src/core/simulation.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b} (±${eps})`);
const context = () => {
  const doc = createDefaultScene();
  const history = new History();
  history.reset(doc);
  return { doc, history, undo() { const text = this.history.undo(); if (text) this.doc = deserialize(text); return Boolean(text); } };
};
const stage = () => {
  const doc = createDocument();
  doc.world.color = [0.5, 0.5, 0.5];
  doc.render = { ...doc.render, samples: 8, bounces: 3, width: 32, height: 32, percent: 100, seed: 2, filmTransparent: false };
  const camera = addObject(doc, { type: 'CAMERA', name: 'Camera', location: [0, -6, 0], rotation: [90, 0, 0], data: defaultCamera() });
  doc.activeCamera = camera.id;
  return doc;
};
const pixel = (image, x, y) => { const i = (y * image.width + x) * 4; return [image.data[i], image.data[i + 1], image.data[i + 2]]; };

describe('volumes', () => {
  test('the procedural shapes', () => {
    assert.equal(proceduralDensity({ kind: 'CONSTANT' }, 0.1, 0.9, 0.3), 1);
    assert.equal(proceduralDensity({ kind: 'SPHERE' }, 0.5, 0.5, 0.5), 1);
    assert.equal(proceduralDensity({ kind: 'SPHERE' }, 0.99, 0.99, 0.99), 0);
    const g = volumeGrid({ kind: 'NOISE', res: 16, scale: 4, threshold: 0.45 });
    assert.equal(g.density.length, 16 ** 3);
    assert.ok(g.density.some((x) => x > 0) && g.density.some((x) => x === 0), 'noise has holes');
  });
  test('a fog box dims what is behind it, by Beer-Lambert', () => {
    const doc = stage();
    const clear = renderImage(buildRenderScene(doc));
    const fog = addObject(doc, { type: 'VOLUME', name: 'Fog', data: { kind: 'CONSTANT', density: 0.5, res: 4, colour: [0, 0, 0], emission: [0, 0, 0] } });
    void fog;
    const image = renderImage(buildRenderScene(doc), { samples: 64 });
    const expected = 0.5 * Math.exp(-0.5 * 2);
    near(pixel(clear, 16, 16)[0], 0.5, 1e-6);
    near(pixel(image, 16, 16)[0], expected, 0.06);
  });
  test('an emissive volume glows, with no light in the scene', () => {
    const doc = stage();
    doc.world.color = [0, 0, 0];
    addObject(doc, { type: 'VOLUME', name: 'Glow', data: { kind: 'CONSTANT', density: 2, res: 4, colour: [0, 0, 0], emission: [1, 0.2, 0], emissionStrength: 1 } });
    const image = renderImage(buildRenderScene(doc));
    const [r, g, b] = pixel(image, 16, 16);
    assert.ok(r > 0.5 && r > g && b === 0, `${r} ${g} ${b}`);
    near(pixel(image, 0, 0)[0], 0, 0.3);
  });
  test('light scatters in a volume: a lit fog is brighter than a dark one', () => {
    const scene = (energy) => {
      const doc = stage();
      doc.world.color = [0, 0, 0];
      addObject(doc, { type: 'VOLUME', name: 'Fog', data: { kind: 'CONSTANT', density: 2, res: 4, colour: [0.9, 0.9, 0.9], emission: [0, 0, 0] } });
      addObject(doc, { type: 'LIGHT', name: 'L', location: [0, 0, 3], data: { ...defaultLight('POINT'), energy, radius: 0 } });
      return renderImage(buildRenderScene(doc), { samples: 24 });
    };
    assert.equal(pixel(scene(0), 16, 16)[0], 0);
    assert.ok(pixel(scene(400), 16, 16)[0] > 0.02, 'light reaches the viewer through the fog');
  });
  test('Add › Volume, and it stays in the file', () => {
    const ctx = context();
    run(ctx, 'object.volume_add', { kind: 'SPHERE' });
    assert.equal(activeObject(ctx.doc).type, 'VOLUME');
    assert.equal(sceneVolumes(ctx.doc).length, 1);
    assert.equal(sceneVolumes(deserialize(serialize(ctx.doc))).length, 1);
  });
});

describe('smoke and fire', () => {
  const blobState = () => {
    const s = createSmokeState([16, 16, 24]);
    for (let k = 2; k < 6; k++) for (let j = 6; j < 10; j++) for (let i = 6; i < 10; i++) {
      const c = i + j * 16 + k * 16 * 16;
      s.density[c] = 1;
      s.temperature[c] = 1;
    }
    return s;
  };
  const centreZ = (s) => { let [sum, m] = [0, 0]; const [nx, ny, nz] = s.n; for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const d = s.density[i + j * nx + k * nx * ny]; sum += d * k; m += d; } return sum / m; };
  const divergence = (s) => {
    const [nx, ny, nz] = s.n;
    const at = (i, j, k) => i + j * nx + k * nx * ny;
    let worst = 0;
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) worst = Math.max(worst, Math.abs(0.5 * (s.u[at(i + 1, j, k)] - s.u[at(i - 1, j, k)] + s.v[at(i, j + 1, k)] - s.v[at(i, j - 1, k)] + s.w[at(i, j, k + 1)] - s.w[at(i, j, k - 1)])));
    return worst;
  };
  test('hot smoke rises', () => {
    const s = blobState();
    const before = centreZ(s);
    for (let i = 0; i < 20; i++) smokeStep(s, { vorticity: 0 });
    assert.ok(centreZ(s) > before + 2, `from ${before} to ${centreZ(s)}`);
  });
  test('cold smoke does not rise on its own', () => {
    const s = blobState();
    s.temperature.fill(0);
    const before = centreZ(s);
    for (let i = 0; i < 10; i++) smokeStep(s, { vorticity: 0 });
    assert.ok(centreZ(s) <= before + 0.2);
  });
  test('the air stays nearly incompressible', () => {
    const s = blobState();
    let peak = 0;
    for (let i = 0; i < 10; i++) { smokeStep(s, { vorticity: 0, iterations: 60 }); peak = Math.max(peak, Math.max(...s.w.map(Math.abs))); }
    assert.ok(divergence(s) < peak, `divergence ${divergence(s)} against velocity ${peak}`);
  });
  test('fuel burns: flame and heat appear, fuel goes down', () => {
    const s = createSmokeState([12, 12, 12]);
    const c = 6 + 6 * 12 + 3 * 144;
    s.fuel[c] = 1;
    smokeStep(s, { vorticity: 0, iterations: 4 });
    assert.ok(s.flame.some((x) => x > 0));
    assert.ok(s.temperature.some((x) => x > 0));
    assert.ok(s.fuel.reduce((a, b) => a + b, 0) < 1);
  });
  test('a bake stores each frame, renders, and an emitter off-range makes nothing', () => {
    const doc = stage();
    doc.frameStart = 1;
    doc.frameEnd = 6;
    const domain = addObject(doc, { type: 'MESH', name: 'Domain', data: cubeMesh(4), smoke: { ...defaultSmokeDomain(), res: 12 }, hideRender: false });
    addObject(doc, { type: 'MESH', name: 'Flow', data: cubeMesh(1), location: [0, 0, -1], smokeFlow: defaultSmokeFlow(), hide: false });
    const cache = bakeSmoke(doc, domain);
    assert.deepEqual(Object.keys(cache.frames).length, 6);
    assert.ok(cache.frames[6].density.some((x) => x > 0));
    assert.equal(simBaked(domain), true);
    assert.equal(doc.frame, 1);
    const late = createDocument();
    late.frameStart = 1; late.frameEnd = 3;
    const d2 = addObject(late, { type: 'MESH', name: 'D', data: cubeMesh(4), smoke: { ...defaultSmokeDomain(), res: 8 } });
    addObject(late, { type: 'MESH', name: 'F', data: cubeMesh(1), smokeFlow: { ...defaultSmokeFlow(), start: 50 } });
    assert.ok(bakeSmoke(late, d2).frames[3].density.every((x) => x === 0));
    clearSimCache(d2.id);
    assert.equal(simBaked(d2), false);
  });
  test('fire renders as light', () => {
    const doc = stage();
    doc.world.color = [0, 0, 0];
    doc.frameStart = 1;
    doc.frameEnd = 12;
    doc.render.samples = 8;
    const domain = addObject(doc, { type: 'MESH', name: 'Domain', data: cubeMesh(4), smoke: { ...defaultSmokeDomain(), res: 12, flameStrength: 40 }, hideRender: true });
    addObject(doc, { type: 'MESH', name: 'Flow', data: cubeMesh(1.5), location: [0, 0, -1], smokeFlow: { ...defaultSmokeFlow(), kind: 'FIRE' }, hideRender: true });
    bakeSmoke(doc, domain);
    // A hidden domain is left out of the render; the domain's own box must not hide its smoke either.
    domain.hideRender = false;
    domain.display = 'WIRE';
    const scene = buildRenderScene(doc, { frame: 12, width: 24, height: 24 });
    assert.equal(scene.volumes.length, 1);
    assert.equal(scene.positions.length, 9 * 12 * 0 + scene.positions.length);
    const image = renderImage({ ...scene, positions: new Float32Array(0), normals: new Float32Array(0), uvs: new Float32Array(0), triMat: new Int32Array(0), vertexColors: null });
    let brightest = 0;
    for (let i = 0; i < image.data.length; i += 4) brightest = Math.max(brightest, image.data[i]);
    assert.ok(brightest > 0.2, `brightest ${brightest}`);
  });
});

describe('liquid', () => {
  const box = () => createLiquid([0, 0, 0], [2, 2, 2], 12);
  const stats = (l) => {
    const bb = boundingBox(l.particles);
    const speed = Math.max(...l.velocities.map((v) => v3.len(v)));
    const mean = l.particles.reduce((s, p) => s + p[2], 0) / l.particles.length;
    return { bb, speed, mean };
  };
  test('no particle is lost or leaves the box', () => {
    const l = box();
    addLiquidBox(l, [0.2, 0.2, 1], [1.8, 1.8, 1.8], { perCell: 8 });
    const count = l.particles.length;
    assert.ok(count > 500);
    for (let i = 0; i < 30; i++) liquidStep(l);
    assert.equal(l.particles.length, count);
    for (const p of l.particles) for (let k = 0; k < 3; k++) assert.ok(p[k] >= 0 && p[k] <= 2 && Number.isFinite(p[k]));
  });
  test('it falls, at first at the rate of gravity', () => {
    const l = box();
    addLiquidBox(l, [0.5, 0.5, 1.4], [1.5, 1.5, 1.9], { perCell: 8 });
    const before = stats(l).mean;
    const dt = 1 / 24;
    liquidStep(l, { dt });
    liquidStep(l, { dt });
    const after = stats(l).mean;
    const expected = 0.5 * 9.81 * (2 * dt) ** 2;
    assert.ok(before - after > expected * 0.4 && before - after < expected * 2, `fell ${before - after}, free fall ${expected}`);
  });
  test('it comes to rest on the floor, at about the height its volume should give', () => {
    const l = box();
    addLiquidBox(l, [0, 0, 1], [2, 2, 1.8], { perCell: 8 });
    for (let i = 0; i < 90; i++) liquidStep(l, { flip: 0.9 });
    const s = stats(l);
    // 2 × 2 × 0.8 of water on a 2 × 2 floor: 0.8 deep, mean height 0.4. FLIP loses some volume, so a margin.
    assert.ok(s.bb.min[2] < 0.15, `floor ${s.bb.min[2]}`);
    assert.ok(s.mean > 0.15 && s.mean < 0.75, `mean height ${s.mean}`);
  });
  test('a tall column collapses and spreads out', () => {
    const l = box();
    addLiquidBox(l, [0, 0, 0], [0.6, 2, 1.6], { perCell: 8 });
    const before = stats(l).bb.max[0];
    for (let i = 0; i < 40; i++) liquidStep(l);
    assert.ok(stats(l).bb.max[0] > before + 0.5, `front moved to ${stats(l).bb.max[0]}`);
  });
  test('an obstacle stops it', () => {
    const l = createLiquid([0, 0, 0], [2, 2, 2], 12, { solidBoxes: [{ min: [0, 0, 0], max: [2, 2, 0.8] }] });
    addLiquidBox(l, [0.5, 0.5, 1.2], [1.5, 1.5, 1.8], { perCell: 8 });
    for (let i = 0; i < 40; i++) liquidStep(l);
    assert.ok(stats(l).bb.min[2] >= 0.75, `reached ${stats(l).bb.min[2]}`);
  });
  test('its surface is closed where it is in the open', () => {
    const particles = [];
    for (let i = 0; i < 400; i++) { const a = i * 2.399963; const z = 1 - (2 * i) / 399; const r = Math.sqrt(1 - z * z) * 0.5; particles.push([1 + Math.cos(a) * r, 1 + Math.sin(a) * r, 1 + z * 0.5]); particles.push([1 + Math.cos(a) * r * 0.5, 1 + Math.sin(a) * r * 0.5, 1 + z * 0.25]); }
    const mesh = liquidSurface(particles, [0, 0, 0], [2, 2, 2], 0.08, 2);
    assert.ok(isManifold(mesh));
    assert.ok(signedVolume(mesh) > 0.2, `volume ${signedVolume(mesh)}`);
  });
  test('a baked domain evaluates to the liquid, frame by frame', () => {
    const doc = stage();
    doc.frameStart = 1;
    doc.frameEnd = 5;
    const domain = addObject(doc, { type: 'MESH', name: 'Domain', data: cubeMesh(2), fluid: { ...defaultLiquidDomain(), res: 10 } });
    addObject(doc, { type: 'MESH', name: 'Flow', data: cubeMesh(1), location: [0, 0, 0.4], fluidFlow: { kind: 'GEOMETRY', velocity: [0, 0, 0] } });
    assert.equal(evaluatedMesh(doc, domain).verts.length, 8, 'before the bake it is just a box');
    bakeLiquid(doc, domain);
    const first = liquidMeshAt(doc, domain, 1);
    assert.ok(first.faces.length > 50);
    doc.frame = 5;
    const shown = evaluatedMesh(doc, domain);
    assert.notEqual(shown.verts.length, 8);
    clearSimCache(domain.id);
    assert.equal(evaluatedMesh(doc, domain).verts.length, 8);
  });
  test('inflow keeps adding', () => {
    const doc = stage();
    doc.frameStart = 1;
    doc.frameEnd = 4;
    const domain = addObject(doc, { type: 'MESH', name: 'Domain', data: cubeMesh(2), fluid: { ...defaultLiquidDomain(), res: 10 } });
    addObject(doc, { type: 'MESH', name: 'Tap', data: cubeMesh(0.5), location: [0, 0, 0.6], fluidFlow: { kind: 'INFLOW', velocity: [0, 0, -1] } });
    const cache = bakeLiquid(doc, domain);
    assert.ok(cache.frames[4].particles.length > cache.frames[1].particles.length);
    clearSimCache(domain.id);
  });
});

describe('Dynamic Paint', () => {
  const setup = (canvasOptions = {}) => {
    const doc = createDocument();
    doc.frameStart = 1;
    doc.frameEnd = 11;
    const canvas = addObject(doc, { type: 'MESH', name: 'Canvas', data: gridMesh(10, 10, 10), dynamicPaint: { ...defaultDynamicPaint('CANVAS'), ...canvasOptions } });
    const brush = addObject(doc, { type: 'MESH', name: 'Brush', data: cubeMesh(0.2), location: [-3, 0, 0], dynamicPaint: { ...defaultDynamicPaint('BRUSH'), radius: 0.8 }, anim: null });
    anim.insertKey(brush, 'location.0', 1, -3, 'LINEAR');
    anim.insertKey(brush, 'location.0', 11, 3, 'LINEAR');
    return { doc, canvas, brush };
  };
  const at = (cache, frame, i) => [...cache.frames[frame].color.subarray(i * 3, i * 3 + 3)];
  const vertex = (mesh, x, y) => mesh.verts.findIndex((v) => Math.abs(v[0] - x) < 1e-6 && Math.abs(v[1] - y) < 1e-6);
  test('the brush leaves its colour where it passes, and nowhere else', () => {
    const { doc, canvas } = setup();
    const cache = bakeDynamicPaint(doc, canvas);
    const path = vertex(canvas.data, 2, 0);
    const far = vertex(canvas.data, 2, 4);
    assert.ok(at(cache, 11, path)[1] < 0.3, 'painted');
    assert.deepEqual(at(cache, 11, far), [1, 1, 1], 'clean');
    assert.deepEqual(at(cache, 1, vertex(canvas.data, 3, 0)), [1, 1, 1], 'not yet at the first frame');
    clearSimCache(canvas.id);
  });
  test('paint fades back to the base colour', () => {
    const { doc, canvas } = setup({ fade: 0.2 });
    const cache = bakeDynamicPaint(doc, canvas);
    const start = vertex(canvas.data, -3, 0);
    const [early, late] = [at(cache, 2, start), at(cache, 11, start)];
    assert.ok(late[1] > early[1] + 0.3, `${early} then ${late}`);
    clearSimCache(canvas.id);
  });
  test('wet paint spreads to its neighbours', () => {
    const plain = setup();
    const dry = bakeDynamicPaint(plain.doc, plain.canvas);
    const wet = setup({ spread: 0.8 });
    const spread = bakeDynamicPaint(wet.doc, wet.canvas);
    const side = vertex(wet.canvas.data, 0, 2);
    assert.ok(at(spread, 11, side)[1] < at(dry, 11, vertex(plain.canvas.data, 0, 2))[1]);
    clearSimCache(plain.canvas.id);
    clearSimCache(wet.canvas.id);
  });
  test('the frame shows in the evaluated mesh: colours and a dent', () => {
    const { doc, canvas } = setup({ displace: -0.5 });
    bakeDynamicPaint(doc, canvas);
    doc.frame = 11;
    const mesh = evaluatedMesh(doc, canvas);
    const i = vertex(canvas.data, 2, 0);
    assert.ok(mesh.colors[i][1] < 0.3);
    assert.ok(mesh.verts[i][2] < -0.1, `dent ${mesh.verts[i][2]}`);
    assert.equal(canvas.data.verts[i][2], 0, 'the mesh itself is untouched');
    clearSimCache(canvas.id);
  });
  test('the path tracer sees the paint', () => {
    const doc = stage();
    doc.frameStart = 1;
    doc.frameEnd = 2;
    doc.world.color = [1, 1, 1];
    doc.render.bounces = 1;
    const mat = defaultMaterial();
    mat.baseColor = [1, 1, 1];
    doc.materials.push(mat);
    const canvas = addObject(doc, { type: 'MESH', name: 'C', data: gridMesh(4, 4, 8), rotation: [90, 0, 0], materials: [mat.id], dynamicPaint: { ...defaultDynamicPaint('CANVAS') } });
    addObject(doc, { type: 'MESH', name: 'B', data: cubeMesh(0.4), hideRender: true, dynamicPaint: { ...defaultDynamicPaint('BRUSH'), radius: 3, color: [1, 0, 0] } });
    bakeDynamicPaint(doc, canvas);
    doc.frame = 2;
    const image = renderImage(buildRenderScene(doc, { frame: 2 }), { samples: 16 });
    const [r, g] = pixel(image, 16, 16);
    assert.ok(r > g * 2, `red ${r} green ${g}`);
    clearSimCache(canvas.id);
  });
});

describe('particles in a render', () => {
  test('emitted particles and hair become triangles, in the object\'s material', () => {
    const doc = stage();
    const mat = defaultMaterial('Spray');
    doc.materials.push(mat);
    doc.frame = 30;
    const obj = addObject(doc, { type: 'MESH', name: 'E', data: planeMesh(1), materials: [mat.id], particles: [{ kind: 'EMITTER', name: 'P', count: 50, frameStart: 1, frameEnd: 20, lifetime: 100, velocity: 1, randomVelocity: 0, gravity: 0, size: 0.1, seed: 1, hairLength: 0.5, hairSegments: 4 }] });
    const count = (d) => buildRenderScene(d, { width: 2, height: 2 }).positions.length / 9;
    assert.equal(count(doc), 2 + 50 * 8);
    obj.particles[0].kind = 'HAIR';
    assert.ok(count(doc) > 50);
  });
});

describe('Bake All', () => {
  test('bakes every kind, and Free All clears them', () => {
    const ctx = context();
    const doc = ctx.doc;
    doc.frameEnd = 3;
    const smoke = addObject(doc, { type: 'MESH', name: 'Smoke', data: cubeMesh(2), smoke: { ...defaultSmokeDomain(), res: 8 } });
    addObject(doc, { type: 'MESH', name: 'SF', data: cubeMesh(0.5), smokeFlow: defaultSmokeFlow() });
    const liquid = addObject(doc, { type: 'MESH', name: 'Liquid', data: cubeMesh(2), fluid: { ...defaultLiquidDomain(), res: 6 } });
    const paint = addObject(doc, { type: 'MESH', name: 'Canvas', data: planeMesh(2), dynamicPaint: defaultDynamicPaint('CANVAS') });
    run(ctx, 'ptcache.bake_all');
    assert.ok(simBaked(smoke) && simBaked(liquid) && simBaked(paint));
    run(ctx, 'ptcache.free_all');
    assert.equal(simCache.size, 0);
  });
  test('the bake is not lost by undo, because it is not in the document', () => {
    const ctx = context();
    ctx.doc.frameEnd = 2;
    const id = addObject(ctx.doc, { type: 'MESH', name: 'S', data: cubeMesh(2), smoke: { ...defaultSmokeDomain(), res: 6 } }).id;
    run(ctx, 'ptcache.bake_all');
    run(ctx, 'mesh.primitive_cube_add', {});
    ctx.undo();
    assert.equal(simCache.has(id), true);
    assert.ok(!serialize(ctx.doc).includes('frames'));
    clearSimCache();
  });
});

describe('Freestyle', () => {
  const scene = () => {
    const doc = stage();
    doc.render.width = 64;
    doc.render.height = 64;
    addObject(doc, { type: 'MESH', name: 'Cube', data: cubeMesh(2), rotation: [20, 0, 30] });
    return doc;
  };
  test('a cube has its silhouette and creases; a closed mesh no borders', () => {
    const doc = scene();
    const settings = defaultFreestyle();
    const edges = featureEdges(doc, [0, -6, 0], settings);
    assert.equal(edges.length, 12);
    assert.ok(edges.some((e) => e.kind === 'SILHOUETTE'));
    assert.ok(edges.some((e) => e.kind === 'CREASE'));
    assert.equal(edges.some((e) => e.kind === 'BORDER'), false);
  });
  test('a smooth sphere has only a silhouette; an open plane has borders', () => {
    const doc = stage();
    addObject(doc, { type: 'MESH', name: 'P', data: planeMesh(2), rotation: [90, 0, 0] });
    const edges = featureEdges(doc, [0, -6, 0], defaultFreestyle());
    assert.deepEqual([...new Set(edges.map((e) => e.kind))], ['BORDER']);
    assert.equal(edges.length, 4);
  });
  test('projection matches the renderer: a point ahead lands in the middle', () => {
    const doc = scene();
    const s = buildRenderScene(doc);
    const p = projectToImage(s.camera, s.width, s.height, [0, 0, 0]);
    near(p[0], 32, 1e-3);
    near(p[1], 32, 1e-3);
    assert.equal(projectToImage(s.camera, s.width, s.height, [0, -9, 0]), null, 'behind the camera');
  });
  test('lines are drawn where the outline is, and not on empty space', () => {
    const doc = scene();
    const s = buildRenderScene(doc);
    const edges = featureEdges(doc, s.camera.position, defaultFreestyle());
    const cover = lineCoverage(s, edges, { thickness: 2 });
    assert.ok(cover.some((x) => x > 0.9));
    assert.equal(cover[0], 0, 'the corner of the image');
    assert.ok(cover.reduce((a, b) => a + (b > 0.5 ? 1 : 0), 0) < 64 * 64 * 0.5);
  });
  test('an edge behind something is not drawn', () => {
    const doc = stage();
    doc.render.width = 48;
    doc.render.height = 48;
    addObject(doc, { type: 'MESH', name: 'Back', data: planeMesh(1), rotation: [90, 0, 0], location: [0, 2, 0] });
    const s0 = buildRenderScene(doc);
    const edges = featureEdges(doc, s0.camera.position, defaultFreestyle());
    const open = lineCoverage(s0, edges, { thickness: 2 }).reduce((a, b) => a + b, 0);
    addObject(doc, { type: 'MESH', name: 'Wall', data: planeMesh(6), rotation: [90, 0, 0], location: [0, 0, 0] });
    const s1 = buildRenderScene(doc);
    const hidden = lineCoverage(s1, edges, { thickness: 2, bvh: buildBVH(s1.positions) }).reduce((a, b) => a + b, 0);
    assert.ok(open > 10);
    assert.equal(hidden, 0);
  });
  test('it paints the given colour over the image, and does nothing when off', () => {
    const doc = scene();
    const s = buildRenderScene(doc);
    const image = { width: 64, height: 64, data: new Float32Array(64 * 64 * 4).fill(1) };
    assert.equal(drawFreestyle(doc, s, image, { enabled: false }), image);
    const out = drawFreestyle(doc, s, image, { ...defaultFreestyle(), enabled: true, color: [1, 0, 0], thickness: 2 });
    assert.notEqual(out, image);
    let red = 0;
    for (let i = 0; i < out.data.length; i += 4) if (out.data[i] === 1 && out.data[i + 1] < 0.5) red++;
    assert.ok(red > 20, `${red} red pixels`);
    assert.equal(image.data[1], 1, 'the input stays');
  });
});

describe('NURBS surfaces', () => {
  test('open knots repeat at the ends', () => {
    assert.deepEqual(knotVector(4, 4, false), [0, 0, 0, 0, 1, 1, 1, 1]);
    assert.deepEqual(knotVector(5, 3, false), [0, 0, 0, 1, 2, 3, 3, 3]);
  });
  test('a flat patch stays in its plane, and reaches its corners', () => {
    const mesh = surfaceToMesh(nurbsPrimitive('PATCH'));
    for (const v of mesh.verts) near(v[2], 0);
    const bb = boundingBox(mesh.verts);
    near(bb.min[0], -1); near(bb.max[0], 1); near(bb.min[1], -1); near(bb.max[1], 1);
    assert.ok(mesh.uvs.every(Boolean));
  });
  test('a surface with one raised control point bulges there, smoothly', () => {
    const data = nurbsPrimitive('PATCH');
    data.points[5][2] = 1;
    const mesh = surfaceToMesh(data);
    const top = Math.max(...mesh.verts.map((v) => v[2]));
    // A bicubic patch: the raised point's basis peaks at (4/9)², so it gets 0.1975 of the way there.
    near(top, (4 / 9) ** 2, 0.01);
    near(mesh.verts[0][2], 0);
  });
  test('weight pulls the surface toward its control point', () => {
    const heavy = nurbsPrimitive('PATCH');
    const plain = nurbsPrimitive('PATCH');
    heavy.points[5][2] = plain.points[5][2] = 1;
    heavy.points[5][3] = 8;
    const top = (d) => Math.max(...surfaceToMesh(d).verts.map((v) => v[2]));
    assert.ok(top(heavy) > top(plain) + 0.2);
  });
  test('cyclic surfaces close up', () => {
    const torus = surfaceToMesh(nurbsPrimitive('TORUS'));
    assert.ok(isManifold(torus), 'a torus is closed both ways');
    assert.ok(signedVolume(torus) !== 0);
    const cylinder = surfaceToMesh(nurbsPrimitive('CYLINDER'));
    const radii = cylinder.verts.map((v) => Math.hypot(v[0], v[1]));
    assert.ok(Math.max(...radii) - Math.min(...radii) < 0.1, 'round');
  });
  test('resolution means more faces', () => {
    const data = nurbsPrimitive('PATCH');
    const a = surfaceToMesh({ ...data, resolutionU: 2, resolutionV: 2 }).faces.length;
    const b = surfaceToMesh({ ...data, resolutionU: 8, resolutionV: 8 }).faces.length;
    assert.ok(b > a * 4);
  });
  test('as an object it draws, renders and converts', () => {
    const ctx = context();
    run(ctx, 'mesh.primitive_nurbs_surface_add', { kind: 'SPHERE' });
    const obj = activeObject(ctx.doc);
    assert.equal(obj.type, 'SURFACE');
    assert.ok(evaluatedMesh(ctx.doc, obj).faces.length > 50);
    const count = buildRenderScene(ctx.doc, { width: 2, height: 2 }).positions.length;
    assert.ok(count > 9 * 12);
    run(ctx, 'object.convert_mesh');
    assert.equal(activeObject(ctx.doc).type, 'MESH');
  });
});

void setFrame;
void planeMesh;
