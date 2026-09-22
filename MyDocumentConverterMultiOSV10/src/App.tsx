import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, Columns2, Eye, FileText, Info, Minus, PencilLine, Play, Palette, Settings, Square, X, Files } from 'lucide-react'
import { FlagKorea, FlagUnitedKingdom } from './flags'
import buildInfo from './build-info.json'
import { commandsInMenu, fileMenuWithRecents, FROM_PREFIX, menuIcons, menuOrder, RECENT_FORGET_PREFIX, RECENT_PREFIX, sectionLabel as sectionLabelFor, themeIcon, THEME_PREFIX, TO_PREFIX, toolbarCommands, type AppCommand, type MenuId } from './commands'
import { Check, Field } from './controls'
import { DialogBody, DialogFrame } from './dialogs'
import { keepsWindowOpen, type DialogName, type DialogPayload, type DialogResult, type PrintDocument } from './dialogMeta'
import { formatBytes, t } from './i18n'
import { MenuTree } from './MenuTree'
import { OptionsForm, Group } from './optionsForm'
import { applyTheme, themeLabel, themes } from './themes'
import { documentStats, type Doc } from './lib/doc/ast'
import { readDocument, writeDocument, type ConvertOutput } from './lib/doc/convert'
import { formatForFile, formatName, getFormat, readableFormats, writableFormats, type FormatId } from './lib/doc/formats'
import { normalizeOptions, type WriterOptions } from './lib/doc/options'
import { htmlBody } from './lib/doc/writers/html'
import { buildErrorReport, copyText, type ErrorReport } from './lib/errors'
import { createHistory, push as pushHistory, redo as redoHistory, undo as undoHistory, type History } from './lib/history'
import { listFonts, loadBundledFont } from './lib/fonts'
import { baseName, bytesToBase64, directoryOf, isDesktop, isTextName, openFiles, readPath, saveFileAs, stripExtension, writePath, type OpenedFile } from './lib/platform'
import { isProjectName, parseProject, PROJECT_EXTENSION, serializeProject } from './lib/project'
import { addRecent, loadSession, loadSettings, removeRecent, saveSession, saveSettings, type AppSettings, type SessionDoc, type ViewMode } from './lib/settings'
import { BACKGROUND_KEY, getBlob } from './lib/store'
import './App.css'

const VERSION = buildInfo.version
const CREATOR = 'SHKWON(knix008@naver.com)'
const APP_TITLE = `${buildInfo.name}`

type EditState = { source: string; from: FormatId; to: FormatId; options: WriterOptions }

type DocState = {
  id: string
  name: string
  path: string | null
  isProject: boolean
  source: string
  sourceBytes?: Uint8Array
  from: FormatId
  to: FormatId
  options: WriterOptions
  /** What is on disk (or what the document started as): dirty means the edit state differs from this. */
  saved: EditState
  dirty: boolean
  output: ConvertOutput | null
  outputError: string | null
  converting: boolean
  convertMs: number
  history: History<EditState>
  cursor: { line: number; col: number }
  parsed: Doc | null
  version: number
}

let docCounter = 0
const newId = () => `doc-${Date.now().toString(36)}-${(docCounter += 1)}`

/**
 * Modified means the source differs from what was saved (or opened): an
 * undo back to the saved text clears it, and choosing an output format or
 * an option does not set it — only a project file (.mdcv) records those,
 * so only there they count. Closing an unmodified document asks nothing.
 */
function isModified(doc: Pick<DocState, 'source' | 'from' | 'to' | 'options' | 'saved' | 'isProject'>): boolean {
  if (doc.source !== doc.saved.source) return true
  if (!doc.isProject) return false
  return doc.from !== doc.saved.from || doc.to !== doc.saved.to || JSON.stringify(doc.options) !== JSON.stringify(doc.saved.options)
}

const SAMPLE_MARKDOWN = `---
title: My Document Converter
author: SHKWON
---

# 문서 변환기 예제

이 문서는 **Markdown**으로 쓰여 있고, 오른쪽에서 선택한 형식으로 *즉시* 변환됩니다.

## 지원하는 요소

- 목록과 중첩 목록
  - 두 번째 단계
- [x] 작업 목록
- 링크: <https://pandoc.org>
- 코드: \`inline code\`

1. 첫째
2. 둘째

> 인용문은 이렇게 표시됩니다.

\`\`\`js
function hello(name) {
  return \`Hello, \${name}!\`
}
\`\`\`

| 형식 | 읽기 | 쓰기 |
|:-----|:----:|:----:|
| Markdown | ✓ | ✓ |
| DOCX | ✓ | ✓ |
| PDF | – | ✓ |

수식도 됩니다: $E = mc^2$

각주도 있습니다.[^1]

[^1]: 각주 내용입니다.
`

function editState(doc: DocState): EditState {
  return { source: doc.source, from: doc.from, to: doc.to, options: doc.options }
}

function readTooltip(target: EventTarget | null) {
  const node = (target as HTMLElement | null)?.closest?.('[data-tooltip]') as HTMLElement | null
  if (!node) return null
  const text = node.getAttribute('data-tooltip')?.trim()
  return text ? { node, text } : null
}

