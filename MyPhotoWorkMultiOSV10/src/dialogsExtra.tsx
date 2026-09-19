import { useEffect, useState, type ReactNode } from 'react'
import { useLivePreview } from './usePreview'
import { formatBytes, modelStore, type ModelProgress } from './lib/models'
import { modelSpec, modelSpecs, type ModelTask } from './lib/neural'
import { Layers2, Plus, Sparkles, X } from 'lucide-react'
import { t } from './i18n'
import type { DialogName, DialogPayload, DialogResult } from './dialogMeta'
import { NumberStepper } from './dialogs'
import { adjustmentFields, fieldToSlider, sliderToField } from './adjustmentFields'
import { adjustmentTypes, filterCatalog } from './catalog'
import { gradientCss, gradientPresets, type GradientDef, type GradientStop, type OpacityStop } from './lib/gradients'
import { blendModes, defaultAdjustment, defaultEffects, exportFormats, type Adjustment, type BlendMode, type ExportFormat, type Language, type LayerEffects, type Tool } from './lib/types'
import { blendLabel, toolLabel } from './i18n'

/**
 * The windows added on the way to Photoshop parity. Each is its own small
 * component so its state is its own, and each that changes pixels reports
 * every edit as a `preview` result — the editor shows it on the canvas and
 * only writes it into the layer on Apply.
 */

type BodyProps = {
  name: DialogName
  payload: DialogPayload
  onResult: (result: DialogResult) => void
  onClose: () => void
}

type Tr = (key: string) => string

function Slider({ label, value, min, max, step = 1, onChange, suffix }: { label: string; value: number; min: number; max: number; step?: number; onChange: (next: number) => void; suffix?: string }) {
  return (
    <label>{label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span>{Number.isInteger(step) ? Math.round(value) : value}{suffix ?? ''}</span>
    </label>
  )
}

function PreviewToggle({ tr, value, onChange }: { tr: Tr; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      {tr('livePreview')}
    </label>
  )
}

function Actions({ tr, onClose, onApply, extra, applyLabel = 'apply' }: { tr: Tr; onClose: () => void; onApply: () => void; extra?: ReactNode; applyLabel?: string }) {
  return (
    <div className="dialog-actions">
      {extra}
      <button onClick={onClose}>{tr('cancel')}</button>
      <button className="primary" onClick={onApply}>{tr(applyLabel)}</button>
    </div>
  )
}

/* ------------------------------------------------------- generic filter */

/** What the third parameter means for the filters that read one. */
const extraParam: Record<string, { label: string; kind: 'angle' | 'threshold' | 'choice'; choices?: string[] }> = {
  pathBlur: { label: 'angleParam', kind: 'angle' },
  shakeReduction: { label: 'angleParam', kind: 'angle' },
  smartSharpen: { label: 'thresholdParam', kind: 'threshold' },
  wind: { label: 'extraLabel', kind: 'choice', choices: ['fromLeft', 'fromRight'] },
  polar: { label: 'extraLabel', kind: 'choice', choices: ['rectToPolar', 'polarToRect'] },
  hsbHsa: { label: 'extraLabel', kind: 'choice', choices: ['rgbToHsb', 'hsbToRgb'] },
  halftonePattern: { label: 'extraLabel', kind: 'choice', choices: ['patternDot', 'patternLine', 'patternCircle'] },
  grain: { label: 'extraLabel', kind: 'choice', choices: ['grainRegular', 'grainSoft', 'grainSprinkles', 'grainClumped', 'grainContrasty', 'grainHorizontal', 'grainVertical', 'grainSpeckle'] },
  texturizer: { label: 'extraLabel', kind: 'choice', choices: ['textureCanvas', 'textureBrick', 'textureBurlap', 'textureSandstone'] },
  lensCorrection: { label: 'distortionLabel', kind: 'angle' },
}

function FilterParamsDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const id = payload.filterId ?? 'gaussian'
  const [radius, setRadius] = useState(payload.adjust?.radius ?? 4)
  const [amount, setAmount] = useState(payload.adjust?.amount ?? 60)
  const [extra, setExtra] = useState(0)
  const [preview, setPreview] = useState(true)
  const spec = extraParam[id]
  const values = { id, radius, amount, extra }
  useLivePreview(preview, values, onResult)
  return (
    <>
      <Slider label={tr('radiusLabel')} value={radius} min={0.5} max={60} step={0.5} onChange={setRadius} />
      <Slider label={tr('amountLabel')} value={amount} min={0} max={200} onChange={setAmount} />
      {spec?.kind === 'angle' && <Slider label={tr(spec.label)} value={extra} min={-180} max={180} onChange={setExtra} suffix="°" />}
      {spec?.kind === 'threshold' && <Slider label={tr(spec.label)} value={extra} min={0} max={100} onChange={setExtra} />}
      {spec?.kind === 'choice' && (
        <label>{tr(spec.label)}
          <select value={extra} onChange={(event) => setExtra(Number(event.target.value))}>
            {spec.choices!.map((choice, index) => <option key={choice} value={index}>{tr(choice)}</option>)}
          </select>
        </label>
      )}
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} />
    </>
  )
}

/* ------------------------------------------------------ generic adjustment */

function AdjustmentDialog({ payload, onResult, onClose, asCameraRaw = false }: BodyProps & { asCameraRaw?: boolean }) {
  const tr = (key: string) => t(payload.language, key)
  const type = asCameraRaw ? 'cameraRaw' : (payload.adjustmentType ?? 'brightness')
  const fields = adjustmentFields[type]
  const [adjustment, setAdjustment] = useState<Adjustment>(() => defaultAdjustment(asCameraRaw ? 'exposure' : (payload.adjustmentType ?? 'brightness')))
  const [preview, setPreview] = useState(true)
  const values = { adjustment, type }
  useLivePreview(preview, values, onResult)
  const patch = (key: keyof Adjustment, value: unknown) => setAdjustment((current) => ({ ...current, [key]: value }))
  const layerAllowed = !asCameraRaw && adjustmentTypes.includes(type as typeof adjustmentTypes[number])
  return (
    <>
      {fields.map((field) => (
        field.kind === 'color'
          ? <label key={field.key}>{tr(field.label)}<input type="color" value={String(adjustment[field.key] ?? '#ff9900')} onChange={(event) => patch(field.key, event.target.value)} /></label>
          : <Slider key={field.key} label={tr(field.label)} value={fieldToSlider(field, adjustment[field.key])} min={field.min} max={field.max} step={field.step ?? 1} onChange={(next) => patch(field.key, sliderToField(field, next))} />
      ))}
      {fields.length === 0 && <p className="dialog-hint">{tr('noOptions')}</p>}
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions
        tr={tr}
        onClose={onClose}
        onApply={() => onResult({ action: 'apply', ...values })}
        extra={(
          <>
            <button onClick={() => setAdjustment(defaultAdjustment(adjustment.type))}>{tr('reset')}</button>
            {layerAllowed && <button onClick={() => onResult({ action: 'layer', ...values })}><Layers2 size={15} /><span>{tr('adjLayer')}</span></button>}
          </>
        )}
      />
    </>
  )
}

/* ------------------------------------------------------------------- LUT */

function LutDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const luts = payload.luts ?? []
  const [lutId, setLutId] = useState(luts[0]?.id ?? 'filmstock')
  const [strength, setStrength] = useState(100)
  const [preview, setPreview] = useState(true)
  const values = { lutId, strength: strength / 100 }
  useLivePreview(preview, values, onResult)
  return (
    <>
      <label>{tr('lutPreset')}
        <select value={lutId} onChange={(event) => setLutId(event.target.value)}>
          {luts.map((lut) => <option key={lut.id} value={lut.id}>{lut.name}</option>)}
        </select>
      </label>
      <Slider label={tr('lutStrength')} value={strength} min={0} max={100} onChange={setStrength} />
      <button onClick={() => onResult({ action: 'load' })}>{tr('lutLoad')}</button>
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions
        tr={tr}
        onClose={onClose}
        onApply={() => onResult({ action: 'apply', ...values })}
        extra={<button onClick={() => onResult({ action: 'layer', ...values })}><Layers2 size={15} /><span>{tr('adjLayer')}</span></button>}
      />
    </>
  )
}

/* ------------------------------------------------------------ HDR toning */

function HdrToningDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [radius, setRadius] = useState(24)
  const [strength, setStrength] = useState(60)
  const [detail, setDetail] = useState(40)
  const [gamma, setGamma] = useState(100)
  const [saturation, setSaturation] = useState(10)
  const [preview, setPreview] = useState(true)
  const values = { radius, strength: strength / 100, detail, gamma: gamma / 100, saturation }
  useLivePreview(preview, values, onResult)
  return (
    <>
      <Slider label={tr('hdrRadius')} value={radius} min={2} max={100} onChange={setRadius} />
      <Slider label={tr('hdrStrength')} value={strength} min={0} max={100} onChange={setStrength} />
      <Slider label={tr('hdrDetail')} value={detail} min={-100} max={300} onChange={setDetail} />
      <Slider label={tr('hdrGamma')} value={gamma} min={30} max={300} onChange={setGamma} />
      <Slider label={tr('hdrSaturation')} value={saturation} min={-100} max={100} onChange={setSaturation} />
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} />
    </>
  )
}

/* ----------------------------------------------------------- match colour */

function LayerPicker({ tr, label, layers, value, onChange }: { tr: Tr; label: string; layers: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <label>{tr(label)}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
      </select>
    </label>
  )
}

function MatchColorDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const layers = (payload.layers ?? []).filter((layer) => !layer.active)
  const [sourceId, setSourceId] = useState(layers[0]?.id ?? '')
  const [luminance, setLuminance] = useState(100)
  const [intensity, setIntensity] = useState(100)
  const [fade, setFade] = useState(0)
  const [neutralize, setNeutralize] = useState(false)
  const [preview, setPreview] = useState(true)
  const values = { sourceId, luminance, intensity, fade, neutralize }
  useLivePreview(preview, values, onResult)
  if (!layers.length) return <><p className="dialog-hint">{tr('matchNeedsLayer')}</p><div className="dialog-actions"><button className="primary" onClick={onClose}>{tr('close')}</button></div></>
  return (
    <>
      <LayerPicker tr={tr} label="matchSource" layers={layers} value={sourceId} onChange={setSourceId} />
      <Slider label={tr('luminanceLabel')} value={luminance} min={1} max={200} onChange={setLuminance} />
      <Slider label={tr('intensityLabel')} value={intensity} min={1} max={200} onChange={setIntensity} />
      <Slider label={tr('fadeLabel')} value={fade} min={0} max={100} onChange={setFade} />
      <label className="check-row"><input type="checkbox" checked={neutralize} onChange={(event) => setNeutralize(event.target.checked)} />{tr('neutralize')}</label>
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} />
    </>
  )
}

/* ------------------------------------------------------- apply image */

function BlendPicker({ language, value, onChange, label }: { language: Language; value: BlendMode; onChange: (mode: BlendMode) => void; label: string }) {
  return (
    <label>{label}
      <select value={value} onChange={(event) => onChange(event.target.value as BlendMode)}>
        {blendModes.map((mode) => <option key={mode} value={mode}>{blendLabel(language, mode)}</option>)}
      </select>
    </label>
  )
}

function ApplyImageDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const layers = payload.layers ?? []
  const [sourceId, setSourceId] = useState(layers.find((layer) => !layer.active)?.id ?? layers[0]?.id ?? '')
  const [blend, setBlend] = useState<BlendMode>('multiply')
  const [opacity, setOpacity] = useState(100)
  const [invert, setInvert] = useState(false)
  const [preview, setPreview] = useState(true)
  const values = { sourceId, blend, opacity: opacity / 100, invert }
  useLivePreview(preview, values, onResult)
  return (
    <>
      <LayerPicker tr={tr} label="applyImageSource" layers={layers} value={sourceId} onChange={setSourceId} />
      <BlendPicker language={payload.language} value={blend} onChange={setBlend} label={tr('blendLabel')} />
      <Slider label={tr('opacity')} value={opacity} min={0} max={100} onChange={setOpacity} />
      <label className="check-row"><input type="checkbox" checked={invert} onChange={(event) => setInvert(event.target.checked)} />{tr('invertSource')}</label>
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} />
    </>
  )
}

function CalculationsDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const layers = payload.layers ?? []
  const channels = ['r', 'g', 'b', 'luma', 'a']
  const channelLabel = (c: string) => (c === 'r' ? tr('redChannel') : c === 'g' ? tr('greenChannel') : c === 'b' ? tr('blueChannel') : c === 'a' ? tr('channelAlpha') : tr('channelLuma'))
  const [a, setA] = useState(layers[0]?.id ?? '')
  const [b, setB] = useState(layers[1]?.id ?? layers[0]?.id ?? '')
  const [channelA, setChannelA] = useState('luma')
  const [channelB, setChannelB] = useState('luma')
  const [invertA, setInvertA] = useState(false)
  const [invertB, setInvertB] = useState(false)
  const [blend, setBlend] = useState<BlendMode>('multiply')
  const [opacity, setOpacity] = useState(100)
  const [result, setResult] = useState<'selection' | 'channel' | 'document'>('selection')
  return (
    <>
      <div className="dialog-grid">
        <LayerPicker tr={tr} label="calcA" layers={layers} value={a} onChange={setA} />
        <label>{tr('channelPick')}<select value={channelA} onChange={(event) => setChannelA(event.target.value)}>{channels.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}</select></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={invertA} onChange={(event) => setInvertA(event.target.checked)} />{tr('invertSource')}</label>
      <div className="dialog-grid">
        <LayerPicker tr={tr} label="calcB" layers={layers} value={b} onChange={setB} />
        <label>{tr('channelPick')}<select value={channelB} onChange={(event) => setChannelB(event.target.value)}>{channels.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}</select></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={invertB} onChange={(event) => setInvertB(event.target.checked)} />{tr('invertSource')}</label>
      <BlendPicker language={payload.language} value={blend} onChange={setBlend} label={tr('blendLabel')} />
      <Slider label={tr('opacity')} value={opacity} min={0} max={100} onChange={setOpacity} />
      <label>{tr('resultTo')}
        <select value={result} onChange={(event) => setResult(event.target.value as typeof result)}>
          <option value="selection">{tr('resultSelection')}</option>
          <option value="channel">{tr('resultChannel')}</option>
          <option value="document">{tr('resultDocument')}</option>
        </select>
      </label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', a, b, channelA, channelB, invertA, invertB, blend, opacity: opacity / 100, result })} applyLabel="ok" />
    </>
  )
}

