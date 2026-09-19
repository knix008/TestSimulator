import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown, ArrowUp, Camera, Circle, Copy, Eye, EyeOff, Layers2, Link, Lock, LockOpen, Play, Plus, Save, Sparkles, Square, SquareDashed, Trash, X, PenTool, Scissors, Frame, Grid3x3,
} from 'lucide-react'
import { blendLabel, toolLabel } from './i18n'
import { adjustmentFields, fieldToSlider, sliderToField } from './adjustmentFields'
import { gradientCss, gradientPresets, type GradientDef } from './lib/gradients'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './lib/color'
import { compositeDocument, context2d } from './lib/canvas'
import { paintStroke } from './lib/tools'
import { measureInfo } from './lib/regions'
import { lutChoices } from './lib/adjustExtra'
import {
  blendModes, type ActionScript, type Adjustment, type AppSettings, type BlendMode, type LayerMeta, type PanelTab, type PhotoDocument, type Point, type Selection, type SmartFilter, type TextData, type Tool,
} from './lib/types'
import type { NamedSnapshot } from './lib/history'
import type { DialogName, DialogPayload } from './dialogMeta'

/**
 * The right-hand panels. App owns the state; each panel gets what it needs
 * through one context object so a new panel is a component here plus a tab,
 * not another few hundred lines in App.
 */

export type PanelContext = {
  tr: (key: string) => string
  language: 'ko' | 'en'
  doc: PhotoDocument
  settings: AppSettings
  /** The pixel buffers; read inside effects and handlers, never while rendering. */
  canvasesRef: { current: Map<string, HTMLCanvasElement> }
  /** Bumped on every edit; panels that draw pixels redraw on it. */
  frame: number
  activeLayer: LayerMeta | null
  selection: Selection | null
  tool: Tool
  pan: Point
  stageSize: { width: number; height: number }
  setSettings: (updater: (current: AppSettings) => AppSettings) => void
  updateDoc: (updater: (current: PhotoDocument) => PhotoDocument) => void
  setActiveLayer: (id: string) => void
  snapshot: (label?: string) => void
  setTool: (tool: Tool) => void
  setPan: (pan: Point) => void
  setSelection: (selection: Selection | null) => void
  openDialog: (name: DialogName, extra?: Partial<DialogPayload>) => void
  runCommand: (id: string) => void
  bump: () => void
  /* history */
  historyEntries: { label?: string; at?: number }[]
  redoEntries: { label?: string; at?: number }[]
  jumpHistory: (index: number) => void
  namedSnapshots: NamedSnapshot[]
  takeNamedSnapshot: (name: string) => void
  restoreNamedSnapshot: (id: string) => void
  deleteNamedSnapshot: (id: string) => void
  historySourceIndex: number | null
  setHistorySourceIndex: (index: number | null) => void
  /* layers */
  paintTarget: 'layer' | 'mask'
  setPaintTarget: (target: 'layer' | 'mask') => void
  reorderLayer: (id: string, beforeId: string | null) => void
  patchLayer: (id: string, patch: Partial<LayerMeta>) => void
  patchAdjustment: (id: string, patch: Partial<Adjustment>) => void
  patchText: (id: string, patch: Partial<TextData>) => void
  patchSmartFilter: (id: string, patch: Partial<SmartFilter>) => void
  removeSmartFilter: (id: string) => void
  /* tools */
  cloneSource: Point | null
  samplerValues: { id: string; x: number; y: number; r: number; g: number; b: number }[]
  applyGradientPreset: (id: string) => void
  applyStyle: (id: string) => void
  applyToolPreset: (id: string) => void
  saveToolPreset: () => void
  defineShapeFromPath: () => void
  activePathId: string | null
  setActivePathId: (id: string | null) => void
  /* actions and comps */
  recording: unknown[] | null
  startRecording: () => void
  stopRecording: (name: string) => void
  cancelRecording: () => void
  playAction: (action: ActionScript) => void
  runBatch: (action: ActionScript) => void
  deleteAction: (id: string) => void
  captureComp: (name: string) => void
  applyComp: (id: string) => void
  deleteComp: (id: string) => void
  /* timeline */
  playingFrame: number | null
  captureAnimationFrame: () => void
  startPlayback: () => void
  stopPlayback: () => void
  showAnimationFrame: (id: string) => void
  patchAnimationFrame: (id: string, patch: { delayMs?: number }) => void
  deleteAnimationFrame: (id: string) => void
  exportAnimatedGif: () => void
  exportVideo: () => void
  /* channels */
  loadSelectionFrom: (id: string, mode: 'replace') => void
  deleteChannel: (id: string) => void
  /* documents */
  documents: { id: string; name: string; dirty: boolean; active: boolean }[]
  switchDocument: (id: string) => void
  closeDocumentById: (id: string) => void
  /* notes */
  editNote: (id: string) => void
  activeSliceId: string | null
  setActiveSliceId: (id: string | null) => void
  exportSlice: (id: string) => void
}

/** Draws a canvas from the map into a thumbnail element, redrawn when the frame changes. */
function Thumb({ canvasesRef, keys, size = 40, frame, className }: { canvasesRef: { current: Map<string, HTMLCanvasElement> }; keys: string[]; size?: number; frame: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const target = ref.current
    if (!target) return
    const ctx = context2d(target)
    ctx.clearRect(0, 0, target.width, target.height)
    let source: HTMLCanvasElement | undefined
    for (const key of keys) { source = canvasesRef.current.get(key); if (source) break }
    if (!source) return
    const scale = Math.min(target.width / source.width, target.height / source.height)
    const w = Math.max(1, source.width * scale)
    const h = Math.max(1, source.height * scale)
    ctx.drawImage(source, (target.width - w) / 2, (target.height - h) / 2, w, h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('|'), frame])
  return <canvas ref={ref} className={`thumb ${className ?? ''}`} width={size} height={size} />
}

/* --------------------------------------------------------------- layers */

