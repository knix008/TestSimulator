// Infinite 5×5 ground grid for the 3D axes. A full-screen quad whose fragment
// shader rebuilds the view ray, hits the plane z = z0 (world), turns the hit
// point into data coordinates and draws minor / major (every 5th) lines
// analytically with fwidth() anti-aliasing. The minor step adapts per pixel in
// powers of 5 with a smooth cross-fade, and the grid fades with distance and
// grazing angle, so it reaches the horizon at any camera angle and zoom.
// Writes gl_FragDepth so data in front of / behind the plane occludes correctly.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform mat4 uInvViewProj;
uniform mat4 uViewProj;
uniform vec2 uResolution;      // device px
uniform float uZ0;             // plane height (world)
uniform vec2 uScale;           // data-per-world for x, y (sign = direction)
uniform vec2 uOffset;          // data value at world 0
uniform float uBase;           // base minor step (data units)
uniform float uMinPx;          // minimum minor spacing (px)
uniform vec3 uColor;
uniform vec3 uAxisColor;
uniform float uMinorAlpha;
uniform float uMajorAlpha;
uniform vec3 uTarget;          // world centre the fade is measured from
uniform float uFadeStart;
uniform float uFadeEnd;

float lineAt(vec2 p, vec2 fw, float s) {
  vec2 q = p / s;
  vec2 w = max(fw / s, vec2(1e-6));
  vec2 g = abs(fract(q - 0.5) - 0.5) / w;
  vec2 l = 1.0 - min(g, vec2(1.0));
  // lines closer than a few pixels are mush: fade each direction on its own
  vec2 dens = clamp(1.0 - w * 3.0, 0.0, 1.0);
  return max(l.x * dens.x, l.y * dens.y);
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  vec4 n4 = uInvViewProj * vec4(ndc, -1.0, 1.0);
  vec4 f4 = uInvViewProj * vec4(ndc, 1.0, 1.0);
  vec3 nearP = n4.xyz / n4.w;
  vec3 farP = f4.xyz / f4.w;
  vec3 dir = farP - nearP;
  if (abs(dir.z) < 1e-9) discard;
  float t = (uZ0 - nearP.z) / dir.z;
  if (t < 0.0) discard;
  vec3 hit = nearP + dir * t;

  vec2 p = uOffset + uScale * hit.xy;           // data coordinates
  vec2 fw = fwidth(p);
  float foot = max(sqrt(fw.x * fw.y), 1e-30);
  float lod = log(foot * uMinPx / uBase) / log(5.0);
  float k = ceil(lod);
  float a0 = clamp(k - lod, 0.0, 1.0);          // finest level fades in as it opens up
  float s0 = uBase * pow(5.0, k);
  float l0 = lineAt(p, fw, s0);
  float l1 = lineAt(p, fw, s0 * 5.0);
  float l2 = lineAt(p, fw, s0 * 25.0);
  float alpha = max(max(l0 * uMinorAlpha * a0, l1 * mix(uMinorAlpha, uMajorAlpha, a0)), l2 * uMajorAlpha);

  // axis lines (data x = 0 and y = 0)
  vec2 ag = abs(p) / max(fw, vec2(1e-30));
  float ax = 1.0 - min(ag.y / 1.2, 1.0);      // x axis: y == 0
  float ay = 1.0 - min(ag.x / 1.2, 1.0);      // y axis: x == 0
  float axisA = max(ax, ay) * min(1.0, uMajorAlpha * 2.2);
  vec3 col = uColor;
  if (axisA > alpha) { col = uAxisColor; alpha = axisA; }

  // fade toward the horizon and at grazing angles
  float dist = length(hit.xy - uTarget.xy);
  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
  float graze = smoothstep(0.02, 0.3, abs(normalize(dir).z));
  alpha *= fade * graze;
  if (alpha < 0.004) discard;

  vec4 clip = uViewProj * vec4(hit, 1.0);
  float depth = clip.z / clip.w * 0.5 + 0.5;
  gl_FragDepth = clamp(depth - 2e-6, 0.0, 0.999999);
  gl_FragColor = vec4(col, alpha);
}`;

export function createGroundGrid() {
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    uniforms: {
      uInvViewProj: { value: new THREE.Matrix4() },
      uViewProj: { value: new THREE.Matrix4() },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uZ0: { value: 0 },
      uScale: { value: new THREE.Vector2(1, 1) },
      uOffset: { value: new THREE.Vector2(0, 0) },
      uBase: { value: 0.1 },
      uMinPx: { value: 10 },
      uColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uAxisColor: { value: new THREE.Color(0.3, 0.8, 0.95) },
      uMinorAlpha: { value: 0.12 },
      uMajorAlpha: { value: 0.28 },
      uTarget: { value: new THREE.Vector3() },
      uFadeStart: { value: 2 },
      uFadeEnd: { value: 8 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 50;
  return mesh;
}

/** Updates the per-frame uniforms from the camera. */
export function updateGroundGrid(mesh, camera, devW, devH) {
  const u = mesh.material.uniforms;
  camera.updateMatrixWorld();
  u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  u.uInvViewProj.value.copy(u.uViewProj.value).invert();
  u.uResolution.value.set(devW, devH);
}
