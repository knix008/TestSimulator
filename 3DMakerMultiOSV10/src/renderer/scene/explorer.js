import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { createWorldAxes } from './axes.js'

/**
 * First-person explorer with simple collision against the reconstructed mesh.
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

    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.05, 80)
    this.camera.position.set(2.8, 2.2, 3.4)
    this.camera.lookAt(0, 0.6, 0)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.controls = new PointerLockControls(this.camera, canvas)
    this.scene.add(this.controls.object)

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
    this.velocity = new THREE.Vector3()
    this.direction = new THREE.Vector3()
    this.raycaster = new THREE.Raycaster()
    this.keys = Object.create(null)
    this.clock = new THREE.Clock()
    this.running = true
    this.speed = 2.4

    this._onKeyDown = (e) => {
      this.keys[e.code] = true
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        this.zoomBy(1.1)
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        this.zoomBy(1 / 1.1)
      } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        this.resetZoom()
      }
    }
    this._onKeyUp = (e) => {
      this.keys[e.code] = false
    }
    this._onResize = () => this.resize()
    this._onClick = () => {
      if (this.spaceMesh) this.controls.lock()
    }
    this._onWheel = (e) => {
      // Zoom only with Ctrl/Cmd + wheel (avoids accidental zoom while browsing).
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1 / 1.08 : 1.08
      this.zoomBy(factor)
    }

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('resize', this._onResize)
    canvas.addEventListener('click', this._onClick)
    canvas.addEventListener('wheel', this._onWheel, { passive: false })

    this.resize()
    this.clock.start()
    this.renderer.setAnimationLoop(() => this.tick())
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
    if (this.controls.isLocked) this.controls.unlock()
    this.controls.object.position.copy(this.spawn)
    this.camera.lookAt(0, this.spawn.y, this.spawn.z - 4)
    this.camera.updateMatrixWorld()
    this.resetZoom()
    return true
  }

  /**
   * @returns {boolean}
   */
  beginExplore() {
    if (!this.spaceMesh) return false
    this.controls.lock()
    return true
  }

  /**
   * @param {{ mesh: THREE.Mesh, enclosure?: THREE.Object3D, floorY: number, spawn: THREE.Vector3, bounds: THREE.Box3 }} space
   */
  setSpace(space) {
    if (this.spaceMesh) {
      this.scene.remove(this.spaceMesh)
      this.spaceMesh.geometry.dispose()
      const mat = this.spaceMesh.material
      if (mat.map) mat.map.dispose()
      mat.dispose()
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
    this.scene.fog = new THREE.Fog(0x0a0e13, 8, 22)

    this.controls.object.position.copy(space.spawn)
    this.camera.lookAt(0, space.spawn.y, space.spawn.z - 4)
    this.camera.updateMatrixWorld()
    this.resetZoom()
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
    if (!this.controls.isLocked || !this.spaceMesh) return

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
    forward.normalize()
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const move = new THREE.Vector3()
      .addScaledVector(forward, this.direction.z * accel * dt)
      .addScaledVector(right, this.direction.x * accel * dt)
    move.y = vertical * accel * dt

    const next = this.controls.object.position.clone().add(move)
    this.applyCollision(next)
    this.controls.object.position.copy(next)
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
      const hits = this.raycaster.intersectObject(this.spaceMesh, false)
      if (hits.length && hits[0].distance < radius) {
        pos.addScaledVector(dir, -(radius - hits[0].distance))
      }
    }

    this.raycaster.set(pos.clone(), new THREE.Vector3(0, -1, 0))
    this.raycaster.far = eye + 0.8
    const downHits = this.raycaster.intersectObject(this.spaceMesh, false)
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
    this.canvas.removeEventListener('click', this._onClick)
    this.canvas.removeEventListener('wheel', this._onWheel)
    this.renderer.setAnimationLoop(null)
    this.controls.dispose()
    this.renderer.dispose()
  }
}
