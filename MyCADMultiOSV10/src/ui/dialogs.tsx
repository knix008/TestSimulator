import { useMemo, useState, type ReactNode } from 'react'
import { AUTHOR, buildInfo, POPUP_SIZE } from '../core/buildInfo'
import type { MessageKey } from '../core/i18n'
import { THEMES, THEME_TOKENS, createCustomTheme, themesByMode, type ThemeMode } from '../core/themes'
import { ThemeSwatch } from './ToolbarControls'
import { commandHelp, lightKindKey } from '../core/labels'
import { menuIcon, translate } from '../core/i18n'
import { pageSizeMm, pageToSvg, type PrintPage, type PrintScope, type PageSetup } from '../core/print'
import { EXPORT_FORMATS, exportFileName, type ExportFormat } from '../core/exporters'
import { LIGHT_KINDS, type Settings, type ThemeId, type FontStyleName, type Lang, type LightKind } from '../core/settings'
import { NAVIGATION_STYLES, type NavigationStyle } from '../core/viewnav'
import { UNIT_SCHEMAS, type UnitSchema } from '../core/units'
import { DRAW_STYLES, type ShadeMode } from '../core/model'
import { USAGE } from '../core/usage'
import { WORKBENCHES } from '../core/workbenches'
import type { CadDocument } from '../core/model'

/** Numeric field with decrement and increment buttons on either side. */
export function NumberField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange
}: {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  const clamp = (next: number) => {
    const rounded = Math.round(next / step) * step
    const withMin = min === undefined ? rounded : Math.max(min, rounded)
    return max === undefined ? withMin : Math.min(max, withMin)
  }
  return (
    <span className="number-field">
      <button type="button" data-testid={`${id}-dec`} title={`${label} −`} onClick={() => onChange(clamp(value - step))}>−</button>
      <input
        type="number"
        data-testid={id}
        aria-label={label}
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      {suffix ? <span className="number-suffix">{suffix}</span> : null}
      <button type="button" data-testid={`${id}-inc`} title={`${label} +`} onClick={() => onChange(clamp(value + step))}>+</button>
    </span>
  )
}

export function PopupFrame({
  kind,
  title,
  icon,
  children,
  onClose
}: {
  kind: keyof typeof POPUP_SIZE
  title: string
  icon: string
  children: ReactNode
  onClose: () => void
}) {
  const size = POPUP_SIZE[kind]
  return (
    <div className="popup-backdrop" data-testid={`popup-${kind}`}>
      <section
        className="popup"
        role="dialog"
        aria-label={title}
        data-fixed="true"
        style={{ width: size.width, height: size.height }}
      >
        <header className="popup-title" data-testid="popup-title">
          <span className="popup-heading">
            <span className="menu-icon" data-testid="popup-icon">{icon}</span>
            <strong>{title}</strong>
          </span>
          <button type="button" className="ghost" onClick={onClose} title="×">×</button>
        </header>
        <div className="popup-body">{children}</div>
      </section>
    </div>
  )
}

