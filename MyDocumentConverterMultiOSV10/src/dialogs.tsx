import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check as CheckIcon, ChevronLeft, ChevronRight, Copy, FileText, FolderOpen, Globe, Play, Plus, Trash, X } from 'lucide-react'
import buildInfo from './build-info.json'
import { Check, Field, GroupedSelect, NumberField, Select, Slider } from './controls'
import { dialogIcon, dialogTitle, type DialogName, type DialogPayload, type DialogResult } from './dialogMeta'
import { t, formatBytes } from './i18n'
import { copyText } from './lib/errors'
import { listFonts, isLikelyMonospace, loadBundledFont } from './lib/fonts'
import { defaultSettings, type AppSettings, type Language } from './lib/settings'
import { BACKGROUND_KEY, deleteBlob, putBlob } from './lib/store'
import { formats, formatForFile, formatName, getFormat, groupOrder, groupNames, groupedFormats, readableFormats, writableFormats, type FormatGroup, type FormatId } from './lib/doc/formats'
import { defaultWriterOptions, type PageSize, type WriterOptions } from './lib/doc/options'
import { convert, printableHtml, readDocument, writeDocument } from './lib/doc/convert'
import { openFiles, chooseDirectory, downloadFile, isDesktop, joinPath, stripExtension, writePath, bytesToBase64, type OpenedFile } from './lib/platform'
import { OptionsForm, optionSections, type OptionSection } from './optionsForm'
import { themes, themeLabel, applyTheme } from './themes'
import { commands, menuOrder } from './commands'

/* ----------------------------------------------------------------- frame */

export function DialogFrame({ name, language, payload, onClose, children }: { name: DialogName; language: Language; payload?: DialogPayload; onClose: () => void; children: ReactNode }) {
  return (
    <div className={`dialog ${name}-dialog`}>
      <header className="dialog-title-bar">
        {createElement(dialogIcon(name), { size: 16 })}
        <h2>{dialogTitle(name, language, payload)}</h2>
        <button className="dialog-close" data-tooltip={t(language, 'close')} aria-label={t(language, 'close')} onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <div className="dialog-content">{children}</div>
    </div>
  )
}

export function DialogBody({ name, payload, onResult, onClose, onThemeChange }: {
  name: DialogName
  payload: DialogPayload
  onResult: (result: DialogResult) => void
  onClose: () => void
  onThemeChange?: (theme: string) => void
}) {
  switch (name) {
    case 'settings': return <SettingsDialog payload={payload} onResult={onResult} onThemeChange={onThemeChange} />
    case 'about': return <AboutDialog payload={payload} onClose={onClose} />
    case 'error': return <ErrorDialog payload={payload} onClose={onClose} />
    case 'unsaved': return <UnsavedDialog payload={payload} onResult={onResult} />
    case 'progress': return <ProgressDialog payload={payload} onResult={onResult} />
    case 'print': return <PrintDialog payload={payload} onResult={onResult} onClose={onClose} />
    case 'openRecent': return <OpenRecentDialog payload={payload} onResult={onResult} onClose={onClose} />
    case 'openUrl': return <OpenUrlDialog payload={payload} onResult={onResult} onClose={onClose} />
    case 'shortcuts': return <ShortcutsDialog payload={payload} onClose={onClose} />
    case 'formats': return <FormatsDialog payload={payload} onClose={onClose} />
    case 'metadata': return <MetadataDialog payload={payload} onResult={onResult} onClose={onClose} />
    case 'stats': return <StatsDialog payload={payload} onClose={onClose} />
    case 'batch': return <BatchDialog payload={payload} onResult={onResult} onClose={onClose} />
    default: return null
  }
}

function Buttons({ children }: { children: ReactNode }) {
  return <div className="dialog-buttons">{children}</div>
}

/* -------------------------------------------------------------- settings */

type SettingsTab = 'general' | 'appearance' | 'fonts' | 'editor' | 'conversion' | 'output'

