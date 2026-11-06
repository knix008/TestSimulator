import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContextMenuState } from '../types'
import {
  IconAlign,
  IconChild,
  IconCopy,
  IconDuplicate,
  IconEdit,
  IconExport,
  IconGrid,
  IconNew,
  IconOpen,
  IconPaste,
  IconMemo,
  IconPicture,
  IconPrint,
  IconRedo,
  IconReset,
  IconSave,
  IconSelectAll,
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
  showGrid: boolean
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
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onExport: () => void
  onPrint: () => void
  onSelectAll: () => void
  onAddMemo: () => void
  onImage: () => void
  onAutoAlign: () => void
  onResetView: () => void
  onToggleGrid: () => void
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
  showGrid,
  onNew,
  onOpen,
  onSave,
  onExport,
  onPrint,
  onSelectAll,
  onAddMemo,
  onImage,
  onAutoAlign,
  onResetView,
  onToggleGrid,
}: Props) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
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
    // Before anything else sees it: a shape on the canvas stops its mouse press from going further.
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu.visible, onClose])

  // It stays on the window: opened near an edge, it moves in or scrolls.
  useLayoutEffect(() => {
    const element = box.current
    if (!menu.visible || !element) return
    element.style.maxHeight = `${window.innerHeight - 16}px`
    const rect = element.getBoundingClientRect()
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`
  }, [menu.visible, menu.x, menu.y, selectedCount])

  if (!menu.visible) return null

  const run = (action: () => void) => () => {
    action()
    onClose()
  }

  return (
    <div
      className="context-menu"
      ref={box}
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
        disabled={multi || selectedCount === 0}
        onClick={run(onAddChild)}
      />
      <MenuItem
        icon={<IconSibling />}
        label={t('context.addSibling')}
        disabled={multi || selectedCount === 0}
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

      <MenuItem icon={<IconNew />} label={t('toolbar.new')} onClick={run(onNew)} />
      <MenuItem icon={<IconOpen />} label={t('toolbar.open')} onClick={run(onOpen)} />
      <MenuItem icon={<IconSave />} label={t('toolbar.save')} onClick={run(onSave)} />
      <MenuItem icon={<IconPrint />} label={t('toolbar.print')} onClick={run(onPrint)} />
      <MenuItem icon={<IconExport />} label={t('toolbar.export')} onClick={run(onExport)} />

      <div className="context-sep" />

      <MenuItem icon={<IconMemo />} label={t('memo.add')} onClick={run(onAddMemo)} />
      <MenuItem icon={<IconPicture />} label={t('toolbar.image')} onClick={run(onImage)} />
      <MenuItem icon={<IconSelectAll />} label={`${t('context.selectAll')} (Ctrl+A)`} onClick={run(onSelectAll)} />
      <MenuItem icon={<IconAlign />} label={t('toolbar.align')} onClick={run(onAutoAlign)} />
      <MenuItem icon={<IconReset />} label={t('toolbar.reset')} onClick={run(onResetView)} />
      <MenuItem
        icon={<IconGrid />}
        label={showGrid ? t('context.hideGrid') : t('context.showGrid')}
        onClick={run(onToggleGrid)}
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
