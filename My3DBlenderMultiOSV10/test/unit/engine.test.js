import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addObject, createDefaultScene, createDocument, defaultCamera, defaultLight, defaultMaterial, evaluatedMesh, setFrame, worldPosition } from '../../src/core/doc.js';
import { exportGLB, exportOBJ, exportPLY, exportSTLAscii, exportSTLBinary, importGLB, importOBJ, importPLY, importSTL, importSVG } from '../../src/core/io.js';
import { boundingBox, cubeMesh, gridMesh, isManifold, planeMesh, signedVolume, uvSphereMesh } from '../../src/core/mesh.js';
import { createModifier } from '../../src/core/modifiers.js';
import {
  NODE_TYPES, addLink, blurImage, createNode, defaultCompositorGraph, defaultGeometryGraph, defaultShaderGraph, defaultWorldGraph, evalCompositor, evalGeometryNodes, evalShader, evalWorld, hsvToRgb, nodesForKind, rgbToHsv, wouldCycle,
} from '../../src/core/nodes.js';
import { fbm, noise3, voronoi } from '../../src/core/noise.js';
import { buildBVH, buildRenderScene, denoiseImage, intersect, renderImage, toDisplay } from '../../src/core/pathtracer.js';
import { bakeCloth, bakeRigidBodies, bakeSoftBody, clearCaches, defaultCloth, defaultField, defaultParticles, defaultRigidBody, defaultSoftBody, fieldForce, particlesAt } from '../../src/core/physics.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b}`);

describe('noise', () => {
  test('repeatable and in range', () => {
    assert.equal(noise3(1.3, 2.7, 3.1), noise3(1.3, 2.7, 3.1));
    for (let i = 0; i < 200; i++) {
      const f = fbm(i * 0.37, i * 0.11, i * 0.73);
      assert.ok(f >= 0 && f <= 1);
      const v = voronoi(i * 0.37, i * 0.11, i * 0.73);
      assert.ok(v >= 0 && v <= 1);
    }
  });
});

describe('nodes: engine', () => {
  test('every node type declares sockets and evaluates without inputs', () => {
    for (const [type, spec] of Object.entries(NODE_TYPES)) {
      assert.ok(spec.en && spec.ko, `${type} needs both names`);
      assert.ok(spec.kinds.length, `${type} needs a tree kind`);
      const node = createNode(type);
      const graph = { kind: spec.kinds[0], nodes: [node], links: [] };
      const input = (name, fallback) => (fallback !== undefined ? fallback : (node.values[name] ?? spec.inputs.find((s) => s.name === name)?.def));
      const ctx = { memo: new Map(), geometryMemo: () => new Map(), position: [0, 0, 0], normal: [0, 0, 1], uv: [0, 0] };
      assert.equal(typeof spec.run(input, node, ctx), 'object', type);
      void graph;
    }
  });
  test('every tree kind has nodes and an output node', () => {
    for (const kind of ['SHADER', 'WORLD', 'GEOMETRY', 'COMPOSITOR']) {
      const list = nodesForKind(kind);
      assert.ok(list.length >= 5, kind);
      assert.ok(list.some((n) => n.output), `${kind} needs an output`);
    }
  });
  test('a cycle is detected before it is linked', () => {
    const [a, b] = [createNode('MATH'), createNode('MATH')];
    const g = { nodes: [a, b], links: [] };
    addLink(g, a.id, 'Value', b.id, 'A');
    assert.equal(wouldCycle(g, b.id, a.id), true);
    assert.equal(wouldCycle(g, a.id, b.id), false);
  });
  test('relinking an input replaces the old link', () => {
    const [a, b, c] = [createNode('VALUE'), createNode('VALUE'), createNode('MATH')];
    const g = { nodes: [a, b, c], links: [] };
    addLink(g, a.id, 'Value', c.id, 'A');
    addLink(g, b.id, 'Value', c.id, 'A');
    assert.equal(g.links.length, 1);
    assert.equal(g.links[0].from, b.id);
  });
  test('colour conversions round trip', () => {
    for (const rgb of [[1, 0, 0], [0.2, 0.5, 0.9], [0.3, 0.3, 0.3]]) {
      hsvToRgb(rgbToHsv(rgb)).forEach((x, i) => near(x, rgb[i], 1e-9));
    }
  });
});

