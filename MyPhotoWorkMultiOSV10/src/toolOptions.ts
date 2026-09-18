import type { AppSettings, Tool } from './lib/types'

/**
 * Declarative description of the contextual options bar.
 *
 * Every tool's row is built from this one table rather than from a chain of
 * `tool === 'x' && (...)` blocks, so each control looks and behaves the same
 * wherever it appears and no tool can end up with a silently empty row.
 */

/** Settings keys the options bar is allowed to bind to. */
export type OptionKey = Extract<
  keyof AppSettings,
  | 'brushSize' | 'brushHardness' | 'brushOpacity' | 'fillTolerance' | 'gradientKind'
  | 'shapeStroke' | 'shapeSides' | 'shapeCorner' | 'shapeFilled' | 'pathWidth' | 'magneticWidth'
>

export type OptionControl =
  /** A slider. `scale` converts between the stored value and the 0..max the slider shows. */
  | { kind: 'range'; key: OptionKey; label: string; min: number; max: number; step?: number; scale?: number }
  | { kind: 'number'; key: OptionKey; label: string; min: number; max: number }
  | { kind: 'select'; key: OptionKey; label: string; choices: { value: string; label: string }[] }
  | { kind: 'toggle'; key: OptionKey; label: string }
  /** Non-settings widgets App owns directly (font pickers, path actions…). */
  | { kind: 'custom'; id: 'font' | 'pathActions' | 'transformActions' | 'cropActions' | 'sliceActions' }
  /** A one-line explanation of the tool's modifier keys. */
  | { kind: 'hint'; label: string }

const size: OptionControl = { kind: 'range', key: 'brushSize', label: 'size', min: 1, max: 400 }
const hardness: OptionControl = { kind: 'range', key: 'brushHardness', label: 'hardness', min: 0, max: 100, scale: 100 }
const opacity: OptionControl = { kind: 'range', key: 'brushOpacity', label: 'opacity', min: 5, max: 100, scale: 100 }
const tolerance: OptionControl = { kind: 'range', key: 'fillTolerance', label: 'tolerance', min: 0, max: 255 }

const brushRow = (hint: string): OptionControl[] => [size, hardness, opacity, { kind: 'hint', label: hint }]
const dabRow = (hint: string): OptionControl[] => [size, opacity, { kind: 'hint', label: hint }]

const shapeRow = (extra: OptionControl[] = []): OptionControl[] => [
  { kind: 'toggle', key: 'shapeFilled', label: 'shapeFilled' },
  { kind: 'range', key: 'shapeStroke', label: 'strokeWidth', min: 0, max: 40 },
  ...extra,
  { kind: 'hint', label: 'hintShape' },
]

const penRow: OptionControl[] = [
  { kind: 'range', key: 'pathWidth', label: 'strokeWidth', min: 1, max: 40 },
  { kind: 'custom', id: 'pathActions' },
]

