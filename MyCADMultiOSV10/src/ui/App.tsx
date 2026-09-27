import { Fragment, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AUTHOR, MIN_WINDOW_HEIGHT, POPUP_SIZE, PROJECT_URL, toolbarMinWidth, windowTitle } from '../core/buildInfo'
import { errorHeadline, errorReport } from '../core/report'
import { licenseLines, shortcutLines } from '../core/knowledge'
import { formatLength, formatVolume, unitSuffix } from '../core/units'
import { MIN_PANEL_WIDTH, toolPanelWidth } from '../core/viewnav'
import { categoryName, groupTools } from '../core/toolgroups'
import { decodeClipboard } from '../core/clipboard'
import { directoryOf, lastDirectory, suggestedPath } from '../core/recent'
import { detectBrowserFonts, FALLBACK_FONTS, mergeFonts } from '../core/fonts'
import { menuIcon, translate, type MessageKey } from '../core/i18n'
import { commandHelp } from '../core/labels'
import { CONTEXT_ITEMS, MENUS, TOOLBAR_CONTROLS, TOOLBAR_GROUPS, TOOLBAR_RIGHT, menuPopupLayout, menuRowCount, menuSections } from '../core/menus'
import { hasCommand, runCommandById, type CommandEffect } from '../core/commands'
import { createSolid, type CadDocument, type ShadeMode, type SolidKind, type ViewPreset } from '../core/model'
import { pageToSvg, selectionDistance } from '../core/print'
import { decodeBase64, fileTypeFor, importCsv, importFile, isBinaryExtension, openFilters } from '../core/fileTypes'
import { runExport } from '../core/exporters'
import { installAddon } from '../core/addons'
import { buildPrintPages, defaultPageSetup, type PageSetup, type PrintScope } from '../core/print'
import { LANGUAGES, browserStorage, fontCss, sanitizeSettings, type Lang } from '../core/settings'
import { resolveTheme, themeVars } from '../core/themes'
import { AxesMark, LanguageFlag } from './Flags'
import { FontControl, LightPicker, ThemePicker, ZoomControl } from './ToolbarControls'
import { fileNameFromPath, parseDocument, serializeDocument } from '../core/serialize'
import { activeDocument, canRedo, canUndo, createInitialState, reducer, type AppState } from '../core/store'
import { parseStl, toAsciiStl } from '../core/stl'
import { sketchesToDxf, sketchesToSvg } from '../core/drawing'
import { booleanSolids, filletBox, helixSolid, holeTool, linearPattern, loftSketches, makeSketch, mirrorSolid, padSketch, pipeSketch, polarPattern, rebuildFeatureSolid, revolveSketch, solidVolume, toObj, type WorkPlane } from '../core/part'
import { BASIC_PRIMITIVES, PART_OPERATIONS, WORKBENCHES, femStress, sketchToGcode, workbenchTools, type WorkbenchId } from '../core/workbenches'
import { compileOpenScad, femBar, forwardKinematics, inspectSolids, parsePoints, pocketGcode, pointCloudSolid, solveSketchConstraints, surfaceFromSketch, toIfc } from '../core/extended'
import { draftSolid, evaluateFormula, inertiaOf, rectangularPattern, referencePlane, shaft, groove, shellSolid, solveMate, specTreeRows, steppedHole, transformSolid, updateSketchFromParameters } from '../core/catia'
import { nextTabStart, tabStartFor, tabWindow, visibleTabCount } from '../core/tabs'
import { AboutDialog, ConfirmDialog, ErrorDialog, ExportDialog, NumberField, PartDialog, PrintDialog, ProgressDialog, ReportDialog, SettingsDialog, UsageDialog } from './dialogs'
// three.js is a megabyte of its own, so the canvas arrives as its own chunk and
// a window that never draws (the settings window) never downloads it.
const Viewport = lazy(() => import('./Viewport').then((module) => ({ default: module.Viewport })))

type DialogKind = 'about' | 'settings' | 'print' | 'error' | 'confirm' | 'part' | 'usage' | 'report' | 'export' | null

function openedBody(content: string, encoding?: string): string | Uint8Array {
  return encoding === 'base64' ? decodeBase64(content) : content
}

