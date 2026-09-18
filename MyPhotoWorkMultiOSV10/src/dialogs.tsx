import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, Layers2, Minus, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { t } from './i18n'
import { copyText } from './lib/errors'
import type { MetaSection } from './lib/metadata'
import { aboutFacts } from './aboutInfo'
import { dialogIcon, dialogTitle, type DialogName, type DialogPayload, type DialogResult } from './dialogMeta'
import { themeLabel, themes } from './themes'
import { curveLut, addCurvePoint, removeCurvePoint } from './lib/curves'
import { filterCatalog } from './catalog'
import { supportsTransparency } from './lib/imageIO'
import { colorFamilies, defaultChannelMix, defaultInkShift, type ChannelMix, type ColorFamily, type InkShift } from './lib/colorTools'
import { builtInProfiles } from './lib/colorModes'
import { defaultThreeD } from './lib/three'
import { defaultCurves, documentPresets, exportFormats, warpStyles, type AppSettings, type CurveChannel, type CurveData, type CurvePoint, type ExportFormat, type Language, type LevelsData, type PageOrientation, type TextWarpStyle, type ThreeDData } from './lib/types'

export type { DialogName, DialogPayload, DialogResult } from './dialogMeta'

/**
 * Every popup body lives here so the same component serves both renderings: a
 * real OS window under Electron (src/DialogHost.tsx) and an in-page panel in the
 * browser build, where there is no second window to open.
 */

/** The information window as plain text, for pasting into a note or a report. */
function infoAsText(sections: MetaSection[], tr: (key: string) => string) {
  return sections.map((section) => (
    [tr(section.key), ...section.rows.map((row) => `  ${row.key ? tr(row.key) : row.label}: ${row.value}`)].join('\n')
  )).join('\n\n')
}

/**
 * The chrome around a dialog: its own icon and title, a draggable strip so the
 * window can be moved, and a close button that turns red under the pointer.
 */
export function DialogFrame({
  name,
  language,
  payload,
  onClose,
  children,
  className,
}: {
  name: DialogName
  language: Language
  payload?: DialogPayload
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  // Each dialog carries its own class, so a rule can target just one of them.
  const classes = ['dialog', `${name}-dialog`, className].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      <header className="dialog-title-bar">
        {createElement(dialogIcon(name), { size: 16 })}
        <h2>{dialogTitle(name, language, payload)}</h2>
        <button
          className="dialog-close"
          data-tooltip={t(language, 'close')}
          aria-label={t(language, 'close')}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>
      <div className="dialog-content">{children}</div>
    </div>
  )
}

/* --------------------------------------------------------- number stepper */

/**
 * A number field with a step button either side.
 *
 * Typing still works — the buttons are there so a value can be nudged without
 * aiming at the browser's own hairline spinners, which are easy to miss and
 * invisible in some themes.
 */
export function NumberStepper({
  value,
  min,
  max,
  step = 1,
  language,
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  language: Language
  onChange: (next: number) => void
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  // Rounded to the step so repeated clicks cannot drift off the grid.
  const nudge = (direction: 1 | -1) => onChange(clamp(Math.round((value + direction * step) / step) * step))

  return (
    <span className="number-stepper">
      <button
        type="button"
        data-tooltip={t(language, 'decrease')}
        aria-label={t(language, 'decrease')}
        disabled={value <= min}
        onClick={() => nudge(-1)}
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(clamp(next))
        }}
      />
      <button
        type="button"
        data-tooltip={t(language, 'increase')}
        aria-label={t(language, 'increase')}
        disabled={value >= max}
        onClick={() => nudge(1)}
      >
        <Plus size={14} />
      </button>
    </span>
  )
}

/* ------------------------------------------------------------ curve editor */

