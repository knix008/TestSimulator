// The program: one window with the start screen or the minutes, and dialogs drawn inside it.
// The meeting is kept in a ref as well as in state, so undo, autosave and file commands always see
// the newest one without waiting for a render.
import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyAssets, inlineAssets, setAssetFolder } from './assets'
import { AboutDialog, ExportDialog, MediaStorageDialog, MessageDialog, UnsavedDialog, type ExportFormat } from './components/dialogs'
import { MeetingForm, type MeetingUpdate } from './components/MeetingForm'
import { OutlinePanel, PreviewPanel, StatusBar } from './components/Panels'
import { AddSectionDialog } from './components/SectionParts'
import { StartScreen } from './components/StartScreen'
import { Toolbar } from './components/Toolbar'
import { TutorialCard, TutorialChooser } from './components/Tutorial'
import { docStyleVars, meetingToMarkdown, meetingToText, renderMarkdown, standaloneHtml, wordDocument, type DocStyle } from './document'
import { host, isDesktop, MINUTES_FILTERS } from './host'
import i18n, { docLabels } from './i18n'
import { addSection, emptyMeeting, isEmpty, meetingBaseName, parseMeetingFile, sanitizeMeeting, serializeMeeting, todayText, type Meeting, type Section } from './meeting'
import { sheetSize, type PageSetup } from './print/pageSetup'
import { addRecent, removeRecent, type AppSettings, type GeneralSettings, type Locale, type MediaStorageChoice, type StartSettings } from './settings'
import { TEMPLATES, templateMeeting, type Template } from './templates'
import { applyTheme, setCustomThemes, type CustomTheme } from './themes'
import { tutorialById } from './tutorials'

const PrintDialog = lazy(() => import('./components/PrintDialog').then((m) => ({ default: m.PrintDialog })))
const GuideDialog = lazy(() => import('./components/Guide').then((m) => ({ default: m.GuideDialog })))
const PreferencesDialog = lazy(() => import('./components/Preferences').then((m) => ({ default: m.PreferencesDialog })))

const HISTORY_LIMIT = 200
/** Edits closer together than this are one undo step: a word, not a letter. */
const COALESCE_MS = 700
const DRAFT_DELAY_MS = 800

type Doc = { meeting: Meeting; filePath: string | null; dirty: boolean }
type Draft = { meeting?: unknown; filePath?: unknown; dirty?: unknown }

export type Shot = { name: string }

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path
const dirOf = (path: string | null) => (path ? path.split(/[\\/]/).slice(0, -1).join('/') : undefined)

