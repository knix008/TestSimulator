// The WebGL kit every 3D start scene draws with: a camera, a sky dome, terrain,
// water (with a mirror pass for reflections), particle clouds, lit meshes and
// ribbons. Programs compile the first time a scene needs them. Each draw sets
// every uniform of its program, so one scene never inherits another's values.
import { domeArrays, gridArrays, STRIDE, stripArrays } from './meshes.js';
import { NOISE_GLSL, TERRAIN_GLSL } from './terrain.js';

const SKY_VS = `
precision highp float;
attribute vec3 aPos;
uniform mat4 uVp;
varying vec3 vDir;
void main() {
  vDir = aPos;
  gl_Position = uVp * vec4(aPos * 40.0, 1.0);
}
`;

const SKY_FS = `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform vec3 uNebA;
uniform vec3 uNebB;
uniform vec3 uBand;
uniform vec3 uRetroColor;
uniform vec2 uWind;
uniform float uSunSize;
uniform float uGlow;
uniform float uClouds;
uniform float uStars;
uniform float uMilky;
uniform float uNebula;
uniform float uTime;
uniform float uSpin;
uniform float uRetro;
uniform float uFlash;
uniform float uHaze;
uniform float uSpace;
uniform float uMirror;
${NOISE_GLSL}
float starLayer(vec3 d, float scale, float density) {
  vec3 p = d * scale;
  vec3 c = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash12(c.xy + c.z * 17.13);
  if (h < 1.0 - density) return 0.0;
  vec3 off = vec3(hash12(c.yz + 3.1), hash12(c.zx + 7.7), hash12(c.xy + 1.3)) - 0.5;
  float dist = length(f - off * 0.6);
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
  return smoothstep(0.27, 0.0, dist) * tw * (0.4 + 0.8 * fract(h * 13.0));
}
void main() {
  vec3 d = normalize(vDir);
  if (uMirror > 0.5 && d.y < 0.0) discard;
  float h = mix(d.y, abs(d.y), uSpace);
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 1.0, h), 0.6));
  col = mix(col, uGround, smoothstep(0.0, -0.22, h));
  if (uStars > 0.0 || uMilky > 0.0 || uNebula > 0.0) {
    // Stars turn around a tilted pole.
    float cs = cos(uSpin), sn = sin(uSpin);
    vec3 s = vec3(cs * d.x - sn * d.z, d.y, sn * d.x + cs * d.z);
    s = vec3(s.x, s.y * 0.88 - s.z * 0.47, s.y * 0.47 + s.z * 0.88);
    float night = smoothstep(-0.05, 0.12, h + uSpace);
    float band = exp(-pow(dot(s, uBand) / 0.2, 2.0));
    if (uMilky > 0.0) {
      float dust = fbm4(s.xz * 3.0 + s.y * 2.0) * 0.7 + fbm4(s.xy * 6.0) * 0.3;
      col += mix(uNebA, uNebB, dust) * band * dust * uMilky * 0.55 * night;
    }
    if (uNebula > 0.0) {
      vec3 w = abs(s);
      float n1 = fbm4(s.yz * 1.8 + uTime * 0.004) * w.x + fbm4(s.zx * 1.8 + 3.0) * w.y + fbm4(s.xy * 1.8 + 7.0) * w.z;
      float n2 = fbm4(s.xy * 3.5 + 11.0 - uTime * 0.006);
      col += mix(uNebA, uNebB, n2) * pow(n1 / (w.x + w.y + w.z), 2.2) * uNebula * 1.6;
    }
    if (uStars > 0.0) {
      float st = starLayer(s, 150.0, 0.05 + band * 0.1 * uMilky) + starLayer(s, 70.0, 0.03) * 1.4;
      col += vec3(0.92, 0.95, 1.0) * st * uStars * night;
    }
  }
  float sd = max(dot(d, uSun), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.28 + pow(sd, 48.0) * 0.45) * uGlow;
  float ang = 1.0 - dot(d, uSun);
  float rr = uSunSize * uSunSize * 0.5;
  float disc = uSunSize > 0.0 ? 1.0 - smoothstep(rr * 0.82, rr, ang) : 0.0;
  if (uRetro > 0.0) {
    vec3 side = normalize(cross(uSun, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(side, uSun);
    float yy = dot(d - uSun, up) / max(uSunSize, 0.001);
    float cut = step(0.42, fract(yy * 5.0 + uTime * 0.25));
    disc *= mix(1.0, cut, step(yy, 0.15) * uRetro);
    col = mix(col, mix(uRetroColor, uSunColor * 1.15, smoothstep(-0.9, 0.8, yy)), disc);
  } else {
    col = mix(col, uSunColor * 1.25, disc);
  }
  if (uClouds > 0.0 && h > -0.05) {
    vec2 cuv = d.xz / (h + 0.18) * 0.9 + uWind * uTime;
    float n = fbm4(cuv) * 0.75 + fbm4(cuv * 2.7 - uWind * uTime * 0.6) * 0.25;
    float cov = smoothstep(0.62 - uClouds * 0.42, 0.86 - uClouds * 0.32, n) * smoothstep(-0.02, 0.14, h);
    float thick = smoothstep(0.5, 0.95, n);
    vec3 cc = uCloudColor * (0.82 + 0.38 * pow(sd, 3.0) - thick * 0.35) + uSunColor * pow(sd, 10.0) * 0.45;
    col = mix(col, cc, cov * 0.94);
  }
  col = mix(col, uHorizon, uHaze * exp(-abs(h) * 10.0));
  col += vec3(0.75, 0.8, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
}
`;