function SettingsDialog({ payload, onResult, onThemeChange }: { payload: DialogPayload; onResult: (result: DialogResult) => void; onThemeChange?: (theme: string) => void }) {
  const [settings, setSettings] = useState<AppSettings>(payload.settings ?? defaultSettings)
  const [tab, setTab] = useState<SettingsTab>('general')
  const [outputSection, setOutputSection] = useState<OptionSection>('general')
  const [fonts, setFonts] = useState<string[]>([])
  const [fontsLoading, setFontsLoading] = useState(true)
  const language = settings.language
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params)

  useEffect(() => {
    if (payload.settings) setSettings(payload.settings)
  }, [payload.settings])

  useEffect(() => {
    let live = true
    void listFonts().then((list) => {
      if (!live) return
      setFonts(list)
      setFontsLoading(false)
    })
    return () => { live = false }
  }, [])

  const patch = (changes: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...changes }))
    if (changes.theme) onThemeChange?.(changes.theme)
    onResult({ action: 'settings', settings: changes })
  }
  const patchDefaults = (changes: Partial<WriterOptions>) => {
    const writerDefaults = { ...settings.writerDefaults, ...changes }
    patch({ writerDefaults })
  }

  const chooseBackground = async () => {
    const result = await openFiles({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'] }] })
    const file = result.files[0]
    if (result.canceled || !file) return
    const bytes = file.bytes ?? new TextEncoder().encode(file.text ?? '')
    const ext = file.name.toLowerCase().split('.').pop() ?? 'png'
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    await putBlob(BACKGROUND_KEY, new Blob([bytes as BlobPart], { type: mime }))
    patch({ hasBackgroundImage: true })
    onResult({ action: 'backgroundChanged' })
  }
  const removeBackground = async () => {
    await deleteBlob(BACKGROUND_KEY).catch(() => {})
    patch({ hasBackgroundImage: false })
    onResult({ action: 'backgroundChanged' })
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: tr('tabGeneral') },
    { id: 'appearance', label: tr('tabAppearance') },
    { id: 'fonts', label: tr('tabFonts') },
    { id: 'editor', label: tr('tabEditor') },
    { id: 'conversion', label: tr('tabConversion') },
    { id: 'output', label: tr('tabOutput') },
  ]
  const monoFonts = fonts.filter(isLikelyMonospace)
  const fontOptions = (list: string[]) => list.map((name) => ({ value: name, label: name }))
  const fontSelect = (value: string, onChange: (next: string) => void, preferMono: boolean) => {
    if (fontsLoading) return <span className="hint">{tr('fontsLoading')}</span>
    const known = fonts.includes(value)
    const options = preferMono ? [...fontOptions(monoFonts), ...fontOptions(fonts.filter((name) => !isLikelyMonospace(name)))] : fontOptions(fonts)
    return (
      <select value={known ? value : ''} onChange={(event) => onChange(event.target.value)}>
        {!known && <option value="">{value || '(system)'}</option>}
        {preferMono && monoFonts.length > 0 && <optgroup label={tr('monospaceFonts')}>{fontOptions(monoFonts).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
        <optgroup label={tr('allFonts')}>{(preferMono ? options.slice(monoFonts.length) : options).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>
      </select>
    )
  }

  return (
    <div className="settings">
      <nav className="dialog-tabs" role="tablist">
        {tabs.map((item) => (
          <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </nav>
      {tab === 'general' && (
        <div className="settings-page">
          <Field label={tr('language')}>
            <Select<Language> value={settings.language} options={[{ value: 'ko', label: '한국어' }, { value: 'en', label: 'English' }]} onChange={(next) => patch({ language: next })} />
          </Field>
          <Check label={tr('confirmClose')} checked={settings.confirmClose} onChange={(confirmClose) => patch({ confirmClose })} />
          <Check label={tr('restoreSession')} checked={settings.restoreSession} onChange={(restoreSession) => patch({ restoreSession })} />
          <h3>{tr('rememberedFolders')}</h3>
          <dl className="folder-list">
            <dt>{tr('openFolder')}</dt><dd>{settings.lastOpenDirectory || '—'}</dd>
            <dt>{tr('saveFolder')}</dt><dd>{settings.lastSaveDirectory || '—'}</dd>
            <dt>{tr('exportFolder')}</dt><dd>{settings.lastExportDirectory || '—'}</dd>
            <dt>{tr('batchFolder')}</dt><dd>{settings.lastBatchDirectory || '—'}</dd>
          </dl>
          <Buttons>
            <button onClick={() => patch({ lastOpenDirectory: '', lastSaveDirectory: '', lastExportDirectory: '', lastBatchDirectory: '' })}><Trash size={14} /><span>{tr('forgetFolders')}</span></button>
            <button onClick={() => { if (window.confirm(tr('resetSettingsConfirm'))) onResult({ action: 'resetSettings' }) }}><span>{tr('resetSettings')}</span></button>
          </Buttons>
        </div>
      )}
      {tab === 'appearance' && (
        <div className="settings-page">
          <Field label={tr('theme')}>
            <Select value={settings.theme} options={themes.map((theme) => ({ value: theme.id, label: themeLabel(language, theme.id) }))} onChange={(theme) => patch({ theme: theme as AppSettings['theme'] })} />
          </Field>
          <div className="theme-grid">
            {themes.map((theme) => (
              <button key={theme.id} className={settings.theme === theme.id ? 'theme-swatch active' : 'theme-swatch'} data-tooltip={themeLabel(language, theme.id)} onClick={() => patch({ theme: theme.id as AppSettings['theme'] })} style={{ background: `linear-gradient(135deg, ${theme.appA}, ${theme.appB})`, borderColor: theme.accent }}>
                <span style={{ background: theme.accent }} />
                <em>{themeLabel(language, theme.id)}</em>
              </button>
            ))}
          </div>
          <h3>{tr('backgroundImage')}</h3>
          <p className="hint">{settings.hasBackgroundImage ? tr('imageSet') : tr('noImage')}</p>
          <Buttons>
            <button onClick={() => void chooseBackground()}><FolderOpen size={14} /><span>{tr('chooseImage')}</span></button>
            <button disabled={!settings.hasBackgroundImage} onClick={() => void removeBackground()}><Trash size={14} /><span>{tr('removeImage')}</span></button>
          </Buttons>
          <Field label={tr('backgroundOpacity')}>
            <Slider value={settings.backgroundOpacity} min={0} max={100} suffix="%" onChange={(backgroundOpacity) => patch({ backgroundOpacity })} />
          </Field>
          <Field label={tr('backgroundFit')}>
            <Select<AppSettings['backgroundFit']> value={settings.backgroundFit} options={[{ value: 'cover', label: tr('fitCover') }, { value: 'contain', label: tr('fitContain') }, { value: 'tile', label: tr('fitTile') }, { value: 'center', label: tr('fitCenter') }]} onChange={(backgroundFit) => patch({ backgroundFit })} />
          </Field>
        </div>
      )}
      {tab === 'fonts' && (
        <div className="settings-page">
          <Field label={tr('editorFont')} wide>{fontSelect(settings.fontFamily, (fontFamily) => patch({ fontFamily }), true)}</Field>
          <Field label={tr('fontSize')}>
            <NumberField value={settings.fontSize} min={8} max={48} onChange={(fontSize) => patch({ fontSize })} suffix="px" />
          </Field>
          <Field label={tr('fontStyle')}>
            <span className="inline-checks">
              <Check label={tr('bold')} checked={settings.fontBold} onChange={(fontBold) => patch({ fontBold })} />
              <Check label={tr('italic')} checked={settings.fontItalic} onChange={(fontItalic) => patch({ fontItalic })} />
            </span>
          </Field>
          <p className="font-preview" style={{ fontFamily: `"${settings.fontFamily}", monospace`, fontSize: settings.fontSize, fontWeight: settings.fontBold ? 700 : 400, fontStyle: settings.fontItalic ? 'italic' : 'normal' }}>{tr('fontPreviewText')}</p>
          <Field label={tr('previewFont')} wide>{fontSelect(settings.previewFontFamily, (previewFontFamily) => patch({ previewFontFamily }), false)}</Field>
          <Field label={tr('previewFontSize')}>
            <NumberField value={settings.previewFontSize} min={8} max={48} onChange={(previewFontSize) => patch({ previewFontSize })} suffix="px" />
          </Field>
          <p className="font-preview" style={{ fontFamily: settings.previewFontFamily ? `"${settings.previewFontFamily}", serif` : undefined, fontSize: settings.previewFontSize }}>{tr('fontPreviewText')}</p>
          {!fontsLoading && <p className="hint">{tr('fontsCount', { count: fonts.length })}</p>}
        </div>
      )}
      {tab === 'editor' && (
        <div className="settings-page">
          <Check label={tr('wordWrap')} checked={settings.wordWrap} onChange={(wordWrap) => patch({ wordWrap })} />
          <Check label={tr('lineNumbers')} checked={settings.lineNumbers} onChange={(lineNumbers) => patch({ lineNumbers })} />
          <Check label={tr('autoConvert')} checked={settings.autoConvert} onChange={(autoConvert) => patch({ autoConvert })} />
          <Field label={tr('autoConvertDelay')}>
            <NumberField value={settings.autoConvertDelay} min={100} max={5000} step={100} onChange={(autoConvertDelay) => patch({ autoConvertDelay })} />
          </Field>
          <Field label={tr('zoom')}>
            <Slider value={settings.zoom} min={50} max={300} step={10} suffix="%" onChange={(zoom) => patch({ zoom })} />
          </Field>
        </div>
      )}
      {tab === 'conversion' && (
        <div className="settings-page">
          <Field label={tr('defaultFrom')}>
            <GroupedSelect<FormatId> value={settings.defaultFrom} groups={groupedFormats(readableFormats, language)} onChange={(defaultFrom) => patch({ defaultFrom })} />
          </Field>
          <Field label={tr('defaultTo')}>
            <GroupedSelect<FormatId> value={settings.defaultTo} groups={groupedFormats(writableFormats, language)} onChange={(defaultTo) => patch({ defaultTo })} />
          </Field>
        </div>
      )}
      {tab === 'output' && (
        <div className="settings-page settings-output">
          <p className="hint">{tr('writerDefaults')} — {tr('writerDefaultsHint')}</p>
          <nav className="dialog-subtabs" role="tablist">
            {optionSections.map((item) => (
              <button key={item.id} role="tab" aria-selected={outputSection === item.id} className={outputSection === item.id ? 'active' : ''} onClick={() => setOutputSection(item.id)}>{tr(item.label)}</button>
            ))}
          </nav>
          <div className="settings-output-body">
            <OptionsForm language={language} value={settings.writerDefaults} onChange={patchDefaults} fonts={fonts} compact section={outputSection} />
          </div>
          <Buttons>
            <button onClick={() => patch({ writerDefaults: { ...defaultWriterOptions } })}><span>{tr('resetOptions')}</span></button>
          </Buttons>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- about */

function AboutDialog({ payload, onClose }: { payload: DialogPayload; onClose: () => void }) {
  const language = payload.language
  const tr = (key: string) => t(language, key)
  const versions = window.electronAppApi?.versions()
  const [copied, setCopied] = useState(false)
  const rows: [string, string][] = [
    [tr('version'), buildInfo.version],
    [tr('creator'), payload.creator],
    [tr('buildTime'), buildInfo.buildTime ? new Date(buildInfo.buildTime).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US') : '—'],
    [tr('commit'), buildInfo.commit ? `${buildInfo.commit}${buildInfo.branch ? ` (${buildInfo.branch})` : ''}` : '—'],
    [tr('toolchain'), `React ${buildInfo.react} · Vite ${buildInfo.vite} · TypeScript ${buildInfo.typescript} · Node ${buildInfo.node}`],
    [tr('runtime'), versions ? `Electron ${versions.electron} · Chromium ${versions.chrome} · Node ${versions.node} · ${versions.platform}-${versions.arch}` : `${navigator.userAgent}`],
  ]
  const text = [`${buildInfo.name} ${buildInfo.version}`, ...rows.map(([key, value]) => `${key}: ${value}`)].join('\n')
  return (
    <div className="about">
      <div className="about-head">
        <img src="./app-icon.svg" alt="" width={72} height={72} />
        <div>
          <h1>{buildInfo.name}</h1>
          <p>{tr('aboutDescription')}</p>
        </div>
      </div>
      <dl className="about-rows">
        {rows.map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <Buttons>
        <button onClick={() => void copyText(text).then((ok) => { setCopied(ok); setTimeout(() => setCopied(false), 1500) })}>
          {copied ? <CheckIcon size={14} /> : <Copy size={14} />}<span>{copied ? tr('copied') : tr('copyBuildInfo')}</span>
        </button>
        <button className="primary" onClick={onClose}><span>{tr('close')}</span></button>
      </Buttons>
    </div>
  )
}

/* ----------------------------------------------------------------- error */

function ErrorDialog({ payload, onClose }: { payload: DialogPayload; onClose: () => void }) {
  const language = payload.language
  const tr = (key: string) => t(language, key)
  const [copied, setCopied] = useState(false)
  const error = payload.error ?? { title: tr('errorUnexpected'), message: '', details: '' }
  return (
    <div className="error-body">
      <p className="error-message">{error.message}</p>
      <h3>{tr('errorDetails')}</h3>
      <textarea className="error-details" readOnly value={error.details} rows={9} onFocus={(event) => event.currentTarget.select()} />
      <Buttons>
        <button onClick={() => void copyText(error.details).then((ok) => { setCopied(ok); setTimeout(() => setCopied(false), 1500) })}>
          {copied ? <CheckIcon size={14} /> : <Copy size={14} />}<span>{copied ? tr('copied') : tr('errorCopy')}</span>
        </button>
        <button className="primary" onClick={onClose}><span>{tr('close')}</span></button>
      </Buttons>
    </div>
  )
}

/* --------------------------------------------------------------- unsaved */

function UnsavedDialog({ payload, onResult }: { payload: DialogPayload; onResult: (result: DialogResult) => void }) {
  const language = payload.language
  const names = payload.unsaved?.names ?? []
  const message = names.length === 1 ? t(language, 'unsavedQuestion', { name: names[0] }) : t(language, 'unsavedMany', { count: names.length })
  return (
    <div className="unsaved-body">
      <p>{message}</p>
      {names.length > 1 && <ul className="unsaved-list">{names.map((name) => <li key={name}>{name}</li>)}</ul>}
      <Buttons>
        <button className="primary" autoFocus onClick={() => onResult({ action: 'save' })}><span>{t(language, 'save')}</span></button>
        <button onClick={() => onResult({ action: 'discard' })}><span>{t(language, 'dontSave')}</span></button>
        <button onClick={() => onResult({ action: 'cancel' })}><span>{t(language, 'cancel')}</span></button>
      </Buttons>
    </div>
  )
}

/* -------------------------------------------------------------- progress */

function ProgressDialog({ payload, onResult }: { payload: DialogPayload; onResult: (result: DialogResult) => void }) {
  const language = payload.language
  const progress = payload.progress ?? { title: '', detail: '', value: -1, cancellable: false, done: false }
  return (
    <div className="progress-body">
      <p className="progress-detail">{progress.detail}</p>
      <div className={progress.value < 0 ? 'progress-bar indeterminate' : 'progress-bar'}>
        <span style={{ width: progress.value < 0 ? '40%' : `${Math.round(Math.min(1, progress.value) * 100)}%` }} />
      </div>
      {progress.value >= 0 && <p className="progress-percent">{Math.round(Math.min(1, progress.value) * 100)}%</p>}
      <Buttons>
        <button disabled={!progress.cancellable || progress.done} onClick={() => onResult({ action: 'cancel' })}><span>{t(language, 'progressCancel')}</span></button>
      </Buttons>
    </div>
  )
}

/* ----------------------------------------------------------------- print */

const PAPER_MM: Record<PageSize, [number, number]> = { A4: [210, 297], A3: [297, 420], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] }

function PrintDialog({ payload, onResult, onClose }: { payload: DialogPayload; onResult: (result: DialogResult) => void; onClose: () => void }) {
  const language = payload.language
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params)
  const print = payload.print
  const [printer, setPrinter] = useState(print?.printers.find((item) => item.isDefault)?.name ?? print?.printers[0]?.name ?? '')
  const [copies, setCopies] = useState(1)
  const [landscape, setLandscape] = useState(print?.landscape ?? false)
  const [pageSize, setPageSize] = useState<PageSize>(print?.pageSize ?? 'A4')
  const [marginMm, setMarginMm] = useState(print?.marginMm ?? 20)
  const [scope, setScope] = useState<'all' | 'current' | 'custom'>('current')
  const [pages, setPages] = useState('')
  const [what, setWhat] = useState<'output' | 'source'>('output')
  const [pageCount, setPageCount] = useState(0)
  const [previewPage, setPreviewPage] = useState(0)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  const documents = print?.documents ?? []
  const [wmm, hmm] = PAPER_MM[pageSize]
  const paperW = landscape ? hmm : wmm
  const paperH = landscape ? wmm : hmm

  const html = useMemo(() => {
    const chosen = scope === 'all' ? documents : documents[print?.current ?? 0] ? [documents[print?.current ?? 0]] : documents
    const bodies = chosen.map((doc) => (what === 'output' ? doc.html : doc.sourceHtml))
    const joined = bodies.map((body, index) => `<div class="print-document"${index ? ' style="page-break-before:always"' : ''}>${body}</div>`).join('\n')
    const pageRule = `@page { size: ${pageSize}${landscape ? ' landscape' : ''}; margin: ${marginMm}mm; }`
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${pageRule} html{overflow:hidden} html,body{margin:0;padding:0;background:#fff;color:#000} body{max-width:none;font-family:Georgia,"Malgun Gothic",serif;font-size:12pt;line-height:1.5} pre{white-space:pre-wrap;font-family:Consolas,Menlo,monospace;font-size:10pt;background:#f4f4f4;padding:8px;border-radius:4px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #666;padding:4px 8px} img{max-width:100%} h1,h2,h3{page-break-after:avoid} .print-document{padding:0} @media screen { body{padding:${marginMm}mm} }</style></head><body>${joined}</body></html>`
  }, [documents, scope, what, pageSize, landscape, marginMm, print?.current])

  // The page count, from how tall the content lays out at paper width.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const body = frame.contentDocument?.body
      if (!body) return
      const pxPerMm = 96 / 25.4
      const pageInner = (paperH - marginMm * 2) * pxPerMm
      const height = body.scrollHeight - marginMm * 2 * pxPerMm
      const count = Math.max(1, Math.ceil(height / pageInner))
      setPageCount(count)
      // Draw the page boundaries onto the sheet.
      let overlay = frame.contentDocument?.getElementById('page-lines')
      if (!overlay && frame.contentDocument) {
        overlay = frame.contentDocument.createElement('div')
        overlay.id = 'page-lines'
        frame.contentDocument.body.appendChild(overlay)
      }
      if (overlay) {
        overlay.setAttribute('style', `position:absolute;left:0;top:0;width:100%;height:${count * paperH * pxPerMm}px;pointer-events:none;background:repeating-linear-gradient(to bottom, transparent 0, transparent ${paperH * pxPerMm - 2}px, rgba(200,40,40,0.55) ${paperH * pxPerMm - 2}px, rgba(200,40,40,0.55) ${paperH * pxPerMm}px);`)
        frame.contentDocument!.body.style.position = 'relative'
        frame.contentDocument!.body.style.minHeight = `${count * paperH * pxPerMm}px`
      }
    }
    frame.addEventListener('load', measure)
    const timer = window.setTimeout(measure, 200)
    return () => {
      frame.removeEventListener('load', measure)
      window.clearTimeout(timer)
    }
  }, [html, paperH, marginMm])

  const systemPrint = () => {
    const frame = frameRef.current
    frame?.contentWindow?.focus()
    frame?.contentWindow?.print()
  }

  const submit = () => {
    if (!print?.desktop) {
      systemPrint()
      return
    }
    onResult({ action: 'print', html, deviceName: printer, copies, landscape, pageSize, pages: scope === 'custom' ? pages : '', scope })
  }

  const pxPerMm = 96 / 25.4
  // One sheet at a time, scaled to fit the preview box, so the window keeps one size and never scrolls.
  const box = { width: 540, height: 540 }
  const sheetScale = Math.min(box.width / (paperW * pxPerMm), box.height / (paperH * pxPerMm))
  const total = Math.max(1, pageCount)
  const shown = Math.min(previewPage, total - 1)
  return (
    <div className="print-body">
      <div className="print-preview" style={{ width: box.width + 24 }}>
        <div className="print-sheet" style={{ width: paperW * pxPerMm * sheetScale, height: paperH * pxPerMm * sheetScale }}>
          <iframe ref={frameRef} title={tr('printPreview')} srcDoc={html} scrolling="no" style={{ width: paperW * pxPerMm, height: paperH * pxPerMm * total, transform: `scale(${sheetScale}) translateY(${-shown * paperH * pxPerMm}px)` }} />
        </div>
        <div className="print-nav">
          <button disabled={shown <= 0} aria-label="<" onClick={() => setPreviewPage(Math.max(0, shown - 1))}><ChevronLeft size={14} /></button>
          <span className="hint">{shown + 1} / {total} · {pageSize} {landscape ? tr('landscapeOrientation') : tr('portrait')}</span>
          <button disabled={shown >= total - 1} aria-label=">" onClick={() => setPreviewPage(Math.min(total - 1, shown + 1))}><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="print-settings">
        <h3>{tr('printWhat')}</h3>
        <Field label={tr('printWhat')}>
          <Select<'output' | 'source'> value={what} options={[{ value: 'output', label: tr('printOutput') }, { value: 'source', label: tr('printSource') }]} onChange={setWhat} />
        </Field>
        <Field label={tr('scope')}>
          <Select<'all' | 'current' | 'custom'> value={scope} options={[{ value: 'current', label: tr('scopeCurrent') }, { value: 'all', label: tr('scopeAll') }, { value: 'custom', label: tr('scopeCustom') }]} onChange={setScope} />
        </Field>
        {scope === 'custom' && (
          <Field label={tr('pageRange')} hint={tr('pageRangeHint')}>
            <input type="text" value={pages} placeholder="1-3, 5" onChange={(event) => setPages(event.target.value)} />
          </Field>
        )}
        <h3>{tr('pageSetup')}</h3>
        <Field label={tr('pageSize')}>
          <Select<PageSize> value={pageSize} options={(Object.keys(PAPER_MM) as PageSize[]).map((size) => ({ value: size, label: size }))} onChange={setPageSize} />
        </Field>
        <Field label={tr('orientation')}>
          <Select<'portrait' | 'landscape'> value={landscape ? 'landscape' : 'portrait'} options={[{ value: 'portrait', label: tr('portrait') }, { value: 'landscape', label: tr('landscapeOrientation') }]} onChange={(value) => setLandscape(value === 'landscape')} />
        </Field>
        <Field label={tr('marginMm')}>
          <NumberField value={marginMm} min={0} max={60} onChange={setMarginMm} />
        </Field>
        <h3>{tr('printer')}</h3>
        {print?.desktop ? (
          <>
            <Field label={tr('printer')}>
              {print.printers.length ? (
                <Select value={printer} options={print.printers.map((item) => ({ value: item.name, label: item.displayName }))} onChange={setPrinter} />
              ) : <span className="hint">{tr('noPrinters')}</span>}
            </Field>
            <Field label={tr('copies')}>
              <NumberField value={copies} min={1} max={99} onChange={setCopies} />
            </Field>
          </>
        ) : <p className="hint">{tr('webPdfHint')}</p>}
        <Buttons>
          <button className="primary" disabled={print?.desktop && !print.printers.length} onClick={submit}><span>{tr('printNow')}</span></button>
          <button onClick={systemPrint}><span>{tr('systemPrint')}</span></button>
          <button onClick={onClose}><span>{tr('cancel')}</span></button>
        </Buttons>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ open recent */

function OpenRecentDialog({ payload, onResult, onClose }: { payload: DialogPayload; onResult: (result: DialogResult) => void; onClose: () => void }) {
  const language = payload.language
  const tr = (key: string) => t(language, key)
  const [files, setFiles] = useState(payload.recentFiles ?? [])
  const [selected, setSelected] = useState(0)
  useEffect(() => { setFiles(payload.recentFiles ?? []) }, [payload.recentFiles])
  const open = (path: string) => onResult({ action: 'open', path })
  return (
    <div className="recent-body">
      <p className="hint">{tr('recentHint')}</p>
      {files.length === 0 ? <p className="hint">{tr('noRecent')}</p> : (
        <ul className="recent-list">
          {files.map((file, index) => (
            <li key={file.path} className={index === selected ? 'selected' : ''} onClick={() => setSelected(index)} onDoubleClick={() => open(file.path)}>
              <FileText size={15} />
              <span className="recent-name">{file.name}</span>
              <span className="recent-path" title={file.path}>{file.path}</span>
              <span className="recent-format">{formatName(file.format, language)}</span>
              <button data-tooltip={tr('forgetRecent')} aria-label={tr('forgetRecent')} onClick={(event) => { event.stopPropagation(); setFiles((current) => current.filter((item) => item.path !== file.path)); onResult({ action: 'forget', path: file.path }) }}><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <Buttons>
        <button className="primary" disabled={!files[selected]} onClick={() => files[selected] && open(files[selected].path)}><FolderOpen size={14} /><span>{tr('open')}</span></button>
        <button disabled={!files.length} onClick={() => { setFiles([]); onResult({ action: 'clear' }) }}><Trash size={14} /><span>{tr('clearAll')}</span></button>
        <button onClick={onClose}><span>{tr('close')}</span></button>
      </Buttons>
    </div>
  )
}

/* ---------------------------------------------------------------- open url */

function OpenUrlDialog({ payload, onResult, onClose }: { payload: DialogPayload; onResult: (result: DialogResult) => void; onClose: () => void }) {
  const language = payload.language
  const tr = (key: string) => t(language, key)
  const [url, setUrl] = useState('https://')
  const [format, setFormat] = useState<'auto' | FormatId>('auto')
  const valid = /^https?:\/\/\S+\.\S+/.test(url)
  return (
    <div className="url-body">
      <p className="hint">{tr('urlHint')}</p>
      <Field label={tr('urlLabel')} wide>
        <input type="url" value={url} autoFocus onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && valid) onResult({ action: 'fetch', url, format }) }} />
      </Field>
      <Field label={tr('urlFormat')}>
        <GroupedSelect<'auto' | FormatId> value={format} groups={[{ label: tr('urlAuto'), options: [{ value: 'auto', label: tr('urlAuto') }] }, ...groupedFormats(readableFormats, language)]} onChange={setFormat} />
      </Field>
      <Buttons>
        <button className="primary" disabled={!valid} onClick={() => onResult({ action: 'fetch', url, format })}><Globe size={14} /><span>{tr('open')}</span></button>
        <button onClick={onClose}><span>{tr('cancel')}</span></button>
      </Buttons>
    </div>
  )
}

/* --------------------------------------------------------------- shortcuts */

function ShortcutsDialog({ payload, onClose }: { payload: DialogPayload; onClose: () => void }) {
  const language = payload.language
  const rows = commands.filter((command) => command.accel && command.menu !== 'context')
  return (
    <div className="shortcuts-body">
      <div className="shortcut-columns">
        {menuOrder.filter((menu) => rows.some((command) => command.menu === menu)).map((menu) => (
          <section key={menu} className="shortcut-section">
            <h3>{t(language, menu)}</h3>
            {rows.filter((command) => command.menu === menu).map((command) => (
              <div key={command.id} className="shortcut-row"><span>{t(language, command.label)}</span><kbd>{command.accel}</kbd></div>
            ))}
          </section>
        ))}
        <section className="shortcut-section">
          <h3>{t(language, 'zoom')}</h3>
          <div className="shortcut-row"><span>{t(language, 'view.zoomIn')} / {t(language, 'view.zoomOut')}</span><kbd>Ctrl + Wheel</kbd></div>
        </section>
      </div>
      <p className="hint">{t(language, 'shortcutsHint')}</p>
      <Buttons><button className="primary" onClick={onClose}><span>{t(language, 'close')}</span></button></Buttons>
    </div>
  )
}

/* ----------------------------------------------------------------- formats */

function FormatsDialog({ payload, onClose }: { payload: DialogPayload; onClose: () => void }) {
  const language = payload.language
  const tr = (key: string) => t(language, key)
  const [group, setGroup] = useState<FormatGroup>('markdown')
  const inGroup = formats.filter((format) => format.group === group)
  const readable = readableFormats.length
  const writable = writableFormats.length
  return (
    <div className="formats-body">
      <nav className="dialog-tabs" role="tablist">
        {groupOrder.map((item) => (
          <button key={item} role="tab" aria-selected={group === item} className={group === item ? 'active' : ''} onClick={() => setGroup(item)}>{groupNames[item][language]}</button>
        ))}
      </nav>
      <div className="format-grid">
        {inGroup.map((format) => (
          <div key={format.id} className="format-card">
            <span className="format-name">{format.names[language]}</span>
            <code className="format-id">{format.id}</code>
            <span className="format-ext">{format.extensions.map((ext) => `.${ext}`).join(' ')}</span>
            <span className={format.read ? 'format-flag on' : 'format-flag'} title={tr('formatRead')}>{tr('formatRead')}</span>
            <span className={format.write ? 'format-flag on' : 'format-flag'} title={tr('formatWrite')}>{tr('formatWrite')}</span>
          </div>
        ))}
      </div>
      <p className="hint">{tr('formatsHint')} ({tr('formatRead')} {readable} · {tr('formatWrite')} {writable})</p>
      <Buttons><button className="primary" onClick={onClose}><span>{tr('close')}</span></button></Buttons>
    </div>
  )
}

/* ---------------------------------------------------------------- metadata */

function MetadataDialog({ payload, onResult, onClose }: { payload: DialogPayload; onResult: (result: DialogResult) => void; onClose: () => void }) {
  const language = payload.language
  const tr = (key: string) => t(language, key)
  const [meta, setMeta] = useState(payload.metadata ?? { title: '', author: '', date: '' })
  return (
    <div className="metadata-body">
      <p className="hint">{tr('metadataHint')}</p>
      <Field label={tr('title')} wide><input type="text" value={meta.title} autoFocus onChange={(event) => setMeta({ ...meta, title: event.target.value })} /></Field>
      <Field label={tr('author')} wide><input type="text" value={meta.author} onChange={(event) => setMeta({ ...meta, author: event.target.value })} /></Field>
      <Field label={tr('date')} wide><input type="text" value={meta.date} onChange={(event) => setMeta({ ...meta, date: event.target.value })} /></Field>
      <Buttons>
        <button className="primary" onClick={() => onResult({ action: 'metadata', ...meta })}><span>{tr('ok')}</span></button>
        <button onClick={onClose}><span>{tr('cancel')}</span></button>
      </Buttons>
    </div>
  )
}

/* ------------------------------------------------------------------- stats */

function StatsDialog({ payload, onClose }: { payload: DialogPayload; onClose: () => void }) {
  const language = payload.language
  const stats = payload.stats ?? {}
  return (
    <div className="stats-body">
      <table className="data-table">
        <tbody>
          {Object.entries(stats).map(([key, value]) => (
            <tr key={key}><td>{t(language, key)}</td><td className="num">{typeof value === 'number' ? value.toLocaleString() : value}</td></tr>
          ))}
        </tbody>
      </table>
      <Buttons><button className="primary" onClick={onClose}><span>{t(language, 'close')}</span></button></Buttons>
    </div>
  )
}

/* ------------------------------------------------------------------- batch */

type BatchItem = { name: string; path: string; format: FormatId; file?: OpenedFile; status: 'pending' | 'done' | 'failed'; message?: string }

function BatchDialog({ payload, onResult, onClose }: { payload: DialogPayload; onResult: (result: DialogResult) => void; onClose: () => void }) {
  const language = payload.language
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params)
  const desktop = isDesktop()
  const [items, setItems] = useState<BatchItem[]>(() => (payload.batch?.files ?? []).map((file) => ({ name: file.name, path: file.path, format: file.format as FormatId, status: 'pending' })))
  const [to, setTo] = useState<FormatId>((payload.batch?.to as FormatId) ?? 'html')
  const [directory, setDirectory] = useState(payload.settings?.lastBatchDirectory ?? '')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [summary, setSummary] = useState('')
  const cancelRef = useRef(false)
  const options = payload.settings?.writerDefaults ?? defaultWriterOptions

  const addFiles = async () => {
    const result = await openFiles({ defaultPath: payload.settings?.lastOpenDirectory || undefined, filters: [{ name: 'Documents', extensions: readableFormats.flatMap((format) => format.extensions) }, { name: 'All Files', extensions: ['*'] }] })
    if (result.canceled) return
    setItems((current) => [...current, ...result.files.filter((file) => !current.some((item) => item.path && item.path === file.path)).map((file) => ({ name: file.name, path: file.path, format: formatForFile(file.name), file, status: 'pending' as const }))])
  }

  const run = async () => {
    let target = directory
    if (desktop && !target) {
      const chosen = await chooseDirectory(payload.settings?.lastBatchDirectory || undefined)
      if (chosen.canceled || !chosen.directory) return
      target = chosen.directory
      setDirectory(target)
    }
    setRunning(true)
    cancelRef.current = false
    setSummary('')
    const results: { name: string; text?: string; bytes?: Uint8Array }[] = []
    let done = 0
    let failed = 0
    const format = getFormat(to)
    for (let index = 0; index < items.length; index += 1) {
      if (cancelRef.current) break
      const item = items[index]
      try {
        let file = item.file
        if (!file && desktop && window.electronFileApi) {
          const read = await window.electronFileApi.readFile({ filePath: item.path })
          const first = read.files[0]
          if (!first) throw new Error(read.message || 'Cannot read file')
          file = { name: first.name, path: first.path, size: first.size ?? 0, text: first.text, bytes: first.base64 ? Uint8Array.from(atob(first.base64), (c) => c.charCodeAt(0)) : undefined }
        }
        if (!file) throw new Error('File is not available')
        const output = await convert({ format: item.format, text: file.text, bytes: file.bytes }, to, options, {
          renderPdf: window.electronPrintApi ? async (html) => {
            const pdf = await window.electronPrintApi!.pdf({ html, landscape: options.landscape, pageSize: options.pageSize })
            if (!pdf.ok || !pdf.base64) throw new Error(pdf.message || 'PDF failed')
            return Uint8Array.from(atob(pdf.base64), (c) => c.charCodeAt(0))
          } : undefined,
          loadFont: loadBundledFont,
        })
        if (to === 'pdf' && !output.bytes) throw new Error(tr('pdfNeedsDesktop'))
        const outName = `${stripExtension(item.name)}.${format.extensions[0]}`
        if (desktop) {
          const written = await writePath(joinPath(target, outName), { text: output.text, bytes: output.bytes })
          if (written.canceled) throw new Error(written.message || 'Write failed')
        } else {
          results.push({ name: outName, text: output.text, bytes: output.bytes })
        }
        done += 1
        setItems((current) => current.map((entry, k) => (k === index ? { ...entry, status: 'done' } : entry)))
      } catch (error) {
        failed += 1
        setItems((current) => current.map((entry, k) => (k === index ? { ...entry, status: 'failed', message: error instanceof Error ? error.message : String(error) } : entry)))
      }
      setProgress((index + 1) / items.length)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    if (!desktop && results.length) {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      for (const result of results) zip.file(result.name, result.bytes ?? result.text ?? '')
      downloadFile('converted.zip', await zip.generateAsync({ type: 'uint8array' }), 'application/zip')
    }
    setRunning(false)
    setSummary(`${tr('batchDone', { count: done, directory: desktop ? target : 'converted.zip' })}${failed ? ` · ${tr('batchFailed', { count: failed })}` : ''}`)
    onResult({ action: 'batchDone', count: done, failed, directory: target })
  }

  return (
    <div className="batch-body">
      <p className="hint">{desktop ? tr('batchHint') : tr('batchZip')}</p>
      <div className="batch-list">
        {items.length === 0 ? <p className="hint batch-empty">{tr('batchEmpty')}</p> : items.map((item, index) => (
          <div key={`${item.path}-${index}`} className={`batch-item ${item.status}`}>
            <FileText size={14} />
            <span className="batch-name" title={item.path || item.name}>{item.name}</span>
            <GroupedSelect<FormatId> value={item.format} groups={groupedFormats(readableFormats, language)} onChange={(next) => setItems((current) => current.map((entry, k) => (k === index ? { ...entry, format: next } : entry)))} />
            <span className="batch-status" title={item.message}>{item.status === 'done' ? '✓' : item.status === 'failed' ? '✗' : ''}</span>
            <button disabled={running} aria-label={tr('remove')} data-tooltip={tr('remove')} onClick={() => setItems((current) => current.filter((_, k) => k !== index))}><X size={13} /></button>
          </div>
        ))}
      </div>
      <div className="batch-controls">
        <button disabled={running} onClick={() => void addFiles()}><Plus size={14} /><span>{tr('batchAdd')}</span></button>
        <button disabled={running || !items.length} onClick={() => setItems([])}><Trash size={14} /><span>{tr('batchClear')}</span></button>
        <Field label={tr('batchOutput')}>
          <GroupedSelect<FormatId> value={to} groups={groupedFormats(writableFormats, language)} onChange={setTo} />
        </Field>
      </div>
      {desktop && (
        <Field label={tr('batchFolder')} wide>
          <span className="path-picker">
            <input type="text" value={directory} readOnly placeholder="…" />
            <button disabled={running} onClick={() => void chooseDirectory(directory || undefined).then((chosen) => { if (!chosen.canceled && chosen.directory) setDirectory(chosen.directory) })}><FolderOpen size={14} /><span>{tr('browse')}</span></button>
          </span>
        </Field>
      )}
      {(running || progress > 0) && (
        <div className="progress-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      )}
      {summary && <p className="hint">{summary}</p>}
      <Buttons>
        <button className="primary" disabled={running || !items.length} onClick={() => void run()}><Play size={14} /><span>{tr('batchRun')}</span></button>
        {running && <button onClick={() => { cancelRef.current = true }}><span>{tr('progressCancel')}</span></button>}
        <button disabled={running} onClick={onClose}><span>{tr('close')}</span></button>
      </Buttons>
    </div>
  )
}

/* Exposed for the in-page fallback of the browser build, which cannot open a window. */
export { applyTheme, printableHtml, readDocument, writeDocument, bytesToBase64, formatBytes }
