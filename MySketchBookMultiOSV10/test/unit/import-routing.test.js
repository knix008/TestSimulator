// File › Import… routing (io/routing.js + io/importers.js), texture/environment name rules (io/texformats.js)
// and decoding of the sample textures and environments (io/textures.js, samples/ made by
// scripts/make-texture-samples.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createImportRouter, extensionsFromAccept, IMPORT_KINDS } from '../../src/io/routing.js';
import { appImportRouter } from '../../src/io/importers.js';
import { groupTextureSets, isEnvironmentName, isHdrName, isTextureName, textureFormatOf, textureSlotOf, textureSetKey, TEXTURE_EXTENSIONS } from '../../src/io/texformats.js';
import { environmentTexture, hdrEnvironment, ldrToLinearHalf, parseTextureData } from '../../src/io/textures.js';
import { tileRepeat, userEnvironmentAsset, isUserEnvironment } from '../../src/engine/usertextures.js';
import { packProject, unpackProject } from '../../src/engine/fileformat.js';
import { createProject } from '../../src/engine/document.js';
import { MODEL_EXTENSIONS } from '../../src/io/formats.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sample = (...parts) => readFileSync(path.join(root, 'samples', ...parts));
// ui/plan-import.js needs Vite (the library catalog): its name rules as it has them (plans, buildings, pictures).
const PLAN_RULES = {
  PLAN_ACCEPT: '.dxf,.dwg,.svg,.pdf,.ifc,.sh3d,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff,.tga,.avif,.heic,.heif',
  BUILDING_ACCEPT: '.ifc,.sh3d',
  isBuildingName: (n) => /.(ifc|sh3d)$/i.test(n ?? ''),
  isPlanName: (n) => /.(dxf|dwg|svg|pdf|ifc|sh3d)$/i.test(n ?? ''),
  isPlanImageName: (n) => /.(png|jpe?g|webp|bmp|gif|tiff?|tga|avif|heic|heif)$/i.test(n ?? ''),
};
const router = appImportRouter(PLAN_RULES);

test('classify: each kind of file goes to its importer', () => {
  const cases = {
    'house.msk': 'project',
    'chair.glb': 'model', 'Chair.FBX': 'model', 'scan.ply': 'model', 'model.skp': 'model',
    'plan.dxf': 'plan', 'plan.dwg': 'plan', 'plan.svg': 'plan', 'plan.pdf': 'plan', 'house.ifc': 'building', 'home.sh3d': 'building',
    'brick.tga': 'texture', 'tiles.dds': 'texture', 'terrazzo.ktx2': 'texture', 'wood.tif': 'texture', 'stone.TIFF': 'texture',
    'sky.hdr': 'environment', 'studio.exr': 'environment',
    'photo.png': 'image', 'photo.JPG': 'image', 'photo.jpeg': 'image', 'photo.webp': 'image',
    'chair.mtl': 'companion', 'scene.bin': 'companion',
    'notes.txt': null, 'archive.rar': null, 'noext': null, '': null,
  };
  for (const [name, kind] of Object.entries(cases)) {
    // TGA/TIFF/AVIF may also become plan pictures (ui/plan-import.js): then they are 'image' (the user picks).
    const got = router.classify(name);
    if (kind === 'texture' && got === 'image') { assert.ok(router.usesOf(name).includes('texture'), name); continue; }
    assert.equal(got, kind, name);
  }
});

test('classify: pictures list what they can be used as', () => {
  assert.deepEqual(router.usesOf('photo.png'), ['plan', 'texture', 'environment']);
  assert.ok(router.usesOf('brick.tga').includes('texture'));
  assert.ok(!router.usesOf('brick.tga').includes('environment'));
  assert.deepEqual(router.usesOf('sky.hdr'), ['texture', 'environment']);
  assert.deepEqual(router.usesOf('chair.glb'), []);
});

