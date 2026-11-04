import { NumberStepper } from './controls'
import { regionRange, type RegionBox } from './lib/selection'
import type { Language } from './lib/types'

/** X, Y, width and height in pixels: what the crop box and a selection are, exactly. */
export function RegionFields({ box, limit, language, tr, name, onChange }: { box: RegionBox; limit: { width: number; height: number }; language: Language; tr: (key: string) => string; name: string; onChange: (patch: Partial<RegionBox>) => void }) {
  const whole = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
  const range = regionRange(whole, limit)
  const field = (key: keyof RegionBox, letter: string, tooltip: string) => (
    <span key={key} className="region-field" data-tooltip={tooltip}>
      <span aria-hidden="true">{letter}</span>
      <NumberStepper language={language} unit="px" label={`${name} ${tooltip}`} data-region={key} value={whole[key]} min={range[key].min} max={range[key].max} onChange={(next) => onChange({ [key]: next })} />
    </span>
  )
  return (
    <span className="option-pair region-fields" data-region-fields={name}>
      {field('x', 'X', tr('regionX'))}
      {field('y', 'Y', tr('regionY'))}
      {field('width', 'W', tr('regionWidth'))}
      {field('height', 'H', tr('regionHeight'))}
    </span>
  )
}
