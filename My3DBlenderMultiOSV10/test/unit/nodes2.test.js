// More nodes, and video files.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { NODE_TYPES, addLink, createNode, defaultShaderGraph, evalCompositor, evalGeometryNodes, evalShader, nodesForKind } from '../../src/core/nodes.js';
import { cubeMesh, createMesh } from '../../src/core/mesh.js';
import { inspectMP4, muxAVI, muxMP4 } from '../../src/core/videofile.js';

const near = (a, b, tolerance = 1e-3) => assert.ok(Math.abs(a - b) <= tolerance, `${a} against ${b}`);
const close = (a, b, tolerance = 1e-3) => a.forEach((x, i) => near(x, b[i], tolerance));

/** Runs one node's output with these values on its unconnected inputs. */
const runNode = (type, values = {}, ctx = {}) => {
  const node = createNode(type, 0, 0, values);
  const spec = NODE_TYPES[type];
  const input = (name, fallback) => { if (node.values[name] !== undefined) return node.values[name]; if (fallback !== undefined) return fallback; return spec.inputs.find((s) => s.name === name)?.def; };
  return spec.run(input, node, { memo: new Map(), geometryMemo: () => new Map(), ...ctx });
};
const image = (w, h, fn) => { const data = new Float32Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4); return { width: w, height: h, data }; };
const pixel = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe('more shader nodes', () => {
  test('counts: the node list is what the checklist says', () => {
    assert.ok(nodesForKind('SHADER').length >= 45, `${nodesForKind('SHADER').length} shader nodes`);
    assert.ok(nodesForKind('GEOMETRY').length >= 40, `${nodesForKind('GEOMETRY').length} geometry nodes`);
    assert.ok(nodesForKind('COMPOSITOR').length >= 25, `${nodesForKind('COMPOSITOR').length} compositor nodes`);
  });
  test('Fresnel: low head on, one at the edge; Layer Weight likewise', () => {
    const head = runNode('FRESNEL', { IOR: 1.5 }, { view: [0, 0, 1], normal: [0, 0, 1] }).Fac;
    near(head, 0.04);
    near(runNode('FRESNEL', { IOR: 1.5 }, { view: [1, 0, 0], normal: [0, 0, 1] }).Fac, 1);
    near(runNode('LAYER_WEIGHT', { Blend: 0.5 }, { view: [0, 0, 1], normal: [0, 0, 1] }).Facing, 0);
    near(runNode('LAYER_WEIGHT', { Blend: 0.5 }, { view: [1, 0, 0], normal: [0, 0, 1] }).Facing, 1);
  });
  test('Light Path knows the camera ray from a bounce', () => {
    assert.equal(runNode('LIGHT_PATH', {}, { depth: 0 })['Is Camera Ray'], 1);
    assert.equal(runNode('LIGHT_PATH', {}, { depth: 2 })['Is Camera Ray'], 0);
    assert.equal(runNode('LIGHT_PATH', {}, { depth: 2 })['Ray Depth'], 2);
  });
  test('Wave stripes repeat; Brick has mortar and brick, offset every other row', () => {
    const at = (x) => runNode('TEX_WAVE', { Scale: 1, Vector: [x, 0, 0] }).Fac;
    near(at(0.25), at(2.25));
    assert.ok(at(0) < 0.1 && at(1) > 0.9, 'from dark to light over a unit');
    const brick = (x, y) => runNode('TEX_BRICK', { Scale: 1, Vector: [x, y, 0] }).Fac;
    assert.equal(brick(0.25, 0.125), 0, 'brick');
    assert.equal(brick(0.5, 0.125), 1, 'mortar between two in a row');
    assert.equal(brick(0.25, 0.375), 1, 'the next row is shifted: mortar here');
  });
  test('Blackbody: low is red, high is blue; Wavelength peaks where it should', () => {
    const red = runNode('BLACKBODY', { Temperature: 1500 }).Color;
    const blue = runNode('BLACKBODY', { Temperature: 12000 }).Color;
    assert.ok(red[0] > red[2] * 5);
    assert.ok(blue[2] >= blue[0]);
    const green = runNode('WAVELENGTH', { Wavelength: 545 }).Color;
    assert.ok(green[1] > green[0] && green[1] > green[2]);
  });
  test('Map Range and Clamp', () => {
    near(runNode('MAP_RANGE', { Value: 5, 'From Min': 0, 'From Max': 10, 'To Min': 100, 'To Max': 200 }).Result, 150);
    near(runNode('MAP_RANGE', { Value: 50, 'From Max': 10, 'To Max': 2 }).Result, 2);
    near(runNode('MAP_RANGE', { Value: 50, 'From Max': 10, 'To Max': 2 }, {}).Result, 2);
    near(runNode('CLAMP', { Value: 5, Min: 0, Max: 2 }).Result, 2);
  });
  test('Vector Rotate turns about an axis through a centre', () => {
    close(runNode('VECTOR_ROTATE', { Vector: [2, 0, 0], Center: [1, 0, 0], Axis: [0, 0, 1], Angle: Math.PI / 2 }).Vector, [1, 1, 0]);
  });
  test('Normal Map: flat colour keeps the normal; red leans along a tangent', () => {
    close(runNode('NORMAL_MAP', { Color: [0.5, 0.5, 1] }, { normal: [0, 0, 1] }).Normal, [0, 0, 1]);
    const leaning = runNode('NORMAL_MAP', { Color: [1, 0.5, 1] }, { normal: [0, 0, 1] }).Normal;
    assert.ok(Math.abs(leaning[2]) < 0.99);
  });
  test('Bump bends the normal through a real tree, and only where the height changes', () => {
    const graph = defaultShaderGraph();
    const bsdf = graph.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
    const wave = createNode('TEX_WAVE', 0, 0, { Scale: 1 });
    const bump = createNode('BUMP', 0, 0, { Strength: 1 });
    graph.nodes.push(wave, bump);
    addLink(graph, wave.id, 'Fac', bump.id, 'Height');
    addLink(graph, bump.id, 'Normal', bsdf.id, 'Normal');
    const sloped = evalShader(graph, { uv: [0, 0], position: [0.5, 0, 0], normal: [0, 0, 1] });
    const flat = evalShader(graph, { uv: [0, 0], position: [0, 0, 0], normal: [0, 0, 1] });
    assert.ok(Math.abs(sloped.normal[0]) > 0.3, `a slope bends it: ${sloped.normal}`);
    assert.ok(Math.abs(flat.normal[0]) < 0.05, `the bottom of the wave is level: ${flat.normal}`);
  });
  test('Add Shader sums emission; Holdout is see-through', () => {
    const graph = defaultShaderGraph();
    const out = graph.nodes.find((n) => n.type === 'OUTPUT_MATERIAL');
    const [a, b, add] = [createNode('EMISSION', 0, 0, { Color: [1, 0, 0], Strength: 1 }), createNode('EMISSION', 0, 0, { Color: [0, 1, 0], Strength: 2 }), createNode('ADD_SHADER')];
    graph.nodes.push(a, b, add);
    graph.links = [];
    addLink(graph, a.id, 'Emission', add.id, 'Shader 1');
    addLink(graph, b.id, 'Emission', add.id, 'Shader 2');
    addLink(graph, add.id, 'Shader', out.id, 'Surface');
    close(evalShader(graph, {}).emission, [1, 2, 0]);
    assert.equal(runNode('HOLDOUT').Holdout.alpha, 0);
  });
});