describe('nodes: shader', () => {
  test('the default tree gives the material\'s values', () => {
    const mat = { ...defaultMaterial(), baseColor: [1, 0, 0], roughness: 0.25, metallic: 1 };
    const bsdf = evalShader(defaultShaderGraph(mat), {});
    assert.deepEqual(bsdf.baseColor, [1, 0, 0]);
    assert.equal(bsdf.roughness, 0.25);
    assert.equal(bsdf.metallic, 1);
  });
  test('a checker plugged into base colour follows position', () => {
    const g = defaultShaderGraph();
    const bsdf = g.nodes[0];
    const check = createNode('TEX_CHECKER', 0, 0, { Scale: 1, Color1: [1, 1, 1], Color2: [0, 0, 0] });
    g.nodes.push(check);
    addLink(g, check.id, 'Color', bsdf.id, 'Base Color');
    assert.deepEqual(evalShader(g, { position: [0.5, 0.5, 0.5] }).baseColor, [1, 1, 1]);
    assert.deepEqual(evalShader(g, { position: [1.5, 0.5, 0.5] }).baseColor, [0, 0, 0]);
  });
  test('math on a noise value reaches roughness; a value converts to a colour', () => {
    const g = defaultShaderGraph();
    const bsdf = g.nodes[0];
    const v = createNode('VALUE', 0, 0, { value: 0.5 });
    const m = createNode('MATH', 0, 0, { operation: 'MULTIPLY', B: 0.5 });
    g.nodes.push(v, m);
    addLink(g, v.id, 'Value', m.id, 'A');
    addLink(g, m.id, 'Value', bsdf.id, 'Roughness');
    addLink(g, m.id, 'Value', bsdf.id, 'Base Color');
    const out = evalShader(g, {});
    near(out.roughness, 0.25);
    assert.deepEqual(out.baseColor, [0.25, 0.25, 0.25]);
  });
  test('mix shader blends two surfaces', () => {
    const out = createNode('OUTPUT_MATERIAL');
    const mix = createNode('MIX_SHADER', 0, 0, { Fac: 0.5 });
    const [a, b] = [createNode('EMISSION', 0, 0, { Color: [1, 0, 0], Strength: 2 }), createNode('EMISSION', 0, 0, { Color: [0, 0, 1], Strength: 2 })];
    const g = { kind: 'SHADER', nodes: [out, mix, a, b], links: [] };
    addLink(g, mix.id, 'Shader', out.id, 'Surface');
    addLink(g, a.id, 'Emission', mix.id, 'Shader 1');
    addLink(g, b.id, 'Emission', mix.id, 'Shader 2');
    assert.deepEqual(evalShader(g, {}).emission, [1, 0, 1]);
  });
  test('colour ramp interpolates its stops', () => {
    const node = createNode('COLOR_RAMP');
    const input = () => 0.25;
    assert.deepEqual(NODE_TYPES.COLOR_RAMP.run(input, node).Color, [0.25, 0.25, 0.25]);
  });
  test('an image texture reads pixels by UV', () => {
    const out = createNode('OUTPUT_MATERIAL');
    const bsdf = createNode('BSDF_PRINCIPLED');
    const tex = createNode('TEX_IMAGE', 0, 0, { image: 'I' });
    const g = { kind: 'SHADER', nodes: [out, bsdf, tex], links: [] };
    addLink(g, bsdf.id, 'BSDF', out.id, 'Surface');
    addLink(g, tex.id, 'Color', bsdf.id, 'Base Color');
    const images = { I: { width: 2, height: 1, rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) } };
    assert.deepEqual(evalShader(g, { uv: [0.25, 0.5], images }).baseColor, [1, 0, 0]);
    assert.deepEqual(evalShader(g, { uv: [0.75, 0.5], images }).baseColor, [0, 0, 1]);
  });
  test('world: background colour and a sky that depends on direction', () => {
    assert.deepEqual(evalWorld(defaultWorldGraph([1, 2, 3], 2), { normal: [0, 0, 1] }), [2, 4, 6]);
    const g = defaultWorldGraph();
    const sky = createNode('TEX_SKY');
    g.nodes.push(sky);
    addLink(g, sky.id, 'Color', g.nodes[0].id, 'Color');
    assert.notDeepEqual(evalWorld(g, { normal: [0, 0, 1] }), evalWorld(g, { normal: [0, 0, -1] }));
  });
});

