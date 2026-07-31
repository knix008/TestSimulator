import { useTranslation } from 'react-i18next'
import type { DiagramDocument, LayoutDirection, LineType, Locale, ShapeType, ThemeMode } from '../types'
import {
  IconAlign,
  IconChild,
  IconFish,
  IconGrid,
  IconInfo,
  IconLang,
  IconLayout,
  IconLine,
  IconMind,
  IconNew,
  IconOpen,
  IconReset,
  IconSave,
  IconShape,
  IconSibling,
  IconTheme,
  IconTrash,
} from './Icons'
import { ColorPicker } from './ColorPicker'
import { ToolbarDropdown } from './ToolbarDropdown'

type Props = {
  doc: DiagramDocument
  theme: ThemeMode
  locale: Locale
  showGrid: boolean
  isElectron: boolean
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onMode: (mode: 'mindmap' | 'fishbone') => void
  onAddChild: () => void
  onAddSibling: () => void
  onDelete: () => void
  onLayout: (layout: LayoutDirection) => void
  onShape: (shape: ShapeType) => void
  onColor: (color: string) => void
  onLine: (line: LineType) => void
  onTheme: (theme: ThemeMode) => void
  onLocale: (locale: Locale) => void
  onToggleGrid: () => void
  onResetView: () => void
  onAutoAlign: () => void
  onAbout: () => void
}

export function Toolbar({
  doc,
  theme,
  locale,
  showGrid,
  isElectron,
  onNew,
  onOpen,
  onSave,
  onMode,
  onAddChild,
  onAddSibling,
  onDelete,
  onLayout,
  onShape,
  onColor,
  onLine,
  onTheme,
  onLocale,
  onToggleGrid,
  onResetView,
  onAutoAlign,
  onAbout,
}: Props) {
  const { t } = useTranslation()

  const selected = doc.nodes.find((n) => n.id === doc.selectedId)
  const currentShape = selected?.shape ?? doc.defaultShape
  const currentColor = selected?.color ?? '#3b82f6'
  const currentLine =
    doc.edges.find((e) => e.to === doc.selectedId || e.from === doc.selectedId)?.lineType ??
    doc.defaultLine

  return (
    <header className="toolbar">
      <div className="brand">
        <img src="./icon.png" alt="" />
        <span>{t('appName')}</span>
      </div>

      <div className="toolbar-group">
        <button type="button" className="tb-btn" onClick={onNew} title={t('toolbar.new')}>
          <span className="icon"><IconNew /></span>
          {t('toolbar.new')}
        </button>
        <button type="button" className="tb-btn" onClick={onOpen} title={t('toolbar.open')}>
          <span className="icon"><IconOpen /></span>
          {t('toolbar.open')}
        </button>
        <button type="button" className="tb-btn" onClick={onSave} title={t('toolbar.save')}>
          <span className="icon"><IconSave /></span>
          {t('toolbar.save')}
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button
          type="button"
          className={`tb-btn ${doc.mode === 'mindmap' ? 'active' : ''}`}
          onClick={() => onMode('mindmap')}
        >
          <span className="icon"><IconMind /></span>
          {t('toolbar.mindmap')}
        </button>
        <button
          type="button"
          className={`tb-btn ${doc.mode === 'fishbone' ? 'active' : ''}`}
          onClick={() => onMode('fishbone')}
        >
          <span className="icon"><IconFish /></span>
          {t('toolbar.fishbone')}
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button type="button" className="tb-btn" onClick={onAddChild}>
          <span className="icon"><IconChild /></span>
          {t('toolbar.addChild')}
        </button>
        <button type="button" className="tb-btn" onClick={onAddSibling}>
          <span className="icon"><IconSibling /></span>
          {t('toolbar.addSibling')}
        </button>
        <button type="button" className="tb-btn danger" onClick={onDelete}>
          <span className="icon"><IconTrash /></span>
          {t('toolbar.delete')}
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ToolbarDropdown
          label={t('toolbar.layout')}
          icon={<IconLayout />}
          value={doc.layout}
          disabled={doc.mode === 'fishbone'}
          onChange={onLayout}
          options={[
            { value: 'radial', label: t('layout.radial') },
            { value: 'ltr', label: t('layout.ltr') },
            { value: 'rtl', label: t('layout.rtl') },
          ]}
        />
        <ToolbarDropdown
          label={t('toolbar.shape')}
          icon={<IconShape />}
          value={currentShape}
          onChange={onShape}
          options={[
            { value: 'rounded', label: t('shape.rounded') },
            { value: 'rect', label: t('shape.rect') },
            { value: 'ellipse', label: t('shape.ellipse') },
            { value: 'diamond', label: t('shape.diamond') },
            { value: 'parallelogram', label: t('shape.parallelogram') },
          ]}
        />
        <ColorPicker
          label={t('toolbar.color')}
          value={currentColor}
          disabled={!doc.selectedId}
          onChange={onColor}
        />
        <ToolbarDropdown
          label={t('toolbar.line')}
          icon={<IconLine />}
          value={currentLine}
          onChange={onLine}
          options={[
            { value: 'solid', label: t('line.solid') },
            { value: 'dashed', label: t('line.dashed') },
            { value: 'dotted', label: t('line.dotted') },
            { value: 'curve', label: t('line.curve') },
          ]}
        />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button type="button" className="tb-btn" onClick={onResetView} title={t('toolbar.reset')}>
          <span className="icon"><IconReset /></span>
          {t('toolbar.reset')}
        </button>
        <button type="button" className="tb-btn" onClick={onAutoAlign} title={t('toolbar.align')}>
          <span className="icon"><IconAlign /></span>
          {t('toolbar.align')}
        </button>
        <button
          type="button"
          className={`tb-btn ${showGrid ? 'active' : ''}`}
          onClick={onToggleGrid}
          title={t('toolbar.grid')}
        >
          <span className="icon"><IconGrid /></span>
          {t('toolbar.grid')}
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span className="icon"><IconTheme /></span>
          {t(`theme.${theme === 'dark' ? 'light' : 'dark'}`)}
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={() => onLocale(locale === 'ko' ? 'en' : 'ko')}
        >
          <span className="icon"><IconLang /></span>
          {t(`language.${locale === 'ko' ? 'en' : 'ko'}`)}
        </button>
        <button type="button" className="tb-btn" onClick={onAbout}>
          <span className="icon"><IconInfo /></span>
          {t('toolbar.about')}
        </button>
      </div>

      {isElectron ? (
        <div className="window-controls">
          <button type="button" className="tb-btn" title={t('toolbar.minimize')} onClick={() => window.mymind?.minimize()}>
            ─
          </button>
          <button type="button" className="tb-btn" title={t('toolbar.maximize')} onClick={() => window.mymind?.maximize()}>
            □
          </button>
          <button type="button" className="tb-btn close" title={t('toolbar.close')} onClick={() => window.mymind?.close()}>
            ✕
          </button>
        </div>
      ) : (
        <span className="web-hint">Web</span>
      )}
    </header>
  )
}
