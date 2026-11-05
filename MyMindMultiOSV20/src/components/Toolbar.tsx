// The window's top: the title row, which also moves the window, and the toolbar.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { host, isDesktop } from '../host'
import { useSystemFonts } from '../hooks/useSystemFonts'
import { MIN_WINDOW_HEIGHT, requiredWidth } from '../minsize'
import { NODE_ICONS, nodeIconById } from '../nodeIcons'
import { DEFAULT_DIAGRAM_THEME } from '../diagramThemes'
import { DEFAULT_LINE_THEME } from '../lineThemes'
import { THEMES, themeById, type CustomTheme, type Theme } from '../themes'
import type { DiagramDocument, DiagramMode, LayoutDirection, Locale, TextStyle } from '../types'
import { Flag, Icon } from './Icons'
import { Stepper } from './controls'
import { NodeIconPicture, diagramThemeOptions } from './DiagramThemes'
import { lineThemeOptions } from './LinePreview'
import { ToolbarDropdown } from './ToolbarDropdown'
import { ToolbarMenu } from './ToolbarMenu'

type Props = {
  doc: DiagramDocument
  title: string
  themeId: string
  customThemes: CustomTheme[]
  language: Locale
  showGrid: boolean
  showRulers: boolean
  leftPanel: boolean
  rightPanel: boolean
  showStart: boolean
  canUndo: boolean
  canRedo: boolean
  onToggleStart: () => void
  onNew: (mode?: DiagramMode) => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onPrint: () => void
  onLineTheme: (id: string) => void
  onDiagramTheme: (id: string) => void
  onCustomTheme: () => void
  textStyle?: TextStyle
  onTextStyle: (style: Partial<TextStyle>) => void
  nodeIcon?: string
  onNodeIcon: (icon: string | undefined) => void
  onAddMemo: () => void
  onImage: () => void
  showMemos: boolean
  onToggleMemos: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
  onTutorial: () => void
  onExport: () => void
  onMode: (mode: DiagramMode) => void
  onLayout: (layout: LayoutDirection) => void
  onTheme: (id: string) => void
  onLanguage: (language: Locale) => void
  onToggleGrid: () => void
  onToggleRulers: () => void
  onToggleLeftPanel: () => void
  onToggleRightPanel: () => void
  onResetView: () => void
  onFitView: () => void
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
function ThemeMenu({ themeId, customThemes, language, onTheme, onPreferences, onCustomTheme }: Pick<Props, 'themeId' | 'customThemes' | 'language' | 'onTheme' | 'onPreferences' | 'onCustomTheme'>) {
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
      <button type="button" className={open ? 'tb-btn active' : 'tb-btn'} data-command="theme" aria-expanded={open} aria-label={t('toolbar.theme')} title={`${t('toolbar.theme')}: ${customThemes.find((item) => item.id === themeId)?.name ?? nameOf(themeById(themeId))}`} onClick={() => setOpen(!open)}>
        <Icon name="theme" />
        <Icon name="caret" size={12} />
      </button>
      {open && (
        <div className="menu-pop theme-pop" role="menu" data-theme-menu="">
          <div className="theme-pop-top">
            <button type="button" data-command="theme-custom" onClick={() => { setOpen(false); onCustomTheme() }}><Icon name="color" /><span className="menu-label">{t('theme.mine')}</span></button>
            <button type="button" data-command="theme-settings" onClick={() => { setOpen(false); onPreferences('theme') }}><Icon name="settings" /><span className="menu-label">{t('toolbar.settings')}</span></button>
          </div>
          {customThemes.length > 0 && (
            <div className="theme-pop-custom" data-theme-custom-list="">
              <div className="theme-pop-columns">{customThemes.map((item) => row(themeById(item.id), item.name))}</div>
            </div>
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

/** An icon alone; its tooltip says what it does. */
function ToolButton({ icon, label, onClick, disabled, active, command }: { icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean; command: string }) {
  return (
    <button type="button" className={active ? 'tb-btn active' : 'tb-btn'} data-command={command} aria-pressed={active} aria-label={label} disabled={disabled} title={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
}

function GlyphButton({ glyph, extra, label, on, disabled, onClick, command }: { glyph: string; extra: string; label: string; on?: boolean; disabled?: boolean; onClick: () => void; command: string }) {
  return (
    <button type="button" className={on ? 'tb-btn tb-glyph active' : 'tb-btn tb-glyph'} data-command={command} aria-pressed={!!on} aria-label={label} disabled={disabled} title={label} onClick={onClick}>
      <span className={extra}>{glyph}</span>
    </button>
  )
}

export function Toolbar(props: Props) {
  const { doc, title, themeId, customThemes, language, showGrid, showRulers, leftPanel, rightPanel, showStart, canUndo, canRedo, onToggleStart, onNew, onOpen, onSave, onSaveAs, onPrint, onLineTheme, onDiagramTheme, onCustomTheme, textStyle, onTextStyle, nodeIcon, onNodeIcon, onAddMemo, onImage, showMemos, onToggleMemos, fullscreen, onToggleFullscreen, onTutorial, onExport, onMode, onLayout, onTheme, onLanguage, onToggleGrid, onToggleRulers, onToggleLeftPanel, onToggleRightPanel, onResetView, onFitView, onAutoAlign, onPreferences, onGuide, onAbout, onRequestClose, onUndo, onRedo, onAddChild, onAddSibling, onDelete } = props
  const { t } = useTranslation()
  const menubar = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)

  // The window cannot get narrower than what its two top rows need: nothing there is ever clipped.
  // Labels change with the language and the theme name, so this follows the real widths.
  useEffect(() => {
    let raf = 0
    const measure = () => {
      if (menubar.current && toolbar.current) void host.setMinimumSize(requiredWidth(menubar.current, toolbar.current), MIN_WINDOW_HEIGHT)
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

  const { fonts, load: loadFonts } = useSystemFonts()
  const fontValue = textStyle?.fontFamily ?? 'notoSansKr'
  const presetFonts = ['notoSansKr', 'outfit', 'serif', 'mono']
  const fontOptions = [
    ...presetFonts.map((value) => ({ value, label: t(`font.${value}`) })),
    ...fonts.filter((name) => !presetFonts.includes(name)).map((value) => ({ value, label: value })),
  ]
  if (!fontOptions.some((item) => item.value === fontValue)) fontOptions.push({ value: fontValue, label: fontValue })

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
            { icon: <Icon name="print" />, label: t('toolbar.print'), hint: 'Ctrl+P', onClick: onPrint },
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
            { icon: <Icon name="memo" />, label: t('memo.add'), onClick: onAddMemo },
            { icon: <Icon name="image" />, label: t('toolbar.image'), onClick: onImage },
            { icon: <Icon name="delete" />, label: t('context.delete'), hint: 'Del', disabled: !doc.selectedId, onClick: onDelete },
          ]}
        />
        <ToolbarMenu
          command="view"
          label={t('toolbar.view')}
          icon={<Icon name="eye" />}
          items={[
            { icon: <Icon name="fitAll" />, label: t('toolbar.fit'), onClick: onFitView },
            { icon: <Icon name="center" />, label: t('toolbar.reset'), onClick: onResetView },
            { icon: <Icon name="align" />, label: t('toolbar.align'), onClick: onAutoAlign },
            { icon: <Icon name="gridIcon" />, label: showGrid ? t('context.hideGrid') : t('context.showGrid'), onClick: onToggleGrid },
            { icon: <Icon name="ruler" />, label: showRulers ? t('context.hideRuler') : t('context.showRuler'), onClick: onToggleRulers },
            { icon: <Icon name="panelLeft" />, label: leftPanel ? t('panel.hideLeft') : t('panel.showLeft'), onClick: onToggleLeftPanel },
            { icon: <Icon name="panelRight" />, label: rightPanel ? t('panel.hideRight') : t('panel.showRight'), onClick: onToggleRightPanel },
            { icon: <Icon name="memo" />, label: showMemos ? t('memo.hideAll') : t('memo.showAll'), onClick: onToggleMemos },
            { icon: <Icon name="fullscreen" />, label: t('toolbar.fullscreen'), hint: 'F11', onClick: onToggleFullscreen },
          ]}
        />
        <ToolbarMenu
          command="help"
          label={t('toolbar.help')}
          icon={<Icon name="guide" />}
          items={[
            { icon: <Icon name="guide" />, label: t('guide.title'), hint: 'F1', onClick: onGuide },
            { icon: <Icon name="tutorial" />, label: t('start.tutorial'), onClick: onTutorial },
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
          <ToolButton command="print" icon="print" label={`${t('toolbar.print')} (Ctrl+P)`} onClick={onPrint} />
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
          <ToolbarDropdown show="none" label={t('toolbar.layout')} title={t('toolbar.layout')} icon={<Icon name="layout" />} value={doc.layout} onChange={onLayout} options={layoutOptions} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group" data-font-tools="">
          <span data-font-menu="">
            <ToolbarDropdown show="value" label={t('panel.font')} title={t('panel.font')} icon={<Icon name="fontFile" />} value={fontValue} disabled={!textStyle} onOpen={() => void loadFonts()} onChange={(fontFamily) => onTextStyle({ fontFamily })} options={fontOptions} />
          </span>
          <Stepper id="toolbarFontSize" unit="px" min={8} max={120} value={textStyle?.fontSize ?? 13} disabled={!textStyle} labels={{ minus: t('toolbar.fontSmaller'), plus: t('toolbar.fontLarger') }} onChange={(fontSize) => onTextStyle({ fontSize })} />
          <GlyphButton command="bold" glyph="B" extra="" label={t('style.bold')} on={textStyle?.bold} disabled={!textStyle} onClick={() => onTextStyle({ bold: !textStyle?.bold })} />
          <GlyphButton command="italic" glyph="I" extra="italic" label={t('style.italic')} on={textStyle?.italic} disabled={!textStyle} onClick={() => onTextStyle({ italic: !textStyle?.italic })} />
          <GlyphButton command="underline" glyph="U" extra="underline" label={t('style.underline')} on={textStyle?.underline} disabled={!textStyle} onClick={() => onTextStyle({ underline: !textStyle?.underline })} />
          <GlyphButton command="strike" glyph="S" extra="strike" label={t('style.strike')} on={textStyle?.strike} disabled={!textStyle} onClick={() => onTextStyle({ strike: !textStyle?.strike })} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <span data-icon-menu="">
            <ToolbarDropdown<string> show="none" label={t('toolbar.icons')} title={t('toolbar.icons')} icon={<Icon name="star" />} triggerIcon={nodeIconById(nodeIcon) ? <NodeIconPicture item={nodeIconById(nodeIcon)!} size={16} /> : <Icon name="star" />} value={nodeIcon ?? ''} disabled={!doc.selectedId} onChange={(id) => onNodeIcon(id || undefined)} options={[{ value: '', label: t('icons.none'), icon: <Icon name="close" /> }, ...NODE_ICONS.map((item) => ({ value: item.id, label: item[language], icon: <NodeIconPicture item={item} size={16} /> }))]} />
          </span>
          <ToolButton command="memo" icon="memo" label={t('memo.add')} onClick={onAddMemo} />
          <ToolButton command="image" icon="image" label={t('toolbar.image')} onClick={onImage} />
          <span data-diagram-theme-menu="">
            <ToolbarDropdown show="none" label={t('toolbar.diagramTheme')} title={t('toolbar.diagramTheme')} icon={<Icon name="color" />} value={doc.diagramTheme ?? DEFAULT_DIAGRAM_THEME} onChange={onDiagramTheme} options={diagramThemeOptions(language)} />
          </span>
          <span data-line-theme="">
            <ToolbarDropdown show="none" label={t('toolbar.lineTheme')} title={t('toolbar.lineTheme')} icon={<Icon name="line" />} value={doc.lineTheme ?? DEFAULT_LINE_THEME} onChange={onLineTheme} options={lineThemeOptions(language)} />
          </span>
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <ToolButton command="fit" icon="fitAll" label={t('toolbar.fit')} onClick={onFitView} />
          <ToolButton command="reset" icon="center" label={t('toolbar.reset')} onClick={onResetView} />
          <ToolButton command="align" icon="align" label={t('toolbar.align')} onClick={onAutoAlign} />
          <ToolButton command="grid" icon="gridIcon" label={t('toolbar.grid')} active={showGrid} onClick={onToggleGrid} />
          <ToolButton command="ruler" icon="ruler" label={t('toolbar.ruler')} active={showRulers} onClick={onToggleRulers} />
          <ToolButton command="left-panel" icon="panelLeft" label={leftPanel ? t('panel.hideLeft') : t('panel.showLeft')} active={leftPanel} onClick={onToggleLeftPanel} />
          <ToolButton command="right-panel" icon="panelRight" label={rightPanel ? t('panel.hideRight') : t('panel.showRight')} active={rightPanel} onClick={onToggleRightPanel} />
          <ToolButton command="fullscreen" icon="fullscreen" label={`${t('toolbar.fullscreen')} (F11)`} active={fullscreen} onClick={onToggleFullscreen} />
        </div>
        <div className="toolbar-end">
          <ThemeMenu themeId={themeId} customThemes={customThemes} language={language} onTheme={onTheme} onPreferences={onPreferences} onCustomTheme={onCustomTheme} />
          <button type="button" className="tb-btn" data-command="language" title={`${t('toolbar.language')}: ${language === 'en' ? '한국어' : 'English'}`} aria-label={t('toolbar.language')} onClick={() => onLanguage(language === 'en' ? 'ko' : 'en')}>
            <Flag country={language === 'en' ? 'kr' : 'gb'} />
          </button>
          <ToolButton command="preferences" icon="settings" label={t('toolbar.settings')} onClick={() => onPreferences()} />
          <ToolButton command="about" icon="about" label={t('toolbar.about')} onClick={onAbout} />
        </div>
      </div>
    </>
  )
}