describe('more geometry nodes', () => {
  const tree = (...build) => {
    const input = createNode('GROUP_INPUT');
    const output = createNode('GROUP_OUTPUT');
    const graph = { kind: 'GEOMETRY', nodes: [input, output], links: [] };
    build.forEach((fn) => fn(graph, input, output));
    return graph;
  };
  test('Convex Hull, Bounding Box, Triangulate and Subdivide on a cube', () => {
    const through = (type, values, out) => {
      const node = createNode(type, 0, 0, values);
      const graph = tree((g, i, o) => { g.nodes.push(node); addLink(g, i.id, 'Geometry', node.id, NODE_TYPES[type].inputs[0].name); addLink(g, node.id, out, o.id, 'Geometry'); });
      return evalGeometryNodes(graph, cubeMesh(2));
    };
    assert.equal(through('CONVEX_HULL', {}, 'Convex Hull').faces.length, 6);
    assert.equal(through('BOUNDING_BOX', {}, 'Bounding Box').verts.length, 8);
    assert.equal(through('TRIANGULATE', {}, 'Mesh').faces.length, 12);
    const once = through('SUBDIVIDE_MESH', { Level: 1 }, 'Mesh');
    assert.equal(once.faces.length, 24);
    assert.equal(once.verts.length, 26);
    assert.ok(Math.abs(Math.max(...once.verts.map((v) => v[0])) - 1) < 1e-9, 'nothing moves');
  });
  test('Separate Geometry splits by a field, Compare and Position deciding', () => {
    const [position, separate, xyz, compare] = [createNode('POSITION'), createNode('SEPARATE_GEOMETRY'), createNode('SEPARATE_XYZ'), createNode('COMPARE', 0, 0, { B: 0, operation: 'GREATER_THAN' })];
    const graph = tree((g, i, o) => {
      g.nodes.push(position, separate, xyz, compare);
      addLink(g, i.id, 'Geometry', separate.id, 'Geometry');
      addLink(g, position.id, 'Position', xyz.id, 'Vector');
      addLink(g, xyz.id, 'X', compare.id, 'A');
      addLink(g, compare.id, 'Result', separate.id, 'Selection');
      addLink(g, separate.id, 'Selection', o.id, 'Geometry');
    });
    const half = evalGeometryNodes(graph, cubeMesh(2));
    assert.equal(half.faces.length, 1, 'only the face with all corners on the +X side');
    assert.ok(half.verts.every((v) => v[0] > 0));
  });
  test('a stored attribute reads back per vertex', () => {
    const [index, store, read, set, combine] = [createNode('INDEX'), createNode('STORE_ATTRIBUTE', 0, 0, { name: 'lift' }), createNode('NAMED_ATTRIBUTE', 0, 0, { name: 'lift' }), createNode('SET_POSITION'), createNode('COMBINE_XYZ')];
    const graph = tree((g, i, o) => {
      g.nodes.push(index, store, read, set, combine);
      addLink(g, i.id, 'Geometry', store.id, 'Geometry');
      addLink(g, index.id, 'Index', store.id, 'Value');
      addLink(g, store.id, 'Geometry', set.id, 'Geometry');
      addLink(g, read.id, 'Attribute', combine.id, 'Z');
      addLink(g, combine.id, 'Vector', set.id, 'Offset');
      addLink(g, set.id, 'Geometry', o.id, 'Geometry');
    });
    const source = cubeMesh(2);
    const moved = evalGeometryNodes(graph, source);
    moved.verts.forEach((v, i) => near(v[2], source.verts[i][2] + i));
  });
  test('Switch, Boolean Math, Mesh Line, Points, Scale Elements', () => {
    const on = cubeMesh(1);
    const off = createMesh();
    assert.equal(NODE_TYPES.SWITCH.run((n) => ({ Switch: 1, True: on, False: off })[n], {}, {}).Output, on);
    assert.equal(NODE_TYPES.SWITCH.run((n) => ({ Switch: 0, True: on, False: off })[n], {}, {}).Output, off);
    assert.equal(runNode('BOOLEAN_MATH', { A: 1, B: 0, operation: 'XOR' }).Result, 1);
    assert.equal(runNode('BOOLEAN_MATH', { A: 1, B: 1, operation: 'AND' }).Result, 1);
    const line = runNode('MESH_LINE', { Count: 4, Offset: [0, 0, 2] }).Mesh;
    assert.equal(line.verts.length, 4);
    assert.equal(line.loose.length, 3);
    near(line.verts[3][2], 6);
    assert.equal(runNode('POINTS', { Count: 5 }).Points.verts.length, 5);
    const shrunk = NODE_TYPES.SCALE_ELEMENTS.run((n) => ({ Geometry: cubeMesh(2), Scale: 0.5 })[n], {}, {}).Geometry;
    assert.equal(shrunk.verts.length, 24);
    assert.ok(Math.abs(Math.max(...shrunk.verts.map((v) => v[0])) - 1) < 1e-9, 'faces stay on their planes');
  });
  test('Object Info brings another object in', () => {
    const node = createNode('OBJECT_INFO', 0, 0, { object: 'x' });
    const mesh = cubeMesh(3);
    const r = NODE_TYPES.OBJECT_INFO.run(() => undefined, node, { doc: { objects: [{ id: 'x', data: mesh, location: [1, 2, 3], scale: [2, 2, 2] }] } });
    assert.equal(r.Geometry, mesh);
    assert.deepEqual(r.Location, [1, 2, 3]);
    assert.equal(runNode('OBJECT_INFO').Geometry.verts.length, 0);
  });
});

