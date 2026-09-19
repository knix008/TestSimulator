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
  | 'selectionMode' | 'marqueeFeather' | 'antiAlias' | 'cropRatio' | 'mixerWet' | 'mixerMix' | 'mixerFlow'
  | 'artHistoryStyle' | 'liquifyMode' | 'liquifyPressure' | 'gradientReverse' | 'gradientDither'
  | 'wandContiguous' | 'sampleAllLayers' | 'toneRange' | 'eyedropperSample' | 'cloneAligned' | 'patternImpressionist'
>

export type OptionControl =
  /** A slider. `scale` converts between the stored value and the 0..max the slider shows. */
  | { kind: 'range'; key: OptionKey; label: string; min: number; max: number; step?: number; scale?: number }
  | { kind: 'number'; key: OptionKey; label: string; min: number; max: number }
  | { kind: 'select'; key: OptionKey; label: string; choices: { value: string; label: string }[] }
  | { kind: 'toggle'; key: OptionKey; label: string }
  /** Non-settings widgets App owns directly (font pickers, path actions…). */
  | { kind: 'custom'; id: 'font' | 'pathActions' | 'transformActions' | 'cropActions' | 'sliceActions' | 'liquifyActions' | 'gradientPicker' | 'shapeKindPicker' | 'artboardActions' }
  /** A one-line explanation of the tool's modifier keys. */
  | { kind: 'hint'; label: string }

const size: OptionControl = { kind: 'range', key: 'brushSize', label: 'size', min: 1, max: 400 }
const hardness: OptionControl = { kind: 'range', key: 'brushHardness', label: 'hardness', min: 0, max: 100, scale: 100 }
const opacity: OptionControl = { kind: 'range', key: 'brushOpacity', label: 'opacity', min: 5, max: 100, scale: 100 }
const tolerance: OptionControl = { kind: 'range', key: 'fillTolerance', label: 'tolerance', min: 0, max: 255 }
const aligned: OptionControl = { kind: 'toggle', key: 'cloneAligned', label: 'aligned' }
const sampleAll: OptionControl = { kind: 'toggle', key: 'sampleAllLayers', label: 'sampleAll' }

/** New / add / subtract / intersect, shared by every selection tool. */
const selectionMode: OptionControl = {
  kind: 'select', key: 'selectionMode', label: 'selectionMode',
  choices: [
    { value: 'new', label: 'selNew' },
    { value: 'add', label: 'selAdd' },
    { value: 'subtract', label: 'selSubtract' },
    { value: 'intersect', label: 'selIntersect' },
  ],
}
const feather: OptionControl = { kind: 'range', key: 'marqueeFeather', label: 'featherOpt', min: 0, max: 100 }
const antiAlias: OptionControl = { kind: 'toggle', key: 'antiAlias', label: 'antiAliasOpt' }

const brushRow = (hint: string): OptionControl[] => [size, hardness, opacity, { kind: 'hint', label: hint }]
const dabRow = (hint: string): OptionControl[] => [size, opacity, { kind: 'hint', label: hint }]
const selectRow = (hint: string, extra: OptionControl[] = []): OptionControl[] => [selectionMode, feather, antiAlias, ...extra, { kind: 'hint', label: hint }]

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

const toneRange: OptionControl = {
  kind: 'select', key: 'toneRange', label: 'toneRange',
  choices: [
    { value: 'shadows', label: 'rangeShadows' },
    { value: 'midtones', label: 'rangeMidtones' },
    { value: 'highlights', label: 'rangeHighlights' },
  ],
}

