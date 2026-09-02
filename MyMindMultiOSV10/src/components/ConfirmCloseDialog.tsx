import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  open: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

/** Save / Don't Save / Cancel prompt shown when closing with unsaved changes. */
export function ConfirmCloseDialog({ open, onSave, onDiscard, onCancel }: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>{t('closePrompt.title')}</h2>
        <p>{t('closePrompt.message')}</p>
        <div className="about-actions">
          <button type="button" className="tb-btn" onClick={onCancel}>
            {t('closePrompt.cancel')}
          </button>
          <button type="button" className="tb-btn" onClick={onDiscard}>
            {t('closePrompt.discard')}
          </button>
          <button type="button" className="tb-btn primary" onClick={onSave}>
            {t('closePrompt.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
