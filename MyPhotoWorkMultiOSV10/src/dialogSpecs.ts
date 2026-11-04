/**
 * The size each dialog window opens at. The shell has no list of its own: the page
 * sends the spec with each opening, and the window then follows the height the
 * content reports (src/DialogHost.tsx).
 */
export type DialogSpec = {
  width: number
  height: number
  /** false: the user cannot resize it. */
  resizable?: boolean
  minWidth?: number
}

export const DIALOG_SPECS: Record<string, DialogSpec> = {
  // A set size: wide enough for the rows to stay on one line, tall enough for its tallest page.
  settings: { width: 780, height: 700, resizable: false, minWidth: 780 },
  about: { width: 560, height: 470, resizable: false },
  helpGuide: { width: 660, height: 620, resizable: false },
  error: { width: 620, height: 420, minWidth: 420 },
  unsaved: { width: 460, height: 210, resizable: false },
  new: { width: 520, height: 470, minWidth: 420 },
  export: { width: 440, height: 290, resizable: false },
  // Fixed, and tall enough for the preview sheet, the three controls and the
  // buttons together: this window must never scroll.
  print: { width: 560, height: 760, resizable: false },
  imageInfo: { width: 540, height: 680, minWidth: 380 },
  fill: { width: 440, height: 250, resizable: false },
  stroke: { width: 440, height: 290, resizable: false },
  selectModify: { width: 420, height: 200, resizable: false },
  colorRange: { width: 440, height: 230, resizable: false },
  channelMixer: { width: 460, height: 430, resizable: false },
  selectiveColor: { width: 460, height: 400, resizable: false },
  gradientMap: { width: 440, height: 240, resizable: false },
  replaceColor: { width: 440, height: 270, resizable: false },
  saveSelection: { width: 420, height: 200, resizable: false },
  loadSelection: { width: 440, height: 260, resizable: false },
  skew: { width: 420, height: 230, resizable: false },
  distort: { width: 460, height: 330, resizable: false },
  perspective: { width: 420, height: 200, resizable: false },
  warp: { width: 440, height: 330, resizable: false },
  contentScale: { width: 420, height: 240, resizable: false },
  colorProfile: { width: 460, height: 300, resizable: false },
  threeD: { width: 460, height: 460, resizable: false },
  imageSize: { width: 420, height: 230, resizable: false },
  canvasSize: { width: 420, height: 230, resizable: false },
  text: { width: 480, height: 720, minWidth: 380 },
  brightness: { width: 440, height: 240, resizable: false },
  hue: { width: 440, height: 280, resizable: false },
  blur: { width: 420, height: 200, resizable: false },
  sharpen: { width: 420, height: 200, resizable: false },
  feather: { width: 420, height: 200, resizable: false },
  cameraRaw: { width: 460, height: 300, resizable: false },
  filterGallery: { width: 780, height: 392, resizable: false, minWidth: 780 },
  curves: { width: 420, height: 560, minWidth: 360 },
  levels: { width: 460, height: 460, minWidth: 380 },
  // Added for Photoshop parity.
  filterParams: { width: 440, height: 330, resizable: false },
  adjustment: { width: 460, height: 520, minWidth: 380 },
  lut: { width: 440, height: 300, resizable: false },
  hdrToning: { width: 440, height: 380, resizable: false },
  matchColor: { width: 440, height: 380, resizable: false },
  applyImage: { width: 440, height: 340, resizable: false },
  calculations: { width: 480, height: 520, minWidth: 400 },
  rotateArbitrary: { width: 420, height: 230, resizable: false },
  newGuide: { width: 420, height: 230, resizable: false },
  guideLayout: { width: 440, height: 250, resizable: false },
  selectAndMask: { width: 460, height: 520, minWidth: 380 },
  lensCorrection: { width: 440, height: 300, resizable: false },
  blurGallery: { width: 440, height: 320, resizable: false },
  customFilter: { width: 460, height: 420, resizable: false },
  layerStyle: { width: 760, height: 620, minWidth: 620 },
  gradientEditor: { width: 520, height: 560, minWidth: 420 },
  neural: { width: 440, height: 330, resizable: false },
  neuralModels: { width: 800, height: 640, resizable: true },
  removeBg: { width: 560, height: 560, resizable: true },
  modelSetup: { width: 560, height: 480, resizable: true },
  note: { width: 420, height: 240, resizable: false },
  findReplace: { width: 420, height: 270, resizable: false },
  exportAs: { width: 440, height: 330, resizable: false },
  openRecent: { width: 560, height: 420, minWidth: 420 },
  keyboardShortcuts: { width: 640, height: 560, minWidth: 560 },
  contactSheet: { width: 440, height: 230, resizable: false },
  fitImage: { width: 440, height: 230, resizable: false },
  photomerge: { width: 440, height: 240, resizable: false },
  fade: { width: 420, height: 240, resizable: false },
  skyReplace: { width: 440, height: 320, resizable: false },
  perspectiveWarp: { width: 460, height: 380, resizable: false },
  duotone: { width: 440, height: 240, resizable: false },
  indexed: { width: 420, height: 240, resizable: false },
  checkSpelling: { width: 460, height: 360, minWidth: 380 },
  vanishingPoint: { width: 440, height: 200, resizable: false },
  adaptiveWideAngle: { width: 440, height: 320, resizable: false },
  statistics: { width: 420, height: 230, resizable: false },
  namePrompt: { width: 420, height: 180, resizable: false },
  imageProcessor: { width: 440, height: 240, resizable: false },
  transformSelection: { width: 440, height: 300, resizable: false },
}

export const DEFAULT_SPEC: DialogSpec = { width: 480, height: 360, minWidth: 320 }

export function dialogSpec(name: string): DialogSpec {
  return DIALOG_SPECS[name] ?? DEFAULT_SPEC
}