const TERRAIN_VS = `
precision highp float;
attribute vec2 aXZ;
uniform mat4 uVp;
uniform vec2 uOrigin;
uniform float uSpan;
uniform float uStep;
varying vec3 vWorld;
varying vec3 vN;
${NOISE_GLSL}
${TERRAIN_GLSL}
void main() {
  vec2 w = uOrigin + aXZ * uSpan;
  float h = terrainH(w);
  float hx = terrainH(w + vec2(uStep, 0.0));
  float hz = terrainH(w + vec2(0.0, uStep));
  vN = normalize(vec3(h - hx, uStep, h - hz));
  vWorld = vec3(w.x, h, w.y);
  gl_Position = uVp * vec4(vWorld, 1.0);
}
`;

const TERRAIN_FS = `
precision highp float;
varying vec3 vWorld;
varying vec3 vN;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
uniform vec3 uPeak;
uniform vec3 uFog;
uniform vec3 uLineColor;
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform vec4 uBands;
uniform vec2 uFogRange;
uniform float uLines;
uniform float uLineGap;
uniform float uClip;
uniform float uTime;
uniform float uAlpha;
uniform float uSparkle;
${NOISE_GLSL}
void main() {
  if (vWorld.y < uClip) discard;
  vec3 n = normalize(vN);
  float y = vWorld.y + (vnoise(vWorld.xz * 0.11) - 0.5) * uBands.w;
  vec3 col = mix(uLow, uMid, smoothstep(uBands.x - 1.0, uBands.x + 1.0, y));
  col = mix(col, uHigh, smoothstep(uBands.y - 2.0, uBands.y + 2.0, y));
  col = mix(col, uHigh * 0.85, (1.0 - smoothstep(0.55, 0.85, n.y)) * 0.75);
  col = mix(col, uPeak, smoothstep(uBands.z - 2.0, uBands.z + 2.0, y) * smoothstep(0.45, 0.75, n.y));
  col *= 0.86 + 0.26 * vnoise(vWorld.xz * 0.7);
  float ndl = max(dot(n, uSun), 0.0);
  vec3 lit = col * (uAmbient + uSunColor * ndl);
  vec3 L = uLightPos - vWorld;
  float dl = length(L);
  lit += col * uLightColor * max(dot(n, L / max(dl, 0.001)), 0.0) / (1.0 + dl * dl * 0.03);
  float dist = distance(uCam, vWorld);
  if (uSparkle > 0.0) {
    float g = hash12(floor(vWorld.xz * 6.0));
    lit += uSunColor * step(0.985, g) * uSparkle * (0.5 + 0.5 * sin(uTime * 3.0 + g * 60.0)) * (1.0 - smoothstep(10.0, 40.0, dist));
  }
  if (uLines > 0.0) {
    vec2 g = abs(fract(vWorld.xz / uLineGap + 0.5) - 0.5) * uLineGap;
    float wdt = 0.05 + dist * 0.003;
    float line = 1.0 - smoothstep(wdt * 0.4, wdt, min(g.x, g.y));
    lit += uLineColor * line * uLines * (1.0 - smoothstep(uFogRange.y * 0.5, uFogRange.y, dist) * 0.7);
  }
  lit = mix(lit, uFog, smoothstep(uFogRange.x, uFogRange.y, dist));
  gl_FragColor = vec4(lit, uAlpha);
}
`;

const WATER_VS = `
precision highp float;
attribute vec2 aXZ;
uniform mat4 uVp;
uniform vec2 uOrigin;
uniform vec2 uWaveDir;
uniform float uSpan;
uniform float uLevel;
uniform float uTime;
uniform float uWave;
uniform float uWaveScale;
varying vec3 vWorld;
varying vec3 vN;
varying float vCrest;
void wave(vec2 p, vec2 dir, float freq, float amp, float speed, inout float h, inout vec2 g) {
  float ph = dot(p, dir) * freq + uTime * speed;
  h += sin(ph) * amp;
  g += dir * cos(ph) * amp * freq;
}
void main() {
  vec2 p = uOrigin + aXZ * uSpan;
  vec2 d = normalize(uWaveDir);
  vec2 side = vec2(-d.y, d.x);
  float s = uWaveScale;
  float h = 0.0;
  vec2 g = vec2(0.0);
  wave(p, d, 0.11 / s, 0.55 * uWave, 0.9, h, g);
  wave(p, normalize(d + side * 0.5), 0.19 / s, 0.3 * uWave, 1.25, h, g);
  wave(p, normalize(d - side * 0.7), 0.33 / s, 0.15 * uWave, 1.7, h, g);
  wave(p, side, 0.57 / s, 0.07 * uWave, 2.4, h, g);
  vCrest = h / max(uWave, 0.0001);
  vN = normalize(vec3(-g.x, 1.0, -g.y));
  vWorld = vec3(p.x, uLevel + h, p.y);
  gl_Position = uVp * vec4(vWorld, 1.0);
}
`;

