// Node graphs: one engine for shader, world, geometry and compositor trees.
//
//   graph = { kind: 'SHADER'|'WORLD'|'GEOMETRY'|'COMPOSITOR', nodes: [{ id, type, x, y, values: {} }], links: [{ from, out, to, in }] }
//
// A node's unconnected input reads node.values[name] (or the socket's default). Evaluation is demand-driven from the
// output node. Geometry "fields" (Position, Noise, Math…) are re-evaluated per vertex: Set Position calls its input with a
// context holding that vertex.
import { addFace, cloneMesh, compact, coneMesh, createMesh, cubeMesh, cylinderMesh, faceArea, faceNormal, gridMesh, icoSphereMesh, uvSphereMesh, v3, vertexNormals } from './mesh.js';
import { catmullClark } from './modifiers.js';
import { DEFAULT_OSL, oslShader } from './osl.js';
import { booleanMesh } from './csg.js';
import { extrudeIndividual, flipNormals, mergeByDistance, recalcNormals } from './meshops.js';
import { fbm, voronoi } from './noise.js';
import { moreNodes } from './nodes-more.js';
import { CRYPTO_RANKS, LIGHT_PASSES, cryptoMatte } from './passes.js';

const V = (name, def = 0, extra = {}) => ({ name, type: 'VALUE', def, ...extra });
const C = (name, def = [0.8, 0.8, 0.8]) => ({ name, type: 'COLOR', def });
const N = (name, def = [0, 0, 0]) => ({ name, type: 'VECTOR', def });
const S = (name) => ({ name, type: 'SHADER' });
const G = (name) => ({ name, type: 'GEOMETRY' });
const I = (name) => ({ name, type: 'IMAGE' });
const CRYPTO_LAYERS = ['CryptoObject', 'CryptoMaterial', 'CryptoAsset'].flatMap((k) => Array.from({ length: CRYPTO_RANKS / 2 }, (_, i) => `${k}0${i}`));

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const emptyBsdf = () => ({ baseColor: [0, 0, 0], metallic: 0, roughness: 1, specular: 0, ior: 1.45, transmission: 0, alpha: 1, emission: [0, 0, 0] });

export function rgbToHsv([r, g, b]) {
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, max > 0 ? d / max : 0, max];
}

export function hsvToRgb([h, s, v]) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const [p, q, t] = [v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)];
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
}

const MATH = {
  ADD: (a, b) => a + b, SUBTRACT: (a, b) => a - b, MULTIPLY: (a, b) => a * b, DIVIDE: (a, b) => (b ? a / b : 0), POWER: (a, b) => (a < 0 && b % 1 ? 0 : a ** b),
  MINIMUM: Math.min, MAXIMUM: Math.max, SINE: (a) => Math.sin(a), COSINE: (a) => Math.cos(a), ABSOLUTE: (a) => Math.abs(a), SQRT: (a) => Math.sqrt(Math.max(0, a)),
  ROUND: (a) => Math.round(a), FLOOR: (a) => Math.floor(a), MODULO: (a, b) => (b ? a % b : 0), GREATER_THAN: (a, b) => (a > b ? 1 : 0), LESS_THAN: (a, b) => (a < b ? 1 : 0),
};

const BLEND = {
  MIX: (a, b) => b, ADD: (a, b) => a + b, MULTIPLY: (a, b) => a * b, SCREEN: (a, b) => 1 - (1 - a) * (1 - b), SUBTRACT: (a, b) => a - b,
  OVERLAY: (a, b) => (a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b)), DARKEN: Math.min, LIGHTEN: Math.max, DIFFERENCE: (a, b) => Math.abs(a - b),
};

const mapImage = (img, fn) => {
  const data = new Float32Array(img.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const out = fn([img.data[i], img.data[i + 1], img.data[i + 2]], i);
    data[i] = out[0]; data[i + 1] = out[1]; data[i + 2] = out[2]; data[i + 3] = img.data[i + 3];
  }
  return { width: img.width, height: img.height, data };
};

/** Box blur, three passes (close to a gaussian), one row or column at a time. */
export function blurImage(img, radius) {
  const r = Math.max(0, Math.round(radius));
  if (!r) return img;
  const { width: w, height: h } = img;
  let src = img.data;
  const pass = (from, horizontal) => {
    const out = new Float32Array(from.length);
    const [lines, len] = horizontal ? [h, w] : [w, h];
    const at = (l, p) => (horizontal ? (l * w + p) * 4 : (p * w + l) * 4);
    for (let l = 0; l < lines; l++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let p = -r; p <= r; p++) sum += from[at(l, Math.max(0, Math.min(len - 1, p))) + c];
        for (let p = 0; p < len; p++) {
          out[at(l, p) + c] = sum / (2 * r + 1);
          sum += from[at(l, Math.min(len - 1, p + r + 1)) + c] - from[at(l, Math.max(0, p - r)) + c];
        }
      }
    }
    return out;
  };
  for (let i = 0; i < 3; i++) src = pass(pass(src, true), false);
  return { width: w, height: h, data: src };
}

const emptyImage = (w = 1, h = 1) => ({ width: w, height: h, data: new Float32Array(w * h * 4) });

