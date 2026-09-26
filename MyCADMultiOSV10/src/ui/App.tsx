import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AUTHOR, MIN_WINDOW_WIDTH, windowTitle } from '../core/buildInfo'
import { decodeClipboard } from '../core/clipboard'
import { directoryOf } from '../core/recent'
import { detectBrowserFonts, FALLBACK_FONTS, mergeFonts } from '../core/fonts'
import { menuIcon, translate, type MessageKey } from '../core/i18n'
import { CONTEXT_ITEMS, MENUS, TOOLBAR } from '../core/menus'
import { createSolid, type SolidKind, type ViewPreset } from '../core/model'
import { selectionDistance } from '../core/print'
import { buildPrintPages, defaultPageSetup, type PageSetup, type PrintScope } from '../core/print'
import { browserStorage, fontCss, sanitizeSettings } from '../core/settings'
import { fileNameFromPath, parseDocument, serializeDocument } from '../core/serialize'
import { activeDocument, canRedo, canUndo, createInitialState, reducer, type AppState } from '../core/store'
import { parseStl, toAsciiStl } from '../core/stl'
import { sketchesToDxf, sketchesToSvg } from '../core/drawing'
import { booleanSolids, filletBox, helixSolid, holeTool, linearPattern, loftSketches, makeSketch, mirrorSolid, padSketch, pipeSketch, polarPattern, rebuildFeatureSolid, revolveSketch, solidVolume, toObj, type WorkPlane } from '../core/part'
import { WORKBENCHES, femStress, sketchToGcode, workbenchTools, type WorkbenchId } from '../core/workbenches'
import { compileOpenScad, femBar, forwardKinematics, inspectSolids, parsePoints, pocketGcode, pointCloudSolid, solveSketchConstraints, surfaceFromSketch, toIfc } from '../core/extended'
import { draftSolid, evaluateFormula, inertiaOf, rectangularPattern, referencePlane, shaft, groove, shellSolid, solveMate, specTreeLines, steppedHole, transformSolid, updateSketchFromParameters } from '../core/catia'
import { nextTabStart, tabsOverflow, tabWindow } from '../core/tabs'
import { AboutDialog, ConfirmDialog, ErrorDialog, PartDialog, PrintDialog, ProgressDialog, SettingsDialog, UsageDialog } from './dialogs'
import { Viewport } from './Viewport'

const VISIBLE_TABS = 4
type DialogKind = 'about' | 'settings' | 'print' | 'error' | 'confirm' | 'part' | 'usage' | null

