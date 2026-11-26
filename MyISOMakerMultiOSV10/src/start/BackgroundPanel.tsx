/** Background choice + speed / strength / auto change — on the start screen card and in Settings. */
import type { MessageKey } from '../i18n/messages'
import { BG_NAMES_EN, BG_NAMES_KO } from './background-names'
import { BackgroundCards } from './BackgroundCards'
import type { BgPrefs } from './bgPrefs'

const AUTO_SECONDS = [10, 20, 30, 60, 120, 300]

export function BackgroundPanel({
  bg,
  onChange,
  locale,
  t,
  form = false,
}: {
  bg: BgPrefs
  onChange: (next: BgPrefs) => void
  locale: 'ko' | 'en'
  t: (key: MessageKey, ...args: string[]) => string
  /** Settings: speed / strength / auto change as label | control rows. */
  form?: boolean
}) {
  const set = (patch: Partial<BgPrefs>) => onChange({ ...bg, ...patch })
  const round = (v: number, step: number) => Math.round(v / step) * step
  /** − slider + value: one control, the buttons step by `step`. */
  const stepper = (
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    shown: string,
    apply: (v: number) => void,
  ) => (
    <span className="bg-step" data-bg-step={id}>
      <span className="bg-step-label">{label}</span>
      <button
        type="button"
        className="bg-step-btn"
        aria-label={`${label} −`}
        title={`${label} −`}
        disabled={value <= min + 1e-9}
        onClick={() => apply(Math.max(min, round(value - step, step)))}
      >
        −
      </button>
      <input type="range" min={min} max={max} step={step} value={value} {...{ [`data-bg-${id}`]: '' }} onChange={(e) => apply(Number(e.target.value))} />
      <button
        type="button"
        className="bg-step-btn"
        aria-label={`${label} +`}
        title={`${label} +`}
        disabled={value >= max - 1e-9}
        onClick={() => apply(Math.min(max, round(value + step, step)))}
      >
        +
      </button>
      <output>{shown}</output>
    </span>
  )
  return (
    <div className={`bg-panel${form ? ' bg-panel-form' : ''}`}>
      <BackgroundCards value={bg.kind} onChange={(kind) => set({ kind })} names={locale === 'ko' ? BG_NAMES_KO : BG_NAMES_EN} />
      {/* One line: speed, strength, automatic change */}
      <div className="bg-line">
        {stepper('speed', t('bgSpeed'), bg.speed, 0, 2, 0.1, bg.speed === 0 ? t('bgOff') : `${bg.speed.toFixed(1)}×`, (speed) => set({ speed }))}
        {stepper('opacity', t('bgOpacity'), bg.opacity, 0.15, 1, 0.05, `${Math.round(bg.opacity * 100)}%`, (opacity) => set({ opacity }))}
        <label className="bg-auto-line">
          <input type="checkbox" checked={bg.auto} onChange={(e) => set({ auto: e.target.checked })} />
          <span>{t('bgAuto')}</span>
          <select value={bg.autoSec} disabled={!bg.auto} onChange={(e) => set({ autoSec: Number(e.target.value) })}>
            {AUTO_SECONDS.map((sec) => (
              <option key={sec} value={sec}>
                {t('bgAutoSec', String(sec))}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