export function LayersPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc, canvasesRef, frame, activeLayer, paintTarget } = ctx
  const [dragId, setDragId] = useState<string | null>(null)
  const rows = [...doc.layers].reverse()
  const depth = (layer: LayerMeta) => {
    let d = 0
    let current: LayerMeta | undefined = layer
    while (current?.parentId) {
      d += 1
      current = doc.layers.find((item) => item.id === current!.parentId)
      if (d > 8) break
    }
    return d
  }
  const hasFx = (layer: LayerMeta) => Object.entries(layer.effects).some(([key, value]) => value === true && key !== 'enabled')
  return (
    <>
      <h2>{tr('layers')}</h2>
      <div className="layer-list" onDragOver={(event) => event.preventDefault()}>
        {rows.map((layer) => {
          const active = layer.id === doc.activeLayerId
          return (
            <div
              key={layer.id}
              className={`layer-row${active ? ' active' : ''}${dragId === layer.id ? ' dragging' : ''}`}
              style={{ paddingLeft: 4 + depth(layer) * 14 }}
              draggable
              onDragStart={() => setDragId(layer.id)}
              onDragEnd={() => setDragId(null)}
              onDrop={(event) => { event.preventDefault(); if (dragId && dragId !== layer.id) ctx.reorderLayer(dragId, layer.id); setDragId(null) }}
              onClick={() => { ctx.setActiveLayer(layer.id); ctx.setPaintTarget('layer') }}
              onDoubleClick={() => { ctx.setActiveLayer(layer.id); if (layer.kind === 'text') ctx.openDialog('text'); else ctx.openDialog('layerStyle') }}
            >
              <button data-tooltip={tr('visible')} onClick={(event) => { event.stopPropagation(); ctx.patchLayer(layer.id, { visible: !layer.visible }) }}>
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              {layer.kind === 'group'
                ? <span className="thumb thumb-group"><Square size={14} /></span>
                : <span className={`thumb-wrap${active && paintTarget === 'layer' ? ' target' : ''}`}><Thumb canvasesRef={canvasesRef} keys={[layer.id, `${layer.id}:source`]} frame={frame} /></span>}
              {layer.maskEnabled && (
                <span
                  className={`thumb-wrap mask-thumb${active && paintTarget === 'mask' ? ' target' : ''}`}
                  data-tooltip={tr('maskThumb')}
                  onClick={(event) => { event.stopPropagation(); ctx.setActiveLayer(layer.id); ctx.setPaintTarget('mask') }}
                >
                  <Thumb canvasesRef={canvasesRef} keys={[`${layer.id}:mask`]} frame={frame} className="mask" />
                </span>
              )}
              <input
                value={layer.name}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => ctx.patchLayer(layer.id, { name: event.target.value })}
              />
              <span className="layer-badges">
                {layer.kind === 'adjustment' && <em title={tr('adjLayer')}>◐</em>}
                {layer.kind === 'text' && <em>T</em>}
                {layer.smart && <em title={tr('toSmartObject')}>◈</em>}
                {layer.linkId && <Link size={11} />}
                {hasFx(layer) && <button className="fx" data-tooltip={tr('layerStyle')} onClick={(event) => { event.stopPropagation(); ctx.setActiveLayer(layer.id); ctx.openDialog('layerStyle') }}>{tr('effectsShort')}</button>}
              </span>
              <button data-tooltip={layer.locked ? tr('lockedFull') : tr('locked')} onClick={(event) => { event.stopPropagation(); ctx.patchLayer(layer.id, { locked: !layer.locked }) }}>
                {layer.locked ? <Lock size={13} /> : <LockOpen size={13} />}
              </button>
            </div>
          )
        })}
      </div>
      <div className="layer-actions">
        <button data-tooltip={tr('newLayer')} onClick={() => ctx.runCommand('layer.new')}><Plus size={14} /></button>
        <button data-tooltip={tr('deleteLayer')} onClick={() => ctx.runCommand('layer.delete')}><Trash size={14} /></button>
        <button data-tooltip={tr('moveUp')} onClick={() => ctx.runCommand('layer.bringForward')}><ArrowUp size={14} /></button>
        <button data-tooltip={tr('moveDown')} onClick={() => ctx.runCommand('layer.sendBackward')}><ArrowDown size={14} /></button>
        <button data-tooltip={tr('duplicateLayer')} onClick={() => ctx.runCommand('layer.duplicate')}><Copy size={14} /></button>
        <button data-tooltip={tr('layerMask')} onClick={() => ctx.runCommand('layer.mask')}><SquareDashed size={14} /></button>
        <button data-tooltip={tr('layerStyle')} onClick={() => ctx.openDialog('layerStyle')}><Sparkles size={14} /></button>
        <button data-tooltip={tr('groupLayers')} onClick={() => ctx.runCommand('layer.group')}><Layers2 size={14} /></button>
      </div>
      {activeLayer && (
        <>
          <label>{tr('opacity')}
            <div className="range-field">
              <input type="range" min={0} max={100} value={Math.round(activeLayer.opacity * 100)} onChange={(event) => ctx.patchLayer(activeLayer.id, { opacity: Number(event.target.value) / 100 })} />
              <span className="range-value">{Math.round(activeLayer.opacity * 100)}</span>
            </div>
          </label>
          <label>{tr('fillOpacity')}
            <div className="range-field">
              <input type="range" min={0} max={100} value={Math.round((activeLayer.fillOpacity ?? 1) * 100)} onChange={(event) => ctx.patchLayer(activeLayer.id, { fillOpacity: Number(event.target.value) / 100 })} />
              <span className="range-value">{Math.round((activeLayer.fillOpacity ?? 1) * 100)}</span>
            </div>
          </label>
          <label>{tr('blend')}
            <select value={activeLayer.blendMode} onChange={(event) => ctx.patchLayer(activeLayer.id, { blendMode: event.target.value as BlendMode })}>
              {blendModes.map((mode) => <option key={mode} value={mode}>{blendLabel(ctx.language, mode)}</option>)}
            </select>
          </label>
          <div className="lock-row">
            <label className="check-row"><input type="checkbox" checked={Boolean(activeLayer.lockTransparent)} onChange={(event) => ctx.patchLayer(activeLayer.id, { lockTransparent: event.target.checked })} />{tr('lockTransparent')}</label>
            <label className="check-row"><input type="checkbox" checked={Boolean(activeLayer.lockPosition)} onChange={(event) => ctx.patchLayer(activeLayer.id, { lockPosition: event.target.checked })} />{tr('lockPosition')}</label>
          </div>
          {activeLayer.maskEnabled && (
            <p className="panel-hint">{paintTarget === 'mask' ? tr('maskTarget') : tr('layerTarget')}</p>
          )}
        </>
      )}
      <h3>{tr('histogram')}</h3>
      <canvas id="histogram-canvas" className="histogram" width={280} height={88} />
    </>
  )
}

/* ----------------------------------------------------------- properties */

