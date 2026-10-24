// Guides of the 3D view: an "infinite" grid on the z = 0 plane (a shader on a
// huge quad: minor and major lines whose spacing follows the camera distance,
// fading out towards the horizon) and the x, y, z axes with ticks and labels in
// the chosen length unit, re-ticked as you zoom. Both draw before the model and
// do not write depth, so the bodies always cover them; the labels are depth-tested too, so a body in front
// hides them instead of the label covering the body.
import * as THREE from 'three';
import { LENGTH_UNITS } from '../core/settings.js';
import { formatValue } from '../core/colormap.js';

/** A nice step (1, 2 or 5 × 10ⁿ in the display unit) about `target` mm, returned in mm. */
export function niceStep(target, unit = 'mm') {
  const factor = LENGTH_UNITS[unit] ?? 1;
  const raw = Math.max(1e-9, target / factor);
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw * 0.999) * factor;
}

export class SceneGuides {
  constructor(scene) {
    this.scene = scene;
    this.grid = this.makeGrid();
    this.axes = new THREE.Group();
    // No group order here: three.js sorts by a group's renderOrder before its children's, which would put
    // the whole grid after (over) the tick numbers.
    scene.add(this.grid, this.axes);
    this.labelCache = new Map();
    this.key = '';
  }

  makeGrid() {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Pushed back in depth so faces lying on z = 0 (flat 2D models, slab bottoms) win and the grid never shows through them.
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 4,
      uniforms: {
        uMinor: { value: 10 },
        uMajor: { value: 50 },
        uMinorColor: { value: new THREE.Color('#3a4656') },
        uMajorColor: { value: new THREE.Color('#5d6d82') },
        uCenter: { value: new THREE.Vector2(0, 0) },
        uFade: { value: 1000 },
      },
      vertexShader: `
        varying vec2 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xy;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        uniform float uMinor; uniform float uMajor; uniform vec3 uMinorColor; uniform vec3 uMajorColor;
        uniform vec2 uCenter; uniform float uFade;
        varying vec2 vWorld;
        float lineAt(float spacing) {
          vec2 c = vWorld / spacing;
          vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }
        void main() {
          float minor = lineAt(uMinor);
          float major = lineAt(uMajor);
          float fade = 1.0 - smoothstep(uFade * 0.35, uFade, distance(vWorld, uCenter));
          vec3 color = mix(uMinorColor, uMajorColor, major);
          float alpha = max(minor * 0.55, major * 0.9) * fade;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color, alpha);
        }`,
    });
    material.extensions = { derivatives: true };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.renderOrder = -10;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** A canvas-texture sprite for a tick label (cached by text and colour). */
  label(text, color, size, center = null) {
    const key = `${text}|${color}`;
    let texture = this.labelCache.get(key);
    if (!texture) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = '600 44px "Segoe UI", sans-serif';
      const w = Math.ceil(ctx.measureText(text).width) + 16;
      canvas.width = w;
      canvas.height = 60;
      ctx.font = '600 44px "Segoe UI", sans-serif';
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 8, 30);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.userData.aspect = w / 60;
      this.labelCache.set(key, texture);
    }
    // sizeAttenuation off: the label keeps its size on screen, near or far (size = share of the view height).
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, depthTest: true, transparent: true, alphaTest: 0.05, sizeAttenuation: false }));
    sprite.scale.set(size * texture.userData.aspect, size, 1);
    sprite.renderOrder = -8;
    if (center) sprite.center.set(center[0], center[1]);
    return sprite;
  }

  clearAxes() {
    for (const child of [...this.axes.children]) {
      this.axes.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }

  /**
   * Re-places the grid and the axes for the camera: called on every camera change. opts: { showGrid, showAxes,
   * unit, colors: { minor, major, text } }.
   */
  update(camera, target, opts) {
    const distance = camera.position.distanceTo(target);
    const minor = niceStep(distance / 40, opts.unit);
    const major = minor * 5;
    const extent = distance * 6;
    this.grid.visible = opts.showGrid;
    this.grid.position.set(target.x, target.y, 0);
    this.grid.scale.set(extent * 2, extent * 2, 1);
    const u = this.grid.material.uniforms;
    u.uMinor.value = minor;
    u.uMajor.value = major;
    u.uCenter.value.set(target.x, target.y);
    u.uFade.value = extent;
    if (opts.colors) {
      u.uMinorColor.value.set(opts.colors.minor);
      u.uMajorColor.value.set(opts.colors.major);
    }
    this.axes.visible = opts.showAxes;
    // The axes: rebuilt only when the step, the reach or the unit change.
    const tickStep = niceStep(distance / 8, opts.unit);
    const reach = Math.ceil((distance * 1.6) / tickStep) * tickStep;
    const key = `${tickStep}:${reach}:${opts.unit}:${opts.colors?.text}:${Math.round(target.x / tickStep)}:${Math.round(target.y / tickStep)}`;
    if (!opts.showAxes || key === this.key) return;
    this.key = key;
    this.clearAxes();
    const factor = LENGTH_UNITS[opts.unit] ?? 1;
    const tick = tickStep * 0.12;
    const labelSize = 0.026;
    const axes = [
      // name, direction, colour, side of the ticks, anchor of the tick labels (sprite centre: they sit off the axis)
      ['x', new THREE.Vector3(1, 0, 0), '#ff5a5a', new THREE.Vector3(0, -1, 0), [0.5, 1]],
      ['y', new THREE.Vector3(0, 1, 0), '#4fd16a', new THREE.Vector3(-1, 0, 0), [1, 0.5]],
      ['z', new THREE.Vector3(0, 0, 1), '#4f8dff', new THREE.Vector3(-1, -1, 0).normalize(), [1, 0.5]],
    ];
    for (const [name, dir, color, side, anchor] of axes) {
      const from = dir.clone().multiplyScalar(name === 'z' ? 0 : -reach);
      const to = dir.clone().multiplyScalar(reach);
      const positions = [from.x, from.y, from.z, to.x, to.y, to.z];
      // Ticks every step (longer every fifth), with a label at each labelled step.
      for (let v = name === 'z' ? tickStep : -reach; v <= reach + 1e-9; v += tickStep) {
        if (Math.abs(v) < tickStep * 1e-6) continue;
        const p = dir.clone().multiplyScalar(v);
        const big = Math.abs(Math.round(v / tickStep) % 5) === 0;
        const q = p.clone().add(side.clone().multiplyScalar(big ? tick * 2 : tick));
        positions.push(p.x, p.y, p.z, q.x, q.y, q.z);
        const sprite = this.label(`${formatValue(v / factor)} ${opts.unit}`, opts.colors?.text ?? '#cfd8e3', labelSize, anchor);
        sprite.position.copy(p.clone().add(side.clone().multiplyScalar(tick * 2.5)));
        this.axes.add(sprite);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, depthWrite: false, transparent: true, opacity: 0.95 }));
      line.renderOrder = -9;
      this.axes.add(line);
      // The axis name sits past the end of the axis, beside it (anchored at its left edge, slightly above).
      const head = this.label(name.toUpperCase(), color, labelSize * 1.3, [0, 0]);
      head.position.copy(to.clone().add(dir.clone().multiplyScalar(tickStep * 0.3)));
      this.axes.add(head);
    }
  }
}
