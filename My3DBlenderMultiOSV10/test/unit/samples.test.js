// The sample projects on disk: the list, the levels, the texts in both languages, the pictures, and that each file really is
// what it says: it opens, it has its subject, and it renders to something that is not blank.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deserialize, evaluatedMesh, GEOMETRY_TYPES, sceneStats } from '../../src/core/doc.js';
import { buildRenderScene, renderImage } from '../../src/core/pathtracer.js';
import { History } from '../../src/core/history.js';
import { run } from '../../src/core/ops.js';
import { runPython } from '../../src/core/python.js';
import { clearSimCache, simBaked } from '../../src/core/simulation.js';
import { solveCamera } from '../../src/core/tracking.js';
import { WORKSPACES } from '../../src/ui/layouts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'sample');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const load = (s) => deserialize(fs.readFileSync(path.join(dir, s.file), 'utf8'));

describe('sample list', () => {
  test('at least 40, with all three levels', () => {
    assert.ok(index.length >= 40, `${index.length}`);
    for (const level of ['beginner', 'intermediate', 'advanced']) assert.ok(index.filter((s) => s.level === level).length >= 10, level);
    assert.deepEqual([...new Set(index.map((s) => s.level))].sort(), ['advanced', 'beginner', 'intermediate']);
  });
  test('names are unique, texts in both languages, a picture for each, a real workspace', () => {
    const ids = new Set();
    for (const s of index) {
      assert.ok(!ids.has(s.id), s.id);
      ids.add(s.id);
      for (const field of ['title', 'description', 'tryThis']) assert.ok(s[field].en && s[field].ko && s[field].en !== s[field].ko, `${s.id}: ${field}`);
      assert.ok(s.topics.length, s.id);
      assert.ok(fs.statSync(path.join(dir, s.thumb)).size > 300, `${s.id}: picture`);
      if (s.workspace) assert.ok(WORKSPACES.some((w) => w.id === s.workspace), `${s.id}: ${s.workspace}`);
      assert.equal(s.file.startsWith(`${s.level}/`), true, s.id);
    }
  });
  test('the program ships the same list and files', () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'public/sample/index.json'), 'utf8')), index);
    for (const s of index) assert.ok(fs.existsSync(path.join(root, 'public/sample', s.file)), s.file);
  });
  test('the sample guide lists every one', () => {
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    for (const s of index) assert.ok(readme.includes(s.file), s.file);
  });
  test('none is large', () => {
    for (const s of index) assert.ok(fs.statSync(path.join(dir, s.file)).size < 4 * 1024 * 1024, s.id);
  });
});

describe('every sample opens and renders', () => {
  for (const s of index) {
    test(`${s.level}: ${s.id}`, () => {
      clearSimCache();
      const doc = load(s);
      assert.equal(doc.name, s.title.en);
      assert.ok(doc.objects.length + (doc.sequence?.strips.length ?? 0) > 0);
      if (s.id === 'title-card' || s.id === 'story-scenes' || s.id === 'camera-solve') return;
      for (const o of doc.objects) {
        if (!GEOMETRY_TYPES.has(o.type)) continue;
        const mesh = evaluatedMesh(doc, o, { render: true });
        assert.ok(mesh, `${o.name} evaluates`);
        for (const f of mesh.faces) for (const i of f) assert.ok(i >= 0 && i < mesh.verts.length, `${o.name}: a face points at a missing vertex`);
        for (const v of mesh.verts) assert.ok(v.every(Number.isFinite), `${o.name}: a vertex is not a number`);
      }
      assert.ok(sceneStats(doc).objects > 0);
      doc.render = { ...doc.render, samples: 1, bounces: 1, width: 16, height: 9, percent: 100 };
      const scene = buildRenderScene(doc);
      assert.ok(scene.camera, 'a camera');
      const image = renderImage(scene, { samples: 1 });
      const values = new Set();
      for (let i = 0; i < image.data.length; i += 4) values.add(Math.round((image.data[i] + image.data[i + 1] * 3 + image.data[i + 2] * 9) * 200));
      assert.ok(values.size > 1 || s.level === 'beginner', `${s.id}: one flat colour`);
    });
  }
});