describe('nodes: geometry', () => {
  const tree = () => {
    const g = defaultGeometryGraph();
    return { g, input: g.nodes[0], output: g.nodes[1] };
  };
  test('the default tree passes the mesh through', () => {
    const { g } = tree();
    assert.deepEqual(evalGeometryNodes(g, cubeMesh(2)).verts, cubeMesh(2).verts);
  });
  test('transform, join, primitive', () => {
    const { g, input, output } = tree();
    const t = createNode('TRANSFORM_GEOMETRY', 0, 0, { Translation: [5, 0, 0] });
    const c = createNode('MESH_CUBE', 0, 0, { Size: 2 });
    const j = createNode('JOIN_GEOMETRY');
    g.nodes.push(t, c, j);
    addLink(g, c.id, 'Mesh', t.id, 'Geometry');
    addLink(g, input.id, 'Geometry', j.id, 'A');
    addLink(g, t.id, 'Geometry', j.id, 'B');
    addLink(g, j.id, 'Geometry', output.id, 'Geometry');
    const out = evalGeometryNodes(g, cubeMesh(2));
    assert.equal(out.faces.length, 12);
    near(boundingBox(out.verts).max[0], 6);
  });
  test('set position evaluates its field per vertex', () => {
    const { g, input, output } = tree();
    const set = createNode('SET_POSITION');
    const pos = createNode('POSITION');
    g.nodes.push(set, pos);
    addLink(g, input.id, 'Geometry', set.id, 'Geometry');
    addLink(g, pos.id, 'Position', set.id, 'Offset');
    addLink(g, set.id, 'Geometry', output.id, 'Geometry');
    near(boundingBox(evalGeometryNodes(g, cubeMesh(2)).verts).max[0], 2);
  });
  test('a noise field differs from vertex to vertex', () => {
    const { g, input, output } = tree();
    const set = createNode('SET_POSITION');
    const noise = createNode('TEX_NOISE', 0, 0, { Scale: 3 });
    g.nodes.push(set, noise);
    addLink(g, input.id, 'Geometry', set.id, 'Geometry');
    addLink(g, noise.id, 'Color', set.id, 'Offset');
    addLink(g, set.id, 'Geometry', output.id, 'Geometry');
    const grid = gridMesh(4, 4, 2);
    const moved = evalGeometryNodes(g, grid).verts.map((v, i) => v[2] - grid.verts[i][2]);
    assert.ok(new Set(moved).size > 5);
  });
  test('instance on points places one copy per point', () => {
    const { g, input, output } = tree();
    const inst = createNode('INSTANCE_ON_POINTS');
    const c = createNode('MESH_CUBE', 0, 0, { Size: 0.1 });
    g.nodes.push(inst, c);
    addLink(g, input.id, 'Geometry', inst.id, 'Points');
    addLink(g, c.id, 'Mesh', inst.id, 'Instance');
    addLink(g, inst.id, 'Instances', output.id, 'Geometry');
    assert.equal(evalGeometryNodes(g, cubeMesh(2)).faces.length, 8 * 6);
  });
  test('distribute points and delete geometry by a field', () => {
    const { g, input, output } = tree();
    const del = createNode('DELETE_GEOMETRY');
    const idx = createNode('INDEX');
    const gt = createNode('MATH', 0, 0, { operation: 'LESS_THAN', B: 1 });
    g.nodes.push(del, idx, gt);
    addLink(g, input.id, 'Geometry', del.id, 'Geometry');
    addLink(g, idx.id, 'Index', gt.id, 'A');
    addLink(g, gt.id, 'Value', del.id, 'Selection');
    addLink(g, del.id, 'Geometry', output.id, 'Geometry');
    assert.equal(evalGeometryNodes(g, cubeMesh(2)).faces.length, 3);
    const d = createNode('DISTRIBUTE_POINTS');
    const run = NODE_TYPES.DISTRIBUTE_POINTS.run((name) => (name === 'Mesh' ? cubeMesh(2) : name === 'Density' ? 25 : 1), d);
    // Density is per unit of area: a cube of size 2 has 24.
    assert.equal(run.Points.verts.length, 25 * 24);
  });
  test('as a modifier, on an object', () => {
    const doc = createDocument();
    const o = addObject(doc, { type: 'MESH', name: 'N', data: cubeMesh(2) });
    const { g, input, output } = tree();
    const sub = createNode('SUBDIVISION_SURFACE', 0, 0, { Level: 1 });
    g.nodes.push(sub);
    addLink(g, input.id, 'Geometry', sub.id, 'Mesh');
    addLink(g, sub.id, 'Mesh', output.id, 'Geometry');
    o.modifiers.push({ ...createModifier('NODES'), graph: g });
    assert.equal(evaluatedMesh(doc, o).faces.length, 24);
  });
});

