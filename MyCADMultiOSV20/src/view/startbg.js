// The start page's moving background: a CAD model turning behind the page
// (three.js, loaded only when the start page shows). Transparency and the
// camera / part speeds come from settings. It pauses while the start page
// is hidden or the window is in the background. Reduced motion holds still.

import { sceneItems } from './startscenes.js';

const FINISH = {
  steel: ['#8d97a6', 0.62, 0.34],
  aluminum: ['#d5dbe3', 0.72, 0.28],
  brass: ['#e0a84a', 0.74, 0.3],
  blue: ['#3d6fe8', 0.45, 0.38],
  dark: ['#2c3442', 0.5, 0.46],
  copper: ['#c86a4a', 0.68, 0.32],
  green: ['#2f9d6a', 0.42, 0.4],
};

const finish = (color) => FINISH[color] ?? [color || '#8d97a6', 0.5, 0.38];

export class StartBackground {
  constructor(host) {
    this.host = host;
    this.running = false;
    this.frame = 0;
    this.last = 0;
    this.angle = 0.6;
    this.bob = 0;
    this.spinTime = 0;
    this.movers = [];
    this.ready = false;
  }

  /** Applies the current start-screen settings. The first call loads three.js. */
  configure(options) {
    this.options = options;
    if (this.ready) {
      this.apply();
      return Promise.resolve();
    }
    if (!this.bootPromise) this.bootPromise = this.boot();
    return this.bootPromise.then(() => this.apply());
  }

