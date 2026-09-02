import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { THEME_MODES, type DiagramDocument, type LayoutDirection, type Locale, type ThemeMode } from '../types'
import {
  IconAlign,
  IconExport,
  IconFish,
  IconGrid,
  IconInfo,
  IconLang,
  IconLayout,
  IconMind,
  IconNew,
  IconOpen,
  IconReset,
  IconSave,
  IconTheme,
} from './Icons'
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
  onExport: () => void
  onMode: (mode: 'mindmap' | 'fishbone') => void
  onLayout: (layout: LayoutDirection) => void
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
  onExport,
  onMode,
  onLayout,
  onTheme,
  onLocale,
  onToggleGrid,
  onResetView,
  onAutoAlign,
  onAbout,
}: Props) {
  const { t } = useTranslation()
  const mainRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)

  // Keep the window from shrinking narrower than the full toolbar, so no button
  // (About included) can ever be clipped. Re-measure when labels change size
  // (locale/theme) and once after fonts settle.
  useEffect(() => {
    if (!isElectron || !window.mymind?.setMinWidth) return
    const measure = () => {
      const main = mainRef.current
      if (!main) return
      const controlsW = controlsRef.current?.offsetWidth ?? 0
      // main sizes to its content (flex: 0 1 auto), so scrollWidth is the true
      // intrinsic width even when the window is wide.
      const needed = main.scrollWidth + controlsW + 16 /* toolbar padding */ + 12 /* gap+safety */
      window.mymind!.setMinWidth(Math.ceil(needed))
    }
    measure()
    const id = window.setTimeout(measure, 300)
    return () => window.clearTimeout(id)
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
        <button type="button" className="tb-btn" onClick={onExport} title={t('toolbar.export')}>
          <span className="icon"><IconExport /></span>
          {t('toolbar.export')}
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
        <ToolbarDropdown
          label={t('toolbar.layout')}
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
          icon={<IconTheme />}
          value={theme}
          onChange={onTheme}
          options={THEME_MODES.map((mode) => ({ value: mode, label: t(`theme.${mode}`) }))}
        />
        <button
          type="button"
          className="tb-btn"
          onClick={() => onLocale(locale === 'ko' ? 'en' : 'ko')}
        >
          <span className="icon"><IconLang /></span>
          {t(`language.${locale === 'ko' ? 'en' : 'ko'}`)}
        </button>
      </div>

      <div className="toolbar-group toolbar-about">
        <button type="button" className="tb-btn" onClick={onAbout}>
          <span className="icon"><IconInfo /></span>
          {t('toolbar.about')}
        </button>
      </div>
      </div>

      {isElectron ? (
        <div className="window-controls" ref={controlsRef}>
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
