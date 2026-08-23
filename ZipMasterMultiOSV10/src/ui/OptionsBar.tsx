import { useState } from 'react'
import type { ArchiveFormat } from '@core/types'
import { ALL_FORMATS, FORMAT_LABELS } from '@core/format'
import { useStore } from './store'

/** 분할 크기 프리셋(MB). 사용자 지정 시 직접 입력. */
const SPLIT_PRESETS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

/** 압축 옵션 바(포맷 · 단일/분할 · 분할 크기). 실제 실행은 툴바 버튼이 담당. */
export function OptionsBar() {
  const { t, caps, busy, format, setFormat, split, setSplit, splitSizeMb, setSplitSizeMb } = useStore()
  const creatable = ALL_FORMATS.filter((f) => caps.create[f])
  const [custom, setCustom] = useState(!SPLIT_PRESETS.includes(splitSizeMb))

  return (
    <div className="options-bar">
      <div className="opt-group">
        <label className="field-label">{t.format}</label>
        <select value={format} disabled={busy} onChange={(e) => setFormat(e.target.value as ArchiveFormat)}>
          {creatable.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

      <div className="opt-group mode-row">
        <label className="radio">
          <input type="radio" name="cmode" checked={!split} disabled={busy} onChange={() => setSplit(false)} />
          {t.modeSingle}
        </label>
        <label className="radio">
          <input
            type="radio"
            name="cmode"
            checked={split}
            disabled={busy || !caps.split}
            onChange={() => setSplit(true)}
          />
          {t.modeSplit}
        </label>
      </div>

      {split && (
        <div className="opt-group">
          <label className="field-label">{t.splitSizeLabel}</label>
          <select
            value={custom ? 'custom' : String(splitSizeMb)}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setCustom(true)
              } else {
                setCustom(false)
                setSplitSizeMb(Number(e.target.value))
              }
            }}
          >
            {SPLIT_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p} MB
              </option>
            ))}
            <option value="custom">{t.splitCustom}…</option>
          </select>
          {custom && (
            <input
              type="number"
              min={1}
              max={10240}
              value={splitSizeMb}
              disabled={busy}
              onChange={(e) => setSplitSizeMb(Math.max(1, Number(e.target.value) || 1))}
            />
          )}
          <span className="hint">{t.splitHint}</span>
        </div>
      )}
    </div>
  )
}