test('route: a model takes its .mtl, .bin and textures along; other kinds stay apart', () => {
  const g = router.route(['chair.obj', 'chair.mtl', 'wood.png', 'fabric.tga', 'sky.hdr', 'plan.dxf', 'x.msk', 'readme.txt']);
  assert.deepEqual(g.model, ['chair.obj', 'chair.mtl', 'wood.png', 'fabric.tga']);
  assert.deepEqual(g.environment, ['sky.hdr']);
  assert.deepEqual(g.plan, ['plan.dxf']);
  assert.deepEqual(g.project, ['x.msk']);
  assert.deepEqual(g.unknown, ['readme.txt']);
  assert.deepEqual(g.image, []);
});

test('route: without a model, pictures and side files are what they are', () => {
  const g = router.route([{ name: 'wood.png' }, { name: 'brick.dds' }, { name: 'chair.mtl' }, { name: 'sky.exr' }]);
  assert.deepEqual(g.image.map((f) => f.name), ['wood.png']);
  assert.deepEqual(g.texture.map((f) => f.name), ['brick.dds']);
  assert.deepEqual(g.environment.map((f) => f.name), ['sky.exr']);
  assert.deepEqual(g.unknown.map((f) => f.name), ['chair.mtl']);
  assert.deepEqual(g.model, []);
});

test('filters: All supported first, then one group per importer, from the importers\' own lists', () => {
  const filters = router.filters((id) => `L:${id}`);
  assert.deepEqual(filters.map((f) => f.id), ['all', 'project', 'model', 'plan', 'texture', 'environment']);
  assert.equal(filters[0].name, 'L:all');
  const byId = Object.fromEntries(filters.map((f) => [f.id, f.extensions]));
  assert.deepEqual(byId.project, ['msk']);
  for (const ext of MODEL_EXTENSIONS) assert.ok(byId.model.includes(ext), `model filter has .${ext}`);
  assert.ok(byId.model.includes('mtl') && byId.model.includes('bin'));
  for (const ext of ['dxf', 'dwg', 'svg', 'pdf', 'ifc', 'sh3d']) assert.ok(byId.plan.includes(ext), `plan filter has .${ext}`);
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tga', 'tif', 'tiff', 'dds', 'ktx2', 'exr', 'hdr']) assert.ok(byId.texture.includes(ext), `texture filter has .${ext}`);
  for (const ext of ['hdr', 'exr', 'jpg', 'png']) assert.ok(byId.environment.includes(ext), `environment filter has .${ext}`);
  // "All" is every group together, without duplicates or dots.
  const all = new Set(filters.slice(1).flatMap((f) => f.extensions));
  assert.equal(filters[0].extensions.length, all.size);
  assert.ok(filters[0].extensions.every((e) => /^[a-z0-9]+$/.test(e)));
  assert.match(router.accept(), /^\.msk,/);
  assert.match(router.summary(), /texture: .*\.ktx2/);
});

test('router: new formats of an importer are picked up through its predicates', () => {
  const r = createImportRouter({
    isModel: (n) => /\.(glb|step)$/i.test(n), isPlan: (n) => /\.(dxf|pdf)$/i.test(n), isBuilding: (n) => /\.(ifc|sh3d)$/i.test(n),
    isPlanImage: (n) => /\.(png|tif)$/i.test(n), isTexture: (n) => /\.(png|tif|dds)$/i.test(n),
    extensions: { model: ['glb', 'step'], plan: ['dxf', 'pdf'], building: ['ifc', 'sh3d'] },
  });
  assert.equal(r.classify('part.step'), 'model');
  assert.equal(r.classify('floor.pdf'), 'plan');
  assert.equal(r.classify('house.ifc'), 'building');
  assert.equal(r.classify('home.sh3d'), 'building');
  assert.equal(r.classify('scan.tif'), 'image');
  assert.equal(r.classify('tiles.dds'), 'texture');
  const plan = r.filters().find((f) => f.id === 'plan');
  assert.deepEqual(plan.extensions, ['dxf', 'pdf', 'ifc', 'sh3d']);
  assert.ok(!r.filters().some((f) => f.id === 'environment'), 'empty groups are left out');
  assert.deepEqual(IMPORT_KINDS, ['project', 'model', 'plan', 'building', 'texture', 'environment']);
  assert.deepEqual(extensionsFromAccept('.dxf, .DWG,svg'), ['dxf', 'dwg', 'svg']);
});