const WATER_FS = `
precision highp float;
varying vec3 vWorld;
varying vec3 vN;
varying float vCrest;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec2 uFogRange;
uniform float uSpec;
uniform float uShine;
uniform float uFoam;
uniform float uMirror;
uniform float uRipple;
uniform float uTime;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vN);
  if (uRipple > 0.0) {
    vec2 q = vWorld.xz * 0.9;
    vec2 r = vec2(vnoise(q + vec2(uTime * 0.6, 0.0)) - vnoise(q * 1.7 - vec2(0.0, uTime * 0.8)),
                  vnoise(q.yx + vec2(0.0, uTime * 0.7)) - vnoise(q.yx * 1.9 + vec2(uTime * 0.5, 0.0)));
    n = normalize(n + vec3(r.x, 0.0, r.y) * uRipple);
  }
  vec3 v = normalize(uCam - vWorld);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.5, r.y));
  vec3 body = mix(uDeep, uShallow, clamp(vCrest * 0.4 + 0.45, 0.0, 1.0));
  vec3 col = mix(body, sky, fres * (1.0 - uMirror));
  col += uSunColor * pow(max(dot(r, uSun), 0.0), uShine) * uSpec;
  float foam = smoothstep(uFoam, uFoam + 0.4, vCrest) * (0.55 + 0.45 * vnoise(vWorld.xz * 0.9 + uTime * 0.4));
  col = mix(col, vec3(0.93, 0.96, 0.98), foam * 0.75);
  float dist = distance(uCam, vWorld);
  float fog = smoothstep(uFogRange.x, uFogRange.y, dist);
  col = mix(col, uFog, fog);
  float alpha = 1.0 - fres * uMirror * (1.0 - fog);
  gl_FragColor = vec4(col, alpha);
}
`;

const POINTS_VS = `
precision highp float;
attribute vec4 aSeed;
uniform mat4 uVp;
uniform vec3 uCam;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uVel;
uniform vec3 uWobble;
uniform float uTime;
uniform float uWobbleFreq;
uniform float uSize;
uniform float uScreen;
uniform float uMaxSize;
uniform float uTwinkle;
uniform float uBlink;
uniform float uSwirl;
uniform float uRise;
uniform float uLane;
uniform float uLaneY;
uniform float uFadeFar;
varying float vAlpha;
varying float vMix;
varying float vSpin;
void main() {
  vec3 base = aSeed.xyz * uBox + uVel * uTime;
  vec3 local = mod(base - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 p = uCenter + local;
  float ph = aSeed.w * 6.2831;
  p += uWobble * vec3(sin(uTime * uWobbleFreq + ph * 7.0), sin(uTime * uWobbleFreq * 0.77 + ph * 3.0), cos(uTime * uWobbleFreq * 0.91 + ph * 5.0));
  if (uSwirl != 0.0) {
    vec2 q = p.xz - uCenter.xz;
    float a = uSwirl * uTime / (1.0 + length(q) * 0.08) + local.y * 0.06;
    float ca = cos(a), sa = sin(a);
    p.xz = uCenter.xz + vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
  }
  if (uLane > 0.0) {
    float lane = fract(aSeed.w * 7.0) > 0.5 ? 0.8 : -0.8;
    if (abs(uVel.x) > abs(uVel.z)) p.z = floor(p.z / uLane + 0.5) * uLane + lane;
    else p.x = floor(p.x / uLane + 0.5) * uLane + lane;
    p.y = uLaneY;
  }
  vec3 e = 0.5 - abs(local / uBox);
  float edge = smoothstep(0.0, 0.07, min(min(e.x, e.y), e.z));
  float rise = uRise > 0.0 ? pow(clamp(0.5 - local.y / uBox.y, 0.0, 1.0), uRise) : 1.0;
  float tw = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (2.0 + aSeed.w * 4.0) + ph * 11.0));
  float bl = pow(max(sin(uTime * (0.7 + aSeed.y * 0.9) + ph * 9.0), 0.0), 3.0);
  vec4 clip = uVp * vec4(p, 1.0);
  float dist = distance(p, uCam);
  float size = uSize * (0.55 + 0.9 * fract(aSeed.w * 3.3)) * uScreen / max(clip.w, 0.1);
  vAlpha = edge * rise * tw * mix(1.0, bl, uBlink) * (1.0 - smoothstep(uFadeFar * 0.6, uFadeFar, dist)) * min(1.0, size / 1.5);
  vMix = fract(aSeed.w * 13.7);
  vSpin = uTime * (0.8 + aSeed.x * 1.6) + ph;
  gl_Position = clip;
  gl_PointSize = clamp(size, 1.0, uMaxSize);
}
`;

