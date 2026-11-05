// The window's top: the title row, which also moves the window, and the toolbar.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { host, isDesktop } from '../host'
import { MIN_WINDOW_HEIGHT, fitToolbar } from '../minsize'
import { THEMES, themeById, type CustomTheme, type Theme } from '../themes'
import type { DiagramDocument, DiagramMode, LayoutDirection, Locale } from '../types'
import { Flag, Icon } from './Icons'
import { ToolbarDropdown } from './ToolbarDropdown'
import { ToolbarMenu } from './ToolbarMenu'

type Props = {
  doc: DiagramDocument
  title: string
  themeId: string
  customThemes: CustomTheme[]
  language: Locale
  showGrid: boolean
  showStart: boolean
  canUndo: boolean
  canRedo: boolean
  onToggleStart: () => void
  onNew: (mode?: DiagramMode) => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onExport: () => void
  onMode: (mode: DiagramMode) => void
  onLayout: (layout: LayoutDirection) => void
  onTheme: (id: string) => void
  onLanguage: (language: Locale) => void
  onToggleGrid: () => void
  onResetView: () => void
  onAutoAlign: () => void
  onPreferences: (tab?: string) => void
  onGuide: () => void
  onAbout: () => void
  onRequestClose: () => void
  onUndo: () => void
  onRedo: () => void
  onAddChild: () => void
  onAddSibling: () => void
  onDelete: () => void
}

