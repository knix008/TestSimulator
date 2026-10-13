// The start page's moving background: a model (meshing gears) moving in 3D
// behind the page (three.js, loaded only when the start page shows). It
// pauses while the start page is hidden or the window is in the background;
// with reduced motion asked for, only the view stops orbiting.

const PALETTE = ['#e8a53a', '#3a6cf0', '#2fa36b', '#c9576f', '#8a6cf0', '#20a4b8', '#d9822b', '#5d7fa3'];

export class StartBackground {
  constructor(host) {
    this.host = host;
    this.running = false;
    this.frame = 0;
    this.last = 0;
    this.angle = 0.6;
  }

  /** meshes: [{ tris: [[[x, y, z] × 3]] }] in mm; colors: { background, ink }. */
  async show(meshes, colors) {
    const THREE = await import('three');
    this.THREE = THREE;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.renderer.domElement.className = 'start-bg-canvas';
      this.host.append(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(32, 1, 1, 100000);
      this.camera.up.set(0, 0, 1);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(1, -1.5, 2.2);
      this.scene.add(sun);
      this.group = new THREE.Group();
      this.scene.add(this.group);
      new ResizeObserver(() => this.resize()).observe(this.host);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else if (this.wanted) this.start(); });
    }
    this.group.clear();
    this.spinners = [];
    const box = new THREE.Box3();
    meshes.forEach((mesh, i) => {
      const positions = new Float32Array(mesh.tris.length * 9);
      mesh.tris.forEach((tri, t) => tri.forEach((p, j) => positions.set(p, t * 9 + j * 3)));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const solid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: mesh.color ?? PALETTE[i % PALETTE.length], metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), new THREE.LineBasicMaterial({ color: 0x1d2433, transparent: true, opacity: 0.35 }));
      // Each part turns about its own axis (pivot) at its own rate (rad/s).
      const pivot = new THREE.Group();
      pivot.position.set(mesh.pivot?.x ?? 0, mesh.pivot?.y ?? 0, 0);
      pivot.add(solid, edges);
      this.group.add(pivot);
      if (mesh.rate) this.spinners.push({ pivot, rate: mesh.rate });
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox.clone().translate(pivot.position));
    });
    // Centred on the origin, so the view orbits about the middle of the model.
    const centre = box.getCenter(new THREE.Vector3());
    this.group.position.set(-centre.x, -centre.y, -box.min.z);
    this.radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    if (this.grid) this.scene.remove(this.grid);
    this.grid = new THREE.GridHelper(this.radius * 6, 24, 0x8894aa, 0x8894aa);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.18;
    this.scene.add(this.grid);
    this.setColors(colors);
    this.resize();
    this.wanted = true;
    this.start();
  }

  setColors({ background = '#f4f6fb' } = {}) {
    if (!this.renderer) return;
    const THREE = this.THREE;
    this.renderer.setClearColor(new THREE.Color(background));
    this.scene.fog = new THREE.Fog(new THREE.Color(background), this.radius * 4, this.radius * 12);
    if (!this.running) this.draw();
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // The picture is shifted right and up: the model turns in the open space beside the title, not under the cards.
    this.camera.setViewOffset(w, h, -w * 0.24, h * 0.02, w, h);
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  draw(time = 0) {
    if (!this.renderer || !this.radius) return;
    // A slow orbit with a gentle rise and fall.
    const d = this.radius * 3.3;
    const elevation = 0.5 + Math.sin(time / 9000) * 0.08;
    this.camera.position.set(Math.cos(this.angle) * d * Math.cos(elevation), Math.sin(this.angle) * d * Math.cos(elevation), d * Math.sin(elevation) + this.radius * 0.2);
    this.camera.lookAt(0, 0, this.radius * 0.25);
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running || !this.renderer) return;
    // The gears always turn; with "reduced motion" asked for, the view itself holds still.
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.running = true;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = (now - this.last) / 1000;
      if (!still) this.angle += dt * 0.08;
      for (const spinner of this.spinners ?? []) spinner.pivot.rotation.z += dt * spinner.rate;
      this.last = now;
      this.draw(now);
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
