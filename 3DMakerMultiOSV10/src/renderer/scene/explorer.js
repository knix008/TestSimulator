import * as THREE from 'three'
import { createWorldAxes } from './axes.js'

const MOVE_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'KeyQ',
  'KeyE'
])

/**
 * First-person walk-in explorer: drag to look, WASD/arrows to move through space.
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
    this.turnSpeed = 1.6

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
    this.walkBounds = null
    /** @type {THREE.Vector3 | null} */
    this.spawn = null
    /** @type {{ position: THREE.Vector3, yaw: number, pitch: number, zoom: number } | null} */
    this.initialPose = null
    /** @type {((ok: boolean) => void) | null} */
    this.onResetView = null
    this.direction = new THREE.Vector3()
    this.forward = new THREE.Vector3()
    this.right = new THREE.Vector3()
    this.keys = Object.create(null)
    this.clock = new THREE.Clock()
    this.speed = 3.2
    this.sprintMul = 1.85
    this.eyeHeight = 1.55
    this.exploring = false
    this.dragging = false
    this.pointerId = null

    this._onKeyDown = (e) => {
      if (isTypingTarget(e.target)) return
      this.keys[e.code] = true
      if (!this.spaceMesh) return

      if (MOVE_CODES.has(e.code) && this.exploring) {
        e.preventDefault()
      }

      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        this.zoomBy(1.1)
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        this.zoomBy(1 / 1.1)
      } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        this.resetZoom()
      } else if (e.code === 'Home' || e.code === 'KeyR') {
        e.preventDefault()
        const ok = this.resetView()
        this.onResetView?.(ok)
      } else if (e.code === 'Escape' && this.exploring) {
        this.setExploring(false)
      }
    }
    this._onKeyUp = (e) => {
      this.keys[e.code] = false
    }
    this._onBlur = () => {
      this.keys = Object.create(null)
    }
    this._onResize = () => this.resize()
    this._onPointerDown = (e) => {
      if (!this.spaceMesh) return
      if (e.button !== 0 && e.button !== 2) return
      this.dragging = true
      this.pointerId = e.pointerId
      this.canvas.setPointerCapture(e.pointerId)
      this.canvas.classList.add('is-looking')
      e.preventDefault()
      if (!this.exploring) this.setExploring(true)
    }
    this._onPointerMove = (e) => {
      if (!this.dragging || !this.spaceMesh) return
      this.yaw -= e.movementX * this.lookSensitivity
      this.pitch -= e.movementY * this.lookSensitivity
      const limit = Math.PI / 2 - 0.08
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
    window.addEventListener('blur', this._onBlur)
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

  captureInitialPose() {
    this.initialPose = {
      position: this.camera.position.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
      zoom: this.zoom
    }
  }

  /**
   * Restore position, look direction, and zoom from when the space was created.
   * @returns {boolean}
   */
  resetView() {
    if (!this.initialPose && !this.spawn) return false

    if (this.initialPose) {
      this.camera.position.copy(this.initialPose.position)
      this.yaw = this.initialPose.yaw
      this.pitch = this.initialPose.pitch
      this.applyLook()
      this.setZoom(this.initialPose.zoom)
    } else {
      this.camera.position.copy(this.spawn)
      this.camera.lookAt(0, this.spawn.y, this.spawn.z - 4)
      this.syncEulerFromCamera()
      this.resetZoom()
    }

    this.keys = Object.create(null)
    this.setExploring(true)
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
   * @param {{ mesh: THREE.Object3D, enclosure?: THREE.Object3D, floorY: number, spawn: THREE.Vector3, bounds: THREE.Box3 }} space
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
    this.walkBounds = buildWalkBounds(space.bounds, space.spawn)
    this.scene.add(this.spaceMesh)
    if (this.enclosure) this.scene.add(this.enclosure)

    this.worldAxes.position.set(0, this.floorY, 0)
    this.scene.fog = new THREE.Fog(0x0a0e13, 18, 48)

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy()
    this.spaceMesh.traverse((obj) => {
      const map = obj.material?.map
      if (map) {
        map.anisotropy = maxAniso
        map.needsUpdate = true
      }
    })

    this.camera.position.copy(space.spawn)
    this.camera.lookAt(0, space.spawn.y, space.spawn.z - 6)
    this.syncEulerFromCamera()
    this.resetZoom()
    this.captureInitialPose()
    this.keys = Object.create(null)
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

    // Keyboard look (person turning in place).
    if (this.keys.KeyQ || this.keys.ArrowLeft) this.yaw += this.turnSpeed * dt
    if (this.keys.KeyE || this.keys.ArrowRight) this.yaw -= this.turnSpeed * dt
    this.applyLook()

    this.direction.set(0, 0, 0)
    if (this.keys.KeyW || this.keys.ArrowUp) this.direction.z += 1
    if (this.keys.KeyS || this.keys.ArrowDown) this.direction.z -= 1
    if (this.keys.KeyA) this.direction.x -= 1
    if (this.keys.KeyD) this.direction.x += 1

    let vertical = 0
    if (this.keys.Space) vertical += 1
    if (this.keys.ControlLeft || this.keys.ControlRight) vertical -= 1

    if (this.direction.lengthSq() > 0) this.direction.normalize()

    this.camera.getWorldDirection(this.forward)
    this.forward.y = 0
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1)
    else this.forward.normalize()
    this.right.crossVectors(this.forward, new THREE.Vector3(0, 1, 0)).normalize()

    const sprint =
      this.keys.ShiftLeft || this.keys.ShiftRight ? this.sprintMul : 1
    const accel = this.speed * sprint

    const move = new THREE.Vector3()
      .addScaledVector(this.forward, this.direction.z * accel * dt)
      .addScaledVector(this.right, this.direction.x * accel * dt)
    move.y = vertical * accel * dt

    if (move.lengthSq() < 1e-10) return

    const next = this.camera.position.clone().add(move)
    this.applyWalkLimits(next)
    this.camera.position.copy(next)
  }

  /**
   * Soft walk envelope — photo mesh is not a solid room, so avoid hard raycast walls
   * that freeze the camera against the depth surface.
   * @param {THREE.Vector3} pos
   */
  applyWalkLimits(pos) {
    const minY = this.floorY + 0.55
    const maxY = this.floorY + 4.5
    pos.y = THREE.MathUtils.clamp(pos.y, minY, maxY)

    const box = this.walkBounds || this.bounds
    if (!box) return
    pos.x = THREE.MathUtils.clamp(pos.x, box.min.x, box.max.x)
    pos.z = THREE.MathUtils.clamp(pos.z, box.min.z, box.max.z)

    // Keep eye-level roughly human if we dipped too low.
    if (pos.y < this.floorY + this.eyeHeight * 0.85) {
      pos.y = THREE.MathUtils.lerp(pos.y, this.floorY + this.eyeHeight, 0.2)
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onBlur)
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

/**
 * Expand bounds so the player can walk into the photo depth (more −Z)
 * and step a little in front of the near surface.
 * @param {THREE.Box3} bounds
 * @param {THREE.Vector3} spawn
 */
function buildWalkBounds(bounds, spawn) {
  const depth = Math.max(4, bounds.max.z - bounds.min.z)
  const width = Math.max(3, bounds.max.x - bounds.min.x)
  const box = new THREE.Box3()
  box.min.set(
    Math.min(bounds.min.x - width * 0.15, -width * 0.55),
    bounds.min.y,
    Math.min(bounds.min.z - depth * 0.35, spawn.z - depth * 1.4)
  )
  box.max.set(
    Math.max(bounds.max.x + width * 0.15, width * 0.55),
    bounds.max.y + 2,
    Math.max(bounds.max.z + 1.2, spawn.z + 1.5)
  )
  return box
}

/**
 * @param {EventTarget | null} target
 */
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}
