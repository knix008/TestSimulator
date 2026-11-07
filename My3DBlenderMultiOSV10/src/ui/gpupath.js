// A path tracer on the graphics card: the same scene description and BVH as the CPU one, walked in a fragment shader, with
// samples added up in a floating point texture. Node trees reach it as their value at one point (see FEATURES).
import { buildBVH, buildRenderScene } from '../core/pathtracer.js';
import { evalShader } from '../core/nodes.js';

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const MAX_LIGHTS = 16;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uTris, uNodes, uMats;
uniform sampler2D uAccum;
uniform vec2 uSize;
uniform int uSample, uBounces, uLights;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamForward, uWorld;
uniform float uTan, uOrtho, uAperture, uFocus, uFilmTransparent;
uniform vec4 uLightPos[${MAX_LIGHTS}], uLightDir[${MAX_LIGHTS}], uLightColor[${MAX_LIGHTS}], uLightU[${MAX_LIGHTS}], uLightV[${MAX_LIGHTS}];
out vec4 fragColor;
const float PI = 3.14159265358979;

uint seed;
float rnd() {
  seed = seed * 747796405u + 2891336453u;
  uint w = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
  w = (w >> 22u) ^ w;
  return float(w) / 4294967296.0;
}
ivec2 texel(sampler2D s, int i) { int w = textureSize(s, 0).x; return ivec2(i % w, i / w); }
vec4 fetch(sampler2D s, int i) { return texelFetch(s, texel(s, i), 0); }

struct Hit { float t; int tri; float u; float v; };

bool slab(vec3 lo, vec3 hi, vec3 o, vec3 inv, float tMax) {
  vec3 a = (lo - o) * inv, b = (hi - o) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  float n = max(max(mn.x, mn.y), mn.z), f = min(min(mx.x, mx.y), mx.z);
  return n <= f && f >= 0.0 && n <= tMax;
}

Hit trace(vec3 o, vec3 d, float tMax, bool any) {
  Hit h; h.t = tMax; h.tri = -1; h.u = 0.0; h.v = 0.0;
  vec3 inv = 1.0 / d;
  int stack[48]; int sp = 0; stack[sp++] = 0;
  while (sp > 0) {
    int n = stack[--sp];
    vec4 A = fetch(uNodes, n * 2), B = fetch(uNodes, n * 2 + 1);
    if (!slab(A.xyz, B.xyz, o, inv, h.t)) continue;
    int left = int(A.w), right = int(B.w);
    if (left >= 0) { stack[sp++] = left; stack[sp++] = right; continue; }
    int start = -left - 1, end = right;
    for (int t = start; t < end; t++) {
      vec3 a = fetch(uTris, t * 7).xyz;
      vec3 e1 = fetch(uTris, t * 7 + 1).xyz - a, e2 = fetch(uTris, t * 7 + 2).xyz - a;
      vec3 q = cross(d, e2);
      float det = dot(e1, q);
      if (abs(det) < 1e-12) continue;
      float inv2 = 1.0 / det;
      vec3 s = o - a;
      float u = dot(s, q) * inv2;
      if (u < 0.0 || u > 1.0) continue;
      vec3 r = cross(s, e1);
      float v = dot(d, r) * inv2;
      if (v < 0.0 || u + v > 1.0) continue;
      float dist = dot(e2, r) * inv2;
      if (dist > 1e-4 && dist < h.t) {
        h.t = dist; h.tri = t; h.u = u; h.v = v;
        if (any) return h;
      }
    }
  }
  return h;
}

void basis(vec3 n, out vec3 t, out vec3 b) {
  vec3 r = abs(n.z) < 0.99 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  t = normalize(cross(r, n)); b = cross(n, t);
}
vec3 cosineDir(vec3 n) {
  vec3 t, b; basis(n, t, b);
  float a = 2.0 * PI * rnd(), r2 = rnd(), r = sqrt(r2);
  return normalize(t * r * cos(a) + b * r * sin(a) + n * sqrt(max(0.0, 1.0 - r2)));
}
vec3 ggxHalf(vec3 n, float rough) {
  float a = max(0.001, rough * rough);
  vec3 t, b; basis(n, t, b);
  float phi = 2.0 * PI * rnd(), r2 = rnd();
  float c = sqrt((1.0 - r2) / (1.0 + (a * a - 1.0) * r2));
  float s = sqrt(max(0.0, 1.0 - c * c));
  return normalize(t * s * cos(phi) + b * s * sin(phi) + n * c);
}
float schlick(float c, float f0) { return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }

