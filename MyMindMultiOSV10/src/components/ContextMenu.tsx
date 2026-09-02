import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContextMenuState } from '../types'
import {
  IconChild,
  IconCopy,
  IconDuplicate,
  IconEdit,
  IconPaste,
  IconRedo,
  IconSibling,
  IconText,
  IconTrash,
  IconUndo,
} from './Icons'

type Props = {
  menu: ContextMenuState
  selectedCount: number
  canPaste: boolean
  canUndo: boolean
  canRedo: boolean
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
  onAddText: () => void
  onAddChild: () => void
  onAddSibling: () => void
  onEdit: () => void
  onDuplicate: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
}

type ItemProps = {
  icon: ReactNode
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}

function MenuItem({ icon, label, disabled, danger, onClick }: ItemProps) {
  return (
    <button
      type="button"
      className={danger ? 'context-item danger' : 'context-item'}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="context-item-icon">{icon}</span>
      <span className="context-item-label">{label}</span>
    </button>
  )
}

export function ContextMenu({
  menu,
  selectedCount,
  canPaste,
  canUndo,
  canRedo,
  onClose,
  onUndo,
  onRedo,
  onAddText,
  onAddChild,
  onAddSibling,
  onEdit,
  onDuplicate,
  onCopy,
  onPaste,
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

  const run = (action: () => void) => () => {
    action()
    onClose()
  }

  return (
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {multi ? (
        <div className="context-header">{t('context.selectedCount', { count: selectedCount })}</div>
      ) : null}

      <MenuItem
        icon={<IconUndo />}
        label={t('toolbar.undo')}
        disabled={!canUndo}
        onClick={run(onUndo)}
      />
      <MenuItem
        icon={<IconRedo />}
        label={t('toolbar.redo')}
        disabled={!canRedo}
        onClick={run(onRedo)}
      />

      <div className="context-sep" />

      <MenuItem
        icon={<IconChild />}
        label={t('context.addChild')}
        disabled={multi}
        onClick={run(onAddChild)}
      />
      <MenuItem
        icon={<IconSibling />}
        label={t('context.addSibling')}
        disabled={multi}
        onClick={run(onAddSibling)}
      />
      <MenuItem
        icon={<IconText />}
        label={t('context.addText')}
        disabled={hasNode}
        onClick={run(onAddText)}
      />
      <MenuItem
        icon={<IconEdit />}
        label={t('context.edit')}
        disabled={!hasNode || multi}
        onClick={run(onEdit)}
      />

      <div className="context-sep" />

      <MenuItem
        icon={<IconDuplicate />}
        label={t('context.duplicate')}
        disabled={!hasNode || multi}
        onClick={run(onDuplicate)}
      />
      <MenuItem
        icon={<IconCopy />}
        label={t('context.copy')}
        disabled={!hasNode || multi}
        onClick={run(onCopy)}
      />
      <MenuItem
        icon={<IconPaste />}
        label={t('context.paste')}
        disabled={!canPaste}
        onClick={run(onPaste)}
      />

      <div className="context-sep" />

      <MenuItem
        icon={<IconTrash />}
        label={multi ? t('context.deleteSelected', { count: selectedCount }) : t('context.delete')}
        danger
        disabled={!hasNode}
        onClick={run(onDelete)}
      />
    </div>
  )
}
