import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExportFormat } from '../utils/exportImage'

type Props = {
  open: boolean
  onExport: (format: ExportFormat, transparent: boolean) => void
  onCancel: () => void
}

const FORMATS: ExportFormat[] = ['png', 'jpeg', 'webp', 'svg']

/** Choose an image format and whether the background is transparent. */
export function ExportDialog({ open, onExport, onCancel }: Props) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ExportFormat>('png')
  const [transparent, setTransparent] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  // JPEG has no alpha channel, so transparency is unavailable.
  const transparentDisabled = format === 'jpeg'
  const transparentChecked = transparent && !transparentDisabled

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>{t('export.title')}</h2>

        <div className="property-field">
          <span>{t('export.format')}</span>
          <div className="export-formats">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                className={`tb-btn ${format === f ? 'active' : ''}`}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <label className={`export-transparent ${transparentDisabled ? 'disabled' : ''}`}>
          <input
            type="checkbox"
            checked={transparentChecked}
            disabled={transparentDisabled}
            onChange={(e) => setTransparent(e.target.checked)}
          />
          <span>{t('export.transparent')}</span>
        </label>
        {transparentDisabled ? <p className="export-hint">{t('export.jpegHint')}</p> : null}

        <div className="about-actions">
          <button type="button" className="tb-btn" onClick={onCancel}>
            {t('export.cancel')}
          </button>
          <button
            type="button"
            className="tb-btn primary"
            onClick={() => onExport(format, transparentChecked)}
          >
            {t('export.export')}
          </button>
        </div>
      </div>
    </div>
  )
}