function MenuDrop({ anchor, children }: { anchor: HTMLElement | null; children: ReactNode }) {
  const box = anchor?.getBoundingClientRect()
  return (
    <div className="menu-drop" style={{ left: box?.left ?? 0, top: (box?.bottom ?? 0) + 2 }} onPointerDown={(event) => event.stopPropagation()}>
      {children}
    </div>
  )
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [docs, setDocs] = useState<DocState[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [menu, setMenu] = useState<MenuId | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [contextAt, setContextAt] = useState<{ x: number; y: number } | null>(null)
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const [inPagePayload, setInPagePayload] = useState<DialogPayload | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [fonts, setFonts] = useState<string[]>([])
  const [tabOverflow, setTabOverflow] = useState(false)
  const [error, setError] = useState<ErrorReport | null>(null)
  const [progress, setProgress] = useState<DialogPayload['progress'] | null>(null)
  const [maximized, setMaximized] = useState(false)

  const settingsRef = useRef(settings)
  const docsRef = useRef(docs)
  const activeIdRef = useRef(activeId)
  const activate = useCallback((id: string | null) => { activeIdRef.current = id; setActiveId(id) }, [])
  const errorRef = useRef(error)
  const progressRef = useRef(progress)
  const tooltipTimer = useRef(0)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const previewRef = useRef<HTMLIFrameElement | null>(null)
  const tabStripRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const convertTimers = useRef(new Map<string, number>())
  const progressCancel = useRef<(() => void) | null>(null)
  const openDialogRef = useRef<(name: DialogName, extra?: Partial<DialogPayload>) => void>(() => {})
  const runCommandRef = useRef<(id: string) => void>(() => {})

  useEffect(() => {
    settingsRef.current = settings
    errorRef.current = error
    progressRef.current = progress
  }, [settings, error, progress])

  const language = settings.language
  const tr = useCallback((key: string, params?: Record<string, string | number>) => t(language, key, params), [language])
  const desktop = isDesktop()
  const active = docs.find((doc) => doc.id === activeId) ?? null

  /* ------------------------------------------------------------ settings */

  useEffect(() => {
    applyTheme(settings.theme)
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  // The background image, from IndexedDB.
  const loadBackground = useCallback(async () => {
    if (!settingsRef.current.hasBackgroundImage) {
      setBackgroundUrl((current) => { if (current) URL.revokeObjectURL(current); return null })
      return
    }
    try {
      const blob = await getBlob<Blob>(BACKGROUND_KEY)
      setBackgroundUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return blob ? URL.createObjectURL(blob) : null
      })
    } catch (err) {
      reportErrorRef.current(tr('errorBackground'), err)
    }
  }, [tr])
  useEffect(() => { void loadBackground() }, [loadBackground, settings.hasBackgroundImage])

  useEffect(() => {
    void listFonts().then(setFonts)
  }, [])

  /* ---------------------------------------------------------- tooltips */

  const hideTooltip = useCallback(() => {
    window.clearTimeout(tooltipTimer.current)
    setTooltip(null)
  }, [])
  const showTooltip = useCallback((event: ReactPointerEvent) => {
    const found = readTooltip(event.target)
    window.clearTimeout(tooltipTimer.current)
    if (!found) { setTooltip(null); return }
    tooltipTimer.current = window.setTimeout(() => {
      const box = found.node.getBoundingClientRect()
      setTooltip({ text: found.text, x: box.left + box.width / 2, y: box.bottom + 6 })
    }, 350)
  }, [])

  /* ------------------------------------------------------------- errors */

  const reportError = useCallback((action: string, err: unknown, source = 'main') => {
    const current = docsRef.current.find((doc) => doc.id === activeIdRef.current)
    const report = buildErrorReport(err, {
      action,
      source,
      extra: { Document: current ? `${current.name} (${current.from} → ${current.to})` : 'none' },
    }, VERSION)
    setError(report)
    errorRef.current = report
    openDialogRef.current('error', { error: report })
  }, [])
  const reportErrorRef = useRef(reportError)
  useEffect(() => { reportErrorRef.current = reportError }, [reportError])

  useEffect(() => {
    const onError = (event: ErrorEvent) => reportErrorRef.current(t(settingsRef.current.language, 'errorUnexpected'), event.error ?? event.message)
    const onRejection = (event: PromiseRejectionEvent) => reportErrorRef.current(t(settingsRef.current.language, 'errorUnexpected'), event.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => window.electronDialogApi?.onError?.(({ message, details }) => {
    const report = { title: t(settingsRef.current.language, 'errorInWindow'), message, details }
    setError(report)
    errorRef.current = report
    openDialogRef.current('error', { error: report })
  }), [])

  /* ------------------------------------------------------------ dialogs */

  const dialogPayload = useCallback((name: DialogName): DialogPayload => {
    const current = docsRef.current.find((doc) => doc.id === activeIdRef.current)
    const base: DialogPayload = {
      language: settingsRef.current.language,
      theme: settingsRef.current.theme,
      settings: settingsRef.current,
      version: VERSION,
      creator: CREATOR,
    }
    if (name === 'error') base.error = errorRef.current ?? undefined
    if (name === 'progress') base.progress = progressRef.current ?? undefined
    if (name === 'openRecent') base.recentFiles = settingsRef.current.recentFiles
    if (name === 'metadata') base.metadata = { title: current?.options.title ?? '', author: current?.options.author ?? '', date: current?.options.date ?? '' }
    if (name === 'stats' && current) {
      const stats = current.parsed ? documentStats(current.parsed) : { words: 0, characters: 0, headings: 0, paragraphs: 0, codeBlocks: 0, tables: 0, lists: 0, images: 0, links: 0 }
      base.stats = { ...stats, lines: current.source.split('\n').length, sourceSize: formatBytes(current.sourceBytes?.length ?? new TextEncoder().encode(current.source).length), outputSize: formatBytes(current.output?.bytes?.length ?? new TextEncoder().encode(current.output?.text ?? '').length) }
    }
    if (name === 'batch') base.batch = { files: [], to: current?.to ?? settingsRef.current.defaultTo, desktop }
    return base
  }, [desktop])

  const openDialog = useCallback((name: DialogName, extra?: Partial<DialogPayload>) => {
    const payload = { ...dialogPayload(name), ...extra }
    if (window.electronDialogApi) {
      window.electronDialogApi.open(name, payload).then((opened) => {
        if (!opened) { setInPagePayload(payload); setDialog(name) }
      }).catch(() => { setInPagePayload(payload); setDialog(name) })
      return
    }
    setInPagePayload(payload)
    setDialog(name)
  }, [dialogPayload])
  useEffect(() => { openDialogRef.current = openDialog }, [openDialog])

  const closeDialog = useCallback((name?: DialogName) => {
    if (window.electronDialogApi) { void window.electronDialogApi.close(name); return }
    setDialog(null)
  }, [])

  /* ----------------------------------------------------------- progress */

  const showProgress = useCallback((value: DialogPayload['progress']) => {
    setProgress(value)
    progressRef.current = value
    openDialogRef.current('progress', { progress: value })
  }, [])
  const hideProgress = useCallback(() => {
    setProgress(null)
    progressRef.current = null
    progressCancel.current = null
    closeDialog('progress')
  }, [closeDialog])

  /** Runs a slow job under the progress popup, which appears only when the job outlasts a short grace period. */
  const withProgress = useCallback(async <T,>(title: string, detail: string, job: (update: (value: number, detail?: string) => void) => Promise<T>, cancellable: (() => void) | null = null): Promise<T> => {
    let shown = false
    let current: DialogPayload['progress'] = { title, detail, value: -1, cancellable: Boolean(cancellable), done: false }
    const timer = window.setTimeout(() => { shown = true; showProgress(current) }, 350)
    progressCancel.current = cancellable
    const update = (value: number, nextDetail?: string) => {
      current = { ...current!, value, detail: nextDetail ?? current!.detail }
      if (shown) showProgress(current)
    }
    try {
      return await job(update)
    } finally {
      window.clearTimeout(timer)
      if (shown) hideProgress()
      progressCancel.current = null
    }
  }, [hideProgress, showProgress])

  /* --------------------------------------------------------- documents */

  /**
   * Every change to the document list goes through here so `docsRef` is
   * updated in the same tick. Imperative code — a conversion started right
   * after a format change, the automation hook, a menu command — reads the
   * ref, and a ref refreshed only after the next render would hand it the
   * previous document.
   */
  const mutateDocs = useCallback((updater: (current: DocState[]) => DocState[]) => {
    const next = updater(docsRef.current)
    docsRef.current = next
    setDocs(next)
  }, [])

  const updateDoc = useCallback((id: string, updater: (doc: DocState) => DocState) => {
    mutateDocs((current) => current.map((doc) => (doc.id === id ? updater(doc) : doc)))
  }, [mutateDocs])

  const note = useCallback((key: string, params?: Record<string, string | number>) => {
    setStatus(t(settingsRef.current.language, key, params))
  }, [])

  const renderPdf = useCallback(async (html: string, options: WriterOptions) => {
    if (!window.electronPrintApi) throw new Error(t(settingsRef.current.language, 'pdfNeedsDesktop'))
    const result = await window.electronPrintApi.pdf({ html, landscape: options.landscape, pageSize: options.pageSize })
    if (!result.ok || !result.base64) throw new Error(result.message || 'PDF failed')
    return Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))
  }, [])

  const runConvert = useCallback(async (id: string) => {
    const doc = docsRef.current.find((item) => item.id === id)
    if (!doc) return
    const version = doc.version + 1
    updateDoc(id, (item) => ({ ...item, converting: true, version }))
    const started = performance.now()
    try {
      let parsed: Doc | null = null
      let output: ConvertOutput
      parsed = await readDocument({ format: doc.from, text: doc.sourceBytes ? undefined : doc.source, bytes: doc.sourceBytes })
      output = await writeDocument(parsed, doc.to, doc.options, { renderPdf: desktop ? renderPdf : undefined, loadFont: loadBundledFont })
      const ms = Math.round(performance.now() - started)
      const latest = docsRef.current.find((item) => item.id === id)
      if (!latest || latest.version !== version) return
      updateDoc(id, (item) => ({ ...item, converting: false, output, outputError: null, convertMs: ms, parsed }))
      if (activeIdRef.current === id) note('converted', { ms })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      updateDoc(id, (item) => ({ ...item, converting: false, outputError: message }))
      if (activeIdRef.current === id) note('convertFailed')
      reportErrorRef.current(t(settingsRef.current.language, 'errorConvert'), err)
    }
  }, [desktop, note, renderPdf, updateDoc])
  const runConvertRef = useRef(runConvert)
  useEffect(() => { runConvertRef.current = runConvert }, [runConvert])

  const scheduleConvert = useCallback((id: string, immediate = false) => {
    const timers = convertTimers.current
    window.clearTimeout(timers.get(id))
    if (immediate) {
      void runConvertRef.current(id)
      return
    }
    if (!settingsRef.current.autoConvert) return
    timers.set(id, window.setTimeout(() => void runConvertRef.current(id), settingsRef.current.autoConvertDelay))
  }, [])

  const createDoc = useCallback((partial: Partial<DocState> & { source?: string }): DocState => {
    const current = settingsRef.current
    const base = { source: partial.source ?? '', from: partial.from ?? current.defaultFrom, to: partial.to ?? current.defaultTo, options: partial.options ?? { ...current.writerDefaults } }
    const doc: DocState = {
      id: newId(),
      name: `${t(current.language, 'untitled')} ${docsRef.current.length + 1}`,
      path: null,
      isProject: false,
      source: '',
      from: current.defaultFrom,
      to: current.defaultTo,
      options: { ...current.writerDefaults },
      saved: partial.saved ?? base,
      dirty: false,
      output: null,
      outputError: null,
      converting: false,
      convertMs: 0,
      history: createHistory<EditState>(),
      cursor: { line: 1, col: 1 },
      parsed: null,
      version: 0,
      ...partial,
    }
    // A restored session may carry a "dirty" flag; otherwise it follows the saved state.
    if (partial.dirty === undefined) doc.dirty = isModified(doc)
    return doc
  }, [])

  const addDoc = useCallback((doc: DocState, convertNow = true) => {
    mutateDocs((current) => [...current, doc])
    activeIdRef.current = doc.id
    setActiveId(doc.id)
    if (convertNow) window.setTimeout(() => void runConvertRef.current(doc.id), 0)
  }, [mutateDocs])

  const newDocument = useCallback(() => {
    addDoc(createDoc({}), false)
    note('ready')
  }, [addDoc, createDoc, note])

  const rememberRecent = useCallback((path: string, name: string, format: FormatId) => {
    if (!path) return
    setSettings((current) => ({ ...current, recentFiles: addRecent(current.recentFiles, { path, name, format, at: Date.now() }), lastOpenDirectory: directoryOf(path) || current.lastOpenDirectory }))
  }, [])

  /** Turns an opened file into a document tab. */
  const openFile = useCallback(async (file: OpenedFile, explicitFormat?: FormatId) => {
    const existing = file.path ? docsRef.current.find((doc) => doc.path === file.path) : undefined
    if (existing) {
      activate(existing.id)
      return
    }
    if (isProjectName(file.name) && file.text !== undefined) {
      const project = parseProject(file.text)
      const doc = createDoc({
        name: stripExtension(file.name),
        path: file.path || null,
        isProject: true,
        source: project.source,
        sourceBytes: project.sourceBase64 ? Uint8Array.from(atob(project.sourceBase64), (c) => c.charCodeAt(0)) : undefined,
        from: project.from,
        to: project.to,
        options: normalizeOptions(project.options),
      })
      addDoc(doc)
      rememberRecent(file.path, file.name, project.from)
      note('opened', { name: file.name })
      return
    }
    const format = explicitFormat ?? formatForFile(file.name)
    const binary = getFormat(format).read === 'binary'
    const doc = createDoc({
      name: file.name,
      path: file.path || null,
      source: binary ? '' : file.text ?? (file.bytes ? new TextDecoder().decode(file.bytes) : ''),
      sourceBytes: binary ? file.bytes ?? new TextEncoder().encode(file.text ?? '') : undefined,
      from: format,
      to: settingsRef.current.defaultTo === format ? (format === 'html' ? 'markdown' : 'html') : settingsRef.current.defaultTo,
    })
    addDoc(doc)
    rememberRecent(file.path, file.name, format)
    note('opened', { name: file.name })
  }, [activate, addDoc, createDoc, note, rememberRecent])

  const openFilesWithDialog = useCallback(async () => {
    try {
      const result = await openFiles({
        defaultPath: settingsRef.current.lastOpenDirectory || undefined,
        filters: [
          { name: 'Documents', extensions: [PROJECT_EXTENSION, ...readableFormats.flatMap((format) => format.extensions)] },
          { name: 'My Document Converter Project', extensions: [PROJECT_EXTENSION] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      if (result.canceled) {
        if (result.message) reportErrorRef.current(t(settingsRef.current.language, 'errorOpen'), new Error(result.message))
        return
      }
      if (result.directory) setSettings((current) => ({ ...current, lastOpenDirectory: result.directory! }))
      await withProgress(t(settingsRef.current.language, 'progressOpening'), result.files.map((file) => file.name).join(', '), async (update) => {
        for (let index = 0; index < result.files.length; index += 1) {
          update(index / result.files.length, result.files[index].name)
          await openFile(result.files[index])
        }
      })
    } catch (err) {
      reportErrorRef.current(t(settingsRef.current.language, 'errorOpen'), err)
    }
  }, [openFile, withProgress])

  const openPath = useCallback(async (path: string, format?: FormatId) => {
    try {
      const file = await withProgress(t(settingsRef.current.language, 'progressOpening'), baseName(path), () => readPath(path))
      if (!file) throw new Error(`Cannot read ${path}`)
      await openFile(file, format)
    } catch (err) {
      setSettings((current) => ({ ...current, recentFiles: removeRecent(current.recentFiles, path) }))
      reportErrorRef.current(t(settingsRef.current.language, 'errorOpen'), err)
    }
  }, [openFile, withProgress])

  // Files handed over by the OS: double-clicked .mdcv, "Open with", second instance.
  useEffect(() => window.electronFileApi?.onOpenPaths((paths) => {
    for (const path of paths) void openPath(path)
  }), [openPath])

  const openUrl = useCallback(async (url: string, format: 'auto' | FormatId) => {
    const id = `url-${Date.now()}`
    try {
      if (window.electronUrlApi) {
        const api = window.electronUrlApi
        const result = await withProgress(t(settingsRef.current.language, 'progressDownloading'), url, async (update) => {
          const off = api.onProgress((info) => {
            if (info.id !== id) return
            update(info.total ? info.received / info.total : -1, `${formatBytes(info.received)}${info.total ? ` / ${formatBytes(info.total)}` : ''}`)
          })
          try {
            return await api.fetch(id, url)
          } finally {
            off()
          }
        }, () => void api.cancel(id))
        if (!result.ok) throw new Error(result.message || 'Fetch failed')
        const name = result.name && /\.[a-z0-9]+$/i.test(result.name) ? result.name : `${result.name || 'document'}.${result.contentType?.includes('html') ? 'html' : 'md'}`
        await openFile({ name, path: '', size: 0, text: result.text, bytes: result.base64 ? Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0)) : undefined }, format === 'auto' ? undefined : format)
        return
      }
      const response = await withProgress(t(settingsRef.current.language, 'progressDownloading'), url, () => fetch(url))
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const type = response.headers.get('content-type') ?? ''
      const name = baseName(new URL(url).pathname) || `document.${type.includes('html') ? 'html' : 'md'}`
      const textual = /^text\/|json|xml/.test(type) || /\.(md|markdown|txt|html?|rst|tex|org|adoc|wiki|textile|json|csv|tsv|ipynb|rtf)$/i.test(name)
      await openFile({ name: /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${type.includes('html') ? 'html' : 'md'}`, path: '', size: 0, text: textual ? await response.text() : undefined, bytes: textual ? undefined : new Uint8Array(await response.arrayBuffer()) }, format === 'auto' ? undefined : format)
    } catch (err) {
      reportErrorRef.current(t(settingsRef.current.language, 'errorUrl'), err)
    }
  }, [openFile, withProgress])

  /* ------------------------------------------------------------- saving */

  const saveDoc = useCallback(async (doc: DocState, mode: 'save' | 'saveAs' | 'project'): Promise<boolean> => {
    try {
      const lang = settingsRef.current.language
      const asProject = mode === 'project' || (mode !== 'saveAs' && doc.isProject) || Boolean(doc.sourceBytes && mode === 'save' && !doc.path)
      const wantsProject = asProject || (mode === 'saveAs' && doc.isProject)
      const content = wantsProject
        ? { text: serializeProject({ name: doc.name, from: doc.from, to: doc.to, source: doc.source, sourceBase64: doc.sourceBytes ? bytesToBase64(doc.sourceBytes) : undefined, sourceName: doc.sourceBytes ? doc.name : undefined, options: doc.options }) }
        : doc.sourceBytes ? { bytes: doc.sourceBytes } : { text: doc.source }
      let path = doc.path
      if (mode !== 'save' || !path || (wantsProject !== doc.isProject)) {
        const ext = wantsProject ? PROJECT_EXTENSION : getFormat(doc.from).extensions[0]
        const fileName = `${stripExtension(doc.name)}.${ext}`
        const filters = wantsProject
          ? [{ name: 'My Document Converter Project', extensions: [PROJECT_EXTENSION] }]
          : [{ name: formatName(doc.from, lang), extensions: getFormat(doc.from).extensions }, { name: 'All Files', extensions: ['*'] }]
        const result = await withProgress(t(lang, 'progressSaving'), fileName, () => saveFileAs({ fileName, defaultDirectory: settingsRef.current.lastSaveDirectory || (doc.path ? directoryOf(doc.path) : '') || undefined, filters, ...content, mime: wantsProject ? 'application/json' : getFormat(doc.from).mime }))
        if (result.canceled) {
          if (result.message) throw new Error(result.message)
          return false
        }
        path = result.path ?? path
        if (result.directory) setSettings((current) => ({ ...current, lastSaveDirectory: result.directory! }))
      } else {
        const result = await withProgress(t(lang, 'progressSaving'), doc.name, () => writePath(path!, content))
        if (result.canceled) throw new Error(result.message || 'Write failed')
      }
      const name = path ? baseName(path) : doc.name
      updateDoc(doc.id, (item) => ({ ...item, path, name: wantsProject ? stripExtension(name) : name, isProject: wantsProject, saved: editState(item), dirty: false }))
      if (path) rememberRecent(path, name, doc.from)
      note('saved', { name })
      return true
    } catch (err) {
      reportErrorRef.current(t(settingsRef.current.language, 'errorSave'), err)
      return false
    }
  }, [note, rememberRecent, updateDoc, withProgress])

  const exportOutput = useCallback(async (doc: DocState) => {
    try {
      const lang = settingsRef.current.language
      let output = doc.output
      if (!output || doc.outputError) {
        await runConvertRef.current(doc.id)
        output = docsRef.current.find((item) => item.id === doc.id)?.output ?? null
      }
      if (!output) return
      if (doc.to === 'pdf' && !output.bytes) {
        openDialogRef.current('print', await printPayload())
        note('webPdfHint')
        return
      }
      const format = getFormat(doc.to)
      const fileName = `${stripExtension(doc.name)}.${output.extension}`
      const result = await withProgress(t(lang, 'progressSaving'), fileName, () => saveFileAs({
        fileName,
        defaultDirectory: settingsRef.current.lastExportDirectory || settingsRef.current.lastSaveDirectory || undefined,
        filters: [{ name: format.names[lang], extensions: format.extensions }, { name: 'All Files', extensions: ['*'] }],
        text: output!.text,
        bytes: output!.bytes,
        mime: format.mime,
      }))
      if (result.canceled) {
        if (result.message) throw new Error(result.message)
        return
      }
      if (result.directory) setSettings((current) => ({ ...current, lastExportDirectory: result.directory! }))
      note('exported', { name: result.path ? baseName(result.path) : fileName })
    } catch (err) {
      reportErrorRef.current(t(settingsRef.current.language, 'errorSave'), err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, withProgress])

  /* ------------------------------------------------------------ closing */

  const pendingClose = useRef<{ ids: string[]; then: 'close' | 'quit' } | null>(null)

  const removeDocs = useCallback((ids: string[]) => {
    const current = docsRef.current
    const remaining = current.filter((doc) => !ids.includes(doc.id))
    if (activeIdRef.current && ids.includes(activeIdRef.current)) {
      const index = current.findIndex((doc) => doc.id === activeIdRef.current)
      const next = remaining[Math.min(index, remaining.length - 1)] ?? null
      activeIdRef.current = next?.id ?? null
      setActiveId(next?.id ?? null)
    }
    mutateDocs(() => remaining)
    note('closedTab')
  }, [mutateDocs, note])

  const closeDocs = useCallback((ids: string[], then: 'close' | 'quit' = 'close') => {
    const dirty = docsRef.current.filter((doc) => ids.includes(doc.id) && doc.dirty)
    if (dirty.length && settingsRef.current.confirmClose) {
      pendingClose.current = { ids, then }
      openDialogRef.current('unsaved', { unsaved: { names: dirty.map((doc) => doc.name) } })
      return
    }
    if (then === 'quit') { void window.electronWindowApi?.forceClose(); return }
    removeDocs(ids)
  }, [removeDocs])

  const finishClose = useCallback(async (action: 'save' | 'discard' | 'cancel') => {
    const pending = pendingClose.current
    pendingClose.current = null
    if (!pending || action === 'cancel') return
    if (action === 'save') {
      for (const doc of docsRef.current.filter((item) => pending.ids.includes(item.id) && item.dirty)) {
        const ok = await saveDoc(doc, 'save')
        if (!ok) return
      }
    }
    if (pending.then === 'quit') { void window.electronWindowApi?.forceClose(); return }
    removeDocs(pending.ids)
  }, [removeDocs, saveDoc])

  useEffect(() => window.electronWindowApi?.onCloseRequest(() => {
    closeDocs(docsRef.current.map((doc) => doc.id), 'quit')
  }), [closeDocs])

  useEffect(() => {
    if (desktop) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (docsRef.current.some((doc) => doc.dirty) && settingsRef.current.confirmClose) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [desktop])

  /* ------------------------------------------------------------ editing */

  const applyEdit = useCallback((id: string, label: string, changes: Partial<EditState>, coalesce = false) => {
    updateDoc(id, (doc) => {
      const next = { ...doc, ...changes, history: pushHistory(doc.history, editState(doc), label, coalesce) }
      return { ...next, dirty: isModified(next) }
    })
    scheduleConvert(id, !coalesce)
  }, [scheduleConvert, updateDoc])

  const setSource = useCallback((id: string, source: string, label = 'labelTyping') => {
    applyEdit(id, label, { source }, label === 'labelTyping')
  }, [applyEdit])

  const setOptions = useCallback((id: string, patch: Partial<WriterOptions>) => {
    const doc = docsRef.current.find((item) => item.id === id)
    if (!doc) return
    applyEdit(id, 'labelOption', { options: { ...doc.options, ...patch } })
  }, [applyEdit])

  const setFormats = useCallback((id: string, patch: { from?: FormatId; to?: FormatId }) => {
    applyEdit(id, 'labelFormat', patch)
  }, [applyEdit])

  const doUndo = useCallback(() => {
    const doc = docsRef.current.find((item) => item.id === activeIdRef.current)
    if (!doc) return
    const result = undoHistory(doc.history, editState(doc))
    if (!result) { note('nothingToUndo'); return }
    updateDoc(doc.id, (item) => { const next = { ...item, ...result.state, history: result.history }; return { ...next, dirty: isModified(next) } })
    scheduleConvert(doc.id, true)
    note('undone', { label: t(settingsRef.current.language, result.label) })
  }, [note, scheduleConvert, updateDoc])

  const doRedo = useCallback(() => {
    const doc = docsRef.current.find((item) => item.id === activeIdRef.current)
    if (!doc) return
    const result = redoHistory(doc.history, editState(doc))
    if (!result) { note('nothingToRedo'); return }
    updateDoc(doc.id, (item) => { const next = { ...item, ...result.state, history: result.history }; return { ...next, dirty: isModified(next) } })
    scheduleConvert(doc.id, true)
    note('redone', { label: t(settingsRef.current.language, result.label) })
  }, [note, scheduleConvert, updateDoc])

  /* ---------------------------------------------------------- clipboard */

  const clipboard = useCallback(async (action: 'cut' | 'copy' | 'paste' | 'selectAll') => {
    const doc = docsRef.current.find((item) => item.id === activeIdRef.current)
    const area = editorRef.current
    try {
      if (action === 'selectAll') { area?.focus(); area?.select(); return }
      if (!doc || !area || doc.sourceBytes) return
      const start = area.selectionStart
      const end = area.selectionEnd
      if (action === 'copy' || action === 'cut') {
        const selected = start === end ? area.value : area.value.slice(start, end)
        const ok = await copyText(selected)
        if (!ok) throw new Error('clipboard write refused')
        if (action === 'cut') {
          const next = start === end ? '' : area.value.slice(0, start) + area.value.slice(end)
          setSource(doc.id, next, 'labelReplace')
        }
        note('copiedText')
        return
      }
      const text = await navigator.clipboard.readText()
      const next = area.value.slice(0, start) + text + area.value.slice(end)
      setSource(doc.id, next, 'labelPaste')
      window.setTimeout(() => { area.focus(); area.setSelectionRange(start + text.length, start + text.length) }, 0)
      note('pasted')
    } catch (err) {
      reportErrorRef.current(t(settingsRef.current.language, 'errorClipboard'), err)
    }
  }, [note, setSource])

  /* ----------------------------------------------------------- printing */

  const printPayload = useCallback(async (): Promise<Partial<DialogPayload>> => {
    const lang = settingsRef.current.language
    const documents: PrintDocument[] = []
    for (const doc of docsRef.current) {
      let html = ''
      try {
        const parsed = doc.parsed ?? await readDocument({ format: doc.from, text: doc.sourceBytes ? undefined : doc.source, bytes: doc.sourceBytes })
        html = htmlBody(parsed, { ...doc.options, standalone: true })
      } catch {
        html = `<pre>${doc.source.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
      }
      const sourceText = doc.sourceBytes ? doc.output?.text ?? '' : doc.source
      documents.push({ name: doc.name, html, sourceHtml: `<h2>${doc.name}</h2><pre>${sourceText.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>` })
    }
    const current = docsRef.current.findIndex((doc) => doc.id === activeIdRef.current)
    const options = docsRef.current[current]?.options ?? settingsRef.current.writerDefaults
    let printers: { name: string; displayName: string; isDefault: boolean }[] = []
    if (window.electronPrintApi) printers = await withProgress(t(lang, 'progressPrinting'), '', () => window.electronPrintApi!.printers())
    return { print: { documents, current: Math.max(0, current), printers, pageSize: options.pageSize, landscape: options.landscape, marginMm: options.marginMm, desktop: Boolean(window.electronPrintApi) } }
  }, [withProgress])

  const openPrint = useCallback(async () => {
    if (!docsRef.current.length) return
    openDialogRef.current('print', await printPayload())
  }, [printPayload])

  /* ------------------------------------------------------ dialog results */

  const applyDialogResult = useCallback(async (name: DialogName, result: DialogResult) => {
    const doc = docsRef.current.find((item) => item.id === activeIdRef.current)
    switch (name) {
      case 'settings':
        if (result.action === 'settings') setSettings((current) => ({ ...current, ...(result.settings as Partial<AppSettings>) }))
        if (result.action === 'backgroundChanged') void loadBackground()
        if (result.action === 'resetSettings') {
          localStorage.clear()
          setSettings({ ...loadSettings(), recentFiles: [] })
          closeDialog('settings')
        }
        return
      case 'unsaved':
        await finishClose(result.action as 'save' | 'discard' | 'cancel')
        return
      case 'progress':
        if (result.action === 'cancel') progressCancel.current?.()
        return
      case 'print':
        if (result.action === 'print' && window.electronPrintApi) {
          const response = await window.electronPrintApi.print({ html: String(result.html), deviceName: String(result.deviceName || ''), copies: Number(result.copies) || 1, landscape: Boolean(result.landscape), pageSize: String(result.pageSize), pages: String(result.pages || '') })
          if (!response.ok) reportErrorRef.current(t(settingsRef.current.language, 'errorPrint'), new Error(response.message || 'print failed'))
          else note('printed')
        }
        return
      case 'openRecent':
        if (result.action === 'open') void openPath(String(result.path))
        if (result.action === 'forget') setSettings((current) => ({ ...current, recentFiles: removeRecent(current.recentFiles, String(result.path)) }))
        if (result.action === 'clear') setSettings((current) => ({ ...current, recentFiles: [] }))
        return
      case 'openUrl':
        if (result.action === 'fetch') void openUrl(String(result.url), result.format as 'auto' | FormatId)
        return
      case 'metadata':
        if (result.action === 'metadata' && doc) setOptions(doc.id, { title: String(result.title ?? ''), author: String(result.author ?? ''), date: String(result.date ?? '') })
        return
      case 'batch':
        if (result.action === 'batchDone') {
          if (result.directory) setSettings((current) => ({ ...current, lastBatchDirectory: String(result.directory) }))
          note('batchDone', { count: Number(result.count), directory: String(result.directory || 'ZIP') })
        }
        return
      default:
        return
    }
  }, [closeDialog, finishClose, loadBackground, note, openPath, openUrl, setOptions])
  const applyDialogResultRef = useRef(applyDialogResult)
  useEffect(() => { applyDialogResultRef.current = applyDialogResult }, [applyDialogResult])

  useEffect(() => window.electronDialogApi?.onResult(({ name, result }) => {
    void applyDialogResultRef.current(name as DialogName, result as DialogResult)
  }), [])

  useEffect(() => window.electronDialogApi?.onClosed?.((name) => {
    if (name === 'unsaved' && pendingClose.current) pendingClose.current = null
    if (name === 'progress') progressCancel.current?.()
  }), [])

  /* ----------------------------------------------------------- commands */

  const isCommandActive = useCallback((id: string) => {
    const doc = docsRef.current.find((item) => item.id === activeIdRef.current)
    const s = settingsRef.current
    if (id === `${THEME_PREFIX}${s.theme}`) return true
    if (id === `lang.${s.language}`) return true
    if (id === `view.${s.viewMode}`) return true
    if (id === 'view.leftPanel') return s.leftPanel
    if (id === 'view.rightPanel') return s.rightPanel
    if (id === 'view.wordWrap') return s.wordWrap
    if (id === 'view.lineNumbers') return s.lineNumbers
    if (id === 'convert.autoConvert') return s.autoConvert
    if (doc && id === `${FROM_PREFIX}${doc.from}`) return true
    if (doc && id === `${TO_PREFIX}${doc.to}`) return true
    return false
  }, [])

  const isCommandDisabled = useCallback((id: string) => {
    const doc = docsRef.current.find((item) => item.id === activeIdRef.current)
    const needsDoc = ['file.save', 'file.saveAs', 'file.saveProject', 'file.export', 'file.print', 'file.closeTab', 'file.closeAll', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.selectAll', 'edit.copyOutput', 'edit.metadata', 'convert.run', 'convert.swap', 'convert.useOutputAsSource', 'tools.stats', 'ctx.cut', 'ctx.copy', 'ctx.paste', 'ctx.selectAll', 'ctx.convert', 'ctx.copyOutput', 'ctx.stats', 'ctx.closeTab']
    if (needsDoc.includes(id) && !doc) return true
    if ((id === 'edit.undo' || id === 'ctx.undo') && !(doc && doc.history.undo.length)) return true
    if ((id === 'edit.redo' || id === 'ctx.redo') && !(doc && doc.history.redo.length)) return true
    if ((id === 'edit.cut' || id === 'edit.paste' || id === 'ctx.cut' || id === 'ctx.paste') && doc?.sourceBytes) return true
    if (id === 'tools.showInFolder' && !(doc?.path && desktop)) return true
    if (id === 'tools.clearBackground' && !settingsRef.current.hasBackgroundImage) return true
    if (id === 'recent.none') return true
    return false
  }, [desktop])

  const runCommand = useCallback((id: string) => {
    setMenu(null)
    setContextAt(null)
    const doc = docsRef.current.find((item) => item.id === activeIdRef.current)
    if (id.startsWith(RECENT_FORGET_PREFIX)) {
      const path = id.slice(RECENT_FORGET_PREFIX.length)
      setSettings((current) => ({ ...current, recentFiles: removeRecent(current.recentFiles, path) }))
      return
    }
    if (id.startsWith(RECENT_PREFIX)) { void openPath(id.slice(RECENT_PREFIX.length)); return }
    if (id.startsWith(THEME_PREFIX)) {
      const theme = id.slice(THEME_PREFIX.length) as AppSettings['theme']
      setSettings((current) => ({ ...current, theme }))
      note('themeChanged', { name: themeLabel(settingsRef.current.language, theme) })
      return
    }
    if (id.startsWith(FROM_PREFIX) && doc) { setFormats(doc.id, { from: id.slice(FROM_PREFIX.length) as FormatId }); return }
    if (id.startsWith(TO_PREFIX) && doc) { setFormats(doc.id, { to: id.slice(TO_PREFIX.length) as FormatId }); return }
    switch (id) {
      case 'file.new': newDocument(); return
      case 'file.open': void openFilesWithDialog(); return
      case 'file.openUrl': openDialog('openUrl'); return
      case 'file.recentList': openDialog('openRecent'); return
      case 'recent.clear': setSettings((current) => ({ ...current, recentFiles: [] })); return
      case 'file.save': if (doc) void saveDoc(doc, 'save'); return
      case 'file.saveAs': if (doc) void saveDoc(doc, 'saveAs'); return
      case 'file.saveProject': if (doc) void saveDoc(doc, 'project'); return
      case 'file.export': if (doc) void exportOutput(doc); return
      case 'file.batch': openDialog('batch'); return
      case 'file.print': void openPrint(); return
      case 'file.closeTab': case 'ctx.closeTab': if (doc) closeDocs([doc.id]); return
      case 'file.closeAll': closeDocs(docsRef.current.map((item) => item.id)); return
      case 'file.exit': if (window.electronWindowApi) void window.electronWindowApi.close(); else window.close(); return
      case 'edit.undo': case 'ctx.undo': doUndo(); return
      case 'edit.redo': case 'ctx.redo': doRedo(); return
      case 'edit.cut': case 'ctx.cut': void clipboard('cut'); return
      case 'edit.copy': case 'ctx.copy': void clipboard('copy'); return
      case 'edit.paste': case 'ctx.paste': void clipboard('paste'); return
      case 'edit.selectAll': case 'ctx.selectAll': void clipboard('selectAll'); return
      case 'edit.copyOutput': case 'ctx.copyOutput':
        if (doc?.output) void copyText(doc.output.text ?? (doc.output.bytes ? bytesToBase64(doc.output.bytes) : '')).then((ok) => { if (ok) note('copiedOutput'); else reportErrorRef.current(t(settingsRef.current.language, 'errorClipboard'), new Error('write refused')) })
        return
      case 'edit.metadata': openDialog('metadata'); return
      case 'edit.preferences': case 'tools.settings': openDialog('settings'); return
      case 'view.source': case 'view.split': case 'view.output': setSettings((current) => ({ ...current, viewMode: id.slice(5) as ViewMode })); return
      case 'view.leftPanel': setSettings((current) => ({ ...current, leftPanel: !current.leftPanel })); return
      case 'view.rightPanel': setSettings((current) => ({ ...current, rightPanel: !current.rightPanel })); return
      case 'view.zoomIn': setSettings((current) => ({ ...current, zoom: Math.min(300, current.zoom + 10) })); return
      case 'view.zoomOut': setSettings((current) => ({ ...current, zoom: Math.max(50, current.zoom - 10) })); return
      case 'view.zoomReset': setSettings((current) => ({ ...current, zoom: 100 })); return
      case 'view.wordWrap': setSettings((current) => ({ ...current, wordWrap: !current.wordWrap })); return
      case 'view.lineNumbers': setSettings((current) => ({ ...current, lineNumbers: !current.lineNumbers })); return
      case 'view.refresh': if (doc) scheduleConvert(doc.id, true); return
      case 'view.nextTheme': {
        const index = themes.findIndex((item) => item.id === settingsRef.current.theme)
        const theme = themes[(index + 1) % themes.length].id as AppSettings['theme']
        setSettings((current) => ({ ...current, theme }))
        note('themeChanged', { name: themeLabel(settingsRef.current.language, theme) })
        return
      }
      case 'lang.ko': case 'lang.en': setSettings((current) => ({ ...current, language: id === 'lang.ko' ? 'ko' : 'en' })); return
      case 'convert.run': case 'ctx.convert': if (doc) { note('converting'); scheduleConvert(doc.id, true) } return
      case 'convert.swap': if (doc && getFormat(doc.to).read && getFormat(doc.from).write && !doc.sourceBytes) setFormats(doc.id, { from: doc.to, to: doc.from }); return
      case 'convert.autoConvert': setSettings((current) => ({ ...current, autoConvert: !current.autoConvert })); return
      case 'convert.useOutputAsSource':
        if (doc?.output && getFormat(doc.to).read === 'text' && doc.output.text !== undefined) {
          addDoc(createDoc({ name: `${stripExtension(doc.name)}.${doc.output.extension}`, source: doc.output.text, from: doc.to, to: doc.from === doc.to ? settingsRef.current.defaultTo : doc.from, options: { ...doc.options } }))
        }
        return
      case 'convert.formats': openDialog('formats'); return
      case 'tools.stats': case 'ctx.stats': if (doc) openDialog('stats'); return
      case 'tools.showInFolder': if (doc?.path) void window.electronFileApi?.showInFolder(doc.path); return
      case 'tools.background': openDialog('settings'); return
      case 'tools.clearBackground': setSettings((current) => ({ ...current, hasBackgroundImage: false })); return
      case 'help.shortcuts': openDialog('shortcuts'); return
      case 'help.about': openDialog('about'); return
      default: return
    }
  }, [addDoc, clipboard, closeDocs, createDoc, doRedo, doUndo, exportOutput, newDocument, note, openDialog, openFilesWithDialog, openPath, openPrint, saveDoc, scheduleConvert, setFormats])
  useEffect(() => { runCommandRef.current = runCommand }, [runCommand])

  useEffect(() => window.electronMenuApi?.onChosen((id) => runCommandRef.current(id)), [])

  /* ------------------------------------------------------------ menus */

  const commandLabel = useCallback((command: AppCommand) => {
    const lang = settingsRef.current.language
    if (command.id.startsWith(THEME_PREFIX)) return themeLabel(lang, command.id.slice(THEME_PREFIX.length))
    if (command.id.startsWith(FROM_PREFIX)) return formatName(command.id.slice(FROM_PREFIX.length), lang)
    if (command.id.startsWith(TO_PREFIX)) return formatName(command.id.slice(TO_PREFIX.length), lang)
    if (command.id.startsWith(RECENT_PREFIX)) return command.label
    return t(lang, command.label)
  }, [])

  const menuPayload = useCallback((id: MenuId) => {
    const rows = id === 'file' ? fileMenuWithRecents(settingsRef.current.recentFiles, { file: FileText, clear: X }) : commandsInMenu(id)
    const overrides: Record<string, string> = {}
    for (const command of rows) {
      const label = commandLabel(command)
      if (label !== t(settingsRef.current.language, command.label)) overrides[command.id] = label
    }
    const all = [...commandsInMenu(id), ...rows]
    return {
      menu: id,
      language: settingsRef.current.language,
      theme: settingsRef.current.theme,
      active: all.filter((command) => isCommandActive(command.id)).map((command) => command.id),
      disabled: all.filter((command) => isCommandDisabled(command.id)).map((command) => command.id),
      overrides,
      recentFiles: settingsRef.current.recentFiles,
    }
  }, [commandLabel, isCommandActive, isCommandDisabled])

  const openMenuWindow = useCallback(async (id: MenuId, anchor: { x: number; y: number; width: number; height: number }) => {
    if (!window.electronMenuApi) return false
    try {
      return await window.electronMenuApi.open(menuPayload(id), anchor)
    } catch {
      return false
    }
  }, [menuPayload])

  const openMenu = useCallback((id: MenuId, anchor: HTMLElement) => {
    hideTooltip()
    if (menu === id) { setMenu(null); void window.electronMenuApi?.close(); return }
    const box = anchor.getBoundingClientRect()
    setMenuAnchor(anchor)
    void openMenuWindow(id, { x: window.screenX + box.left, y: window.screenY + box.bottom + 2, width: box.width, height: box.height }).then((opened) => {
      if (!opened) setMenu(id)
    })
  }, [hideTooltip, menu, openMenuWindow])

  const openContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    const x = event.clientX
    const y = event.clientY
    void openMenuWindow('context', { x: window.screenX + x, y: window.screenY + y, width: 0, height: 0 }).then((opened) => {
      if (!opened) { setContextAt({ x, y }); setMenu('context') }
    })
  }, [openMenuWindow])

  /* ------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const inEditor = document.activeElement === editorRef.current
      const run = (id: string) => { event.preventDefault(); runCommandRef.current(id) }
      if (event.key === 'F9') return run('convert.run')
      if (event.key === 'F5') return run('view.refresh')
      if (event.key === 'F1') return run('help.shortcuts')
      if (event.key === 'Escape') { setMenu(null); setContextAt(null); return }
      if (!ctrl) return
      if (key === 'n') return run('file.new')
      if (key === 'o') return run(event.shiftKey ? 'file.openUrl' : 'file.open')
      if (key === 's') return run(event.shiftKey ? 'file.saveAs' : 'file.save')
      if (key === 'e') return run('file.export')
      if (key === 'b') return run('file.batch')
      if (key === 'p') return run('file.print')
      if (key === 'w') return run(event.shiftKey ? 'file.closeAll' : 'file.closeTab')
      if (key === 'z' && !event.shiftKey) return run('edit.undo')
      if (key === 'y' || (key === 'z' && event.shiftKey)) return run('edit.redo')
      if (key === 'c' && event.shiftKey) return run('edit.copyOutput')
      if (key === 'x' && event.shiftKey) return run('convert.swap')
      if (key === ',') return run('edit.preferences')
      if (key === '1') return run('view.leftPanel')
      if (key === '2') return run('view.rightPanel')
      if (key === '=' || key === '+') return run('view.zoomIn')
      if (key === '-') return run('view.zoomOut')
      if (key === '0') return run('view.zoomReset')
      if (key === 't') return run('view.nextTheme')
      // Cut/copy/paste/select-all in the editor are the browser's own; elsewhere they are ours.
      if (!inEditor && key === 'a') return run('edit.selectAll')
      if (!inEditor && key === 'c') return run('edit.copy')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Ctrl + wheel zooms the editor and the preview.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setSettings((current) => ({ ...current, zoom: Math.min(300, Math.max(50, current.zoom + (event.deltaY < 0 ? 10 : -10))) }))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  /* ------------------------------------------------------- session */

  useEffect(() => {
    if (!settingsRef.current.restoreSession) return
    const session = loadSession()
    let restored = false
    if (session && session.docs.length) {
      const list = session.docs.map((item: SessionDoc) => createDoc({ name: item.name, path: item.path, source: item.source, from: item.from, to: item.to, options: normalizeOptions(item.options), dirty: item.dirty, isProject: Boolean(item.path && isProjectName(item.path)), saved: { source: item.savedSource ?? item.source, from: item.from, to: item.to, options: normalizeOptions(item.options) } }))
      mutateDocs(() => list)
      const activeDoc = list[Math.min(session.active, list.length - 1)]
      setActiveId(activeDoc?.id ?? null)
      activeIdRef.current = activeDoc?.id ?? null
      for (const doc of list) window.setTimeout(() => void runConvertRef.current(doc.id), 0)
      restored = true
    }
    if (!restored && settingsRef.current.showWelcome) {
      const doc = createDoc({ name: 'sample.md', source: SAMPLE_MARKDOWN, from: 'markdown', to: settingsRef.current.defaultTo === 'markdown' ? 'html' : settingsRef.current.defaultTo })
      mutateDocs(() => [doc])
      setActiveId(doc.id)
      activeIdRef.current = doc.id
      window.setTimeout(() => void runConvertRef.current(doc.id), 0)
    }
    void window.electronWindowApi?.ready()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!settings.restoreSession) return
    const timer = window.setTimeout(() => {
      saveSession({
        docs: docs.filter((doc) => !doc.sourceBytes).map((doc) => ({ name: doc.name, path: doc.path, source: doc.source, savedSource: doc.saved.source, from: doc.from, to: doc.to, options: doc.options, dirty: doc.dirty })),
        active: Math.max(0, docs.findIndex((doc) => doc.id === activeId)),
      })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [docs, activeId, settings.restoreSession])

  /* ------------------------------------------------------- window */

  useEffect(() => {
    const title = active ? `${active.name}${active.dirty ? ' *' : ''} — ${APP_TITLE}` : APP_TITLE
    document.title = title
    void window.electronWindowApi?.setTitle(title)
  }, [active])

  // The toolbar never scrolls, so the window may not be narrower than it.
  useLayoutEffect(() => {
    const bar = toolbarRef.current
    if (!bar) return
    const measure = () => {
      // The row is flexible (a spacer pushes the right-hand group to the edge),
      // so its scrollWidth is whatever the window gives it; what the window may
      // not go below is the sum of the buttons themselves plus the gaps.
      const children = [...bar.children] as HTMLElement[]
      const gap = 6
      const content = children.reduce((sum, child) => sum + (child.classList.contains('tool-spacer') ? 8 : child.offsetWidth), 0) + gap * Math.max(0, children.length - 1)
      const width = Math.ceil(content + 20 + 24)
      document.documentElement.style.setProperty('--min-app-width', `${width}px`)
      void window.electronWindowApi?.setMinimumWidth(width)
    }
    measure()
    const timer = window.setTimeout(measure, 300)
    return () => window.clearTimeout(timer)
  }, [language, settings.fontFamily])

  useEffect(() => {
    void window.electronWindowApi?.isMaximized().then(setMaximized)
    const onResize = () => void window.electronWindowApi?.isMaximized().then(setMaximized)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Tab strip overflow: the < > buttons appear only when tabs do not fit.
  useEffect(() => {
    const strip = tabStripRef.current
    if (!strip) return
    const check = () => setTabOverflow(strip.scrollWidth > strip.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [docs.length, settings.leftPanel, settings.rightPanel])

  useEffect(() => {
    const strip = tabStripRef.current
    const tab = strip?.querySelector('.tab.active') as HTMLElement | null
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  /* ------------------------------------------------------- drag & drop */

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    setDropActive(false)
    const files = [...(event.dataTransfer?.files ?? [])]
    if (!files.length) return
    try {
      await withProgress(t(settingsRef.current.language, 'progressOpening'), files.map((file) => file.name).join(', '), async (update) => {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index]
          update(index / files.length, file.name)
          const path = window.electronFileApi?.pathForFile(file) ?? ''
          const opened: OpenedFile = isTextName(file.name)
            ? { name: file.name, path, size: file.size, text: await file.text() }
            : { name: file.name, path, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) }
          await openFile(opened)
        }
      })
    } catch (err) {
      reportErrorRef.current(t(settingsRef.current.language, 'errorOpen'), err)
    }
  }, [openFile, withProgress])

  /* --------------------------------------------------------- preview */

  const previewHtml = useMemo(() => {
    if (!active?.output) return ''
    const font = settings.previewFontFamily ? `body{font-family:"${settings.previewFontFamily}",serif !important;}` : ''
    const inject = `<style>html{zoom:${settings.zoom / 100};}body{font-size:${settings.previewFontSize}px;}${font}</style>`
    const html = active.output.preview
    return html.includes('</head>') ? html.replace('</head>', `${inject}</head>`) : `${inject}${html}`
  }, [active?.output, settings.zoom, settings.previewFontFamily, settings.previewFontSize])

  useEffect(() => {
    const frame = previewRef.current
    if (!frame) return
    const attach = () => {
      const win = frame.contentWindow
      if (!win) return
      win.addEventListener('wheel', (event) => {
        if (!event.ctrlKey) return
        event.preventDefault()
        setSettings((current) => ({ ...current, zoom: Math.min(300, Math.max(50, current.zoom + (event.deltaY < 0 ? 10 : -10))) }))
      }, { passive: false })
      win.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        const box = frame.getBoundingClientRect()
        const x = box.left + event.clientX * (settings.zoom / 100)
        const y = box.top + event.clientY * (settings.zoom / 100)
        void openMenuWindow('context', { x: window.screenX + x, y: window.screenY + y, width: 0, height: 0 }).then((opened) => {
          if (!opened) { setContextAt({ x, y }); setMenu('context') }
        })
      })
      win.document.addEventListener('click', (event) => {
        const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
        if (anchor && /^https?:/.test(anchor.href)) {
          event.preventDefault()
          if (window.electronFileApi) void window.electronFileApi.openExternal(anchor.href)
          else window.open(anchor.href, '_blank', 'noopener')
        }
      })
    }
    frame.addEventListener('load', attach)
    return () => frame.removeEventListener('load', attach)
  }, [openMenuWindow, previewHtml, settings.zoom])


  // A hook for the automated GUI test (scripts/smoke.mjs drives the app through it).
  useEffect(() => {
    (window as unknown as { __mdcv?: unknown }).__mdcv = {
      state: () => ({
        docs: docsRef.current.map((doc) => ({ id: doc.id, name: doc.name, from: doc.from, to: doc.to, dirty: doc.dirty, hasOutput: Boolean(doc.output), outputText: doc.output?.text ?? null, outputBytes: doc.output?.bytes?.length ?? 0, outputError: doc.outputError, converting: doc.converting, undo: doc.history.undo.length, redo: doc.history.redo.length, source: doc.source, options: doc.options, path: doc.path })),
        active: activeIdRef.current,
        settings: settingsRef.current,
        status,
        menu,
        dialog,
        tabOverflow,
      }),
      run: (id: string) => runCommandRef.current(id),
      openDialog: (name: DialogName, extra?: Partial<DialogPayload>) => openDialogRef.current(name, extra),
      closeDialogs: () => { if (window.electronDialogApi) void window.electronDialogApi.closeAll(); else setDialog(null) },
      dialogResult: (name: DialogName, result: DialogResult) => applyDialogResultRef.current(name, result),
      setSource: (text: string) => { const id = activeIdRef.current; if (id) setSource(id, text, 'labelReplace') },
      setOptions: (patch: Partial<WriterOptions>) => { const id = activeIdRef.current; if (id) setOptions(id, patch) },
      setFormats: (patch: { from?: FormatId; to?: FormatId }) => { const id = activeIdRef.current; if (id) setFormats(id, patch) },
      setSettings: (patch: Partial<AppSettings>) => setSettings((current) => ({ ...current, ...patch })),
      convert: async () => { const id = activeIdRef.current; if (id) await runConvertRef.current(id) },
      addDoc: (source: string, from: FormatId, to: FormatId, name = 'test.md') => addDoc(createDoc({ name, source, from, to })),
      openPath: (path: string) => openPath(path),
      themes: () => themes.map((item) => item.id),
      openMenu: (id: MenuId) => { const button = document.querySelector(`.menu-bar .menu-group:nth-child(${menuOrder.indexOf(id) + 1}) button`) as HTMLElement | null; if (button) openMenu(id, button) },
      closeMenu: () => { setMenu(null); void window.electronMenuApi?.close() },
      contextMenu: (x: number, y: number) => void openMenuWindow('context', { x: window.screenX + x, y: window.screenY + y, width: 0, height: 0 }),
      closeDocs: (ids: string[]) => closeDocs(ids),
      toolbar: () => [...document.querySelectorAll('.tool-bar button')].map((node) => ({ tooltip: node.getAttribute('data-tooltip') ?? '', label: node.getAttribute('aria-label') ?? '', disabled: (node as HTMLButtonElement).disabled })),
      toolbarWidth: () => { const bar = toolbarRef.current; if (!bar) return 0; const children = [...bar.children] as HTMLElement[]; return children.reduce((sum, child) => sum + (child.classList.contains('tool-spacer') ? 8 : child.offsetWidth), 0) + 6 * Math.max(0, children.length - 1) + 20 },
      query: (selector: string) => document.querySelectorAll(selector).length,
      text: (selector: string) => (document.querySelector(selector) as HTMLElement | null)?.textContent ?? null,
      click: (selector: string) => { const node = document.querySelector(selector) as HTMLElement | null; node?.click(); return Boolean(node) },
      previewText: () => previewRef.current?.contentDocument?.body?.textContent ?? null,
      formats: () => ({ readable: readableFormats.map((format) => format.id), writable: writableFormats.map((format) => format.id) }),
      outputBase64: () => { const doc = docsRef.current.find((item) => item.id === activeIdRef.current); return doc?.output?.bytes ? bytesToBase64(doc.output.bytes) : '' },
    }
  })

  /* ---------------------------------------------------------- render */

  const stats = useMemo(() => (active?.parsed ? documentStats(active.parsed) : null), [active?.parsed])
  const cursorFromArea = (area: HTMLTextAreaElement) => {
    const before = area.value.slice(0, area.selectionStart)
    const lines = before.split('\n')
    return { line: lines.length, col: lines[lines.length - 1].length + 1 }
  }

  const viewMode = settings.viewMode
  const showSource = viewMode !== 'output'
  const showOutput = viewMode !== 'source'
  const editorStyle = {
    fontFamily: `"${settings.fontFamily}", Consolas, Menlo, monospace`,
    fontSize: settings.fontSize * (settings.zoom / 100),
    fontWeight: settings.fontBold ? 700 : 400,
    fontStyle: settings.fontItalic ? 'italic' : 'normal',
    whiteSpace: settings.wordWrap ? 'pre-wrap' : 'pre',
  } as React.CSSProperties
  const lineCount = active ? active.source.split('\n').length : 0

  const nextThemeId = themes[(themes.findIndex((item) => item.id === settings.theme) + 1) % themes.length].id

  // A format picker: a button that opens the grouped format menu (its own window under Electron,
  // an in-page dropdown in the browser). Themed like every other menu, so it reads on any theme.
  const formatPicker = (which: 'from' | 'to', value: FormatId, disabled: boolean) => {
    const Icon = menuIcons[which]
    return (
      <span className="menu-group format-pick-group">
        <button
          className={menu === which ? 'format-pick active' : 'format-pick'}
          disabled={disabled}
          aria-haspopup="menu"
          aria-label={tr(which === 'from' ? 'fromFormat' : 'toFormat')}
          data-format={value}
          onPointerDown={(event) => { event.stopPropagation(); openMenu(which, event.currentTarget) }}
        >
          <Icon size={14} />
          <span className="format-pick-name">{formatName(value, language)}</span>
          <ChevronDown size={14} className="theme-chevron" />
        </button>
        {menu === which && (
          <MenuDrop anchor={menuAnchor}>
            <MenuTree rows={commandsInMenu(which)} label={commandLabel} sectionLabel={(section) => sectionLabelFor(settings.language, section, tr)} isActive={isCommandActive} isDisabled={isCommandDisabled} onChoose={runCommand} />
          </MenuDrop>
        )}
      </span>
    )
  }
  const ThemeSwatch = themeIcon(themes.find((item) => item.id === settings.theme) ?? themes[0])

  const tabScroll = (direction: -1 | 1) => tabStripRef.current?.scrollBy({ left: direction * 220, behavior: 'smooth' })


  return (
    <div
      className={`app-shell${dropActive ? ' drop-active' : ''}`}
      style={{
        '--left-width': settings.leftPanel ? `${settings.leftWidth}px` : '0px',
        '--right-width': settings.rightPanel ? `${settings.rightWidth}px` : '0px',
        '--bg-image': backgroundUrl ? `url("${backgroundUrl}")` : 'none',
        '--bg-opacity': String(settings.backgroundOpacity / 100),
        '--bg-size': settings.backgroundFit === 'cover' ? 'cover' : settings.backgroundFit === 'contain' ? 'contain' : 'auto',
        '--bg-repeat': settings.backgroundFit === 'tile' ? 'repeat' : 'no-repeat',
      } as React.CSSProperties}
      onDragOver={(event) => { event.preventDefault(); if (!dropActive) setDropActive(true) }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false) }}
      onDrop={(event) => void handleDrop(event)}
      onPointerDown={() => { setMenu(null); setContextAt(null); hideTooltip() }}
      onPointerOver={showTooltip}
      onPointerOut={(event) => {
        const current = readTooltip(event.target)
        const next = readTooltip(event.relatedTarget)
        if (current && next && current.node === next.node) return
        hideTooltip()
      }}
    >
      <header className="title-bar" onDoubleClick={() => void window.electronWindowApi?.toggleMaximize()}>
        <div className="brand" data-tooltip={`${APP_TITLE} — ${CREATOR}`}>
          <img src="./app-icon.svg" alt="" />
          <span>{tr('appName')}</span>
          <em className="brand-version">V{VERSION}</em>
        </div>
        <div className="title-doc">
          {active ? (
            <>
              <span>{active.name}</span>
              {active.dirty && <em className="title-dirty" aria-label={tr('unsavedTitle')}>*</em>}
              <span className="title-formats">{formatName(active.from, language)} → {formatName(active.to, language)}</span>
            </>
          ) : <span className="title-muted">{tr('emptyTitle')}</span>}
        </div>
        {desktop && (
          <div className="window-controls">
            <button aria-label={tr('minimize')} data-tooltip={tr('minimize')} onClick={() => void window.electronWindowApi?.minimize()}><Minus size={16} /></button>
            <button aria-label={tr('maximize')} data-tooltip={tr('maximize')} onClick={() => void window.electronWindowApi?.toggleMaximize()}>{maximized ? <Columns2 size={14} /> : <Square size={14} />}</button>
            <button className="window-close" aria-label={tr('closeWindow')} data-tooltip={tr('closeWindow')} onClick={() => void window.electronWindowApi?.close()}><X size={16} /></button>
          </div>
        )}
      </header>

      <nav className="menu-bar">
        {menuOrder.map((id) => {
          const MenuIcon = menuIcons[id]
          return (
            <div className="menu-group" key={id}>
              <button
                className={menu === id ? 'active' : ''}
                data-tooltip={tr(id)}
                onPointerDown={(event) => { event.stopPropagation(); openMenu(id, event.currentTarget) }}
                onPointerEnter={(event) => { if (menu && menu !== id && menu !== 'context') openMenu(id, event.currentTarget) }}
              >
                <MenuIcon size={15} />
                <span>{tr(id)}</span>
              </button>
              {menu === id && (
                <MenuDrop anchor={menuAnchor}>
                  <MenuTree
                    rows={id === 'file' ? fileMenuWithRecents(settings.recentFiles, { file: FileText, clear: X }) : commandsInMenu(id)}
                    label={commandLabel}
                    sectionLabel={(section) => sectionLabelFor(settings.language, section, tr)}
                    isActive={isCommandActive}
                    isDisabled={isCommandDisabled}
                    onChoose={runCommand}
                    onForget={(cid) => runCommand(`${RECENT_FORGET_PREFIX}${cid.slice(RECENT_PREFIX.length)}`)}
                    forgetLabel={tr('forgetRecent')}
                  />
                </MenuDrop>
              )}
            </div>
          )
        })}
      </nav>

      <div className="tool-bar" ref={toolbarRef}>
        {toolbarCommands.map((command) => {
          const Icon = command.icon
          return (
            <span key={command.id} className={command.separatorBefore ? 'tool-sep-before' : undefined}>
              <button
                className={isCommandActive(command.id) ? 'active' : ''}
                disabled={isCommandDisabled(command.id)}
                data-tooltip={`${commandLabel(command)}${command.accel ? ` (${command.accel})` : ''}`}
                aria-label={commandLabel(command)}
                onClick={() => runCommand(command.id)}
              >
                <Icon size={16} />
              </button>
            </span>
          )
        })}
        <span className="tool-zoom" data-tooltip={tr('zoom')}>{settings.zoom}%</span>
        <span className="tool-spacer" />
        <span className="tool-right">
          <button className="lang-button" data-tooltip={`${tr('toggleLanguage')}: ${language === 'ko' ? 'English' : '한국어'}`} aria-label={tr('toggleLanguage')} onClick={() => runCommand(language === 'ko' ? 'lang.en' : 'lang.ko')}>{language === 'ko' ? <FlagUnitedKingdom size={21} /> : <FlagKorea size={21} />}</button>
          <button data-tooltip={`${tr('nextTheme')}: ${themeLabel(language, nextThemeId)} (Ctrl+T)`} aria-label={tr('nextTheme')} onClick={() => runCommand('view.nextTheme')}><Palette size={16} /></button>
          <span className="menu-group theme-group">
            <button className={menu === 'theme' ? 'theme-select active' : 'theme-select'} data-tooltip={tr('chooseTheme')} aria-label={tr('chooseTheme')} aria-haspopup="menu" onPointerDown={(event) => { event.stopPropagation(); openMenu('theme', event.currentTarget) }}>
              <ThemeSwatch size={16} />
              <span className="theme-name">{themeLabel(language, settings.theme)}</span>
              <ChevronDown size={14} className="theme-chevron" />
            </button>
            {menu === 'theme' && (
              <MenuDrop anchor={menuAnchor}>
                <MenuTree rows={commandsInMenu('theme')} label={commandLabel} sectionLabel={(section) => sectionLabelFor(settings.language, section, tr)} isActive={isCommandActive} isDisabled={isCommandDisabled} onChoose={runCommand} />
              </MenuDrop>
            )}
          </span>
          <button data-tooltip={`${tr('settings')} (Ctrl+,)`} aria-label={tr('settings')} onClick={() => openDialog('settings')}><Settings size={16} /></button>
          <button data-tooltip={tr('about')} aria-label={tr('about')} onClick={() => openDialog('about')}><Info size={16} /></button>
        </span>
      </div>

      <main className="workspace">
        {settings.leftPanel && (
          <aside className="panel panel-left">
            <h2>{tr('toolsPanel')}</h2>
            <Group title={tr('formatsSection')}>
              <Field label={tr('fromFormat')}>
                {formatPicker('from', active?.from ?? settings.defaultFrom, !active || Boolean(active.sourceBytes))}
              </Field>
              <Field label={tr('toFormat')}>
                {formatPicker('to', active?.to ?? settings.defaultTo, !active)}
              </Field>
              <div className="button-row">
                <button className="primary" disabled={!active} data-tooltip={`${tr('convert.run')} (F9)`} onClick={() => runCommand('convert.run')}><Play size={14} /><span>{tr('convertNow')}</span></button>
                <button disabled={isCommandDisabled('convert.swap') || !active || Boolean(active.sourceBytes) || !getFormat(active.to).read || !getFormat(active.from).write} data-tooltip={tr('convert.swap')} onClick={() => runCommand('convert.swap')}><ArrowLeftRight size={14} /><span>{tr('swap')}</span></button>
              </div>
              <div className="button-row">
                <button disabled={!active} data-tooltip={tr('file.export')} onClick={() => runCommand('file.export')}><FileText size={14} /><span>{tr('exportOutput')}</span></button>
                <button data-tooltip={tr('file.batch')} onClick={() => runCommand('file.batch')}><Files size={14} /><span>{tr('batchSection')}</span></button>
              </div>
              <Check label={tr('autoConvert')} checked={settings.autoConvert} onChange={(autoConvert) => setSettings((current) => ({ ...current, autoConvert }))} />
            </Group>
            <Group title={tr('viewSection')}>
              <div className="segmented">
                <button className={viewMode === 'source' ? 'active' : ''} data-tooltip={tr('view.source')} onClick={() => runCommand('view.source')}><PencilLine size={14} /></button>
                <button className={viewMode === 'split' ? 'active' : ''} data-tooltip={tr('view.split')} onClick={() => runCommand('view.split')}><Columns2 size={14} /></button>
                <button className={viewMode === 'output' ? 'active' : ''} data-tooltip={tr('view.output')} onClick={() => runCommand('view.output')}><Eye size={14} /></button>
              </div>
              <Check label={tr('wordWrap')} checked={settings.wordWrap} onChange={(wordWrap) => setSettings((current) => ({ ...current, wordWrap }))} />
              <Check label={tr('lineNumbers')} checked={settings.lineNumbers} onChange={(lineNumbers) => setSettings((current) => ({ ...current, lineNumbers }))} />
            </Group>
            <Group title={tr('documentsSection')}>
              <ul className="doc-list">
                {docs.map((doc) => (
                  <li key={doc.id} className={doc.id === activeId ? 'active' : ''} onClick={() => activate(doc.id)} title={doc.path ?? doc.name}>
                    <FileText size={13} />
                    <span>{doc.name}{doc.dirty ? ' *' : ''}</span>
                  </li>
                ))}
              </ul>
            </Group>
          </aside>
        )}

        <section className="stage">
          <div className="tab-row">
            {tabOverflow && <button className="tab-scroll" data-tooltip={tr('tabScrollLeft')} onClick={() => tabScroll(-1)}><ChevronLeft size={16} /></button>}
            <div className="tab-strip" ref={tabStripRef}>
              {docs.map((doc) => (
                <div key={doc.id} className={`tab${doc.id === activeId ? ' active' : ''}${doc.dirty ? ' dirty' : ''}`} onClick={() => activate(doc.id)} onAuxClick={(event) => { if (event.button === 1) closeDocs([doc.id]) }} title={doc.path ?? doc.name}>
                  <FileText size={13} />
                  <span className="tab-name">{doc.name}</span>
                  {doc.dirty && <em>●</em>}
                  <button className="tab-close" aria-label={tr('closeTab')} data-tooltip={tr('closeTab')} onClick={(event) => { event.stopPropagation(); closeDocs([doc.id]) }}><X size={12} /></button>
                </div>
              ))}
            </div>
            {tabOverflow && <button className="tab-scroll" data-tooltip={tr('tabScrollRight')} onClick={() => tabScroll(1)}><ChevronRight size={16} /></button>}
          </div>

          {!active ? (
            <div className="empty-state">
              <img src="./app-icon.svg" alt="" width={96} height={96} />
              <h1>{tr('emptyTitle')}</h1>
              <p>{tr('emptyHint')}</p>
              <div className="button-row">
                <button className="primary" onClick={() => runCommand('file.new')}><span>{tr('file.new')}</span></button>
                <button onClick={() => runCommand('file.open')}><span>{tr('file.open')}</span></button>
                <button onClick={() => addDoc(createDoc({ name: 'sample.md', source: SAMPLE_MARKDOWN, from: 'markdown', to: 'html' }))}><span>{tr('sampleDoc')}</span></button>
              </div>
            </div>
          ) : (
            <div className={`panes ${viewMode}`}>
              {showSource && (
                <div className="pane pane-source" onContextMenu={openContextMenu}>
                  <div className="pane-head"><span>{tr('sourcePane')}</span><span className="pane-format">{formatName(active.from, language)}</span></div>
                  {active.sourceBytes ? (
                    <div className="binary-note"><p>{tr('binarySource', { format: formatName(active.from, language) })}</p><p className="hint">{formatBytes(active.sourceBytes.length)}</p></div>
                  ) : (
                    <div className="editor-wrap">
                      {settings.lineNumbers && (
                        <pre className="line-numbers" style={{ fontSize: editorStyle.fontSize, fontFamily: editorStyle.fontFamily }} aria-hidden>
                          {Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')}
                        </pre>
                      )}
                      <textarea
                        ref={editorRef}
                        className="editor"
                        style={editorStyle}
                        value={active.source}
                        spellCheck={false}
                        wrap={settings.wordWrap ? 'soft' : 'off'}
                        onChange={(event) => setSource(active.id, event.target.value)}
                        onSelect={(event) => updateDoc(active.id, (doc) => ({ ...doc, cursor: cursorFromArea(event.currentTarget) }))}
                        onKeyUp={(event) => updateDoc(active.id, (doc) => ({ ...doc, cursor: cursorFromArea(event.currentTarget) }))}
                        onScroll={(event) => { const numbers = event.currentTarget.previousElementSibling as HTMLElement | null; if (numbers) numbers.scrollTop = event.currentTarget.scrollTop }}
                        onKeyDown={(event) => {
                          if (event.key === 'Tab') {
                            event.preventDefault()
                            const area = event.currentTarget
                            const start = area.selectionStart
                            const next = `${area.value.slice(0, start)}    ${area.value.slice(area.selectionEnd)}`
                            setSource(active.id, next)
                            window.setTimeout(() => area.setSelectionRange(start + 4, start + 4), 0)
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              {showOutput && (
                <div className="pane pane-output">
                  <div className="pane-head">
                    <span>{tr('outputPane')}</span>
                    <span className="pane-format">{formatName(active.to, language)}{active.converting ? ' …' : ''}</span>
                  </div>
                  {active.outputError ? (
                    <div className="output-error"><p>{tr('convertFailed')}</p><pre>{active.outputError}</pre></div>
                  ) : active.output ? (
                    <>
                      {active.output.bytes && <p className="binary-banner">{tr('binaryOutput', { format: formatName(active.to, language), size: formatBytes(active.output.bytes.length) })}</p>}
                      {active.to === 'pdf' && !active.output.bytes && <p className="binary-banner">{tr('pdfNeedsDesktop')}</p>}
                      <iframe ref={previewRef} className="preview" title={tr('outputPane')} srcDoc={previewHtml} sandbox="allow-same-origin allow-scripts allow-modals" />
                    </>
                  ) : (
                    <div className="output-pending"><p>{tr('outputPending')}</p></div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {settings.rightPanel && (
          <aside className="panel panel-right">
            <h2>{tr('propertiesPanel')}</h2>
            {active ? (
              <>
                <OptionsForm language={language} value={active.options} onChange={(patch) => setOptions(active.id, patch)} to={active.to} fonts={fonts} compact />
                <div className="button-row">
                  <button onClick={() => setOptions(active.id, { ...settings.writerDefaults })}><span>{tr('resetOptions')}</span></button>
                  <button onClick={() => setSettings((current) => ({ ...current, writerDefaults: { ...active.options } }))}><span>{tr('saveAsDefaults')}</span></button>
                </div>
                <Group title={tr('docInfo')}>
                  <dl className="info-rows">
                    <dt>{tr('words')}</dt><dd>{stats?.words.toLocaleString() ?? '—'}</dd>
                    <dt>{tr('characters')}</dt><dd>{stats?.characters.toLocaleString() ?? '—'}</dd>
                    <dt>{tr('lines')}</dt><dd>{lineCount.toLocaleString()}</dd>
                    <dt>{tr('headings')}</dt><dd>{stats?.headings ?? '—'}</dd>
                    <dt>{tr('paragraphs')}</dt><dd>{stats?.paragraphs ?? '—'}</dd>
                    <dt>{tr('tables')}</dt><dd>{stats?.tables ?? '—'}</dd>
                    <dt>{tr('images')}</dt><dd>{stats?.images ?? '—'}</dd>
                    <dt>{tr('links')}</dt><dd>{stats?.links ?? '—'}</dd>
                    <dt>{tr('outputSize')}</dt><dd>{active.output ? formatBytes(active.output.bytes?.length ?? new TextEncoder().encode(active.output.text ?? '').length) : '—'}</dd>
                  </dl>
                </Group>
              </>
            ) : <p className="hint">{tr('emptyHint')}</p>}
          </aside>
        )}
      </main>

      <footer className="status-bar">
        <span className="status-message">{status || tr('ready')}</span>
        {active && <span>{formatName(active.from, language)} → {formatName(active.to, language)}</span>}
        {active && stats && <span>{tr('words')} {stats.words.toLocaleString()} · {tr('characters')} {stats.characters.toLocaleString()}</span>}
        {active && !active.sourceBytes && <span>{tr('statusLine', { line: active.cursor.line, col: active.cursor.col })}</span>}
        {active && <span>{active.dirty ? tr('modified') : tr('unmodified')}</span>}
        <span>{tr('statusZoom', { zoom: settings.zoom })}</span>
        <span>{language === 'ko' ? '한국어' : 'English'}</span>
        <span>{themeLabel(language, settings.theme)}</span>
      </footer>

      {dropActive && <div className="drop-overlay"><p>{tr('dropHint')}</p></div>}

      {menu === 'context' && contextAt && (
        <div className="menu-drop" style={{ left: contextAt.x, top: contextAt.y }} onPointerDown={(event) => event.stopPropagation()}>
          <MenuTree rows={commandsInMenu('context')} label={commandLabel} sectionLabel={(section) => sectionLabelFor(settings.language, section, tr)} isActive={isCommandActive} isDisabled={isCommandDisabled} onChoose={runCommand} />
        </div>
      )}

      {dialog && inPagePayload && (
        <div className="dialog-overlay" onPointerDown={(event) => event.stopPropagation()}>
          <DialogFrame name={dialog} language={inPagePayload.language} payload={inPagePayload} onClose={() => setDialog(null)}>
            <DialogBody
              name={dialog}
              payload={dialog === 'progress' && progress ? { ...inPagePayload, progress } : inPagePayload}
              onResult={(result) => { void applyDialogResult(dialog, result); if (!keepsWindowOpen(result.action)) setDialog(null) }}
              onClose={() => { if (dialog === 'unsaved') pendingClose.current = null; setDialog(null) }}
              onThemeChange={applyTheme}
            />
          </DialogFrame>
        </div>
      )}

      {tooltip && <div className="app-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}
    </div>
  )
}
