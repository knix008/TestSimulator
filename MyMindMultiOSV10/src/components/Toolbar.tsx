import { useTranslation } from 'react-i18next'
import type { DiagramDocument, Locale, ThemeMode } from '../types'
import {
  IconAlign,
  IconExport,
  IconFish,
  IconGrid,
  IconInfo,
  IconLang,
  IconMind,
  IconNew,
  IconOpen,
  IconReset,
  IconSave,
  IconTheme,
} from './Icons'

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
  onTheme,
  onLocale,
  onToggleGrid,
  onResetView,
  onAutoAlign,
  onAbout,
}: Props) {
  const { t } = useTranslation()

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
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group toolbar-about">
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