export const toolOptions: Record<Tool, OptionControl[]> = {
  /* navigation and view */
  move: [{ kind: 'hint', label: 'hintMove' }],
  artboard: [{ kind: 'hint', label: 'hintMove' }],
  puppet: [{ kind: 'hint', label: 'hintPuppet' }],
  hand: [{ kind: 'hint', label: 'hintHand' }],
  rotateView: [{ kind: 'hint', label: 'hintRotateView' }],
  zoom: [{ kind: 'hint', label: 'hintZoom' }],

  /* selections */
  marquee: [{ kind: 'hint', label: 'hintMarquee' }],
  ellipseMarquee: [{ kind: 'hint', label: 'hintMarquee' }],
  rowMarquee: [{ kind: 'hint', label: 'hintRowCol' }],
  colMarquee: [{ kind: 'hint', label: 'hintRowCol' }],
  lasso: [{ kind: 'hint', label: 'hintLasso' }],
  polyLasso: [{ kind: 'hint', label: 'hintPolyLasso' }],
  magneticLasso: [
    { kind: 'range', key: 'magneticWidth', label: 'edgeWidth', min: 1, max: 64 },
    { kind: 'hint', label: 'hintMagnetic' },
  ],
  objectSelect: [{ kind: 'hint', label: 'hintObjectSelect' }],
  quickSelect: [tolerance, { kind: 'hint', label: 'hintWand' }],
  wand: [tolerance, { kind: 'hint', label: 'hintWand' }],

  /* crop, slice, frame */
  crop: [{ kind: 'custom', id: 'cropActions' }, { kind: 'hint', label: 'hintCrop' }],
  perspectiveCrop: [{ kind: 'custom', id: 'cropActions' }, { kind: 'hint', label: 'hintPerspectiveCrop' }],
  slice: [{ kind: 'custom', id: 'sliceActions' }, { kind: 'hint', label: 'hintSlice' }],
  sliceSelect: [{ kind: 'custom', id: 'sliceActions' }, { kind: 'hint', label: 'hintSliceSelect' }],
  frame: [{ kind: 'hint', label: 'hintFrame' }],

  /* sampling and annotation */
  eyedropper: [{ kind: 'hint', label: 'hintEyedropper' }],
  sampler: [{ kind: 'hint', label: 'hintSampler' }],
  ruler: [{ kind: 'hint', label: 'hintRuler' }],
  note: [{ kind: 'hint', label: 'hintNote' }],
  count: [{ kind: 'hint', label: 'hintCount' }],

  /* retouch */
  spotHeal: dabRow('hintSpotHeal'),
  remove: dabRow('hintRemove'),
  heal: dabRow('hintHeal'),
  patch: [{ kind: 'hint', label: 'hintPatch' }],
  contentMove: [{ kind: 'hint', label: 'hintContentMove' }],
  redEye: [size, { kind: 'hint', label: 'hintRedEye' }],

  /* painting */
  brush: brushRow('hintBrush'),
  pencil: [size, opacity, { kind: 'hint', label: 'hintPencil' }],
  colorReplace: [size, tolerance, { kind: 'hint', label: 'hintColorReplace' }],
  mixer: brushRow('hintMixer'),
  clone: [...brushRow('hintClone')],
  patternStamp: brushRow('hintPatternStamp'),
  historyBrush: brushRow('hintHistoryBrush'),
  artHistory: brushRow('hintArtHistory'),

  /* erasing */
  eraser: brushRow('hintEraser'),
  bgEraser: [size, tolerance, { kind: 'hint', label: 'hintBgEraser' }],
  magicEraser: [tolerance, { kind: 'hint', label: 'hintMagicEraser' }],

  /* fills */
  gradient: [
    {
      kind: 'select', key: 'gradientKind', label: 'gradient',
      choices: [
        { value: 'linear', label: 'gradLinear' },
        { value: 'radial', label: 'gradRadial' },
        { value: 'angle', label: 'gradAngle' },
        { value: 'reflected', label: 'gradReflected' },
        { value: 'diamond', label: 'gradDiamond' },
      ],
    },
    { kind: 'hint', label: 'hintGradient' },
  ],
  fill: [tolerance, { kind: 'hint', label: 'hintFill' }],

  /* focus and tone */
  blurTool: dabRow('hintBlurTool'),
  sharpenTool: dabRow('hintSharpenTool'),
  smudge: dabRow('hintSmudge'),
  dodge: [size, opacity, { kind: 'hint', label: 'hintDodge' }],
  burn: [size, opacity, { kind: 'hint', label: 'hintBurn' }],
  sponge: [size, { kind: 'hint', label: 'hintSponge' }],

  /* paths */
  pen: [...penRow, { kind: 'hint', label: 'hintPen' }],
  freeformPen: [...penRow, { kind: 'hint', label: 'hintFreeformPen' }],
  curvaturePen: [...penRow, { kind: 'hint', label: 'hintCurvaturePen' }],
  pathSelect: [{ kind: 'custom', id: 'pathActions' }, { kind: 'hint', label: 'hintPathSelect' }],
  directSelect: [{ kind: 'custom', id: 'pathActions' }, { kind: 'hint', label: 'hintDirectSelect' }],

  /* type */
  text: [{ kind: 'custom', id: 'font' }, { kind: 'hint', label: 'hintText' }],
  vtext: [{ kind: 'custom', id: 'font' }, { kind: 'hint', label: 'hintVText' }],
  textMask: [{ kind: 'custom', id: 'font' }, { kind: 'hint', label: 'hintTextMask' }],

  /* shapes */
  rect: shapeRow(),
  roundRect: shapeRow([{ kind: 'range', key: 'shapeCorner', label: 'cornerRadius', min: 0, max: 200 }]),
  ellipse: shapeRow(),
  polygon: shapeRow([{ kind: 'number', key: 'shapeSides', label: 'sides', min: 3, max: 32 }]),
  line: [
    { kind: 'range', key: 'shapeStroke', label: 'strokeWidth', min: 1, max: 40 },
    { kind: 'hint', label: 'hintShape' },
  ],
  customShape: shapeRow([{ kind: 'number', key: 'shapeSides', label: 'points', min: 3, max: 32 }]),
}

export function optionsForTool(tool: Tool): OptionControl[] {
  return toolOptions[tool] ?? []
}

/** Every i18n key the options bar can ask for, so a missing label is testable. */
export function optionLabelKeys(): string[] {
  const keys = new Set<string>()
  for (const controls of Object.values(toolOptions)) {
    for (const control of controls) {
      if (control.kind === 'custom') continue
      keys.add(control.label)
      if (control.kind === 'select') {
        for (const choice of control.choices) keys.add(choice.label)
      }
    }
  }
  return [...keys]
}
