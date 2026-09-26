import type { MessageKey } from './i18n'

export const WORKBENCHES: { id: string; labelKey: MessageKey; tools: string[] }[] = [
  { id: 'partDesign', labelKey: 'partDesign', tools: ['sketchRect', 'sketchCircle', 'pad', 'pocket', 'revolve', 'groove', 'loft', 'pipe', 'helix', 'fillet', 'chamfer', 'draft', 'shell', 'mirror', 'linearPattern', 'polarPattern', 'hole', 'union', 'cut'] },
  { id: 'part', labelKey: 'part', tools: ['box', 'cylinder', 'sphere', 'cone', 'torus', 'plane', 'pad', 'revolve', 'loft', 'union', 'cut', 'common', 'section', 'fillet', 'chamfer'] },
  { id: 'sketcher', labelKey: 'sketcher', tools: ['sketchRect', 'sketchCircle', 'sketchPolygon', 'solveConstraints', 'coincidence', 'offsetMate', 'parameter', 'measure'] },
  { id: 'draft', labelKey: 'draftWb', tools: ['sketchRect', 'translate', 'rotateBody', 'scaleBody', 'mirror', 'linearPattern', 'polarPattern', 'measure'] },
  { id: 'techdraw', labelKey: 'techdraw', tools: ['front', 'top', 'iso', 'section', 'exportSvg', 'exportDxf', 'print'] },
  { id: 'mesh', labelKey: 'meshWb', tools: ['importStl', 'exportStl', 'exportObj', 'measure'] },
  { id: 'spreadsheet', labelKey: 'spreadsheet', tools: ['parameter', 'updatePart'] },
  { id: 'assembly', labelKey: 'assembly', tools: ['coincidence', 'offsetMate', 'inertia'] },
  { id: 'fem', labelKey: 'fem', tools: ['femCheck', 'femBar', 'measure'] },
  { id: 'cam', labelKey: 'cam', tools: ['sketchRect', 'exportGcode', 'pocketPath'] },
  { id: 'bim', labelKey: 'bim', tools: ['sketchRect', 'pad', 'hole', 'refPlane', 'section', 'exportIfc'] },
  { id: 'points', labelKey: 'pointsWb', tools: ['importPoints', 'measure'] },
  { id: 'surface', labelKey: 'surfaceWb', tools: ['surfaceFill', 'loft'] },
  { id: 'robot', labelKey: 'robotWb', tools: ['robotPose'] },
  { id: 'openscad', labelKey: 'openscadWb', tools: ['importOpenScad'] },
  { id: 'inspection', labelKey: 'inspectionWb', tools: ['inspect', 'measure'] }
]

export type WorkbenchId = (typeof WORKBENCHES)[number]['id']

export function workbenchTools(id: string): readonly string[] {
  return WORKBENCHES.find((item) => item.id === id)?.tools ?? WORKBENCHES[0].tools
}

export function sketchToGcode(width: number, height: number): string {
  const x = Math.abs(width) / 2
  const y = Math.abs(height) / 2
  return ['G21', 'G90', `G0 X${-x} Y${-y}`, `G1 X${x} Y${-y} F300`, `G1 X${x} Y${y}`, `G1 X${-x} Y${y}`, `G1 X${-x} Y${-y}`, 'M30'].join('\n')
}

export function femStress(area: number, force = 1000): number {
  if (area <= 0) return 0
  return force / area
}