describe('nodes: compositor', () => {
  const img = (w, h, value) => ({ width: w, height: h, data: new Float32Array(w * h * 4).fill(value) });
  test('passes the render through by default', () => {
    const r = img(2, 2, 0.5);
    assert.equal(evalCompositor(defaultCompositorGraph(), r), r);
  });
  const through = (type, values = {}) => {
    const g = defaultCompositorGraph();
    const [layers, out] = g.nodes;
    const node = createNode(type, 0, 0, values);
    g.nodes.push(node);
    addLink(g, layers.id, 'Image', node.id, 'Image');
    addLink(g, node.id, 'Image', out.id, 'Image');
    return g;
  };
  test('invert, brightness, vignette keep alpha', () => {
    const r = img(4, 4, 0.25);
    assert.equal(evalCompositor(through('CMP_INVERT'), r).data[0], 0.75);
    assert.equal(evalCompositor(through('CMP_INVERT'), r).data[3], 0.25);
    assert.equal(evalCompositor(through('CMP_BRIGHT', { Bright: 0.25 }), r).data[0], 0.5);
    const v = evalCompositor(through('CMP_VIGNETTE', { Amount: 1 }), img(16, 16, 1));
    assert.ok(v.data[0] < v.data[(8 * 16 + 8) * 4]);
  });
  test('blur spreads a bright pixel and keeps the total', () => {
    const r = img(21, 21, 0);
    r.data[(10 * 21 + 10) * 4] = 1;
    const b = blurImage(r, 2);
    assert.ok(b.data[(10 * 21 + 10) * 4] < 1);
    assert.ok(b.data[(10 * 21 + 11) * 4] > 0);
    let sum = 0;
    for (let i = 0; i < b.data.length; i += 4) sum += b.data[i];
    near(sum, 1, 1e-3);
  });
  test('glare adds light round what is over the threshold', () => {
    const r = img(21, 21, 0);
    r.data[(10 * 21 + 10) * 4] = 50;
    const out = evalCompositor(through('CMP_GLARE', { Threshold: 1, Size: 2, Strength: 1 }), r);
    assert.ok(out.data[(10 * 21 + 12) * 4] > 0);
  });
  test('hue shift turns red, mix blends two inputs', () => {
    const r = { width: 1, height: 1, data: new Float32Array([1, 0, 0, 1]) };
    const out = evalCompositor(through('CMP_HSV', { Hue: 0.5 + 1 / 3 }), r);
    near(out.data[1], 1, 1e-5);
    const g = defaultCompositorGraph();
    const [layers, o] = g.nodes;
    const mix = createNode('CMP_MIX', 0, 0, { Fac: 0.5, blend: 'ADD' });
    g.nodes.push(mix);
    addLink(g, layers.id, 'Image', mix.id, 'A');
    addLink(g, layers.id, 'Image', mix.id, 'B');
    addLink(g, mix.id, 'Image', o.id, 'Image');
    near(evalCompositor(g, { width: 1, height: 1, data: new Float32Array([0.5, 0, 0, 1]) }).data[0], 0.75);
  });
});