export default function App({ initialSettings, shot }: { initialSettings: AppSettings; shot?: Shot }) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState(initialSettings)
  const language = settings.language

  /* ------------------------------------------------------- document */

  const [doc, setDoc] = useState<Doc>({ meeting: emptyMeeting(), filePath: null, dirty: false })
  const docRef = useRef(doc)
  docRef.current = doc
  const [docKey, setDocKey] = useState(0)
  const history = useRef({ past: [] as Meeting[], future: [] as Meeting[], at: 0 })
  const [, setHistoryTick] = useState(0)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [ready, setReady] = useState(!!shot)

  const put = useCallback((next: Doc, reload: boolean) => {
    docRef.current = next
    // Before anything renders: file names in the document are shown from this folder.
    setAssetFolder(isDesktop ? dirOf(next.filePath) ?? null : null)
    setDoc(next)
    if (reload) setDocKey((key) => key + 1)
  }, [])

  /** An edit: undoable, and the document is changed. */
  const change = useCallback((update: MeetingUpdate) => {
    const current = docRef.current
    const next = typeof update === 'function' ? update(current.meeting) : update
    if (next === current.meeting) return
    const h = history.current
    const now = Date.now()
    if (now - h.at > COALESCE_MS || !h.past.length) {
      h.past.push(current.meeting)
      if (h.past.length > HISTORY_LIMIT) h.past.shift()
    }
    h.at = now
    h.future = []
    setHistoryTick((n) => n + 1)
    put({ ...current, meeting: next, dirty: true }, false)
  }, [put])

  /** A change made from outside the form (a tutorial step): undoable, and the editor reloads. */
  const changeFromOutside = useCallback((next: Meeting) => {
    const body = docRef.current.meeting.body
    history.current.at = 0
    change(next)
    if (next.body !== body) setDocKey((key) => key + 1)
  }, [change])

  /** A different document (new, open, template): history starts again. */
  const replace = useCallback((next: Doc) => {
    history.current = { past: [], future: [], at: 0 }
    setHistoryTick((n) => n + 1)
    setSavedAt(null)
    put(next, true)
  }, [put])

  const undo = useCallback(() => {
    const h = history.current
    const previous = h.past.pop()
    if (!previous) return
    h.future.push(docRef.current.meeting)
    h.at = 0
    setHistoryTick((n) => n + 1)
    put({ ...docRef.current, meeting: previous, dirty: true }, previous.body !== docRef.current.meeting.body)
  }, [put])

  const redo = useCallback(() => {
    const h = history.current
    const next = h.future.pop()
    if (!next) return
    h.past.push(docRef.current.meeting)
    h.at = 0
    setHistoryTick((n) => n + 1)
    put({ ...docRef.current, meeting: next, dirty: true }, next.body !== docRef.current.meeting.body)
  }, [put])

  /* ------------------------------------------------------- settings */

  const saveSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    if (!shot) void host.saveSettings(patch as Record<string, unknown>).catch(() => {})
  }, [shot])

  const setLanguage = (next: Locale) => {
    void i18n.changeLanguage(next)
    document.documentElement.lang = next
    saveSettings({ language: next })
  }
  const setTheme = (id: string) => {
    applyTheme(id)
    saveSettings({ theme: id })
  }
  const setCustom = (list: CustomTheme[], selected: string) => {
    setCustomThemes(list)
    applyTheme(selected)
    saveSettings({ customThemes: list, theme: selected })
  }
  const setStart = useCallback((patch: Partial<StartSettings>) => {
    setSettings((current) => {
      const startScreen = { ...current.startScreen, ...patch }
      if (!shot) void host.saveSettings({ startScreen }).catch(() => {})
      return { ...current, startScreen }
    })
  }, [shot])
  const setGeneral = (patch: Partial<GeneralSettings>) => saveSettings({ general: { ...settings.general, ...patch } })
  const setPageSetup = useCallback((patch: Partial<PageSetup>) => {
    setSettings((current) => {
      const pageSetup = { ...current.pageSetup, ...patch }
      if (!shot) void host.saveSettings({ pageSetup }).catch(() => {})
      return { ...current, pageSetup }
    })
  }, [shot])

  /* ------------------------------------------------------- views */

  const [showStart, setShowStart] = useState(!!initialSettings.startScreen.showOnStartup)
  const [printOpen, setPrintOpen] = useState(false)
  const [printAsPdf, setPrintAsPdf] = useState(false)
  const [exportOpen, setExportOpen] = useState<ExportFormat | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [prefTab, setPrefTab] = useState<string | null>(null)
  const [chooser, setChooser] = useState<'asking' | 'menu' | null>(null)
  const [tutorial, setTutorial] = useState<{ id: string; step: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [unsaved, setUnsaved] = useState<{ then: () => void } | null>(null)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)

  const flash = useCallback((text: string) => {
    setStatus(text)
    window.setTimeout(() => setStatus((current) => (current === text ? '' : current)), 4000)
  }, [])
  const fail = useCallback((error: unknown) => setMessage(error instanceof Error ? error.message : String(error)), [])

  /* ------------------------------------------------------- the finished document */

  const labels = useMemo(() => docLabels(language), [language])
  const docStyle: DocStyle = useMemo(() => ({ fontFamily: settings.general.fontFamily, fontSizePt: settings.general.fontSizePt }), [settings.general.fontFamily, settings.general.fontSizePt])
  const numbering = settings.general.numbering
  const markdownOf = useCallback((m: Meeting) => meetingToMarkdown(m, labels, { numbering }), [labels, numbering])
  const deferred = useDeferredValue(doc.meeting)
  const previewHtml = useMemo(() => (settings.preview || printOpen ? renderMarkdown(markdownOf(deferred)) : ''), [settings.preview, printOpen, markdownOf, deferred])
  const title = doc.meeting.title.trim() || (doc.filePath ? fileName(doc.filePath).replace(/\.mtg$/i, '') : labels.untitled)

  useEffect(() => {
    document.title = `${doc.dirty ? '● ' : ''}${title} — MyMeeting`
  }, [title, doc.dirty])

  /* ------------------------------------------------------- files */

  const newMeeting = useCallback((): Meeting => ({ ...emptyMeeting(), date: settings.general.dateToday ? todayText() : '' }), [settings.general.dateToday])

  /** Runs `then` once unsaved work has been saved or given up. */
  const guard = useCallback((then: () => void) => {
    const current = docRef.current
    if (current.dirty && !isEmpty(current.meeting)) setUnsaved({ then })
    else then()
  }, [])

  const remember = useCallback((path: string) => {
    setSettings((current) => {
      const recent = addRecent(current.recent, path)
      if (!shot) void host.saveSettings({ recent }).catch(() => {})
      return { ...current, recent }
    })
  }, [shot])

  const forget = useCallback((path: string) => {
    setSettings((current) => {
      const recent = removeRecent(current.recent, path)
      void host.saveSettings({ recent }).catch(() => {})
      return { ...current, recent }
    })
  }, [])

  const loadText = useCallback((text: string, path: string | null) => {
    const meeting = parseMeetingFile(text)
    replace({ meeting, filePath: path, dirty: false })
    if (path) remember(path)
    setShowStart(false)
    flash(t('status.opened', { name: path ? fileName(path) : meeting.title }))
  }, [replace, remember, flash, t])

  const openPath = useCallback(async (path: string) => {
    try {
      loadText(await host.readText(path), path)
    } catch (error) {
      setMessage(t('error.open', { name: fileName(path), reason: String(error) }))
      forget(path)
    }
  }, [loadText, forget, t])

  const open = () =>
    guard(async () => {
      try {
        const picked = await host.openMinutes(dirOf(docRef.current.filePath ?? settings.recent[0] ?? null))
        if (picked) loadText(picked.text, isDesktop ? picked.path : null)
      } catch (error) {
        setMessage(t('error.read', { reason: String(error) }))
      }
    })

  const saveAs = async (): Promise<boolean> => {
    const current = docRef.current
    try {
      const path = await host.saveAs(`${meetingBaseName(current.meeting, labels.untitled)}.mtg`, serializeMeeting(current.meeting), MINUTES_FILTERS, 'application/json')
      if (!path) return false
      // Files kept beside the minutes go with them to a new folder.
      const from = dirOf(current.filePath)
      const to = dirOf(path)
      if (isDesktop && from && to && from !== to) {
        const moved = await copyAssets(docRef.current.meeting, from, to)
        if (moved.meeting !== docRef.current.meeting) await host.writeText(path, serializeMeeting(moved.meeting))
        put({ ...docRef.current, meeting: moved.meeting, filePath: path, dirty: false }, moved.copied > 0)
      } else {
        put({ ...docRef.current, filePath: isDesktop ? path : null, dirty: false }, false)
      }
      if (isDesktop) remember(path)
      setSavedAt(new Date())
      flash(t('status.saved', { name: fileName(path) }))
      return true
    } catch (error) {
      fail(error)
      return false
    }
  }

  const save = async (): Promise<boolean> => {
    const current = docRef.current
    if (!current.filePath || !isDesktop) return saveAs()
    try {
      await host.writeText(current.filePath, serializeMeeting(current.meeting))
      put({ ...docRef.current, dirty: false }, false)
      remember(current.filePath)
      setSavedAt(new Date())
      flash(t('status.saved', { name: fileName(current.filePath) }))
      return true
    } catch (error) {
      fail(error)
      return false
    }
  }

  /** Where what is being put in goes. Keeping it beside the minutes needs them to have a folder. */
  const [storageAsk, setStorageAsk] = useState<((choice: MediaStorageChoice | null) => void) | null>(null)
  const chooseStorage = async (): Promise<MediaStorageChoice | null> => {
    if (!isDesktop) return 'internal'
    const setting = settings.general.mediaStorage
    const choice = setting !== 'ask' ? setting : await new Promise<MediaStorageChoice | null>((resolve) => setStorageAsk(() => resolve))
    setStorageAsk(null)
    if (choice === 'external' && !docRef.current.filePath && !(await saveAs())) return null
    return choice
  }

  const startNew = () =>
    guard(() => {
      replace({ meeting: newMeeting(), filePath: null, dirty: false })
      setShowStart(false)
    })

  const startTemplate = (template: Template) =>
    guard(() => {
      const meeting = templateMeeting(template, language)
      if (!meeting.date && settings.general.dateToday) meeting.date = todayText()
      replace({ meeting, filePath: null, dirty: false })
      setShowStart(false)
    })

  const runExport = async (format: ExportFormat) => {
    setExportOpen(null)
    if (format === 'pdf') {
      setPrintAsPdf(true)
      setPrintOpen(true)
      flash(t('export.pdfHow'))
      return
    }
    try {
      // An export travels alone: files kept beside the minutes go inside it.
      const m = format === 'text' ? docRef.current.meeting : await inlineAssets(docRef.current.meeting)
      const base = meetingBaseName(m, labels.untitled)
      const html = () => renderMarkdown(markdownOf(m))
      let path: string | null = null
      if (format === 'word') {
        const box = sheetSize(settings.pageSetup)
        path = await host.saveAs(`${base}.doc`, wordDocument(title, html(), docStyle, { ...box, margins: settings.pageSetup.margins }), [{ name: 'Word', extensions: ['doc'] }], 'application/msword')
      } else if (format === 'html') {
        path = await host.saveAs(`${base}.html`, standaloneHtml(title, html(), docStyle, language), [{ name: 'HTML', extensions: ['html', 'htm'] }], 'text/html;charset=utf-8')
      } else if (format === 'markdown') {
        path = await host.saveAs(`${base}.md`, markdownOf(m), [{ name: 'Markdown', extensions: ['md'] }], 'text/markdown;charset=utf-8')
      } else {
        path = await host.saveAs(`${base}.txt`, meetingToText(m, labels, { numbering }), [{ name: 'Text', extensions: ['txt'] }])
      }
      if (path) flash(t('status.exported', { name: fileName(path) }))
    } catch (error) {
      fail(error)
    }
  }
  const requestClose = useCallback(() => guard(() => void host.closeMain()), [guard])

  /* ------------------------------------------------------- start-up */

  useEffect(() => {
    if (shot) return
    let alive = true
    void (async () => {
      const file = await host.startupFile().catch(() => null)
      const draft = ((await host.loadDraft().catch(() => ({}))) ?? {}) as Draft
      if (!alive) return
      const restored = draft.meeting ? sanitizeMeeting(draft.meeting) : null
      if (file) {
        await openPath(file)
      } else if (restored && !isEmpty(restored)) {
        replace({ meeting: restored, filePath: typeof draft.filePath === 'string' ? draft.filePath : null, dirty: draft.dirty === true })
      } else if (initialSettings.general.reopenLast && initialSettings.recent[0]) {
        await openPath(initialSettings.recent[0])
        setShowStart(initialSettings.startScreen.showOnStartup)
      } else {
        replace({ meeting: newMeeting(), filePath: null, dirty: false })
      }
      if (file) setShowStart(false)
      else if (initialSettings.startScreen.askTutorial && initialSettings.startScreen.showOnStartup) setChooser('asking')
      setReady(true)
    })()
    return () => {
      alive = false
    }
    // Once, at start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The draft: whatever happens, the work of the last second is there at the next start.
  useEffect(() => {
    if (!ready || shot) return undefined
    const timer = window.setTimeout(() => {
      void host.saveDraft({ meeting: doc.meeting, filePath: doc.filePath, dirty: doc.dirty }).catch(() => {})
    }, DRAFT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [doc, ready, shot])

  useEffect(() => {
    if (shot) return undefined
    void host.closeGuardReady()
    const offClose = host.on('close-requested', () => requestClose())
    const offOpen = host.on<string>('open-file', (path) => guard(() => void openPath(path)))
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDesktop && docRef.current.dirty && !isEmpty(docRef.current.meeting)) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      offClose()
      offOpen()
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [requestClose, guard, openPath, shot])

  // A .mtg file dropped anywhere on the window is opened.
  useEffect(() => {
    const over = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files') && !(event.target as Element)?.closest?.('.richeditor-page')) event.preventDefault()
    }
    const drop = (event: DragEvent) => {
      if ((event.target as Element)?.closest?.('.richeditor-page')) return
      const file = Array.from(event.dataTransfer?.files ?? []).find((item) => /\.(mtg|json)$/i.test(item.name))
      event.preventDefault()
      if (file) guard(() => void file.text().then((text) => loadText(text, null)).catch(fail))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [guard, loadText, fail])

  useEffect(() => {
    const link = (event: Event) => void host.openExternal((event as CustomEvent<string>).detail)
    window.addEventListener('mymeeting-open-link', link)
    return () => window.removeEventListener('mymeeting-open-link', link)
  }, [])

  /* ------------------------------------------------------- keys */

  const toggleFullscreen = () => void host.toggleFullscreen().then(setFullscreen).catch(() => {})
  const keys = useRef<(event: KeyboardEvent) => void>(() => {})
  keys.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    const dialog = !!document.querySelector('.overlay-dim')
    if (event.key === 'F1') {
      event.preventDefault()
      setGuideOpen(true)
    } else if (event.key === 'F11') {
      event.preventDefault()
      toggleFullscreen()
    } else if (mod && !event.altKey && !dialog) {
      const run: Record<string, (() => void) | undefined> = {
        n: startNew,
        o: open,
        s: () => void (event.shiftKey ? saveAs() : save()),
        p: () => setPrintOpen(true),
        e: () => setExportOpen('word'),
        z: !showStart ? (event.shiftKey ? redo : undo) : undefined,
        y: !showStart ? redo : undefined,
      }
      const action = run[key]
      if (action) {
        event.preventDefault()
        action()
      }
    }
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keys.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  /* ------------------------------------------------------- tutorial */

  // The start-up question belongs to the start screen: leaving it answers "not now".
  useEffect(() => {
    if (!showStart && chooser === 'asking') setChooser(null)
  }, [showStart, chooser])

  const startTutorial = (id: string) => {
    setChooser(null)
    const begin = () => {
      if (tutorialById(id).id === 'basics') replace({ meeting: newMeeting(), filePath: null, dirty: false })
      setShowStart(false)
      setTutorial({ id, step: 0 })
    }
    if (tutorialById(id).id === 'basics') guard(begin)
    else begin()
  }

  const tutorialApi = {
    setMeeting: changeFromOutside,
    openPrint: () => setPrintOpen(true),
    closePrint: () => setPrintOpen(false),
    setPageSetup,
    openExport: () => setExportOpen('word'),
    loadSample: () => {
      const sample = TEMPLATES.find((item) => item.id === 'sample') ?? TEMPLATES[0]
      if (!sample) return
      replace({ meeting: templateMeeting(sample, language), filePath: null, dirty: false })
    },
  }

  /* ------------------------------------------------------- screenshots */

  useEffect(() => {
    if (!shot) return
    const sample = TEMPLATES.find((item) => item.id === 'sample') ?? TEMPLATES[0]
    const meeting = sample ? templateMeeting(sample, language) : emptyMeeting()
    const name = shot.name
    if (name !== 'start') {
      replace({ meeting, filePath: null, dirty: false })
      setShowStart(false)
    }
    if (name === 'start') setShowStart(true)
    if (name === 'preview') saveSettings({ preview: true })
    if (name === 'print') setPrintOpen(true)
    if (name === 'pagesetup') {
      setPageSetup({ orientation: 'landscape', margins: { top: 20, right: 18, bottom: 20, left: 25 } })
      setPrintOpen(true)
    }
    if (name === 'export') setExportOpen('word')
    if (name === 'settings') setPrefTab('document')
    if (name === 'themes') setPrefTab('theme')
    if (name === 'guide') setGuideOpen(true)
    if (name === 'chooser') setChooser('menu')
    if (name === 'tutorial') {
      replace({ meeting: { ...meeting, attendees: meeting.attendees.slice(0, 1) }, filePath: null, dirty: false })
      setTutorial({ id: 'basics', step: 3 })
    }
    const sections: Record<string, string> = { info: 'info', attendees: 'attendees', editor: 'discussion', actions: 'actionItems', tutorial: 'attendees' }
    if (sections[name]) {
      window.setTimeout(() => document.getElementById(`sec-${sections[name]}`)?.scrollIntoView({ block: 'start' }), 300)
    }
    if (name === 'editor') {
      window.setTimeout(() => {
        const page = document.querySelector<HTMLElement>('.richeditor-page')
        const target = page?.querySelector('h3, h4, p') ?? page
        if (page && target) {
          page.focus()
          const range = document.createRange()
          range.selectNodeContents(target)
          window.getSelection()?.removeAllRanges()
          window.getSelection()?.addRange(range)
        }
      }, 500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ------------------------------------------------------- sections */

  const [addSectionAfter, setAddSectionAfter] = useState<{ after: string | null } | null>(null)
  /** The card being edited, or else the one at the top of the page. */
  const currentSection = () => {
    const focused = document.activeElement?.closest<HTMLElement>('.sheet [data-section]')
    if (focused) return focused.dataset.section ?? null
    if (!scroller) return null
    const top = scroller.getBoundingClientRect().top + 80
    let current: string | null = null
    for (const card of scroller.querySelectorAll<HTMLElement>('.sheet [data-section]')) {
      if (!current || card.getBoundingClientRect().top <= top) current = card.dataset.section ?? null
    }
    return current
  }
  const openAddSection = (after: string | null = currentSection()) => {
    if (showStart) setShowStart(false)
    setAddSectionAfter({ after })
  }
  const addNewSection = (section: Section, atEnd: boolean) => {
    const after = atEnd ? null : addSectionAfter?.after ?? null
    setAddSectionAfter(null)
    change((current) => addSection(current, section, after))
    window.setTimeout(() => {
      const card = document.getElementById(`sec-${section.id}`)
      card?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      card?.querySelector<HTMLElement>('.sheet-section-body input, .sheet-section-body [contenteditable], .add-row')?.focus({ preventScroll: true })
    }, 60)
  }

  /* ------------------------------------------------------- view */

  const view = { printOpen, exportOpen: exportOpen !== null, pageSetup: settings.pageSetup, saved: !doc.dirty && !!doc.filePath }
  const styleVars = docStyleVars(docStyle)

  return (
    <div className="app-shell" data-ready={ready}>
      <Toolbar
        title={title}
        filePath={doc.filePath}
        dirty={doc.dirty}
        themeId={settings.theme}
        customThemes={settings.customThemes}
        language={language}
        showStart={showStart}
        outline={settings.outline}
        preview={settings.preview}
        numbering={numbering}
        canUndo={history.current.past.length > 0}
        canRedo={history.current.future.length > 0}
        fullscreen={fullscreen}
        onToggleStart={() => setShowStart(!showStart)}
        onNew={startNew}
        onOpen={open}
        onSave={() => void save()}
        onSaveAs={() => void saveAs()}
        onPrint={() => setPrintOpen(true)}
        onExport={() => setExportOpen('word')}
        onAddSection={() => openAddSection()}
        onUndo={undo}
        onRedo={redo}
        onToggleOutline={() => saveSettings({ outline: !settings.outline })}
        onTogglePreview={() => saveSettings({ preview: !settings.preview })}
        onToggleNumbering={() => setGeneral({ numbering: !numbering })}
        onToggleFullscreen={toggleFullscreen}
        onTheme={setTheme}
        onLanguage={setLanguage}
        onPreferences={(tab) => setPrefTab(tab ?? 'general')}
        onGuide={() => setGuideOpen(true)}
        onTutorial={() => setChooser('menu')}
        onAbout={() => setAboutOpen(true)}
        onRequestClose={requestClose}
      />

      <main className="workspace">
        {showStart ? (
          <StartScreen
            language={language}
            themeId={settings.theme}
            customThemes={settings.customThemes}
            start={settings.startScreen}
            recent={settings.recent}
            onStart={setStart}
            onNew={startNew}
            onOpen={open}
            onTutorial={() => setChooser('menu')}
            onContinue={() => setShowStart(false)}
            onOpenRecent={(path) => guard(() => void openPath(path))}
            onTemplate={startTemplate}
            onRemoveRecent={forget}
            onClearRecent={() => saveSettings({ recent: [] })}
            onTheme={setTheme}
            onPreferences={(tab) => setPrefTab(tab ?? 'general')}
            onLanguage={() => setLanguage(language === 'en' ? 'ko' : 'en')}
            onGuide={() => setGuideOpen(true)}
            onAbout={() => setAboutOpen(true)}
            onExit={requestClose}
          />
        ) : (
          <div className="editor-layout">
            {settings.outline && <OutlinePanel meeting={doc.meeting} scroller={scroller} onHide={() => saveSettings({ outline: false })} />}
            <div className="sheet-scroll" ref={setScroller}>
              <MeetingForm meeting={doc.meeting} onChange={change} docKey={docKey} onUndo={undo} onRedo={redo} onError={setMessage} onAddSection={openAddSection} onChooseStorage={chooseStorage} />
            </div>
            {settings.preview && <PreviewPanel html={previewHtml} styleVars={styleVars} width={settings.previewWidth} onWidth={(previewWidth) => saveSettings({ previewWidth })} onPrint={() => setPrintOpen(true)} onHide={() => saveSettings({ preview: false })} />}
          </div>
        )}
      </main>

      <StatusBar meeting={doc.meeting} filePath={doc.filePath} dirty={doc.dirty} savedAt={savedAt} message={status} />

      {tutorial && !showStart && (
        <TutorialCard
          key={tutorial.id}
          id={tutorial.id}
          initialStep={tutorial.step}
          meeting={doc.meeting}
          view={view}
          language={language}
          api={tutorialApi}
          onClose={() => setTutorial(null)}
        />
      )}

      <Suspense fallback={null}>
        {printOpen && <PrintDialog bodyHtml={previewHtml} title={title} setup={settings.pageSetup} style={docStyle} printer={settings.general.printer} onPrinter={(printer) => setGeneral({ printer })} asPdf={printAsPdf} onSetup={setPageSetup} onClose={() => { setPrintOpen(false); setPrintAsPdf(false) }} onError={fail} />}
        {guideOpen && <GuideDialog language={language} onClose={() => setGuideOpen(false)} />}
        {prefTab && (
          <PreferencesDialog
            initialTab={prefTab}
            general={settings.general}
            onGeneral={setGeneral}
            recentCount={settings.recent.length}
            onClearRecent={() => saveSettings({ recent: [] })}
            language={language}
            onLanguage={setLanguage}
            themeId={settings.theme}
            onTheme={setTheme}
            customThemes={settings.customThemes}
            onCustomThemes={setCustom}
            start={settings.startScreen}
            onStart={setStart}
            onClose={() => setPrefTab(null)}
          />
        )}
      </Suspense>

      {storageAsk && <MediaStorageDialog saved={!!doc.filePath} onPick={storageAsk} onCancel={() => storageAsk(null)} />}
      {exportOpen && <ExportDialog initial={exportOpen} onExport={(format) => void runExport(format)} onCancel={() => setExportOpen(null)} />}
      {chooser && (
        <TutorialChooser
          language={language}
          asking={chooser === 'asking'}
          askOnStart={settings.startScreen.askTutorial}
          onAskOnStart={(askTutorial) => setStart({ askTutorial })}
          onPick={startTutorial}
          onClose={() => setChooser(null)}
        />
      )}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {addSectionAfter && <AddSectionDialog meeting={doc.meeting} hasAfter={!!addSectionAfter.after} onAdd={addNewSection} onClose={() => setAddSectionAfter(null)} />}
      {unsaved && (
        <UnsavedDialog
          name={title}
          onCancel={() => setUnsaved(null)}
          onDiscard={() => {
            const then = unsaved.then
            setUnsaved(null)
            then()
          }}
          onSave={() => {
            const then = unsaved.then
            setUnsaved(null)
            void save().then((ok) => ok && then())
          }}
        />
      )}
      {message && <MessageDialog message={message} onClose={() => setMessage(null)} />}
    </div>
  )
}
