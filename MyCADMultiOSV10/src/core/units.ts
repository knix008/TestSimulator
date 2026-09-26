// Unit schemas, the way FreeCAD's preferences use them: the document always
// stores millimetres and degrees, and a schema decides how a number is shown.
export type UnitSchema = 'mm' | 'cm' | 'm' | 'inch' | 'foot'

export const UNIT_SCHEMAS: UnitSchema[] = ['mm', 'cm', 'm', 'inch', 'foot']

/** millimetres in one unit of each schema */
const FACTOR: Record<UnitSchema, number> = { mm: 1, cm: 10, m: 1000, inch: 25.4, foot: 304.8 }
const SUFFIX: Record<UnitSchema, string> = { mm: 'mm', cm: 'cm', m: 'm', inch: 'in', foot: 'ft' }

export function isUnitSchema(value: unknown): value is UnitSchema {
  return typeof value === 'string' && UNIT_SCHEMAS.includes(value as UnitSchema)
}

export function unitSuffix(schema: UnitSchema): string {
  return SUFFIX[schema]
}

/** Millimetres to the schema's own unit. */
export function toDisplay(mm: number, schema: UnitSchema): number {
  return mm / FACTOR[schema]
}

/** A number the user typed in the schema's unit, back to millimetres. */
export function fromDisplay(value: number, schema: UnitSchema): number {
  return value * FACTOR[schema]
}

function trim(value: number, digits: number): string {
  const fixed = value.toFixed(digits)
  return fixed.replace(/\.?0+$/, '') || '0'
}

export function formatLength(mm: number, schema: UnitSchema, digits = 2): string {
  return `${trim(toDisplay(mm, schema), digits)} ${SUFFIX[schema]}`
}

export function formatArea(mm2: number, schema: UnitSchema, digits = 2): string {
  const factor = FACTOR[schema] ** 2
  return `${trim(mm2 / factor, digits)} ${SUFFIX[schema]}²`
}

export function formatVolume(mm3: number, schema: UnitSchema, digits = 2): string {
  const factor = FACTOR[schema] ** 3
  return `${trim(mm3 / factor, digits)} ${SUFFIX[schema]}³`
}

export function formatAngle(degrees: number, digits = 1): string {
  return `${trim(degrees, digits)}°`
}