/** Every node type. `kinds`: trees it appears in. `run(input, node, ctx)` returns { outputName: value }. */
export const NODE_TYPES = {
  // ── Shader: output and BSDFs
  OUTPUT_MATERIAL: { en: 'Material Output', ko: '재질 출력', cat: 'Output', kinds: ['SHADER'], inputs: [S('Surface'), S('Volume'), N('Displacement')], outputs: [], output: true, run: () => ({}) },
  OUTPUT_WORLD: { en: 'World Output', ko: '월드 출력', cat: 'Output', kinds: ['WORLD'], inputs: [S('Surface')], outputs: [], output: true, run: () => ({}) },
  BSDF_PRINCIPLED: {
    en: 'Principled BSDF', ko: '프린시펄드 BSDF', cat: 'Shader', kinds: ['SHADER'],
    inputs: [C('Base Color'), V('Metallic', 0), V('Roughness', 0.5), V('IOR', 1.45), V('Specular', 0.5), V('Transmission', 0), V('Alpha', 1), C('Emission', [0, 0, 0]), V('Emission Strength', 1), N('Normal', null)],
    outputs: [S('BSDF')],
    run: (input) => {
      const e = input('Emission');
      const k = input('Emission Strength');
      return { BSDF: { baseColor: input('Base Color'), metallic: input('Metallic'), roughness: input('Roughness'), ior: input('IOR'), specular: input('Specular'), transmission: input('Transmission'), alpha: input('Alpha'), emission: [e[0] * k, e[1] * k, e[2] * k], normal: input('Normal', null) } };
    },
  },
  BSDF_DIFFUSE: { en: 'Diffuse BSDF', ko: '디퓨즈 BSDF', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color'), V('Roughness', 0)], outputs: [S('BSDF')], run: (input) => ({ BSDF: { ...emptyBsdf(), baseColor: input('Color'), roughness: 1, specular: 0 } }) },
  BSDF_GLOSSY: { en: 'Glossy BSDF', ko: '글로시 BSDF', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color'), V('Roughness', 0.2)], outputs: [S('BSDF')], run: (input) => ({ BSDF: { ...emptyBsdf(), baseColor: input('Color'), metallic: 1, roughness: input('Roughness'), specular: 1 } }) },
  BSDF_GLASS: { en: 'Glass BSDF', ko: '유리 BSDF', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color', [1, 1, 1]), V('Roughness', 0), V('IOR', 1.45)], outputs: [S('BSDF')], run: (input) => ({ BSDF: { ...emptyBsdf(), baseColor: input('Color'), roughness: input('Roughness'), ior: input('IOR'), transmission: 1, specular: 0.5 } }) },
  EMISSION: { en: 'Emission', ko: '방출', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color', [1, 1, 1]), V('Strength', 1)], outputs: [S('Emission')], run: (input) => { const c = input('Color'); const k = input('Strength'); return { Emission: { ...emptyBsdf(), emission: [c[0] * k, c[1] * k, c[2] * k] } }; } },
  TRANSPARENT: { en: 'Transparent BSDF', ko: '투명 BSDF', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color', [1, 1, 1])], outputs: [S('BSDF')], run: () => ({ BSDF: { ...emptyBsdf(), alpha: 0 } }) },
  MIX_SHADER: {
    en: 'Mix Shader', ko: '셰이더 혼합', cat: 'Shader', kinds: ['SHADER'], inputs: [V('Fac', 0.5), S('Shader 1'), S('Shader 2')], outputs: [S('Shader')],
    run: (input) => {
      const t = clamp01(input('Fac'));
      const [a, b] = [input('Shader 1') ?? emptyBsdf(), input('Shader 2') ?? emptyBsdf()];
      const m = (x, y) => x + (y - x) * t;
      return { Shader: { baseColor: mix3(a.baseColor, b.baseColor, t), metallic: m(a.metallic, b.metallic), roughness: m(a.roughness, b.roughness), specular: m(a.specular, b.specular), ior: m(a.ior, b.ior), transmission: m(a.transmission, b.transmission), alpha: m(a.alpha, b.alpha), emission: mix3(a.emission, b.emission, t), normal: t < 0.5 ? a.normal ?? b.normal : b.normal ?? a.normal } };
    },
  },
  BACKGROUND: { en: 'Background', ko: '배경', cat: 'Shader', kinds: ['WORLD'], inputs: [C('Color', [0.05, 0.05, 0.05]), V('Strength', 1)], outputs: [S('Background')], run: (input) => { const c = input('Color'); const k = input('Strength'); return { Background: { emission: [c[0] * k, c[1] * k, c[2] * k] } }; } },
  TEX_SKY: {
    en: 'Sky Texture', ko: '하늘 텍스처', cat: 'Texture', kinds: ['WORLD'], inputs: [C('Zenith', [0.2, 0.4, 0.9]), C('Horizon', [0.8, 0.85, 0.95]), C('Ground', [0.2, 0.18, 0.16])], outputs: [C('Color')],
    run: (input, node, ctx) => {
      const z = v3.norm(ctx.normal ?? [0, 0, 1])[2];
      return { Color: z >= 0 ? mix3(input('Horizon'), input('Zenith'), z ** 0.6) : mix3(input('Horizon'), input('Ground'), Math.min(1, -z * 4)) };
    },
  },
  // ── Input
  VALUE: { en: 'Value', ko: '값', cat: 'Input', kinds: ['SHADER', 'WORLD', 'GEOMETRY', 'COMPOSITOR'], inputs: [], outputs: [V('Value')], props: { value: 0.5 }, run: (input, node) => ({ Value: node.values?.value ?? 0.5 }) },
  RGB: { en: 'RGB', ko: 'RGB', cat: 'Input', kinds: ['SHADER', 'WORLD', 'COMPOSITOR'], inputs: [], outputs: [C('Color')], props: { color: [0.5, 0.5, 0.5] }, run: (input, node) => ({ Color: node.values?.color ?? [0.5, 0.5, 0.5] }) },
  TEX_COORD: {
    en: 'Texture Coordinate', ko: '텍스처 좌표', cat: 'Input', kinds: ['SHADER'], inputs: [], outputs: [N('UV'), N('Object'), N('Normal'), N('Generated')],
    run: (input, node, ctx) => ({ UV: [ctx.uv?.[0] ?? 0, ctx.uv?.[1] ?? 0, 0], Object: ctx.position ?? [0, 0, 0], Normal: ctx.normal ?? [0, 0, 1], Generated: ctx.position ?? [0, 0, 0] }),
  },
  GEOMETRY_INFO: { en: 'Geometry', ko: '지오메트리', cat: 'Input', kinds: ['SHADER'], inputs: [], outputs: [N('Position'), N('Normal')], run: (input, node, ctx) => ({ Position: ctx.position ?? [0, 0, 0], Normal: ctx.normal ?? [0, 0, 1] }) },
  // ── Texture
  TEX_NOISE: { en: 'Noise Texture', ko: '노이즈 텍스처', cat: 'Texture', kinds: ['SHADER', 'WORLD', 'GEOMETRY'], inputs: [N('Vector'), V('Scale', 5), V('Detail', 4), V('Roughness', 0.5)], outputs: [V('Fac'), C('Color')],
    run: (input, node, ctx) => {
      const connected = input('Vector', null);
      const p = connected ?? ctx.position ?? [0, 0, 0];
      const s = input('Scale');
      const [o, r] = [Math.max(1, Math.min(8, Math.round(input('Detail')))), input('Roughness')];
      const f = fbm(p[0] * s, p[1] * s, p[2] * s, o, r);
      return { Fac: f, Color: [f, fbm(p[0] * s + 7, p[1] * s, p[2] * s, o, r), fbm(p[0] * s, p[1] * s + 13, p[2] * s, o, r)] };
    } },
  TEX_VORONOI: { en: 'Voronoi Texture', ko: '보로노이 텍스처', cat: 'Texture', kinds: ['SHADER', 'GEOMETRY'], inputs: [N('Vector'), V('Scale', 5)], outputs: [V('Distance'), C('Color')],
    run: (input, node, ctx) => { const p = input('Vector', null) ?? ctx.position ?? [0, 0, 0]; const s = input('Scale'); const d = voronoi(p[0] * s, p[1] * s, p[2] * s); return { Distance: d, Color: [d, d, d] }; } },
  TEX_CHECKER: { en: 'Checker Texture', ko: '체커 텍스처', cat: 'Texture', kinds: ['SHADER'], inputs: [N('Vector'), C('Color1', [0.8, 0.8, 0.8]), C('Color2', [0.2, 0.2, 0.2]), V('Scale', 5)], outputs: [C('Color'), V('Fac')],
    run: (input, node, ctx) => {
      const p = input('Vector', null) ?? ctx.position ?? [0, 0, 0];
      const s = input('Scale');
      const odd = (Math.floor(p[0] * s + 1e-4) + Math.floor(p[1] * s + 1e-4) + Math.floor(p[2] * s + 1e-4)) & 1;
      return { Color: odd ? input('Color2') : input('Color1'), Fac: odd ? 0 : 1 };
    } },
  TEX_GRADIENT: { en: 'Gradient Texture', ko: '그라디언트 텍스처', cat: 'Texture', kinds: ['SHADER', 'WORLD'], inputs: [N('Vector')], outputs: [C('Color'), V('Fac')], run: (input, node, ctx) => { const p = input('Vector', null) ?? ctx.position ?? [0, 0, 0]; const f = clamp01(p[0]); return { Color: [f, f, f], Fac: f }; } },
  // A group: its own tree inside the node. node.group = { id, name, inputs: [{name,type}], outputs: [{name,type}], graph }.
  GROUP: { en: 'Group', ko: '그룹', cat: 'Group', kinds: ['SHADER', 'WORLD', 'GEOMETRY', 'COMPOSITOR'], hidden: true, inputs: [], outputs: [],
    run: (input, node, ctx) => {
      const group = node.group;
      if (!group) return {};
      const inner = { ...ctx, memo: new Map(), groupInput: input };
      const output = group.graph.nodes.find((n) => n.type === 'NG_OUTPUT');
      const result = {};
      for (const socket of group.outputs) {
        const link = group.graph.links.find((l) => l.to === output?.id && l.in === socket.name);
        const source = link && group.graph.nodes.find((n) => n.id === link.from);
        result[socket.name] = source ? evalNode(group.graph, source, inner)[link.out] : output?.values?.[socket.name];
      }
      return result;
    } },
  NG_INPUT: { en: 'Group Input', ko: '그룹 입력', cat: 'Group', kinds: ['SHADER', 'WORLD', 'GEOMETRY', 'COMPOSITOR'], hidden: true, inputs: [], outputs: [],
    run: (input, node, ctx) => new Proxy({}, { get: (_, name) => (typeof name === 'string' ? ctx.groupInput?.(name) : undefined) }) },
  NG_OUTPUT: { en: 'Group Output', ko: '그룹 출력', cat: 'Group', kinds: ['SHADER', 'WORLD', 'GEOMETRY', 'COMPOSITOR'], hidden: true, inputs: [], outputs: [], run: () => ({}) },
  SCRIPT_OSL: { en: 'Script (OSL)', ko: '스크립트 (OSL)', cat: 'Texture', kinds: ['SHADER'], inputs: [], outputs: [], props: { source: DEFAULT_OSL },
    run: (input, node, ctx) => {
      const { shader } = oslShader(node.values.source ?? '');
      if (!shader) return {};
      const values = {};
      for (const s of shader.inputs) values[s.name] = input(s.name, undefined) ?? s.def;
      const P = ctx.position ?? [0, 0, 0];
      return shader.run(values, { P, N: ctx.normal ?? [0, 0, 1], I: [0, 0, 0], u: ctx.uv?.[0] ?? 0, v: ctx.uv?.[1] ?? 0 });
    } },
  TEX_IMAGE: { en: 'Image Texture', ko: '이미지 텍스처', cat: 'Texture', kinds: ['SHADER', 'WORLD'], inputs: [N('Vector')], outputs: [C('Color'), V('Alpha')], props: { image: null },
    run: (input, node, ctx) => {
      const img = ctx.images?.[node.values?.image];
      const uv = input('Vector', null) ?? [ctx.uv?.[0] ?? 0, ctx.uv?.[1] ?? 0, 0];
      if (!img) return { Color: [1, 0, 1], Alpha: 1 };
      const x = ((Math.floor((uv[0] % 1 + 1) % 1 * img.width)) + img.width) % img.width;
      const y = ((Math.floor((1 - ((uv[1] % 1 + 1) % 1)) * img.height)) + img.height) % img.height;
      const i = (y * img.width + x) * 4;
      const srgb = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return { Color: [srgb(img.rgba[i]), srgb(img.rgba[i + 1]), srgb(img.rgba[i + 2])], Alpha: img.rgba[i + 3] / 255 };
    } },
  // ── Colour and maths
  MIX_RGB: { en: 'Mix Color', ko: '색 혼합', cat: 'Color', kinds: ['SHADER', 'WORLD'], inputs: [V('Fac', 0.5), C('A', [0.5, 0.5, 0.5]), C('B', [0.5, 0.5, 0.5])], outputs: [C('Result')], props: { blend: 'MIX' }, options: { blend: Object.keys(BLEND) },
    run: (input, node) => { const fn = BLEND[node.values?.blend ?? 'MIX'] ?? BLEND.MIX; const [a, b] = [input('A'), input('B')]; const t = clamp01(input('Fac')); return { Result: a.map((x, k) => x + (fn(x, b[k]) - x) * t) }; } },
  INVERT: { en: 'Invert', ko: '반전', cat: 'Color', kinds: ['SHADER'], inputs: [C('Color'), V('Fac', 1)], outputs: [C('Color')], run: (input) => { const c = input('Color'); const t = input('Fac'); return { Color: c.map((x) => x + (1 - x - x) * t) }; } },
  HUE_SAT: { en: 'Hue/Saturation/Value', ko: '색조/채도/명도', cat: 'Color', kinds: ['SHADER'], inputs: [V('Hue', 0.5), V('Saturation', 1), V('Value', 1), C('Color')], outputs: [C('Color')],
    run: (input) => { const hsv = rgbToHsv(input('Color')); return { Color: hsvToRgb([(hsv[0] + input('Hue') - 0.5 + 1) % 1, clamp01(hsv[1] * input('Saturation')), hsv[2] * input('Value')]) }; } },
  COLOR_RAMP: { en: 'Color Ramp', ko: '색상 램프', cat: 'Converter', kinds: ['SHADER', 'WORLD'], inputs: [V('Fac', 0.5)], outputs: [C('Color'), V('Alpha')], props: { stops: [{ pos: 0, color: [0, 0, 0] }, { pos: 1, color: [1, 1, 1] }] },
    run: (input, node) => {
      const stops = node.values?.stops ?? [{ pos: 0, color: [0, 0, 0] }, { pos: 1, color: [1, 1, 1] }];
      const f = clamp01(input('Fac'));
      let color = stops[0].color;
      for (let i = 0; i < stops.length - 1; i++) {
        const [a, b] = [stops[i], stops[i + 1]];
        if (f >= a.pos && f <= b.pos) { color = mix3(a.color, b.color, (f - a.pos) / (b.pos - a.pos || 1)); break; }
        if (f > b.pos) color = b.color;
      }
      return { Color: color, Alpha: 1 };
    } },
  MATH: { en: 'Math', ko: '수학', cat: 'Converter', kinds: ['SHADER', 'WORLD', 'GEOMETRY', 'COMPOSITOR'], inputs: [V('A', 0.5), V('B', 0.5)], outputs: [V('Value')], props: { operation: 'ADD' }, options: { operation: Object.keys(MATH) },
    run: (input, node) => ({ Value: (MATH[node.values?.operation ?? 'ADD'] ?? MATH.ADD)(input('A'), input('B')) }) },
  VECTOR_MATH: { en: 'Vector Math', ko: '벡터 수학', cat: 'Converter', kinds: ['SHADER', 'GEOMETRY'], inputs: [N('A'), N('B')], outputs: [N('Vector'), V('Value')], props: { operation: 'ADD' }, options: { operation: ['ADD', 'SUBTRACT', 'MULTIPLY', 'CROSS', 'DOT', 'NORMALIZE', 'LENGTH', 'SCALE'] },
    run: (input, node) => {
      const [a, b] = [input('A'), input('B')];
      switch (node.values?.operation ?? 'ADD') {
        case 'SUBTRACT': return { Vector: v3.sub(a, b), Value: 0 };
        case 'MULTIPLY': return { Vector: [a[0] * b[0], a[1] * b[1], a[2] * b[2]], Value: 0 };
        case 'CROSS': return { Vector: v3.cross(a, b), Value: 0 };
        case 'DOT': return { Vector: [0, 0, 0], Value: v3.dot(a, b) };
        case 'NORMALIZE': return { Vector: v3.norm(a), Value: 0 };
        case 'LENGTH': return { Vector: [0, 0, 0], Value: v3.len(a) };
        case 'SCALE': return { Vector: v3.mul(a, b[0]), Value: 0 };
        default: return { Vector: v3.add(a, b), Value: 0 };
      }
    } },
  COMBINE_XYZ: { en: 'Combine XYZ', ko: 'XYZ 결합', cat: 'Converter', kinds: ['SHADER', 'GEOMETRY'], inputs: [V('X'), V('Y'), V('Z')], outputs: [N('Vector')], run: (input) => ({ Vector: [input('X'), input('Y'), input('Z')] }) },
  SEPARATE_XYZ: { en: 'Separate XYZ', ko: 'XYZ 분리', cat: 'Converter', kinds: ['SHADER', 'GEOMETRY'], inputs: [N('Vector')], outputs: [V('X'), V('Y'), V('Z')], run: (input) => { const v = input('Vector'); return { X: v[0], Y: v[1], Z: v[2] }; } },
  MAPPING: { en: 'Mapping', ko: '매핑', cat: 'Vector', kinds: ['SHADER'], inputs: [N('Vector'), N('Location'), N('Scale', [1, 1, 1])], outputs: [N('Vector')], run: (input) => { const [p, l, s] = [input('Vector'), input('Location'), input('Scale')]; return { Vector: [p[0] * s[0] + l[0], p[1] * s[1] + l[1], p[2] * s[2] + l[2]] }; } },
  // ── Geometry
  GROUP_INPUT: { en: 'Group Input', ko: '그룹 입력', cat: 'Group', kinds: ['GEOMETRY'], inputs: [], outputs: [G('Geometry')], run: (input, node, ctx) => ({ Geometry: ctx.input ?? createMesh() }) },
  GROUP_OUTPUT: { en: 'Group Output', ko: '그룹 출력', cat: 'Group', kinds: ['GEOMETRY'], inputs: [G('Geometry')], outputs: [], output: true, run: () => ({}) },
  POSITION: { en: 'Position', ko: '위치', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [], outputs: [N('Position')], field: true, run: (input, node, ctx) => ({ Position: ctx.position ?? [0, 0, 0] }) },
  NORMAL: { en: 'Normal', ko: '노멀', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [], outputs: [N('Normal')], field: true, run: (input, node, ctx) => ({ Normal: ctx.normal ?? [0, 0, 1] }) },
  INDEX: { en: 'Index', ko: '인덱스', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [], outputs: [V('Index')], field: true, run: (input, node, ctx) => ({ Index: ctx.index ?? 0 }) },
  RANDOM_VALUE: { en: 'Random Value', ko: '임의 값', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [V('Min', 0), V('Max', 1), V('Seed', 0)], outputs: [V('Value')], field: true,
    run: (input, node, ctx) => {
      const h = Math.imul((ctx.index ?? 0) + 1, 2654435761) ^ Math.imul(input('Seed') | 0, 40503);
      const t = (((h ^ (h >>> 15)) >>> 0) % 100000) / 100000;
      return { Value: input('Min') + (input('Max') - input('Min')) * t };
    } },
  SCENE_TIME: { en: 'Scene Time', ko: '장면 시간', cat: 'Input', kinds: ['GEOMETRY'], inputs: [], outputs: [V('Frame'), V('Seconds')], run: (input, node, ctx) => ({ Frame: ctx.frame ?? 1, Seconds: (ctx.frame ?? 1) / (ctx.doc?.fps ?? 24) }) },
  MESH_CUBE: { en: 'Cube', ko: '큐브', cat: 'Mesh Primitives', kinds: ['GEOMETRY'], inputs: [V('Size', 1)], outputs: [G('Mesh')], run: (input) => ({ Mesh: cubeMesh(input('Size')) }) },
  MESH_GRID: { en: 'Grid', ko: '격자', cat: 'Mesh Primitives', kinds: ['GEOMETRY'], inputs: [V('Size', 2), V('Vertices X', 10), V('Vertices Y', 10)], outputs: [G('Mesh')], run: (input) => ({ Mesh: gridMesh(Math.max(1, input('Vertices X') | 0), Math.max(1, input('Vertices Y') | 0), input('Size')) }) },
  MESH_SPHERE: { en: 'UV Sphere', ko: 'UV 구', cat: 'Mesh Primitives', kinds: ['GEOMETRY'], inputs: [V('Segments', 16), V('Rings', 8), V('Radius', 1)], outputs: [G('Mesh')], run: (input) => ({ Mesh: uvSphereMesh(Math.max(3, input('Segments') | 0), Math.max(2, input('Rings') | 0), input('Radius')) }) },
  MESH_ICO: { en: 'Ico Sphere', ko: '아이코 구', cat: 'Mesh Primitives', kinds: ['GEOMETRY'], inputs: [V('Radius', 1), V('Subdivisions', 2)], outputs: [G('Mesh')], run: (input) => ({ Mesh: icoSphereMesh(Math.max(1, Math.min(6, input('Subdivisions') | 0)), input('Radius')) }) },
  MESH_CYLINDER: { en: 'Cylinder', ko: '원기둥', cat: 'Mesh Primitives', kinds: ['GEOMETRY'], inputs: [V('Vertices', 32), V('Radius', 1), V('Depth', 2)], outputs: [G('Mesh')], run: (input) => ({ Mesh: cylinderMesh(Math.max(3, input('Vertices') | 0), input('Radius'), input('Depth')) }) },
  MESH_CONE: { en: 'Cone', ko: '원뿔', cat: 'Mesh Primitives', kinds: ['GEOMETRY'], inputs: [V('Vertices', 32), V('Radius', 1), V('Depth', 2)], outputs: [G('Mesh')], run: (input) => ({ Mesh: coneMesh(Math.max(3, input('Vertices') | 0), input('Radius'), input('Depth')) }) },
  TRANSFORM_GEOMETRY: {
    en: 'Transform Geometry', ko: '지오메트리 변환', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [G('Geometry'), N('Translation'), N('Rotation'), N('Scale', [1, 1, 1])], outputs: [G('Geometry')],
    run: (input) => {
      const mesh = cloneMesh(input('Geometry') ?? createMesh());
      const [t, r, s] = [input('Translation'), input('Rotation'), input('Scale')];
      const [cx, sx, cy, sy, cz, sz] = [Math.cos(r[0]), Math.sin(r[0]), Math.cos(r[1]), Math.sin(r[1]), Math.cos(r[2]), Math.sin(r[2])];
      mesh.verts = mesh.verts.map(([x0, y0, z0]) => {
        let [x, y, z] = [x0 * s[0], y0 * s[1], z0 * s[2]];
        [y, z] = [y * cx - z * sx, y * sx + z * cx];
        [x, z] = [x * cy + z * sy, -x * sy + z * cy];
        [x, y] = [x * cz - y * sz, x * sz + y * cz];
        return [x + t[0], y + t[1], z + t[2]];
      });
      return { Geometry: mesh };
    },
  },
  JOIN_GEOMETRY: {
    en: 'Join Geometry', ko: '지오메트리 결합', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [G('A'), G('B')], outputs: [G('Geometry')],
    run: (input) => {
      const out = cloneMesh(input('A') ?? createMesh());
      const b = input('B');
      if (b) appendMesh(out, b);
      return { Geometry: out };
    },
  },
  SET_POSITION: {
    en: 'Set Position', ko: '위치 설정', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [G('Geometry'), N('Offset')], outputs: [G('Geometry')],
    run: (input, node, ctx) => {
      const mesh = cloneMesh(input('Geometry') ?? createMesh());
      const normals = vertexNormals(mesh);
      mesh.verts = mesh.verts.map((p, i) => v3.add(p, input('Offset', undefined, { ...ctx, memo: ctx.geometryMemo(), position: p, normal: normals[i], index: i, mesh })));
      return { Geometry: mesh };
    },
  },
  SUBDIVISION_SURFACE: {
    en: 'Subdivision Surface', ko: '서브디비전 표면', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('Mesh'), V('Level', 1)], outputs: [G('Mesh')],
    run: (input) => {
      let m = input('Mesh') ?? createMesh();
      for (let i = 0; i < Math.min(5, input('Level') | 0); i++) m = catmullClark(m);
      return { Mesh: m };
    },
  },
  EXTRUDE_MESH: { en: 'Extrude Mesh', ko: '메시 돌출', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('Mesh'), V('Offset', 0.2)], outputs: [G('Mesh')],
    run: (input) => { const m = cloneMesh(input('Mesh') ?? createMesh()); m.selMode = 'face'; m.selF = m.faces.map((_, f) => f); extrudeIndividual(m, input('Offset')); return { Mesh: m }; } },
  FLIP_FACES: { en: 'Flip Faces', ko: '면 뒤집기', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('Mesh')], outputs: [G('Mesh')], run: (input) => { const m = cloneMesh(input('Mesh') ?? createMesh()); m.selMode = 'face'; m.selF = m.faces.map((_, f) => f); flipNormals(m); return { Mesh: m }; } },
  MESH_BOOLEAN: { en: 'Mesh Boolean', ko: '메시 불리언', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('A'), G('B')], outputs: [G('Mesh')], props: { operation: 'DIFFERENCE' }, options: { operation: ['DIFFERENCE', 'UNION', 'INTERSECT'] },
    run: (input, node) => { const [a, b] = [input('A'), input('B')]; if (!a) return { Mesh: createMesh() }; return { Mesh: b ? booleanMesh(a, b, node.values?.operation ?? 'DIFFERENCE') : a }; } },
  MERGE_BY_DISTANCE: { en: 'Merge by Distance', ko: '거리로 병합', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('Geometry'), V('Distance', 0.001)], outputs: [G('Geometry')], run: (input) => { const m = cloneMesh(input('Geometry') ?? createMesh()); mergeByDistance(m, input('Distance'), true); return { Geometry: m }; } },
  SHADE_SMOOTH: { en: 'Set Shade Smooth', ko: '부드러운 셰이딩', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('Geometry'), V('Smooth', 1)], outputs: [G('Geometry')], run: (input) => { const m = cloneMesh(input('Geometry') ?? createMesh()); m.smooth = input('Smooth') > 0.5; return { Geometry: m }; } },
  DELETE_GEOMETRY: {
    en: 'Delete Geometry', ko: '지오메트리 삭제', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [G('Geometry'), V('Selection', 0)], outputs: [G('Geometry')],
    run: (input, node, ctx) => {
      const m = cloneMesh(input('Geometry') ?? createMesh());
      const normals = vertexNormals(m);
      const gone = m.verts.map((p, i) => input('Selection', undefined, { ...ctx, memo: ctx.geometryMemo(), position: p, normal: normals[i], index: i, mesh: m }) > 0.5);
      m.faces = m.faces.filter((face) => !face.some((i) => gone[i]));
      m.uvs = null;
      m.faceMat = null;
      return { Geometry: compact(m) };
    },
  },
  DISTRIBUTE_POINTS: {
    en: 'Distribute Points on Faces', ko: '면에 점 분포', cat: 'Point', kinds: ['GEOMETRY'], inputs: [G('Mesh'), V('Density', 10), V('Seed', 0)], outputs: [G('Points')],
    run: (input) => {
      const m = input('Mesh') ?? createMesh();
      let s = (input('Seed') | 0) * 7 + 1;
      const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      const points = createMesh();
      // Faces by area: a big face gets more points than a small one.
      const totals = [];
      let area = 0;
      for (const f of m.faces) { area += faceArea(m, f); totals.push(area); }
      const count = Math.min(100000, Math.max(0, Math.round(area * input('Density'))));
      const pick = () => {
        const at = rnd() * area;
        let [lo, hi] = [0, totals.length - 1];
        while (lo < hi) { const mid = (lo + hi) >> 1; if (totals[mid] < at) lo = mid + 1; else hi = mid; }
        return lo;
      };
      for (let i = 0; i < count && m.faces.length; i++) {
        const face = m.faces[pick()];
        const [a, b, c] = [m.verts[face[0]], m.verts[face[1]], m.verts[face[2]]];
        let [u, w] = [rnd(), rnd()];
        if (u + w > 1) { u = 1 - u; w = 1 - w; }
        points.verts.push(v3.add(a, v3.add(v3.mul(v3.sub(b, a), u), v3.mul(v3.sub(c, a), w))));
      }
      return { Points: points };
    },
  },
  INSTANCE_ON_POINTS: {
    en: 'Instance on Points', ko: '점에 인스턴스', cat: 'Instances', kinds: ['GEOMETRY'], inputs: [G('Points'), G('Instance'), V('Scale', 1)], outputs: [G('Instances')],
    run: (input, node, ctx) => {
      const points = input('Points') ?? createMesh();
      const inst = input('Instance');
      const out = createMesh();
      if (!inst) return { Instances: out };
      points.verts.forEach((p, i) => {
        const s = input('Scale', undefined, { ...ctx, memo: ctx.geometryMemo(), position: p, index: i });
        const copy = cloneMesh(inst);
        copy.verts = copy.verts.map((v) => v3.add(v3.mul(v, s), p));
        appendMesh(out, copy);
      });
      return { Instances: out };
    },
  },
  // ── Compositor
  CMP_RENDER_LAYERS: { en: 'Render Layers', ko: '렌더 레이어', cat: 'Input', kinds: ['COMPOSITOR'], inputs: [], outputs: [I('Image'), V('Alpha'), I('Depth'), I('Normal'), I('Position'), I('UV'), I('Albedo'), I('Emission'), I('Material Index'), I('Object Index')],
    run: (input, node, ctx) => ({
      'Object Index': ctx.passes?.objectIndex ?? emptyImage(),
      Image: ctx.render ?? emptyImage(), Depth: ctx.passes?.depth ?? emptyImage(), Normal: ctx.passes?.normal ?? emptyImage(), Position: ctx.passes?.position ?? emptyImage(), UV: ctx.passes?.uv ?? emptyImage(), Albedo: ctx.passes?.albedo ?? emptyImage(), Emission: ctx.passes?.emission ?? emptyImage(), 'Material Index': ctx.passes?.materialIndex ?? emptyImage(), Alpha: 1,
      ...Object.fromEntries([...LIGHT_PASSES, ...CRYPTO_LAYERS].map((name) => [name, ctx.passes?.light?.[name] ?? emptyImage()])),
      // One Combined image for every light group, as Blender adds them to the node.
      ...Object.fromEntries(Object.entries(ctx.passes?.lightGroups ?? {}).map(([name, img]) => [`Combined_${name}`, img])),
    }) },
  // Cryptomatte: a matte of the named objects or materials, from the cryptomatte layers; Pick shows every id in its own colour.
  CMP_CRYPTOMATTE: { en: 'Cryptomatte', ko: '크립토매트', cat: 'Matte', kinds: ['COMPOSITOR'], inputs: [I('Image')], outputs: [I('Image'), I('Matte'), I('Pick')], props: { source: 'OBJECT', matteId: '' }, options: { source: ['OBJECT', 'MATERIAL', 'ASSET'] },
    run: (input, node, ctx) => {
      const image = input('Image') ?? ctx.render ?? emptyImage();
      const key = node.values.source === 'MATERIAL' ? 'CryptoMaterial' : node.values.source === 'ASSET' ? 'CryptoAsset' : 'CryptoObject';
      const layers = [0, 1, 2].map((i) => ctx.passes?.light?.[`${key}0${i}`]).filter(Boolean);
      if (!layers.length) return { Image: image, Matte: emptyImage(), Pick: emptyImage() };
      const names = String(node.values.matteId ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const matte = cryptoMatte(layers, names);
      const out = { width: image.width, height: image.height, data: new Float32Array(image.data.length) };
      const pick = { width: layers[0].width, height: layers[0].height, data: new Float32Array(layers[0].data.length) };
      const bits = new DataView(new ArrayBuffer(4));
      for (let p = 0; p < out.data.length / 4; p++) {
        const m = matte.data[p * 4] ?? 0;
        for (let k = 0; k < 4; k++) out.data[p * 4 + k] = image.data[p * 4 + k] * m;
        bits.setFloat32(0, layers[0].data[p * 4]);
        const h = bits.getUint32(0);
        pick.data.set([(h & 255) / 255, ((h >>> 8) & 255) / 255, ((h >>> 16) & 255) / 255, 1], p * 4);
      }
      return { Image: out, Matte: matte, Pick: pick };
    } },
  CMP_OUTPUT: { en: 'Composite', ko: '합성 출력', cat: 'Output', kinds: ['COMPOSITOR'], inputs: [I('Image')], outputs: [], output: true, run: () => ({}) },
  CMP_VIEWER: { en: 'Viewer', ko: '뷰어', cat: 'Output', kinds: ['COMPOSITOR'], inputs: [I('Image')], outputs: [], run: () => ({}) },
  CMP_BLUR: { en: 'Blur', ko: '블러', cat: 'Filter', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Size', 4)], outputs: [I('Image')], run: (input) => ({ Image: blurImage(input('Image') ?? emptyImage(), input('Size')) }) },
  CMP_BRIGHT: { en: 'Bright/Contrast', ko: '밝기/대비', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Bright', 0), V('Contrast', 0)], outputs: [I('Image')],
    run: (input) => { const [b, c] = [input('Bright'), input('Contrast')]; const f = 1 + c; return { Image: mapImage(input('Image') ?? emptyImage(), (p) => p.map((x) => (x - 0.5) * f + 0.5 + b)) }; } },
  CMP_HSV: { en: 'Hue/Saturation/Value', ko: '색조/채도/명도', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Hue', 0.5), V('Saturation', 1), V('Value', 1)], outputs: [I('Image')],
    run: (input) => { const [h, s, v] = [input('Hue'), input('Saturation'), input('Value')]; return { Image: mapImage(input('Image') ?? emptyImage(), (p) => { const c = rgbToHsv(p.map((x) => Math.max(0, x))); return hsvToRgb([(c[0] + h - 0.5 + 1) % 1, clamp01(c[1] * s), c[2] * v]); }) }; } },
  CMP_INVERT: { en: 'Invert Color', ko: '색 반전', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [I('Image')], outputs: [I('Image')], run: (input) => ({ Image: mapImage(input('Image') ?? emptyImage(), (p) => p.map((x) => 1 - x)) }) },
  CMP_MIX: { en: 'Mix', ko: '혼합', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [V('Fac', 0.5), I('A'), I('B')], outputs: [I('Image')], props: { blend: 'MIX' }, options: { blend: Object.keys(BLEND) },
    run: (input, node) => {
      const [a, b] = [input('A') ?? emptyImage(), input('B')];
      if (!b || b.data.length !== a.data.length) return { Image: a };
      const fn = BLEND[node.values?.blend ?? 'MIX'] ?? BLEND.MIX;
      const t = clamp01(input('Fac'));
      return { Image: mapImage(a, (p, i) => p.map((x, k) => x + (fn(x, b.data[i + k]) - x) * t)) };
    } },
  CMP_GLARE: { en: 'Glare', ko: '글레어', cat: 'Filter', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Threshold', 1), V('Size', 8), V('Strength', 0.5)], outputs: [I('Image')],
    run: (input) => {
      const img = input('Image') ?? emptyImage();
      const th = input('Threshold');
      const bright = mapImage(img, (p) => (lum(p) > th ? p : [0, 0, 0]));
      const blur = blurImage(bright, input('Size'));
      const k = input('Strength');
      return { Image: mapImage(img, (p, i) => p.map((x, c) => x + blur.data[i + c] * k)) };
    } },
  CMP_VIGNETTE: { en: 'Vignette', ko: '비네트', cat: 'Filter', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Amount', 0.4)], outputs: [I('Image')],
    run: (input) => {
      const img = input('Image') ?? emptyImage();
      const k = input('Amount');
      return { Image: mapImage(img, (p, i) => {
        const n = i / 4;
        const [x, y] = [(n % img.width) / img.width - 0.5, Math.floor(n / img.width) / img.height - 0.5];
        const f = 1 - k * Math.min(1, (x * x + y * y) * 2);
        return p.map((c) => c * f);
      }) };
    } },
};

Object.assign(NODE_TYPES, moreNodes({ V, C, N, S, G, I, clamp01, lum, mix3, emptyBsdf, mapImage, blurImage, emptyImage, rgbToHsv, fbm, voronoi, freshCtx: (ctx, extra) => makeCtx({ ...ctx, ...extra }), inputOf: (graph, node, name, ctx) => {
  const link = graph.links.find((l) => l.to === node.id && l.in === name);
  const source = link && graph.nodes.find((n) => n.id === link.from);
  return source ? evalNode(graph, source, ctx)[link.out] : node.values?.[name] ?? NODE_TYPES[node.type].inputs.find((x) => x.name === name)?.def;
} }));

function appendMesh(out, m) {
  const base = out.verts.length;
  for (const v of m.verts) out.verts.push([...v]);
  m.faces.forEach((face) => addFace(out, face.map((i) => i + base)));
  for (const [a, b] of m.loose ?? []) out.loose.push([a + base, b + base]);
}

const NODE_SEQ = { n: 1 };
export function createNode(type, x = 0, y = 0, values = {}) {
  if (!NODE_TYPES[type]) throw new Error(`Unknown node: ${type}`);
  return { id: `n${NODE_SEQ.n++}_${Math.floor(Math.random() * 1e6).toString(36)}`, type, x, y, values: { ...structuredClone(NODE_TYPES[type].props ?? {}), ...values } };
}

export function addLink(graph, from, out, to, input) {
  graph.links = graph.links.filter((l) => !(l.to === to && l.in === input));
  graph.links.push({ from, out, to, in: input });
  return graph;
}

/** True when linking from→to would create a loop. */
export function wouldCycle(graph, from, to) {
  const stack = [from];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of graph.links) if (l.to === id) stack.push(l.from);
  }
  return false;
}

