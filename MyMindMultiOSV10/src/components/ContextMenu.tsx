import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContextMenuState } from '../types'

type Props = {
  menu: ContextMenuState
  selectedCount: number
  onClose: () => void
  onAddText: () => void
  onAddChild: () => void
  onAddSibling: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ContextMenu({
  menu,
  selectedCount,
  onClose,
  onAddText,
  onAddChild,
  onAddSibling,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation()
  const hasNode = Boolean(menu.nodeId)
  const multi = selectedCount > 1

  useEffect(() => {
    if (!menu.visible) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.context-menu')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu.visible, onClose])

  if (!menu.visible) return null

  return (
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {multi ? <div className="context-header">{t('context.selectedCount', { count: selectedCount })}</div> : null}
      <button
        type="button"
        disabled={multi}
        onClick={() => {
          onAddChild()
          onClose()
        }}
      >
        {t('context.addChild')}
      </button>
      <button
        type="button"
        disabled={multi}
        onClick={() => {
          onAddSibling()
          onClose()
        }}
      >
        {t('context.addSibling')}
      </button>
        <button
          type="button"
          disabled={hasNode}
          onClick={() => {
            onAddText()
            onClose()
          }}
        >
          {t('context.addText')}
        </button>
      <button
        type="button"
        disabled={!hasNode || multi}
        onClick={() => {
          onEdit()
          onClose()
        }}
      >
        {t('context.edit')}
      </button>

      <div className="context-sep" />

      <button
        type="button"
        className="danger"
        disabled={!hasNode}
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        {multi ? t('context.deleteSelected', { count: selectedCount }) : t('context.delete')}
      </button>
    </div>
  )
}