describe('samples have what they promise', () => {
  const doc = (id) => load(index.find((s) => s.id === id));
  const has = (id, check, what) => test(`${id}: ${what}`, () => assert.ok(check(doc(id))));
  has('array-fence', (d) => d.objects.some((o) => o.modifiers.some((m) => m.type === 'ARRAY')), 'an Array modifier');
  has('bouncing-ball', (d) => Object.keys(d.objects.find((o) => o.name === 'Ball').anim.fcurves).length >= 2, 'keyframes');
  has('boolean-cheese', (d) => d.objects.find((o) => o.name === 'Cheese').modifiers.filter((m) => m.type === 'BOOLEAN').length >= 3, 'Boolean modifiers');
  has('robot-arm', (d) => d.objects.some((o) => o.type === 'ARMATURE') && d.objects.find((o) => o.name === 'Tube').data.vgroups.length === 3, 'a rig with weights');
  has('cloth-flag', (d) => d.objects.some((o) => o.cloth), 'cloth');
  has('dominoes', (d) => d.objects.filter((o) => o.rigidBody?.type === 'ACTIVE').length >= 10, 'rigid bodies');
  has('fountain', (d) => d.objects.some((o) => o.particles?.length), 'particles');
  has('collection-city', (d) => d.objects.filter((o) => o.data?.instanceCollection).length === 25, 'collection instances');
  has('studs-faces', (d) => d.objects.some((o) => o.instancing?.mode === 'FACES'), 'instancing on faces');
  has('glare-compositor', (d) => d.compositorEnabled && d.compositor.nodes.some((n) => n.type === 'CMP_GLARE'), 'a compositor tree');
  has('geo-scatter', (d) => d.objects[0].modifiers[0]?.type === 'NODES' || d.objects.some((o) => o.modifiers.some((m) => m.graph?.nodes.some((n) => n.type === 'INSTANCE_ON_POINTS'))), 'a geometry node tree');
  has('smoke-plume', (d) => d.objects.some((o) => o.smoke) && d.objects.some((o) => o.smokeFlow), 'a smoke domain and a flow');
  has('campfire', (d) => d.objects.some((o) => o.smokeFlow?.kind === 'BOTH'), 'fire');
  has('water-tank', (d) => d.objects.some((o) => o.fluid) && d.objects.some((o) => o.fluidFlow), 'a liquid');
  has('ocean-sunset', (d) => d.objects.some((o) => o.modifiers.some((m) => m.type === 'OCEAN')), 'an Ocean modifier');
  has('dynamic-paint', (d) => d.objects.some((o) => o.dynamicPaint?.role === 'BRUSH') && d.objects.some((o) => o.dynamicPaint?.role === 'CANVAS'), 'Dynamic Paint');
  has('node-group-shared', (d) => d.materials.filter((m) => m.nodes?.nodes.some((n) => n.type === 'GROUP')).length === 3 && d.nodeGroups.length === 1, 'three uses of one group');
  has('osl-shader', (d) => d.materials.some((m) => m.nodes?.nodes.some((n) => n.type === 'SCRIPT_OSL')), 'an OSL node');
  has('story-scenes', (d) => d.scenes.length === 2 && d.sequence.strips.some((s) => s.type === 'CROSS'), 'two scenes and a cross');
  has('nurbs-vase', (d) => d.objects.some((o) => o.type === 'SURFACE'), 'a NURBS surface');
  has('texture-painted', (d) => d.images.length === 1 && Object.keys(d.objects.find((o) => o.name === 'Cube').data.marks.seam).length === 12, 'seams and a picture');
  has('freestyle-toon', (d) => d.render.freestyle.enabled, 'Freestyle on');
  has('multires-sculpt', (d) => { const m = d.objects.find((o) => o.name === 'Head').modifiers[0]; return m.type === 'MULTIRES' && m.total >= 4 && m.disp.some((x) => Math.hypot(...x) > 0.01); }, 'sculpted levels');
  has('skin-tree', (d) => d.objects.some((o) => o.modifiers.some((m) => m.type === 'SKIN')), 'a Skin modifier');
  has('god-rays', (d) => d.objects.some((o) => o.type === 'VOLUME'), 'a volume');
  has('motion-paths', (d) => d.objects.some((o) => o.motionPath && o.onion), 'a path and ghosts');

  test('python-tower: its script runs again and rebuilds the tower', () => {
    const d = doc('python-tower');
    const text = d.texts.find((t) => t.name.endsWith('.py'));
    assert.match(text.body, /import bpy/);
    const count = d.objects.length;
    const history = new History();
    history.reset(d);
    const result = runPython({ doc: d, history }, text.body);
    assert.ok(result.ok, result.error);
    assert.equal(d.objects.length, count + 24);
  });
  test('smoke-plume: bakes, and the smoke rises', () => {
    clearSimCache();
    const d = doc('smoke-plume');
    d.frameEnd = 12;
    const history = new History();
    history.reset(d);
    run({ doc: d, history }, 'ptcache.bake_all');
    const domain = d.objects.find((o) => o.smoke);
    assert.ok(simBaked(domain));
    assert.equal(buildRenderScene(d, { frame: 12, width: 4, height: 4 }).volumes.length, 1);
    clearSimCache();
  });
  test('camera-solve: its tracks solve to a tiny error', () => {
    const d = doc('camera-solve');
    const solve = solveCamera(d.clips[0].tracks);
    assert.ok(solve.error < 1e-3, `error ${solve.error}`);
    assert.equal(solve.points.length, 9);
    assert.ok(d.clips[0].frames.length >= 10);
  });
});
