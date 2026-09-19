import type { Adjustment, AdjustmentType } from './lib/types'

/**
 * Which sliders each adjustment shows, in the Properties panel and in the
 * generic Adjustment window. `scale` maps the stored value to the slider:
 * exposure is kept in hundredths of a stop, gamma in hundredths.
 */
export type AdjustmentField = {
  key: keyof Adjustment
  label: string
  min: number
  max: number
  step?: number
  scale?: number
  kind?: 'range' | 'color'
}

const range = (key: keyof Adjustment, label: string, min: number, max: number, extra: Partial<AdjustmentField> = {}): AdjustmentField => ({ key, label, min, max, ...extra })

export const adjustmentFields: Record<AdjustmentType | 'cameraRaw', AdjustmentField[]> = {
  brightness: [range('brightness', 'brightness', -100, 100), range('contrast', 'contrast', -100, 100)],
  levels: [],
  curves: [],
  hue: [range('hue', 'hue', -180, 180), range('saturation', 'saturation', -100, 100), range('lightness', 'lightness', -100, 100)],
  colorBalance: [range('red', 'redChannel', -100, 100), range('green', 'greenChannel', -100, 100), range('blue', 'blueChannel', -100, 100)],
  vibrance: [range('vibrance', 'vibrance', -100, 100), range('saturation', 'saturation', -100, 100)],
  bw: [],
  invert: [],
  posterize: [range('posterize', 'posterize', 2, 32)],
  threshold: [range('threshold', 'threshold', 1, 254)],
  exposure: [range('exposure', 'exposure', -500, 500, { scale: 1 }), range('gamma', 'gammaLabel', 10, 300, { scale: 100 }), range('blacks', 'blackPoint', -100, 100)],
  photoFilter: [range('filterColor', 'color', 0, 0, { kind: 'color' }), range('filterDensity', 'density', 0, 100, { scale: 100 })],
  clarity: [range('clarity', 'clarity', -100, 100)],
  dehaze: [range('dehaze', 'dehaze', -100, 100)],
  grain: [range('grain', 'grain', 0, 100)],
  colorLookup: [],
  shadowsHighlights: [range('shadows', 'shadows', -100, 100), range('highlights', 'highlights', -100, 100)],
  channelMixer: [],
  selectiveColor: [],
  gradientMap: [],
  equalize: [],
  cameraRaw: [
    range('exposure', 'exposure', -500, 500), range('contrast', 'contrast', -100, 100), range('highlights', 'highlights', -100, 100),
    range('shadows', 'shadows', -100, 100), range('whites', 'whites', -100, 100), range('blacks', 'blacks', -100, 100),
    range('temperature', 'temperature', -100, 100), range('tint', 'tint', -100, 100), range('vibrance', 'vibrance', -100, 100),
    range('saturation', 'saturation', -100, 100), range('clarity', 'clarity', -100, 100), range('dehaze', 'dehaze', -100, 100), range('grain', 'grain', 0, 100),
  ],
}

/** The value a slider shows for a stored field. */
export function fieldToSlider(field: AdjustmentField, value: unknown) {
  return Math.round(Number(value ?? 0) * (field.scale ?? 1))
}

export function sliderToField(field: AdjustmentField, slider: number) {
  return slider / (field.scale ?? 1)
}