test('texture names: formats, HDR, slots and sets', () => {
  for (const ext of TEXTURE_EXTENSIONS) assert.ok(isTextureName(`a.${ext}`), ext);
  assert.equal(textureFormatOf('A.JPEG').id, 'jpeg');
  assert.equal(textureFormatOf('x.ktx2').compressed, true);
  assert.ok(isHdrName('sky.exr') && isHdrName('sky.hdr') && !isHdrName('sky.png'));
  assert.ok(isEnvironmentName('pano.jpg') && !isEnvironmentName('brick.tga') && !isEnvironmentName('x.dds'));
  assert.equal(textureSlotOf('brick_nor_gl_1k.png'), 'normal');
  assert.equal(textureSlotOf('Brick-Normal.tga'), 'normal');
  assert.equal(textureSlotOf('brick_rough.tif'), 'roughness');
  assert.equal(textureSlotOf('brick_diff.tga'), 'color');
  assert.equal(textureSlotOf('rough_stone.png'), 'color', 'a slot word only counts as a suffix');
  assert.equal(textureSetKey('Brick_nor_gl_1k.png'), 'brick');
  const sets = groupTextureSets(['brick_diff.tga', 'brick_nor_gl.png', 'brick_rough.tif', 'oak.webp', 'only_nor.png']);
  assert.equal(sets.length, 3);
  assert.deepEqual(sets[0], { key: 'brick', name: 'brick', color: 'brick_diff.tga', normal: 'brick_nor_gl.png', roughness: 'brick_rough.tif' });
  assert.deepEqual(sets[1], { key: 'oak', name: 'oak', color: 'oak.webp', normal: null, roughness: null });
  assert.equal(sets[2].color, 'only_nor.png', 'a set without a colour map uses its map as colour');
  assert.equal(sets[2].normal, null);
});

test('decoding: the sample TGA, TIFF, DDS, EXR and HDR files', { skip: !existsSync(path.join(root, 'samples', 'textures', 'brick_diff.tga')) && 'run node scripts/make-texture-samples.mjs' }, () => {
  const tga = parseTextureData('brick_diff.tga', sample('textures', 'brick_diff.tga'));
  assert.equal(tga.width, 512); assert.equal(tga.height, 256); assert.equal(tga.data.length, 512 * 256 * 4);
  // A brick pixel is reddish (the mortar at the corner is grey).
  const i = (100 * 512 + 60) * 4;
  assert.ok(tga.data[i] > tga.data[i + 2] + 40, `brick colour ${[...tga.data.slice(i, i + 3)]}`);
  const tif = parseTextureData('brick_rough.tif', sample('textures', 'brick_rough.tif'));
  assert.equal(tif.width, 512); assert.equal(tif.height, 256);
  const dds = parseTextureData('tiles-30cm.dds', sample('textures', 'tiles-30cm.dds'));
  assert.equal(dds.width, 256); assert.equal(dds.format, THREE.RGB_S3TC_DXT1_Format);
  assert.equal(dds.mipmaps.length, 9);
  const exr = parseTextureData('marble.exr', sample('textures', 'marble.exr'));
  assert.equal(exr.width, 256); assert.equal(exr.type, THREE.HalfFloatType);
  const v = THREE.DataUtils.fromHalfFloat(exr.data[0]);
  assert.ok(v > 0.05 && v < 1.5, `marble value ${v}`);
  assert.throws(() => parseTextureData('broken.tga', new Uint8Array([1, 2, 3])), (e) => e.code === 'texture-unreadable');
  assert.throws(() => parseTextureData('photo.png', new Uint8Array(8)), (e) => e.code === 'texture-unreadable');
});