async function readFile(file: Blob): Promise<string> {
  if (typeof (file as File).text === 'function') return (file as File).text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
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
  const [loaded, setLoaded] = useState(false)
  const [partOp, setPartOp] = useState('sketchRect')
  const [workbench, setWorkbench] = useState<WorkbenchId>('partDesign')
  const clipRef = useRef('')

  const doc = activeDocument(state)
  const t = useCallback((key: MessageKey) => translate(state.settings.language, key), [state.settings.language])
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

  const showError = useCallback((caught: unknown) => {
    const err = caught instanceof Error ? caught : new Error(String(caught))
    setError({ message: err.message, detail: err.stack || err.message })
    setDialog('error')
  }, [])

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

  const saveActive = useCallback(async (forceDialog: boolean) => {
    const current = activeDocument(state)
    let path = !forceDialog ? current.filePath : undefined
    const content = serializeDocument({ ...current, name: current.name })
    if (window.mycad?.saveFile) {
      const result = await window.mycad.saveFile({
        title: t('save'),
        defaultPath: path || state.settings.lastDirectories.save,
        content,
        filters: [{ name: 'MyCAD', extensions: ['mycad'] }]
      })
      if (result.canceled || !result.filePath) return false
      path = result.filePath
      if (result.directory) dispatch({ type: 'remember-dir', key: 'save', directory: result.directory })
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
    if (path) dispatch({ type: 'mark-saved', path })
    return true
  }, [state, t])

  const requestClose = useCallback((after?: () => void) => {
    if (!activeDocument(state).dirty) {
      after?.()
      return
    }
    setPendingClose(() => after ?? (() => undefined))
    setDialog('confirm')
  }, [state])

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

  const runCommand = useCallback(async (id: string) => {
    setMenu(null)
    setContext(null)
    const kinds: SolidKind[] = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane']
    if (kinds.includes(id as SolidKind)) {
      dispatch({ type: 'add-solid', kind: id as SolidKind })
      dispatch({ type: 'set-tool', tool: id })
      return
    }
    const presets: ViewPreset[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']
    if (presets.includes(id as ViewPreset)) {
      dispatch({ type: 'set-preset', preset: id as ViewPreset })
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
              defaultPath: state.settings.lastDirectories.open,
              filters: [{ name: 'MyCAD', extensions: ['mycad'] }]
            })
            if (!result.canceled && result.content) {
              await withProgress(t('progress'), t('busyOpen'), async () => openText(result.content || '', result.filePath))
            }
          } else {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.mycad,application/json'
            input.onchange = async () => {
              const file = input.files?.[0]
              if (!file) return
              await withProgress(t('progress'), t('busyOpen'), async () => openText(await readFile(file), file.name))
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
        case 'shaded':
          dispatch({ type: 'set-shade', shade: 'shaded' })
          break
        case 'wireframe':
          dispatch({ type: 'set-shade', shade: 'wireframe' })
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
        case 'print':
          setPageIndex(0)
          setDialog('print')
          break
        case 'settings':
          setDialog('settings')
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
          if (['sketchRect', 'sketchCircle', 'sketchPolygon', 'pad', 'pocket', 'revolve', 'loft', 'pipe', 'helix', 'fillet', 'chamfer', 'mirror', 'linearPattern', 'polarPattern', 'hole', 'shaft', 'groove', 'draft', 'shell', 'rectPattern', 'translate', 'rotateBody', 'scaleBody', 'counterbore', 'countersink', 'refPlane', 'parameter', 'offsetMate'].includes(id)) {
            setPartOp(id)
            setDialog('part')
          }
          break
      }
    } catch (caught) {
      showError(caught)
    }
  }, [doc, openText, requestClose, saveActive, showError, state, t, withProgress])

  async function handleStl(exporting: boolean) {
    if (exporting) {
      const content = toAsciiStl(doc.selection.length ? doc.solids.filter((solid) => doc.selection.includes(solid.id)) : doc.solids)
      if (window.mycad?.saveFile) {
        await withProgress(t('progress'), t('busySave'), async () => {
          await window.mycad?.saveFile({
            title: t('exportStl'),
            defaultPath: state.settings.lastDirectories.import,
            content,
            filters: [{ name: 'STL', extensions: ['stl'] }]
          })
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
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.stl'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      await withProgress(t('progress'), t('busyOpen'), async () => {
        const solid = parseStl(await readFile(file), `sol-${state.seq + 1}`)
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
        if (file.name.toLowerCase().endsWith('.stl')) {
          const solid = parseStl(await readFile(file), `sol-drop-${file.name}`)
          dispatch({ type: 'add-mesh', solid })
        } else if (file.type.startsWith('image/')) {
          const dataUrl = await blobToDataUrl(file)
          dispatch({ type: 'patch-settings', patch: { backgroundImage: dataUrl } })
        } else {
          await withProgress(t('progress'), t('busyOpen'), async () => openText(await readFile(file), path))
        }
      } catch (caught) {
        showError(caught)
      }
    }
  }, [openText, showError, t, withProgress])

  const font = fontCss(state.settings.fontStyle)
  const visibleTabs = tabWindow(state.documents, tabStart, VISIBLE_TABS)
  const overflow = tabsOverflow(state.documents.length, VISIBLE_TABS)
  const measured = selectionDistance(doc)
  const openMenuItems = MENUS.find((item) => item.id === menu)

  return (
    <div
      className="app"
      data-theme={state.settings.theme}
      data-min-window-width={MIN_WINDOW_WIDTH}
      data-testid="app"
      style={{
        minWidth: MIN_WINDOW_WIDTH,
        fontFamily: state.settings.fontFamily,
        fontSize: state.settings.fontSize,
        fontWeight: font.fontWeight,
        fontStyle: font.fontStyle
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        void onDropFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <nav className="menubar" data-testid="menubar">
        {MENUS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="menu-root"
            data-testid={`menu-${entry.id}`}
            title={t(entry.labelKey)}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setMenuPos({ x: rect.left, y: rect.bottom })
              setMenu(menu === entry.id ? null : entry.id)
            }}
          >{t(entry.labelKey)}</button>
        ))}
        <label className="workbench">
          <select aria-label={t('partDesign')} data-testid="workbench" value={workbench} onChange={(event) => setWorkbench(event.target.value as WorkbenchId)}>
            {WORKBENCHES.map((item) => <option key={item.id} value={item.id}>{t(item.labelKey)}</option>)}
          </select>
        </label>
      </nav>
      {openMenuItems ? (
        <div className="menu-popup" role="menu" data-layout="single-column" data-testid="menu-popup" style={{ left: menuPos.x, top: menuPos.y }}>
          <header className="popup-title menu-popup-title" data-testid="popup-title">
            <span className="popup-heading">
              <span className="menu-icon" data-testid="popup-icon">{menuIcon(openMenuItems.id)}</span>
              <strong>{t(openMenuItems.labelKey)}</strong>
            </span>
          </header>
          {openMenuItems.items.map((item) => (
            <button key={item.id} type="button" role="menuitem" className="menu-item" data-testid={`menuitem-${item.id}`} title={t(item.labelKey)} onClick={() => runCommand(item.id)}>
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{t(item.labelKey)}</span>
            </button>
          ))}
          {menu === 'file' ? state.settings.recentFiles.map((file) => (
            <button key={file.path} type="button" role="menuitem" className="menu-item" title={file.path} onClick={() => void runCommand('open')}>
              <span className="menu-icon">{menuIcon('recent')}</span>
              <span className="menu-label">{file.name}</span>
            </button>
          )) : null}
        </div>
      ) : null}
      <div className="toolbar" data-testid="toolbar" style={{ minWidth: MIN_WINDOW_WIDTH - 16 }}>
        {[['new', 'open', 'save'], ['undo', 'redo'], ['select', 'box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'], ['delete', 'copy', 'paste'], ['front', 'top', 'iso', 'zoomIn', 'zoomOut', 'fit', 'grid', 'ruler'], ['print', 'settings', 'about']].map((group, index) => (
          <span key={group[0]} style={{ display: 'contents' }}>
            {index > 0 ? <span className="toolbar-sep" /> : null}
            {group.map((id) => (
              <button key={id} type="button" className={(id === 'ruler' && state.settings.ruler) || (id === 'grid' && state.settings.grid) ? 'tool on' : 'tool'} data-testid={`tb-${id}`} title={t(id as MessageKey)} onClick={() => runCommand(id)}>
                <span className="menu-icon">{menuIcon(id)}</span>
              </button>
            ))}
          </span>
        ))}
      </div>
      <div className="workspace">
        <aside className="panel left" data-testid="left-panel">
          <h2 className="panel-title">{t('toolsPanel')}</h2>
          <div className="tool-grid" data-testid="tool-grid">
            {workbenchTools(workbench).map((id) => (
              <button key={id} type="button" className={state.tool === id ? 'tool on' : 'tool'} title={t(id)} onClick={() => runCommand(id)}>
                <span className="menu-icon">{menuIcon(id)}</span>
                <span className="ellipsis">{t(id)}</span>
              </button>
            ))}
          </div>
          <h2 className="panel-title">{t('specTree')}</h2>
          <div className="spec-tree" data-testid="spec-tree">
            {specTreeLines(doc.features ?? [], doc.parameters ?? [], doc.mates ?? []).map((line) => {
              const depth = line.match(/^ */)?.[0].length ?? 0
              return (
                <p className="tree-node" key={line} style={{ paddingLeft: 8 + depth * 8 }}>
                  <span className="twist">{depth === 0 ? '▾' : '▸'}</span>
                  <span className="ellipsis">{line.trim()}</span>
                </p>
              )
            })}
          </div>
          <h2 className="panel-title">{t('features')}</h2>
          {(doc.features ?? []).map((feature) => (
            <p className="row" key={feature.id} data-testid={`feature-${feature.id}`}>{feature.name}</p>
          ))}
          <h2 className="panel-title">{t('scene')}</h2>
          {doc.solids.map((solid) => (
            <button key={solid.id} type="button" className={doc.selection.includes(solid.id) ? 'tree on' : 'tree'} data-testid={`solid-${solid.id}`} title={solid.name} onClick={() => dispatch({ type: 'select', ids: [solid.id] })}>
              <span className="menu-icon">{menuIcon(solid.kind)}</span>
              <span>{solid.name}</span>
            </button>
          ))}
        </aside>
        <main className="center">
          <div className="tabstrip" data-testid="tabstrip">
            {overflow ? <button type="button" data-testid="tab-prev" title={t('tabPrev')} onClick={() => setTabStart(nextTabStart('prev', tabStart, state.documents.length, VISIBLE_TABS))}>{'<'}</button> : null}
            <div className="tabs-row">
              {visibleTabs.map((item) => (
                <button key={item.id} type="button" className={item.id === state.activeId ? 'tab on' : 'tab'} data-testid={`tab-${item.id}`} title={item.name} onClick={() => dispatch({ type: 'activate', id: item.id })}>
                  <span>{item.name}{item.dirty ? ' *' : ''}</span>
                  <span role="button" title={t('close')} onClick={(event) => { event.stopPropagation(); requestClose(() => dispatch({ type: 'close-doc', id: item.id })) }}>×</span>
                </button>
              ))}
            </div>
            {overflow ? <button type="button" data-testid="tab-next" title={t('tabNext')} onClick={() => setTabStart(nextTabStart('next', tabStart, state.documents.length, VISIBLE_TABS))}>{'>'}</button> : null}
          </div>
          <Viewport
            doc={doc}
            settings={state.settings}
            zoom={state.zoom}
            onSelect={(id, additive) => dispatch({ type: 'select', ids: id ? [id] : [], additive })}
            onCursor={(cursor) => dispatch({ type: 'set-cursor', cursor })}
            onContext={(x, y) => setContext({ x, y })}
            onDropFiles={(files) => void onDropFiles(files)}
            onZoom={onViewZoom}
            onPreset={(preset) => dispatch({ type: 'set-preset', preset })}
          />
        </main>
        <aside className="panel right" data-testid="right-panel">
          <h2 className="panel-title">{t('properties')}</h2>
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
        <span data-testid="status-snap">{t('snap')}: {state.settings.snap}</span>
        <span data-testid="status-zoom">{t('zoom')}: {state.zoom}</span>
        <span data-testid="status-units">{t('units')}: mm</span>
        <span data-testid="status-dirty">{doc.dirty ? t('modified') : t('saved')}</span>
        <span data-testid="status-doc">{doc.name}</span>
        <span data-testid="status-cursor">{state.cursor ? `${state.cursor.x}, ${state.cursor.y}, ${state.cursor.z}` : '0, 0, 0'}</span>
        <span data-testid="status-measure">{state.tool === 'measure' && measured != null ? measured.toFixed(2) : doc.selection.length ? `${t('volume')}: ${solidVolume(doc.solids.find((solid) => solid.id === doc.selection[0]) || doc.solids[0]).toFixed(0)}` : ''}</span>
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
        <div className="menu-popup" role="menu" data-layout="single-column" data-testid="context-menu" style={{ left: context.x, top: context.y }}>
          <header className="popup-title menu-popup-title" data-testid="popup-title">
            <span className="popup-heading">
              <span className="menu-icon" data-testid="popup-icon">{menuIcon('context')}</span>
              <strong>{t('context')}</strong>
            </span>
          </header>
          {CONTEXT_ITEMS.map((item) => (
            <button key={item.id} type="button" role="menuitem" className="menu-item" title={t(item.labelKey)} onClick={() => runCommand(item.id)}>
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {dialog === 'about' ? <AboutDialog platform={window.mycad?.platform || 'web'} onClose={() => setDialog(null)} /> : null}
      {dialog === 'usage' ? <UsageDialog lang={state.settings.language} t={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'error' ? <ErrorDialog message={error.message} detail={error.detail} label={t('errorTitle')} copyLabel={t('copyError')} closeLabel={t('close')} onClose={() => setDialog(null)} /> : null}
      {dialog === 'settings' ? (
        <SettingsDialog
          settings={state.settings}
          fonts={fonts.includes(state.settings.fontFamily) ? fonts : [state.settings.fontFamily, ...fonts]}
          t={t}
          onChange={(patch) => dispatch({ type: 'patch-settings', patch })}
          onRemoveRecent={(path) => dispatch({ type: 'remove-recent', path })}
          onClearRecent={() => dispatch({ type: 'clear-recent' })}
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
          onPrint={() => { void window.mycad?.print?.(); window.print() }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'part' ? (
        <PartDialog
          title={t(partOp as MessageKey)}
          op={partOp}
          t={t}
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
            await saveActive(false)
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
  const setNumber = (group: 'position' | 'rotation' | 'scale' | 'size', key: string, value: number) => {
    dispatch({ type: 'update-solid', id: solid.id, patch: { [group]: { ...solid[group], [key]: value } } as never })
  }
  return (
    <div data-testid="property-editor">
      <label className="row"><span>{t('name')}</span><input aria-label={t('name')} value={solid.name} onChange={(event) => dispatch({ type: 'update-solid', id: solid.id, patch: { name: event.target.value } })} /></label>
      <label className="row"><span>{t('color')}</span><input aria-label={t('color')} type="color" value={solid.color} onChange={(event) => dispatch({ type: 'update-solid', id: solid.id, patch: { color: event.target.value } })} /></label>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <label className="row" key={axis}><span>{t('position')} {axis.toUpperCase()}</span>
          <input aria-label={`${t('position')} ${axis}`} type="number" value={solid.position[axis]} onChange={(event) => setNumber('position', axis, Number(event.target.value))} />
        </label>
      ))}
      <label className="row"><span>{t('visible')}</span><input aria-label={t('visible')} type="checkbox" checked={solid.visible} onChange={(event) => dispatch({ type: 'update-solid', id: solid.id, patch: { visible: event.target.checked } })} /></label>
      <label className="row"><span>{t('locked')}</span><input aria-label={t('locked')} type="checkbox" checked={solid.locked} onChange={(event) => dispatch({ type: 'update-solid', id: solid.id, patch: { locked: event.target.checked } })} /></label>
    </div>
  )
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