/** The 256x256 curve grid. Click to add a point, drag to move, double-click to remove. */
export function CurveEditor({ points, onChange, accent }: { points: CurvePoint[]; onChange: (next: CurvePoint[]) => void; accent: string }) {
  const size = 236
  const toView = (p: CurvePoint) => ({ x: (p.x / 255) * size, y: size - (p.y / 255) * size })
  const toData = (x: number, y: number) => ({ x: (x / size) * 255, y: ((size - y) / size) * 255 })
  const dragIndex = useRef(-1)

  const nearest = (x: number, y: number) => {
    let best = -1
    let bestDistance = 12
    points.forEach((point, index) => {
      const at = toView(point)
      const distance = Math.hypot(at.x - x, at.y - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    return best
  }

  const localPoint = (event: { currentTarget: SVGSVGElement; clientX: number; clientY: number }) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  const path = useMemo(() => {
    const lut = curveLut(points)
    let d = ''
    for (let i = 0; i < 256; i += 1) {
      const x = (i / 255) * size
      const y = size - (lut[i] / 255) * size
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
    }
    return d
  }, [points])

  return (
    <svg
      className="curve-editor"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onPointerDown={(event) => {
        const at = localPoint(event)
        const index = nearest(at.x, at.y)
        if (index >= 0) {
          dragIndex.current = index
          return
        }
        const data = toData(at.x, at.y)
        const added = addCurvePoint(points, data)
        onChange(added)
        dragIndex.current = added.findIndex((p) => Math.abs(p.x - data.x) < 5)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (dragIndex.current < 0) return
        const at = localPoint(event)
        const data = toData(at.x, at.y)
        const index = dragIndex.current
        const next = points.map((point, i) => {
          if (i !== index) return point
          // The two endpoints stay pinned to their input value.
          const locked = i === 0 || i === points.length - 1
          return {
            x: locked ? point.x : Math.max(0, Math.min(255, Math.round(data.x))),
            y: Math.max(0, Math.min(255, Math.round(data.y))),
          }
        })
        onChange([...next].sort((a, b) => a.x - b.x))
      }}
      onPointerUp={() => { dragIndex.current = -1 }}
      onDoubleClick={(event) => {
        const at = localPoint(event)
        const index = nearest(at.x, at.y)
        if (index >= 0) onChange(removeCurvePoint(points, index))
      }}
    >
      <rect x={0} y={0} width={size} height={size} className="curve-bg" />
      {[1, 2, 3].map((n) => (
        <g key={n}>
          <line x1={(size / 4) * n} y1={0} x2={(size / 4) * n} y2={size} className="curve-grid" />
          <line x1={0} y1={(size / 4) * n} x2={size} y2={(size / 4) * n} className="curve-grid" />
        </g>
      ))}
      <line x1={0} y1={size} x2={size} y2={0} className="curve-diagonal" />
      <path d={path} className="curve-line" style={{ stroke: accent }} />
      {points.map((point, index) => {
        const at = toView(point)
        return <circle key={index} cx={at.x} cy={at.y} r={4} className="curve-point" />
      })}
    </svg>
  )
}

/* ------------------------------------------------------------ dialog bodies */

export function DialogBody({
  name,
  payload,
  onResult,
  onClose,
  onThemeChange,
}: {
  name: DialogName
  payload: DialogPayload
  onResult: (result: DialogResult) => void
  onClose: () => void
  /** Lets the host restyle itself when the settings window changes the theme. */
  onThemeChange?: (theme: string | undefined) => void
}) {
  const language = payload.language
  const tr = (key: string) => t(language, key)

  const [adjust, setAdjust] = useState(() => payload.adjust ?? {
    brightness: 0, contrast: 0, hue: 0, saturation: 0, lightness: 0, radius: 4, amount: 60, width: 1280, height: 720,
  })
  const [background, setBackground] = useState<string>('transparent')
  const [text, setText] = useState(payload.text ?? 'Photo')
  const [curves, setCurves] = useState<CurveData>(() => payload.curves ?? defaultCurves())
  const [channel, setChannel] = useState<CurveChannel>('rgb')
  const [levels, setLevels] = useState<LevelsData>(() => payload.levels ?? { black: 0, gamma: 1, white: 255, outBlack: 0, outWhite: 255 })
  /** Turns the Copy button into its own confirmation. */
  const [copied, setCopied] = useState<'copied' | 'copyFailed' | null>(null)
  // The settings window owns its own copy so its controls stay live; each edit
  // is forwarded to the main window, which is what actually applies it.
  const [settings, setSettings] = useState<AppSettings | undefined>(payload.settings)
  const [orientation, setOrientation] = useState<PageOrientation>(
    () => (payload.print?.orientation === 'landscape' ? 'landscape' : 'portrait'),
  )
  // The Edit, Select and colour windows below; each is one small form, so they
  // share this component's state rather than each having a component of its own.
  const [fillWith, setFillWith] = useState<string>('foreground')
  const [fillOpacity, setFillOpacity] = useState(100)
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [strokeWhere, setStrokeWhere] = useState<'inside' | 'center' | 'outside'>('center')
  const [strokeColor, setStrokeColor] = useState(payload.settings?.foreground ?? '#000000')
  const [tolerance, setTolerance] = useState(48)
  const [mix, setMix] = useState<ChannelMix>(() => defaultChannelMix())
  const [mixChannel, setMixChannel] = useState<'red' | 'green' | 'blue'>('red')
  const [family, setFamily] = useState<ColorFamily>('reds')
  const [ink, setInk] = useState<InkShift>(() => defaultInkShift())
  const [mapFrom, setMapFrom] = useState('#10203a')
  const [mapTo, setMapTo] = useState('#f2d9a0')
  const [replaceWith, setReplaceWith] = useState('#ffffff')
  const [channelName, setChannelName] = useState(() => `${t(payload.language, 'channel')} ${(payload.channels?.length ?? 0) + 1}`)
  const [channelId, setChannelId] = useState('')
  const [combine, setCombine] = useState<'replace' | 'add' | 'subtract' | 'intersect'>('replace')
  const [skewH, setSkewH] = useState(0)
  const [skewV, setSkewV] = useState(0)
  const [perspectiveAmount, setPerspectiveAmount] = useState(30)
  const [corners, setCorners] = useState<{ x: number; y: number }[]>(
    () => [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
  )
  const [warpStyle, setWarpStyle] = useState<TextWarpStyle>('arc')
  const [warpBend, setWarpBend] = useState(40)
  const [profileId, setProfileId] = useState(payload.profile?.current ?? 'srgb')
  const [brushName, setBrushName] = useState('')
  const [solid, setSolid] = useState<ThreeDData>(() => payload.threeD ?? defaultThreeD())
  const [warpH, setWarpH] = useState(0)
  const [warpV, setWarpV] = useState(0)
  const [type, setType] = useState(() => ({
    fontSize: payload.textData?.fontSize ?? 48,
    lineHeight: payload.textData?.lineHeight ?? 1.2,
    letterSpacing: payload.textData?.letterSpacing ?? 0,
    indent: payload.textData?.indent ?? 0,
    paragraphSpacing: payload.textData?.paragraphSpacing ?? 0,
    align: payload.textData?.align ?? 'left' as 'left' | 'center' | 'right',
    bold: payload.textData?.bold ?? true,
    italic: payload.textData?.italic ?? false,
    pathId: payload.textData?.pathId ?? '',
    warpStyle: (payload.textData?.warp?.style ?? 'none') as TextWarpStyle,
    warpBend: payload.textData?.warp?.bend ?? 40,
  }))
  useEffect(() => { onThemeChange?.(settings?.theme) }, [onThemeChange, settings?.theme])

  const patchSettings = (patch: Partial<AppSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current))
    onResult({ action: 'settings', patch })
  }

  switch (name) {
    case 'new':
      return (
        <>
          <label>{tr('preset')}
            <select defaultValue="webHd" onChange={(event) => {
              const preset = documentPresets.find((item) => item.id === event.target.value)
              if (preset) setAdjust((current) => ({ ...current, width: preset.width, height: preset.height }))
            }}>
              {documentPresets.map((preset) => <option key={preset.id} value={preset.id}>{tr(preset.id)}</option>)}
            </select>
          </label>
          <div className="dialog-grid">
            <label>{tr('width')}<NumberStepper language={language} min={1} max={20000} step={10} value={adjust.width} onChange={(width) => setAdjust((c) => ({ ...c, width }))} /></label>
            <label>{tr('height')}<NumberStepper language={language} min={1} max={20000} step={10} value={adjust.height} onChange={(height) => setAdjust((c) => ({ ...c, height }))} /></label>
          </div>
          <label>{tr('background')}
            <select value={background} onChange={(event) => setBackground(event.target.value)}>
              <option value="transparent">{tr('transparent')}</option>
              <option value="#ffffff">{tr('white')}</option>
              <option value="#000000">{tr('black')}</option>
            </select>
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'ok', width: Math.max(1, adjust.width), height: Math.max(1, adjust.height), background })}>{tr('ok')}</button>
          </div>
        </>
      )

    case 'skew':
      return (
        <>
          <div className="dialog-grid">
            <label>{tr('skewH')}<NumberStepper language={language} min={-400} max={400} value={skewH} onChange={setSkewH} /></label>
            <label>{tr('skewV')}<NumberStepper language={language} min={-400} max={400} value={skewV} onChange={setSkewV} /></label>
          </div>
          <p className="dialog-hint">{tr('skewHint')}</p>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', horizontal: skewH, vertical: skewV })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'perspective':
      return (
        <>
          <label>{tr('amount')}
            <input type="range" min={-100} max={100} value={perspectiveAmount} onChange={(event) => setPerspectiveAmount(Number(event.target.value))} />
            <span>{perspectiveAmount}</span>
          </label>
          <p className="dialog-hint">{tr('perspectiveHint')}</p>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', amount: perspectiveAmount })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'distort': {
      // Four corners, each nudged in x and y; the picture follows them.
      const corner = (index: number, axis: 'x' | 'y') => corners[index][axis]
      const setCorner = (index: number, axis: 'x' | 'y', value: number) => setCorners((current) => (
        current.map((point, at) => (at === index ? { ...point, [axis]: value } : point))
      ))
      const labels = ['cornerTopLeft', 'cornerTopRight', 'cornerBottomRight', 'cornerBottomLeft']
      return (
        <>
          {labels.map((label, index) => (
            <div className="dialog-grid" key={label}>
              <label>{`${tr(label)} X`}<NumberStepper language={language} min={-500} max={500} value={corner(index, 'x')} onChange={(value) => setCorner(index, 'x', value)} /></label>
              <label>{`${tr(label)} Y`}<NumberStepper language={language} min={-500} max={500} value={corner(index, 'y')} onChange={(value) => setCorner(index, 'y', value)} /></label>
            </div>
          ))}
          <div className="dialog-actions">
            <button onClick={() => setCorners([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])}>{tr('reset')}</button>
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', corners })}>{tr('apply')}</button>
          </div>
        </>
      )
    }

    case 'warp':
      return (
        <>
          <label>{tr('warpStyle')}
            <select value={warpStyle} onChange={(event) => setWarpStyle(event.target.value as TextWarpStyle)}>
              {warpStyles.map((style) => <option key={style} value={style}>{tr(`warp${style.charAt(0).toUpperCase()}${style.slice(1)}`)}</option>)}
            </select>
          </label>
          <label>{tr('warpBend')}<input type="range" min={-100} max={100} value={warpBend} onChange={(event) => setWarpBend(Number(event.target.value))} /><span>{warpBend}</span></label>
          <label>{tr('warpH')}<input type="range" min={-100} max={100} value={warpH} onChange={(event) => setWarpH(Number(event.target.value))} /><span>{warpH}</span></label>
          <label>{tr('warpV')}<input type="range" min={-100} max={100} value={warpV} onChange={(event) => setWarpV(Number(event.target.value))} /><span>{warpV}</span></label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', style: warpStyle, bend: warpBend, horizontal: warpH, vertical: warpV })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'contentScale':
      return (
        <>
          <div className="dialog-grid">
            <label>{tr('width')}<NumberStepper language={language} min={8} max={8000} value={adjust.width} onChange={(width) => setAdjust((c) => ({ ...c, width }))} /></label>
            <label>{tr('height')}<NumberStepper language={language} min={8} max={8000} value={adjust.height} onChange={(height) => setAdjust((c) => ({ ...c, height }))} /></label>
          </div>
          <p className="dialog-hint">{tr('contentScaleHint')}</p>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', width: adjust.width, height: adjust.height })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'threeD':
      return (
        <>
          <label>{tr('depth')}
            <input type="range" min={0} max={200} value={solid.depth} onChange={(event) => setSolid((c) => ({ ...c, depth: Number(event.target.value) }))} />
            <span>{solid.depth}</span>
          </label>
          <label>{tr('rotateXAxis')}
            <input type="range" min={-90} max={90} value={solid.rotateX} onChange={(event) => setSolid((c) => ({ ...c, rotateX: Number(event.target.value) }))} />
            <span>{solid.rotateX}</span>
          </label>
          <label>{tr('rotateYAxis')}
            <input type="range" min={-90} max={90} value={solid.rotateY} onChange={(event) => setSolid((c) => ({ ...c, rotateY: Number(event.target.value) }))} />
            <span>{solid.rotateY}</span>
          </label>
          <label>{tr('rotateZAxis')}
            <input type="range" min={-180} max={180} value={solid.rotateZ} onChange={(event) => setSolid((c) => ({ ...c, rotateZ: Number(event.target.value) }))} />
            <span>{solid.rotateZ}</span>
          </label>
          <label>{tr('perspectiveAmount')}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(solid.perspective * 100)}
              onChange={(event) => setSolid((c) => ({ ...c, perspective: Number(event.target.value) / 100 }))}
            />
            <span>{Math.round(solid.perspective * 100)}</span>
          </label>
          <div className="dialog-grid">
            <label>{tr('lightX')}
              <input
                type="range"
                min={-100}
                max={100}
                value={Math.round(solid.lightX * 100)}
                onChange={(event) => setSolid((c) => ({ ...c, lightX: Number(event.target.value) / 100 }))}
              />
            </label>
            <label>{tr('lightY')}
              <input
                type="range"
                min={-100}
                max={100}
                value={Math.round(solid.lightY * 100)}
                onChange={(event) => setSolid((c) => ({ ...c, lightY: Number(event.target.value) / 100 }))}
              />
            </label>
          </div>
          <div className="dialog-actions">
            <button onClick={() => setSolid(defaultThreeD())}>{tr('reset')}</button>
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', threeD: solid })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'colorProfile':
      return (
        <>
          {payload.profile?.embedded && (
            <p className="dialog-hint">{`${tr('profileEmbedded')}: ${payload.profile.embedded}`}</p>
          )}
          <label>{tr('profileWorking')}
            <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              {Object.entries(builtInProfiles).map(([id, item]) => (
                <option key={id} value={id}>{item.name}</option>
              ))}
            </select>
          </label>
          <p className="dialog-hint">{tr('profileHint')}</p>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button onClick={() => onResult({ action: 'assign', profile: profileId })}>{tr('profileAssign')}</button>
            <button className="primary" onClick={() => onResult({ action: 'convert', profile: profileId })}>{tr('profileConvert')}</button>
          </div>
        </>
      )

    case 'saveSelection':
      return (
        <>
          <label>{tr('channelName')}
            <input value={channelName} onChange={(event) => setChannelName(event.target.value)} />
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', name: channelName.trim() || tr('channel') })}>{tr('ok')}</button>
          </div>
        </>
      )

    case 'loadSelection': {
      const saved = payload.channels ?? []
      const chosen = channelId || saved[0]?.id || ''
      return (
        <>
          {saved.length === 0
            ? <p className="dialog-hint">{tr('noChannels')}</p>
            : (
              <>
                <label>{tr('channel')}
                  <select value={chosen} onChange={(event) => setChannelId(event.target.value)}>
                    {saved.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label>{tr('combine')}
                  <select value={combine} onChange={(event) => setCombine(event.target.value as typeof combine)}>
                    <option value="replace">{tr('combineReplace')}</option>
                    <option value="add">{tr('combineAdd')}</option>
                    <option value="subtract">{tr('combineSubtract')}</option>
                    <option value="intersect">{tr('combineIntersect')}</option>
                  </select>
                </label>
              </>
            )}
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" disabled={!chosen} onClick={() => onResult({ action: 'apply', channelId: chosen, combine })}>{tr('ok')}</button>
          </div>
        </>
      )
    }

    case 'fill': {
      const swatches = {
        foreground: payload.settings?.foreground ?? '#000000',
        background: payload.settings?.background ?? '#ffffff',
        white: '#ffffff',
        black: '#000000',
      }
      return (
        <>
          <label>{tr('fillWith')}
            <select value={fillWith} onChange={(event) => setFillWith(event.target.value)}>
              <option value="foreground">{tr('fillForeground')}</option>
              <option value="background">{tr('fillBackground')}</option>
              <option value="white">{tr('fillWhite')}</option>
              <option value="black">{tr('fillBlack')}</option>
              {(payload.patterns ?? []).map((pattern) => (
                <option key={pattern.id} value={`pattern:${pattern.id}`}>{pattern.name}</option>
              ))}
            </select>
          </label>
          <label>{tr('opacity')}
            <input type="range" min={5} max={100} value={fillOpacity} onChange={(event) => setFillOpacity(Number(event.target.value))} />
            <span>{fillOpacity}</span>
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button
              className="primary"
              onClick={() => onResult({
                action: 'apply',
                color: swatches[fillWith as keyof typeof swatches] ?? '#000000',
                opacity: fillOpacity / 100,
                // A pattern is chosen from the same list, tagged so the caller
                // knows to tile rather than flood.
                patternId: fillWith.startsWith('pattern:') ? fillWith.slice('pattern:'.length) : '',
              })}
            >
              {tr('apply')}
            </button>
          </div>
        </>
      )
    }

    case 'stroke':
      return (
        <>
          <label>{tr('strokeWidth')}<NumberStepper language={language} min={1} max={64} value={strokeWidth} onChange={setStrokeWidth} /></label>
          <label>{tr('strokeWhere')}
            <select value={strokeWhere} onChange={(event) => setStrokeWhere(event.target.value as typeof strokeWhere)}>
              <option value="inside">{tr('strokeInside')}</option>
              <option value="center">{tr('strokeCenter')}</option>
              <option value="outside">{tr('strokeOutside')}</option>
            </select>
          </label>
          <label>{tr('color')}
            <input type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} />
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', color: strokeColor, width: strokeWidth, where: strokeWhere })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'selectModify':
      return (
        <>
          <label>{tr('radius')}
            <NumberStepper language={language} min={1} max={200} value={adjust.radius} onChange={(radius) => setAdjust((current) => ({ ...current, radius }))} />
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', radius: adjust.radius, modify: payload.modify ?? 'expand' })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'colorRange':
      return (
        <>
          <p className="dialog-hint">{tr('colorRangeHint')}</p>
          <label>{tr('tolerance')}
            <input type="range" min={0} max={255} value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} />
            <span>{tolerance}</span>
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', tolerance })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'channelMixer': {
      const row = mix[mixChannel]
      const patchRow = (patch: Partial<typeof row>) => setMix((current) => ({ ...current, [mixChannel]: { ...current[mixChannel], ...patch } }))
      return (
        <>
          <label>{tr('outputChannel')}
            <select value={mixChannel} onChange={(event) => setMixChannel(event.target.value as typeof mixChannel)}>
              <option value="red">{tr('redChannel')}</option>
              <option value="green">{tr('greenChannel')}</option>
              <option value="blue">{tr('blueChannel')}</option>
            </select>
          </label>
          <label>{tr('redChannel')}<input type="range" min={-200} max={200} value={row.r} onChange={(event) => patchRow({ r: Number(event.target.value) })} /><span>{row.r}</span></label>
          <label>{tr('greenChannel')}<input type="range" min={-200} max={200} value={row.g} onChange={(event) => patchRow({ g: Number(event.target.value) })} /><span>{row.g}</span></label>
          <label>{tr('blueChannel')}<input type="range" min={-200} max={200} value={row.b} onChange={(event) => patchRow({ b: Number(event.target.value) })} /><span>{row.b}</span></label>
          <label>{tr('constant')}<input type="range" min={-100} max={100} value={row.constant} onChange={(event) => patchRow({ constant: Number(event.target.value) })} /><span>{row.constant}</span></label>
          <div className="dialog-actions">
            <button onClick={() => setMix(defaultChannelMix())}>{tr('reset')}</button>
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', mix })}>{tr('apply')}</button>
          </div>
        </>
      )
    }

    case 'selectiveColor':
      return (
        <>
          <label>{tr('colorFamily')}
            <select value={family} onChange={(event) => setFamily(event.target.value as ColorFamily)}>
              {colorFamilies.map((item) => <option key={item} value={item}>{tr(item)}</option>)}
            </select>
          </label>
          <label>{tr('inkCyan')}<input type="range" min={-100} max={100} value={ink.cyan} onChange={(event) => setInk((c) => ({ ...c, cyan: Number(event.target.value) }))} /><span>{ink.cyan}</span></label>
          <label>{tr('inkMagenta')}<input type="range" min={-100} max={100} value={ink.magenta} onChange={(event) => setInk((c) => ({ ...c, magenta: Number(event.target.value) }))} /><span>{ink.magenta}</span></label>
          <label>{tr('inkYellow')}<input type="range" min={-100} max={100} value={ink.yellow} onChange={(event) => setInk((c) => ({ ...c, yellow: Number(event.target.value) }))} /><span>{ink.yellow}</span></label>
          <label>{tr('inkBlack')}<input type="range" min={-100} max={100} value={ink.black} onChange={(event) => setInk((c) => ({ ...c, black: Number(event.target.value) }))} /><span>{ink.black}</span></label>
          <div className="dialog-actions">
            <button onClick={() => setInk(defaultInkShift())}>{tr('reset')}</button>
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', family, shift: ink })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'gradientMap':
      return (
        <>
          <div className="dialog-grid">
            <label>{tr('fromColor')}<input type="color" value={mapFrom} onChange={(event) => setMapFrom(event.target.value)} /></label>
            <label>{tr('toColor')}<input type="color" value={mapTo} onChange={(event) => setMapTo(event.target.value)} /></label>
          </div>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', from: mapFrom, to: mapTo })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'replaceColor':
      return (
        <>
          <p className="dialog-hint">{tr('replaceFromHint')}</p>
          <label>{tr('toColor')}<input type="color" value={replaceWith} onChange={(event) => setReplaceWith(event.target.value)} /></label>
          <label>{tr('tolerance')}
            <input type="range" min={0} max={255} value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} />
            <span>{tolerance}</span>
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', to: replaceWith, tolerance })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'imageInfo': {
      const sections = payload.info ?? []
      return (
        <>
          <div className="info-sheet">
            {sections.map((section) => (
              <section key={section.key}>
                <h3>{tr(section.key)}</h3>
                <dl>
                  {section.rows.map((row, index) => (
                    <div key={`${row.key ?? row.label}-${index}`}>
                      {/* A translated name where there is one, otherwise the
                          name the file itself gives the field. */}
                      <dt>{row.key ? tr(row.key) : row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <div className="dialog-actions">
            <button onClick={() => void copyText(infoAsText(sections, tr))}>{tr('copyDetails')}</button>
            <button className="primary" onClick={onClose}>{tr('close')}</button>
          </div>
        </>
      )
    }

    case 'print': {
      const preview = payload.print
      return (
        <>
          {/* The sheet is drawn to A4 proportions with the same 10 mm margin
              the printed page uses, so what is shown is what comes out. */}
          <div className={`print-sheet ${orientation}`}>
            {preview ? <img src={preview.dataUrl} alt="" /> : null}
          </div>
          <label>{tr('orientation')}
            <select value={orientation} onChange={(event) => setOrientation(event.target.value as PageOrientation)}>
              <option value="portrait">{tr('portrait')}</option>
              <option value="landscape">{tr('landscape')}</option>
            </select>
          </label>
          <p className="dialog-hint">{tr('printPreviewHint')}</p>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" disabled={!preview} onClick={() => onResult({ action: 'print', orientation })}>{tr('print')}</button>
          </div>
        </>
      )
    }

    case 'export': {
      // The checkbox only means anything for the formats that can store alpha;
      // for the others it reads as off and says why.
      const format = settings?.exportFormat ?? 'png'
      const keepsAlpha = supportsTransparency(format)
      return (
        <>
          <label>{tr('exportFormat')}
            <select value={format} onChange={(event) => patchSettings({ exportFormat: event.target.value as ExportFormat })}>
              {exportFormats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={keepsAlpha && (settings?.exportTransparent ?? true)}
              disabled={!keepsAlpha}
              onChange={(event) => patchSettings({ exportTransparent: event.target.checked })}
            />
            {tr('exportTransparent')}
          </label>
          {keepsAlpha ? null : <p className="dialog-hint">{tr('exportOpaqueHint')}</p>}
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'export' })}>{tr('export')}</button>
          </div>
        </>
      )
    }

    case 'brightness':
      return (
        <>
          <label>{tr('brightness')}<input type="range" min={-100} max={100} value={adjust.brightness} onChange={(event) => setAdjust((c) => ({ ...c, brightness: Number(event.target.value) }))} /><span>{adjust.brightness}</span></label>
          <label>{tr('contrast')}<input type="range" min={-100} max={100} value={adjust.contrast} onChange={(event) => setAdjust((c) => ({ ...c, contrast: Number(event.target.value) }))} /><span>{adjust.contrast}</span></label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', brightness: adjust.brightness, contrast: adjust.contrast })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'hue':
      return (
        <>
          <label>{tr('hue')}<input type="range" min={-180} max={180} value={adjust.hue} onChange={(event) => setAdjust((c) => ({ ...c, hue: Number(event.target.value) }))} /><span>{adjust.hue}</span></label>
          <label>{tr('saturation')}<input type="range" min={-100} max={100} value={adjust.saturation} onChange={(event) => setAdjust((c) => ({ ...c, saturation: Number(event.target.value) }))} /><span>{adjust.saturation}</span></label>
          <label>{tr('lightness')}<input type="range" min={-100} max={100} value={adjust.lightness} onChange={(event) => setAdjust((c) => ({ ...c, lightness: Number(event.target.value) }))} /><span>{adjust.lightness}</span></label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', hue: adjust.hue, saturation: adjust.saturation, lightness: adjust.lightness })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'blur':
    case 'feather':
      return (
        <>
          <label>{tr('radius')}<input type="range" min={0.5} max={20} step={0.5} value={adjust.radius} onChange={(event) => setAdjust((c) => ({ ...c, radius: Number(event.target.value) }))} /><span>{adjust.radius}</span></label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', radius: adjust.radius })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'sharpen':
      return (
        <>
          <label>{tr('amount')}<input type="range" min={10} max={150} value={adjust.amount} onChange={(event) => setAdjust((c) => ({ ...c, amount: Number(event.target.value) }))} /><span>{adjust.amount}</span></label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', amount: adjust.amount })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'cameraRaw':
      return (
        <>
          <label>{tr('brightness')}<input type="range" min={-100} max={100} value={adjust.brightness} onChange={(event) => setAdjust((c) => ({ ...c, brightness: Number(event.target.value) }))} /><span>{adjust.brightness}</span></label>
          <label>{tr('contrast')}<input type="range" min={-100} max={100} value={adjust.contrast} onChange={(event) => setAdjust((c) => ({ ...c, contrast: Number(event.target.value) }))} /><span>{adjust.contrast}</span></label>
          <label>{tr('saturation')}<input type="range" min={-100} max={100} value={adjust.saturation} onChange={(event) => setAdjust((c) => ({ ...c, saturation: Number(event.target.value) }))} /><span>{adjust.saturation}</span></label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', brightness: adjust.brightness, contrast: adjust.contrast, saturation: adjust.saturation })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'curves':
      return (
        <>
          <label className="dialog-row">{tr('channel')}
            <select value={channel} onChange={(event) => setChannel(event.target.value as CurveChannel)}>
              <option value="rgb">{tr('channelRgb')}</option>
              <option value="r">{tr('channelRed')}</option>
              <option value="g">{tr('channelGreen')}</option>
              <option value="b">{tr('channelBlue')}</option>
            </select>
          </label>
          <CurveEditor
            points={curves[channel]}
            accent={channel === 'r' ? '#f87171' : channel === 'g' ? '#4ade80' : channel === 'b' ? '#60a5fa' : '#e2e8f0'}
            onChange={(next) => setCurves((current) => ({ ...current, [channel]: next }))}
          />
          <p className="dialog-hint">{tr('curveHint')}</p>
          <div className="dialog-actions">
            <button onClick={() => setCurves((current) => ({ ...current, [channel]: defaultCurves()[channel] }))}><RotateCcw size={15} /><span>{tr('resetCurve')}</span></button>
            <button onClick={() => onResult({ action: 'layer', curves })}><Layers2 size={15} /><span>{tr('adjLayer')}</span></button>
            <button className="primary" onClick={() => onResult({ action: 'apply', curves })}>{tr('apply')}</button>
            <button onClick={onClose}>{tr('cancel')}</button>
          </div>
        </>
      )

    case 'levels':
      return (
        <>
          <fieldset>
            <legend>{tr('inputLevels')}</legend>
            <label>{tr('blackPoint')}<input type="range" min={0} max={254} value={levels.black} onChange={(event) => setLevels((c) => ({ ...c, black: Number(event.target.value) }))} /><span>{levels.black}</span></label>
            <label>{tr('gammaLabel')}<input type="range" min={10} max={300} value={Math.round(levels.gamma * 100)} onChange={(event) => setLevels((c) => ({ ...c, gamma: Number(event.target.value) / 100 }))} /><span>{levels.gamma.toFixed(2)}</span></label>
            <label>{tr('whitePoint')}<input type="range" min={1} max={255} value={levels.white} onChange={(event) => setLevels((c) => ({ ...c, white: Number(event.target.value) }))} /><span>{levels.white}</span></label>
          </fieldset>
          <fieldset>
            <legend>{tr('outputLevels')}</legend>
            <label>{tr('blackPoint')}<input type="range" min={0} max={255} value={levels.outBlack} onChange={(event) => setLevels((c) => ({ ...c, outBlack: Number(event.target.value) }))} /><span>{levels.outBlack}</span></label>
            <label>{tr('whitePoint')}<input type="range" min={0} max={255} value={levels.outWhite} onChange={(event) => setLevels((c) => ({ ...c, outWhite: Number(event.target.value) }))} /><span>{levels.outWhite}</span></label>
          </fieldset>
          <div className="dialog-actions">
            <button onClick={() => payload.autoLevels && setLevels({ ...payload.autoLevels, gamma: 1 })}><Sparkles size={15} /><span>{tr('autoAction')}</span></button>
            <button onClick={() => onResult({ action: 'layer', levels })}><Layers2 size={15} /><span>{tr('adjLayer')}</span></button>
            <button className="primary" onClick={() => onResult({ action: 'apply', levels })}>{tr('apply')}</button>
            <button onClick={onClose}>{tr('cancel')}</button>
          </div>
        </>
      )

    case 'filterGallery':
      return (
        <>
          <div className="filter-gallery-list">
            {filterCatalog.map((item) => (
              <button key={item.id} onClick={() => onResult({ action: 'filter', id: item.id })}>
                {tr(`group${item.group.charAt(0).toUpperCase()}${item.group.slice(1)}`)} · {tr(item.id)}
              </button>
            ))}
          </div>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('close')}</button>
          </div>
        </>
      )

    case 'imageSize':
    case 'canvasSize':
      return (
        <>
          <div className="dialog-grid">
            <label>{tr('width')}<NumberStepper language={language} min={1} max={20000} step={10} value={adjust.width} onChange={(width) => setAdjust((c) => ({ ...c, width }))} /></label>
            <label>{tr('height')}<NumberStepper language={language} min={1} max={20000} step={10} value={adjust.height} onChange={(height) => setAdjust((c) => ({ ...c, height }))} /></label>
          </div>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'apply', width: adjust.width, height: adjust.height })}>{tr('apply')}</button>
          </div>
        </>
      )

    case 'text':
      return (
        <>
          {/* One window for the whole type layer: what it says, how the
              paragraph is set, whether it follows a path, and how it bends. */}
          <label>{tr('enterText')}
            <textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className="dialog-grid">
            <label>{tr('fontSize')}<NumberStepper language={language} min={6} max={400} value={type.fontSize} onChange={(fontSize) => setType((c) => ({ ...c, fontSize }))} /></label>
            <label>{tr('lineHeight')}<NumberStepper language={language} min={50} max={300} step={5} value={Math.round(type.lineHeight * 100)} onChange={(value) => setType((c) => ({ ...c, lineHeight: value / 100 }))} /></label>
          </div>
          <div className="dialog-grid">
            <label>{tr('letterSpacing')}<NumberStepper language={language} min={-20} max={80} value={type.letterSpacing} onChange={(letterSpacing) => setType((c) => ({ ...c, letterSpacing }))} /></label>
            <label>{tr('indent')}<NumberStepper language={language} min={0} max={400} value={type.indent} onChange={(indent) => setType((c) => ({ ...c, indent }))} /></label>
          </div>
          <div className="dialog-grid">
            <label>{tr('paragraphSpacing')}<NumberStepper language={language} min={0} max={200} value={type.paragraphSpacing} onChange={(paragraphSpacing) => setType((c) => ({ ...c, paragraphSpacing }))} /></label>
            <label>{tr('align')}
              <select value={type.align} onChange={(event) => setType((c) => ({ ...c, align: event.target.value as 'left' | 'center' | 'right' }))}>
                <option value="left">{tr('alignLeft')}</option>
                <option value="center">{tr('alignCenter')}</option>
                <option value="right">{tr('alignRight')}</option>
              </select>
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={type.bold} onChange={(event) => setType((c) => ({ ...c, bold: event.target.checked }))} />
            {tr('bold')}
          </label>
          <label className="check-row">
            <input type="checkbox" checked={type.italic} onChange={(event) => setType((c) => ({ ...c, italic: event.target.checked }))} />
            {tr('italic')}
          </label>
          <label>{tr('textOnPath')}
            <select value={type.pathId} onChange={(event) => setType((c) => ({ ...c, pathId: event.target.value }))}>
              <option value="">{tr('noPath')}</option>
              {(payload.paths ?? []).map((path) => <option key={path.id} value={path.id}>{path.name}</option>)}
            </select>
          </label>
          <label>{tr('warpStyle')}
            <select value={type.warpStyle} onChange={(event) => setType((c) => ({ ...c, warpStyle: event.target.value as TextWarpStyle }))}>
              {warpStyles.map((style) => <option key={style} value={style}>{tr(`warp${style.charAt(0).toUpperCase()}${style.slice(1)}`)}</option>)}
            </select>
          </label>
          <label>{tr('warpBend')}
            <input type="range" min={-100} max={100} value={type.warpBend} onChange={(event) => setType((c) => ({ ...c, warpBend: Number(event.target.value) }))} />
            <span>{type.warpBend}</span>
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'ok', text, ...type })}>{tr('ok')}</button>
          </div>
        </>
      )

    case 'unsaved':
      return (
        <>
          <p>{tr('unsavedMessage')}</p>
          <div className="dialog-actions">
            <button onClick={() => onResult({ action: 'discard' })}>{tr('discard')}</button>
            <button onClick={() => onResult({ action: 'cancel' })}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'save' })}>{tr('saveChanges')}</button>
          </div>
        </>
      )

    case 'settings':
      if (!settings) return null
      return (
        <>
          <label>{t(settings.language, 'language')}
            <select value={settings.language} onChange={(event) => patchSettings({ language: event.target.value as Language })}>
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="settings-theme-block">
            <span>{tr('theme')}</span>
            <div className="settings-themes">
              {themes.map((item) => (
                <button
                  key={item.id}
                  className={settings.theme === item.id ? 'active' : ''}
                  data-tooltip={themeLabel(settings.language, item.id)}
                  onClick={() => patchSettings({ theme: item.id })}
                >
                  <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${item.appA}, ${item.accent})` }} />
                  <span>{themeLabel(settings.language, item.id)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="dialog-grid">
            <label className="check-row">
              <input type="checkbox" checked={settings.showGrid} onChange={(event) => patchSettings({ showGrid: event.target.checked })} />
              {tr('grid')}
            </label>
            <label className="check-row">
              <input type="checkbox" checked={settings.showRulers} onChange={(event) => patchSettings({ showRulers: event.target.checked })} />
              {tr('rulers')}
            </label>
          </div>
          <label>{tr('exportFormat')}
            <select value={settings.exportFormat} onChange={(event) => patchSettings({ exportFormat: event.target.value as ExportFormat })}>
              {exportFormats.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={supportsTransparency(settings.exportFormat) && settings.exportTransparent}
              disabled={!supportsTransparency(settings.exportFormat)}
              onChange={(event) => patchSettings({ exportTransparent: event.target.checked })}
            />
            {tr('exportTransparent')}
          </label>
          <label className="settings-field">
            <span className="settings-field-name">{tr('settingsBrushSize')}</span>
            <span className="settings-field-hint">{tr('settingsBrushSizeHint')}</span>
            <NumberStepper language={settings.language} min={1} max={400} value={settings.brushSize} onChange={(brushSize) => patchSettings({ brushSize })} />
          </label>
          {/* The brush tip: the four settings that shape a dab, and the list of
              tips that have been kept. */}
          <h3>{tr('brushes')}</h3>
          <label>{tr('brushSpacing')}
            <input
              type="range"
              min={2}
              max={200}
              value={Math.round(settings.brushSpacing * 100)}
              onChange={(event) => patchSettings({ brushSpacing: Number(event.target.value) / 100 })}
            />
            <span>{Math.round(settings.brushSpacing * 100)}</span>
          </label>
          <label>{tr('brushAngle')}
            <input type="range" min={-180} max={180} value={settings.brushAngle} onChange={(event) => patchSettings({ brushAngle: Number(event.target.value) })} />
            <span>{settings.brushAngle}</span>
          </label>
          <label>{tr('brushRoundness')}
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(settings.brushRoundness * 100)}
              onChange={(event) => patchSettings({ brushRoundness: Number(event.target.value) / 100 })}
            />
            <span>{Math.round(settings.brushRoundness * 100)}</span>
          </label>
          <label>{tr('brushScatter')}
            <input
              type="range"
              min={0}
              max={200}
              value={Math.round(settings.brushScatter * 100)}
              onChange={(event) => patchSettings({ brushScatter: Number(event.target.value) / 100 })}
            />
            <span>{Math.round(settings.brushScatter * 100)}</span>
          </label>
          <div className="channel-row">
            <input value={brushName} placeholder={tr('brushName')} onChange={(event) => setBrushName(event.target.value)} />
            <button
              data-tooltip={tr('saveBrush')}
              onClick={() => {
                const preset = {
                  id: `brush-${Date.now().toString(36)}`,
                  name: brushName.trim() || `${tr('brush')} ${settings.brushes.length + 1}`,
                  size: settings.brushSize,
                  hardness: settings.brushHardness,
                  opacity: settings.brushOpacity,
                  spacing: settings.brushSpacing,
                  angle: settings.brushAngle,
                  roundness: settings.brushRoundness,
                  scatter: settings.brushScatter,
                }
                patchSettings({ brushes: [...settings.brushes, preset] })
                setBrushName('')
              }}
            >
              {tr('saveBrush')}
            </button>
          </div>
          {settings.brushes.length === 0
            ? <p className="dialog-hint">{tr('noBrushes')}</p>
            : settings.brushes.map((brush) => (
              <div className="channel-row" key={brush.id}>
                <button
                  onClick={() => patchSettings({
                    brushSize: brush.size,
                    brushHardness: brush.hardness,
                    brushOpacity: brush.opacity,
                    brushSpacing: brush.spacing,
                    brushAngle: brush.angle,
                    brushRoundness: brush.roundness,
                    brushScatter: brush.scatter,
                  })}
                >
                  {`${brush.name} · ${Math.round(brush.size)}px`}
                </button>
                <button
                  data-tooltip={tr('deleteLayer')}
                  aria-label={tr('deleteLayer')}
                  onClick={() => patchSettings({ brushes: settings.brushes.filter((item) => item.id !== brush.id) })}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          <label className="settings-field">
            <span className="settings-field-name">{tr('settingsTolerance')}</span>
            <span className="settings-field-hint">{tr('settingsToleranceHint')}</span>
            <NumberStepper language={settings.language} min={0} max={255} value={settings.fillTolerance} onChange={(fillTolerance) => patchSettings({ fillTolerance })} />
          </label>
          <div className="dialog-actions">
            <button className="primary" onClick={onClose}>{tr('close')}</button>
          </div>
        </>
      )

    case 'helpGuide':
      return (
        <>
          <div className="help-body">
            <p>{tr('helpIntro')}</p>
            {(['Tools', 'Files', 'Layers', 'Adjust', 'View'] as const).map((section) => (
              <section key={section}>
                <h3>{tr(`help${section}Title`)}</h3>
                <p>{tr(`help${section}Body`)}</p>
              </section>
            ))}
          </div>
          <div className="dialog-actions">
            <button className="primary" onClick={onClose}>{tr('close')}</button>
          </div>
        </>
      )

    case 'about': {
      const facts = aboutFacts(language)
      return (
        <>
          {/* The icon and what the program is, side by side. */}
          <div className="about-head">
            <img className="about-icon" src="./app-icon.svg" alt="" />
            <div className="about-blurb">
              <h3>{t(language, 'appName')}</h3>
              <p>{tr('aboutBody')}</p>
            </div>
          </div>
          {/* Everything worth quoting in a bug report, one row per fact. */}
          <dl className="about-facts">
            {facts.map((fact) => (
              <div key={fact.label} className="about-fact">
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          <div className="dialog-actions">
            <button onClick={() => {
              const text = facts.map((fact) => `${fact.label}: ${fact.value}`).join('\n')
              void copyText(`${t(language, 'appName')}\n${text}`).then((ok) => setCopied(ok ? 'copied' : 'copyFailed'))
            }}><Copy size={15} /><span>{copied ? tr(copied) : tr('copyDetails')}</span></button>
            <button className="primary" onClick={onClose}>{tr('close')}</button>
          </div>
        </>
      )
    }

    case 'error':
      return (
        <>
          <p className="error-message">{payload.error?.message}</p>
          <p className="dialog-hint">{tr('errorHint')}</p>
          <textarea
            className="error-details"
            readOnly
            spellCheck={false}
            value={payload.error?.details ?? ''}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="dialog-actions">
            <button onClick={() => {
              void copyText(payload.error?.details ?? '').then((ok) => setCopied(ok ? 'copied' : 'copyFailed'))
            }}>
              <Copy size={15} />
              <span>{copied ? tr(copied) : tr('copyDetails')}</span>
            </button>
            <button className="primary" onClick={onClose}>{tr('close')}</button>
          </div>
        </>
      )

    default:
      return null
  }
}