  async boot() {
    const THREE = await import('three');
    this.THREE = THREE;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.domElement.className = 'start-bg-canvas';
    this.host.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 100000);
    this.camera.up.set(0, 0, 1);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.55);
    sun.position.set(1, -1.4, 2.4);
    this.scene.add(sun);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    new ResizeObserver(() => this.resize()).observe(this.host);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else if (this.wanted) this.start(); });
    this.ready = true;
  }

  apply() {
    const options = this.options;
    if (!options || !this.ready) return;
    const background = options.colors?.background || '#f4f6fb';
    const scene = options.scene || 'gears';
    const sig = `${scene}|${options.transparency}|${options.motion}|${options.camera}|${options.objects}|${background}`;
    if (sig === this.sig && this.mounted) {
      this.wanted = true;
      this.start();
      return;
    }
    const sceneChanged = this.sceneId !== scene || !this.mounted;
    this.sig = sig;
    this.motion = Number.isFinite(Number(options.motion)) ? Number(options.motion) : 20;
    this.cameraChannel = Number.isFinite(Number(options.camera)) ? Number(options.camera) : 100;
    this.objectChannel = Number.isFinite(Number(options.objects)) ? Number(options.objects) : 100;
    const transparency = Math.min(100, Math.max(0, Number(options.transparency) || 0));
    this.host.style.opacity = String(1 - transparency / 100);
    if (sceneChanged) {
      this.sceneId = scene;
      this.mount(sceneItems(scene));
      this.mounted = true;
    }
    this.setColors({ background });
    this.wanted = true;
    this.start();
  }

  makeParts(item) {
    const THREE = this.THREE;
    let geometry;
    if (item.shape === 'box') geometry = new THREE.BoxGeometry(item.w, item.d, item.h);
    else if (item.shape === 'cyl') {
      geometry = new THREE.CylinderGeometry(item.r, item.r2 ?? item.r, item.h, item.seg ?? 28);
      if (item.axis === 'x') geometry.rotateZ(Math.PI / 2);
      else if (item.axis !== 'y') geometry.rotateX(Math.PI / 2);
    } else if (item.shape === 'torus') geometry = new THREE.TorusGeometry(item.r, item.tube, 12, 32);
    else if (item.shape === 'sphere') geometry = new THREE.SphereGeometry(item.r, 18, 14);
    else if (item.shape === 'coil' || item.shape === 'arc') {
      const pts = [];
      let tubular = 24;
      if (item.shape === 'coil') {
        tubular = Math.max(16, item.turns * 16);
        const height = item.turns * item.pitch;
        for (let i = 0; i <= tubular; i += 1) {
          const t = i / tubular;
          const a = t * item.turns * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * item.r, Math.sin(a) * item.r, t * height - height / 2));
        }
      } else {
        const sweep = item.sweep ?? Math.PI / 2;
        const a0 = item.a0 ?? 0;
        for (let i = 0; i <= tubular; i += 1) {
          const a = a0 + (i / tubular) * sweep;
          pts.push(new THREE.Vector3(Math.cos(a) * item.r, Math.sin(a) * item.r, 0));
        }
      }
      geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), tubular, item.tube, 8, false);
    } else if (item.shape === 'mesh' && item.tris?.length) {
      const positions = new Float32Array(item.tris.length * 9);
      item.tris.forEach((tri, index) => tri.forEach((p, corner) => positions.set(p, index * 9 + corner * 3)));
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
    } else return [];
    if (item.rx) geometry.rotateX(item.rx);
    if (item.ry) geometry.rotateY(item.ry);
    if (item.rz) geometry.rotateZ(item.rz);
    const [hex, metal, rough] = finish(item.color);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: hex, metalness: metal, roughness: rough, side: item.shape === 'mesh' ? THREE.DoubleSide : THREE.FrontSide,
    }));
    const outlined = item.shape === 'box' || item.shape === 'cyl' || item.shape === 'mesh';
    if (!outlined) return [mesh];
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, item.shape === 'cyl' ? 28 : 22),
      new THREE.LineBasicMaterial({ color: 0x1c2430, transparent: true, opacity: 0.42 }),
    );
    return [mesh, edges];
  }

  place(parent, item, origin) {
    for (const obj of this.makeParts(item)) {
      obj.position.set((item.x ?? 0) - origin.x, (item.y ?? 0) - origin.y, (item.z ?? 0) - origin.z);
      parent.add(obj);
    }
  }

  mount(items) {
    this.disposeContents();
    const THREE = this.THREE;
    const buckets = new Map();
    for (const item of items) {
      const rate = item.rate || 0;
      const slide = item.slide || null;
      if (!rate && !slide) {
        this.place(this.group, item, { x: 0, y: 0, z: 0 });
        continue;
      }
      const gx = item.gx ?? 0;
      const gy = item.gy ?? 0;
      const gz = item.gz ?? 0;
      const axis = item.spin || 'z';
      const about = item.about || '';
      const slideKey = slide ? `${slide.axis}:${slide.amp}:${slide.speed}:${slide.phase ?? 0}` : '';
      const key = `${gx}|${gy}|${gz}|${rate}|${axis}|${about}|${slideKey}`;
      if (!buckets.has(key)) buckets.set(key, { gx, gy, gz, rate, axis, about, slide, items: [] });
      buckets.get(key).items.push(item);
    }
    this.movers = [];
    for (const bucket of buckets.values()) {
      const group = new THREE.Group();
      group.position.set(bucket.gx, bucket.gy, bucket.gz);
      const slide = bucket.slide ? { ...bucket.slide, base: group.position[bucket.slide.axis] } : null;
      group.userData = { rate: bucket.rate, axis: bucket.axis, about: bucket.about, slide };
      for (const item of bucket.items) this.place(group, item, { x: bucket.gx, y: bucket.gy, z: bucket.gz });
      this.group.add(group);
      this.movers.push(group);
    }
    this.group.position.set(0, 0, 0);
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.group.traverse((obj) => {
      if (!obj.geometry) return;
      obj.geometry.computeBoundingBox();
      if (!obj.geometry.boundingBox) return;
      box.union(obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld));
    });
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(40, 40, 40));
    const centre = box.getCenter(new THREE.Vector3());
    // A turntable spin is about the middle of the model, not the world origin.
    for (const group of this.movers) {
      if (group.userData.about !== 'center') continue;
      const dx = centre.x - group.position.x;
      const dy = centre.y - group.position.y;
      group.position.x += dx;
      group.position.y += dy;
      for (const child of group.children) {
        child.position.x -= dx;
        child.position.y -= dy;
      }
      if (group.userData.slide) group.userData.slide.base = group.position[group.userData.slide.axis];
    }
    this.group.position.set(-centre.x, -centre.y, -box.min.z);
    this.radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry?.dispose();
      const mats = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
      mats.forEach((material) => material.dispose());
    }
    this.grid = new THREE.GridHelper(this.radius * 6, 24, 0x8894aa, 0x8894aa);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.18;
    this.scene.add(this.grid);
    this.resize();
  }

  disposeContents() {
    if (!this.group) return;
    this.group.traverse((obj) => {
      obj.geometry?.dispose();
      const materials = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      materials.forEach((material) => material.dispose());
    });
    this.group.clear();
    this.movers = [];
  }

  setColors({ background = '#f4f6fb' } = {}) {
    if (!this.renderer) return;
    const THREE = this.THREE;
    this.renderer.setClearColor(new THREE.Color(background), 1);
    if (this.radius) this.scene.fog = new THREE.Fog(new THREE.Color(background), this.radius * 4, this.radius * 12);
    if (!this.running) this.draw();
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // The picture sits to the right, in the open space beside the title.
    this.camera.setViewOffset(w, h, -w * 0.24, h * 0.02, w, h);
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  /** 20 is the designed pace. Each channel is a percent of that pace (100 = as designed). */
  scales() {
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) return { camera: 0, objects: 0 };
    const pace = (this.motion ?? 20) / 20;
    return {
      camera: pace * ((this.cameraChannel ?? 100) / 100),
      objects: pace * ((this.objectChannel ?? 100) / 100),
    };
  }

  draw() {
    if (!this.renderer || !this.radius) return;
    const d = this.radius * 3.3;
    const elevation = 0.5 + Math.sin(this.bob / 9) * 0.08;
    this.camera.position.set(Math.cos(this.angle) * d * Math.cos(elevation), Math.sin(this.angle) * d * Math.cos(elevation), d * Math.sin(elevation) + this.radius * 0.2);
    this.camera.lookAt(0, 0, this.radius * 0.25);
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running || !this.renderer) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      const { camera, objects } = this.scales();
      this.angle += dt * 0.08 * camera;
      this.bob += dt * camera;
      this.spinTime += dt * objects;
      for (const group of this.movers) {
        if (group.userData.rate) group.rotation[group.userData.axis] += dt * group.userData.rate * objects;
        const slide = group.userData.slide;
        if (slide) {
          const shift = objects === 0 ? 0 : Math.sin(this.spinTime * slide.speed + (slide.phase || 0)) * slide.amp;
          group.position[slide.axis] = slide.base + shift;
        }
      }
      this.last = now;
      this.draw();
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
  }
}
