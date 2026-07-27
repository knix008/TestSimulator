import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { FloorPlanBuilder } from '../builder/FloorPlanBuilder.js';

function normalizeDeg360(deg) {
  return ((Number(deg) % 360) + 360) % 360;
}

/** Map a newly read euler angle onto a continuous previous value (no ±180 jumps). */
function unwrapDeg(previous, next) {
  let value = next;
  while (value - previous > 180) value -= 360;
  while (value - previous < -180) value += 360;
  return value;
}

// Temps — never touch object.rotation.order while syncing from a quaternion:
// assigning order fires euler→quaternion and reintroduces gimbal lock / angle limits.
const _tmpEuler = new THREE.Euler();
const _tmpQuat = new THREE.Quaternion();
const _worldAxis = new THREE.Vector3();
const _WORLD_X = new THREE.Vector3(1, 0, 0);
const _WORLD_Y = new THREE.Vector3(0, 1, 0);
const _WORLD_Z = new THREE.Vector3(0, 0, 1);
const _shadowBox = new THREE.Box3();
const _shadowSize = new THREE.Vector3();
const _shadowCenter = new THREE.Vector3();
const _shadowDir = new THREE.Vector3();

/**
 * Fallback main-light offset when the scene is empty.
 * Never use the world origin (0,0,0) — that sits on the model/axes and looks broken.
 */
export const DEFAULT_LIGHT_POSITION = Object.freeze({ x: 8, y: 14, z: 6 });