export function nodesForKind(kind) {
  return Object.entries(NODE_TYPES).filter(([, t]) => t.kinds.includes(kind) && !t.hidden).map(([id, t]) => ({ id, ...t }));
}

/** A node's sockets: fixed for most, from the group for group nodes. */
export function nodeSockets(node) {
  const spec = NODE_TYPES[node.type];
  if (node.type === 'GROUP') return { inputs: node.group?.inputs ?? [], outputs: node.group?.outputs ?? [] };
  if (node.type === 'NG_INPUT') return { inputs: [], outputs: node.sockets ?? [] };
  if (node.type === 'NG_OUTPUT') return { inputs: node.sockets ?? [], outputs: [] };
  if (node.type === 'CMP_RENDER_LAYERS') return { inputs: [], outputs: [...spec.outputs, ...(node.values?.passes ?? []).filter((name) => LIGHT_PASSES.includes(name) || CRYPTO_LAYERS.includes(name)).map(I), ...(node.values?.lightGroups ?? []).map((name) => I(`Combined_${name}`))] };
  if (node.type === 'SCRIPT_OSL') {
    const { shader } = oslShader(node.values?.source ?? '');
    const kind = (t) => (t === 'float' || t === 'int' ? 'VALUE' : t === 'color' ? 'COLOR' : 'VECTOR');
    return shader ? { inputs: shader.inputs.map((s) => ({ name: s.name, type: kind(s.type), def: s.def })), outputs: shader.outputs.map((s) => ({ name: s.name, type: kind(s.type) })) } : { inputs: [], outputs: [] };
  }
  return { inputs: spec?.inputs ?? [], outputs: spec?.outputs ?? [] };
}

