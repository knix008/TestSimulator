// Moving landscape behind the start page. Each visit builds a new valley;
// the sky, the hills, and the lake keep moving, and the colours follow the theme.
// The loop pauses while the page is hidden or the window is in the background.

const HORIZON = [0.97, 0.74, 0.5];

function cssChannels(value) {
  const text = String(value ?? '').trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  }
  const rgb = text.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return rgb ? [1, 2, 3].map((i) => Number(rgb[i]) / 255) : null;
}

function mixColor(a, b, k) {
  return a.map((v, i) => v + (b[i] - v) * k);
}

function cssHex(rgb) {
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Sky, hills and water take the active theme's accent, so a theme change is obvious. */
function themePalette() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const dark = root.dataset.theme !== 'light';
  const accent = cssChannels(style.getPropertyValue('--accent')) ?? [0.3, 0.55, 1];
  const bg = cssChannels(style.getPropertyValue('--bg')) ?? (dark ? [0.09, 0.1, 0.13] : [0.95, 0.96, 0.97]);
  const lift = mixColor(accent, [1, 1, 1], dark ? 0.42 : 0.62);
  const zenith = dark ? mixColor(accent, bg, 0.55) : mixColor(lift, [0.97, 0.98, 1], 0.2);
  const horizon = dark ? mixColor(accent, lift, 0.35) : mixColor(lift, [1, 0.98, 0.94], 0.28);
  const grass = dark ? mixColor(accent, [0.1, 0.22, 0.1], 0.28) : mixColor(accent, [0.62, 0.78, 0.48], 0.32);
  const sand = dark ? mixColor(accent, [0.62, 0.48, 0.3], 0.32) : mixColor(lift, [0.98, 0.94, 0.82], 0.35);
  const water = dark ? mixColor(accent, [0.02, 0.06, 0.1], 0.22) : mixColor(accent, [0.78, 0.92, 0.95], 0.38);
  const fog = dark ? mixColor(horizon, bg, 0.4) : mixColor(horizon, [1, 1, 1], 0.22);
  const cloud = dark ? mixColor(lift, [1, 0.97, 0.94], 0.28) : mixColor(lift, [1, 1, 1], 0.45);
  return { zenith, horizon, grass, sand, water, fog, cloud, glow: lift };
}
const NOISE = `
uniform vec2 uSeed;
uniform vec2 uShift;
uniform vec4 uShape;
float hash(vec2 p) {
  return fract(sin(dot(p + uSeed, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
float heightOf(vec2 p) {
  float d = length(p - uShift);
  float valley = smoothstep(uShape.x, uShape.y, d);
  float hills = fbm(p * 0.05) * uShape.z;
  float ridge = 1.0 - abs(fbm(p * 0.021 + uSeed) * 2.0 - 1.0);
  float peaks = ridge * ridge * uShape.w;
  float rim = smoothstep(42.0, 58.0, d) * (5.0 + uShape.w * 0.2);
  return mix(0.2, hills * 0.7 + peaks, valley) + rim;
}
`;

const SKY_VS = `
precision highp float;
attribute vec3 aPos;
uniform mat4 uMvp;
varying vec3 vDir;
void main() {
  vDir = aPos;
  gl_Position = uMvp * vec4(aPos, 1.0);
}
`;

