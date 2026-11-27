// GLSL ES 3.00 of the path tracer (WebGL2): the tracing pass, the display pass (tone mapping, background,
// shadow-catcher compositing) and the edge-avoiding à-trous denoiser. The formulas match sampling.js.
//
// Tracing pass: one camera path per pixel and pass (unbiased Monte Carlo): next-event estimation of the
// environment (importance sampled from its luminance) and of one analytic light per vertex, the BSDF's own
// sample with multiple importance sampling (power heuristic), Russian roulette. Outputs (added up with
// blending, or by the shader itself in ping-pong mode):
//   0: radiance rgb, coverage (premultiplied)   1: first-hit albedo rgb, sample count   2: first-hit normal, depth
//   3: moments of the demodulated luminance (l, l²) — the denoiser's variance

export const QUAD_VERT = `in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMMON = `precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp sampler3D;
#define PI 3.14159265358979
#define TWO_PI 6.28318530717959
#define INV_PI 0.318309886183791
#define TEXW_MASK (TEXW - 1)
ivec2 tx(int i) { return ivec2(i & TEXW_MASK, i >> TEXSHIFT); }
`;

export const TRACE_FRAG = `${COMMON}
#define MAXL 16
// Feature switches (pathtracer.js compiles only what the scene uses; each variant is compiled once, in parallel):
//   HAS_TEX textures · HAS_IMAGE picture textures · HAS_UV B-rep texture coordinates · HAS_VCOLOR vertex colours
//   HAS_TRANS transmission · HAS_COAT clear coat · HAS_LIGHTS analytic lights · HAS_AREA area / sphere lights
//   HAS_CATCHER shadow catcher · HAS_FLOOR a ground that scatters light (floor, differential catcher)
uniform sampler2D uTri;      // 3 texels a triangle: v0 + body, v1, v2
uniform sampler2D uNrm;      // 3 texels a triangle: vertex normals, w: vertex colour (sRGB 8-bit packed, −1 none)
uniform sampler2D uUv;       // 2 texels a triangle: (u0, v0, u1, v1), (u2, v2, has UV, 0) in mm
uniform sampler2D uNodes;    // 2 texels a node (bvh.js layout)
uniform sampler2D uMats;     // 5 texels a material (appearance.js layout)
uniform sampler2D uEnv;      // equirect radiance (Z up), float: importance sampling
uniform sampler2D uEnvLin;   // the same, half float with mipmaps: filtered lookups
uniform sampler2D uEnvMarg;  // marginal CDF, (h + 1) x 1
uniform sampler2D uEnvCond;  // conditional CDFs, (w + 1) x h
uniform sampler2DArray uImages;
uniform sampler3D uNoise;     // 32³ random values, trilinear, repeating: value noise in one fetch
#ifdef PINGPONG
uniform sampler2D uPrev0; uniform sampler2D uPrev1; uniform sampler2D uPrev2; uniform sampler2D uPrev3;
uniform vec4 uTile;
#endif
uniform ivec2 uEnvSize; uniform float uEnvTotal; uniform float uEnvIntensity; uniform float uEnvRot; uniform float uEnvMaxLod;
uniform vec2 uRes; uniform int uFrame; uniform int uSeed; uniform int uHasTris;
uniform vec3 uCamPos; uniform vec3 uCamRight; uniform vec3 uCamUp; uniform vec3 uCamFwd;
uniform int uOrtho; uniform float uTanHalf; uniform float uHalfH; uniform float uAspect; uniform float uLensR; uniform float uFocus;
uniform float uPixAngle; uniform float uPixWidth;
uniform int uBounces; uniform int uGround; uniform float uGroundZ; uniform int uFloorMat; uniform int uCatcherMode;
uniform float uCatcherRefl; uniform float uCatcherRough; uniform vec3 uCatcherU;
uniform int uBackground; uniform float uEps; uniform float uClamp; uniform int uCaustics;
uniform int uLightCount; uniform vec4 uLA[MAXL]; uniform vec4 uLB[MAXL]; uniform vec4 uLC[MAXL]; uniform vec4 uLD[MAXL];
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oAlbedo;
layout(location = 2) out vec4 oNormal;
layout(location = 3) out vec4 oMoments;

#ifdef HAS_LIGHTS
int lightCount() { return uLightCount; }
#else
int lightCount() { return 0; }
#endif

// ───────── random numbers
uint seed;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd() { seed = pcg(seed); return float(seed) * (1.0 / 4294967296.0); }
vec2 rnd2() { return vec2(rnd(), rnd()); }