export function PropertiesPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, activeLayer, doc } = ctx
  if (!activeLayer) return <><h2>{tr('properties')}</h2><p className="panel-hint">{tr('noLayerBody')}</p></>
  const layer = activeLayer
  const adjustment = layer.adjustment
  const fields = adjustment ? adjustmentFields[adjustment.type] : []
  return (
    <>
      <h2>{tr('properties')}</h2>
      <p className="panel-hint">{layer.name} · {tr(layer.kind === 'adjustment' ? 'adjLayer' : layer.kind === 'text' ? 'text' : layer.kind === 'shape' ? 'shape' : layer.kind === 'fill' ? 'fillLayer' : layer.kind === 'group' ? 'layerGroup' : 'layerName')}</p>
      {adjustment && (
        <>
          <h3>{tr(adjustment.type)}</h3>
          {fields.map((field) => (
            field.kind === 'color'
              ? <label key={field.key}>{tr(field.label)}<input type="color" value={String(adjustment[field.key] ?? '#ff9900')} onChange={(event) => ctx.patchAdjustment(layer.id, { [field.key]: event.target.value })} /></label>
              : (
                <label key={field.key}>{tr(field.label)}
                  <div className="range-field">
                    <input type="range" min={field.min} max={field.max} step={field.step ?? 1} value={fieldToSlider(field, adjustment[field.key])} onChange={(event) => ctx.patchAdjustment(layer.id, { [field.key]: sliderToField(field, Number(event.target.value)) })} />
                    <span className="range-value">{fieldToSlider(field, adjustment[field.key])}</span>
                  </div>
                </label>
              )
          ))}
          {adjustment.type === 'colorLookup' && (
            <>
              <label>{tr('lutPreset')}
                <select value={adjustment.lutId ?? 'filmstock'} onChange={(event) => ctx.patchAdjustment(layer.id, { lutId: event.target.value })}>
                  {lutChoices().map((lut) => <option key={lut.id} value={lut.id}>{lut.name}</option>)}
                </select>
              </label>
              <label>{tr('lutStrength')}
                <div className="range-field">
                  <input type="range" min={0} max={100} value={Math.round((adjustment.lutStrength ?? 1) * 100)} onChange={(event) => ctx.patchAdjustment(layer.id, { lutStrength: Number(event.target.value) / 100 })} />
                  <span className="range-value">{Math.round((adjustment.lutStrength ?? 1) * 100)}</span>
                </div>
              </label>
            </>
          )}
          {(adjustment.type === 'channelMixer' || adjustment.type === 'selectiveColor' || adjustment.type === 'gradientMap') && (
            <button onClick={() => ctx.openDialog(adjustment.type as DialogName)}>{tr(adjustment.type)}</button>
          )}
          {(layer.curves || layer.levels) && <button onClick={() => ctx.openDialog(layer.curves ? 'curves' : 'levels')}>{tr(layer.curves ? 'curves' : 'levels')}</button>}
        </>
      )}
      {layer.kind === 'text' && layer.text && (
        <>
          <h3>{tr('characterPanel')}</h3>
          <CharacterFields ctx={ctx} layer={layer} />
          <button onClick={() => ctx.openDialog('text')}>{tr('enterText')}</button>
        </>
      )}
      {layer.kind === 'shape' && layer.shape && (
        <>
          <h3>{tr('shape')}</h3>
          <div className="dialog-grid">
            <label>{tr('fillColor')}<input type="color" value={layer.shape.fill.startsWith('#') ? layer.shape.fill : '#000000'} onChange={(event) => ctx.patchLayer(layer.id, { shape: { ...layer.shape!, fill: event.target.value } })} /></label>
            <label>{tr('strokeColor')}<input type="color" value={layer.shape.stroke.startsWith('#') ? layer.shape.stroke : '#000000'} onChange={(event) => ctx.patchLayer(layer.id, { shape: { ...layer.shape!, stroke: event.target.value } })} /></label>
          </div>
          <label>{tr('strokeWidth')}
            <div className="range-field">
              <input type="range" min={0} max={40} value={layer.shape.strokeWidth} onChange={(event) => ctx.patchLayer(layer.id, { shape: { ...layer.shape!, strokeWidth: Number(event.target.value) } })} />
              <span className="range-value">{layer.shape.strokeWidth}</span>
            </div>
          </label>
          {(layer.shape.kind === 'roundRect') && (
            <label>{tr('cornerRadius')}
              <div className="range-field">
                <input type="range" min={0} max={200} value={layer.shape.radius} onChange={(event) => ctx.patchLayer(layer.id, { shape: { ...layer.shape!, radius: Number(event.target.value) } })} />
                <span className="range-value">{layer.shape.radius}</span>
              </div>
            </label>
          )}
        </>
      )}
      {layer.kind === 'fill' && layer.fill && (
        <>
          <h3>{tr('fillLayer')}</h3>
          <label>{tr('fillWith')}
            <select value={layer.fill.kind} onChange={(event) => ctx.patchLayer(layer.id, { fill: { ...layer.fill!, kind: event.target.value as 'solid' | 'gradient' | 'pattern' } })}>
              <option value="solid">{tr('fillSolid')}</option>
              <option value="gradient">{tr('gradient')}</option>
              <option value="pattern">{tr('pattern')}</option>
            </select>
          </label>
          <div className="dialog-grid">
            <label>{tr('color')}<input type="color" value={layer.fill.color} onChange={(event) => ctx.patchLayer(layer.id, { fill: { ...layer.fill!, color: event.target.value } })} /></label>
            <label>{tr('toColor')}<input type="color" value={layer.fill.endColor} onChange={(event) => ctx.patchLayer(layer.id, { fill: { ...layer.fill!, endColor: event.target.value } })} /></label>
          </div>
          {layer.fill.kind === 'pattern' && (
            <label>{tr('pattern')}
              <select value={layer.fill.patternId ?? ''} onChange={(event) => ctx.patchLayer(layer.id, { fill: { ...layer.fill!, patternId: event.target.value || undefined } })}>
                <option value="">—</option>
                {(doc.patterns ?? []).map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}
              </select>
            </label>
          )}
        </>
      )}
      {layer.maskEnabled && (
        <>
          <h3>{tr('layerMask')}</h3>
          <div className="layer-actions">
            <button onClick={() => ctx.runCommand('layer.maskDisable')}>{tr('maskDisable')}</button>
            <button onClick={() => ctx.runCommand('layer.maskInvert')}>{tr('maskInvert')}</button>
            <button onClick={() => ctx.runCommand('layer.maskApply')}>{tr('maskApply')}</button>
            <button onClick={() => ctx.runCommand('layer.maskDelete')}>{tr('maskDelete')}</button>
          </div>
        </>
      )}
      {layer.smart && (
        <>
          <h3>{tr('smartFilters')}</h3>
          {(layer.smartFilters ?? []).length === 0
            ? <p className="panel-hint">{tr('smartFilterHint')}</p>
            : (layer.smartFilters ?? []).map((filter) => (
              <div className="smart-filter" key={filter.id}>
                <label className="check-row">
                  <input type="checkbox" checked={filter.enabled} onChange={(event) => ctx.patchSmartFilter(filter.id, { enabled: event.target.checked })} />
                  {tr(filter.filter)}
                </label>
                <div className="range-field">
                  <input type="range" min={1} max={100} value={Math.round(filter.amount)} onChange={(event) => ctx.patchSmartFilter(filter.id, { amount: Number(event.target.value) })} />
                  <span className="range-value">{Math.round(filter.amount)}</span>
                </div>
                <div className="range-field">
                  <input type="range" min={0.5} max={40} step={0.5} value={filter.radius} onChange={(event) => ctx.patchSmartFilter(filter.id, { radius: Number(event.target.value) })} />
                  <span className="range-value">{filter.radius}</span>
                </div>
                <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => ctx.removeSmartFilter(filter.id)}><Trash size={13} /></button>
              </div>
            ))}
          <div className="layer-actions">
            <button onClick={() => ctx.runCommand('layer.smartEdit')}>{tr('smartEdit')}</button>
            <button onClick={() => ctx.runCommand('layer.smartReplace')}>{tr('smartReplace')}</button>
          </div>
        </>
      )}
      <h3>{tr('effects')}</h3>
      <button onClick={() => ctx.openDialog('layerStyle')}><Sparkles size={13} /><span>{tr('layerStyle')}</span></button>
    </>
  )
}

/* ------------------------------------------------------------- history */