/* ---------------------------------------------------------- rotation etc. */

function RotateArbitraryDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [angle, setAngle] = useState(15)
  const [direction, setDirection] = useState<'cw' | 'ccw'>('cw')
  return (
    <>
      <label>{tr('rotateAngle')}<NumberStepper language={payload.language} min={0} max={360} step={0.5} value={angle} onChange={setAngle} /></label>
      <label>{tr('orientation')}
        <select value={direction} onChange={(event) => setDirection(event.target.value as 'cw' | 'ccw')}>
          <option value="cw">{tr('rotateCW')}</option>
          <option value="ccw">{tr('rotateCCW')}</option>
        </select>
      </label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', angle: direction === 'cw' ? angle : -angle })} applyLabel="ok" />
    </>
  )
}

function NewGuideDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [axis, setAxis] = useState<'x' | 'y'>('y')
  const [position, setPosition] = useState(Math.round((axis === 'y' ? payload.docSize?.height ?? 0 : payload.docSize?.width ?? 0) / 2))
  return (
    <>
      <label>{tr('guideOrientation')}
        <select value={axis} onChange={(event) => setAxis(event.target.value as 'x' | 'y')}>
          <option value="y">{tr('guideHorizontal')}</option>
          <option value="x">{tr('guideVertical')}</option>
        </select>
      </label>
      <label>{tr('guidePosition')}<NumberStepper language={payload.language} min={0} max={20000} value={position} onChange={setPosition} /></label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', axis, position })} applyLabel="ok" />
    </>
  )
}

function GuideLayoutDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [columns, setColumns] = useState(3)
  const [rows, setRows] = useState(2)
  const [gutter, setGutter] = useState(0)
  return (
    <>
      <div className="dialog-grid">
        <label>{tr('guideColumns')}<NumberStepper language={payload.language} min={0} max={40} value={columns} onChange={setColumns} /></label>
        <label>{tr('guideRows')}<NumberStepper language={payload.language} min={0} max={40} value={rows} onChange={setRows} /></label>
      </div>
      <label>{tr('guideGutter')}<NumberStepper language={payload.language} min={0} max={500} value={gutter} onChange={setGutter} /></label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', columns, rows, gutter })} applyLabel="ok" />
    </>
  )
}

function TransformSelectionDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const box = payload.selectionBox ?? { x: 0, y: 0, width: 100, height: 100 }
  const [x, setX] = useState(Math.round(box.x))
  const [y, setY] = useState(Math.round(box.y))
  const [width, setWidth] = useState(Math.round(box.width))
  const [height, setHeight] = useState(Math.round(box.height))
  const [angle, setAngle] = useState(0)
  return (
    <>
      <div className="dialog-grid">
        <label>X<NumberStepper language={payload.language} min={-20000} max={20000} value={x} onChange={setX} /></label>
        <label>Y<NumberStepper language={payload.language} min={-20000} max={20000} value={y} onChange={setY} /></label>
      </div>
      <div className="dialog-grid">
        <label>{tr('width')}<NumberStepper language={payload.language} min={1} max={20000} value={width} onChange={setWidth} /></label>
        <label>{tr('height')}<NumberStepper language={payload.language} min={1} max={20000} value={height} onChange={setHeight} /></label>
      </div>
      <label>{tr('rotateAngle')}<NumberStepper language={payload.language} min={-360} max={360} value={angle} onChange={setAngle} /></label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', x, y, width, height, angle })} applyLabel="ok" />
    </>
  )
}

/* ------------------------------------------------------- select and mask */

function SelectAndMaskDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [smooth, setSmooth] = useState(0)
  const [feather, setFeather] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [shift, setShift] = useState(0)
  const [radius, setRadius] = useState(0)
  const [decontaminate, setDecontaminate] = useState(false)
  const [output, setOutput] = useState<'selection' | 'mask' | 'layer' | 'layerMask'>('selection')
  const [view, setView] = useState<'overlay' | 'black' | 'white'>('overlay')
  const values = { smooth, feather, contrast, shift, radius, decontaminate, view }
  useLivePreview(true, values, onResult)
  return (
    <>
      <label>{tr('viewMode')}
        <select value={view} onChange={(event) => setView(event.target.value as typeof view)}>
          <option value="overlay">{tr('viewOverlay')}</option>
          <option value="black">{tr('viewOnBlack')}</option>
          <option value="white">{tr('viewOnWhite')}</option>
        </select>
      </label>
      <Slider label={tr('edgeRadius')} value={radius} min={0} max={40} onChange={setRadius} />
      <Slider label={tr('smoothLabel')} value={smooth} min={0} max={100} onChange={setSmooth} />
      <Slider label={tr('feather')} value={feather} min={0} max={100} step={0.5} onChange={setFeather} />
      <Slider label={tr('contrastLabel')} value={contrast} min={0} max={100} onChange={setContrast} />
      <Slider label={tr('shiftEdge')} value={shift} min={-100} max={100} onChange={setShift} />
      <label className="check-row"><input type="checkbox" checked={decontaminate} onChange={(event) => setDecontaminate(event.target.checked)} />{tr('decontaminate')}</label>
      <label>{tr('outputTo')}
        <select value={output} onChange={(event) => setOutput(event.target.value as typeof output)}>
          <option value="selection">{tr('outputSelection')}</option>
          <option value="mask">{tr('outputMask')}</option>
          <option value="layer">{tr('outputLayer')}</option>
          <option value="layerMask">{tr('outputLayerMask')}</option>
        </select>
      </label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values, output })} applyLabel="ok" />
    </>
  )
}

/* ------------------------------------------------------- lens correction */

function LensCorrectionDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [distortion, setDistortion] = useState(0)
  const [vignette, setVignette] = useState(0)
  const [fringe, setFringe] = useState(0)
  const [preview, setPreview] = useState(true)
  const values = { distortion, vignette, fringe }
  useLivePreview(preview, values, onResult)
  return (
    <>
      <Slider label={tr('distortionLabel')} value={distortion} min={-100} max={100} onChange={setDistortion} />
      <Slider label={tr('vignetteLabel')} value={vignette} min={-100} max={100} onChange={setVignette} />
      <Slider label={tr('chromaticLabel')} value={fringe} min={-50} max={50} onChange={setFringe} />
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} />
    </>
  )
}

function AdaptiveWideAngleDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [amount, setAmount] = useState(30)
  const [vertical, setVertical] = useState(0)
  const [horizontal, setHorizontal] = useState(0)
  const [preview, setPreview] = useState(true)
  const values = { amount, vertical, horizontal }
  useLivePreview(preview, values, onResult)
  return (
    <>
      <p className="dialog-hint">{tr('adaptiveHint')}</p>
      <Slider label={tr('wideAngleAmount')} value={amount} min={-100} max={100} onChange={setAmount} />
      <Slider label={tr('verticalLabel')} value={vertical} min={-100} max={100} onChange={setVertical} />
      <Slider label={tr('horizontalLabel')} value={horizontal} min={-100} max={100} onChange={setHorizontal} />
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} />
    </>
  )
}

/* ------------------------------------------------------------ blur gallery */

function BlurGalleryDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [kind, setKind] = useState<'fieldBlur' | 'irisBlur' | 'tiltShift' | 'pathBlur' | 'radialSpin'>('irisBlur')
  const [radius, setRadius] = useState(8)
  const [focus, setFocus] = useState(40)
  const [angle, setAngle] = useState(0)
  const [preview, setPreview] = useState(true)
  const values = { kind, radius, focus, angle }
  useLivePreview(preview, values, onResult)
  return (
    <>
      <label>{tr('blurKind')}
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          {(['fieldBlur', 'irisBlur', 'tiltShift', 'pathBlur', 'radialSpin'] as const).map((item) => <option key={item} value={item}>{tr(item)}</option>)}
        </select>
      </label>
      <Slider label={tr('blurAmount')} value={radius} min={1} max={60} onChange={setRadius} />
      {(kind === 'irisBlur' || kind === 'tiltShift') && <Slider label={kind === 'irisBlur' ? tr('focusLabel') : tr('bandLabel')} value={focus} min={1} max={100} onChange={setFocus} />}
      {kind === 'pathBlur' && <Slider label={tr('angleParam')} value={angle} min={-180} max={180} onChange={setAngle} suffix="°" />}
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} />
    </>
  )
}

/* ---------------------------------------------------------- custom filter */

function CustomFilterDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [kernel, setKernel] = useState<number[]>(() => { const k = new Array(25).fill(0); k[12] = 5; k[7] = -1; k[11] = -1; k[13] = -1; k[17] = -1; return k })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState(0)
  const [preview, setPreview] = useState(true)
  const values = { kernel, scale, offset }
  useLivePreview(preview, values, onResult)
  return (
    <>
      <p className="dialog-hint">{tr('kernelLabel')}</p>
      <div className="kernel-grid">
        {kernel.map((value, index) => (
          <input key={index} type="number" value={value} onChange={(event) => setKernel((current) => current.map((v, i) => (i === index ? Number(event.target.value) : v)))} />
        ))}
      </div>
      <div className="dialog-grid">
        <label>{tr('scaleLabel')}<NumberStepper language={payload.language} min={1} max={9999} value={scale} onChange={setScale} /></label>
        <label>{tr('offsetLabel')}<NumberStepper language={payload.language} min={-9999} max={9999} value={offset} onChange={setOffset} /></label>
      </div>
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} />
    </>
  )
}

/* ------------------------------------------------------------ layer style */

type StyleTab = 'dropShadow' | 'innerShadow' | 'outerGlow' | 'innerGlow' | 'bevel' | 'satin' | 'colorOverlay' | 'gradientOverlay' | 'patternOverlay' | 'stroke'
const styleTabs: StyleTab[] = ['dropShadow', 'innerShadow', 'outerGlow', 'innerGlow', 'bevel', 'satin', 'colorOverlay', 'gradientOverlay', 'patternOverlay', 'stroke']
const styleTabLabel: Record<StyleTab, string> = {
  dropShadow: 'dropShadow', innerShadow: 'innerShadow', outerGlow: 'outerGlow', innerGlow: 'innerGlow', bevel: 'bevel', satin: 'satin',
  colorOverlay: 'overlayFx', gradientOverlay: 'gradientOverlay', patternOverlay: 'patternOverlay', stroke: 'strokeFx',
}

function LayerStyleDialog({ payload, onResult }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [effects, setEffects] = useState<LayerEffects>(() => ({ ...defaultEffects(), ...(payload.effects ?? {}) }))
  const [tab, setTab] = useState<StyleTab>('dropShadow')
  const [styleName, setStyleName] = useState('')
  useLivePreview(true, { effects }, onResult)
  const patch = (next: Partial<LayerEffects>) => setEffects((current) => ({ ...current, ...next }))
  const color = (label: string, key: keyof LayerEffects) => (
    <label>{tr(label)}<input type="color" value={String(effects[key] ?? '#000000')} onChange={(event) => patch({ [key]: event.target.value })} /></label>
  )
  const slider = (label: string, key: keyof LayerEffects, min: number, max: number, scale = 1, step = 1) => (
    <Slider label={tr(label)} value={Math.round(Number(effects[key] ?? 0) * scale)} min={min} max={max} step={step} onChange={(next) => patch({ [key]: next / scale })} />
  )
  const enabled = Boolean(effects[tab])
  return (
    <>
      <div className="style-layout">
        <div className="style-tabs">
          {styleTabs.map((item) => (
            <label key={item} className={`style-tab${tab === item ? ' active' : ''}`} onClick={() => setTab(item)}>
              <input type="checkbox" checked={Boolean(effects[item])} onChange={(event) => patch({ [item]: event.target.checked })} onClick={(event) => event.stopPropagation()} />
              <span>{tr(styleTabLabel[item])}</span>
            </label>
          ))}
        </div>
        <div className="style-page">
          <h3>{tr(styleTabLabel[tab])}</h3>
          {!enabled && <p className="dialog-hint">{tr('styleOff')}</p>}
          {tab === 'dropShadow' && (
            <>
              {color('color', 'shadowColor')}
              {slider('shadowOpacity', 'shadowOpacity', 0, 100, 100)}
              {slider('shadowDistance', 'shadowX', -100, 100)}
              {slider('angleLabel', 'shadowY', -100, 100)}
              {slider('shadowSize', 'shadowBlur', 0, 100)}
              {slider('spreadLabel', 'shadowSpread', 0, 40)}
            </>
          )}
          {tab === 'innerShadow' && (
            <>
              {color('color', 'innerShadowColor')}
              {slider('shadowOpacity', 'innerShadowOpacity', 0, 100, 100)}
              {slider('shadowDistance', 'innerShadowX', -60, 60)}
              {slider('angleLabel', 'innerShadowY', -60, 60)}
              {slider('shadowSize', 'innerShadowBlur', 0, 60)}
            </>
          )}
          {tab === 'outerGlow' && (
            <>
              {color('color', 'glowColor')}
              {slider('shadowOpacity', 'glowOpacity', 0, 100, 100)}
              {slider('shadowSize', 'glowSize', 1, 120)}
            </>
          )}
          {tab === 'innerGlow' && (
            <>
              {color('color', 'innerGlowColor')}
              {slider('shadowOpacity', 'innerGlowOpacity', 0, 100, 100)}
              {slider('shadowSize', 'innerGlowSize', 1, 80)}
            </>
          )}
          {tab === 'bevel' && (
            <>
              <label>{tr('bevelStyle')}
                <select value={effects.bevelStyle ?? 'inner'} onChange={(event) => patch({ bevelStyle: event.target.value as LayerEffects['bevelStyle'] })}>
                  <option value="inner">{tr('bevelInner')}</option>
                  <option value="outer">{tr('bevelOuter')}</option>
                  <option value="emboss">{tr('bevelEmboss')}</option>
                  <option value="pillow">{tr('bevelPillow')}</option>
                </select>
              </label>
              {slider('depthLabel', 'bevelDepth', 1, 500)}
              {slider('shadowSize', 'bevelSize', 1, 80)}
              {slider('softenLabel', 'bevelSoften', 0, 16)}
              {slider('angleLabel', 'bevelAngle', -180, 180)}
              {color('highlightColor', 'bevelHighlight')}
              {color('shadowColorLabel', 'bevelShadow')}
            </>
          )}
          {tab === 'satin' && (
            <>
              {color('color', 'satinColor')}
              {slider('shadowOpacity', 'satinOpacity', 0, 100, 100)}
              {slider('shadowDistance', 'satinDistance', 1, 80)}
              {slider('shadowSize', 'satinSize', 1, 80)}
            </>
          )}
          {tab === 'colorOverlay' && (
            <>
              {color('color', 'overlayColor')}
              {slider('shadowOpacity', 'overlayOpacity', 0, 100, 100)}
              <BlendPicker language={payload.language} value={(effects.overlayBlend ?? 'source-over') as BlendMode} onChange={(mode) => patch({ overlayBlend: mode })} label={tr('blendLabel')} />
            </>
          )}
          {tab === 'gradientOverlay' && (
            <>
              <div className="dialog-grid">
                {color('fromColor', 'gradientFrom')}
                {color('toColor', 'gradientTo')}
              </div>
              {slider('angleLabel', 'gradientAngle', -180, 180)}
              {slider('shadowOpacity', 'gradientOpacity', 0, 100, 100)}
              <label>{tr('gradient')}
                <select value={effects.gradientStyle ?? 'linear'} onChange={(event) => patch({ gradientStyle: event.target.value as 'linear' | 'radial' })}>
                  <option value="linear">{tr('gradLinear')}</option>
                  <option value="radial">{tr('gradRadial')}</option>
                </select>
              </label>
            </>
          )}
          {tab === 'patternOverlay' && (
            <>
              <label>{tr('pattern')}
                <select value={effects.patternId ?? ''} onChange={(event) => patch({ patternId: event.target.value || undefined })}>
                  <option value="">—</option>
                  {(payload.patterns ?? []).map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}
                </select>
              </label>
              {slider('shadowOpacity', 'patternOpacity', 0, 100, 100)}
              {slider('scaleLabel', 'patternScale', 10, 400, 100)}
            </>
          )}
          {tab === 'stroke' && (
            <>
              {color('color', 'strokeColor')}
              {slider('shadowSize', 'strokeWidth', 1, 60)}
              {slider('shadowOpacity', 'strokeOpacity', 0, 100, 100)}
              <label>{tr('positionLabel')}
                <select value={effects.strokePosition ?? 'outside'} onChange={(event) => patch({ strokePosition: event.target.value as LayerEffects['strokePosition'] })}>
                  <option value="outside">{tr('posOutside')}</option>
                  <option value="inside">{tr('posInside')}</option>
                  <option value="center">{tr('posCenter')}</option>
                </select>
              </label>
            </>
          )}
        </div>
      </div>
      <div className="channel-row">
        <input value={styleName} placeholder={tr('styleName')} onChange={(event) => setStyleName(event.target.value)} />
        <button onClick={() => onResult({ action: 'saveStyle', effects, name: styleName.trim() || tr('styleName') })}><Sparkles size={13} /><span>{tr('saveStyle')}</span></button>
      </div>
      <Actions
        tr={tr}
        onClose={() => onResult({ action: 'cancel' })}
        onApply={() => onResult({ action: 'apply', effects })}
        applyLabel="ok"
        extra={<button onClick={() => setEffects(defaultEffects())}>{tr('reset')}</button>}
      />
    </>
  )
}