vec3 direct(vec3 pos, vec3 n, vec3 view, vec3 base, float metal, float rough, float spec, float trans) {
  if (uLights == 0) return vec3(0);
  int i = min(int(rnd() * float(uLights)), uLights - 1);
  vec4 P = uLightPos[i], D = uLightDir[i], C = uLightColor[i];
  int kind = int(P.w);
  vec3 toL; float dist; vec3 radiance;
  if (kind == 1) {
    vec3 j = vec3(0);
    if (C.w > 0.0) j = cosineDir(D.xyz) * C.w;
    toL = normalize(j - D.xyz); dist = 1e6; radiance = C.rgb;
  } else {
    vec3 target = P.xyz;
    if (kind == 3) target += uLightU[i].xyz * (rnd() - 0.5) * uLightU[i].w + uLightV[i].xyz * (rnd() - 0.5) * uLightU[i].w;
    else if (C.w > 0.0) target += normalize(vec3(rnd(), rnd(), rnd()) - 0.5) * C.w * rnd();
    vec3 d = target - pos;
    dist = length(d);
    if (dist < 1e-6) return vec3(0);
    toL = d / dist;
    float k = 1.0 / (4.0 * PI * dist * dist);
    if (kind == 2) {
      float cosA = dot(D.xyz, -toL), outer = cos(D.w), inner = cos(D.w * (1.0 - max(0.001, uLightV[i].w)));
      if (cosA <= outer) return vec3(0);
      k *= min(1.0, (cosA - outer) / max(1e-4, inner - outer));
    } else if (kind == 3) k *= max(0.0, dot(D.xyz, -toL)) * 2.0;
    radiance = C.rgb * k;
  }
  float nl = dot(n, toL);
  if (nl <= 0.0) return vec3(0);
  Hit s = trace(pos + n * 1e-3, toL, dist - 2e-3, true);
  if (s.tri >= 0) return vec3(0);
  vec3 diffuse = base * (1.0 - metal) * (1.0 - trans) / PI;
  vec3 h = normalize(toL + view);
  float nh = max(0.0, dot(n, h)), nv = max(1e-4, dot(n, view)), vh = max(0.0, dot(view, h));
  float a = max(0.001, rough * rough), a2 = a * a, den = nh * nh * (a2 - 1.0) + 1.0;
  float Dd = a2 / (PI * den * den);
  float kk = (rough + 1.0) * (rough + 1.0) / 8.0;
  float G = (nl / (nl * (1.0 - kk) + kk)) * (nv / (nv * (1.0 - kk) + kk));
  vec3 f0 = mix(vec3(0.08 * spec), base, metal);
  vec3 F = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  return (diffuse + Dd * G * F / (4.0 * nl * nv)) * radiance * nl * float(uLights);
}