describe('more compositor nodes', () => {
  const run = (type, values = {}, images = {}) => {
    const node = createNode(type, 0, 0, values);
    const spec = NODE_TYPES[type];
    const input = (name, fallback) => images[name] ?? node.values[name] ?? (fallback !== undefined ? fallback : spec.inputs.find((s) => s.name === name)?.def);
    return spec.run(input, node, {});
  };
  const flat = (c) => image(4, 4, () => c);
  test('Alpha Over: the foreground where it is opaque, the background where not', () => {
    const fg = image(2, 1, (x) => (x === 0 ? [1, 0, 0, 1] : [0, 0, 0, 0]));
    const bg = image(2, 1, () => [0, 0, 1, 1]);
    const out = run('CMP_ALPHA_OVER', {}, { Image: bg, Foreground: fg }).Image;
    close(pixel(out, 0, 0), [1, 0, 0, 1]);
    close(pixel(out, 1, 0), [0, 0, 1, 1]);
  });
  test('Gamma, Tonemap, Color Balance', () => {
    close(pixel(run('CMP_GAMMA', { Gamma: 2 }, { Image: flat([0.5, 0.5, 0.5, 1]) }).Image, 0, 0).slice(0, 3), [0.25, 0.25, 0.25]);
    close(pixel(run('CMP_TONEMAP', {}, { Image: flat([3, 1, 0, 1]) }).Image, 0, 0).slice(0, 3), [0.75, 0.5, 0]);
    close(pixel(run('CMP_COLOR_BALANCE', { Gain: [2, 1, 1] }, { Image: flat([0.25, 0.25, 0.25, 1]) }).Image, 0, 0).slice(0, 3), [0.5, 0.25, 0.25]);
  });
  test('Denoise smooths speckle and keeps an edge', () => {
    const noisy = image(16, 16, (x, y) => { const v = (x < 8 ? 0.1 : 0.9) + ((x * 7 + y * 13) % 3 - 1) * 0.02; return [v, v, v, 1]; });
    const out = run('CMP_DENOISE', { Strength: 0.1 }, { Image: noisy }).Image;
    const spread = (img, x) => { const list = Array.from({ length: 16 }, (_, y) => pixel(img, x, y)[0]); return Math.max(...list) - Math.min(...list); };
    assert.ok(spread(out, 3) < spread(noisy, 3));
    assert.ok(pixel(out, 7, 8)[0] < 0.2 && pixel(out, 8, 8)[0] > 0.8, 'the edge stays');
  });
  test('Sharpen steepens an edge; Flip and Transform move pixels', () => {
    const edge = image(8, 1, (x) => (x < 4 ? [0.2, 0.2, 0.2, 1] : [0.8, 0.8, 0.8, 1]));
    const sharp = run('CMP_SHARPEN', { Fac: 1 }, { Image: edge }).Image;
    assert.ok(pixel(sharp, 4, 0)[0] > 0.8);
    assert.ok(pixel(sharp, 3, 0)[0] < 0.2);
    const marked = image(4, 4, (x, y) => (x === 0 && y === 0 ? [1, 1, 1, 1] : [0, 0, 0, 1]));
    assert.equal(pixel(run('CMP_FLIP', { axis: 'X' }, { Image: marked }).Image, 3, 0)[0], 1);
    assert.equal(pixel(run('CMP_FLIP', { axis: 'XY' }, { Image: marked }).Image, 3, 3)[0], 1);
    assert.equal(pixel(run('CMP_TRANSFORM', { X: 1, Y: 2 }, { Image: marked }).Image, 1, 2)[0], 1);
  });
  test('Crop clears outside; Separate and Combine go there and back; Set Alpha', () => {
    const img = flat([0.1, 0.2, 0.3, 1]);
    const cropped = run('CMP_CROP', { Right: 0.5 }, { Image: img }).Image;
    assert.ok(pixel(cropped, 0, 0)[3] === 1 && pixel(cropped, 3, 0)[3] === 0);
    const parts = run('CMP_SEPARATE', {}, { Image: img });
    close(pixel(parts.G, 1, 1).slice(0, 3), [0.2, 0.2, 0.2]);
    close(pixel(run('CMP_COMBINE', {}, parts).Image, 2, 2), [0.1, 0.2, 0.3, 1]);
    assert.equal(pixel(run('CMP_SET_ALPHA', {}, { Image: img, Alpha: flat([0, 0, 0, 1]) }).Image, 0, 0)[3], 0);
  });
  test('Z Combine keeps the nearer; Defocus blurs only what is out of focus', () => {
    const out = run('CMP_Z_COMBINE', {}, { 'Image A': flat([1, 0, 0, 1]), 'Depth A': flat([5, 5, 5, 1]), 'Image B': flat([0, 1, 0, 1]), 'Depth B': flat([2, 2, 2, 1]) }).Image;
    close(pixel(out, 0, 0).slice(0, 3), [0, 1, 0]);
    const stripes = image(32, 4, (x) => (x % 8 < 4 ? [1, 1, 1, 1] : [0, 0, 0, 1]));
    const depth = image(32, 4, (x) => { const z = x < 16 ? 5 : 50; return [z, z, z, 1]; });
    const blurred = run('CMP_DEFOCUS', { Focus: 5, Range: 5, Size: 4 }, { Image: stripes, Depth: depth }).Image;
    assert.equal(pixel(blurred, 1, 1)[0], 1, 'in focus: unchanged');
    assert.ok(pixel(blurred, 24, 1)[0] < 1 && pixel(blurred, 24, 1)[0] > 0, 'out of focus: blurred');
  });
  test('a compositor tree with these nodes runs', () => {
    const [layers, gamma, out] = [createNode('CMP_RENDER_LAYERS'), createNode('CMP_GAMMA', 0, 0, { Gamma: 2 }), createNode('CMP_OUTPUT')];
    const graph = { kind: 'COMPOSITOR', nodes: [layers, gamma, out], links: [] };
    addLink(graph, layers.id, 'Image', gamma.id, 'Image');
    addLink(graph, gamma.id, 'Image', out.id, 'Image');
    near(pixel(evalCompositor(graph, flat([0.5, 0.5, 0.5, 1])), 0, 0)[0], 0.25);
  });
});