const uniqueSocket = (list, name) => {
  let out = name;
  for (let i = 1; list.some((s) => s.name === out); i++) out = `${name}.${String(i).padStart(3, '0')}`;
  return out;
};

/**
 * Collapses nodes into one group node. Links crossing the boundary become its sockets; links inside move with the nodes.
 * Returns the group node, or null when there is nothing to group.
 */
export function makeGroup(graph, ids, name = 'NodeGroup', groupId = `grp${Date.now().toString(36)}${NODE_SEQ.n++}`) {
  const inside = new Set(ids);
  const nodes = graph.nodes.filter((n) => inside.has(n.id) && !NODE_TYPES[n.type]?.output && n.type !== 'GROUP_INPUT' && n.type !== 'GROUP_OUTPUT');
  if (!nodes.length) return null;
  const kept = new Set(nodes.map((n) => n.id));
  const [minX, maxX] = [Math.min(...nodes.map((n) => n.x)), Math.max(...nodes.map((n) => n.x))];
  const [minY, maxY] = [Math.min(...nodes.map((n) => n.y)), Math.max(...nodes.map((n) => n.y))];
  const inputNode = createNode('NG_INPUT', minX - 240, (minY + maxY) / 2);
  const outputNode = createNode('NG_OUTPUT', maxX + 240, (minY + maxY) / 2);
  const inputs = [];
  const outputs = [];
  const innerLinks = [];
  const outerLinks = [];
  const socketType = (node, name2, dir) => nodeSockets(node)[dir].find((s) => s.name === name2)?.type ?? 'VALUE';
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const inputFor = new Map();
  const outputFor = new Map();
  for (const l of graph.links) {
    const [fromIn, toIn] = [kept.has(l.from), kept.has(l.to)];
    if (fromIn && toIn) innerLinks.push(l);
    else if (toIn) {
      // One outside output feeding several inside sockets stays one socket.
      const key = `${l.from}|${l.out}`;
      if (!inputFor.has(key)) {
        const socketName = uniqueSocket(inputs, l.in);
        inputs.push({ name: socketName, type: socketType(byId.get(l.to), l.in, 'inputs') });
        inputFor.set(key, socketName);
        outerLinks.push({ from: l.from, out: l.out, toSelf: socketName });
      }
      innerLinks.push({ from: inputNode.id, out: inputFor.get(key), to: l.to, in: l.in });
    } else if (fromIn) {
      const key = `${l.from}|${l.out}`;
      if (!outputFor.has(key)) {
        const socketName = uniqueSocket(outputs, l.out);
        outputs.push({ name: socketName, type: socketType(byId.get(l.from), l.out, 'outputs') });
        outputFor.set(key, socketName);
        innerLinks.push({ from: l.from, out: l.out, to: outputNode.id, in: socketName });
      }
      outerLinks.push({ fromSelf: outputFor.get(key), to: l.to, in: l.in });
    } else outerLinks.push(l);
  }
  // A group with nothing leaving it still needs something to show: every output of its last node.
  if (!outputs.length) {
    const last = nodes.reduce((a, b) => (b.x > a.x ? b : a));
    for (const s of nodeSockets(last).outputs) {
      const socketName = uniqueSocket(outputs, s.name);
      outputs.push({ name: socketName, type: s.type });
      innerLinks.push({ from: last.id, out: s.name, to: outputNode.id, in: socketName });
    }
  }
  inputNode.sockets = inputs;
  outputNode.sockets = outputs;
  const groupNode = createNode('GROUP', (minX + maxX) / 2, (minY + maxY) / 2);
  groupNode.group = { id: groupId, name, inputs, outputs, graph: { kind: graph.kind, nodes: [inputNode, ...nodes, outputNode], links: innerLinks } };
  graph.nodes = [...graph.nodes.filter((n) => !kept.has(n.id)), groupNode];
  graph.links = outerLinks.map((l) => {
    if (l.toSelf) return { from: l.from, out: l.out, to: groupNode.id, in: l.toSelf };
    if (l.fromSelf) return { from: groupNode.id, out: l.fromSelf, to: l.to, in: l.in };
    return l;
  });
  return groupNode;
}