export class SceneApp {
  constructor(container) {
    this.container = container;
    this.mode = 'orbit';
    this._lastPointer = { x: 0, y: 0 };
    this.builder = new FloorPlanBuilder();
    this.contentRoot = new THREE.Group();
    this.contentRoot.name = 'ContentRoot';
    this.externalRoot = new THREE.Group();
    this.externalRoot.name = 'ExternalModel';
    this.contentRoot.add(this.builder.group);
    this.contentRoot.add(this.externalRoot);
    this._contentMode = 'floorplan'; // 'floorplan' | 'model'

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x12151a);
    this.scene.fog = new THREE.Fog(0x12151a, 25, 80);
    this._theme = 'dark';

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
    this.camera.position.set(8, 10, 12);
    // Allow any camera roll; TrackballControls will update this freely.
    this.camera.up.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Trackball (not Orbit): no world-up lock, so the view can tumble a full 360°
    // over every axis — including past the poles where OrbitControls freezes yaw.
    this.orbit = new TrackballControls(this.camera, this.renderer.domElement);
    this.orbit.rotateSpeed = 3.0;
    this.orbit.zoomSpeed = 1.2;
    this.orbit.panSpeed = 0.6;
    this.orbit.staticMoving = false;
    this.orbit.dynamicDampingFactor = 0.18;
    this.orbit.minDistance = 0.2;
    this.orbit.maxDistance = 200;
    this.orbit.target.set(0, 1, 0);
    // Avoid stealing KeyS (scale shortcut) etc.
    this.orbit.keys = ['F13', 'F14', 'F15'];
    this.orbit.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    /** UI-only euler readout (quaternion is source of truth for free rotation) */
    this._rotationDeg = { x: 0, y: 0, z: 0 };
    this._eulerOrder = 'YXZ';
    this._modelMouseRotate = false;
    this._modelRotating = false;
    /** @type {null | 'x' | 'y' | 'z'} lock mouse-drag to one world axis */
    this._rotateAxisLock = null;
    this._transformToolActive = false;
    this._lightGizmo = false;

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSize(1.15);
    this.transform.setRotationSnap(null);
    // World space: red=X, green=Y, blue=Z — each ring spins a true fixed-axis 360°.
    this.transform.setSpace('world');
    this.transform.showX = true;
    this.transform.showY = true;
    this.transform.showZ = true;
    this.transform.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value && !this._modelRotating;
    });
    this.transform.addEventListener('objectChange', () => {
      if (this._lightGizmo) {
        // Keep DirectionalLight glued to the gizmo/anchor
        this._syncLightFromAnchor();
        this._onLightGizmoMove?.();
        return;
      }
      // Model is never translated — only camera orbits around it
      if (this.transform.object === this.contentRoot) {
        this.contentRoot.position.set(0, 0, 0);
      }
      if (this.transform.mode === 'rotate') {
        this._captureRotationFromObject();
      }
      this._onModelGizmoMove?.();
    });
    this.transform.addEventListener('change', () => {
      if (this._lightGizmo) this._onLightGizmoMove?.();
      else this._onModelGizmoMove?.();
    });
    this.scene.add(this.transform.getHelper());
    // Do not leave the gizmo attached to the model origin by default
    this.transform.detach();
    this._patchTransformPointerCapture();

    this._setupHelpers();
    this._setupLights();
    this.scene.add(this.contentRoot);
    this._bindEvents();
    this._syncOrbitMouseButtons();
    this._onResize();
    this._animate();
  }

  /**
   * TransformControls always captures the pointer on pointerdown, which blocks
   * TrackballControls. Only capture when a gizmo axis is actually hit.
   */
  _patchTransformPointerCapture() {
    const tc = this.transform;
    const dom = this.renderer.domElement;
    if (!tc._onPointerDown || !dom) return;

    dom.removeEventListener('pointerdown', tc._onPointerDown);
    this._onTransformPointerDown = (event) => {
      if (!tc.enabled) return;
      tc.pointerHover(tc._getPointer(event));
      if (tc.axis) {
        tc._onPointerDown(event);
      }
    };
    dom.addEventListener('pointerdown', this._onTransformPointerDown);
  }

  _syncOrbitMouseButtons() {
    if (this._modelMouseRotate) {
      // Rotate tool: left-drag spins the model; right-drag tumbles the camera
      this.orbit.noRotate = false;
      this.orbit.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    } else {
      this.orbit.noRotate = false;
      this.orbit.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }

  get contentMode() {
    return this._contentMode;
  }

  /** Root used for 3D file export (floor-plan / external model, with current transform). */
  getExportRoot() {
    return this.contentRoot;
  }

  _modelRoot() {
    return this.contentRoot;
  }

  _disposeObject(root) {
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const materials = obj.material
        ? (Array.isArray(obj.material) ? obj.material : [obj.material])
        : [];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value && value.isTexture) value.dispose();
        }
        material.dispose();
      }
    });
  }

  _clearExternalModel() {
    while (this.externalRoot.children.length) {
      const child = this.externalRoot.children.pop();
      this._disposeObject(child);
      this.externalRoot.remove(child);
    }
  }

  _disposePlanTexture() {
    if (this._planObjectUrl) {
      URL.revokeObjectURL(this._planObjectUrl);
      this._planObjectUrl = null;
    }
    if (this._planTexture) {
      this._planTexture.dispose();
      this._planTexture = null;
    }
  }

  /**
   * Load a floor-plan image onto the canvas (2D plane) before conversion.
   * @param {File | Blob} file
   */
  async showPlanImage(file) {
    if (!file) return;
    const wasLightGizmo = this._lightGizmo;
    this.builder.clear();
    this._clearExternalModel();
    this._disposePlanTexture();

    const objectUrl = URL.createObjectURL(file);
    this._planObjectUrl = objectUrl;

    const texture = await new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        objectUrl,
        (tex) => resolve(tex),
        undefined,
        (err) => reject(err || new Error('Failed to load plan image')),
      );
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy?.() || 1);
    this._planTexture = texture;

    this._contentMode = 'plan2d';
    this.builder.showPlanImage(texture);
    this.resetModelTransform();
    this._frameCameraTopDown();
    this.resetLightToDefault();
    if (wasLightGizmo) this.attachLightGizmo(true);
    else this.transform.detach();
    this._fitMainLightShadow();
  }

  /** Near top-down framing (slight tilt so Y-orbit / azimuth still works). */
  _frameCameraTopDown() {
    const box = new THREE.Box3().setFromObject(this.contentRoot);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 1);
    this.orbit.target.set(center.x, 0, center.z);
    // ~25° from vertical — plan stays readable, full 360° yaw orbit works
    const elev = span * 1.05;
    const back = span * 0.48;
    this.camera.position.set(center.x, elev, center.z + back);
    this.camera.near = 0.05;
    this.camera.far = Math.max(200, span * 20);
    this.camera.updateProjectionMatrix();
    this.orbit.update();
  }

  _setupHelpers() {
    // World axes (X=red, Y=green, Z=blue) + labels; grid is optional (off by default)
    const axisLen = 14;
    this.axes = new THREE.AxesHelper(axisLen);
    this.axes.name = 'axes';
    this.scene.add(this.axes);

    const tip = axisLen + 0.55;
    this.axisLabels = {
      x: this._makeAxisLabel('X', '#ff4d6d', new THREE.Vector3(tip, 0.05, 0)),
      y: this._makeAxisLabel('Y', '#3dd68c', new THREE.Vector3(0.05, tip, 0)),
      z: this._makeAxisLabel('Z', '#4da3ff', new THREE.Vector3(0, 0.05, tip)),
    };
    Object.values(this.axisLabels).forEach((sprite) => this.scene.add(sprite));

    this.grid = new THREE.GridHelper(40, 40, 0x3a4454, 0x2a3140);
    this.grid.position.y = -0.01;
    this.grid.visible = true;
    this.scene.add(this.grid);
  }

  _makeAxisLabel(text, color, position) {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.font = 'bold 64px "Segoe UI","Malgun Gothic",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(text, size / 2, size / 2 + 2);
    ctx.fillStyle = color;
    ctx.fillText(text, size / 2, size / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = `axisLabel${text}`;
    sprite.position.copy(position);
    sprite.scale.set(0.95, 0.95, 0.95);
    sprite.renderOrder = 1000;
    return sprite;
  }

  setTheme(theme) {
    this._theme = theme === 'light' ? 'light' : 'dark';
    const isLight = this._theme === 'light';
    const bg = isLight ? 0xdce3ee : 0x12151a;
    this.scene.background.setHex(bg);
    this.scene.fog.color.setHex(bg);

    if (!this.grid) return;
    const center = isLight ? 0x8fa3bf : 0x3a4454;
    const cell = isLight ? 0xb7c4d8 : 0x2a3140;
    const visible = this.grid.visible;
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    if (Array.isArray(this.grid.material)) {
      this.grid.material.forEach((m) => m.dispose());
    } else {
      this.grid.material.dispose?.();
    }
    this.grid = new THREE.GridHelper(40, 40, center, cell);
    this.grid.position.y = -0.01;
    this.grid.visible = visible;
    this.scene.add(this.grid);
  }

  _setupLights() {
    // Keep ambient moderate so main-light moves clearly change wall/floor shading
    this.hemiLight = new THREE.HemisphereLight(0xf0f4ff, 0x3a2f24, 0.55);
    this.scene.add(this.hemiLight);

    this.mainLight = new THREE.DirectionalLight(0xfff2dd, 1.35);
    this.mainLight.position.set(
      DEFAULT_LIGHT_POSITION.x,
      DEFAULT_LIGHT_POSITION.y,
      DEFAULT_LIGHT_POSITION.z,
    );
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.set(2048, 2048);
    this.mainLight.shadow.bias = -0.00015;
    this.mainLight.shadow.normalBias = 0.04;
    this.mainLight.shadow.radius = 2;
    // Target must stay in the scene so matrixWorld updates with light moves
    this.mainLight.target.position.set(0, 1, 0);
    this.scene.add(this.mainLight);
    this.scene.add(this.mainLight.target);

    this.fillLight = new THREE.DirectionalLight(0xb7d0ff, 0.45);
    this.fillLight.position.set(-6, 6, -4);
    this.scene.add(this.fillLight);

    this.lightAnchor = new THREE.Object3D();
    this.lightAnchor.name = 'LightAnchor';
    this.lightAnchor.position.copy(this.mainLight.position);
    this.scene.add(this.lightAnchor);

    // Visible handle so the light position is clear and draggable via TransformControls
    const markerGeo = new THREE.SphereGeometry(0.35, 20, 16);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffe0a0,
      emissive: 0xffc04d,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.05,
    });
    this.lightMarker = new THREE.Mesh(markerGeo, markerMat);
    this.lightMarker.name = 'LightMarker';
    this.lightMarker.castShadow = false;
    this.lightMarker.receiveShadow = false;
    this.lightAnchor.add(this.lightMarker);

    // Line from world origin (0,0,0) → main light (toggled with the Light tool)
    const rayPositions = new Float32Array(6);
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPositions, 3));
    const rayMat = new THREE.LineDashedMaterial({
      color: 0xffc04d,
      dashSize: 0.45,
      gapSize: 0.22,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.lightRay = new THREE.Line(rayGeo, rayMat);
    this.lightRay.name = 'LightRay';
    this.lightRay.frustumCulled = false;
    this.lightRay.renderOrder = 1000;
    this.lightRay.visible = false;
    this.scene.add(this.lightRay);

    // Marker + ray are light-helper visuals — off until the Light tool enables them
    this.lightMarker.visible = false;

    this._fitMainLightShadow();
  }

  /** Keep the origin→light helper line in sync (start is always world 0,0,0). */
  _updateLightRay() {
    if (!this.lightRay || !this.mainLight) return;
    const to = this.mainLight.position;
    const attr = this.lightRay.geometry.getAttribute('position');
    attr.setXYZ(0, 0, 0, 0);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    this.lightRay.geometry.computeBoundingSphere();
    this.lightRay.computeLineDistances();
  }

  _setLightHelpersVisible(visible) {
    if (this.lightMarker) this.lightMarker.visible = visible;
    if (this.lightRay) {
      this.lightRay.visible = visible;
      if (visible) this._updateLightRay();
    }
  }

  /**
   * Retarget lights at the content, resize the shadow frustum, and place the fill
   * light opposite the main light so walls/floors visibly re-shade when the main
   * light moves.
   */
  _fitMainLightShadow() {
    const light = this.mainLight;
    if (!light) return;

    _shadowCenter.set(0, 1, 0);
    let radius = 10;
    _shadowBox.setFromObject(this.contentRoot);
    if (!_shadowBox.isEmpty()) {
      _shadowBox.getCenter(_shadowCenter);
      _shadowBox.getSize(_shadowSize);
      radius = Math.max(_shadowSize.x, _shadowSize.y, _shadowSize.z, 1) * 0.6 + 1.5;
    }

    light.target.position.copy(_shadowCenter);
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);

    _shadowDir.subVectors(light.position, _shadowCenter);
    const lightDist = Math.max(_shadowDir.length(), 0.5);

    // Opposite-side fill so shading on the model flips when the main light orbits
    if (this.fillLight) {
      this.fillLight.position.set(
        _shadowCenter.x - _shadowDir.x * 0.55,
        _shadowCenter.y + Math.max(radius * 0.35, lightDist * 0.2),
        _shadowCenter.z - _shadowDir.z * 0.55,
      );
      this.fillLight.updateMatrixWorld(true);
    }

    // Cover the model from the current light direction; grow with distance so
    // oblique / far lights still cast onto the whole floor plan.
    const extent = Math.max(radius * 1.85, lightDist * 0.25, 8);
    const cam = light.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = Math.max(0.1, lightDist - radius * 3);
    cam.far = lightDist + radius * 3;
    cam.updateProjectionMatrix();
    if (typeof light.shadow.updateMatrices === 'function') {
      light.shadow.updateMatrices(light);
    }
    // Force a fresh shadow pass so floor-plan / model shading updates immediately
    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    light.shadow.needsUpdate = true;

    if (this.lightRay?.visible) this._updateLightRay();
  }

  /** Call after any light pose change so content shading/shadows refresh. */
  _applyLightToContent() {
    this.mainLight.updateMatrixWorld(true);
    this._fitMainLightShadow();
    this._ensureContentReceivesLight();
  }

  /** Make sure current meshes react to lights and cast/receive shadows. */
  _ensureContentReceivesLight() {
    this.contentRoot.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = child.material
        ? (Array.isArray(child.material) ? child.material : [child.material])
        : [];
      for (const mat of mats) {
        if (!mat) continue;
        // Unlit materials ignore light position — promote so shading updates
        if (mat.isMeshBasicMaterial) {
          const std = new THREE.MeshStandardMaterial({
            color: mat.color?.clone?.() ?? 0xc8d0dc,
            map: mat.map ?? null,
            transparent: mat.transparent,
            opacity: mat.opacity,
            side: mat.side ?? THREE.DoubleSide,
            roughness: 0.7,
            metalness: 0.05,
          });
          if (Array.isArray(child.material)) {
            const idx = child.material.indexOf(mat);
            if (idx >= 0) child.material[idx] = std;
          } else {
            child.material = std;
          }
          mat.dispose?.();
        } else {
          mat.needsUpdate = true;
        }
      }
    });
  }

  _bindEvents() {
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR') this.setTransformMode('rotate');
      if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) this.setTransformMode('scale');
    });

    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      // Rotate tool: left-drag (not on gizmo) rotates the model with the mouse
      if (
        this._modelMouseRotate
        && !this._lightGizmo
        && e.button === 0
        && !this.transform.axis
        && !this.transform.dragging
      ) {
        this._modelRotating = true;
        this.orbit.enabled = false;
        this._lastPointer = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (this._modelRotating) {
        this._modelRotating = false;
        this.orbit.enabled = !this.transform.dragging;
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    el.addEventListener('pointercancel', () => {
      if (this._modelRotating) {
        this._modelRotating = false;
        this.orbit.enabled = !this.transform.dragging;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this._modelRotating) return;
      const dx = e.clientX - this._lastPointer.x;
      const dy = e.clientY - this._lastPointer.y;
      this._lastPointer = { x: e.clientX, y: e.clientY };
      this._rotateModelByPointerDelta(dx, dy, e);
      this._onModelGizmoMove?.();
    });
  }

  /**
   * Rotate model around a fixed world axis (quaternion). Allows continuous 360°+.
   * @param {THREE.Vector3} axis unit world axis
   * @param {number} radians
   */
  rotateAroundWorldAxis(axis, radians) {
    if (!radians) return;
    const g = this._modelRoot();
    _worldAxis.copy(axis).normalize();
    _tmpQuat.setFromAxisAngle(_worldAxis, radians);
    g.quaternion.premultiply(_tmpQuat).normalize();
    this._captureRotationFromObject();
  }

  setRotateAxisLock(axis) {
    if (axis === 'x' || axis === 'y' || axis === 'z') {
      this._rotateAxisLock = this._rotateAxisLock === axis ? null : axis;
    } else {
      this._rotateAxisLock = null;
    }
    return this._rotateAxisLock;
  }

  getRotateAxisLock() {
    return this._rotateAxisLock;
  }

  /**
   * World-axis mouse spin (full 360° on X / Y / Z).
   * - Default: horizontal → Y, vertical → X
   * - Shift: horizontal → Z (roll), vertical → X
   * - Axis lock (X/Y/Z keys): drag on that single world axis only
   */
  _rotateModelByPointerDelta(dx, dy, event) {
    const speed = 0.01;
    const lock = this._rotateAxisLock;
    const shift = Boolean(event?.shiftKey);

    if (lock === 'x') {
      this.rotateAroundWorldAxis(_WORLD_X, dy * speed);
      return;
    }
    if (lock === 'y') {
      this.rotateAroundWorldAxis(_WORLD_Y, dx * speed);
      return;
    }
    if (lock === 'z') {
      this.rotateAroundWorldAxis(_WORLD_Z, dx * speed);
      return;
    }

    if (shift) {
      // Explicit Z-axis roll + X pitch
      this.rotateAroundWorldAxis(_WORLD_Z, dx * speed);
      this.rotateAroundWorldAxis(_WORLD_X, dy * speed);
      return;
    }

    // Yaw (Y) + pitch (X) — both unbounded via quaternion
    this.rotateAroundWorldAxis(_WORLD_Y, dx * speed);
    this.rotateAroundWorldAxis(_WORLD_X, dy * speed);
  }

  setMode(_mode = 'orbit') {
    this.mode = 'orbit';
    this.orbit.enabled = !this._modelRotating && !this.transform.dragging;
    this._syncTransformGizmoVisibility();
    this._syncOrbitMouseButtons();
  }

  setTransformMode(mode) {
    // Models are not translated — only rotate / scale (translate reserved for light gizmo)
    const next = !this._lightGizmo && mode === 'translate' ? 'rotate' : mode;
    this.transform.setMode(next);
    if (!this._lightGizmo) {
      this.transform.setSpace('world');
      this.transform.attach(this.contentRoot);
    }
    this._modelMouseRotate = next === 'rotate' && !this._lightGizmo;
    this._transformToolActive = next === 'rotate' || next === 'scale' || this._lightGizmo;
    if (next !== 'rotate') this._rotateAxisLock = null;
    this._syncTransformGizmoVisibility();
    this._syncOrbitMouseButtons();
  }

  /** Show transform gizmo only when rotate/scale (or light gizmo) is intentionally active. */
  _syncTransformGizmoVisibility() {
    const show = this._lightGizmo || this._transformToolActive;
    this.transform.enabled = show;
    this.transform.visible = show;
  }

  /** Orbit-only view: classic world axes, no model transform gizmo. */
  clearTransformTool() {
    this._transformToolActive = false;
    this._modelMouseRotate = false;
    this._rotateAxisLock = null;
    if (!this._lightGizmo) this.transform.detach();
    this._syncTransformGizmoVisibility();
    this._syncOrbitMouseButtons();
  }

  setTransformSpace(space) {
    // Keep model rotate on world axes so X/Z rings stay true world 360° spins.
    if (!this._lightGizmo && this.transform.mode === 'rotate') {
      this.transform.setSpace('world');
      return;
    }
    this.transform.setSpace(space);
  }

  setAxesVisible(visible) {
    const on = Boolean(visible);
    if (this.axes) this.axes.visible = on;
    if (this.axisLabels) {
      for (const label of Object.values(this.axisLabels)) {
        label.visible = on;
      }
    }
  }

  setGridVisible(visible) {
    if (this.grid) this.grid.visible = Boolean(visible);
  }

  getModelTransform() {
    const g = this._modelRoot();
    return {
      position: { x: g.position.x, y: g.position.y, z: g.position.z },
      rotation: { ...this._rotationDeg },
      rotation360: {
        x: normalizeDeg360(this._rotationDeg.x),
        y: normalizeDeg360(this._rotationDeg.y),
        z: normalizeDeg360(this._rotationDeg.z),
      },
      scale: { x: g.scale.x, y: g.scale.y, z: g.scale.z },
    };
  }

  setModelTransform({ position, rotation, scale }) {
    const g = this._modelRoot();
    // Keep the model centered; ignore translate requests from UI / gizmos
    g.position.set(0, 0, 0);
    void position;
    if (rotation) {
      if (rotation.x != null) this._rotationDeg.x = Number(rotation.x);
      if (rotation.y != null) this._rotationDeg.y = Number(rotation.y);
      if (rotation.z != null) this._rotationDeg.z = Number(rotation.z);
      this._applyRotationDeg();
    }
    if (scale) {
      if (scale.x != null) g.scale.x = scale.x;
      if (scale.y != null) g.scale.y = scale.y;
      if (scale.z != null) g.scale.z = scale.z;
    }
    if (!this._lightGizmo) this.transform.attach(g);
  }

  resetModelTransform() {
    const g = this._modelRoot();
    g.position.set(0, 0, 0);
    g.scale.set(1, 1, 1);
    this._rotationDeg = { x: 0, y: 0, z: 0 };
    this._applyRotationDeg();
    // Never attach the translate gizmo to the model origin here — that made
    // "광원 표시" appear at (0,0,0) far from the real light.
    if (this._lightGizmo) {
      this.resetLightToDefault();
    } else if (this._transformToolActive) {
      this.transform.attach(g);
    } else {
      this.transform.detach();
    }
  }

  /**
   * Default light position near the current content (never world origin).
   * Empty scene falls back to DEFAULT_LIGHT_POSITION.
   */
  getDefaultLightPosition() {
    const box = new THREE.Box3().setFromObject(this.contentRoot);
    if (box.isEmpty()) {
      return {
        x: DEFAULT_LIGHT_POSITION.x,
        y: DEFAULT_LIGHT_POSITION.y,
        z: DEFAULT_LIGHT_POSITION.z,
      };
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    return {
      x: center.x + span * 0.85 + 2,
      y: center.y + span * 1.25 + 3,
      z: center.z + span * 0.65 + 2,
    };
  }

  _syncLightAnchorFromLight() {
    this.lightAnchor.position.copy(this.mainLight.position);
    this.lightAnchor.updateMatrixWorld(true);
  }

  _syncLightFromAnchor() {
    this.mainLight.position.copy(this.lightAnchor.position);
    this._applyLightToContent();
  }

  /** Place main light at a sensible elevated offset — never (0,0,0). */
  resetLightToDefault() {
    const pos = this.getDefaultLightPosition();
    this.mainLight.position.set(pos.x, pos.y, pos.z);
    this._syncLightAnchorFromLight();
    this._applyLightToContent();
    if (this._lightGizmo) {
      this.transform.setMode('translate');
      this.transform.setSpace('world');
      this.transform.attach(this.lightAnchor);
    }
  }

  /** Restore camera / trackball to the default framed view for current content. */
  resetView() {
    // Stop trackball inertia and restore world-up (tumble may have rolled the camera)
    this.orbit._lastAngle = 0;
    this.orbit.state = -1;
    this.camera.up.set(0, 1, 0);

    if (this._contentMode === 'plan2d') {
      this._frameCameraTopDown();
    } else if (this._contentMode === 'floorplan' || this._contentMode === 'model') {
      this._frameCamera();
    } else {
      this.orbit.target.set(0, 0.8, 0);
      this.camera.position.set(7, 6, 7);
      this.camera.near = 0.05;
      this.camera.far = 200;
      this.camera.updateProjectionMatrix();
      this.orbit.update();
    }

    // Remember this pose as the trackball "home" for subsequent resets
    this.orbit._target0?.copy(this.orbit.target);
    this.orbit._position0?.copy(this.camera.position);
    this.orbit._up0?.copy(this.camera.up);
  }

  _applyRotationDeg() {
    const g = this._modelRoot();
    // Temp euler only — never assign object.rotation.order (that rewrites quaternion).
    _tmpEuler.set(
      THREE.MathUtils.degToRad(this._rotationDeg.x),
      THREE.MathUtils.degToRad(this._rotationDeg.y),
      THREE.MathUtils.degToRad(this._rotationDeg.z),
      this._eulerOrder,
    );
    g.quaternion.setFromEuler(_tmpEuler);
  }

  /**
   * Read Euler for UI only — must NOT touch object.rotation (order/set would
   * overwrite the live quaternion and limit free rotation).
   */
  _captureRotationFromObject() {
    const g = this._modelRoot();
    _tmpEuler.setFromQuaternion(g.quaternion, this._eulerOrder);
    this._rotationDeg.x = unwrapDeg(this._rotationDeg.x, THREE.MathUtils.radToDeg(_tmpEuler.x));
    this._rotationDeg.y = unwrapDeg(this._rotationDeg.y, THREE.MathUtils.radToDeg(_tmpEuler.y));
    this._rotationDeg.z = unwrapDeg(this._rotationDeg.z, THREE.MathUtils.radToDeg(_tmpEuler.z));
  }

  getLightState() {
    return {
      mainIntensity: this.mainLight.intensity,
      fillIntensity: this.fillLight.intensity,
      hemiIntensity: this.hemiLight.intensity,
      color: `#${this.mainLight.color.getHexString()}`,
      position: {
        x: this.mainLight.position.x,
        y: this.mainLight.position.y,
        z: this.mainLight.position.z,
      },
      castShadow: this.mainLight.castShadow,
    };
  }

  setLightState({
    mainIntensity,
    fillIntensity,
    hemiIntensity,
    color,
    position,
    castShadow,
  }) {
    if (mainIntensity != null) this.mainLight.intensity = mainIntensity;
    if (fillIntensity != null) this.fillLight.intensity = fillIntensity;
    if (hemiIntensity != null) this.hemiLight.intensity = hemiIntensity;
    if (color) {
      this.mainLight.color.set(color);
      if (this.lightMarker?.material) {
        this.lightMarker.material.color.set(color);
        this.lightMarker.material.emissive.set(color);
      }
      if (this.lightRay?.material) {
        this.lightRay.material.color.set(color);
      }
    }
    if (position) {
      if (Number.isFinite(position.x)) this.mainLight.position.x = position.x;
      if (Number.isFinite(position.y)) this.mainLight.position.y = position.y;
      if (Number.isFinite(position.z)) this.mainLight.position.z = position.z;
      this._syncLightAnchorFromLight();
      if (this._lightGizmo) {
        this.transform.setMode('translate');
        this.transform.setSpace('world');
        this.transform.attach(this.lightAnchor);
      }
    }
    if (castShadow != null) this.mainLight.castShadow = castShadow;
    // Intensity/color/position all affect how the floor plan / model looks
    this._applyLightToContent();
  }

  attachLightGizmo(enabled) {
    if (enabled) {
      // If light was left at the origin, snap back to a valid default first
      const p = this.mainLight.position;
      if (
        !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)
        || (Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6 && Math.abs(p.z) < 1e-6)
      ) {
        const pos = this.getDefaultLightPosition();
        this.mainLight.position.set(pos.x, pos.y, pos.z);
      }
      this._syncLightAnchorFromLight();
      this._lightGizmo = true;
      this._modelMouseRotate = false;
      this._transformToolActive = true;
      this.transform.setMode('translate');
      this.transform.setSpace('world');
      this.transform.attach(this.lightAnchor);
      this._fitMainLightShadow();
      this._setLightHelpersVisible(true);
      this._syncTransformGizmoVisibility();
      this._syncOrbitMouseButtons();
    } else {
      this._lightGizmo = false;
      this._modelMouseRotate = false;
      this._transformToolActive = false;
      // Detach — never attach to contentRoot at (0,0,0) or the light gizmo
      // appears stranded on the world origin away from the real light.
      this.transform.detach();
      this._setLightHelpersVisible(false);
      this._syncTransformGizmoVisibility();
      this._syncOrbitMouseButtons();
    }
  }

  onModelGizmoMove(cb) {
    this._onModelGizmoMove = cb;
  }

  onLightGizmoMove(cb) {
    this._onLightGizmoMove = cb;
  }

  applyColors({ wall, floor }) {
    this.builder.setColors({ wall, floor });
  }

  /** Empty viewport: world axes only, no floor-plan or external model. */
  clearContent() {
    const wasLightGizmo = this._lightGizmo;
    this.builder.clear();
    this._clearExternalModel();
    this._disposePlanTexture();
    this._contentMode = 'empty';
    this.resetModelTransform();
    this.resetLightToDefault();
    if (wasLightGizmo) this.attachLightGizmo(true);
    else this.transform.detach();
    this.orbit.target.set(0, 0.8, 0);
    this.camera.position.set(7, 6, 7);
    this.camera.near = 0.05;
    this.camera.far = 200;
    this.camera.updateProjectionMatrix();
    this.orbit.update();
  }

  rebuild(detection, options = {}) {
    if (!detection?.points) {
      this.clearContent();
      return;
    }
    const prev = this.getModelTransform();
    const wasLightGizmo = this._lightGizmo;
    this._clearExternalModel();
    this._contentMode = 'floorplan';
    this.builder.build(detection, {
      ...options,
      floorTexture: options.floorTexture ?? this._planTexture ?? null,
    });
    this.setModelTransform(prev);
    if (wasLightGizmo) this.attachLightGizmo(true);
    this._frameCamera();
    this._applyLightToContent();
  }

  /**
   * Show an arbitrary loaded 3D object (glTF, OBJ, STL, …).
   * Clears the floor-plan meshes so convert pipeline can restore them later.
   */
  loadExternalModel(object, { resetTransform = true } = {}) {
    const wasLightGizmo = this._lightGizmo;
    this.builder.clear();
    this._clearExternalModel();
    this._disposePlanTexture();
    this._contentMode = 'model';
    this.externalRoot.add(object);
    if (resetTransform) this.resetModelTransform();
    this._frameCamera();
    this.resetLightToDefault();
    this._applyLightToContent();
    if (wasLightGizmo) this.attachLightGizmo(true);
    else this.transform.detach();
  }

  _frameCamera() {
    const box = new THREE.Box3().setFromObject(this.contentRoot);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Restore classic framing so world axes / grid read naturally
    const radius = Math.max(size.x, size.z, size.y) * 0.75 + 2;
    this.camera.up.set(0, 1, 0);
    this.orbit._lastAngle = 0;
    this.orbit.target.copy(center);
    this.camera.position.set(center.x + radius, center.y + radius * 0.9, center.z + radius);
    this.camera.near = 0.05;
    this.camera.far = Math.max(200, radius * 20);
    this.camera.updateProjectionMatrix();
    this.orbit.update();
    this._fitMainLightShadow();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render the current 3D result to a PNG data URL with a transparent background.
   * Hides helpers (axes, grid, gizmos, light marker) for a clean export.
   * @returns {string} data:image/png;base64,...
   */
  captureTransparentPngDataUrl() {
    const scene = this.scene;
    const renderer = this.renderer;
    const prevBackground = scene.background;
    const prevFog = scene.fog;

    const hidden = [];
    const hide = (obj) => {
      if (!obj || !obj.visible) return;
      obj.visible = false;
      hidden.push(obj);
    };
    hide(this.axes);
    hide(this.grid);
    hide(this.lightAnchor);
    hide(this.lightRay);
    if (this.transform?.getHelper) hide(this.transform.getHelper());
    if (this.axisLabels) {
      for (const label of Object.values(this.axisLabels)) hide(label);
    }

    scene.background = null;
    scene.fog = null;
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, this.camera);

    const dataUrl = renderer.domElement.toDataURL('image/png');

    scene.background = prevBackground;
    scene.fog = prevFog;
    for (const obj of hidden) obj.visible = true;
    // Restore themed clear; scene.background covers the canvas in normal view
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, this.camera);

    return dataUrl;
  }

  _onResize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.orbit.handleResize?.();
  }
}
