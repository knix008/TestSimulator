export interface OrbitState {
  azimuth: number
  polar: number
  tx: number
  ty: number
  tz: number
}

const PRESETS: Record<string, Pick<OrbitState, 'azimuth' | 'polar'>> = {
  iso: { azimuth: Math.PI / 4, polar: 0.9 },
  front: { azimuth: 0, polar: Math.PI / 2 },
  back: { azimuth: Math.PI, polar: Math.PI / 2 },
  left: { azimuth: -Math.PI / 2, polar: Math.PI / 2 },
  right: { azimuth: Math.PI / 2, polar: Math.PI / 2 },
  top: { azimuth: 0, polar: 0.08 },
  bottom: { azimuth: 0, polar: Math.PI - 0.08 }
}

export function orbitForPreset(preset: string): Pick<OrbitState, 'azimuth' | 'polar'> {
  return PRESETS[preset] ?? PRESETS.iso
}

export function rotateOrbit(state: OrbitState, dx: number, dy: number): OrbitState {
  const polar = Math.min(Math.PI - 0.08, Math.max(0.08, state.polar + dy * 0.008))
  return { ...state, azimuth: state.azimuth - dx * 0.008, polar }
}

export function panOrbit(state: OrbitState, dx: number, dy: number, distance: number): OrbitState {
  const scale = distance * 0.0015
  const sin = Math.sin(state.azimuth)
  const cos = Math.cos(state.azimuth)
  return {
    ...state,
    tx: state.tx - (cos * dx + sin * dy) * scale,
    tz: state.tz - (-sin * dx + cos * dy) * scale,
    ty: state.ty + dy * scale * 0.35
  }
}

export function cameraFromOrbit(state: OrbitState, distance: number): { x: number; y: number; z: number } {
  const sinP = Math.sin(state.polar)
  return {
    x: state.tx + distance * sinP * Math.sin(state.azimuth),
    y: state.ty + distance * Math.cos(state.polar),
    z: state.tz + distance * sinP * Math.cos(state.azimuth)
  }
}

/**
 * Radius of the scene, i.e. how far the furthest model point sits from the
 * origin. The axes, the grid and the default camera distance all follow it so
 * a 4 m wall is framed the same way as a 40 mm cube.
 */
export function sceneRadius(box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): number {
  const extent = Math.max(
    Math.abs(box.min.x), Math.abs(box.max.x),
    Math.abs(box.min.y), Math.abs(box.max.y),
    Math.abs(box.min.z), Math.abs(box.max.z)
  )
  return Number.isFinite(extent) ? extent : 0
}

/** Axis length: at least 80 mm, otherwise a fifth longer than the model. */
export function axisLength(radius: number): number {
  return Math.max(80, Math.ceil((radius * 1.2) / 10) * 10)
}

/** Camera distance for a zoom percentage, framing the whole model at 100%. */
export function viewDistance(radius: number, zoom: number): number {
  const base = Math.max(140, radius * 3.1)
  return base * (100 / Math.max(10, zoom))
}

/** How much of the world the 45° camera sees from top to bottom, in mm. */
export function viewSpan(radius: number, zoom: number): number {
  return 2 * viewDistance(radius, zoom) * Math.tan((45 * Math.PI) / 360)
}

/** The round number just at or above a value: 1, 2, 5, 10, 20, 50, 100 … */
export function roundStep(value: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, value))))
  return [1, 2, 5, 10].map((factor) => factor * magnitude).find((step) => step >= value) ?? magnitude * 10
}

/**
 * A ruler tick as text. The number of decimals follows the spacing, so a
 * 50 mm ruler reads "100" and a 0.2 mm one reads "0.4" — never
 * 0.30000000000000004, however far the camera is zoomed in.
 */
export function tickLabel(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step)))
  const text = value.toFixed(decimals)
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text
}

/**
 * A round grid for the current view.
 *
 * The step follows the zoom the same way the scale ruler's ticks do, so the
 * lines keep roughly the same spacing on screen however far in or out the
 * camera is. The sheet then reaches whichever is further out, the edges of the
 * viewport or the model itself, so no part is ever left sitting on bare
 * background. `panLimit` is how far the grid may slide with the camera before
 * the model would fall off it.
 */
