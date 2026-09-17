import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, Layers2, Minus, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { t } from './i18n'
import { copyText } from './lib/errors'
import { aboutFacts } from './aboutInfo'
import { dialogIcon, dialogTitle, type DialogName, type DialogPayload, type DialogResult } from './dialogMeta'
import { themeLabel, themes } from './themes'
import { curveLut, addCurvePoint, removeCurvePoint } from './lib/curves'
import { filterCatalog } from './catalog'
import { defaultCurves, documentPresets, type AppSettings, type CurveChannel, type CurveData, type CurvePoint, type ExportFormat, type Language, type LevelsData } from './lib/types'

export type { DialogName, DialogPayload, DialogResult } from './dialogMeta'

/**
 * Every popup body lives here so the same component serves both renderings: a
 * real OS window under Electron (src/DialogHost.tsx) and an in-page panel in the
 * browser build, where there is no second window to open.
 */

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

    case 'export':
      return (
        <>
          <label>{tr('exportFormat')}
            <select value={settings?.exportFormat ?? 'png'} onChange={(event) => patchSettings({ exportFormat: event.target.value as ExportFormat })}>
              {(['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'] as ExportFormat[]).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
            </select>
          </label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'export' })}>{tr('export')}</button>
          </div>
        </>
      )

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
          <label>{tr('enterText')}<input value={text} onChange={(event) => setText(event.target.value)} /></label>
          <div className="dialog-actions">
            <button onClick={onClose}>{tr('cancel')}</button>
            <button className="primary" onClick={() => onResult({ action: 'ok', text })}>{tr('ok')}</button>
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
              {(['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'] as ExportFormat[]).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="settings-field">
            <span className="settings-field-name">{tr('settingsBrushSize')}</span>
            <span className="settings-field-hint">{tr('settingsBrushSizeHint')}</span>
            <NumberStepper language={settings.language} min={1} max={400} value={settings.brushSize} onChange={(brushSize) => patchSettings({ brushSize })} />
          </label>
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
