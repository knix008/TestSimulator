import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NODE_COLORS } from '../constants/colors'
import type { ContextMenuState, LineType, ShapeType } from '../types'

type SubMenu = 'shape' | 'color' | 'line' | null

type Props = {
  menu: ContextMenuState
  currentShape: ShapeType
  currentColor: string
  currentLine: LineType
  onClose: () => void
  onAddChild: () => void
  onAddSibling: () => void
  onEdit: () => void
  onDelete: () => void
  onShape: (shape: ShapeType) => void
  onColor: (color: string) => void
  onLine: (line: LineType) => void
}

const SHAPES: ShapeType[] = ['rounded', 'rect', 'ellipse', 'diamond', 'parallelogram']
const LINES: LineType[] = ['solid', 'dashed', 'dotted', 'curve']

export function ContextMenu({
  menu,
  currentShape,
  currentColor,
  currentLine,
  onClose,
  onAddChild,
  onAddSibling,
  onEdit,
  onDelete,
  onShape,
  onColor,
  onLine,
}: Props) {
  const { t } = useTranslation()
  const [sub, setSub] = useState<SubMenu>(null)
  const hasNode = Boolean(menu.nodeId)

  useEffect(() => {
    if (!menu.visible) {
      setSub(null)
      return
    }
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
      <button
        type="button"
        onClick={() => {
          onAddChild()
          onClose()
        }}
      >
        {t('context.addChild')}
      </button>
      <button
        type="button"
        onClick={() => {
          onAddSibling()
          onClose()
        }}
      >
        {t('context.addSibling')}
      </button>
      <button
        type="button"
        disabled={!hasNode}
        onClick={() => {
          onEdit()
          onClose()
        }}
      >
        {t('context.edit')}
      </button>

      <div className="context-sep" />

      <div className={`context-item has-sub ${sub === 'shape' ? 'open' : ''}`}>
        <button type="button" disabled={!hasNode} onClick={() => setSub(sub === 'shape' ? null : 'shape')}>
          {t('context.changeShape')}
          <span className="context-arrow">▸</span>
        </button>
        {sub === 'shape' && hasNode ? (
          <div className="context-submenu">
            {SHAPES.map((shape) => (
              <button
                key={shape}
                type="button"
                className={shape === currentShape ? 'selected' : ''}
                onClick={() => {
                  onShape(shape)
                  onClose()
                }}
              >
                {t(`shape.${shape}`)}
                {shape === currentShape ? <span className="tb-check">✓</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`context-item has-sub ${sub === 'color' ? 'open' : ''}`}>
        <button type="button" disabled={!hasNode} onClick={() => setSub(sub === 'color' ? null : 'color')}>
          {t('context.changeColor')}
          <span className="color-swatch sm" style={{ background: currentColor, marginLeft: 8 }} />
          <span className="context-arrow">▸</span>
        </button>
        {sub === 'color' && hasNode ? (
          <div className="context-submenu color-submenu">
            <div className="color-grid">
              {NODE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-chip ${color.toLowerCase() === currentColor.toLowerCase() ? 'selected' : ''}`}
                  style={{ background: color }}
                  title={color}
                  onClick={() => {
                    onColor(color)
                    onClose()
                  }}
                />
              ))}
            </div>
            <label className="color-custom">
              <span>{t('toolbar.color')}</span>
              <input
                type="color"
                value={currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#3b82f6'}
                onChange={(e) => onColor(e.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className={`context-item has-sub ${sub === 'line' ? 'open' : ''}`}>
        <button type="button" disabled={!hasNode} onClick={() => setSub(sub === 'line' ? null : 'line')}>
          {t('context.changeLine')}
          <span className="context-arrow">▸</span>
        </button>
        {sub === 'line' && hasNode ? (
          <div className="context-submenu">
            {LINES.map((line) => (
              <button
                key={line}
                type="button"
                className={line === currentLine ? 'selected' : ''}
                onClick={() => {
                  onLine(line)
                  onClose()
                }}
              >
                {t(`line.${line}`)}
                {line === currentLine ? <span className="tb-check">✓</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

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
        {t('context.delete')}
      </button>
    </div>
  )
}