export function HistoryPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, historyEntries, redoEntries } = ctx
  const [name, setName] = useState('')
  const total = historyEntries.length
  return (
    <>
      <h2>{tr('history')}</h2>
      <div className="history-list">
        {ctx.namedSnapshots.map((item) => (
          <div className="history-row snapshot" key={item.id}>
            <button className={ctx.historySourceIndex === -1 ? '' : ''} onClick={() => ctx.restoreNamedSnapshot(item.id)}><Camera size={12} /><span>{item.name}</span></button>
            <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => ctx.deleteNamedSnapshot(item.id)}><X size={12} /></button>
          </div>
        ))}
        {historyEntries.map((entry, index) => (
          <div className="history-row" key={`${entry.at}-${index}`}>
            <button
              className={ctx.historySourceIndex === index ? 'source' : ''}
              data-tooltip={tr('hintHistoryReal')}
              onClick={() => ctx.setHistorySourceIndex(ctx.historySourceIndex === index ? null : index)}
            >
              <Circle size={10} />
            </button>
            <button className="state" onClick={() => ctx.jumpHistory(index)}>{index === 0 ? tr('openState') : (historyEntries[index - 1].label ?? tr('edit'))}</button>
          </div>
        ))}
        <div className="history-row current">
          <button className={ctx.historySourceIndex === null ? 'source' : ''} onClick={() => ctx.setHistorySourceIndex(null)}><Circle size={10} /></button>
          <button className="state active" onClick={() => ctx.jumpHistory(total)}>{historyEntries[total - 1]?.label ?? tr('currentState')}</button>
        </div>
        {redoEntries.slice().reverse().map((entry, index) => (
          <div className="history-row redo" key={`redo-${entry.at}-${index}`}>
            <span />
            <button className="state" onClick={() => ctx.jumpHistory(total + 1 + index)}>{entry.label ?? tr('edit')}</button>
          </div>
        ))}
      </div>
      <div className="channel-row">
        <input value={name} placeholder={tr('snapshotNew')} onChange={(event) => setName(event.target.value)} />
        <button data-tooltip={tr('snapshotNew')} onClick={() => { ctx.takeNamedSnapshot(name.trim() || `${tr('snapshotNew')} ${ctx.namedSnapshots.length + 1}`); setName('') }}><Camera size={13} /></button>
      </div>
      <p className="panel-hint">{tr('snapshotHint')}</p>
    </>
  )
}

/* ------------------------------------------------------------ navigator */

export function NavigatorPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc, canvasesRef, frame, settings, pan, stageSize } = ctx
  const ref = useRef<HTMLCanvasElement | null>(null)
  const width = 260
  const height = Math.max(40, Math.round((width * doc.height) / doc.width))
  useEffect(() => {
    const target = ref.current
    if (!target) return
    const context = context2d(target)
    context.clearRect(0, 0, width, height)
    // The composite is what the navigator shows, drawn small.
    const composite = compositeDocument(doc, canvasesRef.current)
    context.drawImage(composite, 0, 0, width, height)
    const scale = width / doc.width
    context.strokeStyle = '#f43f5e'
    context.lineWidth = 2
    context.strokeRect(-pan.x * scale / settings.zoom, -pan.y * scale / settings.zoom, (stageSize.width * scale) / settings.zoom, (stageSize.height * scale) / settings.zoom)
  }, [doc, canvasesRef, frame, width, height, pan, settings.zoom, stageSize])
  const jump = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const fx = (event.clientX - box.left) / box.width
    const fy = (event.clientY - box.top) / box.height
    ctx.setPan({ x: stageSize.width / 2 - fx * doc.width * settings.zoom, y: stageSize.height / 2 - fy * doc.height * settings.zoom })
  }
  return (
    <>
      <h2>{tr('navigator')}</h2>
      <canvas ref={ref} className="navigator" width={width} height={height} onPointerDown={jump} onPointerMove={(event) => { if (event.buttons) jump(event) }} />
      <label>{tr('zoomLevel')}
        <div className="range-field">
          <input type="range" min={5} max={800} value={Math.round(settings.zoom * 100)} onChange={(event) => ctx.setSettings((current) => ({ ...current, zoom: Number(event.target.value) / 100 }))} />
          <span className="range-value">{Math.round(settings.zoom * 100)}%</span>
        </div>
      </label>
      <p className="panel-hint">{tr('navigatorHint')}</p>
    </>
  )
}

/* ------------------------------------------------------- colour & swatches */

export function ColorPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, settings } = ctx
  const [target, setTarget] = useState<'foreground' | 'background'>('foreground')
  const hex = settings[target]
  const rgb = hexToRgb(hex)
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
  const set = (next: string) => ctx.setSettings((current) => ({ ...current, [target]: next }))
  const setRgb = (patch: Partial<typeof rgb>) => { const n = { ...rgb, ...patch }; set(rgbToHex(n.r, n.g, n.b)) }
  const setHsv = (patch: Partial<typeof hsv>) => { const n = { ...hsv, ...patch }; const c = hsvToRgb(n.h, n.s, n.v); set(rgbToHex(c.r, c.g, c.b)) }
  return (
    <>
      <h2>{tr('colorPanel')}</h2>
      <div className="color-targets">
        <button className={target === 'foreground' ? 'active' : ''} onClick={() => setTarget('foreground')}><span className="swatch-chip" style={{ background: settings.foreground }} />{tr('foreground')}</button>
        <button className={target === 'background' ? 'active' : ''} onClick={() => setTarget('background')}><span className="swatch-chip" style={{ background: settings.background }} />{tr('backgroundColor')}</button>
      </div>
      <label>{tr('hsbH')}<div className="range-field"><input type="range" min={0} max={359} value={Math.round(hsv.h)} onChange={(event) => setHsv({ h: Number(event.target.value) })} /><span className="range-value">{Math.round(hsv.h)}</span></div></label>
      <label>{tr('hsbS')}<div className="range-field"><input type="range" min={0} max={100} value={Math.round(hsv.s * 100)} onChange={(event) => setHsv({ s: Number(event.target.value) / 100 })} /><span className="range-value">{Math.round(hsv.s * 100)}</span></div></label>
      <label>{tr('hsbB')}<div className="range-field"><input type="range" min={0} max={100} value={Math.round(hsv.v * 100)} onChange={(event) => setHsv({ v: Number(event.target.value) / 100 })} /><span className="range-value">{Math.round(hsv.v * 100)}</span></div></label>
      <label>{tr('rgbR')}<div className="range-field"><input type="range" min={0} max={255} value={rgb.r} onChange={(event) => setRgb({ r: Number(event.target.value) })} /><span className="range-value">{rgb.r}</span></div></label>
      <label>{tr('rgbG')}<div className="range-field"><input type="range" min={0} max={255} value={rgb.g} onChange={(event) => setRgb({ g: Number(event.target.value) })} /><span className="range-value">{rgb.g}</span></div></label>
      <label>{tr('rgbB')}<div className="range-field"><input type="range" min={0} max={255} value={rgb.b} onChange={(event) => setRgb({ b: Number(event.target.value) })} /><span className="range-value">{rgb.b}</span></div></label>
      <label>{tr('hexLabel')}<input value={hex} onChange={(event) => { if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) set(event.target.value) }} /></label>
    </>
  )
}

