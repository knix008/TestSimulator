import { decodeClipboard, encodeClipboard } from './clipboard'
import { cloneSolid, createDocument, createSolid, type CadDocument, type ShadeMode, type Solid, type SolidKind, type ViewPreset } from './model'
import type { Feature, Sketch } from './part'
import { cloneExtras, type DocumentExtras } from './extras'
import { clearRecent, rememberRecent, removeRecent } from './recent'
import { defaultSettings, type Settings } from './settings'

export interface HistoryEntry {
  past: CadDocument[]
  future: CadDocument[]
}

export interface AppState {
  settings: Settings
  documents: CadDocument[]
  activeId: string
  history: Record<string, HistoryEntry>
  clipboardText: string
  tool: string
  zoom: number
  status: string
  cursor: { x: number; y: number; z: number } | null
  seq: number
}

function emptyHistory(): HistoryEntry {
  return { past: [], future: [] }
}

export function snapshot(doc: CadDocument): CadDocument {
  return {
    ...doc,
    solids: doc.solids.map((solid) => cloneSolid(solid, solid.id)),
    selection: doc.selection.slice(),
    sketches: (doc.sketches ?? []).map((sketch) => ({ ...sketch })),
    features: (doc.features ?? []).map((feature) => ({ ...feature, solidIds: feature.solidIds.slice() })),
    parameters: (doc.parameters ?? []).map((item) => ({ ...item })),
    mates: (doc.mates ?? []).map((item) => ({ ...item })),
    extras: cloneExtras(doc.extras)
  }
}

export function createInitialState(settings?: Settings): AppState {
  const doc = createDocument('doc-1', 'Untitled')
  return {
    settings: settings ?? defaultSettings(),
    documents: [doc],
    activeId: doc.id,
    history: { [doc.id]: emptyHistory() },
    clipboardText: '',
    tool: 'select',
    zoom: 100,
    status: 'ready',
    cursor: null,
    seq: 1
  }
}

export function activeDocument(state: AppState): CadDocument {
  return state.documents.find((doc) => doc.id === state.activeId) ?? state.documents[0]
}

export function canUndo(state: AppState): boolean {
  return (state.history[state.activeId]?.past.length ?? 0) > 0
}

export function canRedo(state: AppState): boolean {
  return (state.history[state.activeId]?.future.length ?? 0) > 0
}

function withActive(state: AppState, doc: CadDocument, recordHistory: boolean, seq = state.seq): AppState {
  const current = activeDocument(state)
  const documents = state.documents.map((item) => (item.id === current.id ? doc : item))
  if (!recordHistory) return { ...state, documents, seq }
  const entry = state.history[current.id] ?? emptyHistory()
  return {
    ...state,
    documents,
    seq,
    history: {
      ...state.history,
      [current.id]: { past: [...entry.past, snapshot(current)].slice(-100), future: [] }
    }
  }
}