const SKY_FS = `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uCloud;
uniform vec3 uGlow;
${NOISE}
void main() {
  vec3 dir = normalize(vDir);
  // Turn the whole dome so the clear sky, the sun, and the horizon all travel,
  // not only the cloud patches.
  float yaw = uTime * 0.22;
  float cy = cos(yaw), sy = sin(yaw);
  dir = vec3(cy * dir.x - sy * dir.z, dir.y + sin(dir.x * 1.6 + uTime * 0.55) * 0.06, sy * dir.x + cy * dir.z);
  dir = normalize(dir);
  float h = dir.y;
  float lift = sin(dir.x * 2.2 + uTime * 0.7) * 0.08;
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h + lift));
  col = mix(col, uHorizon * 0.72, smoothstep(0.08, -0.2, h));
  float sun = pow(max(dot(dir, uSun), 0.0), 420.0);
  float glow = pow(max(dot(dir, uSun), 0.0), 8.0);
  col += uGlow * sun + uGlow * glow * 0.55;
  vec2 drift = vec2(uTime * 0.12, uTime * 0.045);
  vec2 cuv = dir.xz / max(0.1, abs(dir.y) + 0.15) * 0.65 + drift;
  float clouds = smoothstep(0.48, 0.78, fbm(cuv));
  float wisps = smoothstep(0.46, 0.76, fbm(cuv * 1.8 + vec2(-uTime * 0.16, uTime * 0.07)));
  float veil = fbm(dir.xz * 1.3 + drift * 1.6);
  clouds = max(clouds, wisps * 0.7);
  col = mix(col, uCloud, clouds * mix(0.4, 0.75, smoothstep(-0.12, 0.22, h)));
  col += (veil - 0.5) * uHorizon * 0.22;
  float wave = sin(dir.x * 6.0 + dir.y * 5.0 + uTime * 1.25) + 0.7 * sin(dir.x * 2.2 - dir.y * 3.4 + uTime * 0.53);
  col += uHorizon * 0.14 * wave;
  gl_FragColor = vec4(col, 1.0);
}
`;

const LAND_VS = `
precision highp float;
attribute vec2 aXZ;
uniform mat4 uMvp;
uniform vec3 uCam;
uniform float uTime;
varying float vH;
varying vec3 vN;
varying vec3 vWorld;
varying float vDist;
${NOISE}
float sway(vec2 p) {
  return sin(p.x * 0.16 + uTime * 0.9) * cos(p.y * 0.13 + uTime * 0.66) * 0.7
       + sin(p.x * 0.5 + p.y * 0.36 + uTime * 1.8) * 0.24;
}
void main() {
  float e = 0.7;
  float h = heightOf(aXZ) + sway(aXZ);
  float hx = heightOf(aXZ + vec2(e, 0.0)) + sway(aXZ + vec2(e, 0.0));
  float hz = heightOf(aXZ + vec2(0.0, e)) + sway(aXZ + vec2(0.0, e));
  vec3 normal = normalize(vec3(h - hx, e, h - hz));
  vec3 world = vec3(aXZ.x, h, aXZ.y);
  vH = h;
  vN = normal;
  vWorld = world;
  vDist = distance(world, uCam);
  gl_Position = uMvp * vec4(world, 1.0);
}
`;

const LAND_FS = `
precision highp float;
varying float vH;
varying vec3 vN;
varying vec3 vWorld;
varying float vDist;
uniform vec3 uSun;
uniform vec3 uFog;
uniform vec3 uSand;
uniform vec3 uGrass;
uniform float uTime;
${NOISE}
void main() {
  vec3 n = normalize(vN);
  float ndl = max(dot(n, uSun), 0.0);
  float moving = fbm(vWorld.xz * 0.045 + vec2(uTime * 0.14, -uTime * 0.05));
  float shade = 0.28 + 0.22 * n.y + ndl * 0.9 + moving * 0.28;
  vec3 sand = uSand;
  vec3 grass = uGrass;
  vec3 moss = uGrass * vec3(0.7, 0.88, 0.72);
  vec3 rock = mix(uSand, uGrass, 0.4);
  vec3 snow = mix(vec3(0.96, 0.97, 0.98), uSand, 0.18);
  float patch = fbm(vWorld.xz * 0.18);
  vec3 col = mix(sand, grass, smoothstep(1.7, 3.1, vH));
  col = mix(col, moss, patch * smoothstep(2.2, 6.0, vH));
  col = mix(col, rock, smoothstep(8.0, 13.0, vH));
  col = mix(col, snow, smoothstep(13.5, 17.5, vH) * smoothstep(0.45, 0.85, n.y));
  float blades = sin(vWorld.x * 2.1 + vWorld.z * 1.3 + uTime * 2.6);
  col += uGrass * 0.35 * blades * smoothstep(11.0, 2.0, vH);
  col *= shade;
  col += vec3(1.0, 0.85, 0.6) * pow(ndl, 6.0) * 0.08;
  float mist = fbm(vWorld.xz * 0.02 + vec2(uTime * 0.09, uTime * 0.03));
  vec3 fog = uFog * (0.82 + 0.28 * mist);
  col = mix(col, fog, smoothstep(48.0, 120.0, vDist) * (0.45 + 0.55 * mist));
  float wave = sin(vWorld.x * 0.32 + vWorld.z * 0.24 + uTime * 1.25) + 0.65 * sin(vWorld.x * 0.11 - vWorld.z * 0.19 + uTime * 0.41);
  col += uSand * 0.16 * wave;
  gl_FragColor = vec4(col, 1.0);
}
`;