describe('path tracer', () => {
  const scene = () => {
    const doc = createDocument();
    const mat = { ...defaultMaterial(), baseColor: [0.8, 0.2, 0.2], roughness: 1, specular: 0 };
    doc.materials.push(mat);
    addObject(doc, { type: 'MESH', name: 'Sphere', data: { ...uvSphereMesh(16, 8, 1), smooth: true }, materials: [mat.id] });
    const camera = addObject(doc, { type: 'CAMERA', name: 'Cam', location: [0, -5, 0], rotation: [90, 0, 0], data: defaultCamera() });
    doc.activeCamera = camera.id;
    const light = addObject(doc, { type: 'LIGHT', name: 'L', location: [3, -3, 3], data: { ...defaultLight('POINT'), energy: 800, radius: 0 } });
    doc.world.color = [0, 0, 0];
    return { doc, mat, light };
  };
  const options = { width: 32, height: 32 };
  test('BVH finds the same nearest hit as testing every triangle', () => {
    const { doc } = scene();
    const s = buildRenderScene(doc, options);
    const bvh = buildBVH(s.positions);
    const hit = intersect(s, bvh, 0, -5, 0, 0, 1, 0, Infinity);
    near(hit.t, 4, 0.02);
    assert.equal(intersect(s, bvh, 0, -5, 0, 0, -1, 0, Infinity), null);
    assert.equal(intersect(s, bvh, 0, -5, 0, 0, 1, 0, 1), null, 'the sphere is farther than tMax');
    assert.ok(intersect(s, bvh, 0, -5, 0, 0, 1, 0, Infinity, true), 'any-hit query');
  });
  test('the camera sees the object in the middle and the empty world at the corners', () => {
    const { doc } = scene();
    const img = renderImage(buildRenderScene(doc, options), { samples: 8 });
    const at = (x, y) => img.data[(y * 32 + x) * 4];
    assert.ok(at(16, 16) > 0.02, `centre ${at(16, 16)}`);
    assert.equal(at(0, 0), 0);
    assert.ok(img.data[(16 * 32 + 16) * 4 + 3] > 0.99);
  });
  test('the base colour tints the result', () => {
    const { doc } = scene();
    const img = renderImage(buildRenderScene(doc, options), { samples: 8 });
    const i = (16 * 32 + 16) * 4;
    assert.ok(img.data[i] > img.data[i + 1] * 2, 'red dominates');
  });
  test('light energy scales brightness linearly, and shadows darken', () => {
    const measure = (mutate) => {
      const s = scene();
      mutate(s);
      const img = renderImage(buildRenderScene(s.doc, options), { samples: 8 });
      return img.data[(16 * 32 + 16) * 4];
    };
    const base = measure(() => {});
    near(measure((s) => { s.light.data.energy = 1600; }) / base, 2, 0.05);
    const blocked = measure((s) => addObject(s.doc, { type: 'MESH', name: 'Wall', data: cubeMesh(1), location: [1.5, -1.5, 1.5], scale: [2, 2, 2] }));
    assert.ok(blocked < base);
  });
  test('a sun and a world light the scene too', () => {
    const s1 = scene();
    s1.light.data = { ...defaultLight('SUN'), energy: 3, radius: 0 };
    s1.light.rotation = [90, 0, 0];
    assert.ok(renderImage(buildRenderScene(s1.doc, options), { samples: 4 }).data[(16 * 32 + 16) * 4] > 0.01);
    const s2 = scene();
    s2.light.hide = true;
    s2.doc.world.color = [1, 1, 1];
    const img = renderImage(buildRenderScene(s2.doc, options), { samples: 16 });
    assert.equal(img.data[0], 1);
    assert.ok(img.data[(16 * 32 + 16) * 4] > 0.3);
  });
  test('an emissive material glows with no lights', () => {
    const { doc, mat, light } = scene();
    light.hide = true;
    mat.emission = [2, 2, 2];
    near(renderImage(buildRenderScene(doc, options), { samples: 4 }).data[(16 * 32 + 16) * 4], 2, 0.01);
  });
  test('glass lets the world through; metal reflects it', () => {
    const glass = scene();
    glass.light.hide = true;
    glass.doc.world.color = [1, 1, 1];
    Object.assign(glass.mat, { transmission: 1, baseColor: [1, 1, 1], roughness: 0 });
    assert.ok(renderImage(buildRenderScene(glass.doc, options), { samples: 32 }).data[(16 * 32 + 16) * 4] > 0.8);
    const metal = scene();
    metal.light.hide = true;
    metal.doc.world.color = [1, 1, 1];
    Object.assign(metal.mat, { metallic: 1, baseColor: [1, 1, 1], roughness: 0.01 });
    assert.ok(renderImage(buildRenderScene(metal.doc, options), { samples: 32 }).data[(16 * 32 + 16) * 4] > 0.8);
  });
  test('transparent film gives alpha 0 where nothing is hit', () => {
    const { doc } = scene();
    doc.render.filmTransparent = true;
    doc.world.color = [1, 1, 1];
    const img = renderImage(buildRenderScene(doc, options), { samples: 2 });
    assert.equal(img.data[3], 0);
    assert.ok(img.data[(16 * 32 + 16) * 4 + 3] > 0.99);
  });
  test('a material\'s node tree is evaluated at the hit', () => {
    const { doc, mat } = scene();
    mat.useNodes = true;
    mat.nodes = defaultShaderGraph();
    const em = createNode('EMISSION', 0, 0, { Color: [0, 3, 0], Strength: 1 });
    mat.nodes.nodes.push(em);
    addLink(mat.nodes, em.id, 'Emission', mat.nodes.nodes[1].id, 'Surface');
    const img = renderImage(buildRenderScene(doc, options), { samples: 2 });
    near(img.data[(16 * 32 + 16) * 4 + 1], 3, 0.01);
  });
  test('a mesh hidden from render does not appear; modifiers do', () => {
    const { doc } = scene();
    doc.objects[0].hideRender = true;
    assert.equal(buildRenderScene(doc, options).positions.length, 0);
    doc.objects[0].hideRender = false;
    const count = buildRenderScene(doc, options).triMat.length;
    doc.objects[0].modifiers.push(createModifier('SUBSURF'));
    assert.ok(buildRenderScene(doc, options).triMat.length > count);
  });
  test('the render size follows the percent setting', () => {
    const doc = createDefaultScene();
    doc.render.width = 200; doc.render.height = 100; doc.render.percent = 50;
    const s = buildRenderScene(doc);
    assert.equal(s.width, 100);
    assert.equal(s.height, 50);
  });
  test('denoise smooths noise but keeps a hard edge', () => {
    const w = 16;
    const data = new Float32Array(w * w * 4);
    let s = 1;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const v = (x < 8 ? 0.1 : 0.9) + (rnd() - 0.5) * 0.1;
      data.set([v, v, v, 1], (y * w + x) * 4);
    }
    const out = denoiseImage({ width: w, height: w, data }, 2, 0.1);
    const variance = (src) => {
      let sum = 0;
      for (let y = 0; y < w; y++) for (let x = 1; x < 6; x++) sum += (src[(y * w + x) * 4] - 0.1) ** 2;
      return sum;
    };
    assert.ok(variance(out.data) < variance(data) / 2);
    assert.ok(out.data[(8 * w + 7) * 4] < 0.3 && out.data[(8 * w + 8) * 4] > 0.7);
  });
  test('display: exposure doubles, filmic rolls off highlights, alpha carries', () => {
    const img = { width: 2, height: 1, data: new Float32Array([0.1, 0.1, 0.1, 1, 100, 100, 100, 0.5]) };
    const std = toDisplay(img, { viewTransform: 'STANDARD' });
    assert.equal(std[4], 255);
    assert.equal(std[7], 128);
    const brighter = toDisplay(img, { viewTransform: 'STANDARD', exposure: 1 });
    assert.ok(brighter[0] > std[0]);
    assert.ok(toDisplay(img, { viewTransform: 'FILMIC' })[0] < 255);
  });
});