describe('video files', () => {
  const samples = [{ data: new Uint8Array([1, 2, 3]), key: true }, { data: new Uint8Array([4, 5]), key: false }, { data: new Uint8Array([6, 7, 8, 9]), key: false }];
  test('MP4: sizes, timing, keys and where the data is all read back', () => {
    const bytes = muxMP4({ samples, width: 320, height: 240, fps: 24, codec: 'avc1', description: new Uint8Array([1, 100, 0, 40]) });
    const info = inspectMP4(bytes);
    assert.equal(info.count, 3);
    assert.deepEqual(info.sizes, [3, 2, 4]);
    assert.equal(info.codec, 'avc1');
    assert.equal(info.width, 320);
    assert.equal(info.height, 240);
    assert.equal(info.keys, 1);
    near(info.duration / info.timescale, 3 / 24);
    assert.equal(info.firstOffset, info.dataAt, 'the chunk offset points at the media data');
    assert.deepEqual([...bytes.subarray(info.firstOffset, info.firstOffset + 3)], [1, 2, 3]);
  });
  test('MP4 with VP9 is labelled so', () => {
    assert.equal(inspectMP4(muxMP4({ samples, width: 64, height: 64, fps: 30, codec: 'vp09', description: new Uint8Array(8) })).codec, 'vp09');
  });
  test('all key frames need no sync table', () => {
    const all = samples.map((s) => ({ ...s, key: true }));
    assert.equal(inspectMP4(muxMP4({ samples: all, width: 64, height: 64, fps: 30, description: new Uint8Array(4) })).keys, 3);
  });
  test('AVI: RIFF layout, frame count, index that points at each picture', () => {
    const pictures = [new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9]), new Uint8Array([0xff, 0xd8, 2, 3, 0xff, 0xd9])];
    const bytes = muxAVI({ pictures, width: 16, height: 8, fps: 25 });
    const text = (at, n) => new TextDecoder().decode(bytes.subarray(at, at + n));
    const view = new DataView(bytes.buffer);
    assert.equal(text(0, 4), 'RIFF');
    assert.equal(view.getUint32(4, true), bytes.length - 8);
    assert.equal(text(8, 4), 'AVI ');
    assert.equal(view.getUint32(text(0, bytes.length).indexOf('avih') + 8 + 16, true), 2);
    const movi = text(0, bytes.length).indexOf('movi');
    const idx = text(0, bytes.length).indexOf('idx1');
    const secondOffset = view.getUint32(idx + 8 + 16 + 8, true);
    assert.equal(text(movi + secondOffset, 4), '00dc');
    assert.equal(view.getUint32(movi + secondOffset + 4, true), 6);
    assert.deepEqual([...bytes.subarray(movi + secondOffset + 8, movi + secondOffset + 14)], [...pictures[1]]);
  });
});
