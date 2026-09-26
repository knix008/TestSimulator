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