// ───────── geometry helpers
void onb(vec3 n, out vec3 t, out vec3 b) {
  float s = n.z >= 0.0 ? 1.0 : -1.0; float a = -1.0 / (s + n.z); float c = n.x * n.y * a;
  t = vec3(1.0 + s * n.x * n.x * a, s * c, -s * n.x); b = vec3(c, s + n.y * n.y * a, -n.y);
}
vec3 toWorld(vec3 v, vec3 n) { vec3 t, b; onb(n, t, b); return t * v.x + b * v.y + n * v.z; }
vec3 toLocal(vec3 v, vec3 n) { vec3 t, b; onb(n, t, b); return vec3(dot(v, t), dot(v, b), dot(v, n)); }
vec3 cosineHemi(vec2 u) { float r = sqrt(u.x); float p = TWO_PI * u.y; return vec3(r * cos(p), r * sin(p), sqrt(max(0.0, 1.0 - u.x))); }
vec2 concentric(vec2 u) {
  vec2 o = 2.0 * u - 1.0;
  if (o.x == 0.0 && o.y == 0.0) return vec2(0.0);
  float r; float th;
  if (abs(o.x) > abs(o.y)) { r = o.x; th = (PI / 4.0) * (o.y / o.x); } else { r = o.y; th = PI / 2.0 - (PI / 4.0) * (o.x / o.y); }
  return r * vec2(cos(th), sin(th));
}
vec3 sampleCone(vec2 u, float cosMax) { float c = 1.0 - u.x * (1.0 - cosMax); float s = sqrt(max(0.0, 1.0 - c * c)); float p = TWO_PI * u.y; return vec3(s * cos(p), s * sin(p), c); }
float powerH(float a, float b) { float a2 = a * a; float s = a2 + b * b; return s > 0.0 ? a2 / s : 0.0; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// ───────── microfacets and Fresnel
float ggxD(float nh, float a) { if (nh <= 0.0) return 0.0; float a2 = a * a; float d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float ggxLambda(float nx, float a) { float c2 = max(1e-12, nx * nx); return (-1.0 + sqrt(1.0 + a * a * (1.0 - c2) / c2)) * 0.5; }
float ggxG1(float nx, float a) { return 1.0 / (1.0 + ggxLambda(nx, a)); }
float ggxG2(float nv, float nl, float a) { return 1.0 / (1.0 + ggxLambda(nv, a) + ggxLambda(nl, a)); }
vec3 sampleVndf(vec3 v, float a, vec2 u) {
  vec3 vh = normalize(vec3(a * v.x, a * v.y, v.z));
  float l2 = vh.x * vh.x + vh.y * vh.y;
  vec3 t1 = l2 > 0.0 ? vec3(-vh.y, vh.x, 0.0) * inversesqrt(l2) : vec3(1.0, 0.0, 0.0);
  vec3 t2 = cross(vh, t1);
  float r = sqrt(u.x); float phi = TWO_PI * u.y;
  float p1 = r * cos(phi); float p2 = r * sin(phi);
  float s = 0.5 * (1.0 + vh.z);
  p2 = (1.0 - s) * sqrt(max(0.0, 1.0 - p1 * p1)) + s * p2;
  vec3 nh = p1 * t1 + p2 * t2 + sqrt(max(0.0, 1.0 - p1 * p1 - p2 * p2)) * vh;
  return normalize(vec3(a * nh.x, a * nh.y, max(0.0, nh.z)));
}
float vndfPdf(vec3 v, vec3 h, float a) { return ggxG1(v.z, a) * max(0.0, dot(v, h)) * ggxD(h.z, a) / max(1e-12, v.z); }
float schlick1(float f0, float c) { float m = pow(1.0 - clamp(c, 0.0, 1.0), 5.0); return f0 + (1.0 - f0) * m; }
vec3 schlick3(vec3 f0, float c) { float m = pow(1.0 - clamp(c, 0.0, 1.0), 5.0); return f0 + (1.0 - f0) * m; }
float fresnelD(float cosI, float eta) {
  float ci = min(1.0, abs(cosI));
  float st2 = eta * eta * (1.0 - ci * ci);
  if (st2 >= 1.0) return 1.0;
  float ct = sqrt(1.0 - st2);
  float rs = (eta * ci - ct) / (eta * ci + ct); float rp = (ci - eta * ct) / (ci + eta * ct);
  return 0.5 * (rs * rs + rp * rp);
}

// ───────── materials and textures
struct Mat { vec3 color; float metal; float rough; float trans; float ior; float spec; vec3 emit; float coat; int tex; float texScale; float coatRough; float absorb; int layer; int mapping; };

Mat fetchMat(int i) {
  int o = i * 5;
  vec4 a = texelFetch(uMats, tx(o), 0); vec4 b = texelFetch(uMats, tx(o + 1), 0); vec4 c = texelFetch(uMats, tx(o + 2), 0);
  vec4 d = texelFetch(uMats, tx(o + 3), 0); vec4 e = texelFetch(uMats, tx(o + 4), 0);
  Mat m;
  m.color = a.rgb; m.metal = a.a; m.rough = b.x; m.trans = b.y; m.ior = max(1.0001, b.z); m.spec = b.w;
  m.emit = c.rgb; m.coat = c.a; m.tex = int(d.x + 0.5); m.texScale = max(1e-3, d.y); m.coatRough = d.z; m.absorb = d.w; m.layer = int(floor(e.x + 0.5)); m.mapping = int(e.y + 0.5);
#ifndef HAS_TRANS
  m.trans = 0.0;
#endif
#ifndef HAS_COAT
  m.coat = 0.0;
#endif
#ifndef HAS_TEX
  m.tex = 0;
#endif
  return m;
}

#ifdef HAS_TEX
float vnoise(vec3 p) { return textureLod(uNoise, p * (1.0 / 32.0), 0.0).r; }
float fbm(vec3 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 17.0) + 0.125 * vnoise(p * 4.1 + 5.0) + 0.0625 * vnoise(p * 8.3 + 11.0); }

// Textures in millimetres (p / scale): wood and cast are solid; the flat patterns and pictures use the face's
// B-rep UVs when the appearance maps by UV and the triangle has them, else the solid position / three sides.
// coneW: the width of the ray's footprint (mm) — picks the picture's mip level.
void applyTexture(inout Mat m, vec3 p, vec3 n, vec2 uv, bool hasUv, float coneW) {
  if (m.tex == 0) return;
  bool byUv = m.mapping == 1 && hasUv;
  vec3 q = byUv ? vec3(uv, 0.0) / m.texScale : p / m.texScale;
  if (m.tex == 1) { // wood: rings around the X axis, wobbling, with fine grain
    float r = length(q.yz) * 0.35 + fbm(q * vec3(0.05, 0.6, 0.6)) * 2.2;
    float ring = fract(r); float band = smoothstep(0.0, 0.25, ring) * (1.0 - smoothstep(0.55, 1.0, ring));
    float grain = vnoise(q * vec3(0.4, 18.0, 18.0));
    m.color *= mix(0.55, 1.05, band) * mix(0.9, 1.05, grain);
    m.rough = clamp(m.rough + (band - 0.5) * 0.12, 0.05, 1.0);
  } else if (m.tex == 2) { // brushed: streaks along X (along u)
    float s = fbm(vec3(q.x * 0.04, q.y * 9.0, q.z * 9.0));
    m.rough = clamp(m.rough * mix(0.6, 1.5, s), 0.02, 1.0);
    m.color *= mix(0.9, 1.06, s);
  } else if (m.tex == 3) { // checker of 10 mm squares
    vec3 c = floor(q * 0.1);
    float k = mod(c.x + c.y + c.z, 2.0);
    m.color = mix(m.color, m.color * 0.18, k);
  } else if (m.tex == 4) { // knurl: diamond grooves
    float a = abs(sin((q.x + q.y + q.z) * 1.6)); float b = abs(sin((q.x - q.y + q.z) * 1.6));
    float g = smoothstep(0.0, 0.35, min(a, b));
    m.color *= mix(0.35, 1.0, g);
    m.rough = clamp(mix(0.75, m.rough, g), 0.02, 1.0);
  } else if (m.tex == 5) { // carbon fibre: 2 × 2 twill of 2 mm tows
    vec3 c = floor(q * 0.5);
    vec3 f = fract(q * 0.5);
    float w = mod(c.x + c.y + c.z, 2.0);
    float tow = w > 0.5 ? sin(f.x * PI) : sin(f.y * PI);
    m.color *= mix(0.45, 1.6, tow * tow);
    m.rough = clamp(m.rough * mix(1.4, 0.7, tow), 0.02, 1.0);
  } else if (m.tex == 6) { // cast: fine speckles and rough patches
    float s = vnoise(q * 1.8); float s2 = fbm(q * 0.15);
    m.color *= mix(0.78, 1.08, s) * mix(0.9, 1.04, s2);
    m.rough = clamp(m.rough + (s - 0.5) * 0.25, 0.05, 1.0);
  }
#ifdef HAS_IMAGE
  else if (m.tex == 7 && m.layer >= 0) { // a picture 100 mm × scale wide, by UV or from three sides
    float lod = log2(max(1e-6, coneW) / (100.0 * m.texScale / 512.0));
    vec2 s = vec2(0.01);
    if (byUv) {
      m.color *= textureLod(uImages, vec3(q.xy * s, float(m.layer)), lod).rgb;
    } else {
      vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
      vec3 cx = textureLod(uImages, vec3(q.yz * s, float(m.layer)), lod).rgb;
      vec3 cy = textureLod(uImages, vec3(q.xz * s, float(m.layer)), lod).rgb;
      vec3 cz = textureLod(uImages, vec3(q.xy * s, float(m.layer)), lod).rgb;
      m.color *= cx * w.x + cy * w.y + cz * w.z;
    }
  }
#endif
}
#endif

// ───────── tracing
struct Hit { float t; int tri; vec2 bc; };

bool hitTri(int tri, vec3 ro, vec3 rd, float tmax, out float t, out vec2 bc) {
  vec3 a = texelFetch(uTri, tx(tri * 3), 0).xyz; vec3 b = texelFetch(uTri, tx(tri * 3 + 1), 0).xyz; vec3 c = texelFetch(uTri, tx(tri * 3 + 2), 0).xyz;
  vec3 e1 = b - a; vec3 e2 = c - a;
  vec3 p = cross(rd, e2); float det = dot(e1, p);
  if (abs(det) < 1e-20) return false;
  float inv = 1.0 / det; vec3 s = ro - a;
  float u = dot(s, p) * inv; if (u < 0.0 || u > 1.0) return false;
  vec3 q = cross(s, e1); float v = dot(rd, q) * inv; if (v < 0.0 || u + v > 1.0) return false;
  t = dot(e2, q) * inv;
  bc = vec2(u, v);
  return t > 0.0 && t < tmax;
}

// The closest triangle before tmax (any one when anyHit).
bool traceBvh(vec3 ro, vec3 rd, float tmax, bool anyHit, out Hit h) {
  h.t = tmax; h.tri = -1; h.bc = vec2(0.0);
  if (uHasTris == 0) return false;
  vec3 d = vec3(abs(rd.x) < 1e-12 ? 1e-12 : rd.x, abs(rd.y) < 1e-12 ? 1e-12 : rd.y, abs(rd.z) < 1e-12 ? 1e-12 : rd.z);
  vec3 inv = 1.0 / d;
  int stack[64]; int sp = 0; stack[sp++] = 0;
  while (sp > 0) {
    int node = stack[--sp];
    vec4 a = texelFetch(uNodes, tx(node * 2), 0); vec4 b = texelFetch(uNodes, tx(node * 2 + 1), 0);
    vec3 t0 = (a.xyz - ro) * inv; vec3 t1 = (b.xyz - ro) * inv;
    vec3 lo = min(t0, t1); vec3 hi = max(t0, t1);
    float tn = max(max(lo.x, lo.y), max(lo.z, 0.0)); float tf = min(min(hi.x, hi.y), min(hi.z, h.t));
    if (tn > tf) continue;
    if (b.w > 0.0) {
      int first = int(a.w + 0.5); int last = first + int(b.w + 0.5);
      for (int i = first; i < last; i++) {
        float t; vec2 bc;
        if (hitTri(i, ro, rd, h.t, t, bc)) { h.t = t; h.tri = i; h.bc = bc; if (anyHit) return true; }
      }
    } else if (sp < 62) {
      int axis = int(-b.w + 0.5) - 1; int right = int(a.w + 0.5);
      float da = axis == 0 ? rd.x : (axis == 1 ? rd.y : rd.z);
      if (da < 0.0) { stack[sp++] = node + 1; stack[sp++] = right; } else { stack[sp++] = right; stack[sp++] = node + 1; }
    }
  }
  return h.tri >= 0;
}

// ───────── environment
vec2 dirToUv(vec3 d) { float u = (atan(d.y, d.x) - uEnvRot) / TWO_PI + 0.5; u -= floor(u); return vec2(u, acos(clamp(d.z, -1.0, 1.0)) / PI); }
vec3 uvToDir(vec2 uv) { float phi = (uv.x - 0.5) * TWO_PI + uEnvRot; float th = uv.y * PI; float s = sin(th); return vec3(s * cos(phi), s * sin(phi), cos(th)); }
vec3 envTexel(ivec2 p) { return texelFetch(uEnv, p, 0).rgb; }
// Filtered radiance (bilinear, mip level from the ray cone's spread: radians a texel covers).
vec3 envAt(vec3 d, float spread) {
  float lod = clamp(log2(max(1e-8, spread) * float(uEnvSize.x) / TWO_PI), 0.0, uEnvMaxLod);
  return textureLod(uEnvLin, dirToUv(d), lod).rgb * uEnvIntensity;
}
float envPdf(vec3 d) {
  vec2 uv = dirToUv(d);
  ivec2 p = ivec2(min(vec2(uEnvSize) - 1.0, floor(uv * vec2(uEnvSize))));
  float s = sin(PI * (float(p.y) + 0.5) / float(uEnvSize.y));
  float l = max(1e-6, lum(envTexel(p)));
  return l * s * float(uEnvSize.x * uEnvSize.y) / (uEnvTotal * 2.0 * PI * PI * max(1e-6, sin(uv.y * PI)));
}
int searchMarg(float u) {
  int lo = 0; int hi = uEnvSize.y;
  while (lo + 1 < hi) { int mid = (lo + hi) >> 1; if (texelFetch(uEnvMarg, ivec2(mid, 0), 0).r <= u) lo = mid; else hi = mid; }
  return lo;
}
int searchCond(int row, float u) {
  int lo = 0; int hi = uEnvSize.x;
  while (lo + 1 < hi) { int mid = (lo + hi) >> 1; if (texelFetch(uEnvCond, ivec2(mid, row), 0).r <= u) lo = mid; else hi = mid; }
  return lo;
}
vec3 sampleEnvDir(vec2 u, out float pdf) {
  int y = searchMarg(u.x); int x = searchCond(y, u.y);
  vec2 uv = (vec2(float(x), float(y)) + rnd2()) / vec2(uEnvSize);
  vec3 d = uvToDir(uv);
  pdf = envPdf(d);
  return d;
}

// ───────── lights
// A: type, xyz (directional: toward the light; point / spot: centre; area: corner)
// B: rgb (directional: irradiance; point / spot: intensity; area: radiance), w (directional: cos of the angular
//    radius; point / spot: the emitter's radius, 0 = a point)
// C: spot: direction it shines, cos outer;   area: edge U       D: spot: cos inner;   area: edge V
float spotFall(int i, vec3 toP) {
  float c = dot(normalize(toP), uLC[i].xyz);
  return smoothstep(uLC[i].w, uLD[i].x, c);
}

// Light i seen from p: direction, distance, radiance × 1/pdf (solid angle), pdf (0 = delta).
bool sampleLight(int i, vec3 p, out vec3 wi, out float dist, out vec3 li, out float pdf) {
  wi = vec3(0.0, 0.0, 1.0); dist = 0.0; li = vec3(0.0); pdf = 0.0;
  int type = int(uLA[i].x + 0.5);
  if (type == 0) {
    vec3 dir = uLA[i].yzw; float cosMax = uLB[i].w;
    dist = 1e30;
    if (cosMax >= 0.9999999) { wi = dir; li = uLB[i].rgb; pdf = 0.0; return true; }
    vec3 l = sampleCone(rnd2(), cosMax);
    wi = toWorld(l, dir);
    pdf = 1.0 / (TWO_PI * (1.0 - cosMax));
    li = uLB[i].rgb / (PI * (1.0 - cosMax * cosMax)) / pdf; // radiance of the disc / pdf
    return true;
  }
  if (type == 1 || type == 2) {
    vec3 d = uLA[i].yzw - p; float dc = length(d); float r = uLB[i].w;
    if (r > 0.0 && dc > r * 1.001) {
      // A sphere: directions of its visible cap, uniformly; radiance = intensity / (π r²).
      float sinMax = r / dc; float cosMax = sqrt(max(0.0, 1.0 - sinMax * sinMax));
      wi = toWorld(sampleCone(rnd2(), cosMax), d / dc);
      float b = dot(wi, d); dist = b - sqrt(max(0.0, b * b - (dc * dc - r * r)));
      pdf = 1.0 / (TWO_PI * (1.0 - cosMax));
      li = uLB[i].rgb / (PI * r * r) / pdf;
      if (type == 2) li *= spotFall(i, -d);
      return true;
    }
    dist = dc; wi = d / dc;
    li = uLB[i].rgb / (dc * dc);
    if (type == 2) li *= spotFall(i, -d);
    pdf = 0.0;
    return dc > 0.0;
  }
  // area: a uniform point of the rectangle
  vec3 eu = uLC[i].xyz; vec3 ev = uLD[i].xyz; vec3 ln = normalize(cross(eu, ev));
  vec2 u = rnd2();
  vec3 q = uLA[i].yzw + eu * u.x + ev * u.y;
  vec3 d = q - p; dist = length(d); wi = d / dist;
  float cl = -dot(wi, ln);
  if (cl <= 0.0) return false;
  float area = length(cross(eu, ev));
  pdf = dist * dist / (cl * area);
  li = uLB[i].rgb / pdf;
  return true;
}

#ifdef HAS_AREA
// The nearest area or sphere light along a ray before tmax: its radiance and its solid-angle pdf at the origin.
bool hitAreaLights(vec3 ro, vec3 rd, float tmax, out vec3 le, out float pdf, out float tl) {
  bool found = false; tl = tmax; le = vec3(0.0); pdf = 0.0;
  for (int i = 0; i < lightCount(); i++) {
    int type = int(uLA[i].x + 0.5);
    if (type == 3) {
      vec3 eu = uLC[i].xyz; vec3 ev = uLD[i].xyz; vec3 n = cross(eu, ev); float area = length(n); n /= area;
      float dn = dot(rd, n);
      if (dn >= 0.0) continue; // one-sided, facing the scene
      float t = dot(uLA[i].yzw - ro, n) / dn;
      if (t <= 0.0 || t >= tl) continue;
      vec3 q = ro + rd * t - uLA[i].yzw;
      float a = dot(q, eu) / dot(eu, eu); float b = dot(q, ev) / dot(ev, ev);
      if (a < 0.0 || a > 1.0 || b < 0.0 || b > 1.0) continue;
      tl = t; le = uLB[i].rgb; pdf = t * t / (-dn * area); found = true;
    } else if ((type == 1 || type == 2) && uLB[i].w > 0.0) {
      float r = uLB[i].w; vec3 oc = ro - uLA[i].yzw;
      float b = dot(oc, rd); float c = dot(oc, oc) - r * r; float disc = b * b - c;
      if (c <= 0.0 || disc <= 0.0) continue;
      float t = -b - sqrt(disc);
      if (t <= 0.0 || t >= tl) continue;
      float dc = length(oc); float sinMax = r / dc; float cosMax = sqrt(max(0.0, 1.0 - sinMax * sinMax));
      tl = t; le = uLB[i].rgb / (PI * r * r) * (type == 2 ? spotFall(i, oc) : 1.0); pdf = 1.0 / (TWO_PI * (1.0 - cosMax)); found = true;
    }
  }
  return found;
}
#endif

// Unoccluded irradiance at a point of the ground (normal +Z) from the local lights (the catcher's reference).
vec3 localIrradianceUp(vec3 p) {
  vec3 e = vec3(0.0);
  for (int i = 0; i < lightCount(); i++) {
    int type = int(uLA[i].x + 0.5);
    if (type == 1 || type == 2) {
      vec3 d = uLA[i].yzw - p; float r = length(d); float c = d.z / r;
      if (c > 0.0) e += uLB[i].rgb * c / (r * r) * (type == 2 ? spotFall(i, -d) : 1.0);
    } else if (type == 3) {
      vec3 eu = uLC[i].xyz; vec3 ev = uLD[i].xyz; vec3 n = normalize(cross(eu, ev));
      vec3 q = uLA[i].yzw + 0.5 * (eu + ev); vec3 d = q - p; float r = length(d); vec3 w = d / r;
      float cl = -dot(w, n); float cp = w.z;
      if (cl > 0.0 && cp > 0.0) e += uLB[i].rgb * length(cross(eu, ev)) * cl * cp / (r * r);
    }
  }
  return e;
}

// ───────── surfaces
struct Surf { vec3 p; vec3 n; vec3 ng; int mat; bool front; vec3 vcol; bool hasVcol; vec2 uv; bool hasUv; };

vec3 unpackColour(float w) {
  float x = floor(w + 0.5);
  vec3 c = vec3(floor(x / 65536.0), mod(floor(x / 256.0), 256.0), mod(x, 256.0)) / 255.0;
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void surfaceOf(Hit h, vec3 ro, vec3 rd, out Surf s) {
  vec4 a = texelFetch(uTri, tx(h.tri * 3), 0); vec3 b = texelFetch(uTri, tx(h.tri * 3 + 1), 0).xyz; vec3 c = texelFetch(uTri, tx(h.tri * 3 + 2), 0).xyz;
  vec3 ng = normalize(cross(b - a.xyz, c - a.xyz));
  vec4 n0 = texelFetch(uNrm, tx(h.tri * 3), 0); vec4 n1 = texelFetch(uNrm, tx(h.tri * 3 + 1), 0); vec4 n2 = texelFetch(uNrm, tx(h.tri * 3 + 2), 0);
  float w0 = 1.0 - h.bc.x - h.bc.y;
  vec3 n = n0.xyz * w0 + n1.xyz * h.bc.x + n2.xyz * h.bc.y;
  n = dot(n, n) > 1e-12 ? normalize(n) : ng;
  s.hasVcol = false; s.vcol = vec3(1.0);
#ifdef HAS_VCOLOR
  if (n0.w >= 0.0 && n1.w >= 0.0 && n2.w >= 0.0) { s.hasVcol = true; s.vcol = unpackColour(n0.w) * w0 + unpackColour(n1.w) * h.bc.x + unpackColour(n2.w) * h.bc.y; }
#endif
  s.hasUv = false; s.uv = vec2(0.0);
#ifdef HAS_UV
  vec4 ua = texelFetch(uUv, tx(h.tri * 2), 0); vec4 ub = texelFetch(uUv, tx(h.tri * 2 + 1), 0);
  if (ub.z > 0.5) { s.hasUv = true; s.uv = ua.xy * w0 + ua.zw * h.bc.x + ub.xy * h.bc.y; }
#endif
  if (dot(n, ng) < 0.0) ng = -ng; // the geometric normal on the shading normal's side
  s.p = ro + rd * h.t; s.mat = int(a.w + 0.5);
  s.front = dot(ng, rd) < 0.0;
  if (!s.front) { n = -n; ng = -ng; }
  // A shading normal facing away from the viewer: fall back to the geometric one.
  if (dot(n, -rd) <= 0.0) n = ng;
  s.n = n; s.ng = ng;
}

// Lobe probabilities: diffuse, specular, coat, transmission (sum 1).
vec4 lobeProbs(Mat m, float nv, float eta) {
  float fd = fresnelD(nv, eta) * (m.trans > 0.0 ? 1.0 : m.spec);
  float fm = schlick1(max(m.color.r, max(m.color.g, m.color.b)), nv);
  float sp = clamp((1.0 - m.metal) * fd + m.metal * fm, 0.05, 1.0);
  float di = (1.0 - m.metal) * (1.0 - m.trans) * (1.0 - fd);
  float tr = (1.0 - m.metal) * m.trans * (1.0 - fd);
  float co = m.coat * 0.25;
  float sum = di + sp + co + tr;
  return vec4(di, sp, co, tr) / max(sum, 1e-6);
}

bool isSmooth(Mat m) { return m.rough < 0.02; }

// f(v, l)·|n·l| of the non-delta lobes, and their pdf.
vec3 evalBsdf(Mat m, vec3 V, vec3 L, vec3 N, bool front, out float pdf) {
  pdf = 0.0;
  float nv = dot(N, V); float nl = dot(N, L);
  if (nv <= 0.0) return vec3(0.0);
  float n1 = front ? 1.0 : m.ior; float n2 = front ? m.ior : 1.0;
  vec4 p = lobeProbs(m, nv, n1 / n2);
  float a = max(1e-3, m.rough * m.rough);
  bool smoothSurf = isSmooth(m);
  float coatF = schlick1(0.04, nv) * m.coat;
  vec3 f = vec3(0.0);
  if (nl > 0.0) {
    vec3 H = normalize(V + L);
    float vh = dot(V, H); float nh = dot(N, H);
    if (!smoothSurf) {
      float D = ggxD(nh, a); float G = ggxG2(nv, nl, a);
      float fd = fresnelD(vh, n1 / n2) * (m.trans > 0.0 ? 1.0 : m.spec);
      vec3 F = (1.0 - m.metal) * vec3(fd) + m.metal * schlick3(m.color, vh);
      f += (1.0 - coatF) * F * (D * G / (4.0 * nv * nl)) * nl;
      pdf += p.y * ggxG1(nv, a) * D / (4.0 * nv);
    }
    float diff = (1.0 - m.metal) * (1.0 - m.trans) * (1.0 - fresnelD(nv, n1 / n2) * m.spec);
    f += (1.0 - coatF) * diff * m.color * INV_PI * nl;
    pdf += p.x * nl * INV_PI;
#ifdef HAS_COAT
    if (m.coat > 0.0) {
      float ac = max(1e-3, m.coatRough * m.coatRough);
      float Dc = ggxD(nh, ac);
      f += vec3(Dc * ggxG2(nv, nl, ac) * schlick1(0.04, vh) * m.coat / (4.0 * nv * nl) * nl);
      pdf += p.z * ggxG1(nv, ac) * Dc / (4.0 * nv);
    }
#endif
  }
#ifdef HAS_TRANS
  else if (nl < 0.0 && m.trans > 0.0 && !smoothSurf) {
    vec3 H = normalize(V * n1 + L * n2);
    if (dot(H, N) < 0.0) H = -H;
    float vh = dot(V, H); float lh = dot(L, H);
    if (vh > 0.0 && lh < 0.0) {
      float F = fresnelD(vh, n1 / n2);
      float dn = n2 * lh + n1 * vh; dn *= dn;
      float nh = dot(N, H);
      float D = ggxD(nh, a); float G = ggxG2(nv, -nl, a);
      float ft = abs(vh * lh) * n1 * n1 * (1.0 - F) * D * G / (nv * (-nl) * dn) * (1.0 - m.metal) * m.trans * (1.0 - coatF);
      f += (m.absorb > 0.0 ? vec3(1.0) : m.color) * ft * (-nl);
      pdf += p.w * vndfPdf(toLocal(V, N), toLocal(H, N), a) * n2 * n2 * (-lh) / dn;
    }
  }
#endif
  return f;
}

// Samples the BSDF: direction, weight = f·|cos|/pdf, pdf (0 for a delta lobe), whether it went through.
bool sampleBsdf(Mat m, vec3 V, vec3 N, bool front, out vec3 L, out vec3 w, out float pdf, out bool delta, out bool through) {
  float nv = dot(N, V);
  delta = false; through = false; pdf = 0.0; w = vec3(0.0); L = N;
  if (nv <= 0.0) return false;
  float n1 = front ? 1.0 : m.ior; float n2 = front ? m.ior : 1.0; float eta = n1 / n2;
  vec4 p = lobeProbs(m, nv, eta);
  float a = max(1e-3, m.rough * m.rough);
  bool smoothSurf = isSmooth(m);
  float coatF = schlick1(0.04, nv) * m.coat;
  float u = rnd();
  int lobe = u < p.x ? 0 : (u < p.x + p.y ? 1 : (u < p.x + p.y + p.z ? 2 : 3));
  if (lobe == 1 && smoothSurf) {
    L = reflect(-V, N);
    float fd = fresnelD(nv, eta) * (m.trans > 0.0 ? 1.0 : m.spec);
    w = ((1.0 - m.metal) * vec3(fd) + m.metal * schlick3(m.color, nv)) * (1.0 - coatF) / p.y;
    delta = true;
    return true;
  }
  // The microfacet normal (one visible-normal sample whatever the lobe; the diffuse lobe ignores it).
  vec3 H = N;
  if (lobe != 0 && !(lobe == 3 && smoothSurf)) H = toWorld(sampleVndf(toLocal(V, N), lobe == 2 ? max(1e-3, m.coatRough * m.coatRough) : a, rnd2()), N);
  if (lobe == 0) {
    L = toWorld(cosineHemi(rnd2()), N);
  } else if (lobe != 3) {
    L = reflect(-V, H);
    if (dot(L, N) <= 0.0) return false;
  } else {
#ifdef HAS_TRANS
    L = refract(-V, H, eta);
    if (dot(L, L) < 0.5) return false; // total internal reflection: the specular lobe carries it
    if (dot(L, N) >= 0.0) return false;
    through = true;
    if (smoothSurf) {
      float F = fresnelD(nv, eta);
      w = vec3((1.0 - F) * (1.0 - m.metal) * m.trans * (1.0 - coatF) * eta * eta / p.w);
      if (m.absorb <= 0.0) w *= m.color;
      delta = true;
      return true;
    }
#else
    return false;
#endif
  }
  vec3 f = evalBsdf(m, V, L, N, front, pdf);
  if (pdf <= 0.0) return false;
  w = f / pdf;
  through = dot(L, N) < 0.0;
  return true;
}

vec3 offsetP(vec3 p, vec3 ng, vec3 dir) { return p + ng * (dot(dir, ng) > 0.0 ? uEps : -uEps); }

// Analytic soft suns hit by a BSDF ray (MIS against light sampling).
vec3 sunHits(vec3 rd, float pb) {
  vec3 e = vec3(0.0);
  for (int i = 0; i < lightCount(); i++) {
    if (int(uLA[i].x + 0.5) != 0) continue;
    float cosMax = uLB[i].w;
    if (cosMax >= 0.9999999 || dot(rd, uLA[i].yzw) < cosMax) continue;
    float pl = 1.0 / (TWO_PI * (1.0 - cosMax)) / float(lightCount());
    e += uLB[i].rgb / (PI * (1.0 - cosMax * cosMax)) * (pb > 0.0 ? powerH(pb, pl) : 1.0);
  }
  return e;
}

vec3 background(vec3 rd, float spread) { return uBackground == 0 ? envAt(rd, spread) : vec3(0.0); }

// The sample is a small state machine with ONE call of the traversal: each turn traces either a pending shadow
// ray (next-event estimation queues up to two, with the light they would deliver) or the path's next ray.
// (Shader compilers inline every call; one traversal keeps the program small and the compile quick.)
// Ray cones (Akenine-Möller et al. 2019) carry the footprint: coneW its width at the ray's origin, coneA its
// spread angle; textures and the environment pick their mip level from it.
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
#ifdef PINGPONG
  vec4 p0 = texelFetch(uPrev0, px, 0); vec4 p1 = texelFetch(uPrev1, px, 0); vec4 p2 = texelFetch(uPrev2, px, 0); vec4 p3 = texelFetch(uPrev3, px, 0);
  if (gl_FragCoord.x < uTile.x || gl_FragCoord.y < uTile.y || gl_FragCoord.x >= uTile.z || gl_FragCoord.y >= uTile.w) { oColor = p0; oAlbedo = p1; oNormal = p2; oMoments = p3; return; }
#endif
  seed = pcg(uint(px.x) + pcg(uint(px.y) + pcg(uint(uFrame) * 9781u + uint(uSeed) * 6271u)));
  vec2 j = rnd2();
  vec2 ndc = ((gl_FragCoord.xy - 0.5 + j) / uRes) * 2.0 - 1.0;
  vec3 ro; vec3 rd;
  if (uOrtho == 1) { ro = uCamPos + uCamRight * (ndc.x * uHalfH * uAspect) + uCamUp * (ndc.y * uHalfH); rd = uCamFwd; }
  else { ro = uCamPos; rd = normalize(uCamFwd + uCamRight * (ndc.x * uTanHalf * uAspect) + uCamUp * (ndc.y * uTanHalf)); }
  if (uLensR > 0.0) {
    vec3 focus = ro + rd * (uFocus / dot(rd, uCamFwd));
    vec2 lens = concentric(rnd2()) * uLensR;
    ro += uCamRight * lens.x + uCamUp * lens.y;
    rd = normalize(focus - ro);
  }
  float coneW = uPixWidth; float coneA = uPixAngle;
  vec3 L = vec3(0.0); vec3 T = vec3(1.0); float alpha = 0.0;
  vec3 albedo = vec3(0.0); vec3 normal = vec3(0.0); float depth = 0.0; bool gset = false;
  float lastPdf = 0.0; bool lastDelta = true; vec3 sigma = vec3(0.0);
  bool fromCatcher = false; vec3 pendingBg = vec3(0.0); float pendingAlpha = 0.0;
  bool diffPrimary = false; float diffRef = 1.0;
  bool alive = true; int bounce = 0;
  // Shadow queries: origin, direction, length, what they deliver (rgb to the radiance, a to the coverage).
  bool sA = false; vec3 aO = vec3(0.0); vec3 aD = vec3(0.0, 0.0, 1.0); float aT = 0.0; vec4 aC = vec4(0.0); int aN = 0;
  bool sB = false; vec3 bO = vec3(0.0); vec3 bD = vec3(0.0, 0.0, 1.0); float bT = 0.0; vec4 bC = vec4(0.0); int bN = 0;
  // A bound from a uniform: the HLSL compiler (Windows) analyses a constant-bound loop of this size for minutes.
  for (int it = 0; it < uBounces * 48 + 48; it++) {
    bool shadow = sA || sB;
    if (!shadow && !alive) break;
    vec3 qo = sA ? aO : (sB ? bO : ro);
    vec3 qd = sA ? aD : (sB ? bD : rd);
    float qt = sA ? aT : (sB ? bT : 1e30);
    Hit h;
    bool hit = traceBvh(qo, qd, qt, shadow && uCaustics == 1, h);
    if (shadow) {
      bool blocked = false; bool through = false; vec3 att = vec3(1.0);
#ifdef HAS_FLOOR
      if ((uGround == 2 || (uGround == 1 && uCatcherMode == 1)) && qd.z < 0.0) { float tg = (uGroundZ - qo.z) / qd.z; if (tg > 0.0 && tg < (hit ? h.t : qt)) blocked = true; }
#endif
      if (!blocked && hit) {
        if (uCaustics == 1) blocked = true;
        else {
          vec4 v0 = texelFetch(uTri, tx(h.tri * 3), 0);
          Mat m = fetchMat(int(v0.w + 0.5));
          if (m.trans < 0.05) blocked = true;
          else {
            vec3 nrm = normalize(cross(texelFetch(uTri, tx(h.tri * 3 + 1), 0).xyz - v0.xyz, texelFetch(uTri, tx(h.tri * 3 + 2), 0).xyz - v0.xyz));
            att = m.trans * (1.0 - m.metal) * (1.0 - fresnelD(abs(dot(nrm, qd)), 1.0 / m.ior)) * (m.absorb > 0.0 ? sqrt(m.color) : m.color);
            through = true;
          }
        }
      }
      float adv = hit ? h.t + 2.0 * uEps : 0.0;
      if (sA) {
        if (blocked) sA = false;
        else if (through) { aC *= vec4(att, lum(att)); aO = qo + qd * adv; aT -= adv; aN += 1; if (aN > 6 || lum(att) < 1e-4) sA = false; else if (aT <= 0.0) { L += aC.rgb; alpha += aC.a; sA = false; } }
        else { L += aC.rgb; alpha += aC.a; sA = false; }
      } else {
        if (blocked) sB = false;
        else if (through) { bC *= vec4(att, lum(att)); bO = qo + qd * adv; bT -= adv; bN += 1; if (bN > 6 || lum(att) < 1e-4) sB = false; else if (bT <= 0.0) { L += bC.rgb; alpha += bC.a; sB = false; } }
        else { L += bC.rgb; alpha += bC.a; sB = false; }
      }
      continue;
    }
    // ───── the path's next vertex
    do {
      float tg = 1e30; bool ground = false;
      if (uGround != 0 && rd.z < 0.0 && ro.z > uGroundZ - uEps) { tg = (uGroundZ - ro.z) / rd.z; if (tg > 0.0 && (!hit || tg < h.t)) ground = true; }
      bool differential = uGround == 1 && uCatcherMode == 1;
      if (uGround == 1 && !differential && (bounce > 0 || fromCatcher)) ground = false; // the catcher is only seen by camera rays
      float tHit = ground ? tg : (hit ? h.t : 1e30);
      float wHit = coneW + coneA * min(tHit, 1e7);
      // Absorption inside a transmissive body.
      if (dot(sigma, sigma) > 0.0 && tHit < 1e29) T *= exp(-sigma * tHit);
#ifdef HAS_AREA
      // Area and sphere lights in front of everything else (not seen by camera rays: lights out of the picture).
      vec3 le; float pla; float tl;
      if (bounce > 0 && hitAreaLights(ro, rd, tHit, le, pla, tl)) {
        if (fromCatcher) { L += T * le; alpha += pendingAlpha; }
        else L += T * le * (lastDelta ? 1.0 : powerH(lastPdf, pla / float(lightCount())));
        alive = false; break;
      }
#endif
      if (!hit && !ground) {
        if (bounce == 0) {
          L += background(rd, coneA);
          alpha += uBackground == 0 ? 1.0 : 0.0;
          if (!gset) { albedo = vec3(1.0); depth = 1e6; gset = true; }
        } else if (fromCatcher) {
          L += pendingBg; // nothing reflected there: the background shows
        } else {
          float w = lastDelta ? 1.0 : powerH(lastPdf, envPdf(rd));
          L += T * (envAt(rd, coneA) * w + sunHits(rd, lastDelta ? 0.0 : lastPdf));
        }
        alive = false; break;
      }
      if (fromCatcher) { alpha += pendingAlpha; fromCatcher = false; } // an object reflected in the ground
      bool isCatcher = ground && uGround == 1 && !differential;
      Surf s; Mat m;
      vec3 V = -rd;
      float cScale = 0.0; vec3 bgC = vec3(0.0); float k = 0.0; vec3 rnext = vec3(0.0, 0.0, 1.0);
      s.hasVcol = false; s.vcol = vec3(1.0); s.hasUv = false; s.uv = vec2(0.0);
#ifdef HAS_CATCHER
      if (isCatcher) {
        // Shadow catcher: the background times (occluded light ÷ unoccluded light), plus reflections of the objects.
        s.p = ro + rd * tg; s.n = vec3(0.0, 0.0, 1.0); s.ng = s.n; s.front = true; s.mat = uFloorMat;
        m = fetchMat(uFloorMat);
        float ul = lum(uCatcherU + localIrradianceUp(s.p));
        bgC = background(rd, coneA);
        if (uCatcherRefl > 0.0) {
          // A "metal" whose Schlick reflectance is the ground's: only the specular lobe, F = F0 + (1 − F0)(1 − cos)⁵.
          Mat fm = m;
          fm.color = vec3(uCatcherRefl); fm.metal = 1.0; fm.trans = 0.0; fm.coat = 0.0; fm.rough = max(0.03, uCatcherRough);
          vec3 cw; float cp; bool cd; bool ct;
          if (sampleBsdf(fm, V, s.n, true, rnext, cw, cp, cd, ct) && rnext.z > 0.0) k = clamp(lum(cw), 0.0, 1.0);
        }
        if (ul > 0.0) cScale = (1.0 - k) / ul;
        if (uBackground == 0) { alpha += 1.0; if (ul <= 0.0) L += bgC * (1.0 - k); }
        else if (ul > 0.0) alpha += 1.0 - k;
        if (!gset) { albedo = uBackground == 0 ? bgC : vec3(1.0); normal = s.n; depth = tg; gset = true; }
      } else
#endif
      if (ground) {
        s.p = ro + rd * tg; s.n = vec3(0.0, 0.0, 1.0); s.ng = s.n; s.front = true; s.mat = uFloorMat;
        m = fetchMat(uFloorMat);
#ifdef HAS_FLOOR
        if (differential) {
          // Differential rendering: the ground is a diffuse surface whose albedo makes its unoccluded look the
          // background exactly (albedo = π B / E). Shadows, light bounced off the objects and their colours then
          // come out of the ordinary path tracing — the background plus (scene with objects − scene without).
          vec3 U = max(uCatcherU + localIrradianceUp(s.p), vec3(1e-4));
          vec3 B = uBackground == 0 ? envAt(rd, coneA) : U * INV_PI;
          m.color = clamp(PI * B / U, 0.0, 1.5);
          m.metal = 0.0; m.trans = 0.0; m.coat = 0.0; m.tex = 0; m.emit = vec3(0.0);
          m.rough = max(0.03, uCatcherRough);
          float sq = sqrt(clamp(uCatcherRefl, 0.0, 0.95)); m.ior = (1.0 + sq) / (1.0 - sq); m.spec = uCatcherRefl > 0.0 ? 1.0 : 0.0;
          if (bounce == 0) { diffPrimary = true; diffRef = max(1e-6, lum(U) * INV_PI); }
        }
#endif
      } else {
        surfaceOf(h, ro, rd, s);
        m = fetchMat(s.mat);
        if (s.hasVcol) m.color = s.vcol;
#ifdef HAS_TEX
        applyTexture(m, s.p, s.n, s.uv, s.hasUv, wHit);
#endif
      }
      if (!isCatcher) {
        if (m.trans < 0.01 && m.metal < 0.01) m.rough = max(m.rough, 0.03);
        if (bounce == 0) alpha += 1.0;
        if (!gset) { albedo = m.trans > 0.5 ? vec3(1.0) : m.color; normal = s.n; depth = tHit; gset = true; }
        if (s.front && dot(m.emit, m.emit) > 0.0) L += T * m.emit;
      }
      // Next-event estimation: one environment direction and one light, each a queued shadow ray (not for
      // perfectly smooth glass and mirrors: their lobes are deltas).
      bool allDelta = !isCatcher && isSmooth(m) && (m.metal > 0.99 || m.trans > 0.99);
      if (!allDelta && (!isCatcher || cScale > 0.0)) {
        vec3 base = isCatcher ? vec3(s.p.xy, uGroundZ + uEps) : s.p;
        for (int q = 0; q < 2; q += 1 + int(uFrame < -7)) {
          vec3 wi = vec3(0.0, 0.0, 1.0); float dist = 1e30; vec3 li = vec3(0.0); float pl = 0.0; float sel = 1.0; bool ok = false;
          if (q == 0) {
            if (uEnvIntensity > 0.0) { wi = sampleEnvDir(rnd2(), pl); li = pl > 0.0 ? envAt(wi, 0.0) / pl : vec3(0.0); ok = pl > 0.0 && !(uGround == 2 && wi.z < 0.0); }
          } else if (lightCount() > 0) {
            int i = min(lightCount() - 1, int(rnd() * float(lightCount())));
            sel = float(lightCount());
            ok = sampleLight(i, base, wi, dist, li, pl);
            li *= sel; pl /= sel;
          }
          if (!ok) continue;
          float pb = 0.0;
          vec3 f = isCatcher ? vec3(max(wi.z, 0.0)) : evalBsdf(m, V, wi, s.n, s.front, pb);
          if (dot(f, f) <= 0.0) continue;
          vec3 c = f * li;
          vec4 contrib;
          if (isCatcher) { float o = lum(c) * cScale; contrib = vec4(bgC * o, uBackground == 0 ? 0.0 : -o); }
          else { c *= T * (pl > 0.0 ? powerH(pl, pb) : 1.0); if (uClamp > 0.0 && bounce > 0 && lum(c) > uClamp) c *= uClamp / lum(c); contrib = vec4(c, 0.0); }
          vec3 o = isCatcher ? base : offsetP(base, s.ng, wi);
          if (q == 0) { aC = contrib; aO = o; aD = wi; aT = 1e30; aN = 0; sA = true; }
          else { bC = contrib; bO = o; bD = wi; bT = dist - 2.0 * uEps; bN = 0; sB = true; }
        }
      }
      if (isCatcher) {
        if (k > 0.0) { pendingBg = bgC * k; pendingAlpha = uBackground == 0 ? 0.0 : k; T = vec3(k); ro = vec3(s.p.xy, uGroundZ + uEps); rd = rnext; fromCatcher = true; lastDelta = true; coneW = wHit; bounce += 1; }
        else alive = false;
        break;
      }
      vec3 wi; vec3 w; float pdf; bool delta; bool through;
      if (!sampleBsdf(m, V, s.n, s.front, wi, w, pdf, delta, through)) { alive = false; break; }
      T *= w;
      if (through) sigma = s.front && m.absorb > 0.0 ? -log(max(m.color, vec3(1e-4))) / m.absorb : vec3(0.0);
      lastPdf = pdf; lastDelta = delta;
      // The cone widens by the spread of the lobe it took (≈ the angle of a solid angle 1 / pdf).
      coneW = wHit;
      if (!delta) coneA = max(coneA, min(1.5, inversesqrt(max(pdf, 1e-3))));
      ro = offsetP(s.p, s.ng, wi); rd = wi;
      bounce += 1;
      if (bounce > uBounces) { alive = false; break; }
      if (bounce >= 3) { float q = clamp(max(T.r, max(T.g, T.b)), 0.05, 0.95); if (rnd() > q) { alive = false; break; } T /= q; }
      if (dot(T, T) < 1e-12) alive = false;
    } while (false);
  }
  if (any(isnan(L)) || any(isinf(L))) L = vec3(0.0);
  if (isnan(alpha) || isinf(alpha)) alpha = 0.0;
  // A differential ground on a plain background: its shading against the unshadowed ground is the coverage.
  if (diffPrimary && uBackground != 0) { alpha = clamp(1.0 - lum(L) / diffRef, 0.0, 1.0); L = vec3(0.0); albedo = vec3(1.0); }
  float ld = lum(L / max(albedo, vec3(0.02)));
  vec4 c0 = vec4(L, alpha); vec4 c1 = vec4(albedo, 1.0); vec4 c2 = vec4(normal, depth); vec4 c3 = vec4(ld, ld * ld, 0.0, 0.0);
#ifdef PINGPONG
  oColor = p0 + c0; oAlbedo = p1 + c1; oNormal = p2 + c2; oMoments = p3 + c3;
#else
  oColor = c0; oAlbedo = c1; oNormal = c2; oMoments = c3;
#endif
}
`;

// ───────────────────────── display: mean, tone mapping, background

export const SHOW_FRAG = `${COMMON}
uniform sampler2D tColor; uniform sampler2D tAlbedo; uniform sampler2D tDenoised; uniform int uUseDenoised;
uniform float uExposure; uniform int uBackground; uniform int uTone; uniform vec2 uRes;
out vec4 fragColor;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float n = texelFetch(tAlbedo, p, 0).a;
  if (n < 0.5) { fragColor = vec4(0.0); return; }
  vec4 c = uUseDenoised == 1 ? texelFetch(tDenoised, p, 0) : texelFetch(tColor, p, 0) / n;
  float a = clamp(c.a, 0.0, 1.0);
  vec3 rad = max(c.rgb, 0.0) * uExposure;
  vec3 col;
  if (uBackground == 0) { col = uTone == 1 ? aces(rad) : clamp(rad, 0.0, 1.0); fragColor = vec4(toSrgb(col), 1.0); return; }
  vec3 straight = a > 1e-4 ? rad / a : vec3(0.0);
  col = toSrgb(uTone == 1 ? aces(straight) : clamp(straight, 0.0, 1.0)) * a;
  if (uBackground == 1) fragColor = vec4(col + (1.0 - a), 1.0);
  else fragColor = vec4(col, a);
}
`;

// ───────────────────────── denoiser: edge-avoiding à-trous wavelets on demodulated light
// uMode 1 (default): variance-guided like SVGF (Schied et al. 2017) — the luminance edge stop scales with the
// local standard deviation estimated from the accumulated moments (or the neighbourhood for few samples), and
// the variance is filtered along (squared weights). uMode 0: the plain edge-avoiding filter (Dammertz 2010).

export const DENOISE_FRAG = `${COMMON}
uniform sampler2D tIn; uniform sampler2D tVarIn; uniform sampler2D tAlbedo; uniform sampler2D tNormal; uniform sampler2D tColor; uniform sampler2D tMoments;
uniform int uStep; uniform int uFirst; uniform int uLast; uniform int uMode;
uniform float uSigmaC; uniform float uSigmaN; uniform float uSigmaD; uniform float uSigmaL; uniform vec2 uRes;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragVar;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float countAt(ivec2 q) { return max(1.0, texelFetch(tAlbedo, q, 0).a); }
// The mean light of a pixel divided by its albedo (textures stay sharp: only the lighting is filtered).
vec4 inAt(ivec2 q) {
  if (uFirst == 1) {
    float n = countAt(q);
    vec4 c = texelFetch(tColor, q, 0) / n;
    vec3 alb = max(texelFetch(tAlbedo, q, 0).rgb / n, vec3(0.02));
    return vec4(c.rgb / alb, c.a);
  }
  return texelFetch(tIn, q, 0);
}
// Variance of the pixel's mean (luminance of the demodulated light): from the accumulated moments, or — with
// too few samples for a reliable estimate — from the 3 × 3 neighbourhood.
float varAt(ivec2 q, ivec2 size) {
  if (uFirst == 0) return texelFetch(tVarIn, q, 0).r;
  float n = countAt(q);
  vec2 m = texelFetch(tMoments, q, 0).xy / n;
  float v = max(0.0, m.y - m.x * m.x) / n;
  if (n < 4.0) {
    float s = 0.0; float s2 = 0.0;
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
      float l = luma(inAt(clamp(q + ivec2(dx, dy), ivec2(0), size - 1)).rgb);
      s += l; s2 += l * l;
    }
    s /= 9.0; s2 /= 9.0;
    v = max(v, max(0.0, s2 - s * s));
  }
  return v;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 size = ivec2(uRes);
  float n0 = countAt(p);
  vec4 c0 = inAt(p);
  vec4 g0 = texelFetch(tNormal, p, 0) / n0;
  float l0 = luma(c0.rgb);
  const float k[3] = float[3](0.375, 0.25, 0.0625);
  // The variance around the pixel, blurred a little (3 × 3 Gaussian): steadier edge stops.
  float gvar = 0.0;
  if (uMode == 1) {
    const float g[2] = float[2](0.25, 0.125);
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
      float wg = (dx == 0 && dy == 0) ? 0.25 : (dx == 0 || dy == 0 ? 0.125 : 0.0625);
      gvar += wg * varAt(clamp(p + ivec2(dx, dy), ivec2(0), size - 1), size);
    }
  }
  vec4 sum = vec4(0.0); float wsum = 0.0; float vsum = 0.0;
  for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) {
    ivec2 q = clamp(p + ivec2(dx, dy) * uStep, ivec2(0), size - 1);
    float nq = countAt(q);
    vec4 cq = inAt(q);
    vec4 gq = texelFetch(tNormal, q, 0) / nq;
    float h = k[abs(dx)] * k[abs(dy)];
    float lq = luma(cq.rgb);
    float wl;
    if (uMode == 1) wl = exp(-abs(l0 - lq) / (uSigmaL * sqrt(max(gvar, 1e-12)) + 1e-4));
    else wl = exp(-abs(l0 - lq) / (uSigmaC * (0.2 + l0) + 1e-6));
    float wn = pow(max(0.0, dot(g0.xyz, gq.xyz) + (dot(g0.xyz, g0.xyz) < 0.25 ? 1.0 : 0.0)), uSigmaN);
    float wd = exp(-abs(g0.w - gq.w) / (uSigmaD * float(uStep) * max(1e-3, g0.w) + 1e-6));
    float w = h * wl * min(1.0, wn) * wd;
    sum += cq * w; wsum += w;
    if (uMode == 1) vsum += w * w * varAt(q, size);
  }
  vec4 r = wsum > 0.0 ? sum / wsum : c0;
  float vout = wsum > 0.0 ? vsum / (wsum * wsum) : 0.0;
  if (uLast == 1) { vec3 alb = max(texelFetch(tAlbedo, p, 0).rgb / n0, vec3(0.02)); r.rgb *= alb; }
  fragColor = r;
  fragVar = vec4(vout, 0.0, 0.0, 1.0);
}
`;