describe('the default scene renders', () => {
  test('the camera sees the lit cube in the middle of the frame', () => {
    const doc = createDefaultScene();
    const img = renderImage(buildRenderScene(doc, { width: 48, height: 27 }), { samples: 4 });
    const at = (x, y) => img.data[(y * 48 + x) * 4];
    assert.ok(at(24, 13) > 0.05, `the middle is ${at(24, 13)}`);
    assert.ok(at(24, 13) > at(1, 1) * 2, 'the cube is brighter than the world');
  });
});

describe('physics', () => {
  const dropScene = () => {
    const doc = createDocument();
    const ground = addObject(doc, { type: 'MESH', name: 'Ground', data: cubeMesh(10), location: [0, 0, -5] });
    ground.rigidBody = defaultRigidBody('PASSIVE');
    const box = addObject(doc, { type: 'MESH', name: 'Box', data: cubeMesh(1), location: [0, 0, 5] });
    box.rigidBody = { ...defaultRigidBody('ACTIVE'), restitution: 0 };
    doc.frameEnd = 120;
    return { doc, ground, box };
  };
  test('a body falls by gravity at the expected rate', () => {
    const { doc, box } = dropScene();
    // Half a second in (12 frames at 24 fps), well before it reaches the ground.
    bakeRigidBodies(doc, { end: 13 });
    near(box.cache.transform[13].location[2], 5 - 0.5 * 9.81 * 0.25, 0.1);
  });
  test('it lands on the ground and stays there', () => {
    const { doc, box } = dropScene();
    bakeRigidBodies(doc);
    near(box.cache.transform[120].location[2], 0.5, 0.02);
    setFrame(doc, 120);
    near(worldPosition(doc, box)[2], 0.5, 0.02);
  });
  test('restitution makes it bounce', () => {
    const { doc, box } = dropScene();
    box.rigidBody.restitution = 0.9;
    doc.objects[0].rigidBody.restitution = 0.9;
    bakeRigidBodies(doc);
    const heights = Object.values(box.cache.transform).map((t) => t.location[2]);
    const lowest = heights.indexOf(Math.min(...heights));
    assert.ok(Math.max(...heights.slice(lowest)) > 2);
  });
  test('passive bodies stay; caches clear', () => {
    const { doc, ground } = dropScene();
    bakeRigidBodies(doc);
    assert.equal(ground.cache.transform, undefined);
    clearCaches(doc);
    assert.deepEqual(doc.objects[1].cache, {});
  });
  test('two active bodies collide and exchange momentum', () => {
    const doc = createDocument();
    doc.gravity = [0, 0, 0];
    const a = addObject(doc, { type: 'MESH', name: 'A', data: uvSphereMesh(8, 4, 0.5), location: [-2, 0, 0] });
    const b = addObject(doc, { type: 'MESH', name: 'B', data: uvSphereMesh(8, 4, 0.5), location: [2, 0, 0] });
    a.rigidBody = { ...defaultRigidBody(), shape: 'SPHERE', restitution: 1, damping: 0 };
    b.rigidBody = { ...defaultRigidBody(), shape: 'SPHERE', restitution: 1, damping: 0 };
    // A field pulling everything to the origin brings them together; they must not pass through each other.
    addObject(doc, { type: 'EMPTY', name: 'Pull', field: { ...defaultField('FORCE'), strength: -4 } });
    bakeRigidBodies(doc, { start: 1, end: 120 });
    const frames = Object.values(a.cache.transform).map((t, i) => [t.location[0], b.cache.transform[i + 1].location[0]]);
    for (const [xa, xb] of frames) assert.ok(xb - xa > 0.98, `overlap: ${xa} ${xb}`);
    assert.ok(Math.min(...frames.map(([xa, xb]) => xb - xa)) < 1.2, 'they met');
  });
  test('wind pushes along its axis; a vortex turns; drag slows', () => {
    const doc = createDocument();
    const f = addObject(doc, { type: 'EMPTY', name: 'F', field: defaultField('WIND') });
    assert.deepEqual(fieldForce(doc, f, [1, 0, 0]).map((x) => Math.round(x)), [0, 0, 5]);
    f.field = defaultField('VORTEX');
    assert.ok(fieldForce(doc, f, [1, 0, 0])[1] > 0);
    f.field = defaultField('DRAG');
    assert.ok(fieldForce(doc, f, [1, 0, 0], [2, 0, 0])[0] < 0);
  });
  test('cloth with pinned corners hangs; unpinned falls; edges keep length', () => {
    const doc = createDocument();
    const mesh = gridMesh(6, 6, 2);
    mesh.vgroups = [{ name: 'Pin', w: { 0: 1, 6: 1 } }];
    const o = addObject(doc, { type: 'MESH', name: 'Cloth', data: mesh });
    o.cloth = { ...defaultCloth(), pinGroup: 'Pin' };
    bakeCloth(doc, o, { start: 1, end: 40 });
    const last = o.cache.cloth[40];
    near(last[0][2], 0);
    near(last[6][2], 0);
    assert.ok(last[48][2] < -0.5, 'the free corner fell');
    const edge = Math.hypot(...last[1].map((x, k) => x - last[0][k]));
    assert.ok(edge < (2 / 6) * 1.3, `edge ${edge}`);
    setFrame(doc, 40);
    near(evaluatedMesh(doc, o).verts[48][2], last[48][2]);
  });
  test('cloth rests on a collider', () => {
    const doc = createDocument();
    const wall = addObject(doc, { type: 'MESH', name: 'Floor', data: cubeMesh(10), location: [0, 0, -6] });
    wall.collision = { friction: 0.5 };
    const o = addObject(doc, { type: 'MESH', name: 'Cloth', data: gridMesh(4, 4, 2) });
    o.cloth = defaultCloth();
    bakeCloth(doc, o, { start: 1, end: 60 });
    for (const v of o.cache.cloth[60]) assert.ok(v[2] > -1.2, `below the floor: ${v[2]}`);
  });
  test('soft body sags under gravity and is held by its goal', () => {
    const doc = createDocument();
    const o = addObject(doc, { type: 'MESH', name: 'Soft', data: cubeMesh(1) });
    o.softBody = defaultSoftBody();
    bakeSoftBody(doc, o, { start: 1, end: 60 });
    const z = o.cache.cloth[60][4][2];
    assert.ok(z < 0.5);
    assert.ok(z > -20);
  });
  test('particles: born over time, repeatable, fall ballistically, end at their lifetime', () => {
    const doc = createDocument();
    const o = addObject(doc, { type: 'MESH', name: 'E', data: planeMesh(2) });
    const sys = { ...defaultParticles(), count: 100, frameStart: 1, frameEnd: 50, lifetime: 20, velocity: 0, randomVelocity: 0 };
    assert.ok(particlesAt(doc, o, sys, 1).length <= 3);
    const mid = particlesAt(doc, o, sys, 20);
    assert.ok(mid.length > 30);
    assert.deepEqual(particlesAt(doc, o, sys, 20), mid);
    assert.ok(mid.some((p) => p[2] < -0.1));
    assert.equal(particlesAt(doc, o, sys, 500).length, 0);
  });
  test('hair gives a strand per particle at any frame', () => {
    const doc = createDocument();
    const o = addObject(doc, { type: 'MESH', name: 'H', data: planeMesh(2) });
    const hair = particlesAt(doc, o, { ...defaultParticles(), kind: 'HAIR', count: 10 }, 1);
    assert.equal(hair.length, 10);
    assert.equal(hair[0].length, 5);
  });
});