/** Puts a group's nodes back in its tree. */
export function ungroup(graph, groupNodeId) {
  const node = graph.nodes.find((n) => n.id === groupNodeId && n.type === 'GROUP');
  if (!node?.group) return false;
  const inner = structuredClone(node.group.graph);
  const input = inner.nodes.find((n) => n.type === 'NG_INPUT');
  const output = inner.nodes.find((n) => n.type === 'NG_OUTPUT');
  const links = [];
  for (const l of inner.links) {
    if (l.from === input?.id || l.to === output?.id) continue;
    links.push(l);
  }
  // Inside values that came through the group's own unlinked inputs stay as typed on the inside nodes.
  for (const l of graph.links) {
    if (l.to === node.id) {
      for (const i of inner.links) if (i.from === input?.id && i.out === l.in) links.push({ from: l.from, out: l.out, to: i.to, in: i.in });
    } else if (l.from === node.id) {
      const source = inner.links.find((i) => i.to === output?.id && i.in === l.out);
      if (source) links.push({ from: source.from, out: source.out, to: l.to, in: l.in });
    } else links.push(l);
  }
  for (const [socket, value] of Object.entries(node.values ?? {})) {
    if (graph.links.some((l) => l.to === node.id && l.in === socket)) continue;
    for (const i of inner.links) if (i.from === input?.id && i.out === socket) { const target = inner.nodes.find((n) => n.id === i.to); if (target) target.values[i.in] = value; }
  }
  graph.nodes = [...graph.nodes.filter((n) => n !== node), ...inner.nodes.filter((n) => n !== input && n !== output)];
  graph.links = links;
  return true;
}