async function readBody(file: Blob, name: string): Promise<string | Uint8Array> {
  if (isBinaryExtension(name) && typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return readFile(file)
}

async function readFile(file: Blob): Promise<string> {
  if (typeof (file as File).text === 'function') return (file as File).text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/**
 * An open menu closes when the pointer leaves it.
 *
 * The handlers are meant to go on every element of one menu: the menu bar and
 * the panel it opened are two elements but one region, so moving from a root
 * button down into its items must not close anything. They share this hook's
 * timer, and entering either cancels the pending close.
 *
 * The delay is what makes it usable rather than twitchy: a pointer heading
 * diagonally for an item can clip the corner for a frame, and closing on that
 * would make the menu impossible to reach.
 */
export const MENU_CLOSE_DELAY = 260

function useCloseOnLeave(open: boolean, close: () => void, delay = MENU_CLOSE_DELAY) {
  const timer = useRef<number | null>(null)
  // The caller passes a fresh arrow each render; the timer reads the latest.
  const closeRef = useRef(close)
  closeRef.current = close
  const cancel = useCallback(() => {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
  }, [])
  // A menu closed by a click or by Escape must not leave a timer running that
  // would then close whatever the user opened next.
  useEffect(() => {
    if (!open) cancel()
    return cancel
  }, [cancel, open])
  const onMouseLeave = useCallback(() => {
    if (!open) return
    cancel()
    timer.current = window.setTimeout(() => {
      timer.current = null
      closeRef.current()
    }, delay)
  }, [cancel, delay, open])
  return { onMouseEnter: cancel, onMouseLeave }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState())
  const [fonts, setFonts] = useState<string[]>(FALLBACK_FONTS)
  const [menu, setMenu] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 8, y: 64 })
  const [context, setContext] = useState<{ x: number; y: number } | null>(null)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [error, setError] = useState({ message: '', detail: '' })
  const [progress, setProgress] = useState<{ title: string; message: string; percent: number } | null>(null)
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null)
  const [printScope, setPrintScope] = useState<PrintScope>('current')
  const [customIds, setCustomIds] = useState<string[]>([])
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [pageSetup, setPageSetup] = useState<PageSetup>(defaultPageSetup())
  const [pageIndex, setPageIndex] = useState(0)
  const [tabStart, setTabStart] = useState(0)
  const [tabRoom, setTabRoom] = useState(0)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [partOp, setPartOp] = useState('sketchRect')
  const [workbench, setWorkbench] = useState<WorkbenchId>('partDesign')
  const [report, setReport] = useState<{ title: string; lines: string[] }>({ title: '', lines: [] })
  const [printSheets, setPrintSheets] = useState('')
  const [measuredWidth, setMeasuredWidth] = useState(0)
  // Bumped by the toolbar reset button; the viewport re-centres when it changes.
  const [viewReset, setViewReset] = useState(0)
  const [naturalPanelWidth, setNaturalPanelWidth] = useState(0)
  const toolGridRef = useRef<HTMLDivElement>(null)
  const menubarRef = useRef<HTMLElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const clipRef = useRef('')
  const tempRef = useRef(0)

  const doc = activeDocument(state)
  const theme = resolveTheme(state.settings.theme, state.settings.customTheme)
  // The static figure covers the toolbar; the measured one also covers the
  // menu bar, whose width depends on the language and the chosen font.
  const staticMinWidth = useMemo(() => toolbarMinWidth(TOOLBAR_GROUPS, TOOLBAR_CONTROLS.length + TOOLBAR_RIGHT.length) + 40, [])
  const minWindowWidth = Math.max(staticMinWidth, measuredWidth)
  const t = useCallback((key: MessageKey | string) => translate(state.settings.language, key), [state.settings.language])
  /** Tooltip: the command name plus its one-line description when there is one. */
  const tip = useCallback((id: string) => {
    const help = commandHelp(state.settings.language, id)
    return help ? `${translate(state.settings.language, id)} — ${help}` : translate(state.settings.language, id)
  }, [state.settings.language])
  const pages = useMemo(
    () => buildPrintPages(state.documents, state.activeId, printScope, customIds, selectedOnly),
    [state.documents, state.activeId, printScope, customIds, selectedOnly]
  )

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const raw = await browserStorage().load()
      if (raw && !cancel) dispatch({ type: 'replace-settings', settings: sanitizeSettings(raw) })
      const listed = window.mycad?.listFonts ? await window.mycad.listFonts() : await detectBrowserFonts()
      if (!cancel) setFonts(mergeFonts(listed))
      if (!cancel) setLoaded(true)
    })()
    return () => { cancel = true }
  }, [])

  useEffect(() => {
    if (!loaded) return
    void browserStorage().save(state.settings)
  }, [state.settings, loaded])

  useEffect(() => {
    document.title = windowTitle()
  }, [])


  // The settings window is a separate renderer, so it sends what it changed and
  // the main window applies it. `sent` stops the echo coming straight back.
  const sent = useRef('')
  useEffect(() => {
    return window.mycad?.onSyncState?.((payload) => {
      if (payload.settings) {
        const next = sanitizeSettings(payload.settings)
        sent.current = JSON.stringify(next)
        dispatch({ type: 'replace-settings', settings: next })
      }
      if (payload.shade) dispatch({ type: 'set-shade', shade: payload.shade as ShadeMode })
    })
  }, [])

  useEffect(() => {
    if (!window.mycad?.syncState) return
    const snapshot = JSON.stringify(state.settings)
    if (snapshot === sent.current) return
    sent.current = snapshot
    window.mycad.syncState({ settings: state.settings })
  }, [state.settings])

  // Nothing in the menu bar or the toolbar may be cut off: measure both after
  // every render that can change their width and raise the window minimum.
  useLayoutEffect(() => {
    // Sum the intrinsic widths of the controls. Reading scrollWidth would feed
    // back on itself, because the flexible spacer stretches the bar to
    // whatever width the app already has.
    const rowWidth = (row: HTMLElement | null): number => {
      if (!row) return 0
      let total = 0
      const walk = (node: Element) => {
        for (const child of Array.from(node.children)) {
          const style = window.getComputedStyle(child)
          if (style.display === 'contents') {
            walk(child)
            continue
          }
          if (child.classList.contains('toolbar-spacer')) {
            total += 8
            continue
          }
          total += child.getBoundingClientRect().width + 3
        }
      }
      walk(row)
      return Math.ceil(total)
    }
    /**
     * Width of the menu bar with the labels of one language, measured by
     * swapping the text in place and reading the layout back. Nothing is
     * painted in between, so this is invisible.
     */
    const menubarWidthIn = (lang: Lang): number => {
      const bar = menubarRef.current
      if (!bar) return 0
      const labels = [...bar.querySelectorAll<HTMLElement>('.menu-root .menu-label')]
      const options = [...bar.querySelectorAll<HTMLOptionElement>('[data-testid="workbench"] option')]
      const before = [...labels, ...options].map((node) => node.textContent)
      labels.forEach((node, index) => {
        const entry = MENUS[index]
        if (entry) node.textContent = translate(lang, entry.labelKey)
      })
      options.forEach((node, index) => {
        const item = WORKBENCHES[index]
        if (item) node.textContent = translate(lang, item.labelKey)
      })
      const width = rowWidth(bar)
      ;[...labels, ...options].forEach((node, index) => {
        node.textContent = before[index]
      })
      return width
    }

    const measure = () => {
      // The window minimum has to hold the widest language, or switching the
      // language would resize the window.
      const bars = Math.max(
        ...LANGUAGES.map(menubarWidthIn),
        rowWidth(menubarRef.current),
        rowWidth(toolbarRef.current)
      )
      const needed = Math.min(2000, Math.ceil(bars + 14))
      setMeasuredWidth((current) => (Math.abs(current - needed) > 2 ? needed : current))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (menubarRef.current) observer?.observe(menubarRef.current)
    if (toolbarRef.current) observer?.observe(toolbarRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [state.settings.fontFamily, state.settings.fontSize, workbench])

  useEffect(() => {
    void window.mycad?.setMinSize?.(minWindowWidth, MIN_WINDOW_HEIGHT)
  }, [minWindowWidth])

  // The tool panel starts at the narrowest width that still shows every icon
  // and label in full; after that the splitter decides.
  useLayoutEffect(() => {
    const grid = toolGridRef.current
    if (!grid) return
    // Both side panels share this width, so it also has to fit a property row.
    const natural = Math.max(toolPanelWidth(measureLabelWidths(grid)), MIN_PANEL_WIDTH)
    setNaturalPanelWidth(natural)
  }, [workbench, state.settings.language, state.settings.fontFamily, state.settings.fontSize])



  // Kept in refs so the error report can read the current state without making
  // showError depend on every change.
  const stateRef = useRef(state)
  stateRef.current = state
  const workbenchRef = useRef(workbench)
  workbenchRef.current = workbench

  const showError = useCallback((caught: unknown, source = 'command') => {
    const err = caught instanceof Error ? caught : new Error(String(caught))
    setError({
      message: errorHeadline(err),
      detail: errorReport(err, {
        source,
        // The window can be gone by the time a late rejection lands.
        platform: typeof window === 'undefined' ? undefined : window.mycad?.platform,
        details: {
          document: activeDocument(stateRef.current).name,
          workbench: workbenchRef.current,
          solids: activeDocument(stateRef.current).solids.length,
          language: stateRef.current.settings.language
        }
      })
    })
    setDialog('error')
  }, [])

  // Anything that escapes a handler - a bad callback, a rejected promise -
  // still ends up in the error popup with the full report behind it.
  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      // Chromium reports this one for harmless layout loops; it is not a fault.
      if (event.message?.includes('ResizeObserver loop')) return
      showError(event.error ?? event.message, 'window')
    }
    const onRejection = (event: PromiseRejectionEvent) => showError(event.reason, 'promise')
    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [showError])

  const withProgress = useCallback(async (title: string, message: string, task: () => Promise<void>) => {
    setProgress({ title, message, percent: 8 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    setProgress({ title, message, percent: 45 })
    try {
      await task()
      setProgress({ title, message, percent: 100 })
      await new Promise((resolve) => setTimeout(resolve, 20))
    } catch (caught) {
      showError(caught)
    } finally {
      setProgress(null)
    }
  }, [showError])

  const openText = useCallback(async (text: string, path?: string) => {
    const parsed = parseDocument(text, 'loaded')
    if (path) parsed.name = fileNameFromPath(path).replace(/\.mycad$/i, '')
    dispatch({ type: 'load-doc', doc: parsed, path })
    if (path) dispatch({ type: 'remember-dir', key: 'open', directory: directoryOf(path) })
  }, [])

  /**
   * Write one document out. Ctrl+S on a file that already has a path writes
   * straight back to it; everything else asks where to put it.
   */
  const saveDocument = useCallback(async (current: CadDocument, forceDialog: boolean) => {
    let path = !forceDialog ? current.filePath : undefined
    const content = serializeDocument({ ...current, name: current.name })
    if (path && window.mycad?.writeFile) {
      const written = await window.mycad.writeFile(path, content)
      if (!written?.ok) {
        showError(new Error(written?.error || path))
        return false
      }
      dispatch({ type: 'remember-dir', key: 'save', directory: written.directory || directoryOf(path) })
      dispatch({ type: 'mark-saved', path, id: current.id })
      return true
    }
    if (window.mycad?.saveFile) {
      const result = await window.mycad.saveFile({
        title: t('save'),
        // Start where the last file went, with this document's name filled in.
        defaultPath: path || suggestedPath(lastDirectory(state.settings.lastDirectories, 'save'), `${current.name}.mycad`),
        content,
        filters: [{ name: 'MyCAD', extensions: ['mycad'] }]
      })
      if (result.canceled || !result.filePath) return false
      path = result.filePath
      dispatch({ type: 'remember-dir', key: 'save', directory: result.directory || directoryOf(result.filePath) })
    } else if (!path || forceDialog) {
      const suggested = `${current.name}.mycad`
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = suggested
      link.click()
      URL.revokeObjectURL(url)
      path = path || suggested
    }
    if (path) dispatch({ type: 'mark-saved', path, id: current.id })
    return true
  }, [state, showError, t])

  const saveActive = useCallback(
    (forceDialog: boolean) => saveDocument(activeDocument(state), forceDialog),
    [saveDocument, state]
  )

  /** Every tab that still holds changes, in the order they are shown. */
  const dirtyDocuments = useCallback(() => state.documents.filter((item) => item.dirty), [state])

  const requestClose = useCallback((after?: () => void) => {
    // Closing with changes anywhere — not only in the tab on screen — asks
    // first, so nothing is thrown away without the user saying so.
    if (dirtyDocuments().length === 0) {
      after?.()
      return
    }
    setPendingClose(() => after ?? (() => undefined))
    setDialog('confirm')
  }, [dirtyDocuments])

  function applyBoolean(operation: 'union' | 'cut' | 'common') {
    const selected = doc.solids.filter((solid) => doc.selection.includes(solid.id))
    if (selected.length < 2) {
      showError(new Error(t('noSelection')))
      return
    }
    const result = booleanSolids(selected[0], selected[1], operation, 'bool')
    dispatch({
      type: 'apply-part',
      solids: [result],
      replaceIds: [selected[0].id, selected[1].id],
      feature: { id: 'feat', name: operation, kind: operation === 'union' ? 'union' : operation === 'cut' ? 'cut' : 'common', solidIds: [], length: 0, angle: 0, count: 0, radius: 0 }
    })
  }

  function applyPart(values: { width: number; height: number; length: number; angle: number; count: number; spacing: number; radius: number; sides: number; diameter: number; plane: WorkPlane; axis: 'x' | 'y' | 'z' }) {
    const selected = doc.solids.filter((solid) => doc.selection.includes(solid.id))
    const sketches = doc.sketches ?? []
    const fallbackSketch = (scale = 1) => makeSketch({
      id: 'sketch',
      plane: values.plane,
      shape: 'rect',
      width: (values.width || 40) * scale,
      height: (values.height || 30) * scale,
      sides: values.sides
    })
    const sketch = sketches[sketches.length - 1] ?? fallbackSketch()
    const lowerSketch = sketches[sketches.length - 2] ?? fallbackSketch(0.6)
    const featureBase = { id: 'feat', solidIds: [] as string[], length: values.length, angle: values.angle, count: values.count, radius: values.radius }
    try {
      if (partOp === 'sketchRect' || partOp === 'sketchCircle' || partOp === 'sketchPolygon') {
        const shape = partOp === 'sketchCircle' ? 'circle' : partOp === 'sketchPolygon' ? 'polygon' : 'rect'
        const nextSketch = makeSketch({ id: 'sketch', name: partOp, plane: values.plane, shape, width: values.width, height: values.height, sides: values.sides })
        const solid = padSketch(nextSketch, 0.4, 'preview')
        dispatch({ type: 'apply-part', solids: [solid], sketch: nextSketch, feature: { ...featureBase, name: partOp, kind: 'sketch' } })
      } else if (partOp === 'pad') {
        dispatch({ type: 'apply-part', solids: [padSketch(sketch, values.length, 'pad')], sketch: sketches.length ? undefined : sketch, feature: { ...featureBase, name: 'pad', kind: 'pad' } })
      } else if (partOp === 'pocket') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        const tool = padSketch(sketch, values.length, 'pocket-tool')
        const result = booleanSolids(selected[0], tool, 'cut', 'pocket')
        dispatch({ type: 'apply-part', solids: [result], replaceIds: [selected[0].id], feature: { ...featureBase, name: 'pocket', kind: 'pocket' } })
      } else if (partOp === 'revolve') {
        dispatch({ type: 'apply-part', solids: [revolveSketch(sketch, values.angle, 'revolve')], sketch: sketches.length ? undefined : sketch, feature: { ...featureBase, name: 'revolve', kind: 'revolve' } })
      } else if (partOp === 'loft') {
        dispatch({ type: 'apply-part', solids: [loftSketches(lowerSketch, sketch, values.length, 'loft')], sketch: sketches.length ? undefined : sketch, feature: { ...featureBase, name: 'loft', kind: 'loft' } })
      } else if (partOp === 'pipe') {
        dispatch({ type: 'apply-part', solids: [pipeSketch(sketch, values.length, 'pipe')], sketch: sketches.length ? undefined : sketch, feature: { ...featureBase, name: 'pipe', kind: 'pipe' } })
      } else if (partOp === 'helix') {
        dispatch({ type: 'apply-part', solids: [helixSolid(values.radius, values.length, values.count, 'helix')], feature: { ...featureBase, name: 'helix', kind: 'helix' } })
      } else if (partOp === 'fillet' || partOp === 'chamfer') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        const shaped = filletBox(selected[0], values.radius, partOp, partOp === 'chamfer')
        dispatch({ type: 'apply-part', solids: [shaped], replaceIds: [selected[0].id], feature: { ...featureBase, name: partOp, kind: partOp } })
      } else if (partOp === 'mirror') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        dispatch({ type: 'apply-part', solids: [mirrorSolid(selected[0], values.plane, 'mirror')], feature: { ...featureBase, name: 'mirror', kind: 'mirror' } })
      } else if (partOp === 'linearPattern') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        let n = 0
        const copies = linearPattern(selected[0], values.count, values.spacing, values.axis, () => `pat-${n++}`)
        dispatch({ type: 'apply-part', solids: copies, feature: { ...featureBase, name: 'linear', kind: 'linear' } })
      } else if (partOp === 'polarPattern') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        let n = 0
        const copies = polarPattern(selected[0], values.count, values.spacing, () => `polar-${n++}`)
        dispatch({ type: 'apply-part', solids: copies, feature: { ...featureBase, name: 'polar', kind: 'polar' } })
      } else if (partOp === 'hole') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        const tool = holeTool(values.diameter, values.length, selected[0].position, 'hole')
        const result = booleanSolids(selected[0], tool, 'cut', 'hole')
        dispatch({ type: 'apply-part', solids: [result], replaceIds: [selected[0].id], feature: { ...featureBase, name: 'hole', kind: 'hole' } })
      } else if (partOp === 'shaft') {
        dispatch({ type: 'apply-part', solids: [shaft(sketch, values.angle, 'shaft')], sketch: sketches.length ? undefined : sketch, feature: { ...featureBase, name: 'Shaft', kind: 'shaft' } })
      } else if (partOp === 'groove') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        dispatch({ type: 'apply-part', solids: [groove(selected[0], sketch, values.angle, 'groove')], replaceIds: [selected[0].id], feature: { ...featureBase, name: 'Groove', kind: 'groove' } })
      } else if (partOp === 'draft') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        dispatch({ type: 'apply-part', solids: [draftSolid(selected[0], values.angle, 'draft')], replaceIds: [selected[0].id], feature: { ...featureBase, name: 'Draft', kind: 'draft' } })
      } else if (partOp === 'shell') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        dispatch({ type: 'apply-part', solids: [shellSolid(selected[0], values.radius, 'shell')], replaceIds: [selected[0].id], feature: { ...featureBase, name: 'Shell', kind: 'shell' } })
      } else if (partOp === 'rectPattern') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        let n = 0
        const copies = rectangularPattern(selected[0], values.count, Math.max(1, Math.round(values.count / 2)), values.spacing, values.spacing, () => `rect-${n++}`)
        dispatch({ type: 'apply-part', solids: copies, feature: { ...featureBase, name: 'RectPattern', kind: 'rectPattern' } })
      } else if (partOp === 'translate' || partOp === 'rotateBody' || partOp === 'scaleBody') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        const mode = partOp === 'translate' ? 'translate' : partOp === 'rotateBody' ? 'rotate' : 'scale'
        const amount = partOp === 'scaleBody' ? Math.max(0.1, values.length / 20) : values.length
        const kind = mode === 'translate' ? 'translate' : mode === 'rotate' ? 'rotate' : 'scale'
        dispatch({ type: 'apply-part', solids: [transformSolid(selected[0], mode, values.axis, partOp === 'rotateBody' ? values.angle : amount, mode)], replaceIds: [selected[0].id], feature: { ...featureBase, name: partOp, kind } })
      } else if (partOp === 'counterbore' || partOp === 'countersink') {
        if (selected.length < 1) throw new Error(t('noSelection'))
        dispatch({ type: 'apply-part', solids: [steppedHole(selected[0], partOp, values.diameter, values.length, partOp)], replaceIds: [selected[0].id], feature: { ...featureBase, name: partOp, kind: partOp } })
      } else if (partOp === 'refPlane') {
        dispatch({ type: 'apply-part', solids: [referencePlane(values.plane, values.length, 'plane')], feature: { ...featureBase, name: `Plane.${values.plane}`, kind: 'align' } })
      } else if (partOp === 'parameter') {
        const formula = `Width+${values.length}`
        dispatch({ type: 'apply-part', solids: [], parameter: { name: 'Width', value: evaluateFormula(formula, [{ name: 'Width', value: values.width, formula: '' }]), formula }, feature: { ...featureBase, name: 'Width', kind: 'parameter' } })
      } else if (partOp === 'offsetMate') {
        if (selected.length < 2) throw new Error(t('noSelection'))
        const moved = solveMate(selected[0], selected[1], { id: 'mate', kind: 'offset', a: selected[0].id, b: selected[1].id, value: values.length })
        dispatch({ type: 'apply-part', solids: [moved], replaceIds: [selected[1].id], mate: { id: 'mate', kind: 'offset', a: selected[0].name, b: selected[1].name, value: values.length }, feature: { ...featureBase, name: 'Offset', kind: 'mate' } })
      }
      if (partOp === 'parameter' && doc.sketches.length) {
        const updated = updateSketchFromParameters(doc.sketches[doc.sketches.length - 1], [{ name: 'Width', value: values.length, formula: '' }])
        dispatch({ type: 'apply-part', solids: [], sketch: updated, feature: { ...featureBase, name: 'Update', kind: 'parameter' } })
      }
      setDialog(null)
    } catch (caught) {
      showError(caught)
    }
  }

  useEffect(() => {
    window.__mycadRequestClose = () => requestClose(() => window.mycad?.confirmClose(true))
    const off = window.mycad?.onRequestClose?.(() => requestClose(() => window.mycad?.confirmClose(true)))
    return () => { off?.() }
  }, [requestClose])

  /**
   * Open any supported file: the same path is used by drag and drop, by the
   * Open command and by files the operating system hands over because they are
   * associated with MyCAD.
   */
  /** Open a file from the recent list, by path. */
  const openRecent = useCallback(async (path: string) => {
    setMenu(null)
    try {
      const read = await window.mycad?.readPath?.(path)
      const content = read?.content
      if (!read?.ok || content === undefined) {
        throw new Error(read?.error || path)
      }
      await withProgress(t('progress'), t('busyOpen'), async () => {
        await openAnyFileRef.current(path, openedBody(content, read.encoding))
      })
    } catch (caught) {
      showError(caught, 'recent')
    }
  }, [showError, t, withProgress])

  const openAnyFile = useCallback(async (path: string, body: string | Uint8Array) => {
    // Whatever kind of file this was, the next dialog starts in its folder.
    const directory = directoryOf(path)
    if (directory) dispatch({ type: 'remember-dir', key: 'open', directory })
    const lower = path.toLowerCase()
    if (lower.endsWith('.csv')) {
      dispatch({ type: 'remember-recent', path })
      const loaded = importCsv(path, typeof body === 'string' ? body : new TextDecoder().decode(body))
      dispatch({ type: 'patch-extras', patch: { sheet: loaded.sheet } })
      setReport({
        title: path.split(/[/\\]/).pop() ?? path,
        lines: [
          `cells ${loaded.sheet.cells.length}`,
          ...Object.entries(loaded.values.values).slice(0, 12).map(([ref, value]) => `${ref} = ${value}`)
        ]
      })
      setDialog('report')
      return
    }
    dispatch({ type: 'remember-recent', path })
    const result = importFile(path, body, { id: `imported-${Date.now()}` })
    if (result.document) {
      dispatch({ type: 'load-doc', doc: result.document, path })
    }
    if (result.solids.length > 0) {
      dispatch({
        type: 'apply-part',
        solids: result.solids,
        feature: { id: 'feat', name: path.split(/[/\\]/).pop() ?? 'import', kind: 'primitive', solidIds: [], length: 0, angle: 0, count: result.solids.length, radius: 0 }
      })
    }
    if (result.wires.length > 0) {
      dispatch({ type: 'patch-extras', patch: { wires: [...doc.extras.wires, ...result.wires] } })
    }
    if (result.addon) {
      const addons = installAddon(state.settings.addons, result.addon, 'file', '1.0.0', Date.now())
      dispatch({ type: 'patch-settings', patch: { addons } })
    }
    if (result.report.length > 0 && result.solids.length === 0 && !result.document) {
      setReport({ title: path.split(/[/\\]/).pop() ?? path, lines: result.report })
      setDialog('report')
    }
    dispatch({ type: 'set-status', status: result.status })
  }, [doc.extras.wires, state.settings.addons])

  // `openRecent` is declared first so the menu can call it, and reaches the
  // real implementation through this ref.
  const openAnyFileRef = useRef(openAnyFile)
  openAnyFileRef.current = openAnyFile

  // Files opened from the shell (double click, "open with", second instance).
  useEffect(() => {
    const off = window.mycad?.onOpenPath?.(async (filePath: string) => {
      try {
        const read = await window.mycad?.readPath?.(filePath)
        if (!read?.ok || read.content === undefined) throw new Error(read?.error || filePath)
        dispatch({ type: 'remember-dir', key: 'open', directory: directoryOf(filePath) })
        await openAnyFile(filePath, openedBody(read.content, read.encoding))
      } catch (caught) {
        showError(caught)
      }
    })
    return () => { off?.() }
  }, [openAnyFile, showError])

  const applyEffect = useCallback((id: string, effect: CommandEffect) => {
    if (effect.allSolids) dispatch({ type: 'replace-solids', solids: effect.allSolids })
    const hasPart = (effect.solids && effect.solids.length > 0) || effect.sketch || effect.parameter || effect.mate
    if (hasPart) {
      dispatch({
        type: 'apply-part',
        solids: effect.solids ?? [],
        replaceIds: effect.replaceIds,
        feature: effect.feature ?? { id: 'feat', name: id, kind: 'primitive', solidIds: [], length: 0, angle: 0, count: 1, radius: 0 },
        sketch: effect.sketch,
        parameter: effect.parameter,
        mate: effect.mate
      })
    }
    if (effect.extras) dispatch({ type: 'patch-extras', patch: effect.extras })
    if (effect.settingsPatch) dispatch({ type: 'patch-settings', patch: effect.settingsPatch })
    if (effect.preset) dispatch({ type: 'set-preset', preset: effect.preset })
    if (effect.shade) dispatch({ type: 'set-shade', shade: effect.shade })
    if (effect.download) downloadText(effect.download.name, effect.download.text)
    if (effect.report) {
      setReport(effect.report)
      setDialog('report')
    }
    dispatch({ type: 'set-status', status: effect.status ?? `${t(id)} ${t('saved')}` })
  }, [t])

  const printNow = useCallback(async () => {
    if (pages.length === 0) return
    const stamp = new Date()
    const sheets: string[] = []
    for (let copy = 0; copy < Math.max(1, pageSetup.copies); copy++) {
      pages.forEach((page, index) => {
        sheets.push(`<section class="print-sheet">${pageToSvg(page, pageSetup, index, pages.length, stamp)}</section>`)
      })
    }
    setPrintSheets(sheets.join(''))
    dispatch({ type: 'patch-settings', patch: { print: pageSetup } })
    await new Promise((resolve) => setTimeout(resolve, 40))
    try {
      if (window.mycad?.print) await window.mycad.print()
      else window.print()
    } catch (caught) {
      showError(caught)
    }
  }, [pageSetup, pages, showError])

  /** Write the document out in one of the supported formats. */
  const exportAs = useCallback(async (formatId: string, selectedOnly: boolean) => {
    try {
      const result = runExport(formatId, { doc, selectedOnly })
      if (window.mycad?.saveFile) {
        const saved = await window.mycad.saveFile({
          title: t('export'),
          defaultPath: suggestedPath(lastDirectory(state.settings.lastDirectories, 'save'), result.name),
          content: result.text,
          filters: [{ name: result.format.label[state.settings.language], extensions: [result.format.ext] }]
        })
        if (saved.canceled) return
        if (saved.filePath) dispatch({ type: 'remember-dir', key: 'save', directory: saved.directory || directoryOf(saved.filePath) })
      } else {
        downloadText(result.name, result.text)
      }
      dispatch({ type: 'set-status', status: `${t('export')}: ${result.name}` })
      setDialog(null)
    } catch (caught) {
      showError(caught)
    }
  }, [doc, showError, state.settings.language, state.settings.lastDirectories.save, t])

  const runCommand = useCallback(async (id: string) => {
    setMenu(null)
    setContext(null)
    if (BASIC_PRIMITIVES.includes(id)) {
      dispatch({ type: 'add-solid', kind: id as SolidKind })
      dispatch({ type: 'set-tool', tool: id })
      return
    }
    const presets: ViewPreset[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']
    if (presets.includes(id as ViewPreset)) {
      dispatch({ type: 'set-preset', preset: id as ViewPreset })
      return
    }
    if (hasCommand(id)) {
      try {
        const effect = runCommandById(id, { doc, settings: state.settings, nextId: () => `tmp-${(tempRef.current += 1)}` })
        if (effect) applyEffect(id, effect)
      } catch (caught) {
        showError(caught)
      }
      return
    }
    try {
      switch (id) {
        case 'new':
          requestClose(() => dispatch({ type: 'new-doc' }))
          break
        case 'open': {
          if (window.mycad?.openFile) {
            const result = await window.mycad.openFile({
              title: t('open'),
              defaultPath: lastDirectory(state.settings.lastDirectories, 'open'),
              filters: openFilters(state.settings.language)
            })
            if (!result.canceled && result.content && result.filePath) {
              const filePath = result.filePath
              const content = result.content
              await withProgress(t('progress'), t('busyOpen'), async () => { await openAnyFile(filePath, openedBody(content, result.encoding)) })
            }
          } else {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = openFilters(state.settings.language)[0].extensions.map((ext) => `.${ext}`).join(',')
            input.onchange = async () => {
              const file = input.files?.[0]
              if (!file) return
              const text = await readBody(file, file.name)
              await withProgress(t('progress'), t('busyOpen'), async () => { await openAnyFile(file.name, text) })
            }
            input.click()
          }
          break
        }
        case 'save':
          await withProgress(t('progress'), t('busySave'), async () => { await saveActive(false) })
          break
        case 'saveAs':
          await withProgress(t('progress'), t('busySave'), async () => { await saveActive(true) })
          break
        case 'undo':
          dispatch({ type: 'undo' })
          break
        case 'redo':
          dispatch({ type: 'redo' })
          break
        case 'copy': {
          const text = reducer(state, { type: 'copy' }).clipboardText
          clipRef.current = text
          dispatch({ type: 'copy' })
          try { await navigator.clipboard.writeText(text) } catch { /* clipboard permission */ }
          break
        }
        case 'paste': {
          let text = clipRef.current || state.clipboardText
          try {
            const clip = await navigator.clipboard.readText()
            if (clip && decodeClipboard(clip)) text = clip
          } catch { /* use internal clipboard */ }
          dispatch({ type: 'paste', text })
          break
        }
        case 'duplicate':
          dispatch({ type: 'duplicate' })
          break
        case 'delete':
          dispatch({ type: 'delete-selected' })
          break
        case 'select':
          dispatch({ type: 'set-tool', tool: 'select' })
          break
        case 'selectAll':
          dispatch({ type: 'select', ids: doc.solids.map((solid) => solid.id) })
          break
        case 'grid':
          dispatch({ type: 'toggle-grid' })
          break
        case 'ruler':
          dispatch({ type: 'toggle-ruler' })
          break
        case 'scaleBar':
          dispatch({ type: 'patch-settings', patch: { scaleBar: state.settings.scaleBar === false } })
          break
        case 'showAxes':
          // X, Y and Z go on and off together: shown, or not shown.
          dispatch({ type: 'patch-settings', patch: { showAxes: state.settings.showAxes === false } })
          break
        case 'shaded':
          dispatch({ type: 'set-shade', shade: 'shaded' })
          break
        case 'wireframe':
          dispatch({ type: 'set-shade', shade: 'wireframe' })
          break
        case 'asIs':
        case 'flatLines':
        case 'points':
        case 'hiddenLine':
        case 'noShading':
          dispatch({ type: 'set-shade', shade: id })
          break
        case 'projection':
          dispatch({
            type: 'patch-settings',
            patch: { projection: state.settings.projection === 'orthographic' ? 'perspective' : 'orthographic' }
          })
          break
        case 'shortcuts':
          setReport({ title: t('shortcuts'), lines: shortcutLines(state.settings.language) })
          setDialog('report')
          break
        case 'license':
          setReport({ title: t('license'), lines: licenseLines(state.settings.language) })
          setDialog('report')
          break
        case 'homepage':
          if (window.mycad?.openExternal) await window.mycad.openExternal(PROJECT_URL)
          else window.open(PROJECT_URL, '_blank', 'noopener')
          break
        case 'zoomIn':
          dispatch({ type: 'set-zoom', zoom: state.zoom * 1.1 })
          break
        case 'zoomOut':
          dispatch({ type: 'set-zoom', zoom: state.zoom * 0.9 })
          break
        case 'fit':
          dispatch({ type: 'set-zoom', zoom: 100 })
          break
        case 'toolPanel':
          dispatch({ type: 'patch-settings', patch: { showToolPanel: !state.settings.showToolPanel } })
          break
        case 'propertyPanel':
          dispatch({ type: 'patch-settings', patch: { showPropertyPanel: !state.settings.showPropertyPanel } })
          break
        case 'resetView':
          // Back to the default isometric view: preset, zoom, any pan, and
          // the scale marker back to its corner.
          dispatch({ type: 'set-preset', preset: 'iso' })
          dispatch({ type: 'set-zoom', zoom: 100 })
          dispatch({ type: 'patch-settings', patch: { scaleMarker: null } })
          setViewReset((value) => value + 1)
          break
        case 'export':
          setDialog('export')
          break
        case 'print':
          setPageIndex(0)
          setPageSetup({ ...state.settings.print })
          setDialog('print')
          break
        case 'language':
          dispatch({ type: 'patch-settings', patch: { language: state.settings.language === 'ko' ? 'en' : 'ko' } })
          break
        case 'settings':
          // On the desktop the settings live in their own window; the browser
          // build keeps the in-page dialog.
          if (window.mycad?.openPopup) {
            await window.mycad.openPopup({
              kind: 'settings',
              width: POPUP_SIZE.settings.width,
              height: POPUP_SIZE.settings.height,
              title: `${windowTitle()} · ${t('settings')}`
            })
          } else {
            setDialog('settings')
          }
          break
        case 'about':
          setDialog('about')
          break
        case 'usage':
          setDialog('usage')
          break
        case 'exportGcode': {
          const sketch = (doc.sketches ?? []).at(-1) ?? makeSketch({ id: 'sketch', shape: 'rect', width: 40, height: 30 })
          downloadText(`${doc.name}.nc`, sketchToGcode(sketch.width, sketch.height))
          break
        }
        case 'femCheck': {
          const target = doc.solids.find((solid) => doc.selection.includes(solid.id)) || doc.solids[0]
          if (!target) throw new Error(t('noSelection'))
          const info = inertiaOf(target)
          dispatch({ type: 'set-status', status: `${t('femCheck')} ${femStress(info.area).toFixed(3)} N/mm2` })
          break
        }
        case 'femBar': {
          const target = doc.solids.find((solid) => doc.selection.includes(solid.id)) || doc.solids[0]
          if (!target) throw new Error(t('noSelection'))
          const info = inertiaOf(target)
          const bar = femBar(Math.max(1, target.size.y), Math.max(1, info.area), 1000, 210000)
          dispatch({ type: 'set-status', status: `${t('femBar')} σ ${bar.stress.toFixed(3)} δ ${bar.displacement.toFixed(4)}` })
          break
        }
        case 'pocketPath': {
          const sketch = (doc.sketches ?? []).at(-1) ?? makeSketch({ id: 'sketch', shape: 'rect', width: 40, height: 30 })
          downloadText(`${doc.name}-pocket.nc`, pocketGcode(sketch.width, sketch.height, 6, 3, 1))
          break
        }
        case 'exportIfc':
          downloadText(`${doc.name}.ifc`, toIfc(doc.solids))
          break
        case 'solveConstraints': {
          const solved = solveSketchConstraints([{ x: 0, y: 2 }, { x: 40, y: -2 }], [{ kind: 'horizontal', a: 0, b: 1 }, { kind: 'distance', a: 0, b: 1, value: 40 }])
          const nextSketch = makeSketch({ id: 'sketch', name: 'constrained', shape: 'rect', width: Math.abs(solved[1].x - solved[0].x), height: 24 })
          dispatch({ type: 'apply-part', solids: [padSketch(nextSketch, 0.4, 'sketch')], sketch: nextSketch, feature: { id: 'feat', name: 'constraints', kind: 'sketch', solidIds: [], length: 0.4, angle: 0, count: 1, radius: 0 } })
          break
        }
        case 'importPoints': {
          const cloud = pointCloudSolid(parsePoints('0 0 0\n20 0 0\n20 15 5\n0 15 5'), 'points')
          dispatch({ type: 'add-mesh', solid: cloud })
          break
        }
        case 'surfaceFill': {
          const sketch = (doc.sketches ?? []).at(-1) ?? makeSketch({ id: 'sketch', shape: 'rect', width: 40, height: 30 })
          dispatch({ type: 'apply-part', solids: [surfaceFromSketch(sketch, 'surface')], feature: { id: 'feat', name: 'surface', kind: 'pad', solidIds: [], length: 0.2, angle: 0, count: 1, radius: 0 } })
          break
        }
        case 'robotPose': {
          const tip = forwardKinematics([40, 30, 20], [0, 45, -20])
          const marker = createSolid('sphere', 'robot', 1)
          marker.name = 'RobotTip'
          marker.size = { ...marker.size, radius: 6 }
          marker.position = tip
          dispatch({ type: 'add-mesh', solid: marker })
          dispatch({ type: 'set-status', status: `${t('robotPose')} ${tip.x.toFixed(1)}, ${tip.y.toFixed(1)}` })
          break
        }
        case 'importOpenScad': {
          const solid = compileOpenScad('union(){ cube(20); translate([12,0,0]) sphere(8); }')
          dispatch({ type: 'add-mesh', solid })
          break
        }
        case 'inspect': {
          const selected = doc.solids.filter((solid) => doc.selection.includes(solid.id))
          if (selected.length < 2) throw new Error(t('noSelection'))
          const report = inspectSolids(selected[0], selected[1])
          dispatch({ type: 'set-status', status: `${t('inspect')} ΔV ${report.volumeDelta.toFixed(0)} d ${report.centerDistance.toFixed(1)}` })
          break
        }
        case 'measure':
          dispatch({ type: 'set-tool', tool: 'measure' })
          break
        case 'hide': {
          const id = doc.selection[0]
          const solid = doc.solids.find((item) => item.id === id)
          if (solid) dispatch({ type: 'update-solid', id, patch: { visible: !solid.visible } })
          break
        }
        case 'importStl':
        case 'exportStl':
          await handleStl(id === 'exportStl')
          break
        case 'openUrl':
        case 'download':
          await handleLink(id === 'download')
          break
        case 'exportObj':
          downloadText(`${doc.name}.obj`, toObj(doc.solids))
          break
        case 'exportSvg':
          downloadText(`${doc.name}.svg`, sketchesToSvg(doc.sketches ?? []))
          break
        case 'exportDxf':
          downloadText(`${doc.name}.dxf`, sketchesToDxf(doc.sketches ?? []))
          break
        case 'section':
          dispatch({ type: 'set-section', enabled: !doc.section })
          break
        case 'align':
          for (const solidId of doc.selection) dispatch({ type: 'update-solid', id: solidId, patch: { position: { x: 0, y: 0, z: 0 } } })
          break
        case 'coincidence': {
          const selected = doc.solids.filter((solid) => doc.selection.includes(solid.id))
          if (selected.length < 2) throw new Error(t('noSelection'))
          const moved = solveMate(selected[0], selected[1], { id: 'mate', kind: 'coincidence', a: selected[0].id, b: selected[1].id, value: 0 })
          dispatch({ type: 'apply-part', solids: [moved], replaceIds: [selected[1].id], mate: { id: 'mate', kind: 'coincidence', a: selected[0].name, b: selected[1].name, value: 0 }, feature: { id: 'feat', name: 'Coincidence', kind: 'mate', solidIds: [], length: 0, angle: 0, count: 0, radius: 0 } })
          break
        }
        case 'inertia': {
          const target = doc.solids.find((solid) => doc.selection.includes(solid.id)) || doc.solids[0]
          if (!target) throw new Error(t('noSelection'))
          const info = inertiaOf(target)
          dispatch({ type: 'set-status', status: `${t('inertia')} V ${info.volume.toFixed(0)} A ${info.area.toFixed(0)}` })
          break
        }
        case 'updatePart': {
          const sketches = (doc.sketches ?? []).map((item) => updateSketchFromParameters(item, doc.parameters ?? []))
          const feature = [...(doc.features ?? [])].reverse().find((item) => ['sketch', 'pad', 'revolve', 'shaft', 'loft', 'pipe'].includes(item.kind))
          const solid = feature ? rebuildFeatureSolid(feature, sketches) : null
          const replaceId = feature?.solidIds[0]
          if (!solid || !replaceId) throw new Error(t('noSelection'))
          dispatch({ type: 'recompute-part', sketches, solid, replaceId })
          dispatch({ type: 'set-status', status: t('updatePart') })
          break
        }
        case 'union':
        case 'cut':
        case 'common':
          applyBoolean(id as 'union' | 'cut' | 'common')
          break
        default:
          if (PART_OPERATIONS.includes(id)) {
            setPartOp(id)
            setDialog('part')
          }
          break
      }
    } catch (caught) {
      showError(caught)
    }
  }, [applyEffect, doc, openAnyFile, openText, requestClose, saveActive, showError, state, t, withProgress])

  async function handleStl(exporting: boolean) {
    if (exporting) {
      const content = toAsciiStl(doc.selection.length ? doc.solids.filter((solid) => doc.selection.includes(solid.id)) : doc.solids)
      if (window.mycad?.saveFile) {
        await withProgress(t('progress'), t('busySave'), async () => {
          const saved = await window.mycad?.saveFile({
            title: t('exportStl'),
            defaultPath: suggestedPath(lastDirectory(state.settings.lastDirectories, 'import'), `${doc.name}.stl`),
            content,
            filters: [{ name: 'STL', extensions: ['stl'] }]
          })
          if (saved?.filePath) {
            dispatch({ type: 'remember-dir', key: 'import', directory: saved.directory || directoryOf(saved.filePath) })
          }
        })
      } else {
        const blob = new Blob([content], { type: 'model/stl' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${doc.name}.stl`
        link.click()
        URL.revokeObjectURL(url)
      }
      return
    }
    if (window.mycad?.openFile) {
      // The desktop dialog opens where the last mesh came from.
      const picked = await window.mycad.openFile({
        title: t('importStl'),
        defaultPath: lastDirectory(state.settings.lastDirectories, 'import'),
        filters: [{ name: 'STL', extensions: ['stl'] }]
      })
      if (picked.canceled || !picked.content || !picked.filePath) return
      const filePath = picked.filePath
      const text = picked.content
      dispatch({ type: 'remember-dir', key: 'import', directory: picked.directory || directoryOf(filePath) })
      await withProgress(t('progress'), t('busyOpen'), async () => {
        dispatch({ type: 'add-mesh', solid: parseStl(openedBody(text, picked.encoding), `sol-${state.seq + 1}`) })
      })
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.stl'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      await withProgress(t('progress'), t('busyOpen'), async () => {
        const solid = parseStl(await readBody(file, file.name), `sol-${state.seq + 1}`)
        dispatch({ type: 'add-mesh', solid })
      })
    }
    input.click()
  }

  async function handleLink(download: boolean) {
    const url = window.prompt(t('urlPrompt'), 'https://example.com/sample.mycad')
    if (!url) return
    await withProgress(t('progress'), download ? t('busyDownload') : t('busyLink'), async () => {
      if (window.mycad?.download) {
        const result = await window.mycad.download(url)
        if (!result.ok) throw new Error(result.error || url)
        if (download && result.text) await openText(result.text, url)
        else await window.mycad.openExternal(url)
        return
      }
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      if (download) await openText(await response.text(), url)
      else window.open(url, '_blank', 'noopener')
    })
  }

  // Without a pointer to move away there would be no way left to dismiss a
  // menu, since the root click now opens rather than toggles: a press outside
  // closes it, which is also how a touch screen gets out of one.
  useEffect(() => {
    if (!menu && !context) return
    const onDown = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.menu-popup')) return
      setContext(null)
      if (!target?.closest?.('.menu-root')) setMenu(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [context, menu])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // An open menu closes on Escape, like any other desktop menu bar, and
        // so does the right-click menu over the canvas.
        setMenu(null)
        setContext(null)
        return
      }
      const target = event.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (!event.ctrlKey && !event.metaKey) {
        if (event.key === 'Delete') dispatch({ type: 'delete-selected' })
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'c') { event.preventDefault(); void runCommand('copy') }
      if (key === 'v') { event.preventDefault(); void runCommand('paste') }
      if (key === 'z') { event.preventDefault(); dispatch({ type: 'undo' }) }
      if (key === 'y') { event.preventDefault(); dispatch({ type: 'redo' }) }
      if (key === 's') { event.preventDefault(); void runCommand('save') }
      if (key === 'p') { event.preventDefault(); void runCommand('print') }
    }
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      dispatch({ type: 'wheel-zoom', deltaY: event.deltaY, ctrl: true })
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [runCommand])

  const onViewZoom = useCallback((deltaY: number) => {
    dispatch({ type: 'wheel-zoom', deltaY, ctrl: true })
  }, [])

  const onDropFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      const path = window.mycad?.pathForFile?.(file) || file.name
      dispatch({ type: 'remember-dir', key: 'open', directory: directoryOf(path) })
      try {
        if (file.type.startsWith('image/')) {
          const dataUrl = await blobToDataUrl(file)
          dispatch({ type: 'patch-settings', patch: { backgroundImage: dataUrl } })
        } else if (fileTypeFor(file.name) || file.name.toLowerCase().endsWith('.csv')) {
          const text = await readBody(file, file.name)
          await withProgress(t('progress'), t('busyOpen'), async () => { await openAnyFile(path, text) })
        } else {
          await withProgress(t('progress'), t('busyOpen'), async () => openText(await readFile(file), path))
        }
      } catch (caught) {
        showError(caught)
      }
    }
  }, [openAnyFile, openText, showError, t, withProgress])

  // The tab row is as wide as the window lets it be, so the number of tabs on
  // screen follows the window rather than a fixed count.
  useLayoutEffect(() => {
    const strip = tabsRef.current?.parentElement
    if (!strip) return
    const measure = () => setTabRoom(strip.clientWidth)
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(strip)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [])

  // Switching to another document scrolls the strip to it — but only then, so
  // the arrows can walk along the strip without being pulled back.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (scrolledTo.current === state.activeId) return
    scrolledTo.current = state.activeId
    const index = state.documents.findIndex((item) => item.id === state.activeId)
    setTabStart((start) => tabStartFor(index, start, state.documents.length, visibleTabCount(tabRoom, state.documents.length)))
  }, [state.activeId, state.documents, tabRoom])

  // Files dragged in from the desktop: the window itself accepts them, so a
  // drop that lands on a panel, the menu bar or the gap between them opens the
  // file too, and a stray drop can never navigate away from the app.
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (event: DragEvent) => {
      // The canvas handler runs first; anything it took is already prevented.
      if (event.defaultPrevented) return
      const files = Array.from(event.dataTransfer?.files ?? [])
      event.preventDefault()
      if (files.length > 0) void onDropFiles(files)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [onDropFiles])

  // Toolbar buttons that show whether the thing they control is on.
  const toolbarToggles: Record<string, boolean> = {
    grid: state.settings.grid,
    ruler: state.settings.ruler,
    scaleBar: state.settings.scaleBar !== false,
    showAxes: state.settings.showAxes !== false
  }

  const font = fontCss(state.settings.fontStyle)
  // How many tabs the window has room for right now. Every open file keeps
  // its own canvas; the strip just decides how many of them are on screen.
  const maxVisibleTabs = visibleTabCount(tabRoom, state.documents.length)
  const visibleTabs = tabWindow(state.documents, tabStart, maxVisibleTabs)
  const overflow = state.documents.length > maxVisibleTabs
  const measured = selectionDistance(doc)
  const units = state.settings.units ?? 'mm'
  const showToolPanel = state.settings.showToolPanel !== false
  const showPropertyPanel = state.settings.showPropertyPanel !== false
  // Both panels are the same fixed width: wide enough for a whole property row
  // and for the tool labels. They open and close, they do not resize.
  const panelSize = Math.max(MIN_PANEL_WIDTH, naturalPanelWidth || MIN_PANEL_WIDTH)
  const openMenuItems = MENUS.find((item) => item.id === menu)
  // The menu bar and the panel below it are one hover region.
  const menuHover = useCloseOnLeave(Boolean(openMenuItems), () => setMenu(null))
  const contextHover = useCloseOnLeave(Boolean(context), () => setContext(null))

  /** Drop a menu panel under the root it belongs to. */
  const openMenuUnder = useCallback((id: string, root: HTMLElement) => {
    const rect = root.getBoundingClientRect()
    setMenuPos({ x: rect.left, y: rect.bottom })
    setMenu(id)
  }, [])
  // The recent list adds its heading and the "clear all" row to the menu, and
  // the popup has to count those when it decides how tall it can be.
  const recentInMenu = menu === 'file' && state.settings.recentFiles.length > 0
    ? state.settings.recentFiles.length + 2
    : 0
  const popupLayout = useMemo(() => menuPopupLayout({
    count: (openMenuItems ? menuRowCount(openMenuItems) : 0) + recentInMenu,
    anchorX: menuPos.x,
    anchorY: menuPos.y,
    viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth || 1280,
    viewportHeight: typeof window === 'undefined' ? 800 : window.innerHeight || 800
  }), [openMenuItems, recentInMenu, menuPos])

  return (
    <div
      className="app"
      data-theme={state.settings.theme}
      data-min-window-width={minWindowWidth}
      data-theme-mode={theme.mode}
      data-testid="app"
      style={{
        ...themeVars(theme),
        colorScheme: theme.mode,
        minWidth: minWindowWidth,
        fontFamily: state.settings.fontFamily,
        fontSize: state.settings.fontSize,
        fontWeight: font.fontWeight,
        fontStyle: font.fontStyle
      }}
      onDragOver={(event) => {
        event.preventDefault()
        // Tell the desktop this is a copy, so the cursor says so too.
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        event.preventDefault()
        void onDropFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <nav className="menubar" data-testid="menubar" ref={menubarRef} {...menuHover}>
        {MENUS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="menu-root"
            data-testid={`menu-${entry.id}`}
            title={t(entry.labelKey)}
            // The pointer alone opens a menu, and moving along the bar swaps
            // one for the next. A click is then only for the people who have
            // no pointer to hover with, so it opens rather than toggles:
            // toggling would close the panel the hover just opened.
            onMouseEnter={(event) => {
              menuHover.onMouseEnter()
              openMenuUnder(entry.id, event.currentTarget)
            }}
            onClick={(event) => openMenuUnder(entry.id, event.currentTarget)}
          >
            <span className="menu-icon">{menuIcon(entry.id)}</span>
            <span className="menu-label">{t(entry.labelKey)}</span>
          </button>
        ))}
        <label className="workbench">
          <select aria-label={t('partDesign')} data-testid="workbench" value={workbench} onChange={(event) => setWorkbench(event.target.value as WorkbenchId)}>
            {WORKBENCHES.map((item) => <option key={item.id} value={item.id}>{t(item.labelKey)}</option>)}
          </select>
        </label>
      </nav>
      {openMenuItems ? (
        <div
          className="menu-popup"
          role="menu"
          {...menuHover}
          data-layout={popupLayout.columns > 1 ? 'multi-column' : 'single-column'}
          data-columns={popupLayout.columns}
          data-testid="menu-popup"
          style={{ left: popupLayout.left, top: menuPos.y, width: popupLayout.width }}
        >
          {/* No title: the panel hangs off the root that names it, so
              repeating "File" inside the File menu says nothing. */}
          <div
            className="menu-items"
            style={{
              gridTemplateColumns: `repeat(${popupLayout.columns}, minmax(0, 1fr))`,
              // Column by column, the way a desktop menu wraps when it runs out
              // of room, so each column reads top to bottom.
              gridTemplateRows: `repeat(${popupLayout.rows}, auto)`,
              gridAutoFlow: 'column'
            }}
          >
            {menuSections(openMenuItems).map((section) => (
              <Fragment key={section.category ?? 'all'}>
                {section.category ? (
                  <p className="menu-section" data-testid={`menu-section-${section.category}`}>
                    {categoryName(state.settings.language, section.category)}
                  </p>
                ) : null}
                {section.items.map((item) => (
                  <Fragment key={item.id}>
                    {openMenuItems.breaks?.includes(item.id) ? (
                      <span className="menu-separator" data-testid={`menu-separator-${item.id}`} aria-hidden="true" />
                    ) : null}
                    <button type="button" role="menuitem" className="menu-item" data-testid={`menuitem-${item.id}`} title={tip(item.id)} onClick={() => runCommand(item.id)}>
                      <span className="menu-icon">{item.icon}</span>
                      <span className="menu-label">{t(item.labelKey)}</span>
                    </button>
                  </Fragment>
                ))}
              </Fragment>
            ))}
            {menu === 'file' && state.settings.recentFiles.length > 0 ? (
              <>
                <p className="menu-section">{t('recent')}</p>
                {state.settings.recentFiles.map((file) => (
                  <span className="menu-item recent-item" key={file.path}>
                    <button
                      type="button"
                      role="menuitem"
                      className="recent-open"
                      data-testid={`recent-${file.name}`}
                      title={file.path}
                      onClick={() => void openRecent(file.path)}
                    >
                      <span className="menu-icon">{menuIcon('recent')}</span>
                      <span className="menu-label ellipsis">{file.name}</span>
                    </button>
                    <button
                      type="button"
                      className="recent-remove"
                      data-testid={`recent-remove-${file.name}`}
                      title={`${t('remove')}: ${file.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        dispatch({ type: 'remove-recent', path: file.path })
                      }}
                    >✕</button>
                  </span>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  data-testid="recent-clear"
                  title={t('clearRecent')}
                  onClick={() => {
                    dispatch({ type: 'clear-recent' })
                    setMenu(null)
                  }}
                >
                  <span className="menu-icon">{menuIcon('clearRecent')}</span>
                  <span className="menu-label">{t('clearRecent')}</span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="toolbar" data-testid="toolbar" ref={toolbarRef}>
        {TOOLBAR_GROUPS.map((group, index) => (
          <span key={group[0]} style={{ display: 'contents' }}>
            {index > 0 ? <span className="toolbar-sep" /> : null}
            {group.map((id) => (
              <button
                key={id}
                type="button"
                className={toolbarToggles[id] ? 'tool on' : 'tool'}
                data-testid={`tb-${id}`}
                // The axes button says what the next click does.
                title={id === 'showAxes' && toolbarToggles.showAxes ? t('hideAxes') : t(id)}
                onClick={() => runCommand(id)}
              >
                <span className="menu-icon">
                  {id === 'showAxes' ? <AxesMark on={toolbarToggles.showAxes} /> : menuIcon(id)}
                </span>
              </button>
            ))}
          </span>
        ))}
        <span className="toolbar-sep" />
        {(['toolPanel', 'propertyPanel'] as const).map((id) => {
          const open = id === 'toolPanel' ? showToolPanel : showPropertyPanel
          return (
            <button
              key={id}
              type="button"
              className={open ? 'tool on' : 'tool'}
              data-testid={`tb-${id}`}
              aria-pressed={open}
              title={`${t(id)}: ${open ? t('show') : t('hide')}`}
              onClick={() => runCommand(id)}
            >
              <span className="menu-icon">{menuIcon(id)}</span>
            </button>
          )
        })}
        <span className="toolbar-sep" />
        <FontControl
          size={state.settings.fontSize}
          label={t('fontSize')}
          onSize={(value) => dispatch({ type: 'patch-settings', patch: { fontSize: value } })}
        />
        <span className="toolbar-sep" />
        <ZoomControl
          zoom={state.zoom}
          label={t('zoom')}
          onZoom={(value) => dispatch({ type: 'set-zoom', zoom: value })}
        />
        <span className="toolbar-sep" />
        <LightPicker
          light={state.settings.light}
          lights={state.settings.lights}
          activeLight={state.settings.activeLight}
          language={state.settings.language}
          label={t('lightRig')}
          onChange={(patch) => dispatch({ type: 'patch-settings', patch: { light: { ...state.settings.light, ...patch } } })}
          onLights={(lights, activeLight) => dispatch({ type: 'patch-settings', patch: { lights, activeLight } })}
        />
        <span className="toolbar-spacer" />
        <button
          type="button"
          className="tool tool-flag"
          data-testid="tb-language"
          title={`${t('language')}: ${state.settings.language === 'ko' ? t('english') : t('korean')}`}
          onClick={() => runCommand('language')}
        >
          <LanguageFlag language={state.settings.language} size={15} />
        </button>
        <ThemePicker
          themeId={state.settings.theme}
          customTheme={state.settings.customTheme}
          language={state.settings.language}
          label={t('theme')}
          onPick={(id) => dispatch({ type: 'patch-settings', patch: { theme: id } })}
        />
        <button type="button" className="tool" data-testid="tb-settings" title={t('settings')} onClick={() => runCommand('settings')}>
          <span className="menu-icon">{menuIcon('settings')}</span>
        </button>
        <button type="button" className="tool tool-about" data-testid="tb-about" title={t('about')} onClick={() => runCommand('about')}>
          <svg className="about-mark" data-testid="about-mark" viewBox="0 0 20 20" width={17} height={17} role="img" aria-label={t('about')}>
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="10" cy="5.6" r="1.2" fill="currentColor" />
            <rect x="8.9" y="8.2" width="2.2" height="6.6" rx="1.1" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div
        className="workspace"
        data-testid="workspace"
        style={{
          gridTemplateColumns: `${showToolPanel ? panelSize : 0}px minmax(0, 1fr) ${showPropertyPanel ? panelSize : 0}px`
        }}
      >
        <aside className="panel left" data-testid="left-panel" hidden={!showToolPanel} style={{ gridColumn: 1 }}>
          <h2 className="panel-title">
            <span className="ellipsis">{t('toolsPanel')}</span>
            <button
              type="button"
              className="panel-close"
              data-testid="close-tool-panel"
              title={`${t('toolPanel')}: ${t('hide')}`}
              onClick={() => runCommand('toolPanel')}
            >✕</button>
          </h2>
          <div className="tool-groups" data-testid="tool-grid" ref={toolGridRef}>
            {groupTools(workbenchTools(workbench)).map((group) => (
              <section className="tool-group" key={group.category.id} data-testid={`tool-group-${group.category.id}`}>
                <h3 className="tool-group-title">
                  <span className="menu-icon">{group.category.icon}</span>
                  <span className="ellipsis">{categoryName(state.settings.language, group.category.id)}</span>
                  <span className="tool-group-count">{group.tools.length}</span>
                </h3>
                <div className="tool-grid">
                  {group.tools.map((id) => (
                    <button key={id} type="button" className={state.tool === id ? 'tool on' : 'tool'} title={tip(id)} onClick={() => runCommand(id)}>
                      <span className="menu-icon">{menuIcon(id)}</span>
                      <span className="ellipsis">{t(id)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <h2 className="panel-title">{t('specTree')}</h2>
          <div className="spec-tree" data-testid="spec-tree">
            {specTreeRows(doc.features ?? [], doc.parameters ?? [], doc.mates ?? [], doc.solids).map((row) => {
              const refs = row.refs.filter((id) => doc.solids.some((solid) => solid.id === id))
              const picked = refs.length > 0 && refs.every((id) => doc.selection.includes(id))
              return (
                <button
                  type="button"
                  className={picked ? 'tree-node on' : 'tree-node'}
                  key={row.key}
                  data-testid={`spec-row-${row.key}`}
                  aria-pressed={picked}
                  disabled={refs.length === 0}
                  title={row.label}
                  style={{ paddingLeft: 8 + row.depth * 8 }}
                  onClick={() => dispatch({ type: 'select', ids: refs })}
                >
                  <span className="twist">{row.depth === 0 ? '▾' : refs.length ? '▸' : '·'}</span>
                  <span className="ellipsis">{row.label}</span>
                  {picked ? <span className="pick-mark" aria-hidden="true">✓</span> : null}
                </button>
              )
            })}
          </div>
          <h2 className="panel-title">{t('features')}</h2>
          {(doc.features ?? []).map((feature) => {
            const picked = feature.solidIds.length > 0 && feature.solidIds.every((id) => doc.selection.includes(id))
            return (
              <button
                type="button"
                className={picked ? 'tree on' : 'tree'}
                key={feature.id}
                data-testid={`feature-${feature.id}`}
                aria-pressed={picked}
                title={feature.name}
                onClick={() => dispatch({ type: 'select', ids: feature.solidIds })}
              >
                <span className="menu-icon">{menuIcon(feature.kind)}</span>
                <span className="ellipsis">{feature.name}</span>
                {picked ? <span className="pick-mark" aria-hidden="true">✓</span> : null}
              </button>
            )
          })}
          <h2 className="panel-title">{t('scene')}</h2>
          {doc.solids.map((solid) => (
            <button
              key={solid.id}
              type="button"
              className={doc.selection.includes(solid.id) ? 'tree on' : 'tree'}
              data-testid={`solid-${solid.id}`}
              aria-pressed={doc.selection.includes(solid.id)}
              title={solid.name}
              onClick={() => dispatch({ type: 'select', ids: [solid.id] })}
            >
              <span className="menu-icon">{menuIcon(solid.kind)}</span>
              <span className="ellipsis">{solid.name}</span>
              {doc.selection.includes(solid.id) ? <span className="pick-mark" aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </aside>
        <main className="center" style={{ gridColumn: 2 }}>
          <div className="tabstrip" data-testid="tabstrip">
            {overflow ? <button type="button" data-testid="tab-prev" title={t('tabPrev')} onClick={() => setTabStart(nextTabStart('prev', tabStart, state.documents.length, maxVisibleTabs))}>{'<'}</button> : null}
            <div className="tabs-row" ref={tabsRef} data-testid="tabs-row">
              {visibleTabs.map((item) => (
                <button key={item.id} type="button" className={item.id === state.activeId ? 'tab on' : 'tab'} data-testid={`tab-${item.id}`} title={item.name} onClick={() => dispatch({ type: 'activate', id: item.id })}>
                  <span>{item.name}{item.dirty ? ' *' : ''}</span>
                  <span role="button" title={t('close')} onClick={(event) => { event.stopPropagation(); requestClose(() => dispatch({ type: 'close-doc', id: item.id })) }}>×</span>
                </button>
              ))}
            </div>
            {overflow ? <button type="button" data-testid="tab-next" title={t('tabNext')} onClick={() => setTabStart(nextTabStart('next', tabStart, state.documents.length, maxVisibleTabs))}>{'>'}</button> : null}
          </div>
          <Suspense fallback={<div className="viewport" data-testid="viewport-loading" />}>
          <Viewport
            doc={doc}
            settings={state.settings}
            zoom={state.zoom}
            onSelect={(id, additive) => dispatch({ type: 'select', ids: id ? [id] : [], additive })}
            onCursor={(cursor) => dispatch({ type: 'set-cursor', cursor })}
            onContext={(x, y) => setContext({ x, y })}
            onDropFiles={(files) => void onDropFiles(files)}
            onZoom={onViewZoom}
            resetKey={viewReset}
            onPreset={(preset) => dispatch({ type: 'set-preset', preset })}
          onMoveSolid={(id, position) => dispatch({ type: 'move-solid', id, position })}
          onMoveScaleMarker={(at) => dispatch({ type: 'patch-settings', patch: { scaleMarker: at } })}
          onMoveLight={(angles, index) => dispatch({
            type: 'patch-settings',
            // Dragging a marker moves that light, whichever one it is.
            patch: { lights: state.settings.lights.map((item, at) => (at === index ? { ...item, ...angles } : item)), activeLight: index }
          })}
          />
          </Suspense>
        </main>
        <aside className="panel right" data-testid="right-panel" hidden={!showPropertyPanel} style={{ gridColumn: 3 }}>
          <h2 className="panel-title">
            <span className="ellipsis">{t('properties')}</span>
            <button
              type="button"
              className="panel-close"
              data-testid="close-property-panel"
              title={`${t('propertyPanel')}: ${t('hide')}`}
              onClick={() => runCommand('propertyPanel')}
            >✕</button>
          </h2>
          {doc.selection.length === 0 ? <p className="row">{t('emptyProps')}</p> : null}
          {doc.solids.filter((solid) => doc.selection.includes(solid.id)).slice(0, 1).map((solid) => (
            <PropertyEditor key={solid.id} solidId={solid.id} state={state} t={t} dispatch={dispatch} />
          ))}
        </aside>
      </div>
      <footer className="statusbar" data-testid="statusbar">
        <span data-testid="status-text">{state.status === 'ready' ? t('statusReady') : state.status}</span>
        <span data-testid="status-objects">{t('objects')}: {doc.solids.length}</span>
        <span data-testid="status-selection">{t('selection')}: {doc.selection.length}</span>
        <span data-testid="status-snap">{t('snap')}: {formatLength(state.settings.snap, units)}</span>
        <span data-testid="status-zoom">{t('zoom')}: {state.zoom}</span>
        <span data-testid="status-units">{t('units')}: {unitSuffix(units)}</span>
        <span data-testid="status-style">{t('drawStyle')}: {t(doc.shade)}</span>
        <span data-testid="status-projection">{t(state.settings.projection)}</span>
        <span data-testid="status-dirty">{doc.dirty ? t('modified') : t('saved')}</span>
        <span data-testid="status-doc">{doc.name}</span>
        <span data-testid="status-cursor">{state.cursor ? `${state.cursor.x}, ${state.cursor.y}, ${state.cursor.z}` : '0, 0, 0'}</span>
        <span data-testid="status-measure">{state.tool === 'measure' && measured != null
          ? formatLength(measured, units)
          : doc.selection.length
            ? `${t('volume')}: ${formatVolume(solidVolume(doc.solids.find((solid) => solid.id === doc.selection[0]) || doc.solids[0]), units)}`
            : ''}</span>
        <span
          className="size-grip"
          data-testid="size-grip"
          title={t('fit')}
          onPointerDown={(event) => {
            event.preventDefault()
            const startX = event.screenX
            const startY = event.screenY
            let lastX = startX
            let lastY = startY
            const move = (ev: PointerEvent) => {
              window.mycad?.resizeBy?.(ev.screenX - lastX, ev.screenY - lastY)
              lastX = ev.screenX
              lastY = ev.screenY
            }
            const up = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
          }}
        />
      </footer>
      {context ? (
        <div className="menu-popup" role="menu" data-layout="single-column" data-testid="context-menu" {...contextHover} style={{ left: context.x, top: context.y }}>
          <header className="popup-title menu-popup-title" data-testid="popup-title">
            <span className="popup-heading">
              <span className="menu-icon" data-testid="popup-icon">{menuIcon('context')}</span>
              <strong>{t('context')}</strong>
            </span>
          </header>
          {CONTEXT_ITEMS.map((item) => (
            <button key={item.id} type="button" role="menuitem" className="menu-item" title={tip(item.id)} onClick={() => runCommand(item.id)}>
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {dialog === 'about' ? <AboutDialog platform={window.mycad?.platform || 'web'} t={t} language={state.settings.language} onClose={() => setDialog(null)} /> : null}
      {dialog === 'usage' ? <UsageDialog lang={state.settings.language} t={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'export' ? (
        <ExportDialog
          doc={doc}
          t={t}
          language={state.settings.language}
          selectionCount={doc.selection.length}
          onExport={(formatId, selectedOnly) => { void exportAs(formatId, selectedOnly) }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'report' ? <ReportDialog title={report.title || t('reportTitle')} lines={report.lines} copyLabel={t('reportCopy')} closeLabel={t('close')} onClose={() => setDialog(null)} /> : null}
      {dialog === 'error' ? <ErrorDialog message={error.message} detail={error.detail} label={t('errorTitle')} copyLabel={t('copyError')} closeLabel={t('close')} onClose={() => setDialog(null)} /> : null}
      {dialog === 'settings' ? (
        <SettingsDialog
          settings={state.settings}
          fonts={fonts.includes(state.settings.fontFamily) ? fonts : [state.settings.fontFamily, ...fonts]}
          t={t}
          onChange={(patch) => dispatch({ type: 'patch-settings', patch })}
          onRemoveRecent={(path) => dispatch({ type: 'remove-recent', path })}
          onClearRecent={() => dispatch({ type: 'clear-recent' })}
          shade={doc.shade}
          onShade={(shade) => dispatch({ type: 'set-shade', shade })}
          onPickBackground={async (file) => {
            dispatch({ type: 'patch-settings', patch: { backgroundImage: await blobToDataUrl(file) } })
            dispatch({ type: 'remember-dir', key: 'background', directory: directoryOf(file.name) })
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'print' ? (
        <PrintDialog
          t={t}
          docs={state.documents}
          scope={printScope}
          customIds={customIds}
          selectedOnly={selectedOnly}
          setup={pageSetup}
          pages={pages}
          pageIndex={Math.min(pageIndex, Math.max(0, pages.length - 1))}
          onScope={setPrintScope}
          onToggleDoc={(id) => setCustomIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])}
          onSelectedOnly={setSelectedOnly}
          onSetup={setPageSetup}
          onPage={setPageIndex}
          onPrint={() => { void printNow() }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'part' ? (
        <PartDialog
          title={t(partOp as MessageKey)}
          op={partOp}
          t={t}
          language={state.settings.language}
          onApply={applyPart}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'confirm' ? (
        <ConfirmDialog
          message={t('saveChanges')}
          saveLabel={t('saveBtn')}
          discardLabel={t('discard')}
          cancelLabel={t('cancel')}
          onSave={async () => {
            // Save every tab that has changes, not just the one on screen.
            for (const item of dirtyDocuments()) {
              if (!(await saveDocument(item, false))) return
            }
            const next = pendingClose
            setDialog(null)
            setPendingClose(null)
            next?.()
          }}
          onDiscard={() => {
            const next = pendingClose
            setDialog(null)
            setPendingClose(null)
            next?.()
          }}
          onCancel={() => { setDialog(null); setPendingClose(null); window.mycad?.confirmClose(false) }}
        />
      ) : null}
      {progress ? <ProgressDialog title={progress.title} message={progress.message} percent={progress.percent} /> : null}
      <div className="print-area" data-testid="print-area" dangerouslySetInnerHTML={{ __html: printSheets }} />
      <span className="sr" data-testid="undo-state">{canUndo(state) ? 'yes' : 'no'}</span>
      <span className="sr" data-testid="redo-state">{canRedo(state) ? 'yes' : 'no'}</span>
      <span className="sr" data-testid="author-credit">{AUTHOR}</span>
    </div>
  )
}

function PropertyEditor({
  solidId,
  state,
  t,
  dispatch
}: {
  solidId: string
  state: AppState
  t: (key: MessageKey) => string
  dispatch: (action: Parameters<typeof reducer>[1]) => void
}) {
  const solid = activeDocument(state).solids.find((item) => item.id === solidId)
  if (!solid) return null
  const units = state.settings.units ?? 'mm'
  const setNumber = (group: 'position' | 'rotation' | 'scale' | 'size', key: string, value: number) => {
    dispatch({ type: 'update-solid', id: solid.id, patch: { [group]: { ...solid[group], [key]: value } } as never })
  }
  const axes = ['x', 'y', 'z'] as const
  return (
    <div data-testid="property-editor">
      <label className="row"><span>{t('name')}</span><input aria-label={t('name')} value={solid.name} onChange={(event) => dispatch({ type: 'update-solid', id: solid.id, patch: { name: event.target.value } })} /></label>
      <label className="row"><span>{t('color')}</span><input aria-label={t('color')} type="color" value={solid.color} onChange={(event) => dispatch({ type: 'update-solid', id: solid.id, patch: { color: event.target.value } })} /></label>
      <fieldset className="field-group">
        <legend>{`${t('position')} (${unitSuffix(units)})`}</legend>
        {axes.map((axis) => (
          <div className="row" key={axis}><span>{axis.toUpperCase()}</span>
            <NumberField
              id={`prop-position-${axis}`}
              label={`${t('position')} ${axis}`}
              value={solid.position[axis]}
              step={1}
              suffix="mm"
              onChange={(value) => setNumber('position', axis, value)}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="field-group">
        <legend>{`${t('rotation')} (°)`}</legend>
        {axes.map((axis) => (
          <div className="row" key={axis}><span>{axis.toUpperCase()}</span>
            <NumberField
              id={`prop-rotation-${axis}`}
              label={`${t('rotation')} ${axis}`}
              value={solid.rotation[axis]}
              min={-360}
              max={360}
              step={5}
              suffix="°"
              onChange={(value) => setNumber('rotation', axis, value)}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="field-group">
        <legend>{`${t('dimensions')} (${unitSuffix(units)})`}</legend>
        {axes.map((axis) => (
          <div className="row" key={axis}><span>{axis.toUpperCase()}</span>
            <NumberField
              id={`prop-size-${axis}`}
              label={`${t('dimensions')} ${axis}`}
              value={solid.size[axis]}
              min={0.1}
              step={1}
              suffix="mm"
              onChange={(value) => setNumber('size', axis, value)}
            />
          </div>
        ))}
        <div className="row"><span>R</span>
          <NumberField id="prop-size-radius" label={`${t('dimensions')} r`} value={solid.size.radius} min={0} step={1} suffix="mm" onChange={(value) => setNumber('size', 'radius', value)} />
        </div>
      </fieldset>
      <fieldset className="field-group">
        <legend>{t('scale')}</legend>
        {axes.map((axis) => (
          <div className="row" key={axis}><span>{axis.toUpperCase()}</span>
            <NumberField
              id={`prop-scale-${axis}`}
              label={`${t('scale')} ${axis}`}
              value={solid.scale[axis]}
              min={0.01}
              step={0.1}
              onChange={(value) => setNumber('scale', axis, value)}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="field-group">
        <legend>{t('material')}</legend>
        <div className="row"><span>{t('metalness')}</span>
          <NumberField id="prop-metalness" label={t('metalness')} value={solid.metalness} min={0} max={1} step={0.05} onChange={(value) => dispatch({ type: 'update-solid', id: solid.id, patch: { metalness: value } })} />
        </div>
        <div className="row"><span>{t('roughness')}</span>
          <NumberField id="prop-roughness" label={t('roughness')} value={solid.roughness} min={0} max={1} step={0.05} onChange={(value) => dispatch({ type: 'update-solid', id: solid.id, patch: { roughness: value } })} />
        </div>
      </fieldset>
      <label className="row"><span>{t('visible')}</span><input aria-label={t('visible')} type="checkbox" checked={solid.visible} onChange={(event) => dispatch({ type: 'update-solid', id: solid.id, patch: { visible: event.target.checked } })} /></label>
      <label className="row"><span>{t('locked')}</span><input aria-label={t('locked')} type="checkbox" checked={solid.locked} onChange={(event) => dispatch({ type: 'update-solid', id: solid.id, patch: { locked: event.target.checked } })} /></label>
    </div>
  )
}

/**
 * Intrinsic width of every tool label in the grid. The label spans stretch to
 * their button, so their own box width says nothing about the text; the text is
 * measured with the same font on a canvas instead.
 */
function measureLabelWidths(grid: HTMLElement): number[] {
  const labels = [...grid.querySelectorAll<HTMLElement>('.tool .ellipsis')]
  if (labels.length === 0) return []
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return labels.map((label) => label.scrollWidth)
  const style = getComputedStyle(labels[0])
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return labels.map((label) => context.measureText(label.textContent ?? '').width)
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function blobToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