export function SwatchesPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, settings } = ctx
  return (
    <>
      <h2>{tr('swatches')}</h2>
      <div className="swatch-grid">
        {settings.swatches.map((color, index) => (
          <button
            key={`${color}-${index}`}
            className="preset-swatch"
            style={{ background: color }}
            data-tooltip={color}
            onClick={(event) => ctx.setSettings((current) => (event.altKey ? { ...current, background: color } : { ...current, foreground: color }))}
            onContextMenu={(event) => { event.preventDefault(); ctx.setSettings((current) => ({ ...current, swatches: current.swatches.filter((_, i) => i !== index) })) }}
          />
        ))}
      </div>
      {settings.swatches.length === 0 && <p className="panel-hint">{tr('noSwatches')}</p>}
      <div className="layer-actions">
        <button onClick={() => ctx.setSettings((current) => ({ ...current, swatches: [...current.swatches, current.foreground] }))}><Plus size={13} /><span>{tr('addSwatch')}</span></button>
      </div>
    </>
  )
}

/* -------------------------------------------------- gradients / patterns / styles / shapes */

export function GradientsPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, settings } = ctx
  const all: GradientDef[] = [...gradientPresets, ...settings.gradients]
  return (
    <>
      <h2>{tr('gradientsPanel')}</h2>
      <div className="gradient-list">
        {all.map((def) => (
          <button
            key={def.id}
            className={`gradient-row${settings.gradientId === def.id ? ' active' : ''}`}
            onClick={() => ctx.applyGradientPreset(def.id)}
            onDoubleClick={() => ctx.openDialog('gradientEditor', { gradient: def })}
          >
            <span className="gradient-chip" style={{ background: gradientCss(def, settings.foreground, settings.background) }} />
            <span>{def.name}</span>
          </button>
        ))}
      </div>
      <div className="layer-actions">
        <button onClick={() => ctx.openDialog('gradientEditor')}><Plus size={13} /><span>{tr('gradientEditor')}</span></button>
      </div>
    </>
  )
}

export function PatternsPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc, canvasesRef, frame } = ctx
  const patterns = doc.patterns ?? []
  return (
    <>
      <h2>{tr('patternsPanel')}</h2>
      {patterns.length === 0 && <p className="panel-hint">{tr('noPatterns')}</p>}
      <div className="swatch-grid">
        {patterns.map((pattern) => (
          <div className="pattern-tile" key={pattern.id} data-tooltip={`${pattern.name} ${pattern.width}×${pattern.height}`}>
            <Thumb canvasesRef={canvasesRef} keys={[`pattern:${pattern.id}`]} size={48} frame={frame} />
            <span>{pattern.name}</span>
          </div>
        ))}
      </div>
      <div className="layer-actions">
        <button onClick={() => ctx.runCommand('edit.definePattern')}><Plus size={13} /><span>{tr('definePattern')}</span></button>
      </div>
    </>
  )
}

export function StylesPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, settings } = ctx
  return (
    <>
      <h2>{tr('stylesPanel')}</h2>
      {settings.styles.length === 0 && <p className="panel-hint">{tr('noStyles')}</p>}
      {settings.styles.map((style) => (
        <div className="channel-row" key={style.id}>
          <button onClick={() => ctx.applyStyle(style.id)}><Sparkles size={13} /><span>{style.name}</span></button>
          <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => ctx.setSettings((current) => ({ ...current, styles: current.styles.filter((item) => item.id !== style.id) }))}><X size={13} /></button>
        </div>
      ))}
      <div className="layer-actions">
        <button onClick={() => ctx.openDialog('layerStyle')}><Plus size={13} /><span>{tr('layerStyle')}</span></button>
      </div>
    </>
  )
}

