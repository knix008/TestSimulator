// The wider set of nodes: more surface inputs and textures, colour and vector tools; geometry tools with named attributes; compositing filters.
// Merged into NODE_TYPES by nodes.js, which hands over its socket makers and helpers. Some shaders here are approximations of what the path
// tracer can do with its one surface model, and they say so.
import { addFace, boundingBox, cloneMesh, compact, createMesh, cubeMesh, faceCenter, v3, vertexNormals } from './mesh.js';
import { triangulateMesh, subdivideAll } from './meshtools-graph.js';
import { convexHull } from './rigid.js';

/** A simulation's past frames for each output node, so that playing forward does not start over each frame. */
const simulationCache = new WeakMap();
const KEPT_FRAMES = 400;

export function moreNodes({ V, C, N, S, G, I, clamp01, lum, mix3, emptyBsdf, mapImage, blurImage, emptyImage, rgbToHsv: _rgbToHsv, fbm, voronoi, freshCtx, inputOf }) {
  void _rgbToHsv;
  void voronoi;
  const ALL_TREES = ['SHADER', 'WORLD', 'GEOMETRY', 'COMPOSITOR'];
  const SURFACE = ['SHADER', 'WORLD'];
  const pointOf = (input, ctx) => input('Vector', null) ?? ctx.position ?? [0, 0, 0];
  const fract = (x) => x - Math.floor(x);
  const white = (x, y, z, seed = 0) => fract(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453);

  /**
   * The start of the zone an end node closes: the nearest node of that kind upstream, nested zones being stepped over. No pairing is stored, so a zone is simply
   * whatever is wired between the two.
   */
  const zoneStart = (graph, end, startType, endType) => {
    const seen = new Set();
    const walk = (node, depth) => {
      for (const link of graph.links) {
        if (link.to !== node.id || seen.has(`${link.from}${depth}`)) continue;
        seen.add(`${link.from}${depth}`);
        const up = graph.nodes.find((n) => n.id === link.from);
        if (!up) continue;
        if (up.type === startType && depth === 0) return up;
        const found = walk(up, depth + (up.type === endType ? 1 : up.type === startType ? -1 : 0));
        if (found) return found;
      }
      return null;
    };
    return walk(end, 0);
  };
  /** What a zone's start hands out inside it: the state of this round, or before any round what comes into it. */
  const zoneValues = (input, node, ctx) => ctx.zones?.[node.id] ?? null;

  // ─────────────── geometry helpers
  const selected = (input, ctx, m, name = 'Selection') => {
    const normals = vertexNormals(m);
    return m.verts.map((p, i) => input(name, undefined, { ...ctx, memo: ctx.geometryMemo(), position: p, normal: normals[i], index: i, mesh: m }) > 0.5);
  };
  const keepFaces = (mesh, keep) => {
    const m = cloneMesh(mesh);
    m.faces = m.faces.filter((face) => face.every((v) => keep[v]));
    m.uvs = null;
    m.faceMat = null;
    const lone = !mesh.faces.length;
    if (lone) { m.verts = m.verts.filter((_, i) => keep[i]); return m; }
    return compact(m);
  };

  return {
    // ─────────────── shaders
    BSDF_TRANSLUCENT: { en: 'Translucent BSDF', ko: '반투명 BSDF', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color')], outputs: [S('BSDF')], run: (input) => ({ BSDF: { ...emptyBsdf(), baseColor: input('Color'), roughness: 1, transmission: 1, ior: 1 } }) },
    BSDF_REFRACTION: { en: 'Refraction BSDF', ko: '굴절 BSDF', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color', [1, 1, 1]), V('Roughness', 0), V('IOR', 1.45)], outputs: [S('BSDF')], run: (input) => ({ BSDF: { ...emptyBsdf(), baseColor: input('Color'), roughness: input('Roughness'), ior: input('IOR'), transmission: 1 } }) },
    BSDF_SHEEN: { en: 'Sheen BSDF', ko: '시언 BSDF', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color'), V('Roughness', 0.5)], outputs: [S('BSDF')],
      // Light along the edge of the view, over nothing: velvet's look without a dedicated lobe.
      run: (input, node, ctx) => { const c = input('Color'); const facing = ctx.view && ctx.normal ? Math.max(0, v3.dot(ctx.view, ctx.normal)) : 1; const k = (1 - facing) ** (1 + 4 * input('Roughness')); return { BSDF: { ...emptyBsdf(), baseColor: c.map((x) => x * k), roughness: 1 } }; } },
    BSDF_SSS: { en: 'Subsurface Scattering', ko: '서브서피스 스캐터링', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color'), V('Scale', 0.05)], outputs: [S('BSDF')],
      // As diffuse with its shadows softened by the colour: no real scattering under the surface.
      run: (input) => { const c = input('Color'); return { BSDF: { ...emptyBsdf(), baseColor: c, roughness: 1, emission: c.map((x) => x * Math.min(0.1, input('Scale'))) } }; } },
    ADD_SHADER: { en: 'Add Shader', ko: '셰이더 더하기', cat: 'Shader', kinds: ['SHADER'], inputs: [S('Shader 1'), S('Shader 2')], outputs: [S('Shader')],
      run: (input) => {
        const [a, b] = [input('Shader 1') ?? emptyBsdf(), input('Shader 2') ?? emptyBsdf()];
        return { Shader: { ...a, baseColor: a.baseColor.map((x, k) => x + b.baseColor[k]), specular: Math.min(1, a.specular + b.specular), metallic: Math.max(a.metallic, b.metallic), roughness: Math.min(a.roughness, b.roughness), emission: a.emission.map((x, k) => x + b.emission[k]) } };
      } },
    HOLDOUT: { en: 'Holdout', ko: '홀드아웃', cat: 'Shader', kinds: ['SHADER'], inputs: [], outputs: [S('Holdout')], run: () => ({ Holdout: { ...emptyBsdf(), alpha: 0 } }) },
    // ─────────────── volumes and displacement
    VOLUME_PRINCIPLED: { en: 'Principled Volume', ko: '프린시펄드 볼륨', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color', [0.5, 0.5, 0.5]), V('Density', 1), V('Anisotropy', 0), C('Emission Color', [1, 1, 1]), V('Emission Strength', 0)], outputs: [S('Volume')],
      run: (input) => { const [c, k] = [input('Emission Color'), input('Emission Strength')]; return { Volume: { density: input('Density'), color: input('Color'), anisotropy: input('Anisotropy'), emission: c.map((x) => x * k), absorb: false } }; } },
    VOLUME_SCATTER: { en: 'Volume Scatter', ko: '볼륨 산란', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color', [0.8, 0.8, 0.8]), V('Density', 1), V('Anisotropy', 0)], outputs: [S('Volume')],
      run: (input) => ({ Volume: { density: input('Density'), color: input('Color'), anisotropy: input('Anisotropy'), emission: [0, 0, 0], absorb: false } }) },
    VOLUME_ABSORPTION: { en: 'Volume Absorption', ko: '볼륨 흡수', cat: 'Shader', kinds: ['SHADER'], inputs: [C('Color', [0.8, 0.8, 0.8]), V('Density', 1)], outputs: [S('Volume')],
      run: (input) => ({ Volume: { density: input('Density'), color: input('Color'), anisotropy: 0, emission: [0, 0, 0], absorb: true } }) },
    DISPLACEMENT: { en: 'Displacement', ko: '디스플레이스먼트', cat: 'Vector', kinds: ['SHADER'], inputs: [V('Height', 0), V('Midlevel', 0.5), V('Scale', 1), N('Normal', null)], outputs: [N('Displacement')],
      run: (input, node, ctx) => { const n = v3.norm(input('Normal', null) ?? ctx.normal ?? [0, 0, 1]); return { Displacement: v3.mul(n, (input('Height') - input('Midlevel')) * input('Scale')) }; } },
    // ─────────────── surface inputs
    FRESNEL: { en: 'Fresnel', ko: '프레넬', cat: 'Input', kinds: ['SHADER'], inputs: [V('IOR', 1.45)], outputs: [V('Fac')],
      run: (input, node, ctx) => {
        const cos = ctx.view && ctx.normal ? Math.max(0, v3.dot(ctx.view, ctx.normal)) : 1;
        const f0 = ((1 - input('IOR')) / (1 + input('IOR'))) ** 2;
        return { Fac: f0 + (1 - f0) * (1 - cos) ** 5 };
      } },
    LAYER_WEIGHT: { en: 'Layer Weight', ko: '레이어 가중치', cat: 'Input', kinds: ['SHADER'], inputs: [V('Blend', 0.5)], outputs: [V('Fresnel'), V('Facing')],
      run: (input, node, ctx) => {
        const cos = ctx.view && ctx.normal ? Math.max(0, v3.dot(ctx.view, ctx.normal)) : 1;
        const b = clamp01(input('Blend'));
        const ior = 1 / Math.max(1e-4, 1 - b);
        const f0 = ((1 - ior) / (1 + ior)) ** 2;
        const bend = b < 0.5 ? 2 * b : 0.5 / Math.max(1e-4, 1 - b);
        return { Fresnel: f0 + (1 - f0) * (1 - cos) ** 5, Facing: 1 - cos ** bend };
      } },
    LIGHT_PATH: { en: 'Light Path', ko: '빛 경로', cat: 'Input', kinds: SURFACE, inputs: [], outputs: [V('Is Camera Ray'), V('Ray Depth'), V('Ray Length')], run: (input, node, ctx) => ({ 'Is Camera Ray': (ctx.depth ?? 0) === 0 ? 1 : 0, 'Ray Depth': ctx.depth ?? 0, 'Ray Length': ctx.rayLength ?? 0 }) },
    CAMERA_DATA: { en: 'Camera Data', ko: '카메라 데이터', cat: 'Input', kinds: ['SHADER'], inputs: [], outputs: [N('View Vector'), V('View Distance')], run: (input, node, ctx) => ({ 'View Vector': ctx.view ?? [0, 0, 1], 'View Distance': ctx.rayLength ?? 0 }) },
    UV_MAP: { en: 'UV Map', ko: 'UV 맵', cat: 'Input', kinds: ['SHADER'], inputs: [], outputs: [N('UV')], run: (input, node, ctx) => ({ UV: [ctx.uv?.[0] ?? 0, ctx.uv?.[1] ?? 0, 0] }) },
    // ─────────────── textures
    TEX_WAVE: { en: 'Wave Texture', ko: '웨이브 텍스처', cat: 'Texture', kinds: ['SHADER', 'WORLD', 'GEOMETRY'], inputs: [N('Vector'), V('Scale', 5), V('Distortion', 0), V('Detail', 2)], outputs: [V('Fac'), C('Color')], props: { direction: 'X', profile: 'SINE' }, options: { direction: ['X', 'Y', 'Z', 'DIAGONAL', 'RINGS'], profile: ['SINE', 'SAW', 'TRIANGLE'] },
      run: (input, node, ctx) => {
        const p = pointOf(input, ctx);
        const s = input('Scale');
        const [x, y, z] = [p[0] * s, p[1] * s, p[2] * s];
        const dir = node.values?.direction ?? 'X';
        let n = dir === 'Y' ? y : dir === 'Z' ? z : dir === 'DIAGONAL' ? (x + y + z) / 1.5 : dir === 'RINGS' ? Math.hypot(x, y, z) * 2 : x;
        n *= Math.PI;
        const d = input('Distortion');
        if (d) n += d * (fbm(x, y, z, Math.max(1, Math.round(input('Detail'))), 0.5) * 2 - 1);
        const profile = node.values?.profile ?? 'SINE';
        const f = profile === 'SAW' ? fract(n / (2 * Math.PI)) : profile === 'TRIANGLE' ? Math.abs(fract(n / (2 * Math.PI)) * 2 - 1) : 0.5 + 0.5 * Math.sin(n - Math.PI / 2);
        return { Fac: f, Color: [f, f, f] };
      } },
    TEX_MAGIC: { en: 'Magic Texture', ko: '매직 텍스처', cat: 'Texture', kinds: ['SHADER', 'WORLD'], inputs: [N('Vector'), V('Scale', 5), V('Distortion', 1)], outputs: [C('Color'), V('Fac')],
      run: (input, node, ctx) => {
        const p = pointOf(input, ctx);
        const [s, d] = [input('Scale'), input('Distortion')];
        const [x, y, z] = [Math.sin((p[0] + p[1] + p[2]) * s * 5), Math.cos((-p[0] + p[1] - p[2]) * s * 5), -Math.cos((-p[0] - p[1] + p[2]) * s * 5)];
        const c = [Math.cos(x * d * 3.14) * 0.5 + 0.5, Math.cos(y * d * 3.14) * 0.5 + 0.5, Math.cos(z * d * 3.14) * 0.5 + 0.5];
        return { Color: c, Fac: (c[0] + c[1] + c[2]) / 3 };
      } },
    TEX_BRICK: { en: 'Brick Texture', ko: '벽돌 텍스처', cat: 'Texture', kinds: ['SHADER'], inputs: [N('Vector'), C('Color1', [0.8, 0.8, 0.8]), C('Color2', [0.2, 0.2, 0.2]), C('Mortar', [0, 0, 0]), V('Scale', 5), V('Mortar Size', 0.02), V('Brick Width', 0.5), V('Row Height', 0.25)], outputs: [C('Color'), V('Fac')],
      run: (input, node, ctx) => {
        const p = pointOf(input, ctx);
        const s = input('Scale');
        const [w, h, m] = [Math.max(1e-4, input('Brick Width')), Math.max(1e-4, input('Row Height')), input('Mortar Size')];
        const y = p[1] * s;
        const row = Math.floor(y / h);
        const x = p[0] * s + (row % 2 ? w / 2 : 0);
        const col = Math.floor(x / w);
        const [fx, fy] = [x / w - col, y / h - row];
        const edge = Math.min(fx * w, (1 - fx) * w, fy * h, (1 - fy) * h);
        if (edge < m) return { Color: input('Mortar'), Fac: 1 };
        return { Color: mix3(input('Color1'), input('Color2'), white(col, row, 0)), Fac: 0 };
      } },
    TEX_WHITE_NOISE: { en: 'White Noise', ko: '화이트 노이즈', cat: 'Texture', kinds: ['SHADER', 'WORLD', 'GEOMETRY'], inputs: [N('Vector')], outputs: [V('Value'), C('Color')],
      run: (input, node, ctx) => {
        const p = pointOf(input, ctx);
        return { Value: white(p[0], p[1], p[2]), Color: [white(p[0], p[1], p[2], 1), white(p[0], p[1], p[2], 2), white(p[0], p[1], p[2], 3)] };
      } },
    TEX_ENVIRONMENT: { en: 'Environment Texture', ko: '환경 텍스처', cat: 'Texture', kinds: ['WORLD'], inputs: [N('Vector')], outputs: [C('Color')], props: { image: null },
      run: (input, node, ctx) => {
        const d = v3.norm(input('Vector', null) ?? ctx.normal ?? [0, 0, 1]);
        const img = ctx.images?.[node.values?.image];
        if (!img) return { Color: [1, 0, 1] };
        // Equirectangular: longitude across, latitude up.
        const u = (Math.atan2(d[1], d[0]) / (2 * Math.PI) + 0.5) % 1;
        const w = Math.acos(Math.max(-1, Math.min(1, d[2]))) / Math.PI;
        const i = (Math.min(img.height - 1, Math.floor(w * img.height)) * img.width + Math.min(img.width - 1, Math.floor(u * img.width))) * 4;
        const srgb = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return { Color: [srgb(img.rgba[i]), srgb(img.rgba[i + 1]), srgb(img.rgba[i + 2])] };
      } },
    // ─────────────── colour
    BRIGHT_CONTRAST: { en: 'Bright/Contrast', ko: '밝기/대비', cat: 'Color', kinds: SURFACE, inputs: [C('Color'), V('Bright', 0), V('Contrast', 0)], outputs: [C('Color')],
      run: (input) => { const [b, c] = [input('Bright'), input('Contrast')]; const a = 1 + c; const k = b - c * 0.5; return { Color: input('Color').map((x) => Math.max(0, a * x + k)) }; } },
    GAMMA: { en: 'Gamma', ko: '감마', cat: 'Color', kinds: SURFACE, inputs: [C('Color'), V('Gamma', 1)], outputs: [C('Color')], run: (input) => ({ Color: input('Color').map((x) => Math.max(0, x) ** input('Gamma')) }) },
    RGB_TO_BW: { en: 'RGB to BW', ko: 'RGB를 흑백으로', cat: 'Converter', kinds: SURFACE, inputs: [C('Color')], outputs: [V('Val')], run: (input) => ({ Val: lum(input('Color')) }) },
    COMBINE_COLOR: { en: 'Combine Color', ko: '색 결합', cat: 'Converter', kinds: SURFACE, inputs: [V('Red'), V('Green'), V('Blue')], outputs: [C('Color')], run: (input) => ({ Color: [input('Red'), input('Green'), input('Blue')] }) },
    SEPARATE_COLOR: { en: 'Separate Color', ko: '색 분리', cat: 'Converter', kinds: SURFACE, inputs: [C('Color')], outputs: [V('Red'), V('Green'), V('Blue')], run: (input) => { const c = input('Color'); return { Red: c[0], Green: c[1], Blue: c[2] }; } },
    BLACKBODY: { en: 'Blackbody', ko: '흑체', cat: 'Converter', kinds: SURFACE, inputs: [V('Temperature', 1500)], outputs: [C('Color')],
      // Tanner Helland's fit to the Planckian locus, in linear light.
      run: (input) => {
        const t = Math.max(800, Math.min(40000, input('Temperature'))) / 100;
        const r = t <= 66 ? 1 : 1.2929 * (t - 60) ** -0.1332;
        const g = t <= 66 ? 0.39008 * Math.log(t) - 0.63184 : 1.1299 * (t - 60) ** -0.0755;
        const b = t >= 66 ? 1 : t <= 19 ? 0 : 0.54320 * Math.log(t - 10) - 1.19625;
        const linear = (x) => { const v = Math.max(0, Math.min(1, x)); return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return { Color: [linear(r), linear(g), linear(b)] };
      } },
    WAVELENGTH: { en: 'Wavelength', ko: '파장', cat: 'Converter', kinds: SURFACE, inputs: [V('Wavelength', 500)], outputs: [C('Color')],
      run: (input) => {
        const w = input('Wavelength');
        const g = (mid, a, b) => { const d = w - mid; return Math.exp(-0.5 * (d / (d < 0 ? a : b)) ** 2); };
        return { Color: [clamp01(g(600, 50, 40) + 0.3 * g(445, 25, 20)), clamp01(g(545, 45, 40)), clamp01(g(450, 25, 30))] };
      } },
    // ─────────────── values, in any tree
    MAP_RANGE: { en: 'Map Range', ko: '범위 변환', cat: 'Converter', kinds: ALL_TREES, inputs: [V('Value', 1), V('From Min', 0), V('From Max', 1), V('To Min', 0), V('To Max', 1)], outputs: [V('Result')], props: { clamp: 'TRUE' }, options: { clamp: ['TRUE', 'FALSE'] },
      run: (input, node) => {
        const [a, b, c, d] = [input('From Min'), input('From Max'), input('To Min'), input('To Max')];
        const t = b === a ? 0 : (input('Value') - a) / (b - a);
        return { Result: c + (d - c) * ((node.values?.clamp ?? 'TRUE') === 'TRUE' ? clamp01(t) : t) };
      } },
    CLAMP: { en: 'Clamp', ko: '범위 제한', cat: 'Converter', kinds: ALL_TREES, inputs: [V('Value', 1), V('Min', 0), V('Max', 1)], outputs: [V('Result')], run: (input) => ({ Result: Math.max(input('Min'), Math.min(input('Max'), input('Value'))) }) },
    // ─────────────── vectors
    BUMP: { en: 'Bump', ko: '범프', cat: 'Vector', kinds: ['SHADER'], inputs: [V('Strength', 1), V('Distance', 1), V('Height', 0), N('Normal', null)], outputs: [N('Normal')],
      // The height's slope at this point, read by evaluating it a little to each side.
      run: (input, node, ctx) => {
        const n = v3.norm(input('Normal', null) ?? ctx.normal ?? [0, 0, 1]);
        const base = input('Height');
        if (!ctx.position || typeof base !== 'number') return { Normal: n };
        const e = 1e-3;
        const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const t = v3.norm(v3.cross(ref, n));
        const b = v3.cross(n, t);
        const at = (dir, du, dv) => input('Height', undefined, { ...ctx, memo: new Map(), position: v3.add(ctx.position, v3.mul(dir, e)), uv: ctx.uv ? [ctx.uv[0] + du, ctx.uv[1] + dv] : ctx.uv });
        const k = input('Strength') * input('Distance');
        const [dt, db] = [(at(t, e, 0) - base) / e, (at(b, 0, e) - base) / e];
        return { Normal: v3.norm(v3.sub(n, v3.add(v3.mul(t, dt * k), v3.mul(b, db * k)))) };
      } },
    NORMAL_MAP: { en: 'Normal Map', ko: '노멀 맵', cat: 'Vector', kinds: ['SHADER'], inputs: [V('Strength', 1), C('Color', [0.5, 0.5, 1])], outputs: [N('Normal')],
      run: (input, node, ctx) => {
        const n = v3.norm(ctx.normal ?? [0, 0, 1]);
        const c = input('Color');
        const s = input('Strength');
        const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const t = v3.norm(v3.cross(ref, n));
        const b = v3.cross(n, t);
        return { Normal: v3.norm(v3.add(v3.mul(n, c[2] * 2 - 1), v3.add(v3.mul(t, (c[0] * 2 - 1) * s), v3.mul(b, (c[1] * 2 - 1) * s)))) };
      } },
    VECTOR_ROTATE: { en: 'Vector Rotate', ko: '벡터 회전', cat: 'Vector', kinds: ['SHADER', 'GEOMETRY'], inputs: [N('Vector'), N('Center'), N('Axis', [0, 0, 1]), V('Angle', 0)], outputs: [N('Vector')],
      run: (input) => {
        const c = input('Center');
        const p = v3.sub(input('Vector'), c);
        const k = v3.norm(input('Axis'));
        const a = input('Angle');
        const [cos, sin] = [Math.cos(a), Math.sin(a)];
        const turned = v3.add(v3.add(v3.mul(p, cos), v3.mul(v3.cross(k, p), sin)), v3.mul(k, v3.dot(k, p) * (1 - cos)));
        return { Vector: v3.add(turned, c) };
      } },
    // ─────────────── geometry
    MESH_LINE: { en: 'Mesh Line', ko: '메시 선', cat: 'Mesh Primitives', kinds: ['GEOMETRY'], inputs: [V('Count', 10), N('Start'), N('Offset', [0, 0, 1])], outputs: [G('Mesh')],
      run: (input) => {
        const m = createMesh();
        const count = Math.max(1, input('Count') | 0);
        const [start, offset] = [input('Start'), input('Offset')];
        for (let i = 0; i < count; i++) { m.verts.push(v3.add(start, v3.mul(offset, i))); if (i) m.loose.push([i - 1, i]); }
        return { Mesh: m };
      } },
    POINTS: { en: 'Points', ko: '점', cat: 'Point', kinds: ['GEOMETRY'], inputs: [V('Count', 1), N('Position')], outputs: [G('Points')], field: false,
      run: (input, node, ctx) => {
        const m = createMesh();
        const count = Math.max(0, Math.min(100000, input('Count') | 0));
        for (let i = 0; i < count; i++) m.verts.push([...input('Position', undefined, { ...ctx, memo: ctx.geometryMemo(), index: i, position: [0, 0, 0] })]);
        return { Points: m };
      } },
    MESH_TO_POINTS: { en: 'Mesh to Points', ko: '메시를 점으로', cat: 'Point', kinds: ['GEOMETRY'], inputs: [G('Mesh')], outputs: [G('Points')], run: (input) => { const m = createMesh(); for (const v of (input('Mesh') ?? createMesh()).verts) m.verts.push([...v]); return { Points: m }; } },
    REALIZE_INSTANCES: { en: 'Realize Instances', ko: '인스턴스 실체화', cat: 'Instances', kinds: ['GEOMETRY'], inputs: [G('Geometry')], outputs: [G('Geometry')],
      // Instances here are real geometry from the start.
      run: (input) => ({ Geometry: input('Geometry') ?? createMesh() }) },
    TRIANGULATE: { en: 'Triangulate', ko: '삼각분할', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('Mesh')], outputs: [G('Mesh')], run: (input) => ({ Mesh: triangulateMesh(input('Mesh') ?? createMesh()) }) },
    SUBDIVIDE_MESH: { en: 'Subdivide Mesh', ko: '메시 세분', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('Mesh'), V('Level', 1)], outputs: [G('Mesh')],
      run: (input) => { let m = input('Mesh') ?? createMesh(); for (let i = 0; i < Math.min(6, input('Level') | 0); i++) m = subdivideAll(m); return { Mesh: m }; } },
    BOUNDING_BOX: { en: 'Bounding Box', ko: '경계 상자', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [G('Geometry')], outputs: [G('Bounding Box'), N('Min'), N('Max')],
      run: (input) => {
        const m = input('Geometry') ?? createMesh();
        if (!m.verts.length) return { 'Bounding Box': createMesh(), Min: [0, 0, 0], Max: [0, 0, 0] };
        const b = boundingBox(m.verts);
        const box = cubeMesh(2);
        box.verts = box.verts.map((v) => v.map((x, k) => (x < 0 ? b.min[k] : b.max[k])));
        return { 'Bounding Box': box, Min: b.min, Max: b.max };
      } },
    CONVEX_HULL: { en: 'Convex Hull', ko: '볼록 껍질', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [G('Geometry')], outputs: [G('Convex Hull')],
      run: (input) => {
        const hull = convexHull((input('Geometry') ?? createMesh()).verts);
        const m = createMesh();
        if (!hull) return { 'Convex Hull': m };
        m.verts = hull.verts.map((v) => [...v]);
        for (const f of hull.faces) addFace(m, [...f.v]);
        return { 'Convex Hull': m };
      } },
    SEPARATE_GEOMETRY: { en: 'Separate Geometry', ko: '지오메트리 분리', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [G('Geometry'), V('Selection', 1)], outputs: [G('Selection'), G('Inverted')],
      run: (input, node, ctx) => {
        const m = input('Geometry') ?? createMesh();
        const keep = selected(input, ctx, m);
        return { Selection: keepFaces(m, keep), Inverted: keepFaces(m, keep.map((x) => !x)) };
      } },
    SCALE_ELEMENTS: { en: 'Scale Elements', ko: '요소 크기 조절', cat: 'Mesh', kinds: ['GEOMETRY'], inputs: [G('Geometry'), V('Scale', 1)], outputs: [G('Geometry')],
      // Each face around its own middle, as separate pieces.
      run: (input) => {
        const m = input('Geometry') ?? createMesh();
        const out = createMesh();
        const s = input('Scale');
        for (const face of m.faces) {
          const c = faceCenter(m, face);
          const base = out.verts.length;
          for (const v of face) out.verts.push(v3.add(c, v3.mul(v3.sub(m.verts[v], c), s)));
          addFace(out, face.map((_, i) => base + i));
        }
        return { Geometry: out };
      } },
    SET_MATERIAL: { en: 'Set Material Index', ko: '재질 번호 설정', cat: 'Geometry', kinds: ['GEOMETRY'], inputs: [G('Geometry'), V('Material Index', 0)], outputs: [G('Geometry')],
      run: (input) => { const m = cloneMesh(input('Geometry') ?? createMesh()); m.faceMat = m.faces.map(() => Math.max(0, input('Material Index') | 0)); return { Geometry: m }; } },
    OBJECT_INFO: { en: 'Object Info', ko: '오브젝트 정보', cat: 'Input', kinds: ['GEOMETRY'], inputs: [], outputs: [G('Geometry'), N('Location'), N('Scale')], props: { object: null },
      run: (input, node, ctx) => {
        const object = ctx.doc?.objects?.find((o) => o.id === node.values?.object);
        if (!object) return { Geometry: createMesh(), Location: [0, 0, 0], Scale: [1, 1, 1] };
        return { Geometry: ctx.meshOf?.(object) ?? object.data ?? createMesh(), Location: object.location ?? [0, 0, 0], Scale: object.scale ?? [1, 1, 1] };
      } },
    COMPARE: { en: 'Compare', ko: '비교', cat: 'Utilities', kinds: ['GEOMETRY'], inputs: [V('A', 0), V('B', 0), V('Epsilon', 0.001)], outputs: [V('Result')], props: { operation: 'GREATER_THAN' }, options: { operation: ['GREATER_THAN', 'LESS_THAN', 'GREATER_EQUAL', 'LESS_EQUAL', 'EQUAL', 'NOT_EQUAL'] },
      run: (input, node) => {
        const [a, b] = [input('A'), input('B')];
        const eq = Math.abs(a - b) <= input('Epsilon');
        const r = { GREATER_THAN: a > b, LESS_THAN: a < b, GREATER_EQUAL: a >= b, LESS_EQUAL: a <= b, EQUAL: eq, NOT_EQUAL: !eq }[node.values?.operation ?? 'GREATER_THAN'];
        return { Result: r ? 1 : 0 };
      } },
    BOOLEAN_MATH: { en: 'Boolean Math', ko: '논리 연산', cat: 'Utilities', kinds: ['GEOMETRY'], inputs: [V('A', 0), V('B', 0)], outputs: [V('Result')], props: { operation: 'AND' }, options: { operation: ['AND', 'OR', 'NOT', 'XOR'] },
      run: (input, node) => {
        const [a, b] = [input('A') > 0.5, input('B') > 0.5];
        const r = { AND: a && b, OR: a || b, NOT: !a, XOR: a !== b }[node.values?.operation ?? 'AND'];
        return { Result: r ? 1 : 0 };
      } },
    SWITCH: { en: 'Switch', ko: '전환', cat: 'Utilities', kinds: ['GEOMETRY'], inputs: [V('Switch', 0), G('False'), G('True')], outputs: [G('Output')], run: (input) => ({ Output: (input('Switch') > 0.5 ? input('True') : input('False')) ?? createMesh() }) },
    STORE_ATTRIBUTE: { en: 'Store Named Attribute', ko: '이름 있는 속성 저장', cat: 'Attribute', kinds: ['GEOMETRY'], inputs: [G('Geometry'), V('Value', 0)], outputs: [G('Geometry')], props: { name: 'attribute' },
      run: (input, node, ctx) => {
        const m = cloneMesh(input('Geometry') ?? createMesh());
        const normals = vertexNormals(m);
        m.attributes = { ...(m.attributes ?? {}), [node.values?.name ?? 'attribute']: m.verts.map((p, i) => input('Value', undefined, { ...ctx, memo: ctx.geometryMemo(), position: p, normal: normals[i], index: i, mesh: m })) };
        return { Geometry: m };
      } },
    NAMED_ATTRIBUTE: { en: 'Named Attribute', ko: '이름 있는 속성', cat: 'Attribute', kinds: ['GEOMETRY'], inputs: [], outputs: [V('Attribute'), V('Exists')], field: true, props: { name: 'attribute' },
      run: (input, node, ctx) => {
        const list = ctx.mesh?.attributes?.[node.values?.name ?? 'attribute'];
        return { Attribute: list?.[ctx.index ?? 0] ?? 0, Exists: list ? 1 : 0 };
      } },
    // ─────────────── zones
    REPEAT_INPUT: { en: 'Repeat Input', ko: '반복 입력', cat: 'Zones', kinds: ['GEOMETRY'], inputs: [V('Iterations', 1), G('Geometry')], outputs: [G('Geometry'), V('Iteration')],
      run: (input, node, ctx) => zoneValues(input, node, ctx) ?? { Geometry: input('Geometry') ?? createMesh(), Iteration: 0 } },
    REPEAT_OUTPUT: { en: 'Repeat Output', ko: '반복 출력', cat: 'Zones', kinds: ['GEOMETRY'], inputs: [G('Geometry')], outputs: [G('Geometry')],
      run: (input, node, ctx, graph) => {
        const start = graph && zoneStart(graph, node, 'REPEAT_INPUT', 'REPEAT_OUTPUT');
        if (!start) return { Geometry: input('Geometry') ?? createMesh() };
        const count = Math.max(0, Math.min(10000, inputOf(graph, start, 'Iterations', ctx) | 0));
        let current = inputOf(graph, start, 'Geometry', ctx) ?? createMesh();
        for (let i = 0; i < count; i++) {
          const round = freshCtx(ctx, { zones: { ...ctx.zones, [start.id]: { Geometry: current, Iteration: i } } });
          current = input('Geometry', undefined, round) ?? current;
        }
        return { Geometry: current };
      } },
    SIM_INPUT: { en: 'Simulation Input', ko: '시뮬레이션 입력', cat: 'Zones', kinds: ['GEOMETRY'], inputs: [G('Geometry')], outputs: [G('Geometry'), V('Delta Time')],
      run: (input, node, ctx) => zoneValues(input, node, ctx) ?? { Geometry: input('Geometry') ?? createMesh(), 'Delta Time': 0 } },
    SIM_OUTPUT: { en: 'Simulation Output', ko: '시뮬레이션 출력', cat: 'Zones', kinds: ['GEOMETRY'], inputs: [G('Geometry')], outputs: [G('Geometry')],
      // Each frame grows from the one before. The first frame is what comes in; going back reads what was kept, and past what was kept it starts over.
      run: (input, node, ctx, graph) => {
        const start = graph && zoneStart(graph, node, 'SIM_INPUT', 'SIM_OUTPUT');
        if (!start) return { Geometry: input('Geometry') ?? createMesh() };
        const first = ctx.doc?.frameStart ?? 1;
        const frame = Math.max(first, Math.round(ctx.frame ?? first));
        const initial = inputOf(graph, start, 'Geometry', ctx) ?? createMesh();
        const stamp = JSON.stringify([graph.links, graph.nodes.map((n) => [n.id, n.type, n.values]), initial.verts.length, initial.verts[0]]);
        let state = simulationCache.get(node);
        if (!state || state.stamp !== stamp) { state = { stamp, frames: new Map() }; simulationCache.set(node, state); }
        state.frames.set(first, initial);
        let from = first;
        for (const f of state.frames.keys()) if (f <= frame && f > from) from = f;
        const dt = 1 / (ctx.doc?.fps || 24);
        let current = state.frames.get(from);
        for (let f = from + 1; f <= frame; f++) {
          const round = freshCtx(ctx, { frame: f, zones: { ...ctx.zones, [start.id]: { Geometry: current, 'Delta Time': dt } } });
          current = input('Geometry', undefined, round) ?? current;
          state.frames.set(f, current);
          if (state.frames.size > KEPT_FRAMES) { const oldest = [...state.frames.keys()].find((x) => x !== first); state.frames.delete(oldest); }
        }
        return { Geometry: current };
      } },
    // ─────────────── compositing
    CMP_ALPHA_OVER: { en: 'Alpha Over', ko: '알파 오버', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [V('Fac', 1), I('Image'), I('Foreground')], outputs: [I('Image')],
      run: (input) => {
        const [bg, fg] = [input('Image') ?? emptyImage(), input('Foreground')];
        if (!fg || fg.data.length !== bg.data.length) return { Image: bg };
        const k = clamp01(input('Fac'));
        const out = new Float32Array(bg.data.length);
        for (let i = 0; i < out.length; i += 4) {
          const a = fg.data[i + 3] * k;
          for (let c = 0; c < 3; c++) out[i + c] = fg.data[i + c] * k + bg.data[i + c] * (1 - a);
          out[i + 3] = a + bg.data[i + 3] * (1 - a);
        }
        return { Image: { width: bg.width, height: bg.height, data: out } };
      } },
    CMP_GAMMA: { en: 'Gamma', ko: '감마', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Gamma', 1)], outputs: [I('Image')], run: (input) => ({ Image: mapImage(input('Image') ?? emptyImage(), (p) => p.map((x) => Math.max(0, x) ** input('Gamma'))) }) },
    CMP_COLOR_BALANCE: { en: 'Color Balance', ko: '색 균형', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [I('Image'), C('Lift', [1, 1, 1]), C('Gamma', [1, 1, 1]), C('Gain', [1, 1, 1])], outputs: [I('Image')],
      run: (input) => {
        const [lift, gamma, gain] = [input('Lift'), input('Gamma'), input('Gain')];
        return { Image: mapImage(input('Image') ?? emptyImage(), (p) => p.map((x, c) => (Math.max(0, (x * (2 - lift[c]) + lift[c] - 1)) ** (1 / Math.max(1e-3, gamma[c]))) * gain[c])) };
      } },
    CMP_TONEMAP: { en: 'Tonemap', ko: '톤 매핑', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Key', 1)], outputs: [I('Image')],
      // Reinhard: x / (1 + x), scaled by a key.
      run: (input) => ({ Image: mapImage(input('Image') ?? emptyImage(), (p) => p.map((x) => { const v = Math.max(0, x) * input('Key'); return v / (1 + v); })) }) },
    CMP_DENOISE: { en: 'Denoise', ko: '디노이즈', cat: 'Filter', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Strength', 0.1)], outputs: [I('Image')],
      // Neighbours that differ little are averaged, edges kept.
      run: (input) => {
        const img = input('Image') ?? emptyImage();
        const { width: w, height: h, data } = img;
        const out = new Float32Array(data.length);
        const s = Math.max(1e-4, input('Strength'));
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const at = (y * w + x) * 4;
          const sum = [0, 0, 0];
          let total = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const [nx, ny] = [x + dx, y + dy];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const o = (ny * w + nx) * 4;
            const d = (data[o] - data[at]) ** 2 + (data[o + 1] - data[at + 1]) ** 2 + (data[o + 2] - data[at + 2]) ** 2;
            const weight = Math.exp(-d / (s * s));
            sum[0] += data[o] * weight; sum[1] += data[o + 1] * weight; sum[2] += data[o + 2] * weight;
            total += weight;
          }
          out[at] = sum[0] / total; out[at + 1] = sum[1] / total; out[at + 2] = sum[2] / total; out[at + 3] = data[at + 3];
        }
        return { Image: { width: w, height: h, data: out } };
      } },
    CMP_SHARPEN: { en: 'Sharpen', ko: '선명하게', cat: 'Filter', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Fac', 1)], outputs: [I('Image')],
      run: (input) => {
        const img = input('Image') ?? emptyImage();
        const soft = blurImage(img, 1);
        const k = input('Fac');
        return { Image: mapImage(img, (p, i) => p.map((x, c) => x + (x - soft.data[i + c]) * k)) };
      } },
    CMP_FLIP: { en: 'Flip', ko: '뒤집기', cat: 'Transform', kinds: ['COMPOSITOR'], inputs: [I('Image')], outputs: [I('Image')], props: { axis: 'X' }, options: { axis: ['X', 'Y', 'XY'] },
      run: (input, node) => {
        const img = input('Image') ?? emptyImage();
        const { width: w, height: h, data } = img;
        const axis = node.values?.axis ?? 'X';
        const out = new Float32Array(data.length);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const [sx, sy] = [axis.includes('X') ? w - 1 - x : x, axis.includes('Y') ? h - 1 - y : y];
          out.set(data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * w + x) * 4);
        }
        return { Image: { width: w, height: h, data: out } };
      } },
    CMP_TRANSFORM: { en: 'Transform', ko: '변환', cat: 'Transform', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('X', 0), V('Y', 0), V('Angle', 0), V('Scale', 1)], outputs: [I('Image')],
      run: (input) => {
        const img = input('Image') ?? emptyImage();
        const { width: w, height: h, data } = img;
        const out = new Float32Array(data.length);
        const [tx, ty, a, s] = [input('X'), input('Y'), input('Angle'), Math.max(1e-4, input('Scale'))];
        const [cos, sin] = [Math.cos(a), Math.sin(a)];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const [dx, dy] = [x - w / 2 - tx, y - h / 2 - ty];
          const sx = Math.round((dx * cos + dy * sin) / s + w / 2);
          const sy = Math.round((-dx * sin + dy * cos) / s + h / 2);
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          out.set(data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * w + x) * 4);
        }
        return { Image: { width: w, height: h, data: out } };
      } },
    CMP_CROP: { en: 'Crop', ko: '자르기', cat: 'Transform', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Left', 0), V('Right', 1), V('Bottom', 0), V('Top', 1)], outputs: [I('Image')],
      // In the image's own shape: what falls outside goes transparent.
      run: (input) => {
        const img = input('Image') ?? emptyImage();
        const { width: w, height: h, data } = img;
        const out = new Float32Array(data.length);
        const [l, r, b, t] = [input('Left') * w, input('Right') * w, input('Bottom') * h, input('Top') * h];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const up = h - 1 - y;
          if (x >= l && x < r && up >= b && up < t) out.set(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (y * w + x) * 4);
        }
        return { Image: { width: w, height: h, data: out } };
      } },
    CMP_LENS_DISTORT: { en: 'Lens Distortion', ko: '렌즈 왜곡', cat: 'Filter', kinds: ['COMPOSITOR'], inputs: [I('Image'), V('Distortion', 0), V('Dispersion', 0)], outputs: [I('Image')],
      run: (input) => {
        const img = input('Image') ?? emptyImage();
        const { width: w, height: h, data } = img;
        const out = new Float32Array(data.length);
        const [k, spread] = [input('Distortion'), input('Dispersion')];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const [u, v] = [(x / w - 0.5) * 2, (y / h - 0.5) * 2];
          const r2 = u * u + v * v;
          for (let c = 0; c < 3; c++) {
            const f = 1 + (k + spread * (c - 1) * 0.5) * r2;
            const [sx, sy] = [Math.round((u * f * 0.5 + 0.5) * w), Math.round((v * f * 0.5 + 0.5) * h)];
            if (sx >= 0 && sy >= 0 && sx < w && sy < h) out[(y * w + x) * 4 + c] = data[(sy * w + sx) * 4 + c];
          }
          out[(y * w + x) * 4 + 3] = data[(y * w + x) * 4 + 3];
        }
        return { Image: { width: w, height: h, data: out } };
      } },
    CMP_DEFOCUS: { en: 'Defocus', ko: '초점 흐림', cat: 'Filter', kinds: ['COMPOSITOR'], inputs: [I('Image'), I('Depth'), V('Focus', 5), V('Range', 5), V('Size', 6)], outputs: [I('Image')],
      // Three blurs mixed by how far each pixel is from the focus.
      run: (input) => {
        const img = input('Image') ?? emptyImage();
        const depth = input('Depth');
        if (!depth || depth.data.length !== img.data.length) return { Image: img };
        const size = Math.max(0, input('Size'));
        const [a, b] = [blurImage(img, size / 2), blurImage(img, size)];
        const [focus, range] = [input('Focus'), Math.max(1e-3, input('Range'))];
        return { Image: mapImage(img, (p, i) => {
          const blur = clamp01(Math.abs(depth.data[i] - focus) / range);
          return p.map((x, c) => (blur < 0.5 ? x + (a.data[i + c] - x) * blur * 2 : a.data[i + c] + (b.data[i + c] - a.data[i + c]) * (blur - 0.5) * 2));
        }) };
      } },
    CMP_Z_COMBINE: { en: 'Z Combine', ko: '깊이 합성', cat: 'Color', kinds: ['COMPOSITOR'], inputs: [I('Image A'), I('Depth A'), I('Image B'), I('Depth B')], outputs: [I('Image')],
      run: (input) => {
        const [a, za, b, zb] = [input('Image A') ?? emptyImage(), input('Depth A'), input('Image B'), input('Depth B')];
        if (!b || !za || !zb || a.data.length !== b.data.length) return { Image: a };
        return { Image: mapImage(a, (p, i) => (zb.data[i] < za.data[i] ? [b.data[i], b.data[i + 1], b.data[i + 2]] : p)) };
      } },
    CMP_SEPARATE: { en: 'Separate RGBA', ko: 'RGBA 분리', cat: 'Converter', kinds: ['COMPOSITOR'], inputs: [I('Image')], outputs: [I('R'), I('G'), I('B'), I('A')],
      run: (input) => {
        const img = input('Image') ?? emptyImage();
        const part = (c) => { const out = new Float32Array(img.data.length); for (let i = 0; i < out.length; i += 4) { out[i] = out[i + 1] = out[i + 2] = img.data[i + c]; out[i + 3] = 1; } return { width: img.width, height: img.height, data: out }; };
        return { R: part(0), G: part(1), B: part(2), A: part(3) };
      } },
    CMP_COMBINE: { en: 'Combine RGBA', ko: 'RGBA 결합', cat: 'Converter', kinds: ['COMPOSITOR'], inputs: [I('R'), I('G'), I('B'), I('A')], outputs: [I('Image')],
      run: (input) => {
        const [r, g, b, a] = [input('R'), input('G'), input('B'), input('A')];
        const first = r ?? g ?? b ?? a;
        if (!first) return { Image: emptyImage() };
        const out = new Float32Array(first.data.length);
        for (let i = 0; i < out.length; i += 4) { out[i] = r?.data[i] ?? 0; out[i + 1] = g?.data[i] ?? 0; out[i + 2] = b?.data[i] ?? 0; out[i + 3] = a?.data[i] ?? 1; }
        return { Image: { width: first.width, height: first.height, data: out } };
      } },
    CMP_SET_ALPHA: { en: 'Set Alpha', ko: '알파 설정', cat: 'Converter', kinds: ['COMPOSITOR'], inputs: [I('Image'), I('Alpha')], outputs: [I('Image')],
      run: (input) => {
        const [img, alpha] = [input('Image') ?? emptyImage(), input('Alpha')];
        const out = img.data.slice();
        if (alpha && alpha.data.length === out.length) for (let i = 0; i < out.length; i += 4) out[i + 3] = alpha.data[i];
        return { Image: { width: img.width, height: img.height, data: out } };
      } },
  };
}
