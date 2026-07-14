import * as THREE from 'three'
import { createWorldAxes } from './axes.js'

/**
 * First-person explorer — drag to look (no pointer lock), WASD to walk.
 */
export class SpaceExplorer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0a0e13)
    this.scene.fog = new THREE.Fog(0x0a0e13, 6, 18)

    this.baseFov = 70
    this.zoom = 1
    this.minZoom = 0.4
    this.maxZoom = 3.5
    /** @type {((zoom: number) => void) | null} */
    this.onZoomChange = null
    /** @type {((exploring: boolean) => void) | null} */
    this.onExploreChange = null

    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.05, 80)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.set(2.8, 2.2, 3.4)
    this.yaw = 0
    this.pitch = -0.35
    this.applyLook()
    this.lookSensitivity = 0.0024

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2

    const hemi = new THREE.HemisphereLight(0xdde7f5, 0x2a241c, 1.15)
    const key = new THREE.DirectionalLight(0xffffff, 1.05)
    key.position.set(2.5, 6, 1.5)
    this.scene.add(hemi, key)

    this.worldAxes = createWorldAxes(2.5)
    this.scene.add(this.worldAxes)

    this.spaceMesh = null
    this.enclosure = null
    this.floorY = 0
    this.bounds = null
    /** @type {THREE.Vector3 | null} */
    this.spawn = null
    this.direction = new THREE.Vector3()
    this.raycaster = new THREE.Raycaster()
    this.keys = Object.create(null)
    this.clock = new THREE.Clock()
    this.running = true
    this.speed = 2.4
    this.exploring = false
    this.dragging = false
    this.pointerId = null

    this._onKeyDown = (e) => {
      this.keys[e.code] = true
      if (!this.spaceMesh) return
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        this.zoomBy(1.1)
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        this.zoomBy(1 / 1.1)
      } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        this.resetZoom()
      } else if (e.code === 'Escape' && this.exploring) {
        this.setExploring(false)
      }
    }
    this._onKeyUp = (e) => {
      this.keys[e.code] = false
    }
    this._onResize = () => this.resize()
    this._onPointerDown = (e) => {
      if (!this.spaceMesh) return
      // Left or right button drag = look (no pointer lock).
      if (e.button !== 0 && e.button !== 2) return
      this.dragging = true
      this.pointerId = e.pointerId
      this.canvas.setPointerCapture(e.pointerId)
      this.canvas.classList.add('is-looking')
      e.preventDefault()
    }
    this._onPointerMove = (e) => {
      if (!this.dragging || !this.spaceMesh) return
      this.yaw -= e.movementX * this.lookSensitivity
      this.pitch -= e.movementY * this.lookSensitivity
      const limit = Math.PI / 2 - 0.05
      this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit)
      this.applyLook()
    }
    this._onPointerUp = (e) => {
      if (this.pointerId != null && e.pointerId !== this.pointerId) return
      this.endDrag()
    }
    this._onLostCapture = () => this.endDrag()
    this._onContextMenu = (e) => e.preventDefault()
    this._onWheel = (e) => {
      if (!this.spaceMesh) return
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1 / 1.08 : 1.08
      this.zoomBy(factor)
    }

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('resize', this._onResize)
    canvas.addEventListener('pointerdown', this._onPointerDown)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerup', this._onPointerUp)
    canvas.addEventListener('pointercancel', this._onPointerUp)
    canvas.addEventListener('lostpointercapture', this._onLostCapture)
    canvas.addEventListener('contextmenu', this._onContextMenu)
    canvas.addEventListener('wheel', this._onWheel, { passive: false })

    this.resize()
    this.clock.start()
    this.renderer.setAnimationLoop(() => this.tick())
  }

  endDrag() {
    if (this.pointerId != null && this.canvas.hasPointerCapture?.(this.pointerId)) {
      try {
        this.canvas.releasePointerCapture(this.pointerId)
      } catch {
        /* ignore */
      }
    }
    this.dragging = false
    this.pointerId = null
    this.canvas.classList.remove('is-looking')
  }

  applyLook() {
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
    this.camera.rotation.z = 0
  }

  syncEulerFromCamera() {
    this.camera.rotation.order = 'YXZ'
    this.camera.updateMatrixWorld()
    this.yaw = this.camera.rotation.y
    this.pitch = this.camera.rotation.x
  }

  getZoom() {
    return this.zoom
  }

  /**
   * @param {number} zoom
   */
  setZoom(zoom) {
    this.zoom = THREE.MathUtils.clamp(zoom, this.minZoom, this.maxZoom)
    this.camera.fov = this.baseFov / this.zoom
    this.camera.updateProjectionMatrix()
    this.onZoomChange?.(this.zoom)
  }

  /**
   * @param {number} factor
   */
  zoomBy(factor) {
    this.setZoom(this.zoom * factor)
  }

  resetZoom() {
    this.setZoom(1)
  }

  areAxesVisible() {
    return this.worldAxes.visible
  }

  toggleAxes() {
    this.worldAxes.visible = !this.worldAxes.visible
    return this.worldAxes.visible
  }

  /**
   * @returns {boolean}
   */
  resetView() {
    if (!this.spawn) return false
    this.setExploring(false)
    this.camera.position.copy(this.spawn)
    this.camera.lookAt(0, this.spawn.y, this.spawn.z - 4)
    this.syncEulerFromCamera()
    this.resetZoom()
    return true
  }

  /**
   * @param {boolean} on
   */
  setExploring(on) {
    if (!this.spaceMesh) return
    const next = Boolean(on)
    if (this.exploring === next) return
    this.exploring = next
    this.canvas.classList.toggle('is-exploring', next)
    this.onExploreChange?.(next)
  }

  /**
   * Toggle walk mode. Look/zoom work whenever a space exists.
   * @returns {boolean | null}
   */
  beginExplore() {
    if (!this.spaceMesh) return null
    this.setExploring(!this.exploring)
    return this.exploring
  }

  isExploring() {
    return this.exploring
  }

  /**
   * Compatibility shim — older UI referred to pointer-lock "controls".
   */
  get controls() {
    return {
      isLocked: this.exploring,
      addEventListener: () => {},
      removeEventListener: () => {},
      lock: () => this.setExploring(true),
      unlock: () => this.setExploring(false),
      dispose: () => {},
      object: this.camera
    }
  }

  /**
   * @param {{ mesh: THREE.Mesh, enclosure?: THREE.Object3D, floorY: number, spawn: THREE.Vector3, bounds: THREE.Box3 }} space
   */
  setSpace(space) {
    if (this.spaceMesh) {
      this.scene.remove(this.spaceMesh)
      this.spaceMesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of mats) {
            if (mat.map) mat.map.dispose()
            mat.dispose()
          }
        }
      })
    }
    if (this.enclosure) {
      this.scene.remove(this.enclosure)
      this.enclosure.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) obj.material.dispose()
      })
      this.enclosure = null
    }

    this.spaceMesh = space.mesh
    this.enclosure = space.enclosure || null
    this.floorY = space.floorY
    this.bounds = space.bounds
    this.spawn = space.spawn.clone()
    this.scene.add(this.spaceMesh)
    if (this.enclosure) this.scene.add(this.enclosure)

    this.worldAxes.position.set(0, this.floorY, 0)
    this.scene.fog = new THREE.Fog(0x0a0e13, 16, 40)

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy()
    this.spaceMesh.traverse((obj) => {
      const map = obj.material?.map
      if (map) {
        map.anisotropy = maxAniso
        map.needsUpdate = true
      }
    })

    this.camera.position.copy(space.spawn)
    this.camera.lookAt(0, 1.35, space.spawn.z - 6)
    this.syncEulerFromCamera()
    this.resetZoom()
    this.setExploring(true)
  }

  resize() {
    const parent = this.canvas.parentElement
    const w = parent?.clientWidth || window.innerWidth
    const h = parent?.clientHeight || window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta())
    this.updateMovement(dt)
    this.renderer.render(this.scene, this.camera)
  }

  updateMovement(dt) {
    if (!this.exploring || !this.spaceMesh) return

    const accel = this.speed
    this.direction.set(0, 0, 0)
    if (this.keys.KeyW) this.direction.z += 1
    if (this.keys.KeyS) this.direction.z -= 1
    if (this.keys.KeyA) this.direction.x -= 1
    if (this.keys.KeyD) this.direction.x += 1

    let vertical = 0
    if (this.keys.Space) vertical += 1
    if (this.keys.ControlLeft || this.keys.ControlRight) vertical -= 1

    if (this.direction.lengthSq() > 0) this.direction.normalize()

    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    this.camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    else forward.normalize()
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const move = new THREE.Vector3()
      .addScaledVector(forward, this.direction.z * accel * dt)
      .addScaledVector(right, this.direction.x * accel * dt)
    move.y = vertical * accel * dt

    const next = this.camera.position.clone().add(move)
    this.applyCollision(next)
    this.camera.position.copy(next)
  }

  applyCollision(pos) {
    const eye = 1.55
    const radius = 0.22

    const minY = this.floorY + 0.35
    const maxY = this.floorY + 3.2
    pos.y = THREE.MathUtils.clamp(pos.y, minY, maxY)

    if (!this.bounds) return
    const pad = 0.35
    pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.min.x + pad, this.bounds.max.x - pad)
    pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.min.z + pad, this.bounds.max.z - 0.05)

    const origin = pos.clone()
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0.7, 0, 0.7).normalize(),
      new THREE.Vector3(-0.7, 0, 0.7).normalize(),
      new THREE.Vector3(0.7, 0, -0.7).normalize(),
      new THREE.Vector3(-0.7, 0, -0.7).normalize()
    ]

    for (const dir of dirs) {
      this.raycaster.set(origin, dir)
      this.raycaster.far = radius
      const hits = this.raycaster.intersectObject(this.spaceMesh, true)
      if (hits.length && hits[0].distance < radius) {
        pos.addScaledVector(dir, -(radius - hits[0].distance))
      }
    }

    this.raycaster.set(pos.clone(), new THREE.Vector3(0, -1, 0))
    this.raycaster.far = eye + 0.8
    const downHits = this.raycaster.intersectObject(this.spaceMesh, true)
    if (downHits.length) {
      const ground = downHits[0].point.y
      const desired = ground + eye
      if (desired > pos.y) pos.y = THREE.MathUtils.lerp(pos.y, desired, 0.35)
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('resize', this._onResize)
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    this.canvas.removeEventListener('pointermove', this._onPointerMove)
    this.canvas.removeEventListener('pointerup', this._onPointerUp)
    this.canvas.removeEventListener('pointercancel', this._onPointerUp)
    this.canvas.removeEventListener('lostpointercapture', this._onLostCapture)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    this.canvas.removeEventListener('wheel', this._onWheel)
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
  }
}
