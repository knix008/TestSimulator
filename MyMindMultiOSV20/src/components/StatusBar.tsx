import { useTranslation } from 'react-i18next'
import { host, isDesktop } from '../host'
import type { DiagramDocument } from '../types'
import { GripDots } from './controls'
import { Icon } from './Icons'

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
      <span className="status-item"><Icon name={doc.mode === 'fishbone' ? 'fish' : 'mind'} size={14} /><strong>{t(`toolbar.${doc.mode}`)}</strong></span>
      <span className="status-item"><Icon name="layout" size={14} />{t(`layout.${doc.layout}`)}</span>
      <span className="status-item"><Icon name="shape" size={14} />{t('status.nodes')}: <strong data-status="nodes">{doc.nodes.length}</strong></span>
      <span className="status-item"><Icon name="zoomIn" size={14} />{t('status.zoom')}: <strong>{Math.round(zoom * 100)}%</strong></span>
      <button type="button" className={`status-toggle ${showGrid ? 'on' : ''}`} onClick={onToggleGrid} title={t('toolbar.grid')}>
        <Icon name="gridIcon" size={14} />
        {t('status.grid')}: <strong>{showGrid ? t('status.on') : t('status.off')}</strong>
      </button>
      <span className="status-file" data-status="file">{statusText}</span>
      {isDesktop && (
        <button type="button" className="grip" aria-label="resize" title={t('tip.resize')} onPointerDown={(event) => { event.preventDefault(); void host.startResize() }}>
          <GripDots />
        </button>
      )}
    </footer>
  )
}