vec4 path(vec3 ro, vec3 rd) {
  vec3 color = vec3(0), through = vec3(1);
  float alpha = 1.0;
  for (int depth = 0; depth <= uBounces; depth++) {
    Hit h = trace(ro, rd, 1e30, false);
    if (h.tri < 0) {
      if (depth == 0 && uFilmTransparent > 0.5) { alpha = 0.0; break; }
      color += through * uWorld;
      break;
    }
    float w = 1.0 - h.u - h.v;
    vec3 n = normalize(fetch(uTris, h.tri * 7 + 3).xyz * w + fetch(uTris, h.tri * 7 + 4).xyz * h.u + fetch(uTris, h.tri * 7 + 5).xyz * h.v);
    bool entering = dot(n, rd) < 0.0;
    if (!entering) n = -n;
    vec3 pos = ro + rd * h.t;
    int m = int(fetch(uTris, h.tri * 7 + 6).x);
    vec4 M0 = fetch(uMats, m * 3), M1 = fetch(uMats, m * 3 + 1), M2 = fetch(uMats, m * 3 + 2);
    vec3 base = M0.rgb; float metal = M0.a, rough = M1.r, trans = M1.g, ior = M1.b, spec = M1.a;
    float matAlpha = M2.a;
    if (matAlpha < 1.0 && rnd() > matAlpha) { ro = pos + rd * 1e-3; depth--; continue; }
    color += through * M2.rgb;
    if (depth == uBounces) break;
    vec3 view = -rd;
    if (trans > 0.0 && rnd() < trans) {
      float eta = entering ? 1.0 / ior : ior;
      float f0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
      float c = max(0.0, dot(view, n));
      vec3 half_ = rough > 0.01 ? ggxHalf(n, rough) : n;
      vec3 refr = refract(rd, half_, eta);
      if (dot(refr, refr) < 0.5 || rnd() < schlick(c, f0)) {
        rd = normalize(reflect(rd, half_)); ro = pos + n * 1e-3;
      } else {
        rd = normalize(refr); ro = pos - n * 1e-3; through *= base;
      }
      continue;
    }
    color += through * direct(pos, n, view, base, metal, rough, spec, trans);
    float cv = max(0.0, dot(view, n));
    vec3 f0 = mix(vec3(0.08 * spec), base, metal);
    vec3 f = f0 + (1.0 - f0) * pow(1.0 - cv, 5.0);
    float ps = clamp(max(f.r, max(f.g, f.b)) * (metal > 0.5 ? 1.0 : 0.8) + metal * 0.5, 0.05, 0.95);
    if (rnd() < ps) {
      rd = normalize(reflect(rd, ggxHalf(n, rough)));
      if (dot(rd, n) <= 0.0) break;
      through *= f / ps;
    } else {
      rd = cosineDir(n);
      through *= base * (1.0 - metal) / (1.0 - ps);
    }
    ro = pos + n * 1e-3;
    if (depth > 2) {
      float q = min(0.95, max(through.r, max(through.g, through.b)));
      if (rnd() > q) break;
      through /= q;
    }
  }
  return vec4(color, alpha);
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  seed = uint(px.x) * 1973u + uint(px.y) * 9277u + uint(uSample) * 26699u + 1u;
  rnd(); rnd();
  vec2 at = (vec2(px) + vec2(rnd(), rnd())) / uSize;
  float aspect = uSize.x / uSize.y;
  float sx = at.x * 2.0 - 1.0, sy = at.y * 2.0 - 1.0;
  vec3 ro, rd;
  if (uOrtho > 0.0) {
    ro = uCamPos + uCamRight * sx * uOrtho * 0.5 + uCamUp * sy * uOrtho * 0.5 / aspect;
    rd = uCamForward;
  } else {
    ro = uCamPos;
    rd = normalize(uCamForward + uCamRight * sx * uTan + uCamUp * sy * uTan / aspect);
    if (uAperture > 0.0) {
      vec3 focal = uCamPos + rd * uFocus / max(0.01, dot(rd, uCamForward));
      float a = 2.0 * PI * rnd(), r = sqrt(rnd()) * uAperture;
      ro = uCamPos + uCamRight * r * cos(a) + uCamUp * r * sin(a);
      rd = normalize(focal - ro);
    }
  }
  vec4 c = path(ro, rd);
  c.rgb = min(c.rgb, vec3(20.0));
  vec4 prior = texelFetch(uAccum, px, 0);
  fragColor = prior + c;
}`;

const SQUARE = (n) => { const w = Math.max(1, Math.ceil(Math.sqrt(n))); return [w, Math.ceil(n / w) || 1]; };

function dataTexture(gl, values) {
  const pixels = values.length / 4;
  const [w, h] = SQUARE(pixels);
  const data = new Float32Array(w * h * 4);
  data.set(values);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return tex;
}

/** The scene as three floating point textures. Exported for tests of the layout. */
export function packSceneForGPU(scene, images) {
  const bvh = buildBVH(scene.positions);
  // Triangles in BVH order, so a leaf is a range of them: 7 texels each.
  const count = scene.positions.length / 9;
  const tris = new Float32Array(count * 7 * 4);
  for (let i = 0; i < count; i++) {
    const t = bvh.order[i];
    for (let k = 0; k < 3; k++) {
      tris.set(scene.positions.subarray(t * 9 + k * 3, t * 9 + k * 3 + 3), (i * 7 + k) * 4);
      tris.set(scene.normals.subarray(t * 9 + k * 3, t * 9 + k * 3 + 3), (i * 7 + 3 + k) * 4);
    }
    tris[(i * 7 + 6) * 4] = scene.triMat[t];
  }
  // Nodes: two texels. A leaf has a negative `left` holding its first triangle, and `right` its end.
  const nodes = new Float32Array(Math.max(1, bvh.nodes.length) * 8);
  bvh.nodes.forEach((n, i) => {
    nodes.set([n.box[0], n.box[1], n.box[2], n.left >= 0 ? n.left : -n.start - 1, n.box[3], n.box[4], n.box[5], n.left >= 0 ? n.right : n.end], i * 8);
  });
  const mats = new Float32Array(Math.max(1, scene.materials.length) * 12);
  scene.materials.forEach((source, i) => {
    let m = source;
    if (m.nodes) m = evalShader(m.nodes, { uv: [0.5, 0.5], position: [0, 0, 0], normal: [0, 0, 1], images }) ?? m;
    const e = m.emission ?? [0, 0, 0];
    mats.set([m.baseColor[0], m.baseColor[1], m.baseColor[2], m.metallic ?? 0, Math.max(0.001, m.roughness ?? 0.5), m.transmission ?? 0, m.ior ?? 1.45, m.specular ?? 0.5, e[0], e[1], e[2], m.alpha ?? 1], i * 12);
  });
  return { tris, nodes, mats, bvh };
}

/** Whether this browser can do it. */
export function gpuPathAvailable() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  const ok = Boolean(gl && gl.getExtension('EXT_color_buffer_float'));
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return ok;
}

/** Runs a render. `onProgress(fraction, partial)`; returns { promise, cancel }, resolving to { width, height, data } (linear). */
export function renderPathGPU(doc, images, { onProgress } = {}) {
  const scene = buildRenderScene(doc);
  scene.images = images;
  const { width, height, settings } = scene;
  const samples = settings.samples;
  let cancelled = false;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
  const promise = new Promise((resolve, reject) => {
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) { reject(new Error('This graphics card or browser cannot render to floating point textures. Use the CPU engine.')); return; }
    if (scene.volumes?.length) { reject(new Error('GPU Path Tracing does not draw volumes yet. Use the CPU engine for this scene.')); return; }
    if (!scene.positions.length) { resolve({ width, height, data: new Float32Array(width * height * 4).map((_, i) => (i % 4 === 3 ? (settings.filmTransparent ? 0 : 1) : scene.world.color[i % 4] * scene.world.strength)) }); return; }
    const compile = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const u = (name) => gl.getUniformLocation(program, name);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.bindAttribLocation(program, 0, 'p');
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.vertexAttribPointer(gl.getAttribLocation(program, 'p'), 2, gl.FLOAT, false, 0, 0);
    const pack = packSceneForGPU(scene, images);
    const textures = [dataTexture(gl, pack.tris), dataTexture(gl, pack.nodes), dataTexture(gl, pack.mats)];
    const bind = (unit, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u(name), unit); };
    bind(0, textures[0], 'uTris');
    bind(1, textures[1], 'uNodes');
    bind(2, textures[2], 'uMats');
    const cam = scene.camera;
    gl.uniform2f(u('uSize'), width, height);
    gl.uniform1i(u('uBounces'), settings.bounces);
    gl.uniform3fv(u('uCamPos'), cam.position);
    gl.uniform3fv(u('uCamRight'), cam.right);
    gl.uniform3fv(u('uCamUp'), cam.up);
    gl.uniform3fv(u('uCamForward'), cam.forward);
    gl.uniform1f(u('uTan'), cam.tanHalf);
    gl.uniform1f(u('uOrtho'), cam.kind === 'ORTHO' ? cam.orthoScale : 0);
    gl.uniform1f(u('uAperture'), cam.aperture);
    gl.uniform1f(u('uFocus'), cam.focus);
    gl.uniform1f(u('uFilmTransparent'), settings.filmTransparent ? 1 : 0);
    gl.uniform3fv(u('uWorld'), scene.world.color.map((c) => c * scene.world.strength));
    const lights = scene.lights.slice(0, MAX_LIGHTS);
    gl.uniform1i(u('uLights'), lights.length);
    const KIND = { POINT: 0, SUN: 1, SPOT: 2, AREA: 3 };
    lights.forEach((l, i) => {
      gl.uniform4f(u(`uLightPos[${i}]`), l.position[0], l.position[1], l.position[2], KIND[l.kind]);
      gl.uniform4f(u(`uLightDir[${i}]`), l.direction[0], l.direction[1], l.direction[2], l.spot);
      gl.uniform4f(u(`uLightColor[${i}]`), l.color[0] * l.energy, l.color[1] * l.energy, l.color[2] * l.energy, l.radius);
      gl.uniform4f(u(`uLightU[${i}]`), l.u[0], l.u[1], l.u[2], l.size);
      gl.uniform4f(u(`uLightV[${i}]`), l.v[0], l.v[1], l.v[2], l.blend);
    });
    // Two targets to add up in, swapped after each sample. Unit 4 is free: making them must not disturb the bound scene textures.
    gl.activeTexture(gl.TEXTURE4);
    const target = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fb };
    };
    let [a, b] = [target(), target()];
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    let sample = 0;
    const read = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
      const raw = new Float32Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, raw);
      // The texture's first row is the image's last; the sum becomes an average.
      const data = new Float32Array(raw.length);
      const scale = 1 / Math.max(1, sample);
      for (let y = 0; y < height; y++) {
        const [from, to] = [(height - 1 - y) * width * 4, y * width * 4];
        for (let x = 0; x < width * 4; x++) data[to + x] = raw[from + x] * scale;
      }
      return { width, height, data };
    };
    const finish = (value) => {
      for (const t of [...textures, a.tex, b.tex]) gl.deleteTexture(t);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      resolve(value);
    };
    const step = () => {
      if (cancelled) { reject(Object.assign(new Error('Cancelled'), { cancelled: true })); return; }
      // One sample at a time keeps the graphics card able to draw the rest of the screen.
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(u('uAccum'), 3);
      gl.uniform1i(u('uSample'), sample);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
      [a, b] = [b, a];
      sample++;
      onProgress?.(sample / samples, null);
      if (sample >= samples) { finish(read()); return; }
      setTimeout(step, 0);
    };
    step();
  });
  return { promise, cancel: () => { cancelled = true; } };
}
