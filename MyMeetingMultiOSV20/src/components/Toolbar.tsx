// The window's top: the title row, which also moves the window, and the toolbar.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { host, isDesktop } from '../host'
import type { Locale } from '../settings'
import { THEMES, themeById, type CustomTheme, type Theme } from '../themes'
import { Flag, Icon } from './Icons'
import { ToolbarMenu } from './ToolbarMenu'

type Props = {
  title: string
  filePath: string | null
  dirty: boolean
  themeId: string
  customThemes: CustomTheme[]
  language: Locale
  showStart: boolean
  outline: boolean
  preview: boolean
  numbering: boolean
  canUndo: boolean
  canRedo: boolean
  fullscreen: boolean
  onToggleStart: () => void
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onPrint: () => void
  onExport: () => void
  onAddSection: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleOutline: () => void
  onTogglePreview: () => void
  onToggleNumbering: () => void
  onToggleFullscreen: () => void
  onTheme: (id: string) => void
  onLanguage: (language: Locale) => void
  onPreferences: (tab?: string) => void
  onGuide: () => void
  onTutorial: () => void
  onAbout: () => void
  onRequestClose: () => void
}

/** The palette button and its list of every theme, by kind. */
function ThemeMenu({ themeId, customThemes, language, onTheme, onPreferences }: Pick<Props, 'themeId' | 'customThemes' | 'language' | 'onTheme' | 'onPreferences'>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
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
    <div className="popup-host" ref={root}>
      <button type="button" className={open ? 'tb-btn active' : 'tb-btn'} data-command="theme" aria-expanded={open} aria-label={t('toolbar.theme')} title={`${t('toolbar.theme')}: ${customThemes.find((item) => item.id === themeId)?.name ?? nameOf(themeById(themeId))}`} onClick={() => setOpen(!open)}>
        <Icon name="theme" />
        <Icon name="caret" size={12} />
      </button>
      {open && (
        <div className="menu-pop theme-pop" role="menu" data-theme-menu="">
          <div className="theme-pop-top">
            <button type="button" data-command="theme-settings" onClick={() => { setOpen(false); onPreferences('theme') }}><Icon name="settings" /><span className="menu-label">{t('start.themeSettings')}</span></button>
          </div>
          <div className="theme-pop-custom" data-theme-custom-list="">
            <h4>{t('theme.mine')}</h4>
            {customThemes.length > 0 ? (
              <div className="theme-pop-columns">{customThemes.map((item) => row(themeById(item.id), item.name))}</div>
            ) : (
              <p className="theme-pop-empty">{t('theme.hint')}</p>
            )}
          </div>
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

function ToolButton({ icon, label, onClick, disabled, active, command }: { icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean; command: string }) {
  return (
    <button type="button" className={active ? 'tb-btn active' : 'tb-btn'} data-command={command} aria-pressed={active} aria-label={label} disabled={disabled} title={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
}

export function Toolbar(props: Props) {
  const { title, filePath, dirty, themeId, customThemes, language, showStart, outline, preview, numbering, canUndo, canRedo, fullscreen } = props
  const { t } = useTranslation()

  const onTitlePointer = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest('button, a, input')) return
    if (event.detail >= 2) void host.toggleMaximize()
    else void host.startDrag()
  }

  return (
    <>
      <div className="menubar" onPointerDown={onTitlePointer}>
        <span className="app-title">
          <img src="./icon.png" alt="" />
          <strong>MyMeeting</strong>
          <span className="app-version">{__APP_VERSION__}</span>
        </span>
        <button type="button" className={showStart ? 'start-toggle active' : 'start-toggle'} data-command="start" title={t('start.title')} aria-pressed={showStart} onClick={props.onToggleStart}>
          <Icon name="home" size={14} />
          <span>{t('start.title')}</span>
        </button>
        <ToolbarMenu
          command="file"
          label={t('toolbar.file')}
          icon={<Icon name="file" />}
          items={[
            { icon: <Icon name="new" />, label: t('toolbar.new'), hint: 'Ctrl+N', onClick: props.onNew },
            { icon: <Icon name="open" />, label: t('toolbar.open'), hint: 'Ctrl+O', onClick: props.onOpen },
            { icon: <Icon name="save" />, label: t('toolbar.save'), hint: 'Ctrl+S', onClick: props.onSave },
            { icon: <Icon name="saveAs" />, label: t('toolbar.saveAs'), hint: 'Ctrl+Shift+S', onClick: props.onSaveAs },
            { icon: <Icon name="print" />, label: t('toolbar.print'), hint: 'Ctrl+P', onClick: props.onPrint },
            { icon: <Icon name="export" />, label: t('toolbar.export'), hint: 'Ctrl+E', onClick: props.onExport },
            { icon: <Icon name="settings" />, label: t('toolbar.settings'), onClick: () => props.onPreferences() },
            { icon: <Icon name="power" />, label: t('toolbar.exit'), onClick: props.onRequestClose },
          ]}
        />
        <ToolbarMenu
          command="edit"
          label={t('toolbar.edit')}
          icon={<Icon name="edit" />}
          items={[
            { icon: <Icon name="undo" />, label: t('toolbar.undo'), hint: 'Ctrl+Z', disabled: !canUndo, onClick: props.onUndo },
            { icon: <Icon name="redo" />, label: t('toolbar.redo'), hint: 'Ctrl+Y', disabled: !canRedo, onClick: props.onRedo },
            { icon: <Icon name="addSection" />, label: t('toolbar.addSection'), onClick: props.onAddSection },
          ]}
        />
        <ToolbarMenu
          command="view"
          label={t('toolbar.view')}
          icon={<Icon name="eye" />}
          items={[
            { icon: <Icon name="panelLeft" />, label: outline ? t('panel.hideOutline') : t('panel.showOutline'), onClick: props.onToggleOutline },
            { icon: <Icon name="panelRight" />, label: preview ? t('panel.hidePreview') : t('panel.showPreview'), onClick: props.onTogglePreview },
            { icon: <Icon name="numbered" />, label: numbering ? t('toolbar.numberingOff') : t('toolbar.numberingOn'), onClick: props.onToggleNumbering },
            { icon: <Icon name="fullscreen" />, label: t('toolbar.fullscreen'), hint: 'F11', onClick: props.onToggleFullscreen },
          ]}
        />
        <ToolbarMenu
          command="help"
          label={t('toolbar.help')}
          icon={<Icon name="guide" />}
          items={[
            { icon: <Icon name="guide" />, label: t('guide.title'), hint: 'F1', onClick: props.onGuide },
            { icon: <Icon name="tutorial" />, label: t('tutorial.title'), onClick: props.onTutorial },
            { icon: <Icon name="about" />, label: t('toolbar.about'), onClick: props.onAbout },
          ]}
        />
        <span className="title-file" data-title-file="" title={filePath ?? title}>{dirty ? '● ' : ''}{title}</span>
        <span className="title-gap" />
        {isDesktop && (
          <div className="window-controls" data-main-window-controls="">
            <button type="button" aria-label={t('toolbar.minimize')} title={t('toolbar.minimize')} data-command="minimize" onClick={() => void host.minimize()}><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></button>
            <button type="button" aria-label={t('toolbar.maximize')} title={t('toolbar.maximize')} data-command="maximize" onClick={() => void host.toggleMaximize()}><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" /></svg></button>
            <button type="button" className="close" aria-label={t('toolbar.close')} title={t('toolbar.close')} data-command="close" onClick={props.onRequestClose}><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg></button>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="tool-group">
          <ToolButton command="new" icon="new" label={`${t('toolbar.new')} (Ctrl+N)`} onClick={props.onNew} />
          <ToolButton command="open" icon="open" label={`${t('toolbar.open')} (Ctrl+O)`} onClick={props.onOpen} />
          <ToolButton command="save" icon="save" label={`${t('toolbar.save')} (Ctrl+S)`} onClick={props.onSave} />
          <ToolButton command="saveAs" icon="saveAs" label={`${t('toolbar.saveAs')} (Ctrl+Shift+S)`} onClick={props.onSaveAs} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <ToolButton command="print" icon="print" label={`${t('toolbar.print')} (Ctrl+P)`} onClick={props.onPrint} />
          <ToolButton command="export" icon="export" label={`${t('toolbar.export')} (Ctrl+E)`} onClick={props.onExport} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <ToolButton command="undo" icon="undo" label={`${t('toolbar.undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={props.onUndo} />
          <ToolButton command="redo" icon="redo" label={`${t('toolbar.redo')} (Ctrl+Y)`} disabled={!canRedo} onClick={props.onRedo} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <ToolButton command="addSection" icon="addSection" label={t('toolbar.addSection')} onClick={props.onAddSection} />
        </div>
        <span className="tool-sep" />
        <div className="tool-group">
          <ToolButton command="outline" icon="panelLeft" label={outline ? t('panel.hideOutline') : t('panel.showOutline')} active={outline} onClick={props.onToggleOutline} />
          <ToolButton command="preview" icon="panelRight" label={preview ? t('panel.hidePreview') : t('panel.showPreview')} active={preview} onClick={props.onTogglePreview} />
          <ToolButton command="numbering" icon="numbered" label={t('toolbar.numbering')} active={numbering} onClick={props.onToggleNumbering} />
          <ToolButton command="fullscreen" icon="fullscreen" label={`${t('toolbar.fullscreen')} (F11)`} active={fullscreen} onClick={props.onToggleFullscreen} />
        </div>
        <div className="toolbar-end">
          <ThemeMenu themeId={themeId} customThemes={customThemes} language={language} onTheme={props.onTheme} onPreferences={props.onPreferences} />
          <button type="button" className="tb-btn" data-command="language" title={`${t('toolbar.language')}: ${language === 'en' ? '한국어' : 'English'}`} aria-label={t('toolbar.language')} onClick={() => props.onLanguage(language === 'en' ? 'ko' : 'en')}>
            <Flag country={language === 'en' ? 'kr' : 'gb'} />
          </button>
          <ToolButton command="preferences" icon="settings" label={t('toolbar.settings')} onClick={() => props.onPreferences()} />
          <ToolButton command="about" icon="about" label={t('toolbar.about')} onClick={props.onAbout} />
        </div>
      </div>
    </>
  )
}
