// The settings window: general options, themes (with the user's own) and the start screen.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_START_SCREEN,
  FISHBONE_LAYOUTS,
  LINE_PATTERNS,
  LINES,
  MAX_CUSTOM_THEMES,
  MINDMAP_LAYOUTS,
  SHAPES,
  customThemeFrom,
  effectiveSpeed,
  type GeneralSettings,
  type StartSettings,
} from '../settings'
import { THEME_COLOR_KEYS, THEMES, themeById, type CustomTheme, type ThemeMode } from '../themes'
import type { DiagramMode, LayoutDirection, Locale } from '../types'
import { ColorField, IconSelect, Toggle } from './controls'
import { ConfirmDialog, Dialog } from './dialogs'
import { Icon } from './Icons'
import { BackgroundGrid, StartRanges } from './StartScreen'

function ThemeRow({ id, swatch, label, selected, onPick }: { id: string; swatch: string[]; label: string; selected: boolean; onPick: (id: string) => void }) {
  return (
    <button type="button" data-pref-theme={id} className={selected ? 'theme-row selected' : 'theme-row'} aria-pressed={selected} title={label} onClick={() => onPick(id)}>
      <span className="swatches">{swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
      <span className="menu-label">{label}</span>
    </button>
  )
}

function ThemeEditor({ theme, onChange, onDelete }: { theme: CustomTheme; onChange: (patch: Partial<CustomTheme>) => void; onDelete: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="theme-editor" data-theme-editor={theme.id}>
      <div className="form-grid">
        <span>{t('theme.name')}</span>
        <input className="text-input" data-field="themeName" value={theme.name} onChange={(event) => onChange({ name: event.target.value })} />
        <span>{t('theme.mode')}</span>
        <IconSelect<ThemeMode> id="themeMode" value={theme.mode} options={[{ value: 'light', label: t('theme.light'), icon: 'sun' }, { value: 'dark', label: t('theme.dark'), icon: 'moon' }]} onChange={(mode) => onChange({ mode })} />
        <div className="theme-colors">
          {THEME_COLOR_KEYS.map((key) => (
            <div className="theme-color-row" key={key}>
              <span title={t(`themeColor.${key}`)}>{t(`themeColor.${key}`)}</span>
              <ColorField id={`themeColor-${key}`} value={theme.colors[key]} onChange={(color) => onChange({ colors: { ...theme.colors, [key]: color } })} />
            </div>
          ))}
        </div>
      </div>
      <button type="button" data-command="theme-delete" onClick={onDelete}><Icon name="delete" /> {t('theme.delete')}</button>
    </div>
  )
}

type Props = {
  initialTab?: string
  general: GeneralSettings
  onGeneral: (patch: Partial<GeneralSettings>) => void
  showGrid: boolean
  onToggleGrid: () => void
  recentCount: number
  onClearRecent: () => void
  language: Locale
  onLanguage: (language: Locale) => void
  themeId: string
  onTheme: (id: string) => void
  customThemes: CustomTheme[]
  onCustomThemes: (list: CustomTheme[], selected: string) => void
  start: StartSettings
  onStart: (patch: Partial<StartSettings>) => void
  onClose: () => void
}

export function PreferencesDialog({ initialTab, general, onGeneral, showGrid, onToggleGrid, recentCount, onClearRecent, language, onLanguage, themeId, onTheme, customThemes, onCustomThemes, start, onStart, onClose }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState(initialTab ?? 'general')
  const [asking, setAsking] = useState(false)
  const label = (item: { nameKo: string; nameEn: string }) => (language === 'en' ? item.nameEn : item.nameKo)
  const editing = customThemes.find((item) => item.id === themeId)

  const addTheme = () => {
    const item = customThemeFrom(themeId, `${t('theme.custom')} ${customThemes.length + 1}`, customThemes)
    onCustomThemes([...customThemes, item], item.id)
  }

  const editTheme = (patch: Partial<CustomTheme>) => {
    if (editing) onCustomThemes(customThemes.map((item) => (item.id === editing.id ? { ...item, ...patch } : item)), editing.id)
  }

  const deleteTheme = () => {
    setAsking(false)
    if (!editing) return
    const base = themeById(editing.mode === 'dark' ? 'dark-midnight' : 'light-classic')
    onCustomThemes(customThemes.filter((item) => item.id !== editing.id), base.id)
  }

  const tabs = [
    { id: 'general', icon: 'settings', label: t('pref.general') },
    { id: 'theme', icon: 'theme', label: t('toolbar.theme') },
    { id: 'start', icon: 'home', label: t('start.title') },
  ]

  const layouts = (list: LayoutDirection[]) => list.map((value) => ({ value, label: t(`layout.${value}`), icon: 'layout' }))

  return (
    <Dialog id="preferences" title={t('toolbar.settings')} icon="settings" onClose={onClose} width={960} footer={<button type="button" className="primary" data-command="preferences-close" onClick={onClose}><Icon name="close" size={14} /> {t('about.close')}</button>}>
      <div className="pref-layout">
        <nav className="pref-tabs">
          {tabs.map((item) => (
            <button type="button" key={item.id} data-pref-tab={item.id} className={tab === item.id ? 'active' : undefined} onClick={() => setTab(item.id)}><Icon name={item.icon} /> {item.label}</button>
          ))}
        </nav>
        <div className="pref-page" data-pref-page={tab}>
          {tab === 'general' && (
            <div className="pref-general">
              <section>
                <h4><Icon name="language" size={14} /> {t('pref.startup')}</h4>
                <div className="form-grid">
                  <span>{t('toolbar.language')}</span>
                  <IconSelect<Locale> id="prefLanguage" value={language} options={[{ value: 'ko', label: '한국어', icon: 'language' }, { value: 'en', label: 'English', icon: 'language' }]} onChange={onLanguage} />
                  <span>{t('start.showOnStartup')}</span>
                  <Toggle id="prefShowStart" checked={start.showOnStartup} onChange={(showOnStartup) => onStart({ showOnStartup })} />
                  <span>{t('pref.reopenLast')}</span>
                  <Toggle id="prefReopen" checked={general.reopenLast} onChange={(reopenLast) => onGeneral({ reopenLast })} />
                </div>
              </section>
              <section>
                <h4><Icon name="new" size={14} /> {t('pref.newDiagram')}</h4>
                <div className="form-grid">
                  <span>{t('status.mode')}</span>
                  <IconSelect<DiagramMode> id="prefNewMode" value={general.newMode} options={[{ value: 'mindmap', label: t('toolbar.mindmap'), icon: 'mind' }, { value: 'fishbone', label: t('toolbar.fishbone'), icon: 'fish' }]} onChange={(newMode) => onGeneral({ newMode })} />
                  <span>{t('pref.mindmapLayout')}</span>
                  <IconSelect id="prefMindmapLayout" value={general.mindmapLayout} options={layouts(MINDMAP_LAYOUTS)} onChange={(mindmapLayout) => onGeneral({ mindmapLayout })} />
                  <span>{t('pref.fishboneLayout')}</span>
                  <IconSelect id="prefFishboneLayout" value={general.fishboneLayout} options={layouts(FISHBONE_LAYOUTS)} onChange={(fishboneLayout) => onGeneral({ fishboneLayout })} />
                  <span>{t('toolbar.shape')}</span>
                  <IconSelect id="prefNewShape" value={general.newShape} options={SHAPES.map((value) => ({ value, label: t(`shape.${value}`), icon: 'shape' }))} onChange={(newShape) => onGeneral({ newShape })} />
                  <span>{t('panel.lineShape')}</span>
                  <IconSelect id="prefNewLine" value={general.newLine} options={LINES.map((value) => ({ value, label: t(`line.${value}`), icon: 'line' }))} onChange={(newLine) => onGeneral({ newLine })} />
                  <span>{t('panel.linePattern')}</span>
                  <IconSelect id="prefNewPattern" value={general.newLinePattern} options={LINE_PATTERNS.map((value) => ({ value, label: t(`linePattern.${value}`), icon: 'line' }))} onChange={(newLinePattern) => onGeneral({ newLinePattern })} />
                </div>
              </section>
              <section>
                <h4><Icon name="design" size={14} /> {t('pref.editor')}</h4>
                <div className="form-grid">
                  <span>{t('toolbar.grid')}</span>
                  <Toggle id="prefGrid" checked={showGrid} onChange={onToggleGrid} />
                </div>
              </section>
              <section>
                <h4><Icon name="clock" size={14} /> {t('start.recent')}</h4>
                <div className="pref-row">
                  <span>{t('pref.recentCount', { count: recentCount })}</span>
                  <button type="button" data-command="pref-clear-recent" disabled={recentCount === 0} onClick={onClearRecent}><Icon name="delete" /> {t('start.clearRecent')}</button>
                </div>
              </section>
            </div>
          )}
          {tab === 'theme' && (
            <div className="pref-themes">
              <div className="theme-columns">
                {(['light', 'dark'] as const).map((mode) => (
                  <section key={mode} data-theme-group={mode}>
                    <h4>{t(`theme.${mode}`)}</h4>
                    {THEMES.filter((item) => item.mode === mode).map((item) => (
                      <ThemeRow key={item.id} id={item.id} swatch={item.swatch} label={label(item)} selected={item.id === themeId} onPick={onTheme} />
                    ))}
                  </section>
                ))}
              </div>
              <section className="my-themes" data-theme-group="custom">
                <h4>{t('theme.mine')}</h4>
                <div className="my-themes-list">
                  {customThemes.map((item) => (
                    <ThemeRow key={item.id} id={item.id} swatch={[item.colors.bg, item.colors.panel, item.colors.accent]} label={item.name} selected={item.id === themeId} onPick={onTheme} />
                  ))}
                </div>
                <button type="button" data-command="theme-add" disabled={customThemes.length >= MAX_CUSTOM_THEMES} onClick={addTheme}><Icon name="add" /> {t('theme.add')}</button>
                {editing ? <ThemeEditor theme={editing} onChange={editTheme} onDelete={() => setAsking(true)} /> : <p className="dialog-note">{t('theme.hint')}</p>}
              </section>
            </div>
          )}
          {tab === 'start' && (
            <>
              <div className="form-grid">
                <span>{t('start.showOnStartup')}</span>
                <Toggle id="prefStartShow" checked={start.showOnStartup} onChange={(showOnStartup) => onStart({ showOnStartup })} />
              </div>
              <StartRanges start={start} speed={effectiveSpeed(start.speed, !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)} onChange={onStart} />
              <div className="pref-row pref-reset">
                <button type="button" data-command="start-layout-reset" disabled={!start.layout} onClick={() => onStart({ layout: null })}><Icon name="gridIcon" /> {t('start.arrange')}</button>
                <button type="button" data-command="start-reset" onClick={() => onStart({ ...DEFAULT_START_SCREEN })}><Icon name="undo" /> {t('start.reset')}</button>
              </div>
              <h4>{t('start.background')}</h4>
              <BackgroundGrid value={start.background} themeId={themeId} onChange={(background) => onStart({ background })} shuffle={{ on: start.shuffle, onToggle: () => onStart({ shuffle: !start.shuffle }) }} />
            </>
          )}
        </div>
      </div>
      {asking && <ConfirmDialog message={t('theme.deleteAsk', { name: editing?.name ?? '' })} yesLabel={t('theme.delete')} onYes={deleteTheme} onNo={() => setAsking(false)} />}
    </Dialog>
  )
}
