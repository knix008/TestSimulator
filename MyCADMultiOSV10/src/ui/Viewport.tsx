// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { CadDocument } from '../core/model'
import { solidGeometry } from '../core/stl'
import type { Settings } from '../core/settings'
import { cameraFromOrbit, orbitForPreset, panOrbit, rotateOrbit, type OrbitState } from '../core/viewnav'

export function Viewport({
  doc,
  settings,
  zoom,
  onSelect,
  onCursor,
  onContext,
  onDropFiles,
  onZoom,
  onPreset
}: {
  doc: CadDocument
  settings: Settings
  zoom: number
  onSelect: (id: string | null, additive: boolean) => void
  onCursor: (point: { x: number; y: number; z: number } | null) => void
  onContext: (x: number, y: number) => void
  onDropFiles: (files: File[]) => void
  onZoom: (deltaY: number) => void
  onPreset: (preset: 'front' | 'top' | 'right' | 'iso') => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const orbit = useRef<OrbitState>({ azimuth: Math.PI / 4, polar: 0.9, tx: 0, ty: 0, tz: 0 })
  const preset = useRef(doc.preset)
  const handlers = useRef({ onSelect, onCursor, onContext, onZoom })
  handlers.current = { onSelect, onCursor, onContext, onZoom }

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl') || probe.getContext('webgl2')
    if (!gl) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.localClippingEnabled = true
    if (doc.section) renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)]
    parent.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000)
    const distance = 280 * (100 / Math.max(10, zoom))
    if (preset.current !== doc.preset) {
      preset.current = doc.preset
      const next = orbitForPreset(doc.preset)
      orbit.current = { ...orbit.current, ...next, tx: 0, ty: 0, tz: 0 }
    }
    const placeCamera = () => {
      const at = cameraFromOrbit(orbit.current, distance)
      camera.position.set(at.x, at.y, at.z)
      camera.lookAt(orbit.current.tx, orbit.current.ty, orbit.current.tz)
    }
    placeCamera()
    scene.add(new THREE.AmbientLight(0xffffff, 0.65))
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(-80, 140, 60)
    scene.add(sun)
    if (settings.grid) scene.add(new THREE.GridHelper(400, 20, 0x3d5a73, 0x2a3b4a))
    const axes = createAxes(80, 16)
    scene.add(axes)
    const axesScene = new THREE.Scene()
    const axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 20)
    const cornerAxes = createAxes(1.6, 0.55)
    axesScene.add(cornerAxes)
    const meshes: THREE.Mesh[] = []
    for (const solid of doc.solids) {
      if (!solid.visible) continue
      const geometry = solidGeometry(solid)
      const material = new THREE.MeshStandardMaterial({
        color: solid.color,
        metalness: solid.metalness,
        roughness: solid.roughness,
        wireframe: doc.shade === 'wireframe'
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(solid.position.x, solid.position.y, solid.position.z)
      mesh.rotation.set(
        THREE.MathUtils.degToRad(solid.rotation.x),
        THREE.MathUtils.degToRad(solid.rotation.y),
        THREE.MathUtils.degToRad(solid.rotation.z)
      )
      mesh.scale.set(solid.scale.x, solid.scale.y, solid.scale.z)
      mesh.userData.id = solid.id
      scene.add(mesh)
      meshes.push(mesh)
    }
    const selected = new Set(doc.selection)
    for (const mesh of meshes) {
      if (selected.has(String(mesh.userData.id))) {
        const material = mesh.material as THREE.MeshStandardMaterial
        material.emissive = new THREE.Color('#16324a')
      }
    }

    const resize = () => {
      const width = parent.clientWidth || 640
      const height = parent.clientHeight || 480
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    let frame = 0
    renderer.autoClear = false
    const loop = () => {
      frame = requestAnimationFrame(loop)
      const width = parent.clientWidth || 640
      const height = parent.clientHeight || 480
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, width, height)
      renderer.clear()
      renderer.render(scene, camera)
      const size = 96
      const margin = 12
      renderer.setScissorTest(true)
      renderer.setScissor(margin, margin, size, size)
      renderer.setViewport(margin, margin, size, size)
      renderer.clearDepth()
      const target = new THREE.Vector3(orbit.current.tx, orbit.current.ty, orbit.current.tz)
      axesCamera.position.copy(camera.position).sub(target).normalize().multiplyScalar(4.2)
      axesCamera.up.copy(camera.up)
      axesCamera.lookAt(0, 0, 0)
      renderer.render(axesScene, axesCamera)
      renderer.setScissorTest(false)
    }
    loop()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(meshes, false)
      return hits[0]?.object.userData.id as string | undefined
    }
    let drag: { button: number; x: number; y: number; moved: number } | null = null
    const onPointer = (event: PointerEvent) => {
      drag = { button: event.button, x: event.clientX, y: event.clientY, moved: 0 }
      renderer.domElement.setPointerCapture?.(event.pointerId)
    }
    const onMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      handlers.current.onCursor({
        x: Math.round(event.clientX - rect.left - rect.width / 2),
        y: Math.round(rect.height / 2 - (event.clientY - rect.top)),
        z: 0
      })
      if (!drag) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      drag.x = event.clientX
      drag.y = event.clientY
      drag.moved += Math.abs(dx) + Math.abs(dy)
      if (drag.moved < 3) return
      if (drag.button === 2) orbit.current = panOrbit(orbit.current, dx, dy, distance)
      else orbit.current = rotateOrbit(orbit.current, dx, dy)
      placeCamera()
    }
    const onUp = (event: PointerEvent) => {
      if (!drag || drag.moved >= 4) {
        drag = null
        return
      }
      const button = drag.button
      drag = null
      if (button === 0) handlers.current.onSelect(pick(event) ?? null, event.shiftKey)
    }
    const onMenu = (event: MouseEvent) => {
      event.preventDefault()
      if (drag && drag.moved >= 4) return
      const id = pick(event as PointerEvent)
      if (id) handlers.current.onSelect(id, false)
      handlers.current.onContext(event.clientX, event.clientY)
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      handlers.current.onZoom(event.deltaY)
    }
    renderer.domElement.addEventListener('pointerdown', onPointer)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('contextmenu', onMenu)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointer)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('contextmenu', onMenu)
      renderer.domElement.removeEventListener('wheel', onWheel)
      renderer.dispose()
      parent.removeChild(renderer.domElement)
      meshes.forEach((mesh) => {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      })
      disposeObject(axes)
      disposeObject(cornerAxes)
    }
  }, [doc, settings.grid, zoom])

  const layerStyle = settings.backgroundImage
    ? { backgroundImage: `url(${settings.backgroundImage})`, opacity: settings.backgroundOpacity / 100 }
    : undefined

  return (
    <div
      className="viewport"
      data-testid="viewport"
      ref={host}
      onDragOver={(event) => event.preventDefault()}
      onContextMenu={(event) => {
        event.preventDefault()
        onContext(event.clientX, event.clientY)
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDropFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <div className="viewport-bg" style={layerStyle} />
      <div className="viewcube" data-testid="viewcube">
        {(['top', 'front', 'right', 'iso'] as const).map((preset) => (
          <button key={preset} type="button" title={preset} onClick={() => onPreset(preset)}>{preset}</button>
        ))}
      </div>
      {settings.ruler ? <ScaleRuler zoom={zoom} /> : null}
      <div className="nav-hint">Wheel zoom · Drag rotate · Right drag pan</div>
    </div>
  )
}

function ScaleRuler({ zoom }: { zoom: number }) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const parent = host.current?.parentElement
    if (!parent) return
    const measure = () => setSize({ width: parent.clientWidth, height: parent.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  const distance = 280 * (100 / Math.max(10, zoom))
  const worldHeight = 2 * distance * Math.tan((45 * Math.PI) / 360)
  const pxPerMm = size.height > 0 ? size.height / worldHeight : 0
  return (
    <div ref={host} data-testid="scale-ruler">
      <RulerEdge axis="x" length={Math.max(0, size.width - 44)} pxPerMm={pxPerMm} />
      <RulerEdge axis="y" length={Math.max(0, size.height - 30)} pxPerMm={pxPerMm} />
    </div>
  )
}

function RulerEdge({ axis, length, pxPerMm }: { axis: 'x' | 'y'; length: number; pxPerMm: number }) {
  if (length < 8 || pxPerMm <= 0) return null
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  const major = steps.find((step) => step * pxPerMm >= 56) ?? 5000
  const minor = major / 5
  const half = length / 2
  const ticks = []
  const start = -Math.ceil(half / minor) * minor
  for (let value = start; value <= half + minor; value += minor) {
    const offset = half + value * pxPerMm
    if (offset < -1 || offset > length + 1) continue
    const isMajor = Math.abs(value / major - Math.round(value / major)) < 0.001
    ticks.push({ value, offset, isMajor })
  }
  return (
    <div className={`scale-ruler ${axis === 'x' ? 'horizontal' : 'vertical'}`}>
      {ticks.map((tick) => (
        <span key={tick.value}>
          <i className={tick.isMajor ? 'scale-tick major' : 'scale-tick minor'} style={axis === 'x' ? { left: tick.offset } : { bottom: tick.offset }} />
          {tick.isMajor ? <b className="scale-label" style={axis === 'x' ? { left: tick.offset } : { bottom: tick.offset }}>{tick.value}</b> : null}
        </span>
      ))}
    </div>
  )
}

function createAxes(length: number, labelSize: number) {
  const group = new THREE.Group()
  const specs = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xe23b3b, label: 'X' },
    { dir: new THREE.Vector3(0, 1, 0), color: 0x3cba54, label: 'Y' },
    { dir: new THREE.Vector3(0, 0, 1), color: 0x3b82e2, label: 'Z' }
  ]
  for (const spec of specs) {
    const end = spec.dir.clone().multiplyScalar(length)
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), end])
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: spec.color, depthTest: false }))
    line.renderOrder = 2
    const label = axisLabel(spec.label, `#${spec.color.toString(16).padStart(6, '0')}`, labelSize)
    label.position.copy(end.clone().multiplyScalar(1 + labelSize / Math.max(length, 0.01) * 0.55))
    group.add(line, label)
  }
  return group
}

function axisLabel(text: string, color: string, size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = color
    context.font = 'bold 84px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, 64, 68)
  }
  const texture = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  sprite.scale.set(size, size, 1)
  sprite.renderOrder = 3
  return sprite
}

function disposeObject(object: { traverse: (callback: (child: { geometry?: { dispose: () => void }; material?: { dispose: () => void; map?: { dispose: () => void } } }) => void) => void }) {
  object.traverse((child) => {
    child.geometry?.dispose()
    child.material?.map?.dispose()
    child.material?.dispose()
  })
}
