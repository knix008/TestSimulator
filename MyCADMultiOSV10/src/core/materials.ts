// FreeCAD Material workbench: material card library and mass properties.
import type { Solid } from './model'
import { solidVolume } from './part'
import { surfaceArea } from './primitives'

export interface MaterialCard {
  id: string
  name: string
  /** g/cm³ */
  density: number
  /** MPa */
  youngsModulus: number
  poissonRatio: number
  /** MPa */
  yieldStrength: number
  /** W/(m·K) */
  thermalConductivity: number
  /** 1e-6/K */
  thermalExpansion: number
  color: string
}

export const MATERIALS: MaterialCard[] = [
  { id: 'steel', name: 'Steel S235', density: 7.85, youngsModulus: 210000, poissonRatio: 0.3, yieldStrength: 235, thermalConductivity: 50, thermalExpansion: 12, color: '#9aa7b4' },
  { id: 'stainless', name: 'Stainless 304', density: 7.9, youngsModulus: 193000, poissonRatio: 0.29, yieldStrength: 215, thermalConductivity: 16, thermalExpansion: 17, color: '#c0c8d0' },
  { id: 'aluminium', name: 'Aluminium 6061', density: 2.7, youngsModulus: 69000, poissonRatio: 0.33, yieldStrength: 276, thermalConductivity: 167, thermalExpansion: 23, color: '#d6dee6' },
  { id: 'titanium', name: 'Titanium Ti6Al4V', density: 4.43, youngsModulus: 114000, poissonRatio: 0.34, yieldStrength: 880, thermalConductivity: 7, thermalExpansion: 9, color: '#b9b2a6' },
  { id: 'brass', name: 'Brass CuZn39', density: 8.4, youngsModulus: 100000, poissonRatio: 0.34, yieldStrength: 200, thermalConductivity: 120, thermalExpansion: 20, color: '#d6b45a' },
  { id: 'copper', name: 'Copper Cu-ETP', density: 8.94, youngsModulus: 117000, poissonRatio: 0.35, yieldStrength: 70, thermalConductivity: 394, thermalExpansion: 17, color: '#c87c4a' },
  { id: 'abs', name: 'ABS', density: 1.04, youngsModulus: 2300, poissonRatio: 0.35, yieldStrength: 40, thermalConductivity: 0.17, thermalExpansion: 90, color: '#efe6d4' },
  { id: 'pla', name: 'PLA', density: 1.24, youngsModulus: 3500, poissonRatio: 0.36, yieldStrength: 50, thermalConductivity: 0.13, thermalExpansion: 68, color: '#d9ead4' },
  { id: 'petg', name: 'PETG', density: 1.27, youngsModulus: 2100, poissonRatio: 0.4, yieldStrength: 50, thermalConductivity: 0.2, thermalExpansion: 70, color: '#cfe4f0' },
  { id: 'nylon', name: 'Nylon PA12', density: 1.01, youngsModulus: 1700, poissonRatio: 0.39, yieldStrength: 45, thermalConductivity: 0.25, thermalExpansion: 100, color: '#e8e8e0' },
  { id: 'concrete', name: 'Concrete C30/37', density: 2.4, youngsModulus: 33000, poissonRatio: 0.2, yieldStrength: 30, thermalConductivity: 1.7, thermalExpansion: 10, color: '#b9b9b0' },
  { id: 'wood', name: 'Wood Pine', density: 0.52, youngsModulus: 11000, poissonRatio: 0.35, yieldStrength: 40, thermalConductivity: 0.13, thermalExpansion: 5, color: '#c8a06a' },
  { id: 'glass', name: 'Glass Soda-lime', density: 2.5, youngsModulus: 70000, poissonRatio: 0.22, yieldStrength: 50, thermalConductivity: 1, thermalExpansion: 9, color: '#cfe8ef' },
  { id: 'carbon', name: 'CFRP', density: 1.6, youngsModulus: 150000, poissonRatio: 0.3, yieldStrength: 600, thermalConductivity: 7, thermalExpansion: 2, color: '#3d4045' }
]

export function findMaterial(id: string): MaterialCard {
  return MATERIALS.find((card) => card.id === id || card.name.toLowerCase() === id.toLowerCase()) ?? MATERIALS[0]
}

export interface MassProperties {
  /** mm³ */
  volume: number
  /** mm² */
  area: number
  /** g */
  mass: number
  /** kg */
  massKg: number
  material: string
}

/** Mass properties of a solid with an assigned material card. */
export function massProperties(solid: Solid, materialId = 'steel'): MassProperties {
  const card = findMaterial(materialId)
  const volume = solidVolume(solid)
  const mass = (volume / 1000) * card.density
  return { volume, area: surfaceArea(solid), mass, massKg: mass / 1000, material: card.name }
}

export function assemblyMass(solids: Solid[], materialOf: (solid: Solid) => string = () => 'steel'): MassProperties {
  let volume = 0
  let area = 0
  let mass = 0
  for (const solid of solids) {
    const props = massProperties(solid, materialOf(solid))
    volume += props.volume
    area += props.area
    mass += props.mass
  }
  return { volume, area, mass, massKg: mass / 1000, material: 'mixed' }
}