export type Action =
  | { type: 'replace-settings'; settings: Settings }
  | { type: 'patch-settings'; patch: Partial<Settings> }
  | { type: 'new-doc' }
  | { type: 'activate'; id: string }
  | { type: 'close-doc'; id: string }
  | { type: 'load-doc'; doc: CadDocument; path?: string }
  | { type: 'mark-saved'; path: string }
  | { type: 'add-solid'; kind: SolidKind }
  | { type: 'update-solid'; id: string; patch: Partial<Solid> }
  | { type: 'select'; ids: string[]; additive?: boolean }
  | { type: 'delete-selected' }
  | { type: 'duplicate' }
  | { type: 'copy' }
  | { type: 'paste'; text?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'set-tool'; tool: string }
  | { type: 'set-zoom'; zoom: number }
  | { type: 'wheel-zoom'; deltaY: number; ctrl: boolean }
  | { type: 'set-preset'; preset: ViewPreset }
  | { type: 'set-shade'; shade: ShadeMode }
  | { type: 'toggle-grid' }
  | { type: 'toggle-ruler' }
  | { type: 'set-status'; status: string }
  | { type: 'set-cursor'; cursor: { x: number; y: number; z: number } | null }
  | { type: 'remember-recent'; path: string; name?: string }
  | { type: 'remove-recent'; path: string }
  | { type: 'clear-recent' }
  | { type: 'remember-dir'; key: keyof Settings['lastDirectories']; directory: string }
  | { type: 'add-mesh'; solid: Solid }
  | { type: 'apply-part'; solids: Solid[]; feature: Feature; sketch?: Sketch; replaceIds?: string[]; parameter?: import('./catia').DesignParameter; mate?: import('./catia').Mate }
  | { type: 'recompute-part'; sketches: Sketch[]; solid: Solid; replaceId: string }
  | { type: 'set-section'; enabled: boolean }
  | { type: 'patch-extras'; patch: Partial<DocumentExtras>; record?: boolean }
  | { type: 'replace-solids'; solids: Solid[] }
  | { type: 'move-solid'; id: string; position: { x: number; y: number; z: number }; record?: boolean }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'replace-settings':
      return { ...state, settings: action.settings }
    case 'patch-settings':
      return { ...state, settings: { ...state.settings, ...action.patch, lastDirectories: action.patch.lastDirectories ?? state.settings.lastDirectories, recentFiles: action.patch.recentFiles ?? state.settings.recentFiles } }
    case 'new-doc': {
      const seq = state.seq + 1
      const doc = createDocument(`doc-${seq}`, `Untitled ${state.documents.length + 1}`)
      return {
        ...state,
        seq,
        documents: [...state.documents, doc],
        activeId: doc.id,
        history: { ...state.history, [doc.id]: emptyHistory() }
      }
    }
    case 'activate':
      return state.documents.some((doc) => doc.id === action.id) ? { ...state, activeId: action.id } : state
    case 'close-doc': {
      if (!state.documents.some((doc) => doc.id === action.id)) return state
      if (state.documents.length === 1) {
        const seq = state.seq + 1
        const doc = createDocument(`doc-${seq}`, 'Untitled')
        return { ...state, seq, documents: [doc], activeId: doc.id, history: { [doc.id]: emptyHistory() } }
      }
      const documents = state.documents.filter((doc) => doc.id !== action.id)
      const history = { ...state.history }
      delete history[action.id]
      const activeId = state.activeId === action.id ? documents[documents.length - 1].id : state.activeId
      return { ...state, documents, history, activeId }
    }
    case 'load-doc': {
      const path = action.path ?? action.doc.filePath
      const doc = { ...action.doc, dirty: false, filePath: path }
      const existing = state.documents.find((item) => path && item.filePath === path)
      if (existing) {
        return { ...state, documents: state.documents.map((item) => (item.id === existing.id ? { ...doc, id: existing.id } : item)), activeId: existing.id }
      }
      const seq = state.seq + 1
      const withId = { ...doc, id: `doc-${seq}` }
      const blank = state.documents.length === 1 && !state.documents[0].dirty && state.documents[0].solids.length === 0 && !state.documents[0].filePath
      const documents = blank ? [withId] : [...state.documents, withId]
      const recentFiles = path ? rememberRecent(state.settings.recentFiles, { path, name: doc.name }) : state.settings.recentFiles
      return {
        ...state,
        seq,
        documents,
        activeId: withId.id,
        history: { ...state.history, [withId.id]: emptyHistory() },
        settings: { ...state.settings, recentFiles }
      }
    }
    case 'mark-saved': {
      const current = activeDocument(state)
      const name = action.path.split(/[/\\]/).pop()?.replace(/\.mycad$/i, '') || current.name
      const recentFiles = rememberRecent(state.settings.recentFiles, { path: action.path, name })
      return {
        ...withActive(state, { ...current, dirty: false, filePath: action.path, name }, false),
        settings: { ...state.settings, recentFiles }
      }
    }
    case 'add-solid': {
      const current = activeDocument(state)
      const seq = state.seq + 1
      const solid = createSolid(action.kind, `sol-${seq}`, current.solids.length + 1)
      return withActive(state, { ...current, solids: [...current.solids, solid], selection: [solid.id], dirty: true }, true, seq)
    }
    case 'add-mesh': {
      const current = activeDocument(state)
      return withActive(state, { ...current, solids: [...current.solids, action.solid], selection: [action.solid.id], dirty: true }, true)
    }
    case 'update-solid': {
      const current = activeDocument(state)
      return withActive(state, {
        ...current,
        dirty: true,
        solids: current.solids.map((solid) => {
          if (solid.id !== action.id || solid.locked) return solid
          return {
            ...solid,
            ...action.patch,
            position: action.patch.position ? { ...solid.position, ...action.patch.position } : solid.position,
            rotation: action.patch.rotation ? { ...solid.rotation, ...action.patch.rotation } : solid.rotation,
            scale: action.patch.scale ? { ...solid.scale, ...action.patch.scale } : solid.scale,
            size: action.patch.size ? { ...solid.size, ...action.patch.size } : solid.size
          }
        })
      }, true)
    }
    case 'select': {
      const current = activeDocument(state)
      const selection = action.additive ? Array.from(new Set([...current.selection, ...action.ids])) : action.ids
      return withActive(state, { ...current, selection }, false)
    }
    case 'delete-selected': {
      const current = activeDocument(state)
      const remove = new Set(current.selection)
      return withActive(state, {
        ...current,
        dirty: remove.size > 0,
        solids: current.solids.filter((solid) => !remove.has(solid.id) || solid.locked),
        selection: []
      }, true)
    }
    case 'duplicate': {
      const current = activeDocument(state)
      let seq = state.seq
      const copies = current.solids.filter((solid) => current.selection.includes(solid.id)).map((solid) => {
        seq += 1
        const copy = cloneSolid(solid, `sol-${seq}`)
        copy.position = { ...copy.position, x: copy.position.x + 20 }
        copy.name = `${solid.name}-copy`
        return copy
      })
      if (copies.length === 0) return state
      return withActive(state, { ...current, solids: [...current.solids, ...copies], selection: copies.map((solid) => solid.id), dirty: true }, true, seq)
    }
    case 'copy': {
      const current = activeDocument(state)
      const solids = current.solids.filter((solid) => current.selection.includes(solid.id))
      return { ...state, clipboardText: encodeClipboard(solids), status: 'copied' }
    }
    case 'paste': {
      const text = action.text ?? state.clipboardText
      const solids = decodeClipboard(text)
      if (!solids || solids.length === 0) return { ...state, clipboardText: text }
      const current = activeDocument(state)
      let seq = state.seq
      const copies = solids.map((solid) => {
        seq += 1
        const copy = cloneSolid(solid, `sol-${seq}`)
        copy.position = { ...copy.position, x: copy.position.x + 15 }
        return copy
      })
      return withActive({ ...state, clipboardText: text }, { ...current, solids: [...current.solids, ...copies], selection: copies.map((solid) => solid.id), dirty: true }, true, seq)
    }
    case 'undo':
    case 'redo':
      return travel(state, action.type)
    case 'set-tool':
      return { ...state, tool: action.tool, status: action.tool }
    case 'set-zoom':
      return { ...state, zoom: clampZoom(action.zoom) }
    case 'wheel-zoom':
      if (!action.ctrl) return state
      return { ...state, zoom: clampZoom(state.zoom * (action.deltaY > 0 ? 0.9 : 1.1)) }
    case 'set-preset':
      return withActive(state, { ...activeDocument(state), preset: action.preset }, false)
    case 'set-shade':
      return withActive(state, { ...activeDocument(state), shade: action.shade }, false)
    case 'toggle-grid':
      return { ...state, settings: { ...state.settings, grid: !state.settings.grid } }
    case 'toggle-ruler':
      return { ...state, settings: { ...state.settings, ruler: !state.settings.ruler } }
    case 'set-status':
      return { ...state, status: action.status }
    case 'set-cursor':
      return { ...state, cursor: action.cursor }
    case 'remember-recent': {
      if (!action.path) return state
      const name = action.name || action.path.split(/[/\\]/).pop() || action.path
      return {
        ...state,
        settings: { ...state.settings, recentFiles: rememberRecent(state.settings.recentFiles, { path: action.path, name }) }
      }
    }
    case 'remove-recent':
      return { ...state, settings: { ...state.settings, recentFiles: removeRecent(state.settings.recentFiles, action.path) } }
    case 'clear-recent':
      return { ...state, settings: { ...state.settings, recentFiles: clearRecent() } }
    case 'apply-part': {
      const current = activeDocument(state)
      let seq = state.seq
      const solids = action.solids.map((solid) => {
        seq += 1
        return { ...solid, id: `sol-${seq}` }
      })
      const feature = { ...action.feature, id: `feat-${seq}`, solidIds: solids.map((solid) => solid.id) }
      const sketch = action.sketch ? { ...action.sketch, id: `sketch-${seq}` } : undefined
      const remove = new Set(action.replaceIds ?? [])
      return withActive(state, {
        ...current,
        dirty: true,
        solids: [...current.solids.filter((solid) => !remove.has(solid.id)), ...solids],
        sketches: sketch ? [...(current.sketches ?? []), sketch] : (current.sketches ?? []),
        features: [...(current.features ?? []), feature],
        parameters: action.parameter ? [...(current.parameters ?? []), action.parameter] : (current.parameters ?? []),
        mates: action.mate ? [...(current.mates ?? []), action.mate] : (current.mates ?? []),
        selection: solids.map((solid) => solid.id)
      }, true, seq)
    }
    case 'recompute-part': {
      const current = activeDocument(state)
      return withActive(state, {
        ...current,
        dirty: true,
        sketches: action.sketches,
        solids: current.solids.map((solid) => (solid.id === action.replaceId ? { ...action.solid, id: action.replaceId } : solid))
      }, true)
    }
    case 'set-section':
      return withActive(state, { ...activeDocument(state), section: action.enabled }, false)
    case 'patch-extras': {
      const current = activeDocument(state)
      return withActive(state, {
        ...current,
        dirty: true,
        extras: { ...cloneExtras(current.extras), ...action.patch }
      }, action.record !== false)
    }
    case 'move-solid': {
      const current = activeDocument(state)
      const target = current.solids.find((solid) => solid.id === action.id)
      if (!target || target.locked) return state
      return withActive(state, {
        ...current,
        dirty: true,
        selection: current.selection.includes(action.id) ? current.selection : [action.id],
        solids: current.solids.map((solid) => (solid.id === action.id ? { ...solid, position: { ...action.position } } : solid))
      }, action.record !== false)
    }
    case 'replace-solids': {
      const current = activeDocument(state)
      return withActive(state, { ...current, dirty: true, solids: action.solids, selection: [] }, true)
    }
    case 'remember-dir':
      return {
        ...state,
        settings: {
          ...state.settings,
          lastDirectories: { ...state.settings.lastDirectories, [action.key]: action.directory }
        }
      }
    default:
      return state
  }
}

function clampZoom(value: number): number {
  return Math.max(10, Math.min(800, Math.round(value)))
}

function travel(state: AppState, direction: 'undo' | 'redo'): AppState {
  const current = activeDocument(state)
  const entry = state.history[current.id] ?? emptyHistory()
  if (direction === 'undo') {
    const previous = entry.past[entry.past.length - 1]
    if (!previous) return state
    return {
      ...state,
      documents: state.documents.map((doc) => (doc.id === current.id ? { ...snapshot(previous), id: current.id } : doc)),
      history: { ...state.history, [current.id]: { past: entry.past.slice(0, -1), future: [snapshot(current), ...entry.future] } }
    }
  }
  const next = entry.future[0]
  if (!next) return state
  return {
    ...state,
    documents: state.documents.map((doc) => (doc.id === current.id ? { ...snapshot(next), id: current.id } : doc)),
    history: { ...state.history, [current.id]: { past: [...entry.past, snapshot(current)], future: entry.future.slice(1) } }
  }
}