export const toolOptions: Record<Tool, OptionControl[]> = {
  /* navigation and view */
  move: [{ kind: 'hint', label: 'hintMove' }],
  artboard: [{ kind: 'custom', id: 'artboardActions' }, { kind: 'hint', label: 'hintArtboard' }],
  puppet: [{ kind: 'hint', label: 'hintPuppet' }],
  hand: [{ kind: 'hint', label: 'hintHand' }],
  rotateView: [{ kind: 'hint', label: 'hintRotateView' }],
  zoom: [{ kind: 'hint', label: 'hintZoom' }],

  /* selections */
  marquee: selectRow('hintMarqueeMod'),
  ellipseMarquee: selectRow('hintMarqueeMod'),
  rowMarquee: [selectionMode, { kind: 'hint', label: 'hintRowCol' }],
  colMarquee: [selectionMode, { kind: 'hint', label: 'hintRowCol' }],
  lasso: selectRow('hintLasso'),
  polyLasso: selectRow('hintPolyLasso'),
  magneticLasso: selectRow('hintMagnetic', [{ kind: 'range', key: 'magneticWidth', label: 'edgeWidth', min: 1, max: 64 }]),
  objectSelect: [selectionMode, tolerance, { kind: 'hint', label: 'hintObjectSelectDrag' }],
  quickSelect: [selectionMode, size, tolerance, sampleAll, { kind: 'hint', label: 'hintQuickSelect' }],
  wand: [selectionMode, tolerance, { kind: 'toggle', key: 'wandContiguous', label: 'contiguous' }, sampleAll, { kind: 'hint', label: 'hintWand' }],

  /* crop, slice, frame */
  crop: [
    {
      kind: 'select', key: 'cropRatio', label: 'cropRatio',
      choices: [
        { value: 'free', label: 'ratioFree' },
        { value: 'original', label: 'ratioOriginal' },
        { value: '1:1', label: 'ratio11' },
        { value: '4:3', label: 'ratio43' },
        { value: '3:2', label: 'ratio32' },
        { value: '16:9', label: 'ratio169' },
      ],
    },
    { kind: 'custom', id: 'cropActions' },
    { kind: 'hint', label: 'hintCropRatio' },
  ],
  perspectiveCrop: [{ kind: 'custom', id: 'cropActions' }, { kind: 'hint', label: 'hintPerspectiveCrop' }],
  slice: [{ kind: 'custom', id: 'sliceActions' }, { kind: 'hint', label: 'hintSlice' }],
  sliceSelect: [{ kind: 'custom', id: 'sliceActions' }, { kind: 'hint', label: 'hintSliceSelect' }],
  frame: [{ kind: 'hint', label: 'hintFrame' }],

  /* sampling and annotation */
  eyedropper: [
    {
      kind: 'select', key: 'eyedropperSample', label: 'sampleSize',
      choices: [{ value: '1', label: 'sampleSize1' }, { value: '3', label: 'sampleSize3' }, { value: '5', label: 'sampleSize5' }],
    },
    sampleAll,
    { kind: 'hint', label: 'hintEyedropper' },
  ],
  sampler: [{ kind: 'hint', label: 'hintSamplerReal' }],
  ruler: [{ kind: 'hint', label: 'hintRuler' }],
  note: [{ kind: 'hint', label: 'hintNoteEdit' }],
  count: [{ kind: 'hint', label: 'hintCount' }],

  /* retouch */
  spotHeal: dabRow('hintSpotHeal'),
  remove: dabRow('hintRemove'),
  heal: [size, hardness, opacity, aligned, { kind: 'hint', label: 'hintHealReal' }],
  patch: [{ kind: 'hint', label: 'hintPatch' }],
  contentMove: [{ kind: 'hint', label: 'hintContentMove' }],
  redEye: [size, { kind: 'hint', label: 'hintRedEye' }],

  /* painting */
  brush: brushRow('hintBrush'),
  pencil: [size, opacity, { kind: 'hint', label: 'hintPencil' }],
  colorReplace: [size, tolerance, { kind: 'hint', label: 'hintColorReplace' }],
  mixer: [
    size,
    hardness,
    { kind: 'range', key: 'mixerWet', label: 'wet', min: 0, max: 100, scale: 100 },
    { kind: 'range', key: 'mixerMix', label: 'mixLoad', min: 0, max: 100, scale: 100 },
    { kind: 'range', key: 'mixerFlow', label: 'flow', min: 2, max: 100, scale: 100 },
    { kind: 'hint', label: 'hintMixerReal' },
  ],
  clone: [size, hardness, opacity, aligned, sampleAll, { kind: 'hint', label: 'hintClone' }],
  patternStamp: [size, hardness, opacity, { kind: 'toggle', key: 'patternImpressionist', label: 'impressionist' }, { kind: 'hint', label: 'hintPatternReal' }],
  historyBrush: [size, hardness, opacity, { kind: 'hint', label: 'hintHistoryReal' }],
  artHistory: [
    size,
    opacity,
    {
      kind: 'select', key: 'artHistoryStyle', label: 'artStyle',
      choices: [{ value: 'dab', label: 'styleDab' }, { value: 'tight', label: 'styleTight' }, { value: 'loose', label: 'styleLoose' }],
    },
    { kind: 'hint', label: 'hintArtHistory' },
  ],

  /* erasing */
  eraser: brushRow('hintEraser'),
  bgEraser: [size, tolerance, { kind: 'hint', label: 'hintBgEraser' }],
  magicEraser: [tolerance, { kind: 'toggle', key: 'wandContiguous', label: 'contiguous' }, { kind: 'hint', label: 'hintMagicEraser' }],

  /* fills */
  gradient: [
    { kind: 'custom', id: 'gradientPicker' },
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
    { kind: 'toggle', key: 'gradientReverse', label: 'reverse' },
    { kind: 'toggle', key: 'gradientDither', label: 'dither' },
    { kind: 'hint', label: 'hintGradient' },
  ],
  fill: [tolerance, { kind: 'toggle', key: 'wandContiguous', label: 'contiguous' }, sampleAll, { kind: 'hint', label: 'hintFill' }],

  /* focus and tone */
  blurTool: dabRow('hintBlurTool'),
  sharpenTool: dabRow('hintSharpenTool'),
  smudge: dabRow('hintSmudge'),
  liquify: [
    size,
    { kind: 'range', key: 'liquifyPressure', label: 'pressure', min: 5, max: 100, scale: 100 },
    {
      kind: 'select', key: 'liquifyMode', label: 'liquifyMode',
      choices: [
        { value: 'forward', label: 'liqForward' },
        { value: 'twirlCw', label: 'liqTwirlCw' },
        { value: 'twirlCcw', label: 'liqTwirlCcw' },
        { value: 'pucker', label: 'liqPucker' },
        { value: 'bloat', label: 'liqBloat' },
        { value: 'reconstruct', label: 'liqReconstruct' },
        { value: 'freeze', label: 'liqFreeze' },
        { value: 'thaw', label: 'liqThaw' },
      ],
    },
    { kind: 'custom', id: 'liquifyActions' },
    { kind: 'hint', label: 'hintLiquify' },
  ],
  dodge: [size, opacity, toneRange, { kind: 'hint', label: 'hintDodge' }],
  burn: [size, opacity, toneRange, { kind: 'hint', label: 'hintBurn' }],
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
  textMask: [{ kind: 'custom', id: 'font' }, { kind: 'hint', label: 'hintTextMaskReal' }],

  /* shapes */
  rect: shapeRow(),
  roundRect: shapeRow([{ kind: 'range', key: 'shapeCorner', label: 'cornerRadius', min: 0, max: 200 }]),
  ellipse: shapeRow(),
  polygon: shapeRow([{ kind: 'number', key: 'shapeSides', label: 'sides', min: 3, max: 32 }]),
  line: [
    { kind: 'range', key: 'shapeStroke', label: 'strokeWidth', min: 1, max: 40 },
    { kind: 'hint', label: 'hintShape' },
  ],
  customShape: shapeRow([{ kind: 'custom', id: 'shapeKindPicker' }, { kind: 'number', key: 'shapeSides', label: 'points', min: 3, max: 32 }]),
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