/** The palette button and its list of every theme, by kind. */
function ThemeMenu({ themeId, customThemes, language, onTheme, onPreferences }: Pick<Props, 'themeId' | 'customThemes' | 'language' | 'onTheme' | 'onPreferences'>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const host_ = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event: Event) => {
      if (!host_.current?.contains(event.target as Node)) setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  const nameOf = (item: Theme) => (language === 'en' ? item.nameEn : item.nameKo)
  const row = (item: Theme, label: string) => (
    <button type="button" key={item.id} data-theme-option={item.id} className={item.id === themeId ? 'selected' : undefined} title={label} onClick={() => { setOpen(false); onTheme(item.id) }}>
      <span className="swatches">{item.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
      <span className="menu-label">{label}</span>
    </button>
  )
  return (
    <div className="popup-host" ref={host_}>
      <button type="button" className={open ? 'tb-btn active' : 'tb-btn'} data-command="theme" aria-expanded={open} title={t('toolbar.theme')} onClick={() => setOpen(!open)}>
        <Icon name="theme" />
        <span className="tb-theme-name">{customThemes.find((item) => item.id === themeId)?.name ?? nameOf(themeById(themeId))}</span>
        <Icon name="caret" size={12} />
      </button>
      {open && (
        <div className="menu-pop theme-pop" role="menu" data-theme-menu="">
          <div className="theme-pop-top">
            <button type="button" data-command="theme-settings" onClick={() => { setOpen(false); onPreferences('theme') }}><Icon name="settings" /><span className="menu-label">{t('start.themeSettings')}</span></button>
          </div>
          {customThemes.length > 0 && (
            <>
              <h4>{t('theme.mine')}</h4>
              <div className="theme-pop-columns">{customThemes.map((item) => row(themeById(item.id), item.name))}</div>
            </>
          )}
          <div className="theme-pop-columns">
            {(['light', 'dark'] as const).map((mode) => (
              <div key={mode}>
                <h4>{t(`theme.${mode}`)}</h4>
                {THEMES.filter((item) => item.mode === mode).map((item) => row(item, nameOf(item)))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolButton({ icon, label, title, onClick, disabled, active, command }: { icon: string; label: string; title?: string; onClick: () => void; disabled?: boolean; active?: boolean; command: string }) {
  return (
    <button type="button" className={active ? 'tb-btn active' : 'tb-btn'} data-command={command} aria-pressed={active} disabled={disabled} title={title ?? label} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )
}

export function Toolbar(props: Props) {
  const { doc, title, themeId, customThemes, language, showGrid, showStart, canUndo, canRedo, onToggleStart, onNew, onOpen, onSave, onSaveAs, onExport, onMode, onLayout, onTheme, onLanguage, onToggleGrid, onResetView, onAutoAlign, onPreferences, onGuide, onAbout, onRequestClose, onUndo, onRedo, onAddChild, onAddSibling, onDelete } = props
  const { t } = useTranslation()
  const menubar = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)

  // The window cannot get narrower than what its two top rows need: nothing there is ever clipped.
  // Labels change with the language and the theme name, so this follows the real widths.
  useEffect(() => {
    let raf = 0
    const measure = () => {
      if (menubar.current && toolbar.current) void host.setMinimumSize(fitToolbar(menubar.current, toolbar.current), MIN_WINDOW_HEIGHT)
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    schedule()
    const observer = new ResizeObserver(schedule)
    for (const row of [menubar.current, toolbar.current]) {
      if (!row) continue
      for (const child of row.children) observer.observe(child)
    }
    window.addEventListener('resize', schedule)
    void document.fonts?.ready.then(schedule).catch(() => {})
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
    }
  }, [language, themeId])

  const onTitlePointer = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest('button, a, input')) return
    if (event.detail >= 2) void host.toggleMaximize()
    else void host.startDrag()
  }

  const layoutOptions = (doc.mode === 'fishbone' ? (['ltr', 'rtl'] as const) : (['radial', 'ttb', 'btt', 'ltr', 'rtl'] as const)).map((value) => ({
    value: value as LayoutDirection,
    label: t(`layout.${value}`),
    icon: <Icon name="layout" />,
  }))

  return (
    <>
      <div className="menubar" ref={menubar} onPointerDown={onTitlePointer}>
        <span className="app-title">
          <img src="./icon.png" alt="" />
          <strong>MyMind</strong>
          <span className="app-version">{__APP_VERSION__}</span>
        </span>
        <button type="button" className={showStart ? 'start-toggle active' : 'start-toggle'} data-command="start" title={t('start.title')} aria-pressed={showStart} onClick={onToggleStart}>
          <Icon name="home" size={14} />
          <span>{t('start.title')}</span>
        </button>
        <ToolbarMenu
          command="file"
          label={t('toolbar.file')}
          icon={<Icon name="file" />}
          items={[
            { icon: <Icon name="mind" />, label: t('start.newMindmap'), hint: 'Ctrl+N', onClick: () => onNew('mindmap') },
            { icon: <Icon name="fish" />, label: t('start.newFishbone'), onClick: () => onNew('fishbone') },
            { icon: <Icon name="open" />, label: t('toolbar.open'), hint: 'Ctrl+O', onClick: onOpen },
            { icon: <Icon name="save" />, label: t('toolbar.save'), hint: 'Ctrl+S', onClick: onSave },
            { icon: <Icon name="saveAs" />, label: t('toolbar.saveAs'), hint: 'Ctrl+Shift+S', onClick: onSaveAs },
            { icon: <Icon name="export" />, label: t('toolbar.export'), onClick: onExport },
            { icon: <Icon name="settings" />, label: t('toolbar.settings'), onClick: () => onPreferences() },
            { icon: <Icon name="power" />, label: t('start.exit'), onClick: onRequestClose },
          ]}
        />
        <ToolbarMenu
          command="edit"
          label={t('toolbar.edit')}
          icon={<Icon name="edit" />}
          items={[
            { icon: <Icon name="undo" />, label: t('toolbar.undo'), hint: 'Ctrl+Z', disabled: !canUndo, onClick: onUndo },
            { icon: <Icon name="redo" />, label: t('toolbar.redo'), hint: 'Ctrl+Y', disabled: !canRedo, onClick: onRedo },
            { icon: <Icon name="child" />, label: t('context.addChild'), disabled: !doc.selectedId, onClick: onAddChild },
            { icon: <Icon name="sibling" />, label: t('context.addSibling'), disabled: !doc.selectedId, onClick: onAddSibling },
            { icon: <Icon name="delete" />, label: t('context.delete'), hint: 'Del', disabled: !doc.selectedId, onClick: onDelete },
          ]}
        />
        <ToolbarMenu
          command="view"
          label={t('toolbar.view')}
          icon={<Icon name="eye" />}
          items={[
            { icon: <Icon name="home" />, label: t('start.title'), onClick: onToggleStart },
            { icon: <Icon name="center" />, label: t('toolbar.reset'), onClick: onResetView },
            { icon: <Icon name="align" />, label: t('toolbar.align'), onClick: onAutoAlign },
            { icon: <Icon name="gridIcon" />, label: showGrid ? t('context.hideGrid') : t('context.showGrid'), onClick: onToggleGrid },
          ]}
        />
        <ToolbarMenu
          command="help"
          label={t('toolbar.help')}
          icon={<Icon name="guide" />}
          items={[
            { icon: <Icon name="guide" />, label: t('guide.title'), hint: 'F1', onClick: onGuide },
            { icon: <Icon name="about" />, label: t('toolbar.about'), onClick: onAbout },
          ]}
        />
        <span className="title-file" data-title-file="" title={doc.filePath ?? title}>{title}</span>
        <span className="title-gap" />
        {isDesktop && (
          <div className="window-controls" data-main-window-controls="">
            <button type="button" aria-label={t('toolbar.minimize')} title={t('toolbar.minimize')} data-command="minimize" onClick={() => void host.minimize()}><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></button>
            <button type="button" aria-label={t('toolbar.maximize')} title={t('toolbar.maximize')} data-command="maximize" onClick={() => void host.toggleMaximize()}><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" /></svg></button>
            <button type="button" className="close" aria-label={t('toolbar.close')} title={t('toolbar.close')} data-command="close" onClick={onRequestClose}><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg></button>
          </div>
        )}
      </div>

      <div className="toolbar" ref={toolbar}>
        <div className="tool-group">
          <ToolButton command="new" icon="new" label={t('toolbar.new')} onClick={() => onNew()} />
          <ToolButton command="open" icon="open" label={t('toolbar.open')} onClick={onOpen} />
          <ToolButton command="save" icon="save" label={t('toolbar.save')} onClick={onSave} />
          <ToolButton command="export" icon="export" label={t('toolbar.export')} onClick={onExport} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <ToolButton command="undo" icon="undo" label={t('toolbar.undo')} disabled={!canUndo} onClick={onUndo} />
          <ToolButton command="redo" icon="redo" label={t('toolbar.redo')} disabled={!canRedo} onClick={onRedo} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <ToolButton command="mode-mindmap" icon="mind" label={t('toolbar.mindmap')} active={doc.mode === 'mindmap'} onClick={() => onMode('mindmap')} />
          <ToolButton command="mode-fishbone" icon="fish" label={t('toolbar.fishbone')} active={doc.mode === 'fishbone'} onClick={() => onMode('fishbone')} />
          <ToolbarDropdown label={t('toolbar.layout')} title={t('toolbar.layout')} icon={<Icon name="layout" />} value={doc.layout} onChange={onLayout} options={layoutOptions} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <ToolButton command="reset" icon="center" label={t('toolbar.reset')} onClick={onResetView} />
          <ToolButton command="align" icon="align" label={t('toolbar.align')} onClick={onAutoAlign} />
          <ToolButton command="grid" icon="gridIcon" label={t('toolbar.grid')} active={showGrid} onClick={onToggleGrid} />
        </div>
        <div className="toolbar-end">
          <ThemeMenu themeId={themeId} customThemes={customThemes} language={language} onTheme={onTheme} onPreferences={onPreferences} />
          <button type="button" className="tb-btn" data-command="language" title={t('toolbar.language')} onClick={() => onLanguage(language === 'en' ? 'ko' : 'en')}>
            <Flag country={language === 'en' ? 'kr' : 'gb'} />
            <span>{language === 'en' ? '한국어' : 'English'}</span>
          </button>
          <ToolButton command="preferences" icon="settings" label={t('toolbar.settings')} onClick={() => onPreferences()} />
          <ToolButton command="about" icon="about" label={t('toolbar.about')} onClick={onAbout} />
        </div>
      </div>
    </>
  )
}