const WATER_VS = `
precision highp float;
attribute vec2 aXZ;
uniform mat4 uMvp;
uniform float uTime;
uniform float uLevel;
uniform vec3 uCam;
varying vec3 vN;
varying vec3 vWorld;
varying float vDist;
void main() {
  float w = sin(aXZ.x * 0.42 + uTime * 1.8) * 0.22 + cos(aXZ.y * 0.36 + uTime * 1.45) * 0.16 + sin((aXZ.x + aXZ.y) * 0.2 + uTime * 0.9) * 0.12;
  float wx = cos(aXZ.x * 0.42 + uTime * 1.8) * 0.42 * 0.22;
  float wz = -sin(aXZ.y * 0.36 + uTime * 1.45) * 0.36 * 0.16;
  vec3 normal = normalize(vec3(-wx, 1.0, -wz));
  vec3 world = vec3(aXZ.x, uLevel + w, aXZ.y);
  vN = normal;
  vWorld = world;
  vDist = distance(world, uCam);
  gl_Position = uMvp * vec4(world, 1.0);
}
`;

const WATER_FS = `
precision highp float;
varying vec3 vN;
varying vec3 vWorld;
varying float vDist;
uniform vec3 uSun;
uniform vec3 uCam;
uniform vec3 uFog;
uniform vec3 uDeep;
uniform float uTime;
void main() {
  vec3 n = normalize(vN);
  vec3 view = normalize(uCam - vWorld);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  vec3 deep = uDeep;
  vec3 sky = mix(uDeep, uFog, 0.72);
  vec3 col = mix(deep, sky, fres);
  float rip = sin(vWorld.x * 0.85 + uTime * 1.8) * cos(vWorld.z * 0.72 - uTime * 1.5);
  col += uDeep * 0.45 * rip;
  vec3 refl = reflect(-uSun, n);
  float spec = pow(max(dot(refl, view), 0.0), 90.0);
  col += vec3(1.0, 0.95, 0.82) * spec;
  float mist = 0.5 + 0.5 * sin(vWorld.x * 0.18 + uTime * 0.9) * cos(vWorld.z * 0.14 - uTime * 0.7);
  col = mix(col, uFog * (0.8 + 0.3 * mist), smoothstep(36.0, 100.0, vDist) * (0.4 + 0.6 * mist));
  float wave = sin(vWorld.x * 0.55 + vWorld.z * 0.4 + uTime * 1.4) + 0.7 * sin(vWorld.x * 0.2 - vWorld.z * 0.27 + uTime * 0.46);
  col += uDeep * 0.35 * wave;
  gl_FragColor = vec4(col, 0.78 + fres * 0.18);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || 'shader');
  }
  return shader;
}

function program(gl, vs, fs, attrib) {
  const shaderVs = compile(gl, gl.VERTEX_SHADER, vs);
  const shaderFs = compile(gl, gl.FRAGMENT_SHADER, fs);
  const handle = gl.createProgram();
  gl.attachShader(handle, shaderVs);
  gl.attachShader(handle, shaderFs);
  gl.bindAttribLocation(handle, 0, attrib);
  gl.linkProgram(handle);
  gl.deleteShader(shaderVs);
  gl.deleteShader(shaderFs);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle) || 'link');
  return { handle, points: attrib === 'aPos' ? 3 : 2, uniforms: new Map() };
}

function grid(gl, n, span) {
  const pos = new Float32Array(n * n * 2);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = (z * n + x) * 2;
      pos[i] = (x / (n - 1) - 0.5) * span;
      pos[i + 1] = (z / (n - 1) - 0.5) * span;
    }
  }
  const ext = gl.getExtension('OES_element_index_uint');
  const cells = (n - 1) * (n - 1) * 6;
  const idx = ext ? new Uint32Array(cells) : new Uint16Array(Math.min(cells, 65535));
  let k = 0;
  const limit = ext ? n : Math.min(n, 64);
  for (let z = 0; z < limit - 1; z++) {
    for (let x = 0; x < limit - 1; x++) {
      const a = z * n + x;
      idx[k++] = a;
      idx[k++] = a + n;
      idx[k++] = a + 1;
      idx[k++] = a + 1;
      idx[k++] = a + n;
      idx[k++] = a + n + 1;
    }
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  const elements = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.subarray(0, k), gl.STATIC_DRAW);
  return { buffer, elements, count: k, type: ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
}

function dome(gl, radius) {
  const rings = 20;
  const segs = 48;
  const pos = [];
  const idx = [];
  for (let y = 0; y <= rings; y++) {
    const phi = (y / rings) * Math.PI * 0.62;
    const yy = Math.cos(phi) * radius;
    const r = Math.sin(phi) * radius;
    for (let x = 0; x <= segs; x++) {
      const theta = (x / segs) * Math.PI * 2;
      pos.push(Math.cos(theta) * r, yy, Math.sin(theta) * r);
    }
  }
  const row = segs + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segs; x++) {
      const a = y * row + x;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  const elements = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return { buffer, elements, count: idx.length };
}

function lookAt(out, eye, center, up) {
  let fx = center[0] - eye[0];
  let fy = center[1] - eye[1];
  let fz = center[2] - eye[2];
  let len = Math.hypot(fx, fy, fz) || 1;
  fx /= len; fy /= len; fz /= len;
  let sx = fy * up[2] - fz * up[1];
  let sy = fz * up[0] - fx * up[2];
  let sz = fx * up[1] - fy * up[0];
  len = Math.hypot(sx, sy, sz) || 1;
  sx /= len; sy /= len; sz /= len;
  const ux = sy * fz - sz * fy;
  const uy = sz * fx - sx * fz;
  const uz = sx * fy - sy * fx;
  out[0] = sx; out[1] = ux; out[2] = -fx; out[3] = 0;
  out[4] = sy; out[5] = uy; out[6] = -fy; out[7] = 0;
  out[8] = sz; out[9] = uz; out[10] = -fz; out[11] = 0;
  out[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
  out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  out[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  out[15] = 1;
  return out;
}

function perspective(out, fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function multiply(out, a, b) {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

export class StartBackground {
  constructor(host) {
    this.host = host;
    this.running = false;
    this.wanted = false;
    this.frame = 0;
    this.sun = [0.48, 0.38, 0.22];
    this.roll();
  }

  /** A new valley: different hills, lake, and the direction the camera starts from. */
  roll() {
    const r = () => Math.random();
    const inner = 5 + r() * 9;
    this.seed = [r() * 90 + 1, r() * 90 + 1];
    this.shift = [(r() - 0.5) * 24, (r() - 0.5) * 24];
    this.shape = [inner, inner + 12 + r() * 16, 3.5 + r() * 5.5, 10 + r() * 18];
    this.waterLevel = 0.55 + r() * 1.7;
    this.angle = r() * Math.PI * 2;
    this.phase = r() * 40;
  }

  /** Compile the landscape once, off the click that opens the page. */
  prewarm() {
    this.ensureGl();
  }

  ensureGl() {
    if (this.gl || this.failed) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'start-bg-canvas is-pending';
    this.host.append(canvas);
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
    if (!gl) {
      this.failed = true;
      canvas.remove();
      this.host.classList.add('start-bg-fallback');
      return;
    }
    this.canvas = canvas;
    this.gl = gl;
    try {
      this.sky = program(gl, SKY_VS, SKY_FS, 'aPos');
      this.land = program(gl, LAND_VS, LAND_FS, 'aXZ');
      this.water = program(gl, WATER_VS, WATER_FS, 'aXZ');
      this.dome = dome(gl, 180);
      this.ground = grid(gl, gl.getExtension('OES_element_index_uint') ? 96 : 64, 120);
      this.lake = grid(gl, 48, 70);
    } catch (error) {
      console.error(error);
      this.failed = true;
      this.gl = null;
      canvas.remove();
      this.host.classList.add('start-bg-fallback');
      return;
    }
    this.view = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.mvp = new Float32Array(16);
    this.mvpSky = new Float32Array(16);
    new ResizeObserver(() => this.resize()).observe(this.host);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else if (this.wanted) this.start();
    });
  }

  show() {
    if (!this.wanted) this.roll();
    this.syncTheme();
    if (!this.themeWatch) {
      this.themeWatch = new MutationObserver(() => this.syncTheme());
      this.themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-id', 'style'] });
    }
    this.ensureGl();
    this.wanted = true;
    if (!this.gl) return;
    // The themed gradient shows at once. The new valley is drawn on the next frame.
    this.resize();
    this.start();
  }

  syncTheme() {
    this.palette = themePalette();
    const { zenith, horizon, grass } = this.palette;
    this.host.style.setProperty('--start-zenith', cssHex(zenith));
    this.host.style.setProperty('--start-horizon', cssHex(horizon));
    this.host.style.setProperty('--start-grass', cssHex(grass));
  }

  resize() {
    const gl = this.gl;
    if (!gl) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const ratio = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(width * ratio));
    const h = Math.max(1, Math.floor(height * ratio));
    this.wantW = w;
    this.wantH = h;
    // The animation frame applies the size together with the redraw, so opening
    // the page does not stop to draw the valley on the click itself.
    if (this.running && (this.canvas.width !== w || this.canvas.height !== h)) this.cover();
  }

  applySize(now) {
    const gl = this.gl;
    if (!gl || !this.wantW || !this.wantH) return;
    const realloc = this.canvas.width !== this.wantW || this.canvas.height !== this.wantH;
    if (realloc) {
      if (this.running) this.cover();
      this.canvas.width = this.wantW;
      this.canvas.height = this.wantH;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.aspect = this.canvas.width / this.canvas.height;
    this.draw(now);
    this.canvas.classList.remove('is-pending');
    if (realloc) {
      gl.flush();
      this.snapUntil = now;
    } else if (this.snap?.isConnected && this.snapUntil != null && now >= this.snapUntil) {
      this.snap.remove();
      this.snapUntil = null;
    }
  }

  // Paint the current frame over the canvas so the clear from a resize stays hidden.
  cover() {
    const src = this.canvas;
    if (!src?.width || !src.height || this.snap?.isConnected) return;
    let snap = this.snap;
    if (!snap) {
      snap = document.createElement('canvas');
      snap.className = 'start-bg-snap';
      snap.setAttribute('aria-hidden', 'true');
      this.snap = snap;
    }
    if (snap.width !== src.width) snap.width = src.width;
    if (snap.height !== src.height) snap.height = src.height;
    const ctx = snap.getContext('2d', { alpha: false });
    ctx.drawImage(src, 0, 0);
    const px = ctx.getImageData(Math.max(0, (snap.width >> 1) - 1), Math.max(0, (snap.height >> 1) - 1), 1, 1).data;
    if (px[0] + px[1] + px[2] < 12) return;
    this.host.append(snap);
  }

  draw(now) {
    const gl = this.gl;
    if (!gl || !this.aspect) return;
    const t = now / 1000 + (this.phase || 0);
    // The sun walks the sky so slopes all across the valley change light.
    const spin = t * 0.45;
    const sx = Math.cos(spin) * 0.8;
    const sy = 0.4 + Math.sin(t * 0.2) * 0.05;
    const sz = Math.sin(spin) * 0.8;
    const sl = Math.hypot(sx, sy, sz);
    this.sun[0] = sx / sl;
    this.sun[1] = sy / sl;
    this.sun[2] = sz / sl;
    // A cruise around the lake, looking near the valley, so the hills slide
    // across the window the way a moving wallpaper does.
    const elev = 0.22 + Math.sin(t * 0.35) * 0.1;
    const dist = 24 + Math.sin(t * 0.22) * 4;
    const eye = [
      Math.cos(this.angle) * dist * Math.cos(elev),
      4.8 + Math.sin(elev) * 14 + Math.sin(t * 0.5) * 1.4,
      Math.sin(this.angle) * dist * Math.cos(elev),
    ];
    const look = [Math.sin(t * 0.15) * 3, 2.2, Math.cos(t * 0.18) * 2];
    lookAt(this.view, eye, look, [0, 1, 0]);
    perspective(this.proj, 0.72, this.aspect, 0.4, 400);
    multiply(this.mvp, this.proj, this.view);
    // The sky stays centred on the camera so the horizon does not slide away.
    const skyEye = [0, eye[1] * 0.15, 0];
    const skyLook = [look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]];
    lookAt(this.view, skyEye, [skyEye[0] + skyLook[0], skyEye[1] + skyLook[1], skyEye[2] + skyLook[2]], [0, 1, 0]);
    multiply(this.mvpSky, this.proj, this.view);

    const key = `${document.documentElement.dataset.theme}|${document.documentElement.style.getPropertyValue('--accent')}|${document.documentElement.style.getPropertyValue('--bg')}`;
    if (key !== this.themeKey) { this.themeKey = key; this.syncTheme(); }
    const tone = this.palette ?? themePalette();
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(tone.horizon[0], tone.horizon[1], tone.horizon[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    const scene = { uSeed: this.seed, uShift: this.shift, uShape: this.shape };
    this.drawMesh(this.sky, this.dome, { uMvp: this.mvpSky, uTime: t, uSun: this.sun, uZenith: tone.zenith, uHorizon: tone.horizon, uCloud: tone.cloud, uGlow: tone.glow, ...scene });
    gl.cullFace(gl.BACK);
    gl.depthMask(true);
    this.drawMesh(this.land, this.ground, { uMvp: this.mvp, uCam: eye, uSun: this.sun, uFog: tone.fog, uSand: tone.sand, uGrass: tone.grass, uTime: t, ...scene });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.drawMesh(this.water, this.lake, { uMvp: this.mvp, uTime: t, uLevel: this.waterLevel, uCam: eye, uSun: this.sun, uFog: tone.fog, uDeep: tone.water });
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  drawMesh(prog, mesh, uniforms) {
    const gl = this.gl;
    gl.useProgram(prog.handle);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, prog.points, gl.FLOAT, false, 0, 0);
    for (const [name, value] of Object.entries(uniforms)) {
      let loc = prog.uniforms.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(prog.handle, name);
        prog.uniforms.set(name, loc);
      }
      if (loc == null) continue;
      if (name === 'uMvp') gl.uniformMatrix4fv(loc, false, value);
      else if (value.length === 4) gl.uniform4fv(loc, value);
      else if (value.length === 3) gl.uniform3fv(loc, value);
      else if (value.length === 2) gl.uniform2fv(loc, value);
      else gl.uniform1f(loc, value);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.elements);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type ?? gl.UNSIGNED_SHORT, 0);
  }

  start() {
    if (this.running || !this.gl) return;
    const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.running = true;
    let last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.angle += dt * (calm ? 0.12 : 0.28);
      this.applySize(now);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  hide() {
    this.wanted = false;
    this.stop();
    this.snap?.remove();
    this.snapUntil = null;
  }
}