export function gridSpec(radius: number, zoom = 100): { size: number; divisions: number; step: number; panLimit: number } {
  const span = viewSpan(radius, zoom)
  const step = Math.max(0.01, roundStep((span * 1.8) / 24))
  const reach = Math.max(span * 0.9, radius + span * 0.5)
  const divisions = Math.max(10, Math.min(400, Math.round((reach * 2) / step)))
  const size = step * divisions
  return { size, divisions, step, panLimit: Math.max(0, size / 2 - radius) }
}

/** Label size that stays readable whatever the scene scale is. */
export function axisLabelSize(length: number): number {
  return Math.max(6, length * 0.16)
}

/** Where a ray meets a plane, or null when they are parallel. */
export function rayPlanePoint(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  planePoint: { x: number; y: number; z: number },
  planeNormal: { x: number; y: number; z: number }
): { x: number; y: number; z: number } | null {
  const denominator = direction.x * planeNormal.x + direction.y * planeNormal.y + direction.z * planeNormal.z
  if (Math.abs(denominator) < 1e-9) return null
  const t = (
    (planePoint.x - origin.x) * planeNormal.x +
    (planePoint.y - origin.y) * planeNormal.y +
    (planePoint.z - origin.z) * planeNormal.z
  ) / denominator
  if (!Number.isFinite(t)) return null
  return { x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t }
}

/** Round a position onto the snap grid; step 0 leaves it untouched. */
export function snapPoint(
  point: { x: number; y: number; z: number },
  step: number
): { x: number; y: number; z: number } {
  if (!step || step <= 0) return { ...point }
  const round = (value: number) => Math.round(value / step) * step
  return { x: round(point.x), y: round(point.y), z: round(point.z) }
}

/** Smallest step a mouse drag may move a solid, in millimetres. */
export const MIN_DRAG_STEP = 1

/**
 * New position of a dragged object: the pointer ray is intersected with the
 * drag plane and the grab offset is re-applied, then snapped.
 *
 * `vertical` drags along Y on a plane facing the camera instead of the ground.
 * Dragging never produces a fraction: with snapping switched off the position
 * still lands on whole millimetres.
 */
export function dragPosition(options: {
  origin: { x: number; y: number; z: number }
  direction: { x: number; y: number; z: number }
  grabPoint: { x: number; y: number; z: number }
  offset: { x: number; y: number; z: number }
  cameraDirection: { x: number; y: number; z: number }
  vertical: boolean
  snap: number
}): { x: number; y: number; z: number } | null {
  const normal = options.vertical
    ? (() => {
      const flat = { x: options.cameraDirection.x, y: 0, z: options.cameraDirection.z }
      const size = Math.hypot(flat.x, flat.z) || 1
      return { x: flat.x / size, y: 0, z: flat.z / size }
    })()
    : { x: 0, y: 1, z: 0 }
  const hit = rayPlanePoint(options.origin, options.direction, options.grabPoint, normal)
  if (!hit) return null
  const moved = {
    x: hit.x + options.offset.x,
    y: hit.y + options.offset.y,
    z: hit.z + options.offset.z
  }
  return snapPoint(moved, Math.max(MIN_DRAG_STEP, options.snap || 0))
}

/** Where the key light sits for an azimuth/elevation pair, in degrees. */
export function lightPosition(azimuth: number, elevation: number, distance: number): { x: number; y: number; z: number } {
  const a = (azimuth * Math.PI) / 180
  const e = (elevation * Math.PI) / 180
  return {
    x: Math.cos(e) * Math.sin(a) * distance,
    y: Math.sin(e) * distance,
    z: Math.cos(e) * Math.cos(a) * distance
  }
}

/** The inverse: the angles a light at this position is pointing from. */
export function lightAngles(position: { x: number; y: number; z: number }): { azimuth: number; elevation: number } {
  const horizontal = Math.hypot(position.x, position.z)
  return {
    azimuth: (Math.atan2(position.x, position.z) * 180) / Math.PI,
    elevation: (Math.atan2(position.y, horizontal) * 180) / Math.PI
  }
}

/**
 * Direction from `center` to where the pointer ray meets a sphere of `radius`.
 * When the ray misses the sphere the closest point on the ray is used instead,
 * so dragging the light never loses the grab.
 */