/** Every node tree in a document. */
export function allGraphs(doc) {
  const out = [];
  const take = (g) => { if (g?.nodes) out.push(g); };
  for (const m of doc.materials ?? []) take(m.nodes);
  take(doc.world?.nodes);
  take(doc.compositor);
  for (const o of doc.objects ?? []) for (const mod of o.modifiers ?? []) take(mod.graph);
  return out;
}

const visitGroups = (graph, fn) => { for (const n of graph.nodes) if (n.type === 'GROUP' && n.group) { fn(n); visitGroups(n.group.graph, fn); } };

/** After editing a group: every other use of it takes the new definition, and it is remembered for the Add menu. */
export function syncGroupInstances(doc, group) {
  doc.nodeGroups = [...(doc.nodeGroups ?? []).filter((g) => g.id !== group.id), structuredClone(group)];
  let n = 0;
  for (const graph of allGraphs(doc)) visitGroups(graph, (node) => { if (node.group.id === group.id && node.group !== group) { node.group = structuredClone(group); n++; } });
  return n;
}

/** A new node using a remembered group. */
export function createGroupNode(group, x = 0, y = 0) {
  const node = createNode('GROUP', x, y);
  node.group = structuredClone(group);
  return node;
}

/** Evaluates one output of a node. */
function evalNode(graph, node, ctx, stack = new Set()) {
  const spec = NODE_TYPES[node.type];
  if (!spec) return {};
  if (ctx.memo.has(node.id)) return ctx.memo.get(node.id);
  if (stack.has(node.id)) return {};
  stack.add(node.id);
  const input = (name, fallback, overrideCtx) => {
    const socket = nodeSockets(node).inputs.find((s) => s.name === name);
    const link = graph.links.find((l) => l.to === node.id && l.in === name);
    if (link) {
      const source = graph.nodes.find((n) => n.id === link.from);
      if (source) {
        const value = evalNode(graph, source, overrideCtx ?? ctx, overrideCtx ? new Set() : stack)[link.out];
        return convert(value, socket?.type);
      }
    }
    if (fallback !== undefined) return fallback;
    return node.values?.[name] ?? socket?.def;
  };
  const result = spec.run(input, node, ctx, graph);
  ctx.memo.set(node.id, result);
  stack.delete(node.id);
  return result;
}