export function ShapesPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, settings } = ctx
  const builtIn = ['star', 'heart', 'arrow', 'triangle']
  return (
    <>
      <h2>{tr('shapesPanel')}</h2>
      <div className="swatch-grid">
        {builtIn.map((kind) => (
          <button key={kind} className={`shape-tile${settings.customShapeKind === kind ? ' active' : ''}`} onClick={() => { ctx.setSettings((current) => ({ ...current, customShapeKind: kind })); ctx.setTool('customShape') }}>
            {tr(`shape${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)}
          </button>
        ))}
        {settings.customShapes.map((shape) => (
          <button key={shape.id} className={`shape-tile${settings.customShapeKind === shape.id ? ' active' : ''}`} onClick={() => { ctx.setSettings((current) => ({ ...current, customShapeKind: shape.id })); ctx.setTool('customShape') }}
            onContextMenu={(event) => { event.preventDefault(); ctx.setSettings((current) => ({ ...current, customShapes: current.customShapes.filter((item) => item.id !== shape.id) })) }}>
            {shape.name}
          </button>
        ))}
      </div>
      {settings.customShapes.length === 0 && <p className="panel-hint">{tr('noShapes')}</p>}
      <div className="layer-actions">
        <button onClick={ctx.defineShapeFromPath}><Plus size={13} /><span>{tr('defineShape')}</span></button>
      </div>
    </>
  )
}

/* ----------------------------------------------------- brushes / clone / presets */

export function BrushesPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, settings } = ctx
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const target = ref.current
    if (!target) return
    const context = context2d(target)
    context.clearRect(0, 0, target.width, target.height)
    // A sample stroke with the current tip, so its shape can be seen.
    const size = Math.min(settings.brushSize, 60)
    paintStroke(target, { x: 20, y: target.height / 2 }, { x: target.width - 20, y: target.height / 2 }, {
      size, hardness: settings.brushHardness, color: settings.foreground, opacity: settings.brushOpacity, selection: null,
      shape: { spacing: settings.brushSpacing, angle: settings.brushAngle, roundness: settings.brushRoundness, scatter: settings.brushScatter },
    })
  }, [settings.brushSize, settings.brushHardness, settings.brushOpacity, settings.brushSpacing, settings.brushAngle, settings.brushRoundness, settings.brushScatter, settings.foreground])
  const patch = (next: Partial<AppSettings>) => ctx.setSettings((current) => ({ ...current, ...next }))
  const [name, setName] = useState('')
  return (
    <>
      <h2>{tr('brushesPanel')}</h2>
      <canvas ref={ref} className="brush-preview" width={260} height={80} />
      <label>{tr('size')}<div className="range-field"><input type="range" min={1} max={400} value={settings.brushSize} onChange={(event) => patch({ brushSize: Number(event.target.value) })} /><span className="range-value">{settings.brushSize}</span></div></label>
      <label>{tr('hardness')}<div className="range-field"><input type="range" min={0} max={100} value={Math.round(settings.brushHardness * 100)} onChange={(event) => patch({ brushHardness: Number(event.target.value) / 100 })} /><span className="range-value">{Math.round(settings.brushHardness * 100)}</span></div></label>
      <label>{tr('brushSpacing')}<div className="range-field"><input type="range" min={2} max={200} value={Math.round(settings.brushSpacing * 100)} onChange={(event) => patch({ brushSpacing: Number(event.target.value) / 100 })} /><span className="range-value">{Math.round(settings.brushSpacing * 100)}</span></div></label>
      <label>{tr('brushAngle')}<div className="range-field"><input type="range" min={-180} max={180} value={settings.brushAngle} onChange={(event) => patch({ brushAngle: Number(event.target.value) })} /><span className="range-value">{settings.brushAngle}</span></div></label>
      <label>{tr('brushRoundness')}<div className="range-field"><input type="range" min={5} max={100} value={Math.round(settings.brushRoundness * 100)} onChange={(event) => patch({ brushRoundness: Number(event.target.value) / 100 })} /><span className="range-value">{Math.round(settings.brushRoundness * 100)}</span></div></label>
      <label>{tr('brushScatter')}<div className="range-field"><input type="range" min={0} max={200} value={Math.round(settings.brushScatter * 100)} onChange={(event) => patch({ brushScatter: Number(event.target.value) / 100 })} /><span className="range-value">{Math.round(settings.brushScatter * 100)}</span></div></label>
      <div className="channel-row">
        <input value={name} placeholder={tr('brushName')} onChange={(event) => setName(event.target.value)} />
        <button data-tooltip={tr('saveBrush')} onClick={() => {
          const preset = { id: `brush-${Date.now().toString(36)}`, name: name.trim() || `${tr('brush')} ${settings.brushes.length + 1}`, size: settings.brushSize, hardness: settings.brushHardness, opacity: settings.brushOpacity, spacing: settings.brushSpacing, angle: settings.brushAngle, roundness: settings.brushRoundness, scatter: settings.brushScatter }
          patch({ brushes: [...settings.brushes, preset] })
          setName('')
        }}><Save size={13} /></button>
      </div>
      {settings.brushes.map((brush) => (
        <div className="channel-row" key={brush.id}>
          <button className={settings.brushTipId === brush.id ? 'active' : ''} onClick={() => patch({ brushSize: brush.size, brushHardness: brush.hardness, brushOpacity: brush.opacity, brushSpacing: brush.spacing, brushAngle: brush.angle, brushRoundness: brush.roundness, brushScatter: brush.scatter, brushTipId: brush.tipUrl ? brush.id : '' })}>{`${brush.name} · ${Math.round(brush.size)}px`}</button>
          <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => patch({ brushes: settings.brushes.filter((item) => item.id !== brush.id) })}><X size={13} /></button>
        </div>
      ))}
    </>
  )
}

export function CloneSourcePanel({ ctx }: { ctx: PanelContext }) {
  const { tr, cloneSource, settings } = ctx
  return (
    <>
      <h2>{tr('cloneSourcePanel')}</h2>
      {cloneSource
        ? <p>{tr('cloneOffset')}: {Math.round(cloneSource.x)}, {Math.round(cloneSource.y)}</p>
        : <p className="panel-hint">{tr('cloneNone')}</p>}
      <label className="check-row"><input type="checkbox" checked={settings.cloneAligned} onChange={(event) => ctx.setSettings((current) => ({ ...current, cloneAligned: event.target.checked }))} />{tr('aligned')}</label>
      <label className="check-row"><input type="checkbox" checked={settings.sampleAllLayers} onChange={(event) => ctx.setSettings((current) => ({ ...current, sampleAllLayers: event.target.checked }))} />{tr('sampleAll')}</label>
    </>
  )
}

export function ToolPresetsPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, settings } = ctx
  return (
    <>
      <h2>{tr('toolPresets')}</h2>
      {settings.toolPresets.length === 0 && <p className="panel-hint">{tr('noPresets')}</p>}
      {settings.toolPresets.map((preset) => (
        <div className="channel-row" key={preset.id}>
          <button onClick={() => ctx.applyToolPreset(preset.id)}>{`${preset.name} · ${toolLabel(ctx.language, preset.tool)}`}</button>
          <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => ctx.setSettings((current) => ({ ...current, toolPresets: current.toolPresets.filter((item) => item.id !== preset.id) }))}><X size={13} /></button>
        </div>
      ))}
      <div className="layer-actions">
        <button onClick={ctx.saveToolPreset}><Plus size={13} /><span>{tr('savePreset')}</span></button>
      </div>
    </>
  )
}

/* -------------------------------------------------- character / paragraph / glyphs */

function CharacterFields({ ctx, layer }: { ctx: PanelContext; layer: LayerMeta }) {
  const { tr } = ctx
  const text = layer.text!
  const patch = (next: Partial<TextData>) => ctx.patchText(layer.id, next)
  return (
    <>
      <label>{tr('font')}<input value={text.fontFamily} onChange={(event) => patch({ fontFamily: event.target.value })} /></label>
      <div className="dialog-grid">
        <label>{tr('fontSize')}<input type="number" min={4} max={800} value={text.fontSize} onChange={(event) => patch({ fontSize: Number(event.target.value) })} /></label>
        <label>{tr('leading')}<input type="number" min={0.5} max={4} step={0.05} value={text.lineHeight ?? 1.2} onChange={(event) => patch({ lineHeight: Number(event.target.value) })} /></label>
      </div>
      <div className="dialog-grid">
        <label>{tr('tracking')}<input type="number" min={-50} max={200} value={text.letterSpacing ?? 0} onChange={(event) => patch({ letterSpacing: Number(event.target.value) })} /></label>
        <label>{tr('baseline')}<input type="number" min={-200} max={200} value={text.baselineShift ?? 0} onChange={(event) => patch({ baselineShift: Number(event.target.value) })} /></label>
      </div>
      <label>{tr('color')}<input type="color" value={text.color} onChange={(event) => patch({ color: event.target.value })} /></label>
      <div className="lock-row">
        <label className="check-row"><input type="checkbox" checked={text.bold} onChange={(event) => patch({ bold: event.target.checked })} />{tr('bold')}</label>
        <label className="check-row"><input type="checkbox" checked={text.italic} onChange={(event) => patch({ italic: event.target.checked })} />{tr('italic')}</label>
        <label className="check-row"><input type="checkbox" checked={Boolean(text.underline)} onChange={(event) => patch({ underline: event.target.checked })} />{tr('underline')}</label>
        <label className="check-row"><input type="checkbox" checked={Boolean(text.strike)} onChange={(event) => patch({ strike: event.target.checked })} />{tr('strike')}</label>
        <label className="check-row"><input type="checkbox" checked={Boolean(text.allCaps)} onChange={(event) => patch({ allCaps: event.target.checked })} />{tr('allCaps')}</label>
      </div>
      <label>{tr('antiAlias')}
        <select value={text.antiAlias ?? 'smooth'} onChange={(event) => patch({ antiAlias: event.target.value as TextData['antiAlias'] })}>
          {(['none', 'sharp', 'crisp', 'strong', 'smooth'] as const).map((mode) => <option key={mode} value={mode}>{tr(`antiAlias${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)}</option>)}
        </select>
      </label>
    </>
  )
}

export function CharacterPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, activeLayer } = ctx
  return (
    <>
      <h2>{tr('characterPanel')}</h2>
      {activeLayer?.kind === 'text' && activeLayer.text ? <CharacterFields ctx={ctx} layer={activeLayer} /> : <p className="panel-hint">{tr('noTextLayer')}</p>}
    </>
  )
}

export function ParagraphPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, activeLayer } = ctx
  if (activeLayer?.kind !== 'text' || !activeLayer.text) return <><h2>{tr('paragraphPanel')}</h2><p className="panel-hint">{tr('noTextLayer')}</p></>
  const text = activeLayer.text
  const patch = (next: Partial<TextData>) => ctx.patchText(activeLayer.id, next)
  return (
    <>
      <h2>{tr('paragraphPanel')}</h2>
      <div className="layer-actions">
        {(['left', 'center', 'right'] as const).map((align) => (
          <button key={align} className={text.align === align ? 'active' : ''} onClick={() => patch({ align })}>{tr(`align${align.charAt(0).toUpperCase()}${align.slice(1)}`)}</button>
        ))}
      </div>
      <div className="dialog-grid">
        <label>{tr('indent')}<input type="number" min={0} max={800} value={text.indent ?? 0} onChange={(event) => patch({ indent: Number(event.target.value) })} /></label>
        <label>{tr('paragraphSpacing')}<input type="number" min={0} max={400} value={text.paragraphSpacing ?? 0} onChange={(event) => patch({ paragraphSpacing: Number(event.target.value) })} /></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={text.vertical} onChange={(event) => patch({ vertical: event.target.checked })} />{tr('vtext')}</label>
    </>
  )
}

