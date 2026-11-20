// WebGL 2 for the compositor: textures (from video, canvas, image or an earlier pass), render targets,
// the item drawing program and the shader passes of the video filters and transitions.
//
// Orientation: a picture's "visual" coordinates have (0,0) at its top-left. Uploaded pictures keep their
// first row at v = 0 (topDown = true); render targets store the top at v = 1 (topDown = false). Every shader
// samples through src(uv) / tex(uv), which take visual coordinates and the texture's orientation.
// Colours are premultiplied by alpha everywhere (uploads premultiply; blending is ONE, ONE_MINUS_SRC_ALPHA).

const VS_QUAD = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() { vUV = vec2(aPos.x, 1.0 - aPos.y); gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

// Item: unit quad → content rect in box space → canvas by the item matrix → clip space of the target.
const VS_ITEM = `#version 300 es
in vec2 aPos;
uniform mat3 uM;
uniform vec4 uContent;
uniform vec2 uTarget;
uniform vec4 uUV;
out vec2 vUV;
void main() {
  vec2 p = uContent.xy + aPos * uContent.zw;
  vec3 w = uM * vec3(p, 1.0);
  vUV = mix(uUV.xy, uUV.zw, aPos);
  gl_Position = vec4(w.x / uTarget.x * 2.0 - 1.0, 1.0 - w.y / uTarget.y * 2.0, 0.0, 1.0);
}`;

const SAMPLE = `
uniform sampler2D uTex;
uniform bool uTopDown;
uniform vec2 uSize;
vec4 src(vec2 uv) { return texture(uTex, uTopDown ? uv : vec2(uv.x, 1.0 - uv.y)); }
vec3 unpremul(vec4 c) { return c.a > 0.0001 ? c.rgb / c.a : vec3(0.0); }
`;

const FS_ITEM = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
${SAMPLE}
uniform int uSampling; // 0 texture filter, 1 bicubic, 2 lanczos
uniform float uAlpha;
uniform vec4 uTint;
uniform vec4 uClip; // visual uv limits (crop with wrap-free sampling)
float w3(float x) { x = abs(x); return x < 1.0 ? (1.5 * x - 2.5) * x * x + 1.0 : x < 2.0 ? ((-0.5 * x + 2.5) * x - 4.0) * x + 2.0 : 0.0; }
float sinc(float x) { return x == 0.0 ? 1.0 : sin(3.14159265 * x) / (3.14159265 * x); }
float lz(float x) { return abs(x) < 3.0 ? sinc(x) * sinc(x / 3.0) : 0.0; }
vec4 cubic(vec2 uv) {
  vec2 px = uv * uSize - 0.5; vec2 f = fract(px); vec2 base = floor(px);
  vec4 sum = vec4(0.0); float wsum = 0.0;
  for (int j = -1; j <= 2; j++) for (int i = -1; i <= 2; i++) {
    float w = w3(float(i) - f.x) * w3(float(j) - f.y);
    sum += src(clamp((base + vec2(i, j) + 0.5) / uSize, uClip.xy, uClip.zw)) * w; wsum += w;
  }
  return sum / wsum;
}
vec4 lanczos(vec2 uv) {
  vec2 px = uv * uSize - 0.5; vec2 f = fract(px); vec2 base = floor(px);
  vec4 sum = vec4(0.0); float wsum = 0.0;
  for (int j = -2; j <= 3; j++) for (int i = -2; i <= 3; i++) {
    float w = lz(float(i) - f.x) * lz(float(j) - f.y);
    sum += src(clamp((base + vec2(i, j) + 0.5) / uSize, uClip.xy, uClip.zw)) * w; wsum += w;
  }
  return sum / wsum;
}
void main() {
  vec2 uv = clamp(vUV, uClip.xy, uClip.zw);
  vec4 c = uSampling == 1 ? cubic(uv) : uSampling == 2 ? lanczos(uv) : src(uv);
  c = clamp(c, 0.0, 1.0);
  outColor = vec4(c.rgb * uTint.rgb, c.a) * uAlpha * uTint.a;
}`;

const FS_FILL = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor.rgb * uColor.a, uColor.a); }`;

/** Fragment shaders of the filter and transition passes; each reads uTex through src(uv). */
const PASSES = {
  copy: 'void main() { outColor = src(vUV); }',
  // Color correction (color_filter_v2): gamma, contrast, brightness, saturation, hue, opacity, multiply, add.
  color: `uniform float uGamma, uContrast, uBrightness, uSaturation, uHue, uOpacity; uniform vec3 uMul, uAdd;
  vec3 hueShift(vec3 c, float a) { const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
  void main() { vec4 s = src(vUV); vec3 c = unpremul(s);
    c = pow(max(c, 0.0), vec3(uGamma < 0.0 ? 1.0 - uGamma : 1.0 / (1.0 + uGamma)));
    c = (c - 0.5) * (uContrast >= 0.0 ? 1.0 + uContrast : 1.0 / (1.0 - uContrast)) + 0.5 + uBrightness;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.0 + uSaturation);
    c = hueShift(c, radians(uHue)); c = c * uMul + uAdd;
    float a = s.a * uOpacity; outColor = vec4(clamp(c, 0.0, 1.0) * a, a); }`,
  // Chroma key (v2: distance in CbCr, smoothness, spill).
  chroma: `uniform vec3 uKey; uniform float uSim, uSmooth, uSpill, uOpacity, uContrast, uBrightness, uGamma;
  vec2 cbcr(vec3 c) { return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b); }
  void main() { vec4 s = src(vUV); vec3 c = unpremul(s);
    float d = distance(cbcr(c), cbcr(uKey));
    float base = d - uSim; float a = clamp(base / uSmooth, 0.0, 1.0);
    float spill = clamp(pow(clamp(base / uSpill, 0.0, 1.0), 1.5), 0.0, 1.0);
    float desat = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(desat), c, spill);
    c = pow(max((c - 0.5) * (uContrast >= 0.0 ? 1.0 + uContrast : 1.0 / (1.0 - uContrast)) + 0.5 + uBrightness, 0.0), vec3(uGamma < 0.0 ? 1.0 - uGamma : 1.0 / (1.0 + uGamma)));
    float alpha = s.a * a * uOpacity; outColor = vec4(clamp(c, 0.0, 1.0) * alpha, alpha); }`,
  colorkey: `uniform vec3 uKey; uniform float uSim, uSmooth, uOpacity, uContrast, uBrightness, uGamma;
  void main() { vec4 s = src(vUV); vec3 c = unpremul(s);
    float d = distance(c, uKey); float a = clamp((d - uSim) / uSmooth, 0.0, 1.0);
    c = pow(max((c - 0.5) * (uContrast >= 0.0 ? 1.0 + uContrast : 1.0 / (1.0 - uContrast)) + 0.5 + uBrightness, 0.0), vec3(uGamma < 0.0 ? 1.0 - uGamma : 1.0 / (1.0 + uGamma)));
    float alpha = s.a * a * uOpacity; outColor = vec4(clamp(c, 0.0, 1.0) * alpha, alpha); }`,
  // 3D LUT stored as a 2D atlas: uLutSize slices of uLutSize² laid in rows of uLutCols.
  lut: `uniform sampler2D uLut; uniform float uLutSize, uLutCols, uAmount; uniform bool uPassAlpha;
  vec3 slice(vec3 c, float z) { float n = uLutSize; float col = mod(z, uLutCols); float row = floor(z / uLutCols);
    float rows = ceil(n / uLutCols); vec2 cell = vec2(col, row) * n + c.rg * (n - 1.0) + 0.5; return texture(uLut, cell / vec2(uLutCols * n, rows * n)).rgb; }
  void main() { vec4 s = src(vUV); vec3 c = clamp(unpremul(s), 0.0, 1.0); float z = c.b * (uLutSize - 1.0);
    vec3 o = mix(slice(c, floor(z)), slice(c, min(uLutSize - 1.0, floor(z) + 1.0)), fract(z));
    vec3 r = mix(c, o, uAmount); outColor = vec4(r * s.a, s.a); }`,
  mask: `uniform sampler2D uMask; uniform int uType; uniform vec3 uColor; uniform float uOpacity;
  void main() { vec4 s = src(vUV); vec4 m = texture(uMask, vUV); vec3 mc = m.a > 0.0 ? m.rgb / m.a : vec3(0.0);
    if (uType == 0) { outColor = s * m.a * uOpacity; }
    else if (uType == 1) { outColor = s * dot(mc, vec3(0.299, 0.587, 0.114)) * uOpacity; }
    else { vec3 c = unpremul(s); vec3 k = mc * uColor; vec3 r = uType == 2 ? c * k : uType == 3 ? c + k : c - k;
      float a = s.a * uOpacity; outColor = vec4(clamp(r, 0.0, 1.0) * a, a); } }`,
  sharpen: `uniform float uAmount;
  void main() { vec2 t = 1.0 / uSize; vec4 c = src(vUV);
    vec4 n = src(vUV + vec2(t.x, 0.0)) + src(vUV - vec2(t.x, 0.0)) + src(vUV + vec2(0.0, t.y)) + src(vUV - vec2(0.0, t.y));
    outColor = clamp(c + (c * 4.0 - n) * uAmount, 0.0, 1.0); }`,
  tonemap: `uniform int uMode; uniform float uExposure;
  void main() { vec4 s = src(vUV); vec3 c = unpremul(s) * uExposure;
    c = uMode == 0 ? c / (1.0 + c) : c / max(1.0, max(c.r, max(c.g, c.b)));
    outColor = vec4(c * s.a, s.a); }`,
  blur: `uniform vec2 uDir; uniform float uRadius; uniform int uKind;
  void main() { if (uKind == 2) { vec2 cell = max(vec2(1.0), vec2(uRadius)) / uSize; outColor = src((floor(vUV / cell) + 0.5) * cell); return; }
    vec4 sum = vec4(0.0); float wsum = 0.0; int r = int(min(uRadius, 64.0));
    for (int i = -64; i <= 64; i++) { if (i < -r || i > r) continue; float x = float(i);
      float w = uKind == 0 ? exp(-x * x / max(1.0, uRadius * uRadius / 4.0)) : 1.0;
      sum += src(vUV + uDir * x / uSize) * w; wsum += w; }
    outColor = sum / wsum; }`,
  scroll: `uniform vec2 uOffset; uniform bool uLoop;
  void main() { vec2 uv = vUV + uOffset; if (!uLoop && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) { outColor = vec4(0.0); return; } outColor = src(fract(uv)); }`,
  // Transitions: uTex = from (A), uTexB = to (B), uP = progress 0…1.
  fade: `uniform sampler2D uTexB; uniform bool uTopDownB; uniform float uP;
  vec4 srcB(vec2 uv) { return texture(uTexB, uTopDownB ? uv : vec2(uv.x, 1.0 - uv.y)); }
  void main() { outColor = mix(src(vUV), srcB(vUV), uP); }`,
  fadecolor: `uniform sampler2D uTexB; uniform bool uTopDownB; uniform float uP, uSwitch; uniform vec3 uColor;
  vec4 srcB(vec2 uv) { return texture(uTexB, uTopDownB ? uv : vec2(uv.x, 1.0 - uv.y)); }
  void main() { vec4 col = vec4(uColor, 1.0);
    outColor = uP < uSwitch ? mix(src(vUV), col, uP / max(0.0001, uSwitch)) : mix(col, srcB(vUV), (uP - uSwitch) / max(0.0001, 1.0 - uSwitch)); }`,
  lumawipe: `uniform sampler2D uTexB; uniform bool uTopDownB; uniform sampler2D uLumaTex; uniform float uP, uSoft; uniform bool uInvert;
  vec4 srcB(vec2 uv) { return texture(uTexB, uTopDownB ? uv : vec2(uv.x, 1.0 - uv.y)); }
  void main() { float l = texture(uLumaTex, vUV).r; if (uInvert) l = 1.0 - l;
    float p = uP * (1.0 + uSoft); float k = smoothstep(l, l + uSoft + 0.0001, p);
    outColor = mix(src(vUV), srcB(vUV), k); }`,
  // Track matte stinger: the matte half of the stinger video says how much of B shows.
  matte: `uniform sampler2D uTexB; uniform bool uTopDownB; uniform sampler2D uStinger; uniform bool uVertical;
  vec4 srcB(vec2 uv) { return texture(uTexB, uTopDownB ? uv : vec2(uv.x, 1.0 - uv.y)); }
  void main() { vec2 m = uVertical ? vec2(vUV.x, 0.5 + vUV.y * 0.5) : vec2(0.5 + vUV.x * 0.5, vUV.y);
    vec2 c = uVertical ? vec2(vUV.x, vUV.y * 0.5) : vec2(vUV.x * 0.5, vUV.y);
    vec4 mc = texture(uStinger, m); float k = dot(mc.rgb, vec3(0.299, 0.587, 0.114));
    vec4 base = mix(src(vUV), srcB(vUV), k); vec4 st = texture(uStinger, c);
    outColor = st + base * (1.0 - st.a); }`,
};
PASSES.lumakey = `uniform float uMax, uMaxSmooth, uMin, uMinSmooth;
  void main() { vec4 s = src(vUV); float l = dot(unpremul(s), vec3(0.2126, 0.7152, 0.0722));
    float lo = uMinSmooth > 0.0 ? smoothstep(uMin - uMinSmooth, uMin + uMinSmooth, l) : step(uMin, l);
    float hi = uMaxSmooth > 0.0 ? 1.0 - smoothstep(uMax - uMaxSmooth, uMax + uMaxSmooth, l) : step(l, uMax);
    outColor = s * lo * hi; }`;

const FS_PASS = (body) => `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
${SAMPLE}
${body}`;

export const PASS_NAMES = Object.keys(PASSES);

export class GL {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', desynchronized: false });
    if (!gl) throw new Error('WebGL 2 is not available');
    this.canvas = canvas;
    this.gl = gl;
    this.programs = new Map();
    this.pool = [];
    this.stats = { draws: 0, passes: 0, uploads: 0 };
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.item = this.program('item', VS_ITEM, FS_ITEM);
    this.fill = this.program('fill', VS_ITEM, FS_FILL);
    for (const [name, body] of Object.entries(PASSES)) if (body) this.program(name, VS_QUAD, FS_PASS(body));
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.lost = true; });
  }

  program(name, vs, fs) {
    const gl = this.gl;
    const compile = (type, text) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader ${name}: ${gl.getShaderInfoLog(shader)}`);
      return shader;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`program ${name}: ${gl.getProgramInfoLog(p)}`);
    const uniforms = new Map();
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) { const info = gl.getActiveUniform(p, i); uniforms.set(info.name.replace(/\[0\]$/, ''), { loc: gl.getUniformLocation(p, info.name), type: info.type }); }
    const entry = { p, uniforms };
    this.programs.set(name, entry);
    return entry;
  }

  // ───────────────────────── textures

  /** A texture object: { tex, w, h, topDown }. */
  texture(w = 1, h = 1, { filter = 'linear' } = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter === 'nearest' ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === 'nearest' ? gl.NEAREST : gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return { tex, w, h, topDown: true };
  }

  /** Uploads a video / canvas / image / ImageBitmap / VideoFrame into `t` (resized as needed). */
  upload(t, element, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, element);
      t.w = w; t.h = h; t.topDown = true;
      this.stats.uploads++;
      return true;
    } catch {
      return false; // a frame not ready yet (or tainted): keep the last one
    }
  }

  /** Raw RGBA pixels (row 0 = top) into a texture (LUTs, luma patterns). */
  uploadPixels(t, pixels, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    t.w = w; t.h = h; t.topDown = true;
  }

  setFilter(t, nearest) {
    const gl = this.gl;
    if (t.nearest === nearest) return;
    t.nearest = nearest;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  }

  deleteTexture(t) { if (t?.tex) this.gl.deleteTexture(t.tex); if (t) t.tex = null; }

  // ───────────────────────── render targets (pooled per frame)

  /** A render target of this size: { fb, tex, w, h, topDown: false }. */
  target(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const gl = this.gl;
    const i = this.pool.findIndex((x) => x.w === w && x.h === h);
    if (i >= 0) return this.pool.splice(i, 1)[0];
    const t = this.texture(w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    return { ...t, fb, topDown: false };
  }
  /** Gives a target back to the pool (kept for the next frame). */
  release(t) { if (t?.fb && !this.pool.includes(t)) { this.pool.push(t); if (this.pool.length > 64) this.destroyTarget(this.pool.shift()); } }
  destroyTarget(t) { if (!t) return; this.gl.deleteFramebuffer(t.fb); this.gl.deleteTexture(t.tex); }

  bind(target, clear = [0, 0, 0, 0]) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    const w = target ? target.w : this.canvas.width;
    const h = target ? target.h : this.canvas.height;
    gl.viewport(0, 0, w, h);
    if (clear) { gl.clearColor(...clear); gl.clear(gl.COLOR_BUFFER_BIT); }
    return { w, h };
  }

  setUniforms(prog, values) {
    const gl = this.gl;
    let unit = 0;
    for (const [name, value] of Object.entries(values)) {
      const u = prog.uniforms.get(name);
      if (!u) continue;
      switch (u.type) {
        case gl.SAMPLER_2D: gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, value?.tex ?? null); gl.uniform1i(u.loc, unit); unit++; break;
        case gl.FLOAT: gl.uniform1f(u.loc, value); break;
        case gl.INT: case gl.BOOL: gl.uniform1i(u.loc, Number(value)); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, value); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, value); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, value); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, value); break;
        default: break;
      }
    }
  }

  blend(mode = 'normal') {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    switch (mode) {
      case 'none': gl.disable(gl.BLEND); break;
      case 'additive': gl.blendFunc(gl.ONE, gl.ONE); break;
      case 'subtract': gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT); gl.blendFunc(gl.ONE, gl.ONE); break;
      case 'screen': gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
      case 'multiply': gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'lighten': gl.blendEquation(gl.MAX); break;
      case 'darken': gl.blendEquation(gl.MIN); break;
      default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  /**
   * Draws texture `t` into the bound target: matrix m (2D affine of the item), content rect, the visual uv
   * rectangle [u0, v0, u1, v1] (crop / flip), sampling 'point' | 'bilinear' | 'bicubic' | 'lanczos' | 'area'.
   */
  drawItem(t, size, m, content, uv, { alpha = 1, blend = 'normal', sampling = 'bilinear', tint = [1, 1, 1, 1] } = {}) {
    const gl = this.gl;
    const prog = this.item;
    gl.useProgram(prog.p);
    this.blend(blend);
    this.setFilter(t, sampling === 'point');
    const lo = [Math.min(uv[0], uv[2]), Math.min(uv[1], uv[3])];
    const hi = [Math.max(uv[0], uv[2]), Math.max(uv[1], uv[3])];
    const half = [0.5 / Math.max(1, t.w), 0.5 / Math.max(1, t.h)];
    this.setUniforms(prog, {
      uTex: t, uTopDown: t.topDown, uSize: [t.w, t.h], uM: [m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1],
      uContent: [content.x, content.y, content.w, content.h], uTarget: size, uUV: uv,
      uSampling: sampling === 'bicubic' ? 1 : sampling === 'lanczos' ? 2 : 0, uAlpha: alpha, uTint: tint,
      uClip: [lo[0] + half[0], lo[1] + half[1], hi[0] - half[0], hi[1] - half[1]],
    });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.stats.draws++;
  }

  /** A solid rectangle (colour source, safe-area guides in projectors). */
  fillRect(size, m, rect, rgba, blend = 'normal') {
    const gl = this.gl;
    gl.useProgram(this.fill.p);
    this.blend(blend);
    this.setUniforms(this.fill, { uM: [m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1], uContent: [rect.x, rect.y, rect.w, rect.h], uTarget: size, uUV: [0, 0, 1, 1], uColor: rgba });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** One full-target shader pass: `out` receives PASSES[name] applied to `input`. */
  pass(name, input, out, uniforms = {}) {
    const gl = this.gl;
    const prog = this.programs.get(name);
    if (!prog) throw new Error(`no pass ${name}`);
    this.bind(out, [0, 0, 0, 0]);
    gl.useProgram(prog.p);
    gl.disable(gl.BLEND);
    this.setFilter(input, false);
    const extra = {};
    for (const [k, v] of Object.entries(uniforms)) { extra[k] = v; if (k === 'uTexB' && v) extra.uTopDownB = v.topDown; }
    this.setUniforms(prog, { uTex: input, uTopDown: input.topDown, uSize: [input.w, input.h], ...extra });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.stats.passes++;
    return out;
  }

  /** Reads a target back as RGBA rows top first (screenshots, tests). */
  read(target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    const w = target ? target.w : this.canvas.width;
    const h = target ? target.h : this.canvas.height;
    const raw = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const out = new Uint8ClampedArray(w * h * 4);
    const row = w * 4;
    for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    return { data: out, width: w, height: h };
  }
}