test('environments: HDR and EXR panoramas become linear equirect textures, brightest at the sun', { skip: !existsSync(path.join(root, 'samples', 'environments', 'sunset-sky.hdr')) && 'run node scripts/make-texture-samples.mjs' }, () => {
  const hdr = hdrEnvironment('sunset-sky.hdr', sample('environments', 'sunset-sky.hdr'));
  assert.equal(hdr.image.width, 1024); assert.equal(hdr.image.height, 512);
  assert.equal(hdr.mapping, THREE.EquirectangularReflectionMapping);
  assert.equal(hdr.colorSpace, THREE.LinearSRGBColorSpace);
  // The sun (sample: altitude 0.12 rad, azimuth 1.2 rad) is far brighter than 1 — real HDR data.
  // Rows counted from the top of the picture, whichever way the loader stored them (flipY true: first row = top).
  const fromTop = (tex, x, y) => { const { data, width, height } = tex.image; const row = tex.flipY ? y : height - 1 - y; return THREE.DataUtils.fromHalfFloat(data[(row * width + x) * 4]); };
  const { width, height } = hdr.image;
  const at = (x, y) => fromTop(hdr, x, y);
  const sunX = Math.round((1.2 / (Math.PI * 2)) * width); const sunY = Math.round((0.5 - 0.12 / Math.PI) * height);
  assert.ok(at(sunX, sunY) > 10, `sun radiance ${at(sunX, sunY)}`);
  assert.ok(at(10, height - 5) < 1, 'the ground is dark');
  const exr = hdrEnvironment('overcast-sky.exr', sample('environments', 'overcast-sky.exr'));
  assert.equal(exr.image.width, 512);
  const top = fromTop(exr, 100, 10);
  const bottom = fromTop(exr, 100, 250);
  assert.ok(top > bottom, `sky (${top}) above ground (${bottom})`);
  assert.throws(() => hdrEnvironment('brick.tga', sample('textures', 'brick_diff.tga')), (e) => e.code === 'texture-unreadable');
});

test('environments: an 8-bit picture becomes linear half floats', () => {
  const half = ldrToLinearHalf(new Uint8Array([255, 128, 0, 77, 10, 20, 30, 255]));
  assert.equal(THREE.DataUtils.fromHalfFloat(half[0]), 1);
  assert.ok(Math.abs(THREE.DataUtils.fromHalfFloat(half[1]) - 0.2158) < 0.002);
  assert.equal(THREE.DataUtils.fromHalfFloat(half[2]), 0);
  assert.equal(THREE.DataUtils.fromHalfFloat(half[3]), 1, 'alpha is opaque');
  const tex = environmentTexture({ data: half, width: 2, height: 1 });
  assert.equal(tex.type, THREE.HalfFloatType);
  assert.equal(tex.flipY, true, 'pictures: the first row is the top');
});

test('user textures: tile size, environment ids', () => {
  assert.deepEqual(tileRepeat([2, 0.5]), [0.5, 2]);
  assert.deepEqual(tileRepeat(0.25), [4, 4]);
  assert.deepEqual(tileRepeat(null), [1, 1]);
  assert.deepEqual(tileRepeat([0, -1]), [1, 1]);
  assert.ok(isUserEnvironment('user:env-1') && !isUserEnvironment('venice_sunset'));
  assert.equal(userEnvironmentAsset('user:env-1'), 'env-1');
  assert.equal(userEnvironmentAsset('room'), null);
});

test('.msk keeps texture and environment pictures', () => {
  const project = createProject({ name: 'tex' });
  const tga = new Uint8Array([1, 2, 3, 4]);
  const hdr = new Uint8Array([5, 6, 7]);
  project.assets['tx-1'] = { kind: 'texture', name: 'brick', ext: 'tga', source: 'brick.tga', bytes: 4 };
  project.assets['env-1'] = { kind: 'environment', name: 'sky', ext: 'hdr', source: 'sky.hdr', bytes: 3 };
  project.materials.push({ id: 'mat-1', ko: 'brick', en: 'brick', color: '#ffffff', roughness: 0.7, metalness: 0, category: 'other', maps: { color: 'tx-1' }, textureSize: [1, 0.5] });
  project.style.environment = 'user:env-1';
  const back = unpackProject(packProject(project, new Map([['tx-1', tga], ['env-1', hdr]])));
  assert.deepEqual([...back.assets.get('tx-1')], [...tga]);
  assert.deepEqual([...back.assets.get('env-1')], [...hdr]);
  assert.deepEqual(back.project.materials[0].maps, { color: 'tx-1' });
  assert.deepEqual(back.project.materials[0].textureSize, [1, 0.5]);
  assert.equal(back.project.style.environment, 'user:env-1');
});