/** Links connect differently typed sockets: value ↔ colour ↔ vector convert like a shader tree expects. */
function convert(value, to) {
  if (value == null) return value;
  if (to === 'VALUE') return Array.isArray(value) ? lum(value) : value;
  if ((to === 'COLOR' || to === 'VECTOR') && typeof value === 'number') return [value, value, value];
  return value;
}

function makeCtx(extra) {
  const memo = new Map();
  return {
    ...extra,
    memo,
    // Field evaluation: geometry made upstream is not rebuilt for each vertex.
    geometryMemo: () => {
      const m = new Map();
      for (const [key, value] of memo) if (value && Object.values(value).some((x) => x?.verts)) m.set(key, value);
      return m;
    },
  };
}

function outputNode(graph) {
  return graph?.nodes?.find((n) => NODE_TYPES[n.type]?.output);
}

/** What a shader tree gives at a surface point: base colour, roughness, … `ctx`: { uv, position, normal, images }. */
export function evalShader(graph, ctx) {
  const output = outputNode(graph);
  if (!output) return null;
  const link = graph.links.find((l) => l.to === output.id && l.in === 'Surface');
  if (!link) return null;
  const source = graph.nodes.find((n) => n.id === link.from);
  if (!source) return null;
  return evalNode(graph, source, makeCtx(ctx))[link.out] ?? null;
}

