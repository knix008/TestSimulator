import { useState } from 'react'
import type { ArchiveFormat } from '@core/types'
import { ALL_FORMATS, FORMAT_LABELS, archiveBaseName, extensionFor } from '@core/format'
import { useStore } from './store'

/** 분할 크기 프리셋(MB). 사용자 지정 시 직접 입력. */
const SPLIT_PRESETS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

/**
 * 압축 옵션 팝업: 대상이 정해지면(compressReq) 열리며,
 * 포맷·단일/분할·분할 크기를 고른 뒤 압축을 시작한다. 기본값은 마지막 선택을 따른다.
 */
export function CompressModal() {
  const {
    t,
    caps,
    compressReq,
    confirmCompress,
    cancelCompress,
    format: defFormat,
    split: defSplit,
    splitSizeMb: defSize
  } = useStore()

  const creatable = ALL_FORMATS.filter((f) => caps.create[f])
  const [format, setFormat] = useState<ArchiveFormat>(
    caps.create[defFormat] ? defFormat : creatable[0] ?? 'zip'
  )
  const [split, setSplit] = useState<boolean>(defSplit && caps.split)
  const [splitSizeMb, setSplitSizeMb] = useState<number>(defSize)
  const [custom, setCustom] = useState(!SPLIT_PRESETS.includes(defSize))
  const [busy, setBusy] = useState(false)
  // 기본 파일 이름: 첫 입력(파일/폴더) 이름에서 확장자를 뗀 값. 사용자가 수정 가능.
  const [baseName, setBaseName] = useState<string>(() => archiveBaseName(compressReq?.[0]?.entryName ?? ''))

  if (!compressReq) return null

  const trimmed = baseName.trim()
  const start = async () => {
    if (busy || !trimmed) return
    setBusy(true)
    await confirmCompress({ format, split, splitSizeMb, baseName: trimmed })
  }

  return (
    <div className="modal-overlay" onClick={cancelCompress}>
      <div className="modal compress-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.compressTitle}</h2>
        <p className="hint">{t.compressSummary(compressReq.length)}</p>

        <div className="settings-field">
          <span className="settings-label">{t.compressNameLabel}</span>
          <div className="compress-name">
            <input
              type="text"
              className="compress-name-input"
              value={baseName}
              disabled={busy}
              spellCheck={false}
              autoFocus
              onChange={(e) => setBaseName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && start()}
            />
            <span className="compress-name-ext">{extensionFor(format)}</span>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">{t.format}</span>
          <select value={format} disabled={busy} onChange={(e) => setFormat(e.target.value as ArchiveFormat)}>
            {creatable.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row mode-row">
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
          <div className="settings-field">
            <span className="settings-label">{t.splitSizeLabel}</span>
            <div className="settings-actions">
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
            </div>
            <p className="hint">{t.splitHint}</p>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={cancelCompress} disabled={busy}>
            {t.compressCancel}
          </button>
          <button className="primary" onClick={start} disabled={busy || !trimmed}>
            {t.compressStart}
          </button>
        </div>
      </div>
    </div>
  )
}
