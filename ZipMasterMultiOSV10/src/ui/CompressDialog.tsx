import { useEffect, useState } from 'react'
import type { ArchiveFormat } from '@core/types'
import { ALL_FORMATS, FORMAT_LABELS } from '@core/format'
import { useStore } from './store'

/** 분할 크기 프리셋(MB). 사용자 지정 시 직접 입력. */
const SPLIT_PRESETS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

/**
 * 탐색기 우클릭 "압축하기" 대화상자.
 * 포맷과 분할(단일/용량 분할·크기)을 선택해 대상 항목을 압축한다.
 * 초기값은 옵션 바의 현재 설정을 따른다.
 */
export function CompressDialog() {
  const { t, caps, compressTarget, confirmCompress, cancelCompress, format, split, splitSizeMb } = useStore()

  const creatable = ALL_FORMATS.filter((f) => caps.create[f])
  const [fmt, setFmt] = useState<ArchiveFormat>(format)
  const [doSplit, setDoSplit] = useState(split)
  const [sizeMb, setSizeMb] = useState(splitSizeMb)
  const [custom, setCustom] = useState(!SPLIT_PRESETS.includes(splitSizeMb))

  // 대화상자가 열릴 때마다 현재 옵션 바 값으로 초기화.
  useEffect(() => {
    if (compressTarget) {
      setFmt(format)
      setDoSplit(split)
      setSizeMb(splitSizeMb)
      setCustom(!SPLIT_PRESETS.includes(splitSizeMb))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compressTarget])

  if (!compressTarget) return null

  const confirm = () => confirmCompress({ format: fmt, split: doSplit && caps.split, splitSizeMb: sizeMb })

  return (
    <div className="modal-overlay" onClick={cancelCompress}>
      <div className="modal compress-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{t.sectionCompress}</h2>
        <p className="modal-sub">{t.compressTargetLabel(compressTarget.name)}</p>

        <div className="dialog-row">
          <label className="field-label">{t.format}</label>
          <select value={fmt} onChange={(e) => setFmt(e.target.value as ArchiveFormat)}>
            {creatable.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </div>

        <div className="dialog-row mode-row">
          <label className="radio">
            <input type="radio" name="cdmode" checked={!doSplit} onChange={() => setDoSplit(false)} />
            {t.modeSingle}
          </label>
          <label className="radio">
            <input
              type="radio"
              name="cdmode"
              checked={doSplit}
              disabled={!caps.split}
              onChange={() => setDoSplit(true)}
            />
            {t.modeSplit}
          </label>
        </div>

        {doSplit && (
          <div className="dialog-row">
            <label className="field-label">{t.splitSizeLabel}</label>
            <select
              value={custom ? 'custom' : String(sizeMb)}
              onChange={(e) => {
                if (e.target.value === 'custom') setCustom(true)
                else {
                  setCustom(false)
                  setSizeMb(Number(e.target.value))
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
                value={sizeMb}
                onChange={(e) => setSizeMb(Math.max(1, Number(e.target.value) || 1))}
              />
            )}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={cancelCompress}>{t.cancel}</button>
          <button className="primary" onClick={confirm}>
            {t.startCompress}
          </button>
        </div>
      </div>
    </div>
  )
}
