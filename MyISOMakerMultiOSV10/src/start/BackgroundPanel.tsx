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
}: {
  bg: BgPrefs
  onChange: (next: BgPrefs) => void
  locale: 'ko' | 'en'
  t: (key: MessageKey, ...args: string[]) => string
}) {
  const set = (patch: Partial<BgPrefs>) => onChange({ ...bg, ...patch })
  return (
    <div className="bg-panel">
      <BackgroundCards value={bg.kind} onChange={(kind) => set({ kind })} names={locale === 'ko' ? BG_NAMES_KO : BG_NAMES_EN} />
      <div className="bg-controls">
        <label className="bg-control">
          <span>{t('bgSpeed')}</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={bg.speed}
            data-bg-speed=""
            onChange={(e) => set({ speed: Number(e.target.value) })}
          />
          <output>{bg.speed === 0 ? t('bgOff') : `${bg.speed.toFixed(1)}×`}</output>
        </label>
        <label className="bg-control">
          <span>{t('bgOpacity')}</span>
          <input
            type="range"
            min={0.15}
            max={1}
            step={0.05}
            value={bg.opacity}
            data-bg-opacity=""
            onChange={(e) => set({ opacity: Number(e.target.value) })}
          />
          <output>{Math.round(bg.opacity * 100)}%</output>
        </label>
        <label className="bg-control bg-auto">
          <input type="checkbox" checked={bg.auto} onChange={(e) => set({ auto: e.target.checked })} />
          <span>{t('bgAuto')}</span>
          <select value={bg.autoSec} disabled={!bg.auto} onChange={(e) => set({ autoSec: Number(e.target.value) })}>
            {AUTO_SECONDS.map((s) => (
              <option key={s} value={s}>
                {t('bgAutoSec', String(s))}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