const POINTS_FS = `
precision highp float;
varying float vAlpha;
varying float vMix;
varying float vSpin;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uShape;
uniform float uAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a;
  vec3 col = mix(uColorA, uColorB, vMix);
  if (uShape < 0.5) {
    a = exp(-r * r * 5.0) * 0.7 + smoothstep(0.32, 0.0, r) * 0.6;
  } else if (uShape < 1.5) {
    a = (1.0 - smoothstep(0.03, 0.09, abs(c.x))) * smoothstep(0.5, 0.0, abs(c.y));
  } else if (uShape < 2.5) {
    a = smoothstep(1.0, 0.4, r);
  } else if (uShape < 3.5) {
    float s = sin(vSpin), k = cos(vSpin);
    vec2 q = vec2(k * c.x - s * c.y, s * c.x + k * c.y);
    q.x *= 1.0 / (0.35 + 0.65 * abs(cos(vSpin * 0.7)));
    a = smoothstep(1.0, 0.8, length(q * vec2(2.4, 3.6))) * (1.0 - smoothstep(0.0, 0.05, q.y - 0.24 + abs(q.x) * 1.5));
    col *= 0.82 + 0.25 * cos(vSpin * 1.3);
  } else if (uShape < 4.5) {
    a = smoothstep(1.0, 0.9, r) * (0.5 + 0.5 * smoothstep(0.55, 0.95, r));
  } else if (uShape < 5.5) {
    a = exp(-r * r * 18.0) + (exp(-abs(c.x) * 44.0) * exp(-abs(c.y) * 6.0) + exp(-abs(c.y) * 44.0) * exp(-abs(c.x) * 6.0)) * 0.6;
  } else {
    a = exp(-r * r * 3.0) * smoothstep(1.0, 0.65, r);
  }
  a *= vAlpha * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}
`;

