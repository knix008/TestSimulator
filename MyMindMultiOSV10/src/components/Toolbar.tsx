import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { THEME_MODES, type DiagramDocument, type LayoutDirection, type Locale, type ThemeMode } from '../types'
import {
  IconAlign,
  IconExport,
  IconFile,
  IconFish,
  IconGrid,
  IconInfo,
  IconLang,
  IconLayout,
  IconMind,
  IconNew,
  IconOpen,
  IconRedo,
  IconReset,
  IconSave,
  IconTheme,
  IconUndo,
} from './Icons'
import { ToolbarDropdown } from './ToolbarDropdown'
import { ToolbarMenu } from './ToolbarMenu'

type Props = {
  doc: DiagramDocument
  theme: ThemeMode
  locale: Locale
  showGrid: boolean
  isElectron: boolean
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onExport: () => void
  onMode: (mode: 'mindmap' | 'fishbone') => void
  onLayout: (layout: LayoutDirection) => void
  onTheme: (theme: ThemeMode) => void
  onLocale: (locale: Locale) => void
  onToggleGrid: () => void
  onResetView: () => void
  onAutoAlign: () => void
  onAbout: () => void
  onRequestClose: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
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
  onExport,
  onMode,
  onLayout,
  onTheme,
  onLocale,
  onToggleGrid,
  onResetView,
  onAutoAlign,
  onAbout,
  onRequestClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const { t } = useTranslation()
  const mainRef = useRef<HTMLDivElement>(null)
  // Right cluster: the About button plus the window controls.
  const rightRef = useRef<HTMLDivElement>(null)

  // Keep the window from shrinking narrower than the full toolbar, so no button
  // (About included) can ever be clipped. This must track the *real* content
  // width, which changes after the web fonts load and whenever labels change —
  // so re-measure via ResizeObserver and fonts.ready, not just once.
  useEffect(() => {
    if (!isElectron || !window.mymind?.setMinWidth) return
    const main = mainRef.current
    if (!main) return
    let raf = 0
    const measure = () => {
      const rightW = rightRef.current?.offsetWidth ?? 0
      // main is flex:0 1 auto, so scrollWidth is the intrinsic toolbar width
      // even while it is clipped in a too-narrow window.
      const needed = main.scrollWidth + rightW + 16 /* toolbar padding */ + 16 /* gap+safety */
      window.mymind!.setMinWidth(Math.ceil(needed))
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(main)
    if (rightRef.current) ro.observe(rightRef.current)
    document.fonts?.ready.then(schedule).catch(() => {})
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [isElectron, locale, theme])

  const layoutOptions =
    doc.mode === 'fishbone'
      ? [
          { value: 'ltr' as const, label: t('layout.ltr') },
          { value: 'rtl' as const, label: t('layout.rtl') },
        ]
      : [
          { value: 'radial' as const, label: t('layout.radial') },
          { value: 'ttb' as const, label: t('layout.ttb') },
          { value: 'btt' as const, label: t('layout.btt') },
          { value: 'ltr' as const, label: t('layout.ltr') },
          { value: 'rtl' as const, label: t('layout.rtl') },
        ]

  return (
    <header className="toolbar">
      <div className="toolbar-main" ref={mainRef}>
      <div className="brand">
        <img src="./icon.png" alt="" />
        <span>{t('appName')}</span>
      </div>

      <div className="toolbar-group">
        <ToolbarMenu
          label={t('toolbar.file')}
          icon={<IconFile />}
          items={[
            { icon: <IconNew />, label: t('toolbar.new'), onClick: onNew },
            { icon: <IconOpen />, label: t('toolbar.open'), onClick: onOpen },
            { icon: <IconSave />, label: t('toolbar.save'), onClick: onSave },
            { icon: <IconExport />, label: t('toolbar.export'), onClick: onExport },
          ]}
        />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button
          type="button"
          className="tb-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title={t('toolbar.undo')}
        >
          <span className="icon"><IconUndo /></span>
          {t('toolbar.undo')}
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title={t('toolbar.redo')}
        >
          <span className="icon"><IconRedo /></span>
          {t('toolbar.redo')}
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button
          type="button"
          className="tb-btn active"
          onClick={() => onMode(doc.mode === 'mindmap' ? 'fishbone' : 'mindmap')}
          title={t('toolbar.switchTo', {
            mode: t(doc.mode === 'mindmap' ? 'toolbar.fishbone' : 'toolbar.mindmap'),
          })}
        >
          <span className="icon">{doc.mode === 'mindmap' ? <IconMind /> : <IconFish />}</span>
          {doc.mode === 'mindmap' ? t('toolbar.mindmap') : t('toolbar.fishbone')}
        </button>
        <ToolbarDropdown
          label={t('toolbar.layout')}
          title={t('toolbar.layout')}
          icon={<IconLayout />}
          value={doc.layout}
          onChange={onLayout}
          options={layoutOptions}
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
        <ToolbarDropdown
          label={t('toolbar.theme')}
          title={t('toolbar.theme')}
          icon={<IconTheme />}
          value={theme}
          onChange={onTheme}
          options={THEME_MODES.map((mode) => ({ value: mode, label: t(`theme.${mode}`) }))}
        />
        <button
          type="button"
          className="tb-btn"
          onClick={() => onLocale(locale === 'ko' ? 'en' : 'ko')}
          title={t('toolbar.language')}
        >
          <span className="icon"><IconLang /></span>
          {t(`language.${locale === 'ko' ? 'en' : 'ko'}`)}
        </button>
      </div>

      </div>

      <div className="toolbar-right" ref={rightRef}>
        <button type="button" className="tb-btn" onClick={onAbout} title={t('toolbar.about')}>
          <span className="icon"><IconInfo /></span>
          {t('toolbar.about')}
        </button>

        {isElectron ? (
          <div className="window-controls">
            <button type="button" className="tb-btn" title={t('toolbar.minimize')} onClick={() => window.mymind?.minimize()}>
              ─
            </button>
            <button type="button" className="tb-btn" title={t('toolbar.maximize')} onClick={() => window.mymind?.maximize()}>
              □
            </button>
            <button type="button" className="tb-btn close" title={t('toolbar.close')} onClick={onRequestClose}>
              ✕
            </button>
          </div>
        ) : (
          <span className="web-hint">Web</span>
        )}
      </div>
    </header>
  )
}