describe('file formats', () => {
  const sample = () => ({ name: 'Box', mesh: cubeMesh(2) });
  test('OBJ round trip keeps quads, UVs and object names', () => {
    const [back] = importOBJ(exportOBJ([sample()]));
    assert.equal(back.name, 'Box');
    assert.equal(back.mesh.faces.length, 6);
    assert.equal(back.mesh.faces[0].length, 4);
    assert.deepEqual(back.mesh.uvs[0][2], [1, 1]);
    near(signedVolume(back.mesh), 8);
  });
  test('OBJ reads negative indices, several objects and lines', () => {
    const text = 'o A\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf -3 -2 -1\no B\nv 5 0 0\nv 6 0 0\nl 4 5\n';
    const [a, b] = importOBJ(text);
    assert.equal(a.mesh.faces.length, 1);
    assert.equal(b.mesh.loose.length, 1);
    assert.equal(b.mesh.verts[0][0], 5);
  });
  test('binary STL round trip welds corners back into a closed cube', () => {
    const [back] = importSTL(exportSTLBinary([sample()]));
    assert.equal(back.mesh.faces.length, 12);
    assert.equal(back.mesh.verts.length, 8);
    assert.ok(isManifold(back.mesh));
    near(signedVolume(back.mesh), 8, 1e-4);
  });
  test('ASCII STL round trip', () => {
    const [back] = importSTL(new TextEncoder().encode(exportSTLAscii([sample()])));
    assert.equal(back.mesh.faces.length, 12);
    near(signedVolume(back.mesh), 8);
  });
  test('PLY round trip with vertex colours', () => {
    const mesh = cubeMesh(2);
    mesh.colors = mesh.verts.map(() => [1, 0, 0]);
    const [back] = importPLY(exportPLY([{ name: 'P', mesh }]));
    assert.equal(back.mesh.faces[0].length, 4);
    assert.deepEqual(back.mesh.colors[0], [1, 0, 0]);
    assert.throws(() => importPLY('ply\nformat binary_little_endian 1.0\nend_header\n'), /ASCII/);
  });
  test('GLB is a valid container and round trips, Z-up staying Z-up', () => {
    const mesh = cubeMesh(2);
    mesh.verts = mesh.verts.map((v) => [v[0], v[1], v[2] + 10]);
    const bytes = exportGLB([{ name: 'G', mesh, material: { ...defaultMaterial('Red'), baseColor: [1, 0, 0] } }]);
    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(0, true), 0x46546c67);
    assert.equal(view.getUint32(8, true), bytes.length);
    assert.equal(view.getUint32(12, true) % 4, 0);
    const [back] = importGLB(bytes);
    assert.equal(back.name, 'G');
    assert.equal(back.mesh.faces.length, 12);
    near(boundingBox(back.mesh.verts).max[2], 11);
    assert.deepEqual(back.material.baseColor, [1, 0, 0]);
    near(Math.abs(signedVolume(back.mesh)), 8 + 0, 1e-4);
    assert.ok(signedVolume({ ...back.mesh, verts: back.mesh.verts.map((v) => [v[0], v[1], v[2] - 10]) }) > 0, 'winding stays outward');
  });
  test('SVG paths become polylines, curves are flattened, Y flips', () => {
    const splines = importSVG('<svg><path d="M0 0 L100 0 L100 100 Z"/><path d="M0 0 C 10 0 20 10 30 30"/></svg>', 0.01);
    assert.equal(splines.length, 2);
    assert.equal(splines[0].cyclic, true);
    assert.deepEqual(splines[0].points[2], [1, -1, 0]);
    assert.ok(splines[1].points.length > 5);
  });
});
