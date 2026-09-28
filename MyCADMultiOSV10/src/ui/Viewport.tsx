// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { drawStyleSpec, type CadDocument } from '../core/model'
import { solidGeometry } from '../core/stl'
import type { Settings } from '../core/settings'
import {
  axisLabelSize, axisLength, cameraFromOrbit, clampLightAngles, dragPosition, gridSpec,
  lightAngles, lightPosition, navAction, orbitForPreset, panOrbit, raySphereDirection, rotateOrbit,
  sceneRadius, tickLabel, viewDistance, viewSpan, roundStep, type OrbitState
} from '../core/viewnav'
import { boundingBoxOf } from '../core/primitives'
import { buildOverlay, mergeBounds, overlayBounds, overlayFramingKey } from '../core/overlay'
import { formatLength } from '../core/units'
import type { UnitSchema } from '../core/units'
import { themeById } from '../core/themes'
import { menuIcon, translate } from '../core/i18n'

export function Viewport({
  doc,
  settings,
  zoom,
  onSelect,
  onCursor,
  onContext,
  onDropFiles,
  onZoom,
  onPreset,
  onMoveSolid,
  onMoveLight,
  onMoveScaleMarker,
  resetKey = 0
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
  /** called once when a drag finishes, with the new position */
  onMoveSolid: (id: string, position: { x: number; y: number; z: number }) => void
  /** called once when the light gizmo is dropped, with its new angles */
  onMoveLight: (angles: { azimuth: number; elevation: number }, index: number) => void
  onMoveScaleMarker: (at: { x: number; y: number } | null) => void
  /** changing this value re-centres the camera on the default view */
  resetKey?: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const orbit = useRef<OrbitState>({ azimuth: Math.PI / 4, polar: 0.9, tx: 0, ty: 0, tz: 0 })
  const preset = useRef(doc.preset)
  const resetSeen = useRef(resetKey)
  // Radius the camera was last framed for, and the shapes that produced it.
  const frameRadius = useRef<number | null>(null)
  const framingKey = useRef('')
  const handlers = useRef({ onSelect, onCursor, onContext, onZoom, onMoveSolid, onMoveLight })
  handlers.current = { onSelect, onCursor, onContext, onZoom, onMoveSolid, onMoveLight }

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl') || probe.getContext('webgl2')
    if (!gl) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.localClippingEnabled = true
    // Section planes: the document's own half cut plus the axis planes from the
    // settings, the way FreeCAD's clipping dialog sets them up.
    const clipPlanes = doc.section ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)] : []
    for (const plane of settings.clip ?? []) {
      if (!plane.enabled) continue
      const normal = new THREE.Vector3(plane.axis === 'x' ? 1 : 0, plane.axis === 'y' ? 1 : 0, plane.axis === 'z' ? 1 : 0)
      if (!plane.flip) normal.negate()
      clipPlanes.push(new THREE.Plane(normal, plane.flip ? -plane.offset : plane.offset))
    }
    if (clipPlanes.length) renderer.clippingPlanes = clipPlanes
    parent.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    // The scene radius drives the axes, the grid, the near/far planes and the
    // camera distance, so a 4 m wall is framed like a 40 mm cube.
    const visible = doc.solids.filter((solid) => solid.visible)
    // The Draft, GSD and SketchUp curve tools put their result in the document
    // extras rather than in the solid list, so the overlay is framed and drawn
    // alongside the solids: a drawing with no solid in it still fills the view.
    const wires = doc.extras?.wires ?? []
    const annotations = doc.extras?.annotations ?? []
    const radius = settings.autoScaleAxes
      ? sceneRadius(mergeBounds(boundingBoxOf(visible), overlayBounds(wires, annotations)))
      : 0
    const axisSpan = axisLength(radius)
    // The grid follows the zoom: the step is chosen for what the camera can
    // see, so the lines keep the same spacing on screen at every magnification.
    const grid = gridSpec(radius, zoom)
    // The camera is framed for how big the model is, not for where it sits:
    // dragging a solid across the scene must not change the magnification.
    const framing = visible
      .map((solid) => `${solid.id}:${solid.size.x},${solid.size.y},${solid.size.z},${solid.size.radius},${solid.scale.x},${solid.scale.y},${solid.scale.z}`)
      .concat(overlayFramingKey(wires, annotations) || [])
      .join('|')
    if (framingKey.current !== framing || frameRadius.current === null) {
      framingKey.current = framing
      frameRadius.current = radius
    }
    const distance = viewDistance(frameRadius.current ?? radius, zoom)
    const near = Math.max(0.05, distance / 4000)
    const far = Math.max(5000, distance * 12)
    // Orthographic is FreeCAD's default for drafting; the frustum is sized so
    // both projections frame the model the same way.
    const orthographic = settings.projection === 'orthographic'
    const halfHeight = Math.tan((45 * Math.PI) / 360) * distance
    const camera = orthographic
      ? new THREE.OrthographicCamera(-halfHeight, halfHeight, halfHeight, -halfHeight, -far, far)
      : new THREE.PerspectiveCamera(45, 1, near, far)
    if (resetSeen.current !== resetKey) frameRadius.current = radius
    if (preset.current !== doc.preset || resetSeen.current !== resetKey) {
      preset.current = doc.preset
      resetSeen.current = resetKey
      const next = orbitForPreset(doc.preset)
      orbit.current = { ...orbit.current, ...next, tx: 0, ty: 0, tz: 0 }
    }
    let gridHelper: THREE.GridHelper | null = null
    const placeCamera = () => {
      const at = cameraFromOrbit(orbit.current, distance)
      camera.position.set(at.x, at.y, at.z)
      camera.lookAt(orbit.current.tx, orbit.current.ty, orbit.current.tz)
      // Panning slides the grid along with the camera, by whole steps so the
      // lines stay on round coordinates, and only as far as the model can
      // spare: the part itself always keeps grid under it.
      if (gridHelper) {
        const onStep = (value: number) => {
          const stepped = Math.round(value / grid.step) * grid.step
          return Math.max(-grid.panLimit, Math.min(grid.panLimit, stepped))
        }
        gridHelper.position.set(onStep(orbit.current.tx), 0, onStep(orbit.current.tz))
      }
    }
    placeCamera()
    // Lighting rig: the scene may hold several lights, each with its own
    // kind, colour and place in the sky. The toolbar edits one of them; the
    // markers in the canvas can all be dragged.
    const rigs = settings.lights?.length ? settings.lights : [settings.light]
    const anyOn = rigs.some((item) => item.enabled)
    // The fill light belongs to the scene: switched off everywhere, a dim
    // flat fill stays so the model is still readable.
    const fill = rigs[0]?.ambient ?? 0.65
    const ambient = new THREE.AmbientLight(0xffffff, anyOn ? fill : Math.max(0.18, fill * 0.35))
    scene.add(ambient)
    const reach = Math.max(200, radius * 3)
    type Mover = { light: { position: { set: (x: number, y: number, z: number) => void } }; dAzimuth: number; dElevation: number }
    interface Lamp {
      index: number
      marker: THREE.Mesh
      aim: (azimuth: number, elevation: number) => void
      angles: { azimuth: number; elevation: number }
    }
    const lamps: Lamp[] = []
    // Everything the lamps put in the scene, so it can all be thrown away
    // together when the view is rebuilt.
    const lampObjects: THREE.Object3D[] = []

    rigs.forEach((rig, index) => {
      const place = lightPosition(rig.azimuth, rig.elevation, reach)
      // Each source keeps its own angular offset from the rig angles, so
      // dragging one marker moves the whole set that belongs to it.
      const strength = rig.enabled ? rig.intensity : 0
      const keyColor = new THREE.Color(rig.color || '#ffffff')
      const movers: Mover[] = []
      const track = (light: Mover['light'], dAzimuth = 0, dElevation = 0) => {
        movers.push({ light, dAzimuth, dElevation })
        scene.add(light as unknown as THREE.Object3D)
        return light
      }
      if (rig.kind === 'point') {
        // decay 0 keeps the brightness independent of the model size.
        track(new THREE.PointLight(keyColor, strength * 1.3, 0, 0))
      } else if (rig.kind === 'spot') {
        const spot = new THREE.SpotLight(keyColor, strength * 2.2, 0, Math.PI / 5, 0.4, 0)
        spot.target.position.set(0, 0, 0)
        scene.add(spot.target)
        track(spot)
      } else if (rig.kind === 'hemisphere') {
        track(new THREE.HemisphereLight(keyColor, 0x2f353d, strength * 1.2))
        track(new THREE.DirectionalLight(keyColor, strength * 0.35))
      } else if (rig.kind === 'threePoint') {
        track(new THREE.DirectionalLight(keyColor, strength))
        track(new THREE.DirectionalLight(keyColor, strength * 0.45), 120, -20)
        track(new THREE.DirectionalLight(keyColor, strength * 0.3), -145, 12)
      } else if (rig.kind !== 'ambientOnly') {
        track(new THREE.DirectionalLight(keyColor, strength))
      }
      if (rig.kind === 'ambientOnly' && rig.enabled) {
        // Flat, shadowless light: only the fill stays, raised so shapes read.
        ambient.intensity = Math.max(ambient.intensity, rig.intensity)
      }

      // The light is drawn in the scene while it is on: a sun marker with rays
      // and a line back to the origin, which can be dragged to move it.
      // Switched off, there is nothing to show and nothing to grab.
      const lightGizmo = new THREE.Group()
      const markerRadius = Math.max(2, reach * 0.045)
      const lightColor = rig.enabled
        ? new THREE.Color(rig.color || '#ffffff').lerp(new THREE.Color(0xffd166), 0.45)
        : new THREE.Color(0x8b96a3)
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(markerRadius, 20, 14),
        new THREE.MeshBasicMaterial({ color: lightColor, depthTest: false, transparent: true, opacity: 0.95 })
      )
      marker.renderOrder = 4
      marker.userData.light = true
      marker.userData.lightIndex = index
      lightGizmo.add(marker)
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8
        const ray = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(Math.cos(angle) * markerRadius * 1.3, Math.sin(angle) * markerRadius * 1.3, 0),
            new THREE.Vector3(Math.cos(angle) * markerRadius * 2, Math.sin(angle) * markerRadius * 2, 0)
          ]),
          new THREE.LineBasicMaterial({ color: lightColor, depthTest: false, transparent: true, opacity: 0.9 })
        )
        ray.renderOrder = 4
        lightGizmo.add(ray)
      }
      // The light being edited wears a ring, so it is clear which one the
      // toolbar sliders move.
      if (index === (settings.activeLight ?? 0) && rigs.length > 1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(markerRadius * 2.2, markerRadius * 2.6, 28),
          new THREE.MeshBasicMaterial({ color: lightColor, depthTest: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
        )
        ring.renderOrder = 4
        lightGizmo.add(ring)
      }
      const beamGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(place.x, place.y, place.z)
      ])
      const beam = new THREE.Line(
        beamGeometry,
        new THREE.LineBasicMaterial({ color: lightColor, depthTest: false, transparent: true, opacity: 0.45 })
      )
      beam.renderOrder = 3
      lightGizmo.position.set(place.x, place.y, place.z)
      lightGizmo.visible = rig.enabled
      beam.visible = rig.enabled
      if (rig.enabled) {
        scene.add(lightGizmo)
        scene.add(beam)
      }
      const aim = (azimuth: number, elevation: number) => {
        for (const mover of movers) {
          const at = lightPosition(azimuth + mover.dAzimuth, Math.max(-85, Math.min(89, elevation + mover.dElevation)), reach)
          mover.light.position.set(at.x, at.y, at.z)
        }
        const next = lightPosition(azimuth, elevation, reach)
        lightGizmo.position.set(next.x, next.y, next.z)
        beamGeometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(next.x, next.y, next.z)])
        beamGeometry.attributes.position.needsUpdate = true
      }
      aim(rig.azimuth, rig.elevation)
      lampObjects.push(lightGizmo, beam)
      lamps.push({ index, marker, aim, angles: { azimuth: rig.azimuth, elevation: rig.elevation } })
    })
    const theme = themeById(settings.theme)
    if (settings.grid) {
      gridHelper = new THREE.GridHelper(grid.size, grid.divisions, theme.colors.gridMajor, theme.colors.gridMinor)
      scene.add(gridHelper)
      placeCamera()
    }
    const axes = createAxes(axisSpan, axisLabelSize(axisSpan))
    axes.visible = settings.showAxes !== false
    scene.add(axes)
    const axesScene = new THREE.Scene()
    const axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 20)
    const cornerAxes = createAxes(1.6, 0.55)
    axesScene.add(cornerAxes)
    const meshes: THREE.Mesh[] = []
    const style = drawStyleSpec(doc.shade)
    for (const solid of doc.solids) {
      if (!solid.visible) continue
      const geometry = solidGeometry(solid)
      const material = style.lit
        ? new THREE.MeshStandardMaterial({
            color: solid.color,
            metalness: solid.metalness,
            roughness: solid.roughness,
            flatShading: style.flat
          })
        : new THREE.MeshBasicMaterial({
            color: style.blank ? theme.colors.bg : solid.color,
            wireframe: style.wireframe
          })
      const mesh = new THREE.Mesh(geometry, material)
      if (style.points) {
        // Points style: the vertices stand in for the surface.
        const cloud = new THREE.Points(
          geometry,
          new THREE.PointsMaterial({ color: solid.color, size: Math.max(0.6, radius * 0.012) })
        )
        mesh.add(cloud)
        material.visible = false
      }
      if (style.edges) {
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 20),
          new THREE.LineBasicMaterial({ color: theme.colors.text, transparent: true, opacity: 0.8 })
        )
        mesh.add(outline)
      }
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
    // The wireframe overlay: Draft lines and arcs, GSD curves, SketchUp faces
    // and section outlines, and the dimensions and notes that go with them.
    // It draws over the solids without depth testing, the way a CAD overlay
    // does, so a curve on a face is not swallowed by it.
    const overlay = buildOverlay(wires, annotations, radius)
    const overlayObjects: THREE.Object3D[] = []
    const addOverlayLines = (positions: number[], color: string, opacity: number) => {
      if (positions.length === 0) return
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      const lines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity })
      )
      lines.renderOrder = 4
      scene.add(lines)
      overlayObjects.push(lines)
    }
    addOverlayLines(overlay.wires, theme.colors.accent, 0.95)
    addOverlayLines(overlay.annotations, theme.colors.text, 0.85)
    for (const label of overlay.labels) {
      const sprite = noteLabel(label.text, theme.colors.text, label.size)
      sprite.position.set(label.at.x, label.at.y, label.at.z)
      scene.add(sprite)
      overlayObjects.push(sprite)
    }
    // Selection is shown three ways so it reads in any theme or shading mode:
    // the surface glows, its edges are outlined and a box brackets it.
    const selected = new Set(doc.selection)
    const highlights: THREE.Object3D[] = []
    // Selection brackets are world-space, so a dragged solid needs its own
    // bracket refreshed on every pointer move to stay glued to the shape.
    const brackets = new Map<string, { helper: THREE.Box3Helper; pad: number }>()
    const accent = new THREE.Color(theme.colors.accent)
    for (const mesh of meshes) {
      if (!selected.has(String(mesh.userData.id))) continue
      const material = mesh.material as THREE.MeshStandardMaterial
      // Only the lit materials carry an emissive uniform; the unlit draw styles
      // rely on the outline and the bracket alone.
      if (style.lit) material.emissive = accent.clone().multiplyScalar(0.35)
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry, 20),
        new THREE.LineBasicMaterial({ color: accent, depthTest: false, transparent: true, opacity: 0.95 })
      )
      outline.renderOrder = 5
      mesh.add(outline)
      highlights.push(outline)
      const pad = Math.max(0.5, radius * 0.01)
      const bounds = new THREE.Box3().setFromObject(mesh).expandByScalar(pad)
      const bracket = new THREE.Box3Helper(bounds, accent)
      brackets.set(String(mesh.userData.id), { helper: bracket, pad })
      const bracketMaterial = bracket.material as THREE.LineBasicMaterial
      bracketMaterial.depthTest = false
      bracketMaterial.transparent = true
      bracketMaterial.opacity = 0.55
      bracket.renderOrder = 5
      scene.add(bracket)
      highlights.push(bracket)
    }
    /** Re-fit the selection bracket around a solid that has just moved. */
    const syncBracket = (mesh: THREE.Mesh) => {
      const entry = brackets.get(String(mesh.userData.id))
      if (!entry) return
      entry.helper.box.setFromObject(mesh).expandByScalar(entry.pad)
      entry.helper.updateMatrixWorld(true)
    }

    const resize = () => {
      const width = parent.clientWidth || 640
      const height = parent.clientHeight || 480
      renderer.setSize(width, height, false)
      const aspect = width / Math.max(1, height)
      if (orthographic) {
        camera.left = -halfHeight * aspect
        camera.right = halfHeight * aspect
        camera.top = halfHeight
        camera.bottom = -halfHeight
      } else {
        camera.aspect = aspect
      }
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
    const castRay = (event: PointerEvent | MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      return raycaster
    }
    const pickHit = (event: PointerEvent | MouseEvent) => castRay(event).intersectObjects(meshes, false)[0]
    const pickLight = (event: PointerEvent | MouseEvent) => {
      for (const lamp of lamps) {
        if (!lamp.marker.visible && !lamp.marker.parent) continue
        if (castRay(event).intersectObject(lamp.marker, false)[0]) return lamp
      }
      return undefined
    }
    const pick = (event: PointerEvent | MouseEvent) => pickHit(event)?.object.userData.id as string | undefined

    // Dragging moves the picked solid on the ground plane; shift drags it
    // vertically. The three.js mesh follows the pointer live and the store is
    // updated once, when the drag ends, so undo steps over the whole move.
    let dragSolid: {
      id: string
      mesh: THREE.Mesh
      grabPoint: { x: number; y: number; z: number }
      offset: { x: number; y: number; z: number }
      moved: boolean
      last: { x: number; y: number; z: number }
    } | null = null
    let dragLight: { index: number; moved: boolean; last: { azimuth: number; elevation: number }; aim: Lamp['aim'] } | null = null
    let drag: { button: number; x: number; y: number; moved: number } | null = null
    const onPointer = (event: PointerEvent) => {
      drag = { button: event.button, x: event.clientX, y: event.clientY, moved: 0 }
      renderer.domElement.setPointerCapture?.(event.pointerId)
      if (event.button !== 0) return
      // The light marker is grabbed before the model, so it stays reachable
      // even when it sits in front of a solid.
      const lamp = pickLight(event)
      if (lamp) {
        dragLight = { index: lamp.index, moved: false, last: { ...lamp.angles }, aim: lamp.aim }
        return
      }
      const hit = pickHit(event)
      if (!hit) return
      const id = String(hit.object.userData.id)
      const solid = doc.solids.find((item) => item.id === id)
      if (!solid || solid.locked) return
      const mesh = hit.object as THREE.Mesh
      dragSolid = {
        id,
        mesh,
        grabPoint: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        offset: {
          x: mesh.position.x - hit.point.x,
          y: mesh.position.y - hit.point.y,
          z: mesh.position.z - hit.point.z
        },
        moved: false,
        last: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
      }
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
      if (dragLight && drag.button === 0) {
        const ray = castRay(event).ray
        const direction = raySphereDirection(
          { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
          { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
          { x: 0, y: 0, z: 0 },
          reach
        )
        if (direction) {
          const angles = clampLightAngles(
            lightAngles(direction).azimuth,
            lightAngles(direction).elevation
          )
          dragLight.aim(angles.azimuth, angles.elevation)
          dragLight.last = angles
          dragLight.moved = true
          handlers.current.onCursor({ x: angles.azimuth, y: angles.elevation, z: 0 })
        }
        return
      }
      if (dragSolid && drag.button === 0) {
        const ray = castRay(event).ray
        const cameraDirection = camera.getWorldDirection(new THREE.Vector3())
        const next = dragPosition({
          origin: { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
          direction: { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
          grabPoint: dragSolid.grabPoint,
          offset: dragSolid.offset,
          cameraDirection: { x: cameraDirection.x, y: cameraDirection.y, z: cameraDirection.z },
          vertical: event.shiftKey,
          snap: event.altKey ? 0 : settings.snap
        })
        if (next) {
          dragSolid.mesh.position.set(next.x, next.y, next.z)
          // The frame follows the shape within the same frame, not after it.
          syncBracket(dragSolid.mesh)
          dragSolid.last = next
          dragSolid.moved = true
          handlers.current.onCursor(next)
        }
        return
      }
      const action = navAction(settings.navigation ?? 'cad', {
        button: drag.button,
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey
      })
      if (action === 'none') return
      if (action === 'pan') orbit.current = panOrbit(orbit.current, dx, dy, distance)
      else orbit.current = rotateOrbit(orbit.current, dx, dy)
      placeCamera()
    }
    const onUp = (event: PointerEvent) => {
      if (dragLight) {
        const finished = dragLight
        dragLight = null
        if (finished.moved) {
          drag = null
          handlers.current.onMoveLight(finished.last, finished.index)
          return
        }
      }
      if (dragSolid) {
        const finished = dragSolid
        dragSolid = null
        if (finished.moved) {
          drag = null
          handlers.current.onMoveSolid(finished.id, finished.last)
          return
        }
      }
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
      for (const highlight of highlights) disposeObject(highlight)
      for (const object of overlayObjects) disposeObject(object)
      for (const object of lampObjects) disposeObject(object)
    }
  }, [doc, settings.grid, settings.theme, settings.showAxes, settings.autoScaleAxes, settings.snap, settings.light, settings.lights, settings.activeLight, settings.projection, settings.clip, settings.navigation, zoom, resetKey])

  const layerStyle = settings.backgroundImage
    ? { backgroundImage: `url(${settings.backgroundImage})`, opacity: settings.backgroundOpacity / 100 }
    : undefined

  // The ruler and the scale marker read off the same radius the scene is
  // framed for, overlay included, so they agree with what the camera shows.
  const shownRadius = settings.autoScaleAxes
    ? sceneRadius(mergeBounds(
        boundingBoxOf(doc.solids.filter((solid) => solid.visible)),
        overlayBounds(doc.extras?.wires ?? [], doc.extras?.annotations ?? [])
      ))
    : 0

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
        {/* The icon carries the view; the name stays in the tooltip, where it
            does not take four words of canvas. */}
        {(['top', 'front', 'right', 'iso'] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            data-testid={`viewcube-${preset}`}
            aria-label={translate(settings.language, preset)}
            title={translate(settings.language, preset)}
            onClick={() => onPreset(preset)}
          >
            <span className="menu-icon" aria-hidden="true">{menuIcon(preset)}</span>
          </button>
        ))}
      </div>
      {settings.ruler ? <ScaleRuler zoom={zoom} radius={shownRadius} /> : null}
      {settings.scaleBar === false ? null : (
      <ScaleMarker
        zoom={zoom}
        radius={shownRadius}
        units={settings.units ?? 'mm'}
        at={settings.scaleMarker}
        onMove={onMoveScaleMarker}
      />
      )}
      <div className="nav-hint">Wheel zoom · Drag rotate · Right drag pan · Drag object to move (Shift: up/down, Alt: 1 mm steps) · Drag ☀ to move the light</div>
    </div>
  )
}

