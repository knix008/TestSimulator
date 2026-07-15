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

const WORLD_UP = new THREE.Vector3(0, 1, 0)

const SCENE_THEMES = {
  dark: {
    background: 0x0a0e13,
    fog: 0x0a0e13,
    hemiSky: 0xdde7f5,
    hemiGround: 0x2a241c,
    hemiIntensity: 1.15,
    keyColor: 0xffffff,
    keyIntensity: 1.05,
    shellColor: 0x070a0e
  },
  light: {
    background: 0xe9f1f9,
    fog: 0xe3edf7,
    hemiSky: 0xffffff,
    hemiGround: 0xc8d8ea,
    hemiIntensity: 1.0,
    keyColor: 0xfff8ef,
    keyIntensity: 0.92,
    shellColor: 0xd7e2ef
  }
}

const LIGHTING_DEFAULTS = Object.freeze({
  exposure: 1.2,
  hemiMultiplier: 1,
  keyMultiplier: 1,
  keyAzimuthDeg: 60,
  keyElevationDeg: 52
})

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
    this.scene.background = new THREE.Color(SCENE_THEMES.dark.background)
    this.scene.fog = new THREE.Fog(SCENE_THEMES.dark.fog, 6, 18)

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
    this.camera.position.set(0, 1.9, 4.4)
    this.camera.lookAt(0, 1.0, 0)
    this.syncEulerFromCamera()
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
    this.renderer.toneMappingExposure = LIGHTING_DEFAULTS.exposure

    this.hemiLight = new THREE.HemisphereLight(0xdde7f5, 0x2a241c, 1.15)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.05)
    this.keyTarget = new THREE.Object3D()
    this.keyTarget.position.set(0, 1, 0)
    this.scene.add(this.hemiLight, this.keyLight, this.keyTarget)
    this.keyLight.target = this.keyTarget

    this.lighting = { ...LIGHTING_DEFAULTS }
    /** @type {((lighting: ReturnType<SpaceExplorer['getLighting']>) => void) | null} */
    this.onLightingChange = null

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
    this.contentMode = 'space'
    this.orbitTarget = new THREE.Vector3(0, 1, 0)
    this.orbitRadius = 4
    this.orbitYaw = 0
    this.orbitPitch = 0
    this.orbitMinRadius = 1.2
    this.orbitMaxRadius = 18
    this.orbitQuat = new THREE.Quaternion()
    this.orbitEuler = new THREE.Euler(0, 0, 0, 'YXZ')
    this.orbitOffset = new THREE.Vector3(0, 0, 1)
    /** @type {{ target: THREE.Vector3, radius: number, yaw: number, pitch: number, zoom: number } | null} */
    this.initialOrbit = null
    this.dragging = false
    this.dragButton = 0
    this.dragDistance = 0
    this.suppressContextMenuOnce = false
    this.pointerId = null
    this.currentTheme = 'dark'

    this._onKeyDown = (e) => {
      if (isTypingTarget(e.target)) return
      this.keys[e.code] = true
      if (!this.spaceMesh) return

      if (MOVE_CODES.has(e.code) && (this.exploring || this.contentMode === 'object')) {
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
      this.dragButton = e.button
      this.dragDistance = 0
      this.pointerId = e.pointerId
      this.canvas.setPointerCapture(e.pointerId)
      this.canvas.classList.add('is-looking')
      e.preventDefault()
      if (this.contentMode !== 'object' && !this.exploring) this.setExploring(true)
    }
    this._onPointerMove = (e) => {
      if (!this.dragging || !this.spaceMesh) return
      this.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY)

      if (this.contentMode === 'object' && this.dragButton === 2) {
        this.panOrbitTarget(e.movementX, e.movementY)
        if (this.dragDistance > 4) this.suppressContextMenuOnce = true
        return
      }

      this.yaw -= e.movementX * this.lookSensitivity
      this.pitch -= e.movementY * this.lookSensitivity
      if (this.contentMode !== 'object') {
        const limit = Math.PI / 2 - 0.08
        this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit)
      }
      this.applyLook()
    }
    this._onPointerUp = (e) => {
      if (this.pointerId != null && e.pointerId !== this.pointerId) return
      this.endDrag()
    }
    this._onLostCapture = () => this.endDrag()
    this._onContextMenu = (e) => {
      e.preventDefault()
      if (this.suppressContextMenuOnce) {
        this.suppressContextMenuOnce = false
        e.stopPropagation()
      }
    }
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
    this.setVisualTheme('dark')
    this.applyLighting(false)
    this.clock.start()
    this.renderer.setAnimationLoop(() => this.tick())
  }

  /**
   * @param {'dark'|'light'|string} theme
   */
  setVisualTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark'
    this.currentTheme = next
    const palette = SCENE_THEMES[next]

    this.scene.background = new THREE.Color(palette.background)
    if (this.scene.fog) {
      this.scene.fog.color.setHex(palette.fog)
    } else {
      this.scene.fog = new THREE.Fog(palette.fog, 6, 18)
    }

    this.hemiLight.color.setHex(palette.hemiSky)
    this.hemiLight.groundColor.setHex(palette.hemiGround)
    this.keyLight.color.setHex(palette.keyColor)
    this.applyLighting(false)

    if (this.enclosure) {
      this.enclosure.traverse((obj) => {
        if (!obj.material) return
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of mats) {
          if ('color' in mat && mat.color) {
            mat.color.setHex(palette.shellColor)
          }
        }
      })
    }
  }

  getLightingDefaults() {
    return { ...LIGHTING_DEFAULTS }
  }

  getLighting() {
    return { ...this.lighting }
  }

  /**
   * @param {{
   *  exposure?: number,
   *  hemiMultiplier?: number,
   *  keyMultiplier?: number,
   *  keyAzimuthDeg?: number,
   *  keyElevationDeg?: number
   * }} next
   */
  setLighting(next = {}) {
    if (!next || typeof next !== 'object') return this.getLighting()

    if (next.exposure != null) {
      this.lighting.exposure = THREE.MathUtils.clamp(Number(next.exposure) || 1, 0.35, 2.8)
    }
    if (next.hemiMultiplier != null) {
      this.lighting.hemiMultiplier = THREE.MathUtils.clamp(Number(next.hemiMultiplier) || 0, 0, 2.4)
    }
    if (next.keyMultiplier != null) {
      this.lighting.keyMultiplier = THREE.MathUtils.clamp(Number(next.keyMultiplier) || 0, 0, 3.2)
    }
    if (next.keyAzimuthDeg != null) {
      this.lighting.keyAzimuthDeg = wrapDegrees(Number(next.keyAzimuthDeg) || 0)
    }
    if (next.keyElevationDeg != null) {
      this.lighting.keyElevationDeg = THREE.MathUtils.clamp(Number(next.keyElevationDeg) || 0, 8, 85)
    }

    this.applyLighting(true)
    return this.getLighting()
  }

  resetLighting() {
    this.lighting = { ...LIGHTING_DEFAULTS }
    this.applyLighting(true)
    return this.getLighting()
  }

  applyLighting(emitChange) {
    const palette = SCENE_THEMES[this.currentTheme] || SCENE_THEMES.dark
    const azimuth = THREE.MathUtils.degToRad(this.lighting.keyAzimuthDeg)
    const elevation = THREE.MathUtils.degToRad(this.lighting.keyElevationDeg)
    const radius = 7.2
    const flat = Math.cos(elevation) * radius

    this.renderer.toneMappingExposure = this.lighting.exposure
    this.hemiLight.intensity = palette.hemiIntensity * this.lighting.hemiMultiplier
    this.keyLight.intensity = palette.keyIntensity * this.lighting.keyMultiplier
    this.keyLight.position.set(
      Math.sin(azimuth) * flat,
      Math.max(0.5, Math.sin(elevation) * radius),
      Math.cos(azimuth) * flat
    )

    if (emitChange) this.onLightingChange?.(this.getLighting())
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
    this.dragButton = 0
    this.dragDistance = 0
    this.pointerId = null
    this.canvas.classList.remove('is-looking')
  }

  applyLook() {
    if (this.contentMode === 'object') {
      this.updateOrbitCamera()
      return
    }
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
    this.initialOrbit = {
      target: this.orbitTarget.clone(),
      radius: this.orbitRadius,
      yaw: this.orbitYaw,
      pitch: this.orbitPitch,
      zoom: this.zoom
    }
  }

  /**
   * Restore position, look direction, and zoom from when the space was created.
   * @returns {boolean}
   */
  resetView() {
    if (!this.initialPose && !this.spawn) return false

    if (this.contentMode === 'object' && this.initialOrbit) {
      this.orbitTarget.copy(this.initialOrbit.target)
      this.orbitRadius = this.initialOrbit.radius
      this.orbitYaw = this.initialOrbit.yaw
      this.orbitPitch = this.initialOrbit.pitch
      this.yaw = this.orbitYaw
      this.pitch = this.orbitPitch
      this.applyLook()
      this.setZoom(this.initialOrbit.zoom)
      this.keys = Object.create(null)
      this.setExploring(false)
      return true
    }

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
    this.contentMode = space.mode === 'object' ? 'object' : 'space'
    this.scene.add(this.spaceMesh)
    if (this.enclosure) this.scene.add(this.enclosure)

    const keyTargetPos = space.bounds.getCenter(new THREE.Vector3())
    keyTargetPos.y = THREE.MathUtils.clamp(this.floorY + 0.95, space.bounds.min.y, space.bounds.max.y + 1)
    this.keyTarget.position.copy(keyTargetPos)

    this.worldAxes.position.set(0, this.floorY, 0)
    const fogColor = this.currentTheme === 'light' ? SCENE_THEMES.light.fog : SCENE_THEMES.dark.fog
    this.scene.fog = new THREE.Fog(fogColor, 18, 48)

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy()
    this.spaceMesh.traverse((obj) => {
      const map = obj.material?.map
      if (map) {
        map.anisotropy = maxAniso
        map.needsUpdate = true
      }
    })

    if (this.contentMode === 'object') {
      const center = space.bounds.getCenter(new THREE.Vector3())
      const size = space.bounds.getSize(new THREE.Vector3())
      this.orbitTarget.copy(center)
      this.orbitTarget.y = Math.max(this.floorY + 0.8, center.y)

      const spawnOffset = space.spawn.clone().sub(this.orbitTarget)
      const span = Math.max(size.x, size.y, size.z, 1)
      const defaultRadius = THREE.MathUtils.clamp(span * 1.9, 2.2, 9.5)
      this.orbitRadius = THREE.MathUtils.clamp(
        spawnOffset.length() > 0.2 ? spawnOffset.length() : defaultRadius,
        this.orbitMinRadius,
        this.orbitMaxRadius
      )

      this.orbitYaw = Math.atan2(spawnOffset.x || 0, spawnOffset.z || 1)
      this.orbitPitch = Math.asin(
        THREE.MathUtils.clamp((spawnOffset.y || 0) / Math.max(1e-6, this.orbitRadius), -1, 1)
      )

      this.yaw = this.orbitYaw
      this.pitch = this.orbitPitch
      this.applyLook()
      this.setExploring(false)
    } else {
      this.camera.position.copy(space.spawn)
      this.camera.lookAt(0, space.spawn.y, space.spawn.z - 6)
      this.syncEulerFromCamera()
      this.setExploring(true)
    }
    this.resetZoom()
    this.captureInitialPose()
    this.keys = Object.create(null)
    this.setVisualTheme(this.currentTheme)
    this.applyLighting(false)
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
    if (!this.spaceMesh) return

    if (this.contentMode === 'object') {
      let rotated = false
      if (this.keys.KeyQ || this.keys.ArrowLeft) {
        this.orbitYaw += this.turnSpeed * dt
        rotated = true
      }
      if (this.keys.KeyE || this.keys.ArrowRight) {
        this.orbitYaw -= this.turnSpeed * dt
        rotated = true
      }
      if (this.keys.KeyW || this.keys.ArrowUp) {
        this.orbitPitch += this.turnSpeed * dt * 0.72
        rotated = true
      }
      if (this.keys.KeyS || this.keys.ArrowDown) {
        this.orbitPitch -= this.turnSpeed * dt * 0.72
        rotated = true
      }

      if (rotated) {
        this.orbitYaw = wrapAngle(this.orbitYaw)
        this.orbitPitch = wrapAngle(this.orbitPitch)
        this.yaw = this.orbitYaw
        this.pitch = this.orbitPitch
        this.applyLook()
      }
      return
    }

    if (!this.exploring) return

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
    // Use right = up x forward (right-handed system). forward x up becomes left.
    this.right.crossVectors(WORLD_UP, this.forward).normalize()

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

  updateOrbitCamera() {
    this.orbitYaw = this.yaw
    this.orbitPitch = this.pitch
    this.orbitEuler.set(this.orbitPitch, this.orbitYaw, 0)
    this.orbitQuat.setFromEuler(this.orbitEuler)

    this.orbitOffset.set(0, 0, this.orbitRadius).applyQuaternion(this.orbitQuat)
    this.camera.position.copy(this.orbitTarget).add(this.orbitOffset)
    this.camera.quaternion.copy(this.orbitQuat)
  }

  /**
   * Pan object orbit target with right-drag while preserving camera distance.
   * @param {number} dx
   * @param {number} dy
   */
  panOrbitTarget(dx, dy) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize()
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize()

    const panScale = Math.max(0.0008, this.orbitRadius * 0.0012)
    this.orbitTarget
      .addScaledVector(right, -dx * panScale)
      .addScaledVector(up, dy * panScale)

    this.updateOrbitCamera()
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

function wrapAngle(rad) {
  const twoPi = Math.PI * 2
  if (!Number.isFinite(rad)) return 0
  return ((((rad + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI
}

function wrapDegrees(deg) {
  const n = Number.isFinite(deg) ? deg : 0
  return ((((n + 180) % 360) + 360) % 360) - 180
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
