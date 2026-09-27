import { describe, expect, it } from 'vitest'
import { activeDocument, canRedo, canUndo, createInitialState, reducer, type Action, type AppState } from '../src/core/store'
import { runCommandById } from '../src/core/commands'
import { createSolid } from '../src/core/model'
import { wireSegments } from '../src/core/overlay'

/** Apply a run of actions, the way the window dispatches them one by one. */
function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state)
}

const doc = (state: AppState) => activeDocument(state)

/**
 * The window turns a command's effect into these actions; this mirrors the
 * part of `applyEffect` a registry command goes through, so a test can put a
 * real command through the history.
 */
function applyCommand(state: AppState, id: string): AppState {
  let counter = 0
  const effect = runCommandById(id, { doc: doc(state), nextId: () => `t${counter++}` })
  if (!effect) throw new Error(`no command ${id}`)
  let next = state
  if (effect.allSolids) next = reducer(next, { type: 'replace-solids', solids: effect.allSolids })
  if ((effect.solids && effect.solids.length > 0) || effect.sketch || effect.parameter || effect.mate) {
    next = reducer(next, {
      type: 'apply-part',
      solids: effect.solids ?? [],
      replaceIds: effect.replaceIds,
      feature: effect.feature ?? { id: 'feat', name: id, kind: 'primitive', solidIds: [], length: 0, angle: 0, count: 1, radius: 0 },
      sketch: effect.sketch,
      parameter: effect.parameter,
      mate: effect.mate
    })
  }
  if (effect.extras) next = reducer(next, { type: 'patch-extras', patch: effect.extras })
  return next
}