const MESH_VS = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aSway;
attribute float aWin;
attribute vec2 aRoot;
uniform mat4 uVp;
uniform mat4 uModel;
uniform float uTime;
uniform float uWind;
uniform float uGround;
uniform float uMinGround;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
varying float vWin;
${NOISE_GLSL}
${TERRAIN_GLSL}
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  if (uGround > 0.5) {
    float g = terrainH(aRoot);
    if (g < uMinGround) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    w.y += g;
  }
  float s = aSway * uWind;
  w.x += s * (sin(uTime * 1.1 + aRoot.x * 0.3 + aRoot.y * 0.2) * 0.6 + sin(uTime * 2.3 + aRoot.y) * 0.2);
  w.z += s * cos(uTime * 0.9 + aRoot.y * 0.25 + aRoot.x * 0.1) * 0.4;
  vWorld = w.xyz;
  vN = (uModel * vec4(aNormal, 0.0)).xyz;
  vCol = aColor;
  vWin = aWin;
  gl_Position = uVp * w;
}
`;

const MESH_FS = `
precision highp float;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
varying float vWin;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFog;
uniform vec3 uTint;
uniform vec3 uWinColor;
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform vec3 uRim;
uniform vec2 uFogRange;
uniform float uWindows;
uniform float uEmit;
uniform float uAlpha;
uniform float uClip;
uniform float uTime;
${NOISE_GLSL}
void main() {
  if (vWorld.y < uClip) discard;
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vWorld);
  if (dot(n, v) < 0.0) n = -n;
  vec3 base = vCol * uTint;
  vec3 col = base * (uAmbient + uSunColor * max(dot(n, uSun), 0.0));
  vec3 L = uLightPos - vWorld;
  float dl = length(L);
  col += base * uLightColor * max(dot(n, L / max(dl, 0.001)), 0.0) / (1.0 + dl * dl * 0.03);
  col += uRim * pow(1.0 - max(dot(n, v), 0.0), 3.0);
  if (vWin > 0.5 && uWindows > 0.0) {
    float along = abs(n.x) > abs(n.z) ? vWorld.z : vWorld.x;
    vec2 q = vec2(along * 0.9, vWorld.y * 0.75);
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float inside = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.82);
    float key = hash12(cell + floor(vWorld.xz * 0.05) * 31.0);
    float on = step(0.52, hash12(cell * 1.7 + floor(uTime * 0.05 + key * 6.0)));
    col = mix(col, uWinColor * (0.6 + 0.7 * key), inside * on * uWindows);
  }
  col = mix(col, base, uEmit);
  col = mix(col, uFog, smoothstep(uFogRange.x, uFogRange.y, distance(uCam, vWorld)));
  gl_FragColor = vec4(col, uAlpha);
}
`;

const RIBBON_VS = `
precision highp float;
attribute vec2 aUV;
uniform mat4 uVp;
uniform vec3 uOffset;
uniform vec3 uSun;
uniform float uTime;
uniform float uIndex;
uniform float uMode;
uniform float uLen;
uniform float uWidth;
uniform float uHeight;
uniform float uRadius;
varying vec2 vUV;
varying float vShade;
varying float vGloss;
vec3 loop(float u) {
  float a = u * 6.2831853;
  float k = uIndex;
  float r = uRadius * (1.0 + 0.25 * sin(uTime * 0.21 + k));
  vec3 c = vec3(sin(a + k * 1.7) * r,
                sin(a * 2.0 + uTime * 0.37 + k * 2.3) * uRadius * 0.38 + sin(a * 3.0 - uTime * 0.29 + k) * uRadius * 0.12,
                cos(a + k * 1.7) * r * (0.75 + 0.25 * cos(uTime * 0.17 + k * 0.5)));
  float t = uTime * 0.08 + k * 1.1;
  float ct = cos(t), st = sin(t);
  c = vec3(ct * c.x - st * c.z, c.y, st * c.x + ct * c.z);
  float tilt = 0.35 * sin(k * 2.1);
  return vec3(c.x, c.y * cos(tilt) - c.z * sin(tilt), c.y * sin(tilt) + c.z * cos(tilt));
}
void main() {
  float u = aUV.x;
  float v = aUV.y;
  vec3 p;
  if (uMode < 0.5) {
    vec3 c = loop(u);
    vec3 tng = normalize(loop(u + 0.002) - c);
    vec3 up0 = normalize(cross(tng, vec3(0.0, 1.0, 0.0)) + vec3(0.0001));
    vec3 up1 = cross(up0, tng);
    float tw = u * 6.2831853 * 2.0 + uTime * 0.6 + uIndex;
    vec3 side = up0 * cos(tw) + up1 * sin(tw);
    vec3 nrm = normalize(cross(tng, side));
    p = c + side * (v - 0.5) * uWidth + uOffset;
    vShade = abs(dot(nrm, uSun));
    vGloss = pow(vShade, 12.0);
  } else {
    float k = uIndex;
    float x = (u - 0.5) * uLen;
    float z = sin(u * 5.0 + uTime * 0.23 + k * 1.3) * 18.0 + sin(u * 13.0 - uTime * 0.41 + k) * 5.0;
    float top = uHeight * (0.6 + 0.4 * sin(u * 9.0 + uTime * 0.5 + k * 2.0));
    p = uOffset + vec3(x, v * top + sin(u * 7.0 + uTime * 0.3 + k) * 3.0, z);
    vShade = 1.0;
    vGloss = 0.0;
  }
  vUV = aUV;
  gl_Position = uVp * vec4(p, 1.0);
}
`;

const RIBBON_FS = `
precision highp float;
varying vec2 vUV;
varying float vShade;
varying float vGloss;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAlpha;
uniform float uMode;
uniform float uTime;
uniform float uIndex;
${NOISE_GLSL}
void main() {
  if (uMode < 0.5) {
    vec3 col = mix(uColorA, uColorB, 0.5 + 0.5 * sin(vUV.x * 6.2831853 * 2.0 + uIndex * 1.3));
    float edge = smoothstep(0.0, 0.12, vUV.y) * smoothstep(1.0, 0.88, vUV.y);
    col = col * (0.35 + 0.8 * vShade) + vGloss * 0.55;
    float lines = 0.85 + 0.15 * sin(vUV.y * 60.0);
    gl_FragColor = vec4(col * lines, uAlpha * (0.35 + 0.65 * edge));
  } else {
    float rays = 0.45 + 0.55 * vnoise(vec2(vUV.x * 70.0 + uTime * 0.5, uIndex * 3.0 + uTime * 0.05));
    float fold = 0.6 + 0.4 * sin(vUV.x * 22.0 + uTime * 0.7 + uIndex * 2.0);
    float fade = pow(1.0 - vUV.y, 1.5) * smoothstep(0.0, 0.07, vUV.y) * smoothstep(0.0, 0.1, vUV.x) * smoothstep(1.0, 0.9, vUV.x);
    vec3 col = mix(uColorA, uColorB, smoothstep(0.2, 0.95, vUV.y));
    gl_FragColor = vec4(col, rays * fold * fade * uAlpha);
  }
}
`;

const PROGRAMS = {
  sky: { vs: SKY_VS, fs: SKY_FS, attribs: ['aPos'] },
  terrain: { vs: TERRAIN_VS, fs: TERRAIN_FS, attribs: ['aXZ'] },
  water: { vs: WATER_VS, fs: WATER_FS, attribs: ['aXZ'] },
  points: { vs: POINTS_VS, fs: POINTS_FS, attribs: ['aSeed'] },
  mesh: { vs: MESH_VS, fs: MESH_FS, attribs: ['aPos', 'aNormal', 'aColor', 'aSway', 'aWin', 'aRoot'] },
  ribbon: { vs: RIBBON_VS, fs: RIBBON_FS, attribs: ['aUV'] },
};

const ZERO3 = [0, 0, 0];
const ONE3 = [1, 1, 1];
const FAR_LIGHT = [0, -1000, 0];

/** Values used when a scene leaves a uniform out. */
const DEFAULTS = {
  sky: {
    uZenith: [0.2, 0.4, 0.8], uHorizon: [0.8, 0.85, 0.9], uGround: [0.3, 0.3, 0.3], uSun: [0, 0.4, -0.9], uSunColor: [1, 0.95, 0.85],
    uCloudColor: [1, 1, 1], uNebA: [0.5, 0.3, 0.9], uNebB: [0.2, 0.6, 1], uBand: [0.3, 0.2, 0.93], uRetroColor: [1, 0.2, 0.6], uWind: [0.02, 0.008],
    uSunSize: 0.035, uGlow: 1, uClouds: 0, uStars: 0, uMilky: 0, uNebula: 0, uTime: 0, uSpin: 0, uRetro: 0, uFlash: 0, uHaze: 0.25, uSpace: 0, uMirror: 0,
  },
  terrain: {
    uOrigin: [0, 0], uSpan: 400, uStep: 1, uMode: 0, uAmp: 10, uFreq: 0.03, uSeed: [0, 0], uShape: [0, 0, 0, 0],
    uSun: [0, 0.6, -0.8], uSunColor: [1, 0.95, 0.85], uAmbient: [0.35, 0.38, 0.45], uLow: [0.4, 0.5, 0.3], uMid: [0.3, 0.45, 0.25], uHigh: [0.45, 0.42, 0.4],
    uPeak: [0.95, 0.96, 0.98], uFog: [0.7, 0.75, 0.8], uLineColor: ZERO3, uLightPos: FAR_LIGHT, uLightColor: ZERO3, uBands: [0, 8, 20, 1.5],
    uFogRange: [60, 180], uLines: 0, uLineGap: 4, uClip: -1e6, uTime: 0, uAlpha: 1, uSparkle: 0,
  },
  water: {
    uOrigin: [0, 0], uWaveDir: [1, 0.3], uSpan: 300, uLevel: 0, uTime: 0, uWave: 0.5, uWaveScale: 1,
    uSun: [0, 0.6, -0.8], uSunColor: [1, 0.95, 0.85], uDeep: [0.02, 0.1, 0.18], uShallow: [0.05, 0.25, 0.3], uZenith: [0.2, 0.4, 0.8], uHorizon: [0.8, 0.85, 0.9],
    uFog: [0.7, 0.75, 0.8], uFogRange: [60, 180], uSpec: 1, uShine: 200, uFoam: 9, uMirror: 0, uRipple: 0,
  },
  points: {
    uCenter: ZERO3, uBox: [40, 20, 40], uVel: ZERO3, uWobble: ZERO3, uTime: 0, uWobbleFreq: 1, uSize: 0.2, uMaxSize: 64, uTwinkle: 0, uBlink: 0, uSwirl: 0,
    uRise: 0, uLane: 0, uLaneY: 0.3, uFadeFar: 1e5, uColorA: ONE3, uColorB: ONE3, uShape: 0, uAlpha: 1,
  },
  mesh: {
    uModel: null, uTime: 0, uWind: 0, uGround: 0, uMinGround: -1e6, uMode: 0, uAmp: 10, uFreq: 0.03, uSeed: [0, 0], uShape: [0, 0, 0, 0],
    uSun: [0, 0.6, -0.8], uSunColor: [1, 0.95, 0.85], uAmbient: [0.35, 0.38, 0.45], uFog: [0.7, 0.75, 0.8], uTint: ONE3, uWinColor: [1, 0.8, 0.5],
    uLightPos: FAR_LIGHT, uLightColor: ZERO3, uRim: ZERO3, uFogRange: [60, 180], uWindows: 0, uEmit: 0, uAlpha: 1, uClip: -1e6,
  },
  ribbon: {
    uOffset: ZERO3, uSun: [0, 0.6, -0.8], uTime: 0, uIndex: 0, uMode: 0, uLen: 200, uWidth: 2, uHeight: 40, uRadius: 10,
    uColorA: ONE3, uColorB: ONE3, uAlpha: 1,
  },
};

/** The terrain uniforms a scene describes as { mode, amp, freq, seed, shape }. */
export function terrainUniforms(t) {
  return { uMode: t.mode ?? 0, uAmp: t.amp ?? 10, uFreq: t.freq ?? 0.03, uSeed: t.seed ?? [0, 0], uShape: t.shape ?? [0, 0, 0, 0] };
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

// Compiling and linking only queue the work. The first status query waits for
// it, so startLink returns at once and finishLink is where a broken shader throws.
function startLink(gl, vs, fs, attribs) {
  const a = compile(gl, gl.VERTEX_SHADER, vs);
  const b = compile(gl, gl.FRAGMENT_SHADER, fs);
  const handle = gl.createProgram();
  gl.attachShader(handle, a);
  gl.attachShader(handle, b);
  attribs.forEach((name, i) => gl.bindAttribLocation(handle, i, name));
  gl.linkProgram(handle);
  return { handle, attribs, uniforms: new Map(), shaders: [a, b] };
}

function finishLink(gl, prog) {
  if (!gl.getProgramParameter(prog.handle, gl.LINK_STATUS)) {
    const [a, b] = prog.shaders;
    const log = gl.getShaderInfoLog(a) || gl.getShaderInfoLog(b) || gl.getProgramInfoLog(prog.handle);
    throw new Error(log || 'link');
  }
  for (const shader of prog.shaders) gl.deleteShader(shader);
  delete prog.shaders;
  return prog;
}

// ── matrices (column-major, like WebGL)
export function lookAt(out, eye, center, up = [0, 1, 0]) {
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

export function perspective(out, fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function multiply(out, a, b) {
  const r = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      r[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    }
  }
  out.set(r);
  return out;
}

/** Translate, turn (yaw about y, then pitch about x, then roll about z) and scale. */
export function modelMatrix(out, pos, yaw = 0, pitch = 0, roll = 0, scale = 1) {
  const cy = Math.cos(yaw); const sy = Math.sin(yaw);
  const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const cr = Math.cos(roll); const sr = Math.sin(roll);
  // R = Ry * Rx * Rz
  const m00 = cy * cr + sy * sp * sr; const m01 = -cy * sr + sy * sp * cr; const m02 = sy * cp;
  const m10 = cp * sr; const m11 = cp * cr; const m12 = -sp;
  const m20 = -sy * cr + cy * sp * sr; const m21 = sy * sr + cy * sp * cr; const m22 = cy * cp;
  out[0] = m00 * scale; out[1] = m10 * scale; out[2] = m20 * scale; out[3] = 0;
  out[4] = m01 * scale; out[5] = m11 * scale; out[6] = m21 * scale; out[7] = 0;
  out[8] = m02 * scale; out[9] = m12 * scale; out[10] = m22 * scale; out[11] = 0;
  out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
  return out;
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class Kit {
  constructor(gl) {
    this.gl = gl;
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    this.programs = new Map();
    this.enabled = 0;
    this.view = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.vp = new Float32Array(16);
    this.skyVp = new Float32Array(16);
    this.mirrorVp = new Float32Array(16);
    this.mirrorSkyVp = new Float32Array(16);
    this.model = new Float32Array(16);
    this.eye = [0, 0, 0];
    this.aspect = 1;
    this.height = 1;
    this.mirroring = false;
    this.dome = this.indexed(domeArrays(), 3);
    this.terrainGrid = this.indexed(gridArrays(161), 2);
    this.waterGrid = this.indexed(gridArrays(121), 2);
    this.ribbonStrip = this.indexed(stripArrays(240, 2), 2);
    this.curtainStrip = this.indexed(stripArrays(200, 10), 2);
  }

  program(name) {
    let prog = this.programs.get(name);
    if (!prog) {
      const def = PROGRAMS[name];
      prog = startLink(this.gl, def.vs, def.fs, def.attribs);
      this.programs.set(name, prog);
    }
    return prog.shaders ? finishLink(this.gl, prog) : prog;
  }

  /** Queue every program now, so the first frame of any scene does not stall. */
  warm() {
    for (const [name, def] of Object.entries(PROGRAMS)) {
      if (!this.programs.has(name)) this.programs.set(name, startLink(this.gl, def.vs, def.fs, def.attribs));
    }
  }

  /**
   * True once every queued program is linked. With KHR_parallel_shader_compile
   * the driver compiles off the main thread and this never waits; without it
   * there is nothing to ask, so the first draw takes the wait instead.
   */
  ready() {
    if (!this.parallel) return true;
    for (const prog of this.programs.values()) {
      if (prog.shaders && !this.gl.getProgramParameter(prog.handle, this.parallel.COMPLETION_STATUS_KHR)) return false;
    }
    return true;
  }

  indexed({ pos, idx }, size) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    const elements = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    return { buffer, elements, count: idx.length, size };
  }

  /** Upload a MeshBuilder's triangles. */
  mesh(builder) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, builder.floats(), gl.STATIC_DRAW);
    return { buffer, count: builder.count };
  }

  /** Upload particle seeds (4 floats each). */
  cloud(data) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer, count: data.length / 4 };
  }

  release(item) {
    if (item?.buffer) this.gl.deleteBuffer(item.buffer);
    if (item?.elements) this.gl.deleteBuffer(item.elements);
  }

  /** Point the camera. `level` is the water height the mirror pass reflects about. */
  camera(eye, target, { fov = 0.9, near = 0.3, far = 3000, level = 0, roll = 0 } = {}) {
    // Roll turns "up" about the line of sight.
    let up = [0, 1, 0];
    if (roll) {
      const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
      const r = [-f[2], 0, f[0]];
      const len = Math.hypot(r[0], r[2]) || 1;
      up = [(r[0] / len) * Math.sin(roll), Math.cos(roll), (r[2] / len) * Math.sin(roll)];
    }
    this.eye = eye;
    lookAt(this.view, eye, target, up);
    perspective(this.proj, fov, this.aspect, near, far);
    multiply(this.vp, this.proj, this.view);
    const rot = new Float32Array(this.view);
    rot[12] = 0; rot[13] = 0; rot[14] = 0;
    multiply(this.skyVp, this.proj, rot);
    // Mirror about y = level: the world below the water, seen from above.
    const mirror = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * level, 0, 1]);
    multiply(this.mirrorVp, this.vp, mirror);
    const flip = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    multiply(this.mirrorSkyVp, this.skyVp, flip);
    this.level = level;
    // Pixels per world unit at distance 1, for particle sizes.
    this.screen = (this.height * this.proj[5]) / 2;
  }

  use(name, uniforms) {
    const gl = this.gl;
    const prog = this.program(name);
    gl.useProgram(prog.handle);
    const values = { ...DEFAULTS[name], ...uniforms };
    for (const [key, value] of Object.entries(values)) {
      if (value == null) continue;
      let loc = prog.uniforms.get(key);
      if (loc === undefined) {
        loc = gl.getUniformLocation(prog.handle, key);
        prog.uniforms.set(key, loc);
      }
      if (loc == null) continue;
      if (typeof value === 'number') gl.uniform1f(loc, value);
      else if (value.length === 16) gl.uniformMatrix4fv(loc, false, value);
      else if (value.length === 4) gl.uniform4fv(loc, value);
      else if (value.length === 3) gl.uniform3fv(loc, value);
      else if (value.length === 2) gl.uniform2fv(loc, value);
      else gl.uniform1f(loc, value[0]);
    }
    return prog;
  }

  attribs(count) {
    const gl = this.gl;
    for (let i = this.enabled; i < count; i++) gl.enableVertexAttribArray(i);
    for (let i = count; i < this.enabled; i++) gl.disableVertexAttribArray(i);
    this.enabled = count;
  }

  drawIndexed(geo) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.buffer);
    this.attribs(1);
    gl.vertexAttribPointer(0, geo.size, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.elements);
    gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_SHORT, 0);
  }

  blend(mode) {
    const gl = this.gl;
    if (!mode) { gl.disable(gl.BLEND); return; }
    gl.enable(gl.BLEND);
    if (mode === 'add') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Clear and set the state every frame starts from. */
  begin(color) {
    const gl = this.gl;
    gl.clearColor(color[0], color[1], color[2], 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);
    gl.depthFunc(gl.LEQUAL);
  }

  /** Start drawing the world upside down under the water. End with `endMirror()`. */
  beginMirror() {
    this.mirroring = true;
  }

  endMirror() {
    this.mirroring = false;
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
  }

  sky(u) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.blend(null);
    this.use('sky', { ...u, uVp: this.mirroring ? this.mirrorSkyVp : this.skyVp, uMirror: this.mirroring ? 1 : 0 });
    this.drawIndexed(this.dome);
    gl.depthMask(true);
  }

  /** `t` describes the ground ({ mode, amp, freq, seed, shape }); `u` colours and light. */
  terrain(t, u = {}) {
    const gl = this.gl;
    const span = u.uSpan ?? DEFAULTS.terrain.uSpan;
    const cell = span / 160;
    const origin = u.uOrigin ?? [Math.round(this.eye[0] / cell) * cell, Math.round(this.eye[2] / cell) * cell];
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    this.blend(null);
    this.use('terrain', {
      ...terrainUniforms(t), uStep: cell * 0.5, ...u, uOrigin: origin,
      uVp: this.mirroring ? this.mirrorVp : this.vp, uCam: this.eye,
      uClip: this.mirroring ? this.level - 0.05 : (u.uClip ?? -1e6),
    });
    this.drawIndexed(this.terrainGrid);
  }

  water(u = {}) {
    const gl = this.gl;
    const span = u.uSpan ?? DEFAULTS.water.uSpan;
    const cell = span / 120;
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    this.blend(u.uMirror ? 'alpha' : null);
    this.use('water', {
      ...u, uOrigin: [Math.round(this.eye[0] / cell) * cell, Math.round(this.eye[2] / cell) * cell],
      uVp: this.vp, uCam: this.eye, uLevel: u.uLevel ?? this.level,
    });
    this.drawIndexed(this.waterGrid);
    this.blend(null);
  }

  /** Lit triangles. `ground` lifts each vertex onto terrain `t`. */
  solid(geo, u = {}, { ground = null, model = IDENTITY, blend = null } = {}) {
    if (!geo?.count) return;
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(!blend);
    this.blend(blend);
    this.use('mesh', {
      ...(ground ? { ...terrainUniforms(ground), uGround: 1 } : { uGround: 0 }), ...u, uModel: model,
      uVp: this.mirroring ? this.mirrorVp : this.vp, uCam: this.eye,
      uClip: this.mirroring ? this.level - 0.05 : (u.uClip ?? -1e6),
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.buffer);
    this.attribs(6);
    const bytes = STRIDE * 4;
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bytes, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bytes, 12);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bytes, 24);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, bytes, 36);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, bytes, 40);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, bytes, 44);
    gl.drawArrays(gl.TRIANGLES, 0, geo.count);
    gl.depthMask(true);
    this.blend(null);
  }

  /** A particle cloud. `blend` is 'add' for light, 'alpha' for things that cover. */
  points(cloud, u = {}, { blend = 'add', depth = true } = {}) {
    if (!cloud?.count) return;
    const gl = this.gl;
    if (depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.blend(blend);
    this.use('points', { ...u, uVp: this.mirroring ? this.mirrorVp : this.vp, uCam: this.eye, uScreen: this.screen, uMaxSize: Math.min(u.uMaxSize ?? 64, this.maxPoint ?? 64) });
    gl.bindBuffer(gl.ARRAY_BUFFER, cloud.buffer);
    this.attribs(1);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, cloud.count);
    gl.depthMask(true);
    this.blend(null);
    gl.enable(gl.DEPTH_TEST);
  }

  /** A silk ribbon (mode 0) or an aurora curtain (mode 1). */
  ribbon(u = {}, { blend = 'alpha' } = {}) {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.blend(blend);
    this.use('ribbon', { ...u, uVp: this.mirroring ? this.mirrorVp : this.vp });
    this.drawIndexed(u.uMode ? this.curtainStrip : this.ribbonStrip);
    gl.depthMask(true);
    this.blend(null);
  }
}