const glyphSets = [
  '©®™°±×÷•…‰€£¥₩¢§¶†‡←↑→↓↔⇐⇒★☆♥♦♣♠✓✗∞≈≠≤≥√∑∏πΩµαβγδ',
  '“”‘’«»„‚–—‐¿¡§ª º ½ ¼ ¾ ⅓ ⅔ ⅛ № ℃ ℉ ✂ ✈ ☎ ☀ ☁ ☂ ☃ ♪ ♫ ☺ ☹',
]

export function GlyphsPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, activeLayer } = ctx
  const canInsert = activeLayer?.kind === 'text' && activeLayer.text
  return (
    <>
      <h2>{tr('glyphs')}</h2>
      <p className="panel-hint">{canInsert ? tr('glyphHint') : tr('noTextLayer')}</p>
      <div className="glyph-grid">
        {glyphSets.join('').replace(/\s+/g, '').split('').map((glyph, index) => (
          <button key={`${glyph}-${index}`} disabled={!canInsert} onClick={() => activeLayer && ctx.patchText(activeLayer.id, { text: `${activeLayer.text!.text}${glyph}` })}>{glyph}</button>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------- measurement log / notes / paths */

export function MeasurementLogPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc } = ctx
  const entries = doc.measurements ?? []
  return (
    <>
      <h2>{tr('measurementLog')}</h2>
      {entries.length === 0 && <p className="panel-hint">{tr('noMeasurements')}</p>}
      {entries.map((entry) => (
        <div className="info-block" key={entry.id}>
          <strong>{entry.label} · {entry.at}</strong>
          <div><span>{tr('measureWidth')}</span><span>{Math.round(entry.width)} px</span></div>
          <div><span>{tr('measureHeight')}</span><span>{Math.round(entry.height)} px</span></div>
          <div><span>{tr('measureArea')}</span><span>{Math.round(entry.area)} px²</span></div>
          {entry.distance !== undefined && <div><span>{tr('distance')}</span><span>{entry.distance.toFixed(1)} px</span></div>}
          {entry.angle !== undefined && <div><span>{tr('angleLabel')}</span><span>{entry.angle.toFixed(1)}°</span></div>}
          {entry.count !== undefined && <div><span>{tr('measureCount')}</span><span>{entry.count}</span></div>}
        </div>
      ))}
      <div className="layer-actions">
        <button onClick={() => ctx.runCommand('image.recordMeasure')}><Plus size={13} /><span>{tr('recordMeasure')}</span></button>
        <button onClick={() => ctx.updateDoc((current) => ({ ...current, measurements: [] }))}><Trash size={13} /><span>{tr('clearLog')}</span></button>
      </div>
    </>
  )
}

export function NotesPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc } = ctx
  return (
    <>
      <h2>{tr('notesPanel')}</h2>
      {doc.notes.length === 0 && <p className="panel-hint">{tr('noNotes')}</p>}
      {doc.notes.map((note) => (
        <div className="info-block note-row" key={note.id}>
          <button onClick={() => ctx.editNote(note.id)}>{note.text || tr('noteText')}</button>
          <span className="region-meta">{tr('noteAt')} {Math.round(note.x)}, {Math.round(note.y)}</span>
          <button data-tooltip={tr('deleteNote')} aria-label={tr('deleteNote')} onClick={() => ctx.updateDoc((current) => ({ ...current, notes: current.notes.filter((item) => item.id !== note.id) }))}><X size={13} /></button>
        </div>
      ))}
    </>
  )
}

export function PathsPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc } = ctx
  return (
    <>
      <h2>{tr('pathsPanel')}</h2>
      {doc.paths.length === 0 && <p className="panel-hint">{tr('noPaths')}</p>}
      {doc.paths.map((path) => (
        <div className="channel-row" key={path.id}>
          <button className={`region-row${path.id === ctx.activePathId ? ' active' : ''}`} onClick={() => ctx.setActivePathId(path.id)}>
            <PenTool size={14} /><span>{path.name}</span><span className="region-meta">{path.nodes.length}</span>
          </button>
          <button data-tooltip={tr('deletePath')} aria-label={tr('deletePath')} onClick={() => ctx.updateDoc((current) => ({ ...current, paths: current.paths.filter((item) => item.id !== path.id) }))}><X size={13} /></button>
        </div>
      ))}
      <div className="layer-actions">
        <button onClick={() => ctx.runCommand('type.workPath')}>{tr('createWorkPath')}</button>
        <button onClick={() => ctx.runCommand('layer.vectorMask')}>{tr('vectorMask')}</button>
      </div>
    </>
  )
}

/* ---------------------------------------------------------- comps / actions / timeline */

export function ActionsPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, settings, recording } = ctx
  const [actionName, setActionName] = useState('')
  return (
    <>
      <h2>{tr('actions')}</h2>
      {recording
        ? (
          <>
            <p className="panel-hint">{`${tr('recording')} · ${recording.length}`}</p>
            <div className="channel-row">
              <input value={actionName} placeholder={tr('actionName')} onChange={(event) => setActionName(event.target.value)} />
              <button data-tooltip={tr('stopRecording')} onClick={() => { ctx.stopRecording(actionName.trim() || tr('action')); setActionName('') }}><Save size={13} /></button>
            </div>
            <button onClick={ctx.cancelRecording}>{tr('cancel')}</button>
          </>
        )
        : <button data-tooltip={tr('startRecording')} onClick={ctx.startRecording}><Circle size={13} /><span>{tr('startRecording')}</span></button>}
      {settings.actions.length === 0
        ? <p className="panel-hint">{tr('noActions')}</p>
        : settings.actions.map((action) => (
          <div className="action-row" key={action.id}>
            <span>{`${action.name} · ${action.steps.length}`}</span>
            <button data-tooltip={tr('playAction')} aria-label={tr('playAction')} onClick={() => ctx.playAction(action)}><Play size={13} /></button>
            <button data-tooltip={tr('batch')} aria-label={tr('batch')} onClick={() => ctx.runBatch(action)}><Layers2 size={13} /></button>
            <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => ctx.deleteAction(action.id)}><Trash size={13} /></button>
          </div>
        ))}
    </>
  )
}

export function CompsPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc } = ctx
  const [compName, setCompName] = useState('')
  return (
    <>
      <h2>{tr('layerComps')}</h2>
      <div className="channel-row">
        <input value={compName} placeholder={tr('compName')} onChange={(event) => setCompName(event.target.value)} />
        <button data-tooltip={tr('captureComp')} onClick={() => { ctx.captureComp(compName.trim() || tr('comp')); setCompName('') }}><Camera size={13} /></button>
      </div>
      {(doc.comps ?? []).length === 0
        ? <p className="panel-hint">{tr('noComps')}</p>
        : (doc.comps ?? []).map((comp) => (
          <div className="channel-row" key={comp.id}>
            <button onClick={() => ctx.applyComp(comp.id)}>{comp.name}</button>
            <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => ctx.deleteComp(comp.id)}><Trash size={13} /></button>
          </div>
        ))}
    </>
  )
}