describe('undo and redo', () => {
  it('[History] a step back and forward lands on exactly the states either side of it', () => {
    let state = run(createInitialState(), { type: 'add-solid', kind: 'box' }, { type: 'add-solid', kind: 'sphere' })
    expect(doc(state).solids.map((solid) => solid.kind)).toEqual(['box', 'sphere'])
    expect(canUndo(state)).toBe(true)
    expect(canRedo(state)).toBe(false)

    state = reducer(state, { type: 'undo' })
    expect(doc(state).solids.map((solid) => solid.kind)).toEqual(['box'])
    expect(canRedo(state)).toBe(true)

    state = reducer(state, { type: 'undo' })
    expect(doc(state).solids).toHaveLength(0)
    expect(canUndo(state)).toBe(false)

    // And all the way forward again.
    state = run(state, { type: 'redo' }, { type: 'redo' })
    expect(doc(state).solids.map((solid) => solid.kind)).toEqual(['box', 'sphere'])
    expect(canRedo(state)).toBe(false)
  })

  it('[History] undoing past the start, or redoing past the end, changes nothing', () => {
    const start = createInitialState()
    expect(reducer(start, { type: 'undo' })).toBe(start)
    expect(reducer(start, { type: 'redo' })).toBe(start)
    const one = reducer(start, { type: 'add-solid', kind: 'box' })
    expect(doc(reducer(one, { type: 'redo' })).solids).toHaveLength(1)
  })

  it('[History] a new edit drops the redo branch', () => {
    let state = run(createInitialState(), { type: 'add-solid', kind: 'box' }, { type: 'undo' })
    expect(canRedo(state)).toBe(true)
    state = reducer(state, { type: 'add-solid', kind: 'cone' })
    expect(canRedo(state)).toBe(false)
    expect(doc(state).solids.map((solid) => solid.kind)).toEqual(['cone'])
  })

  it('[History] a Draft curve comes back with the same points it went away with', () => {
    // The overlay reads `extras.wires`, so a wire that survives undo/redo by
    // value is a wire the viewport draws again.
    let state = applyCommand(createInitialState(), 'draftRect')
    const drawn = doc(state).extras.wires
    expect(drawn).toHaveLength(1)
    const before = wireSegments(drawn[0])
    expect(before.length).toBeGreaterThan(0)

    state = reducer(state, { type: 'undo' })
    expect(doc(state).extras.wires).toHaveLength(0)

    state = reducer(state, { type: 'redo' })
    expect(doc(state).extras.wires).toHaveLength(1)
    expect(wireSegments(doc(state).extras.wires[0])).toEqual(before)
  })

  it('[History] the restored document is a copy, so editing it cannot reach into the history', () => {
    let state = run(createInitialState(), { type: 'add-solid', kind: 'box' })
    const id = doc(state).solids[0].id
    state = run(state, { type: 'update-solid', id, patch: { name: 'Hub' } }, { type: 'undo' })
    expect(doc(state).solids[0].name).not.toBe('Hub')

    // Mutating what undo handed back must not corrupt the redo entry.
    doc(state).solids[0].name = 'Poked'
    doc(state).solids[0].position.x = 999
    state = reducer(state, { type: 'redo' })
    expect(doc(state).solids[0].name).toBe('Hub')
    expect(doc(state).solids[0].position.x).not.toBe(999)
  })

  it('[History] every kind of document edit is undoable', () => {
    const cases: { name: string; edit: (state: AppState) => AppState; changed: (state: AppState) => unknown }[] = [
      { name: 'add', edit: (s) => reducer(s, { type: 'add-solid', kind: 'box' }), changed: (s) => doc(s).solids.length },
      { name: 'mesh', edit: (s) => reducer(s, { type: 'add-mesh', solid: createSolid('box', 'm', 1) }), changed: (s) => doc(s).solids.length },
      { name: 'wire', edit: (s) => applyCommand(s, 'draftLine'), changed: (s) => doc(s).extras.wires.length },
      { name: 'annotation', edit: (s) => applyCommand(s, 'draftText'), changed: (s) => doc(s).extras.annotations.length },
      { name: 'parameter', edit: (s) => applyCommand(s, 'kwFormula'), changed: (s) => (doc(s).parameters ?? []).length }
    ]
    for (const item of cases) {
      const before = createInitialState()
      const after = item.edit(before)
      expect(item.changed(after), item.name).not.toEqual(item.changed(before))
      expect(canUndo(after), item.name).toBe(true)
      const undone = reducer(after, { type: 'undo' })
      expect(item.changed(undone), item.name).toEqual(item.changed(before))
      expect(item.changed(reducer(undone, { type: 'redo' })), item.name).toEqual(item.changed(after))
    }
  })

  it('[History] deleting, duplicating and pasting all step back', () => {
    let state = run(createInitialState(), { type: 'add-solid', kind: 'box' })
    const id = doc(state).solids[0].id

    state = run(state, { type: 'select', ids: [id] }, { type: 'duplicate' })
    expect(doc(state).solids).toHaveLength(2)
    state = reducer(state, { type: 'undo' })
    expect(doc(state).solids).toHaveLength(1)

    state = run(state, { type: 'select', ids: [id] }, { type: 'delete-selected' })
    expect(doc(state).solids).toHaveLength(0)
    state = reducer(state, { type: 'undo' })
    expect(doc(state).solids).toHaveLength(1)

    const copied = reducer(run(state, { type: 'select', ids: [id] }), { type: 'copy' })
    state = reducer(copied, { type: 'paste', text: copied.clipboardText })
    expect(doc(state).solids).toHaveLength(2)
    expect(doc(reducer(state, { type: 'undo' })).solids).toHaveLength(1)
  })

  it('[History] a whole drag is one step back', () => {
    // The viewport animates the drag in three.js and dispatches a single
    // `move-solid` when the pointer is released, so what the history snapshots
    // is where the solid stood before the drag began.
    let state = run(createInitialState(), { type: 'add-solid', kind: 'box' })
    const id = doc(state).solids[0].id
    const home = doc(state).solids[0].position.x
    const depth = () => state.history[state.activeId].past.length
    const before = depth()

    state = reducer(state, { type: 'move-solid', id, position: { x: home + 20, y: 0, z: 0 } })
    expect(depth()).toBe(before + 1)
    state = reducer(state, { type: 'undo' })
    expect(doc(state).solids[0].position.x).toBe(home)
    expect(doc(reducer(state, { type: 'redo' })).solids[0].position.x).toBe(home + 20)
  })

  it('[History] a move asked not to record does not grow the stack', () => {
    // `record: false` is for a caller that wants to place a solid without
    // spending a step. Note what it costs: the next recorded move snapshots
    // the already-moved solid, so an unrecorded move can never be stepped
    // back past. Nothing in the window uses it for the live frames of a drag.
    let state = run(createInitialState(), { type: 'add-solid', kind: 'box' })
    const id = doc(state).solids[0].id
    const depth = () => state.history[state.activeId].past.length
    const before = depth()
    state = reducer(state, { type: 'move-solid', id, position: { x: 12, y: 0, z: 0 }, record: false })
    expect(depth()).toBe(before)
    expect(doc(state).solids[0].position.x).toBe(12)
    // The step it did not take is the step undo cannot give back.
    expect(doc(reducer(state, { type: 'undo' })).solids).toHaveLength(0)
  })

  it('[History] how the model is shown is not an edit, so it is not on the stack', () => {
    // The view and the settings are not part of the document: undo must not
    // spend a step putting the grid back on.
    const start = run(createInitialState(), { type: 'add-solid', kind: 'box' })
    const depth = (state: AppState) => state.history[state.activeId].past.length
    // `preset`, `shade` and `section` live on the document and are saved with
    // it, but they say how it is shown rather than what it is, so they are
    // not steps either.
    const view: Action[] = [
      { type: 'set-preset', preset: 'top' },
      { type: 'set-shade', shade: 'wireframe' },
      { type: 'set-section', enabled: true },
      { type: 'toggle-grid' },
      { type: 'toggle-ruler' },
      { type: 'patch-settings', patch: { scaleBar: false } },
      { type: 'set-zoom', zoom: 140 },
      { type: 'select', ids: [] }
    ]
    const after = run(start, ...view)
    expect(depth(after)).toBe(depth(start))
    expect(doc(reducer(after, { type: 'undo' })).solids).toHaveLength(0)
  })

  it('[History] each document keeps its own stack', () => {
    let state = run(createInitialState(), { type: 'add-solid', kind: 'box' }, { type: 'new-doc' })
    const second = state.activeId
    expect(canUndo(state)).toBe(false)

    state = reducer(state, { type: 'add-solid', kind: 'cone' })
    expect(doc(state).solids.map((solid) => solid.kind)).toEqual(['cone'])

    // Undoing here must not reach into the other tab.
    state = reducer(state, { type: 'undo' })
    expect(doc(state).solids).toHaveLength(0)
    const first = state.documents.find((item) => item.id !== second)
    expect(first?.solids.map((solid) => solid.kind)).toEqual(['box'])
  })
})
