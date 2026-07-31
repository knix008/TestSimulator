import { useTranslation } from 'react-i18next'
import type { DiagramDocument } from '../types'

type Props = {
  doc: DiagramDocument
  statusText: string
  zoom: number
  showGrid: boolean
  onToggleGrid: () => void
}

export function StatusBar({ doc, statusText, zoom, showGrid, onToggleGrid }: Props) {
  const { t } = useTranslation()

  return (
    <footer className="status-bar">
      <span>{t('status.ready')}</span>
      <span>
        {t('status.mode')}: <strong>{t(`toolbar.${doc.mode}`)}</strong>
      </span>
      <span>
        {t('status.layout')}:{' '}
        <strong>{doc.mode === 'fishbone' ? 'Fishbone' : t(`layout.${doc.layout}`)}</strong>
      </span>
      <span>
        {t('status.nodes')}: <strong>{doc.nodes.length}</strong>
      </span>
      <span>
        {t('status.zoom')}: <strong>{Math.round(zoom * 100)}%</strong>
      </span>
      <button
        type="button"
        className={`status-toggle ${showGrid ? 'on' : ''}`}
        onClick={onToggleGrid}
        title={t('toolbar.grid')}
      >
        {t('status.grid')}: <strong>{showGrid ? t('status.on') : t('status.off')}</strong>
      </button>
      <span style={{ marginLeft: 'auto' }}>{statusText}</span>
    </footer>
  )
}