export function raySphereDirection(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  radius: number
): { x: number; y: number; z: number } | null {
  const dx = direction.x
  const dy = direction.y
  const dz = direction.z
  const length = Math.hypot(dx, dy, dz)
  if (length < 1e-9) return null
  const unit = { x: dx / length, y: dy / length, z: dz / length }
  const ox = origin.x - center.x
  const oy = origin.y - center.y
  const oz = origin.z - center.z
  const b = ox * unit.x + oy * unit.y + oz * unit.z
  const c = ox * ox + oy * oy + oz * oz - radius * radius
  const discriminant = b * b - c
  const t = discriminant >= 0 ? -b - Math.sqrt(discriminant) : -b
  const hit = {
    x: ox + unit.x * (discriminant >= 0 && t > 0 ? t : -b),
    y: oy + unit.y * (discriminant >= 0 && t > 0 ? t : -b),
    z: oz + unit.z * (discriminant >= 0 && t > 0 ? t : -b)
  }
  const size = Math.hypot(hit.x, hit.y, hit.z)
  if (size < 1e-9) return null
  return { x: hit.x / size, y: hit.y / size, z: hit.z / size }
}

/** Clamp the angles the light control and the gizmo agree on. */
export function clampLightAngles(azimuth: number, elevation: number): { azimuth: number; elevation: number } {
  const wrapped = ((azimuth + 180) % 360 + 360) % 360 - 180
  return { azimuth: Math.round(wrapped), elevation: Math.round(Math.max(-20, Math.min(90, elevation))) }
}

/**
 * Narrowest tool panel that still shows every button's icon and full label.
 * `labelWidths` are the measured text widths of the labels in pixels.
 */
/**
 * Narrowest property panel that shows a whole row without clipping: the axis
 * label, the minus button, the value and the plus button, inside the group box
 * and clear of the scroll bar. The numbers follow `.panel.right` in styles.css.
 */
export function propertyPanelWidth(
  { label = 38, input = 62, button = 20, gap = 2, rowGap = 4, groupPadding = 14, groupMargin = 16, scrollbar = 16 } = {}
): number {
  const stepper = button * 2 + input + gap * 2
  return Math.ceil(label + rowGap + stepper + groupPadding + groupMargin + scrollbar)
}

/** Room left beyond the strict fit so rows do not sit flush against the edge. */
export const PANEL_ROOM = 34

/**
 * The width both side panels are held to: a whole property row plus that room.
 * The tool panel and the property panel share it, so neither one can be dragged
 * narrower than the other's content needs.
 */
export const MIN_PANEL_WIDTH = propertyPanelWidth() + PANEL_ROOM

/**
 * Narrowest tool panel that still shows the icons and all but the longest
 * labels. Sizing for the very longest label would widen every button, so the
 * panel follows the 80th percentile and lets the few outliers ellipsize.
 */
export function toolPanelWidth(labelWidths: number[], columns = 2): number {
  if (labelWidths.length === 0) return MIN_PANEL_WIDTH
  // icon column + gap + horizontal padding of one button
  const iconAndPadding = 12 + 3 + 4
  const sorted = [...labelWidths].sort((a, b) => a - b)
  const pick = sorted[Math.max(0, Math.ceil(sorted.length * 0.8) - 1)]
  const widest = Math.ceil(pick) + iconAndPadding
  const gaps = (columns - 1) * 2
  const panelPadding = 4 + 6
  return Math.max(MIN_PANEL_WIDTH, Math.min(480, widest * columns + gaps + panelPadding))
}

/** Mouse navigation styles of FreeCAD's preferences. */
export type NavigationStyle = 'cad' | 'blender' | 'touchpad' | 'maya'

export const NAVIGATION_STYLES: NavigationStyle[] = ['cad', 'blender', 'touchpad', 'maya']

export interface PointerGesture {
  /** 0 left, 1 middle, 2 right */
  button: number
  shift: boolean
  ctrl: boolean
  alt: boolean
}

/**
 * What a drag on empty space means in the chosen navigation style. `none` keeps
 * the camera still, which is what the select-only gestures do.
 */
export function navAction(style: NavigationStyle, gesture: PointerGesture): 'rotate' | 'pan' | 'none' {
  const { button, shift, ctrl, alt } = gesture
  if (style === 'blender') {
    if (button === 1) return shift ? 'pan' : 'rotate'
    if (button === 2) return 'pan'
    return 'none'
  }
  if (style === 'touchpad') {
    if (button !== 0) return button === 2 ? 'pan' : 'none'
    if (shift) return 'pan'
    if (ctrl) return 'rotate'
    return 'none'
  }
  if (style === 'maya') {
    if (!alt) return 'none'
    if (button === 0) return 'rotate'
    return 'pan'
  }
  // CAD style: left orbits, right and middle pan.
  if (button === 0) return 'rotate'
  return 'pan'
}