export function AboutDialog({
  onClose,
  platform,
  t,
  language
}: {
  onClose: () => void
  platform: string
  t?: (key: MessageKey | string) => string
  language?: Lang
}) {
  const info = buildInfo(platform)
  const label = t ?? ((key: MessageKey | string) => String(key))
  const lang = language ?? 'ko'
  const tagline = lang === 'ko'
    ? '웹·Windows·macOS·Linux용 3D CAD'
    : '3D CAD for web, Windows, macOS and Linux'
  const rows: Array<{ key: string; label: string; value: string; testid: string }> = [
    { key: 'version', label: label('version'), value: info.version, testid: 'about-version' },
    { key: 'build', label: label('buildDate'), value: info.buildDate, testid: 'about-build' },
    { key: 'platform', label: label('platform'), value: info.platform, testid: 'about-platform' },
    { key: 'author', label: label('author'), value: AUTHOR, testid: 'about-author' }
  ]
  return (
    <PopupFrame kind="about" title={`${info.name} ${info.version}`} icon={menuIcon('about')} onClose={onClose}>
      <div className="about-head">
        <img className="about-icon" src="favicon.png" alt={info.name} width={72} height={72} data-testid="about-icon" />
        <div className="about-title">
          <strong data-testid="about-name">{info.name}</strong>
          <span className="muted" data-testid="about-tagline">{tagline}</span>
        </div>
      </div>
      <dl className="about-grid" data-testid="about-grid">
        {rows.map((row) => (
          <div className="about-row" key={row.key}>
            <dt>{row.label}</dt>
            <dd data-testid={row.testid}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="about-note muted" data-testid="about-note">
        {lang === 'ko'
          ? 'FreeCAD · CATIA · SketchUp 의 작업 방식을 참고한 독립 구현입니다.'
          : 'An independent implementation inspired by FreeCAD, CATIA and SketchUp.'}
      </p>
      <div className="row popup-actions">
        <button type="button" data-testid="about-close" title={label('close')} onClick={onClose}>{label('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function ErrorDialog({
  message,
  detail,
  label,
  copyLabel,
  closeLabel,
  onClose
}: {
  message: string
  detail: string
  label: string
  copyLabel: string
  closeLabel: string
  onClose: () => void
}) {
  const full = `${message}\n${detail}`.trim()
  return (
    <PopupFrame kind="error" title={label} icon={menuIcon('error')} onClose={onClose}>
      <p className="row" data-testid="error-message">{message}</p>
      <p className="row" data-testid="error-detail">{detail}</p>
      <div className="row popup-actions">
        <button
          type="button"
          data-testid="copy-error"
          title={copyLabel}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(full)
            } catch {
              const area = document.createElement('textarea')
              area.value = full
              document.body.appendChild(area)
              area.select()
              document.execCommand('copy')
              area.remove()
            }
            const node = document.querySelector('[data-testid="copied-error"]')
            if (node) node.textContent = full
          }}
        >{copyLabel}</button>
        <button type="button" onClick={onClose} title={closeLabel}>{closeLabel}</button>
        <span className="sr" data-testid="copied-error" />
      </div>
    </PopupFrame>
  )
}

export function ProgressDialog({ title, message, percent }: { title: string; message: string; percent: number }) {
  return (
    <PopupFrame kind="progress" title={title} icon={menuIcon('progress')} onClose={() => undefined}>
      <p className="row" data-testid="progress-message">{message}</p>
      <div className="row" data-testid="progress-percent">{Math.round(percent)}%</div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
    </PopupFrame>
  )
}

export function ConfirmDialog({
  message,
  saveLabel,
  discardLabel,
  cancelLabel,
  onSave,
  onDiscard,
  onCancel
}: {
  message: string
  saveLabel: string
  discardLabel: string
  cancelLabel: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}) {
  return (
    <PopupFrame kind="confirm" title={saveLabel} icon={menuIcon('confirm')} onClose={onCancel}>
      <p className="row" data-testid="confirm-message">{message}</p>
      <div className="row popup-actions">
        <button type="button" data-testid="confirm-save" title={saveLabel} onClick={onSave}>{saveLabel}</button>
        <button type="button" data-testid="confirm-discard" title={discardLabel} onClick={onDiscard}>{discardLabel}</button>
        <button type="button" data-testid="confirm-cancel" title={cancelLabel} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </PopupFrame>
  )
}

export function PrintDialog({
  t,
  docs,
  scope,
  customIds,
  selectedOnly,
  setup,
  pages,
  pageIndex,
  onScope,
  onToggleDoc,
  onSelectedOnly,
  onSetup,
  onPage,
  onPrint,
  onClose
}: {
  t: (key: MessageKey | string) => string
  docs: CadDocument[]
  scope: PrintScope
  customIds: string[]
  selectedOnly: boolean
  setup: PageSetup
  pages: PrintPage[]
  pageIndex: number
  onScope: (scope: PrintScope) => void
  onToggleDoc: (id: string) => void
  onSelectedOnly: (value: boolean) => void
  onSetup: (setup: PageSetup) => void
  onPage: (index: number) => void
  onPrint: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'pages' | 'layout' | 'texts'>('pages')
  const page = pages[pageIndex]
  const svg = useMemo(
    () => (page ? pageToSvg(page, setup, pageIndex, pages.length, new Date()) : ''),
    [page, setup, pageIndex, pages.length]
  )
  const sheet = pageSizeMm(setup)
  const patch = (values: Partial<PageSetup>) => onSetup({ ...setup, ...values })
  return (
    <PopupFrame kind="print" title={t('preview')} icon={menuIcon('print')} onClose={onClose}>
      <div className="print-layout">
        <div className="print-options">
          <div className="row wide tabs" data-testid="print-tabs">
            {(['pages', 'layout', 'texts'] as const).map((id) => (
              <button type="button" key={id} data-testid={`print-tab-${id}`} className={tab === id ? 'on' : ''} title={t(`print_${id}`)} onClick={() => setTab(id)}>
                {t(`print_${id}`)}
              </button>
            ))}
          </div>

          {tab === 'pages' ? (
            <>
              <div className="row wide" data-testid="print-scope">
                <span className="field-label">{t('printScope')}</span>
                <div className="choice-group">
                  <label className="row-item"><input type="radio" name="scope" checked={scope === 'all'} onChange={() => onScope('all')} />{t('scopeAll')}</label>
                  <label className="row-item"><input type="radio" name="scope" checked={scope === 'current'} onChange={() => onScope('current')} />{t('scopeCurrent')}</label>
                  <label className="row-item"><input type="radio" name="scope" checked={scope === 'custom'} onChange={() => onScope('custom')} />{t('scopeCustom')}</label>
                </div>
              </div>
              {scope === 'custom' ? (
                <div className="row wide doc-list">
                  {docs.map((doc) => (
                    <label className="check-line" key={doc.id}>
                      <input type="checkbox" checked={customIds.includes(doc.id)} onChange={() => onToggleDoc(doc.id)} />
                      <span className="ellipsis">{doc.name}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              <label className="row"><span>{t('selectedOnly')}</span>
                <input aria-label={t('selectedOnly')} type="checkbox" checked={selectedOnly} onChange={(event) => onSelectedOnly(event.target.checked)} />
              </label>
              <label className="row"><span>{t('copies')}</span>
                <input aria-label={t('copies')} data-testid="print-copies" type="number" min={1} max={99} value={setup.copies}
                  onChange={(event) => patch({ copies: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })} />
              </label>
            </>
          ) : null}

          {tab === 'layout' ? (
            <div data-testid="page-setup">
              <label className="row"><span>{t('paper')}</span>
                <select aria-label={t('paper')} value={setup.paper} onChange={(event) => patch({ paper: event.target.value as PageSetup['paper'] })}>
                  {(['A3', 'A4', 'A5', 'Letter', 'Legal'] as const).map((paper) => <option key={paper} value={paper}>{paper}</option>)}
                </select>
              </label>
              <label className="row"><span>{t('orientation')}</span>
                <select aria-label={t('orientation')} value={setup.orientation} onChange={(event) => patch({ orientation: event.target.value as PageSetup['orientation'] })}>
                  <option value="portrait">{t('portrait')}</option>
                  <option value="landscape">{t('landscape')}</option>
                </select>
              </label>
              <label className="row"><span>{t('margin')}</span>
                <input aria-label={t('margin')} type="number" min={0} max={40} value={setup.marginMm} onChange={(event) => patch({ marginMm: Number(event.target.value) })} />
              </label>
              <label className="row"><span>{t('printView')}</span>
                <select aria-label={t('printView')} data-testid="print-view" value={setup.view} onChange={(event) => patch({ view: event.target.value as PageSetup['view'] })}>
                  {(['iso', 'front', 'top', 'right', 'left', 'back', 'bottom'] as const).map((view) => <option key={view} value={view}>{t(view)}</option>)}
                </select>
              </label>
              <label className="row"><span>{t('fitToPage')}</span>
                <input aria-label={t('fitToPage')} data-testid="print-fit" type="checkbox" checked={setup.fitToPage} onChange={(event) => patch({ fitToPage: event.target.checked })} />
              </label>
              <label className="row"><span>{t('printScale')}</span>
                <input aria-label={t('printScale')} data-testid="print-scale" type="number" min={5} max={1000} disabled={setup.fitToPage} value={setup.scalePercent}
                  onChange={(event) => patch({ scalePercent: Number(event.target.value) })} />
              </label>
              <label className="row"><span>{t('showBorder')}</span>
                <input aria-label={t('showBorder')} type="checkbox" checked={setup.showBorder} onChange={(event) => patch({ showBorder: event.target.checked })} />
              </label>
              <p className="row wide muted" data-testid="print-sheet-size">{sheet.width} × {sheet.height} mm</p>
            </div>
          ) : null}

          {tab === 'texts' ? (
            <>
              <label className="row"><span>{t('printTitle')}</span>
                <input aria-label={t('printTitle')} data-testid="print-title" type="text" value={setup.title} placeholder={page ? page.title : ''}
                  onChange={(event) => patch({ title: event.target.value })} />
              </label>
              <label className="row"><span>{t('showTitle')}</span>
                <input aria-label={t('showTitle')} type="checkbox" checked={setup.showTitle} onChange={(event) => patch({ showTitle: event.target.checked })} />
              </label>
              <label className="row"><span>{t('header')}</span>
                <input aria-label={t('header')} data-testid="print-header" type="text" value={setup.header} onChange={(event) => patch({ header: event.target.value })} />
              </label>
              <label className="row"><span>{t('footer')}</span>
                <input aria-label={t('footer')} data-testid="print-footer" type="text" value={setup.footer} onChange={(event) => patch({ footer: event.target.value })} />
              </label>
              <label className="row"><span>{t('pageNumbers')}</span>
                <input aria-label={t('pageNumbers')} data-testid="print-page-numbers" type="checkbox" checked={setup.showPageNumbers} onChange={(event) => patch({ showPageNumbers: event.target.checked })} />
              </label>
              <label className="row"><span>{t('printDate')}</span>
                <input aria-label={t('printDate')} type="checkbox" checked={setup.showDate} onChange={(event) => patch({ showDate: event.target.checked })} />
              </label>
            </>
          ) : null}
        </div>

        <div className="print-preview-pane">
          <div className="preview-stage">
            <div
              className="preview-page"
              data-testid="print-preview"
              data-page-title={page ? page.title : ''}
              data-object-count={page ? page.objectCount : 0}
              style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
          <div className="preview-nav">
            <button type="button" data-testid="print-prev" title={t('prevPage')} onClick={() => onPage(Math.max(0, pageIndex - 1))}>{'‹'}</button>
            <span data-testid="print-page-label">{pages.length === 0 ? '0 / 0' : `${pageIndex + 1} / ${pages.length}`}</span>
            <button type="button" data-testid="print-next" title={t('nextPage')} onClick={() => onPage(Math.min(pages.length - 1, pageIndex + 1))}>{'›'}</button>
            <span className="muted ellipsis">{page ? page.title : ''} · {page ? page.objectCount : 0} {t('objects')}</span>
          </div>
        </div>
      </div>

      <div className="row popup-actions">
        <button type="button" data-testid="print-now" className="primary" title={t('printNow')} onClick={onPrint}>{t('printNow')}</button>
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function SettingsDialog({
  settings,
  fonts,
  t,
  onChange,
  onRemoveRecent,
  onClearRecent,
  onPickBackground,
  onClose,
  shade = 'shaded',
  onShade
}: {
  settings: Settings
  fonts: string[]
  t: (key: MessageKey | string) => string
  onChange: (patch: Partial<Settings>) => void
  onRemoveRecent: (path: string) => void
  onClearRecent: () => void
  onPickBackground: (file: File) => void
  onClose: () => void
  /** draw style of the open document, which lives on the document, not here */
  shade?: ShadeMode
  onShade?: (shade: ShadeMode) => void
}) {
  const tabs = ['general', 'theme', 'font', 'viewport', 'printTab', 'appearance', 'recent'] as const
  const [active, setActive] = useState<(typeof tabs)[number]>('general')
  const [mode, setMode] = useState<ThemeMode | 'custom'>(settings.theme === 'custom' ? 'custom' : (THEMES.find((theme) => theme.id === settings.theme)?.mode ?? 'dark'))
  const printSetup = settings.print
  const patchPrint = (values: Partial<Settings['print']>) => onChange({ print: { ...printSetup, ...values } })
  const custom = settings.customTheme
  const patchCustom = (values: Partial<Settings['customTheme']['colors']>) =>
    onChange({ customTheme: { ...custom, colors: { ...custom.colors, ...values } } })

  return (
    <PopupFrame kind="settings" title={t('settings')} icon={menuIcon('settings')} onClose={onClose}>
      <div className="settings-layout">
        <nav className="settings-tabs" data-testid="settings-tabs">
          {tabs.map((id) => (
            <button type="button" key={id} data-testid={`settings-tab-${id}`} className={active === id ? 'on' : ''} title={t(id)} onClick={() => setActive(id)}>
              <span className="menu-icon">{menuIcon(id)}</span>
              <span className="ellipsis">{t(id)}</span>
            </button>
          ))}
        </nav>

        <div className="settings-panel" data-testid="settings-panel">
          {active === 'general' ? (
            <>
              <fieldset className="field-group">
                <legend>{t('language')}</legend>
                <label className="row"><span>{t('language')}</span>
                  <select aria-label={t('language')} data-testid="language" value={settings.language} onChange={(event) => onChange({ language: event.target.value as Lang })}>
                    <option value="ko">{t('korean')}</option>
                    <option value="en">{t('english')}</option>
                  </select>
                </label>
              </fieldset>
              <fieldset className="field-group">
                <legend>{t('theme')}</legend>
                <label className="row"><span>{t('theme')}</span>
                  <select aria-label={t('theme')} data-testid="theme" value={settings.theme} onChange={(event) => onChange({ theme: event.target.value as ThemeId })}>
                    {THEMES.map((theme) => (
                      <option key={theme.id} value={theme.id}>{`${t(theme.mode)} · ${theme.name[settings.language]}`}</option>
                    ))}
                    <option value="custom">{`${t(custom.mode)} · ${custom.name[settings.language]}`}</option>
                  </select>
                </label>
              </fieldset>
              <fieldset className="field-group">
                <legend>{t('snap')}</legend>
                <label className="row"><span>{t('snap')}</span>
                  <NumberField id="snap" label={t('snap')} value={settings.snap} min={0} max={100} step={1} suffix="mm" onChange={(value) => onChange({ snap: value })} />
                </label>
              </fieldset>
            </>
          ) : null}

          {active === 'theme' ? (
            <>
              <fieldset className="field-group">
                <legend>{t('theme')}</legend>
                <div className="row tabs" data-testid="theme-modes">
                  {(['dark', 'light', 'custom'] as const).map((id) => (
                    <button type="button" key={id} data-testid={`theme-mode-${id}`} className={mode === id ? 'on' : ''} title={id === 'custom' ? t('customTheme') : t(id)} onClick={() => setMode(id)}>
                      {id === 'custom' ? t('customTheme') : `${t(id)} (${themesByMode(id as ThemeMode).length})`}
                    </button>
                  ))}
                </div>
                {mode === 'custom' ? (
                  <div className="row">
                    <span>{t('theme')}</span>
                    <select aria-label={t('customTheme')} data-testid="custom-mode" value={custom.mode} onChange={(event) => onChange({ customTheme: { ...custom, mode: event.target.value as ThemeMode } })}>
                      <option value="dark">{t('dark')}</option>
                      <option value="light">{t('light')}</option>
                    </select>
                    <span className="row-item">
                      <button type="button" data-testid="custom-apply" className="primary" title={t('apply')} onClick={() => onChange({ theme: 'custom' })}>{t('apply')}</button>
                      <button type="button" data-testid="custom-reset" title={t('remove')} onClick={() => onChange({ customTheme: createCustomTheme(THEMES.find((theme) => theme.id === settings.theme) ?? THEMES[0]) })}>{t('remove')}</button>
                    </span>
                  </div>
                ) : (
                  <div className="theme-grid" data-testid="theme-grid">
                    {themesByMode(mode as ThemeMode).map((theme) => (
                      <button
                        type="button"
                        key={theme.id}
                        data-testid={`theme-${theme.id}`}
                        className={settings.theme === theme.id ? 'theme-swatch on' : 'theme-swatch'}
                        title={theme.name[settings.language]}
                        onClick={() => onChange({ theme: theme.id })}
                      >
                        <ThemeSwatch theme={theme} size={18} />
                        <span className="ellipsis">{theme.name[settings.language]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>
              {mode === 'custom' ? (
                <fieldset className="field-group">
                  <legend>{t('color')}</legend>
                  <div className="color-grid" data-testid="custom-colors">
                    {THEME_TOKENS.map((token) => (
                      <label className="color-row" key={token.key}>
                        <input
                          type="color"
                          data-testid={`custom-${token.key}`}
                          aria-label={settings.language === 'ko' ? token.ko : token.en}
                          value={custom.colors[token.key]}
                          onChange={(event) => patchCustom({ [token.key]: event.target.value } as Partial<Settings['customTheme']['colors']>)}
                        />
                        <span className="ellipsis">{settings.language === 'ko' ? token.ko : token.en}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </>
          ) : null}

          {active === 'font' ? (
            <fieldset className="field-group">
              <legend>{t('font')}</legend>
              <label className="row"><span>{t('font')}</span>
                <select aria-label={t('font')} data-testid="font-family" value={settings.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
                  {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
                </select>
              </label>
              <label className="row"><span>{t('fontSize')}</span>
                <NumberField id="font-size" label={t('fontSize')} value={settings.fontSize} min={8} max={72} step={1} suffix="px" onChange={(value) => onChange({ fontSize: value })} />
              </label>
              <label className="row"><span>{t('fontStyle')}</span>
                <select aria-label={t('fontStyle')} data-testid="font-style" value={settings.fontStyle} onChange={(event) => onChange({ fontStyle: event.target.value as FontStyleName })}>
                  <option value="normal">{t('normal')}</option>
                  <option value="italic">{t('italic')}</option>
                  <option value="bold">{t('bold')}</option>
                  <option value="bold-italic">{t('boldItalic')}</option>
                </select>
              </label>
            </fieldset>
          ) : null}

          {active === 'viewport' ? (
            <>
              <fieldset className="field-group">
                <legend>{t('viewport')}</legend>
                <label className="row"><span>{t('grid')}</span>
                  <input aria-label={t('grid')} type="checkbox" checked={settings.grid} onChange={() => onChange({ grid: !settings.grid })} />
                </label>
                <label className="row"><span>{t('ruler')}</span>
                  <input aria-label={t('ruler')} data-testid="ruler-toggle" type="checkbox" checked={settings.ruler} onChange={() => onChange({ ruler: !settings.ruler })} />
                </label>
                <label className="row"><span>{t('showAxes')}</span>
                  <input aria-label={t('showAxes')} data-testid="show-axes" type="checkbox" checked={settings.showAxes} onChange={() => onChange({ showAxes: !settings.showAxes })} />
                </label>
                <label className="row"><span>{t('autoScaleAxes')}</span>
                  <input aria-label={t('autoScaleAxes')} data-testid="auto-scale-axes" type="checkbox" checked={settings.autoScaleAxes} onChange={() => onChange({ autoScaleAxes: !settings.autoScaleAxes })} />
                </label>
                <label className="row"><span>{t('snap')}</span>
                  <NumberField id="snap-viewport" label={t('snap')} value={settings.snap} min={0} max={100} step={1} suffix="mm" onChange={(value) => onChange({ snap: value })} />
                </label>
              </fieldset>
              <fieldset className="field-group">
                <legend>{t('units')}</legend>
                <label className="row"><span>{t('units')}</span>
                  <select
                    aria-label={t('units')}
                    data-testid="unit-schema"
                    value={settings.units}
                    onChange={(event) => onChange({ units: event.target.value as UnitSchema })}
                  >
                    {UNIT_SCHEMAS.map((schema) => <option key={schema} value={schema}>{schema}</option>)}
                  </select>
                </label>
                <label className="row"><span>{t('navigation')}</span>
                  <select
                    aria-label={t('navigation')}
                    data-testid="navigation-style"
                    value={settings.navigation}
                    onChange={(event) => onChange({ navigation: event.target.value as NavigationStyle })}
                  >
                    {NAVIGATION_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
                  </select>
                </label>
                <label className="row"><span>{t('projection')}</span>
                  <select
                    aria-label={t('projection')}
                    data-testid="projection-mode"
                    value={settings.projection}
                    onChange={(event) => onChange({ projection: event.target.value as Settings['projection'] })}
                  >
                    <option value="perspective">{t('perspective')}</option>
                    <option value="orthographic">{t('orthographic')}</option>
                  </select>
                </label>
                <label className="row"><span>{t('drawStyle')}</span>
                  <select
                    aria-label={t('drawStyle')}
                    data-testid="draw-style"
                    value={shade}
                    onChange={(event) => onShade?.(event.target.value as ShadeMode)}
                  >
                    {DRAW_STYLES.map((style) => <option key={style} value={style}>{t(style)}</option>)}
                  </select>
                </label>
              </fieldset>
              <fieldset className="field-group">
                <legend>{t('clipping')}</legend>
                {settings.clip.map((plane, index) => (
                  <label className="row" key={plane.axis}><span>{plane.axis.toUpperCase()}</span>
                    <input
                      type="checkbox"
                      aria-label={`${t('clipping')} ${plane.axis}`}
                      data-testid={`clip-${plane.axis}`}
                      checked={plane.enabled}
                      onChange={() => {
                        const next = settings.clip.map((item, at) => (at === index ? { ...item, enabled: !item.enabled } : item))
                        onChange({ clip: next })
                      }}
                    />
                    <NumberField
                      id={`clip-${plane.axis}-offset`}
                      label={`${t('clipping')} ${plane.axis}`}
                      value={plane.offset}
                      min={-1000}
                      max={1000}
                      step={5}
                      suffix="mm"
                      onChange={(value) => {
                        const next = settings.clip.map((item, at) => (at === index ? { ...item, offset: value } : item))
                        onChange({ clip: next })
                      }}
                    />
                    <button
                      type="button"
                      data-testid={`clip-${plane.axis}-flip`}
                      title={t('mirror')}
                      onClick={() => {
                        const next = settings.clip.map((item, at) => (at === index ? { ...item, flip: !item.flip } : item))
                        onChange({ clip: next })
                      }}
                    >{plane.flip ? '◧' : '◨'}</button>
                  </label>
                ))}
              </fieldset>
              <fieldset className="field-group">
                <legend>{t('lightRig')}</legend>
                <label className="row"><span>{t('lightRig')}</span>
                  <input aria-label={t('lightRig')} data-testid="light-enabled" type="checkbox" checked={settings.light.enabled} onChange={() => onChange({ light: { ...settings.light, enabled: !settings.light.enabled } })} />
                </label>
                <label className="row"><span>{t('lightKind')}</span>
                  <select
                    aria-label={t('lightKind')}
                    data-testid="light-kind-select"
                    value={settings.light.kind}
                    onChange={(event) => onChange({ light: { ...settings.light, kind: event.target.value as LightKind } })}
                  >
                    {LIGHT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>{`${menuIcon(lightKindKey(kind))} ${t(lightKindKey(kind))}`}</option>
                    ))}
                  </select>
                </label>
                <label className="row"><span>{t('lightColor')}</span>
                  <input
                    type="color"
                    aria-label={t('lightColor')}
                    data-testid="light-color-input"
                    value={settings.light.color}
                    onChange={(event) => onChange({ light: { ...settings.light, color: event.target.value } })}
                  />
                </label>
                <label className="row"><span>{settings.language === 'ko' ? '방향' : 'Azimuth'}</span>
                  <NumberField id="light-azimuth-field" label="azimuth" value={settings.light.azimuth} min={-180} max={180} step={5} suffix="°" onChange={(value) => onChange({ light: { ...settings.light, azimuth: value } })} />
                </label>
                <label className="row"><span>{settings.language === 'ko' ? '높이' : 'Elevation'}</span>
                  <NumberField id="light-elevation-field" label="elevation" value={settings.light.elevation} min={-20} max={90} step={5} suffix="°" onChange={(value) => onChange({ light: { ...settings.light, elevation: value } })} />
                </label>
                <label className="row"><span>{settings.language === 'ko' ? '세기' : 'Intensity'}</span>
                  <NumberField id="light-intensity-field" label="intensity" value={settings.light.intensity} min={0} max={3} step={0.05} onChange={(value) => onChange({ light: { ...settings.light, intensity: value } })} />
                </label>
                <label className="row"><span>{settings.language === 'ko' ? '환경광' : 'Ambient'}</span>
                  <NumberField id="light-ambient-field" label="ambient" value={settings.light.ambient} min={0} max={2} step={0.05} onChange={(value) => onChange({ light: { ...settings.light, ambient: value } })} />
                </label>
              </fieldset>
            </>
          ) : null}

          {active === 'printTab' ? (
            <>
              <fieldset className="field-group">
                <legend>{t('pageSetup')}</legend>
                <label className="row"><span>{t('paper')}</span>
                  <select aria-label={t('paper')} data-testid="default-paper" value={printSetup.paper} onChange={(event) => patchPrint({ paper: event.target.value as Settings['print']['paper'] })}>
                    {(['A3', 'A4', 'A5', 'Letter', 'Legal'] as const).map((paper) => <option key={paper} value={paper}>{paper}</option>)}
                  </select>
                </label>
                <label className="row"><span>{t('orientation')}</span>
                  <select aria-label={t('orientation')} data-testid="default-orientation" value={printSetup.orientation} onChange={(event) => patchPrint({ orientation: event.target.value as Settings['print']['orientation'] })}>
                    <option value="portrait">{t('portrait')}</option>
                    <option value="landscape">{t('landscape')}</option>
                  </select>
                </label>
                <label className="row"><span>{t('margin')}</span>
                  <NumberField id="default-margin" label={t('margin')} value={printSetup.marginMm} min={0} max={40} step={1} suffix="mm" onChange={(value) => patchPrint({ marginMm: value })} />
                </label>
                <label className="row"><span>{t('copies')}</span>
                  <NumberField id="default-copies" label={t('copies')} value={printSetup.copies} min={1} max={99} step={1} onChange={(value) => patchPrint({ copies: value })} />
                </label>
              </fieldset>
              <fieldset className="field-group">
                <legend>{t('print_texts')}</legend>
                <label className="row"><span>{t('header')}</span>
                  <input aria-label={t('header')} data-testid="default-header" type="text" value={printSetup.header} onChange={(event) => patchPrint({ header: event.target.value })} />
                </label>
                <label className="row"><span>{t('footer')}</span>
                  <input aria-label={t('footer')} data-testid="default-footer" type="text" value={printSetup.footer} onChange={(event) => patchPrint({ footer: event.target.value })} />
                </label>
                <label className="row"><span>{t('pageNumbers')}</span>
                  <input aria-label={t('pageNumbers')} data-testid="default-page-numbers" type="checkbox" checked={printSetup.showPageNumbers} onChange={(event) => patchPrint({ showPageNumbers: event.target.checked })} />
                </label>
              </fieldset>
            </>
          ) : null}

          {active === 'appearance' ? (
            <fieldset className="field-group">
              <legend>{t('background')}</legend>
              <label className="row"><span>{t('background')}</span>
                <input aria-label={t('background')} data-testid="background-file" type="file" accept="image/*" onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onPickBackground(file)
                }} />
              </label>
              <label className="row"><span>{t('backgroundOpacity')}</span>
                <input aria-label={t('backgroundOpacity')} data-testid="background-opacity" type="range" min={0} max={100} value={settings.backgroundOpacity} onChange={(event) => onChange({ backgroundOpacity: Number(event.target.value) })} />
                <span className="muted">{settings.backgroundOpacity}%</span>
              </label>
              <div className="row">
                <button type="button" data-testid="clear-background" title={t('remove')} onClick={() => onChange({ backgroundImage: null })}>{t('remove')}</button>
              </div>
            </fieldset>
          ) : null}

          {active === 'recent' ? (
            <fieldset className="field-group">
              <legend>{t('recent')} ({settings.recentFiles.length}/10)</legend>
              <div className="row">
                <button type="button" data-testid="clear-recent" title={t('clearRecent')} onClick={onClearRecent}>{t('clearRecent')}</button>
              </div>
              <div className="recent-list">
                {settings.recentFiles.map((file) => (
                  <div className="row recent-row" key={file.path} data-testid="recent-row">
                    <span className="ellipsis" title={file.path}>{file.name}</span>
                    <button type="button" title={t('remove')} data-testid={`remove-recent-${file.path}`} onClick={() => onRemoveRecent(file.path)}>✕</button>
                  </div>
                ))}
                {settings.recentFiles.length === 0 ? <p className="row muted">{t('recent')} —</p> : null}
              </div>
            </fieldset>
          ) : null}
        </div>
      </div>

      <div className="row popup-actions">
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function PartDialog({
  title,
  op,
  t,
  language,
  onApply,
  onClose
}: {
  title: string
  op: string
  t: (key: MessageKey | string) => string
  language: Lang
  onApply: (values: { width: number; height: number; length: number; angle: number; count: number; spacing: number; radius: number; sides: number; diameter: number; plane: 'xy' | 'xz' | 'yz'; axis: 'x' | 'y' | 'z' }) => void
  onClose: () => void
}) {
  const [width, setWidth] = useState(40)
  const [height, setHeight] = useState(30)
  const [length, setLength] = useState(20)
  const [angle, setAngle] = useState(360)
  const [count, setCount] = useState(4)
  const [spacing, setSpacing] = useState(50)
  const [radius, setRadius] = useState(4)
  const [sides, setSides] = useState(6)
  const [diameter, setDiameter] = useState(8)
  const [plane, setPlane] = useState<'xy' | 'xz' | 'yz'>('xy')
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('x')
  const sketch = op.startsWith('sketch')
  const show = (id: string) => {
    if (sketch) return id === 'width' || id === 'height' || id === 'plane' || (op === 'sketchPolygon' && id === 'sides')
    if (op === 'pad' || op === 'pocket' || op === 'loft' || op === 'pipe') return id === 'length'
    if (op === 'helix') return id === 'radius' || id === 'length' || id === 'count'
    if (op === 'revolve' || op === 'shaft' || op === 'groove' || op === 'draft' || op === 'rotateBody') return id === 'angle'
    if (op === 'fillet' || op === 'chamfer' || op === 'shell') return id === 'radius'
    if (op === 'linearPattern' || op === 'rectPattern') return id === 'count' || id === 'spacing' || id === 'axis'
    if (op === 'polarPattern') return id === 'count' || id === 'spacing'
    if (op === 'hole' || op === 'counterbore' || op === 'countersink') return id === 'diameter' || id === 'length'
    if (op === 'mirror' || op === 'refPlane') return id === 'plane' || (op === 'refPlane' && id === 'length')
    if (op === 'translate' || op === 'offsetMate' || op === 'parameter') return id === 'length' || (op === 'translate' && id === 'axis')
    if (op === 'scaleBody') return id === 'length'
    return false
  }
  return (
    <PopupFrame kind="part" title={title} icon={menuIcon(op)} onClose={onClose}>
      <p className="row part-help" data-testid="part-op">{commandHelp(language, op) ?? t(op)}</p>
      {show('plane') ? <label className="row"><span>{t('planeLabel')}</span>
        <select aria-label={t('planeLabel')} data-testid="part-plane" value={plane} onChange={(event) => setPlane(event.target.value as 'xy' | 'xz' | 'yz')}>
          <option value="xy">XY</option><option value="xz">XZ</option><option value="yz">YZ</option>
        </select></label> : null}
      {show('width') ? <label className="row"><span>{t('width')}</span><input aria-label={t('width')} data-testid="part-width" type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label> : null}
      {show('height') ? <label className="row"><span>{t('height')}</span><input aria-label={t('height')} data-testid="part-height" type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label> : null}
      {show('sides') ? <label className="row"><span>{t('sides')}</span><input aria-label={t('sides')} data-testid="part-sides" type="number" value={sides} onChange={(event) => setSides(Number(event.target.value))} /></label> : null}
      {show('length') ? <label className="row"><span>{t('length')}</span><input aria-label={t('length')} data-testid="part-length" type="number" value={length} onChange={(event) => setLength(Number(event.target.value))} /></label> : null}
      {show('angle') ? <label className="row"><span>{t('angle')}</span><input aria-label={t('angle')} data-testid="part-angle" type="number" value={angle} onChange={(event) => setAngle(Number(event.target.value))} /></label> : null}
      {show('radius') ? <label className="row"><span>{t('radius')}</span><input aria-label={t('radius')} data-testid="part-radius" type="number" value={radius} onChange={(event) => setRadius(Number(event.target.value))} /></label> : null}
      {show('diameter') ? <label className="row"><span>{t('diameter')}</span><input aria-label={t('diameter')} data-testid="part-diameter" type="number" value={diameter} onChange={(event) => setDiameter(Number(event.target.value))} /></label> : null}
      {show('count') ? <label className="row"><span>{t('count')}</span><input aria-label={t('count')} data-testid="part-count" type="number" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label> : null}
      {show('spacing') ? <label className="row"><span>{t('spacing')}</span><input aria-label={t('spacing')} data-testid="part-spacing" type="number" value={spacing} onChange={(event) => setSpacing(Number(event.target.value))} /></label> : null}
      {show('axis') ? <label className="row"><span>{t('axis')}</span>
        <select aria-label={t('axis')} data-testid="part-axis" value={axis} onChange={(event) => setAxis(event.target.value as 'x' | 'y' | 'z')}>
          <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
        </select></label> : null}
      <div className="row popup-actions">
        <button type="button" data-testid="part-apply" title={t('apply')} onClick={() => onApply({ width, height, length, angle, count, spacing, radius, sides, diameter, plane, axis })}>{t('apply')}</button>
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function UsageDialog({ lang, t, onClose }: { lang: Lang; t: (key: MessageKey | string) => string; onClose: () => void }) {
  const [active, setActive] = useState(WORKBENCHES[0].id)
  const lines = USAGE[active]?.[lang] ?? USAGE[active]?.en ?? []
  return (
    <PopupFrame kind="usage" title={t('usage')} icon={menuIcon('usage')} onClose={onClose}>
      <label className="row" data-testid="usage-tabs">
        <span>{t('usage')}</span>
        <select aria-label={t('usage')} value={active} onChange={(event) => setActive(event.target.value)}>
          {WORKBENCHES.map((item) => <option key={item.id} value={item.id}>{t(item.labelKey)}</option>)}
        </select>
      </label>
      {lines.map((line) => <p className="row" key={line} data-testid="usage-line">{line}</p>)}
      <div className="row popup-actions">
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function tOf(lang: Lang) {
  return (key: MessageKey) => translate(lang, key)
}

/**
 * Read-only result popup used by the analysis, schedule, BOM and report
 * commands (FEM, CAM statistics, clash detection, spreadsheets, outliner…).
 */
export function ReportDialog({
  title,
  lines,
  copyLabel,
  closeLabel,
  onClose
}: {
  title: string
  lines: string[]
  copyLabel: string
  closeLabel: string
  onClose: () => void
}) {
  const full = lines.join('\n')
  return (
    <PopupFrame kind="report" title={title} icon={menuIcon('reportTitle')} onClose={onClose}>
      {lines.map((line, index) => (
        <p className="row report-line" key={`${index}-${line}`} data-testid="report-line">{line}</p>
      ))}
      <div className="row popup-actions">
        <button
          type="button"
          data-testid="copy-report"
          title={copyLabel}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(full)
            } catch {
              const area = document.createElement('textarea')
              area.value = full
              document.body.appendChild(area)
              area.select()
              document.body.removeChild(area)
            }
          }}
        >{copyLabel}</button>
        <button type="button" data-testid="close-report" title={closeLabel} onClick={onClose}>{closeLabel}</button>
      </div>
    </PopupFrame>
  )
}

/**
 * Export dialog: pick one of the supported formats, decide whether to include
 * only the selection, and save.
 */
export function ExportDialog({
  doc,
  t,
  language,
  selectionCount,
  onExport,
  onClose
}: {
  doc: CadDocument
  t: (key: MessageKey | string) => string
  language: Lang
  selectionCount: number
  onExport: (formatId: string, selectedOnly: boolean) => void
  onClose: () => void
}) {
  const [formatId, setFormatId] = useState(EXPORT_FORMATS[0].id)
  const [selectedOnly, setSelectedOnly] = useState(false)
  const format = EXPORT_FORMATS.find((item) => item.id === formatId) as ExportFormat
  return (
    <PopupFrame kind="export" title={t('export')} icon={menuIcon('export')} onClose={onClose}>
      <fieldset className="field-group">
        <legend>{t('exportFormat')}</legend>
        <div className="export-grid" data-testid="export-formats">
          {EXPORT_FORMATS.map((item) => (
            <label key={item.id} className={item.id === formatId ? 'export-option on' : 'export-option'}>
              <input
                type="radio"
                name="export-format"
                data-testid={`export-format-${item.id}`}
                checked={item.id === formatId}
                onChange={() => setFormatId(item.id)}
              />
              <span className="export-ext">.{item.ext}</span>
              <span className="ellipsis">{item.label[language]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field-group">
        <legend>{t('options')}</legend>
        <label className="row">
          <span>{t('selectedOnly')}</span>
          <input
            type="checkbox"
            data-testid="export-selected-only"
            aria-label={t('selectedOnly')}
            checked={selectedOnly}
            disabled={selectionCount === 0}
            onChange={(event) => setSelectedOnly(event.target.checked)}
          />
          <span className="muted">{selectionCount} {t('selection')}</span>
        </label>
        <p className="row muted" data-testid="export-scope">{format.scope[language]}</p>
        <p className="row" data-testid="export-filename">{exportFileName(doc, format)}</p>
      </fieldset>
      <div className="row popup-actions">
        <button type="button" className="primary" data-testid="export-run" title={t('export')} onClick={() => onExport(formatId, selectedOnly)}>{t('export')}</button>
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}