/**
 * The scale marker: a bar of a round length with the distance it stands for.
 * It can be dragged anywhere on the canvas and goes back to its corner when
 * the view is reset.
 */
function ScaleMarker({
  zoom,
  radius,
  units,
  at,
  onMove
}: {
  zoom: number
  radius: number
  units: UnitSchema
  at: { x: number; y: number } | null
  onMove: (at: { x: number; y: number } | null) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState<{ dx: number; dy: number } | null>(null)
  useEffect(() => {
    const parent = host.current?.parentElement
    if (!parent) return
    const measure = () => setSize({ width: parent.clientWidth, height: parent.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  // Before the canvas has been measured — a fresh mount, or a headless run —
  // assume an ordinary window so the marker is still drawn.
  const height = size.height > 0 ? size.height : 600
  const width0 = size.width > 0 ? size.width : 900
  const pxPerMm = height / Math.max(1e-6, viewSpan(radius, zoom))
  // A round distance that comes out somewhere near 140 px on screen.
  const distance = roundStep(140 / pxPerMm)
  const width = Math.max(24, distance * pxPerMm)
  // The bar starts in the top left corner, out of the way of the status bar
  // and the horizontal ruler along the bottom edge. `bottom` is what places
  // it, so the top of the canvas is the far end of that axis. Dragging it
  // puts it anywhere and that position is remembered.
  const home = { x: 18, y: Math.max(4, height - 40) }
  // A pointer event without coordinates (a synthetic one, say) must not turn
  // the marker's position into NaN.
  const place = at && Number.isFinite(at.x) && Number.isFinite(at.y) ? at : home
  const left = Math.max(4, Math.min(Math.max(4, width0 - width - 12), place.x))
  const bottom = Math.max(4, Math.min(Math.max(4, height - 40), place.y))
  return (
    <div
      ref={host}
      className={dragging ? 'scale-marker dragging' : 'scale-marker'}
      data-testid="scale-marker"
      data-distance={distance}
      style={{ left, bottom, width }}
      title={`${formatLength(distance, units)}`}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const box = event.currentTarget.getBoundingClientRect()
        setDragging({ dx: event.clientX - box.left, dy: box.bottom - event.clientY })
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragging) return
        event.stopPropagation()
        const parent = host.current?.parentElement
        if (!parent) return
        const box = parent.getBoundingClientRect()
        const x = Math.round(event.clientX - box.left - dragging.dx)
        const y = Math.round(box.bottom - event.clientY - dragging.dy)
        if (Number.isFinite(x) && Number.isFinite(y)) onMove({ x, y })
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        setDragging(null)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      }}
    >
      <span className="scale-marker-label" data-testid="scale-marker-label">{formatLength(distance, units)}</span>
      <span className="scale-marker-bar" aria-hidden="true" />
    </div>
  )
}

function ScaleRuler({ zoom, radius }: { zoom: number; radius: number }) {
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
  const worldHeight = viewSpan(radius, zoom)
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
  const major = roundStep(56 / pxPerMm)
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
        <span key={tickLabel(tick.value, minor)}>
          <i className={tick.isMajor ? 'scale-tick major' : 'scale-tick minor'} style={axis === 'x' ? { left: tick.offset } : { bottom: tick.offset }} />
          {tick.isMajor ? <b className="scale-label" style={axis === 'x' ? { left: tick.offset } : { bottom: tick.offset }}>{tickLabel(tick.value, major)}</b> : null}
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

/**
 * A dimension value or a note, as a sprite. Unlike an axis letter this is a
 * whole string, so the canvas is cut to the width the text measures and the
 * sprite keeps that aspect: "120.00 mm" stays legible instead of squashing
 * into a square.
 */
function noteLabel(text: string, color: string, size: number) {
  const height = 64
  const font = `600 ${Math.round(height * 0.62)}px sans-serif`
  const canvas = document.createElement('canvas')
  const measure = canvas.getContext('2d')
  let width = height * 2
  if (measure) {
    measure.font = font
    width = Math.max(height, Math.ceil(measure.measureText(text).width) + height * 0.5)
  }
  canvas.width = width
  canvas.height = height
  // Setting the canvas size clears it and drops the font, so the context is
  // configured again after the resize.
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = color
    context.font = font
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, width / 2, height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  sprite.scale.set((size * width) / height, size, 1)
  sprite.renderOrder = 6
  return sprite
}

function disposeObject(object: { traverse: (callback: (child: { geometry?: { dispose: () => void }; material?: { dispose: () => void; map?: { dispose: () => void } } }) => void) => void }) {
  object.traverse((child) => {
    child.geometry?.dispose()
    child.material?.map?.dispose()
    child.material?.dispose()
  })
}