export function TimelinePanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc, playingFrame } = ctx
  return (
    <>
      <h2>{tr('timeline')}</h2>
      <div className="channel-row">
        <button data-tooltip={tr('addFrame')} onClick={ctx.captureAnimationFrame}><Plus size={13} /><span>{tr('addFrame')}</span></button>
        <button data-tooltip={playingFrame === null ? tr('playAnimation') : tr('stopAnimation')} aria-label={playingFrame === null ? tr('playAnimation') : tr('stopAnimation')} onClick={() => (playingFrame === null ? ctx.startPlayback() : ctx.stopPlayback())}>
          {playingFrame === null ? <Play size={13} /> : <Square size={13} />}
        </button>
      </div>
      {(doc.animation ?? []).length === 0
        ? <p className="panel-hint">{tr('noFrames')}</p>
        : (doc.animation ?? []).map((frame, index) => (
          <div className="frame-row" key={frame.id}>
            <button className={playingFrame === index ? 'active' : ''} onClick={() => ctx.showAnimationFrame(frame.id)}>{index + 1}</button>
            <input type="number" min={20} max={5000} step={20} value={frame.delayMs} onChange={(event) => ctx.patchAnimationFrame(frame.id, { delayMs: Number(event.target.value) })} />
            <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => ctx.deleteAnimationFrame(frame.id)}><Trash size={13} /></button>
          </div>
        ))}
      <button data-tooltip={tr('exportGif')} onClick={ctx.exportAnimatedGif}><span>{tr('exportGif')}</span></button>
      <button data-tooltip={tr('exportVideo')} onClick={ctx.exportVideo}><span>{tr('exportVideo')}</span></button>
    </>
  )
}

export function InfoPanel({ ctx }: { ctx: PanelContext }) {
  const { tr, doc, tool, samplerValues } = ctx
  return (
    <>
      <h2>{tr('info')}</h2>
      <p>{doc.name} {doc.width}×{doc.height} · {doc.colorMode.toUpperCase()}</p>
      <p>{tr('tool')}: {toolLabel(ctx.language, tool)}</p>
      {samplerValues.map((item) => (
        <div className="info-block" key={item.id}>
          <strong>#{item.id.replace(/^s-/, '')} · {Math.round(item.x)},{Math.round(item.y)}</strong>
          <div><span>R G B</span><span>{item.r} {item.g} {item.b}</span></div>
        </div>
      ))}
      {ctx.selection && (
        <div className="info-block">
          <strong>{tr('selection')}</strong>
          <div><span>X, Y</span><span>{Math.round(ctx.selection.x)}, {Math.round(ctx.selection.y)}</span></div>
          <div><span>W × H</span><span>{Math.round(ctx.selection.width)} × {Math.round(ctx.selection.height)}</span></div>
        </div>
      )}
      {doc.measure && (
        <div className="info-block">
          <strong>{tr('measurePanel')}</strong>
          <div><span>{tr('distance')}</span><span>{measureInfo(doc.measure).distance.toFixed(1)} px</span></div>
          <div><span>{tr('angleLabel')}</span><span>{measureInfo(doc.measure).angle.toFixed(1)}°</span></div>
        </div>
      )}
      {doc.slices.length > 0 && (
        <div className="info-block">
          <strong>{tr('slicesPanel')}</strong>
          {doc.slices.map((slice) => (
            <button key={slice.id} className={`region-row${slice.id === ctx.activeSliceId ? ' active' : ''}`} onClick={() => ctx.setActiveSliceId(slice.id)}>
              <Scissors size={14} /><span>{slice.name}</span><span className="region-meta">{slice.width}×{slice.height}</span>
            </button>
          ))}
        </div>
      )}
      {doc.frames.length > 0 && (
        <div className="info-block">
          <strong>{tr('framesPanel')}</strong>
          {doc.frames.map((item) => (
            <div key={item.id} className="region-row"><Frame size={14} /><span>{item.name}</span><span className="region-meta">{item.width}×{item.height}</span></div>
          ))}
        </div>
      )}
      {(doc.artboards ?? []).length > 0 && (
        <div className="info-block">
          <strong>{tr('artboardsPanel')}</strong>
          {(doc.artboards ?? []).map((item) => (
            <div key={item.id} className="region-row"><Grid3x3 size={14} /><span>{item.name}</span><span className="region-meta">{item.width}×{item.height}</span></div>
          ))}
        </div>
      )}
    </>
  )
}

/* --------------------------------------------------------- document tabs */

export function DocumentTabs({ ctx }: { ctx: PanelContext }) {
  const { tr, documents } = ctx
  if (documents.length < 2) return null
  return (
    <div className="doc-tabs" aria-label={tr('docTab')}>
      {documents.map((item) => (
        <button key={item.id} className={item.active ? 'active' : ''} onClick={() => ctx.switchDocument(item.id)}>
          <span>{item.name}{item.dirty ? ' *' : ''}</span>
          <X size={12} onClick={(event) => { event.stopPropagation(); ctx.closeDocumentById(item.id) }} />
        </button>
      ))}
    </div>
  )
}

/** The panel for a tab, so App's render is one element. */
export function PanelSwitch({ tab, ctx, channelsPanel, adjustPanel }: { tab: PanelTab; ctx: PanelContext; channelsPanel: ReactNode; adjustPanel: ReactNode }) {
  switch (tab) {
    case 'layers': return <LayersPanel ctx={ctx} />
    case 'properties': return <PropertiesPanel ctx={ctx} />
    case 'history': return <HistoryPanel ctx={ctx} />
    case 'navigator': return <NavigatorPanel ctx={ctx} />
    case 'color': return <ColorPanel ctx={ctx} />
    case 'swatches': return <SwatchesPanel ctx={ctx} />
    case 'gradients': return <GradientsPanel ctx={ctx} />
    case 'patterns': return <PatternsPanel ctx={ctx} />
    case 'styles': return <StylesPanel ctx={ctx} />
    case 'shapes': return <ShapesPanel ctx={ctx} />
    case 'brushes': return <BrushesPanel ctx={ctx} />
    case 'cloneSource': return <CloneSourcePanel ctx={ctx} />
    case 'toolPresets': return <ToolPresetsPanel ctx={ctx} />
    case 'character': return <CharacterPanel ctx={ctx} />
    case 'paragraph': return <ParagraphPanel ctx={ctx} />
    case 'glyphs': return <GlyphsPanel ctx={ctx} />
    case 'measurementLog': return <MeasurementLogPanel ctx={ctx} />
    case 'notes': return <NotesPanel ctx={ctx} />
    case 'paths': return <PathsPanel ctx={ctx} />
    case 'actions': return <ActionsPanel ctx={ctx} />
    case 'comps': return <CompsPanel ctx={ctx} />
    case 'timeline': return <TimelinePanel ctx={ctx} />
    case 'info': return <InfoPanel ctx={ctx} />
    case 'channels': return channelsPanel
    case 'adjust': return adjustPanel
    default: return null
  }
}