const linkInto = (graph, name) => { const output = outputNode(graph); return output && graph.links.find((l) => l.to === output.id && l.in === name); };
/** Whether a tree says anything about one of its output's inputs. */
export const treeUses = (graph, name) => Boolean(linkInto(graph, name));

/** How far a surface point moves, as a vector, when the tree's output has a Displacement input. */
export function evalDisplacement(graph, ctx) {
  const link = linkInto(graph, 'Displacement');
  const source = link && graph.nodes.find((n) => n.id === link.from);
  return source ? evalNode(graph, source, makeCtx(ctx))[link.out] ?? null : null;
}

/** The medium at a point: { density, color, anisotropy, emission, absorb }, or null. */
export function evalVolume(graph, ctx) {
  const link = linkInto(graph, 'Volume');
  const source = link && graph.nodes.find((n) => n.id === link.from);
  const v = source ? evalNode(graph, source, makeCtx(ctx))[link.out] : null;
  if (!v) return null;
  // An Emission node wired here glows without blocking much.
  return v.density != null ? v : { density: 1, color: [0, 0, 0], anisotropy: 0, emission: v.emission ?? [0, 0, 0], absorb: false };
}

/** World colour for a direction (`ctx.normal`); null when the tree has no output. */
export function evalWorld(graph, ctx) {
  return evalShader(graph, ctx)?.emission ?? null;
}

export function evalGeometryNodes(graph, inputMesh, ctx = {}) {
  const output = outputNode(graph);
  if (!output) return cloneMesh(inputMesh);
  const link = graph.links.find((l) => l.to === output.id && l.in === 'Geometry');
  if (!link) return createMesh();
  const source = graph.nodes.find((n) => n.id === link.from);
  const result = source ? evalNode(graph, source, makeCtx({ ...ctx, input: inputMesh }))[link.out] : null;
  return result ? cloneMesh(result) : createMesh();
}

/** Runs the compositor over a rendered image ({ width, height, data: Float32Array RGBA, linear }). */
export function evalCompositor(graph, render, passes = null) {
  const output = outputNode(graph);
  if (!output) return render;
  const link = graph.links.find((l) => l.to === output.id && l.in === 'Image');
  if (!link) return render;
  const source = graph.nodes.find((n) => n.id === link.from);
  return evalNode(graph, source, makeCtx({ render, passes }))[link.out] ?? render;
}

export function defaultShaderGraph(material = null) {
  const bsdf = createNode('BSDF_PRINCIPLED', 240, 80, material ? { 'Base Color': material.baseColor, Metallic: material.metallic, Roughness: material.roughness } : {});
  const out = createNode('OUTPUT_MATERIAL', 560, 80);
  const graph = { kind: 'SHADER', nodes: [bsdf, out], links: [] };
  return addLink(graph, bsdf.id, 'BSDF', out.id, 'Surface');
}

export function defaultWorldGraph(color = [0.05, 0.05, 0.05], strength = 1) {
  const bg = createNode('BACKGROUND', 240, 80, { Color: color, Strength: strength });
  const out = createNode('OUTPUT_WORLD', 520, 80);
  const graph = { kind: 'WORLD', nodes: [bg, out], links: [] };
  return addLink(graph, bg.id, 'Background', out.id, 'Surface');
}

export function defaultGeometryGraph() {
  const input = createNode('GROUP_INPUT', 80, 80);
  const out = createNode('GROUP_OUTPUT', 480, 80);
  const graph = { kind: 'GEOMETRY', nodes: [input, out], links: [] };
  return addLink(graph, input.id, 'Geometry', out.id, 'Geometry');
}

export function defaultCompositorGraph() {
  const layers = createNode('CMP_RENDER_LAYERS', 80, 80);
  const out = createNode('CMP_OUTPUT', 480, 80);
  const graph = { kind: 'COMPOSITOR', nodes: [layers, out], links: [] };
  return addLink(graph, layers.id, 'Image', out.id, 'Image');
}

export { faceNormal, recalcNormals };