/* -------------------------------------------------------- gradient editor */

function GradientEditorDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const fg = payload.settings?.foreground ?? '#000000'
  const bg = payload.settings?.background ?? '#ffffff'
  const [def, setDef] = useState<GradientDef>(() => payload.gradient ?? { ...gradientPresets[0], id: `grad-${Date.now().toString(36)}`, name: tr('gradient') })
  const presets = [...gradientPresets, ...(payload.gradients ?? [])]
  const resolvedColor = (color: string) => (color === 'foreground' ? fg : color === 'background' ? bg : color)
  const setStop = (index: number, patch: Partial<GradientStop>) => setDef((current) => ({ ...current, stops: current.stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)) }))
  const setOpacityStop = (index: number, patch: Partial<OpacityStop>) => setDef((current) => ({ ...current, opacityStops: current.opacityStops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)) }))
  return (
    <>
      <label>{tr('gradientPreset')}
        <select value="" onChange={(event) => { const preset = presets.find((item) => item.id === event.target.value); if (preset) setDef({ ...preset, id: def.id, stops: preset.stops.map((s) => ({ ...s })), opacityStops: preset.opacityStops.map((s) => ({ ...s })) }) }}>
          <option value="">—</option>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
      </label>
      <div className="gradient-preview" style={{ background: gradientCss(def, fg, bg) }} />
      <label>{tr('presetName')}<input value={def.name} onChange={(event) => setDef((current) => ({ ...current, name: event.target.value }))} /></label>
      <h3>{tr('stopColor')}</h3>
      {def.stops.map((stop, index) => (
        <div className="channel-row" key={`c${index}`}>
          <input type="color" value={resolvedColor(stop.color)} onChange={(event) => setStop(index, { color: event.target.value })} />
          <input type="range" min={0} max={100} value={Math.round(stop.position * 100)} onChange={(event) => setStop(index, { position: Number(event.target.value) / 100 })} />
          <span>{Math.round(stop.position * 100)}%</span>
          <button data-tooltip={tr('removeStop')} aria-label={tr('removeStop')} disabled={def.stops.length <= 2} onClick={() => setDef((current) => ({ ...current, stops: current.stops.filter((_, i) => i !== index) }))}><X size={13} /></button>
        </div>
      ))}
      <button onClick={() => setDef((current) => ({ ...current, stops: [...current.stops, { position: 0.5, color: fg }] }))}><Plus size={13} /><span>{tr('addStop')}</span></button>
      <h3>{tr('stopOpacity')}</h3>
      {def.opacityStops.map((stop, index) => (
        <div className="channel-row" key={`o${index}`}>
          <input type="range" min={0} max={100} value={Math.round(stop.opacity * 100)} onChange={(event) => setOpacityStop(index, { opacity: Number(event.target.value) / 100 })} />
          <span>{Math.round(stop.opacity * 100)}%</span>
          <input type="range" min={0} max={100} value={Math.round(stop.position * 100)} onChange={(event) => setOpacityStop(index, { position: Number(event.target.value) / 100 })} />
          <span>{Math.round(stop.position * 100)}%</span>
          <button data-tooltip={tr('removeStop')} aria-label={tr('removeStop')} disabled={def.opacityStops.length <= 2} onClick={() => setDef((current) => ({ ...current, opacityStops: current.opacityStops.filter((_, i) => i !== index) }))}><X size={13} /></button>
        </div>
      ))}
      <button onClick={() => setDef((current) => ({ ...current, opacityStops: [...current.opacityStops, { position: 0.5, opacity: 1 }] }))}><Plus size={13} /><span>{tr('addStop')}</span></button>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', gradient: def })} applyLabel="saveGradient" />
    </>
  )
}

/* ---------------------------------------------------------------- neural */

function NeuralDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [kind, setKind] = useState<'skin' | 'colorize' | 'superZoom' | 'restore' | 'depthBlur'>('skin')
  const [amount, setAmount] = useState(50)
  const [preview, setPreview] = useState(true)
  const values = { kind, amount }
  useLivePreview(preview && kind !== 'superZoom', values, onResult)
  return (
    <>
      <label>{tr('neuralFilters')}
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          <option value="skin">{tr('neuralSkin')}</option>
          <option value="colorize">{tr('neuralColorize')}</option>
          <option value="superZoom">{tr('neuralSuperZoom')}</option>
          <option value="restore">{tr('neuralRestore')}</option>
          <option value="depthBlur">{tr('neuralDepth')}</option>
        </select>
      </label>
      <Slider label={tr('amountLabel')} value={amount} min={0} max={100} onChange={setAmount} />
      <p className="dialog-hint">{tr('neuralHint')}</p>
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} extra={<button onClick={() => onResult({ action: 'models' })}>{tr('neuralModels')}</button>} />
    </>
  )
}

/**
 * The Neural Models window: every model the app can use, its size, licence
 * and whether it is on this machine, with a download (and its progress) or a
 * delete button. The store itself lives in `lib/models.ts`; this window only
 * asks it, so it works both in its own Electron window and in the page.
 */
function NeuralModelsDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [downloaded, setDownloaded] = useState<string[]>(payload.models?.downloaded ?? [])
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [useWebgpu, setUseWebgpu] = useState(Boolean(payload.models?.useWebgpu))
  useEffect(() => {
    const store = modelStore()
    let cancelled = false
    void store.list().then((ids) => { if (!cancelled) setDownloaded(ids) })
    const off = store.onProgress((next) => {
      setProgress((current) => ({ ...current, [next.id]: next }))
      if (next.done) {
        if (next.error) setErrors((current) => ({ ...current, [next.id]: next.error ?? '' }))
        void store.list().then((ids) => { if (!cancelled) setDownloaded(ids) })
      }
    })
    return () => { cancelled = true; off() }
  }, [])
  const download = (id: string) => {
    setErrors((current) => ({ ...current, [id]: '' }))
    setProgress((current) => ({ ...current, [id]: { id, received: 0, total: modelSpec(id)?.bytes ?? 0, done: false } }))
    void modelStore().download(id).catch((error: unknown) => setErrors((current) => ({ ...current, [id]: String(error instanceof Error ? error.message : error) })))
  }
  const remove = (id: string) => {
    void modelStore().remove(id).then(() => modelStore().list()).then(setDownloaded)
  }
  const tasks: ModelTask[] = ['subject', 'sky', 'depth', 'inpaint', 'upscale']
  const taskLabel: Record<ModelTask, string> = { subject: 'modelTaskSubject', sky: 'modelTaskSky', depth: 'modelTaskDepth', inpaint: 'modelTaskInpaint', upscale: 'modelTaskUpscale' }
  return (
    <>
      <p className="dialog-hint">{tr('modelsIntro')} {tr('modelProvider')}{tr('modelThreads').replace('{n}', String(payload.models?.threads ?? 1))}{payload.models?.webgpu ? `, ${tr('modelWebgpu')}` : ''}</p>
      {payload.models?.webgpu && (
        <label className="check-row">
          <input type="checkbox" checked={useWebgpu} onChange={(event) => { setUseWebgpu(event.target.checked); onResult({ action: 'settings', patch: { neuralWebgpu: event.target.checked } }) }} />
          {tr('modelUseWebgpu')}
        </label>
      )}
      {payload.models?.needed && <p className="dialog-hint model-needed">{tr('modelNeeded')}: {tr(taskLabel[payload.models.needed as ModelTask] ?? payload.models.needed)}</p>}
      <div className="model-list">
        {tasks.map((task) => (
          <section key={task} className={payload.models?.needed === task ? 'model-task needed' : 'model-task'}>
            <h3>{tr(taskLabel[task])}</h3>
            {modelSpecs.filter((spec) => spec.task === task).map((spec) => {
              const ready = downloaded.includes(spec.id)
              const running = progress[spec.id] && !progress[spec.id].done
              const fraction = running && progress[spec.id].total > 0 ? progress[spec.id].received / progress[spec.id].total : 0
              return (
                <div key={spec.id} className="model-row">
                  <div className="model-text">
                    <strong>{spec.name}</strong> <span className="model-size">{formatBytes(spec.bytes)}</span>
                    <div className="model-note">{tr(spec.note)} · {tr('modelLicense')}: {spec.license}</div>
                    {running && <progress max={1} value={fraction} />}
                    {errors[spec.id] && <div className="model-error">{errors[spec.id]}</div>}
                  </div>
                  <div className="model-actions">
                    <span className={ready ? 'model-status ready' : 'model-status'}>{running ? `${tr('modelDownloading')} ${Math.round(fraction * 100)}%` : ready ? tr('modelReady') : tr('modelMissing')}</span>
                    {ready
                      ? <button onClick={() => remove(spec.id)}>{tr('modelDelete')}</button>
                      : <button className="primary" disabled={Boolean(running)} onClick={() => download(spec.id)}>{tr('modelDownload')}</button>}
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="primary" onClick={() => { onResult({ action: 'refresh', downloaded }); onClose() }}>{tr('ok')}</button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------ small ones */

function NoteDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [text, setText] = useState(payload.note?.text ?? '')
  return (
    <>
      <label>{tr('noteText')}<textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', id: payload.note?.id, text })} applyLabel="ok" />
    </>
  )
}

function NamePromptDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [name, setName] = useState(payload.defaultName ?? '')
  return (
    <>
      <label>{tr('presetName')}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onResult({ action: 'ok', name: name.trim() || payload.defaultName || '', promptFor: payload.promptFor, extra: payload.extra }) }} /></label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'ok', name: name.trim() || payload.defaultName || '', promptFor: payload.promptFor, extra: payload.extra })} applyLabel="ok" />
    </>
  )
}

function FindReplaceDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  return (
    <>
      <label>{tr('findText')}<input value={find} onChange={(event) => setFind(event.target.value)} /></label>
      <label>{tr('replaceText')}<input value={replace} onChange={(event) => setReplace(event.target.value)} /></label>
      <label className="check-row"><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />{tr('matchCase')}</label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', find, replace, matchCase })} applyLabel="replaceAll" />
    </>
  )
}

function ExportAsDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [format, setFormat] = useState<ExportFormat>(payload.settings?.exportFormat ?? 'png')
  const [quality, setQuality] = useState(92)
  const [scale, setScale] = useState(100)
  const [transparent, setTransparent] = useState(true)
  return (
    <>
      <label>{tr('exportFormat')}
        <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
          {exportFormats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
        </select>
      </label>
      <Slider label={tr('exportQuality')} value={quality} min={10} max={100} onChange={setQuality} />
      <label>{tr('exportScale')}<NumberStepper language={payload.language} min={5} max={800} step={5} value={scale} onChange={setScale} /></label>
      <label className="check-row"><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />{tr('exportTransparent')}</label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', format, quality: quality / 100, scale: scale / 100, transparent })} applyLabel="export" />
    </>
  )
}

function OpenRecentDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const files = payload.recentFiles ?? []
  return (
    <>
      {files.length === 0 ? <p className="dialog-hint">{tr('noRecent')}</p> : (
        <div className="filter-gallery-list">
          {files.map((file) => <button key={file} onClick={() => onResult({ action: 'open', path: file })}>{file}</button>)}
        </div>
      )}
      <div className="dialog-actions">
        <button onClick={() => onResult({ action: 'clear' })}>{tr('clearRecent')}</button>
        <button className="primary" onClick={onClose}>{tr('close')}</button>
      </div>
    </>
  )
}

function KeyboardShortcutsDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [map, setMap] = useState<Record<string, string>>(() => Object.fromEntries((payload.shortcuts ?? []).map((item) => [item.tool, item.key])))
  const conflict = (tool: string, key: string) => Object.entries(map).some(([other, k]) => other !== tool && k === key && key)
  return (
    <>
      <p className="dialog-hint">{tr('shortcutsHint')}</p>
      <div className="shortcut-list">
        {(payload.shortcuts ?? []).map((item) => (
          <label key={item.tool} className="shortcut-row">
            <span>{toolLabel(payload.language, item.tool as Tool)}</span>
            <input maxLength={1} value={map[item.tool] ?? ''} onChange={(event) => setMap((current) => ({ ...current, [item.tool]: event.target.value.toLowerCase() }))} />
            {conflict(item.tool, map[item.tool] ?? '') && <em>{tr('keyConflict')}</em>}
          </label>
        ))}
      </div>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', shortcuts: map })} applyLabel="ok" extra={<button onClick={() => onResult({ action: 'reset' })}>{tr('reset')}</button>} />
    </>
  )
}

function ContactSheetDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [columns, setColumns] = useState(4)
  const [thumb, setThumb] = useState(256)
  return (
    <>
      <div className="dialog-grid">
        <label>{tr('columnsLabel')}<NumberStepper language={payload.language} min={1} max={12} value={columns} onChange={setColumns} /></label>
        <label>{tr('thumbSize')}<NumberStepper language={payload.language} min={32} max={1024} step={32} value={thumb} onChange={setThumb} /></label>
      </div>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', columns, thumb })} applyLabel="ok" />
    </>
  )
}

function FitImageDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(1024)
  return (
    <>
      <div className="dialog-grid">
        <label>{tr('fitWidth')}<NumberStepper language={payload.language} min={1} max={20000} step={16} value={width} onChange={setWidth} /></label>
        <label>{tr('fitHeight')}<NumberStepper language={payload.language} min={1} max={20000} step={16} value={height} onChange={setHeight} /></label>
      </div>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', width, height })} applyLabel="ok" />
    </>
  )
}

function PhotomergeDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [layout, setLayout] = useState<'auto' | 'horizontal' | 'vertical'>('auto')
  const [blend, setBlend] = useState(true)
  return (
    <>
      <label>{tr('photomergeLayout')}
        <select value={layout} onChange={(event) => setLayout(event.target.value as typeof layout)}>
          <option value="auto">{tr('layoutAuto')}</option>
          <option value="horizontal">{tr('layoutHorizontal')}</option>
          <option value="vertical">{tr('layoutVertical')}</option>
        </select>
      </label>
      <label className="check-row"><input type="checkbox" checked={blend} onChange={(event) => setBlend(event.target.checked)} />{tr('blendImages')}</label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', layout, blend })} applyLabel="ok" />
    </>
  )
}

function ImageProcessorDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [format, setFormat] = useState<ExportFormat>('jpg')
  const [maxSide, setMaxSide] = useState(2048)
  return (
    <>
      <label>{tr('exportFormat')}
        <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
          {exportFormats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
        </select>
      </label>
      <label>{tr('fitWidth')}<NumberStepper language={payload.language} min={16} max={20000} step={16} value={maxSide} onChange={setMaxSide} /></label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', format, maxSide })} applyLabel="ok" />
    </>
  )
}

function FadeDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [opacity, setOpacity] = useState(50)
  const [blend, setBlend] = useState<BlendMode>('source-over')
  const values = { opacity: opacity / 100, blend }
  useLivePreview(true, values, onResult)
  return (
    <>
      <Slider label={tr('fadeOpacity')} value={opacity} min={0} max={100} onChange={setOpacity} />
      <BlendPicker language={payload.language} value={blend} onChange={setBlend} label={tr('blendLabel')} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ...values })} applyLabel="ok" />
    </>
  )
}

function SkyReplaceDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const layers = (payload.layers ?? []).filter((layer) => !layer.active)
  const [source, setSource] = useState<'gradient' | 'layer'>('gradient')
  const [layerId, setLayerId] = useState(layers[0]?.id ?? '')
  const [top, setTop] = useState('#1d4ed8')
  const [bottom, setBottom] = useState('#bfdbfe')
  const [fade, setFade] = useState(12)
  return (
    <>
      <label>{tr('skySource')}
        <select value={source} onChange={(event) => setSource(event.target.value as typeof source)}>
          <option value="gradient">{tr('skyGradient')}</option>
          {layers.length > 0 && <option value="layer">{tr('skyFromLayer')}</option>}
        </select>
      </label>
      {source === 'gradient'
        ? (
          <div className="dialog-grid">
            <label>{tr('fromColor')}<input type="color" value={top} onChange={(event) => setTop(event.target.value)} /></label>
            <label>{tr('toColor')}<input type="color" value={bottom} onChange={(event) => setBottom(event.target.value)} /></label>
          </div>
        )
        : <LayerPicker tr={tr} label="skyFromLayer" layers={layers} value={layerId} onChange={setLayerId} />}
      <Slider label={tr('skyBlend')} value={fade} min={0} max={60} onChange={setFade} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', source, layerId, top, bottom, fade })} applyLabel="ok" />
    </>
  )
}

function PerspectiveWarpDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [corners, setCorners] = useState([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])
  const labels = ['cornerTopLeft', 'cornerTopRight', 'cornerBottomRight', 'cornerBottomLeft']
  const [preview, setPreview] = useState(true)
  useLivePreview(preview, { corners }, onResult)
  const setCorner = (index: number, axis: 'x' | 'y', value: number) => setCorners((current) => current.map((point, at) => (at === index ? { ...point, [axis]: value } : point)))
  return (
    <>
      <p className="dialog-hint">{tr('perspectiveCorners')}</p>
      {labels.map((label, index) => (
        <div className="dialog-grid" key={label}>
          <label>{`${tr(label)} X`}<NumberStepper language={payload.language} min={-2000} max={2000} step={5} value={corners[index].x} onChange={(value) => setCorner(index, 'x', value)} /></label>
          <label>{`${tr(label)} Y`}<NumberStepper language={payload.language} min={-2000} max={2000} step={5} value={corners[index].y} onChange={(value) => setCorner(index, 'y', value)} /></label>
        </div>
      ))}
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', corners })} />
    </>
  )
}

function DuotoneDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [ink1, setInk1] = useState('#1e1b4b')
  const [ink2, setInk2] = useState('#f5d0a9')
  const [preview, setPreview] = useState(true)
  useLivePreview(preview, { ink1, ink2 }, onResult)
  return (
    <>
      <div className="dialog-grid">
        <label>{tr('duotoneInk1')}<input type="color" value={ink1} onChange={(event) => setInk1(event.target.value)} /></label>
        <label>{tr('duotoneInk2')}<input type="color" value={ink2} onChange={(event) => setInk2(event.target.value)} /></label>
      </div>
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', ink1, ink2 })} applyLabel="ok" />
    </>
  )
}

function IndexedDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [colors, setColors] = useState(64)
  const [dither, setDither] = useState(true)
  const [preview, setPreview] = useState(true)
  useLivePreview(preview, { colors, dither }, onResult)
  return (
    <>
      <Slider label={tr('indexedColors')} value={colors} min={2} max={256} onChange={setColors} />
      <label className="check-row"><input type="checkbox" checked={dither} onChange={(event) => setDither(event.target.checked)} />{tr('indexedDither')}</label>
      <PreviewToggle tr={tr} value={preview} onChange={setPreview} />
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', colors, dither })} applyLabel="ok" />
    </>
  )
}

function CheckSpellingDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const suspects = payload.spelling ?? []
  const [fixes, setFixes] = useState<Record<string, string>>(() => Object.fromEntries(suspects.map((item) => [item.word, item.suggestion ?? item.word])))
  return (
    <>
      {suspects.length === 0 ? <p className="dialog-hint">{tr('spellingNone')}</p> : (
        <>
          <p className="dialog-hint">{tr('spellingFound')}</p>
          {suspects.map((item) => (
            <div className="channel-row" key={`${item.layer}-${item.word}`}>
              <span>{item.word}</span>
              <input value={fixes[item.word] ?? ''} onChange={(event) => setFixes((current) => ({ ...current, [item.word]: event.target.value }))} />
            </div>
          ))}
        </>
      )}
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', fixes })} applyLabel="replaceAll" />
    </>
  )
}

function VanishingPointDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  return (
    <>
      <p className="dialog-hint">{tr('vanishingHint')}</p>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply' })} applyLabel="vanishingApply" />
    </>
  )
}

function StatisticsDialog({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const [mode, setMode] = useState<'mean' | 'median' | 'max' | 'min' | 'range'>('mean')
  return (
    <>
      <p className="dialog-hint">{`${tr('infoLayers')}: ${payload.stats?.layers ?? 0}`}</p>
      <label>{tr('statisticsMode')}
        <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="mean">{tr('modeMean')}</option>
          <option value="median">{tr('modeMedian')}</option>
          <option value="max">{tr('modeMax')}</option>
          <option value="min">{tr('modeMin')}</option>
          <option value="range">{tr('modeRange')}</option>
        </select>
      </label>
      <Actions tr={tr} onClose={onClose} onApply={() => onResult({ action: 'apply', mode })} applyLabel="ok" />
    </>
  )
}

/** The Filter Gallery: every filter grouped, applied with a live preview of the chosen one. */
/**
 * The Filter Gallery: one tab per filter group, the group's filters as a
 * grid of buttons, and the two sliders beside them. Nothing in the window
 * scrolls — the window is sized for the largest group — so the Cancel and
 * Apply buttons are always where they were.
 */
export function FilterGalleryBody({ payload, onResult, onClose }: BodyProps) {
  const tr = (key: string) => t(payload.language, key)
  const groups = [...new Set(filterCatalog.map((item) => item.group))]
  const [group, setGroup] = useState(groups.includes('artistic') ? 'artistic' : groups[0])
  const [selected, setSelected] = useState<string | null>(null)
  const [radius, setRadius] = useState(payload.adjust?.radius ?? 4)
  const [amount, setAmount] = useState(payload.adjust?.amount ?? 60)
  const values = { id: selected ?? '', radius, amount, extra: 0 }
  useLivePreview(Boolean(selected), values, onResult)
  const groupLabel = (id: string) => tr(`group${id.charAt(0).toUpperCase()}${id.slice(1)}`)
  return (
    <>
      <div className="settings-tabs gallery-tabs">
        {groups.map((id) => (
          <button key={id} className={group === id ? 'active' : ''} onClick={() => setGroup(id)}>{groupLabel(id)}</button>
        ))}
      </div>
      <div className="gallery-layout">
        <div className="gallery-grid">
          {filterCatalog.filter((item) => item.group === group).map((item) => (
            <button key={item.id} className={selected === item.id ? 'active' : ''} onClick={() => setSelected(item.id)}>{tr(item.id)}</button>
          ))}
        </div>
        <div className="gallery-controls">
          <h3>{selected ? tr(selected) : groupLabel(group)}</h3>
          <Slider label={tr('radiusLabel')} value={radius} min={0.5} max={60} step={0.5} onChange={setRadius} />
          <Slider label={tr('amountLabel')} value={amount} min={0} max={200} onChange={setAmount} />
          <p className="dialog-hint">{selected ? '' : tr('galleryPick')}</p>
        </div>
      </div>
      <Actions tr={tr} onClose={onClose} onApply={() => selected && onResult({ action: 'apply', ...values })} />
    </>
  )
}

/** Routes a dialog name to its body; null when the name is one of the originals. */
export function ExtraDialogBody(props: BodyProps): ReactNode {
  switch (props.name) {
    case 'filterParams': return <FilterParamsDialog {...props} />
    case 'adjustment': return <AdjustmentDialog {...props} />
    case 'cameraRaw': return <AdjustmentDialog {...props} asCameraRaw />
    case 'lut': return <LutDialog {...props} />
    case 'hdrToning': return <HdrToningDialog {...props} />
    case 'matchColor': return <MatchColorDialog {...props} />
    case 'applyImage': return <ApplyImageDialog {...props} />
    case 'calculations': return <CalculationsDialog {...props} />
    case 'rotateArbitrary': return <RotateArbitraryDialog {...props} />
    case 'newGuide': return <NewGuideDialog {...props} />
    case 'guideLayout': return <GuideLayoutDialog {...props} />
    case 'transformSelection': return <TransformSelectionDialog {...props} />
    case 'selectAndMask': return <SelectAndMaskDialog {...props} />
    case 'lensCorrection': return <LensCorrectionDialog {...props} />
    case 'adaptiveWideAngle': return <AdaptiveWideAngleDialog {...props} />
    case 'blurGallery': return <BlurGalleryDialog {...props} />
    case 'customFilter': return <CustomFilterDialog {...props} />
    case 'layerStyle': return <LayerStyleDialog {...props} />
    case 'gradientEditor': return <GradientEditorDialog {...props} />
    case 'neural': return <NeuralDialog {...props} />
    case 'neuralModels': return <NeuralModelsDialog {...props} />
    case 'note': return <NoteDialog {...props} />
    case 'namePrompt': return <NamePromptDialog {...props} />
    case 'findReplace': return <FindReplaceDialog {...props} />
    case 'exportAs': return <ExportAsDialog {...props} />
    case 'openRecent': return <OpenRecentDialog {...props} />
    case 'keyboardShortcuts': return <KeyboardShortcutsDialog {...props} />
    case 'contactSheet': return <ContactSheetDialog {...props} />
    case 'fitImage': return <FitImageDialog {...props} />
    case 'photomerge': return <PhotomergeDialog {...props} />
    case 'imageProcessor': return <ImageProcessorDialog {...props} />
    case 'fade': return <FadeDialog {...props} />
    case 'skyReplace': return <SkyReplaceDialog {...props} />
    case 'perspectiveWarp': return <PerspectiveWarpDialog {...props} />
    case 'duotone': return <DuotoneDialog {...props} />
    case 'indexed': return <IndexedDialog {...props} />
    case 'checkSpelling': return <CheckSpellingDialog {...props} />
    case 'vanishingPoint': return <VanishingPointDialog {...props} />
    case 'statistics': return <StatisticsDialog {...props} />
    case 'filterGallery': return <FilterGalleryBody {...props} />
    default: return null
  }
}

