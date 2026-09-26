import { useEffect, useRef, useState } from 'react'
import { THEMES, allThemes, resolveTheme, themesByMode, type Theme, type ThemeMode } from '../core/themes'
import { LIGHT_KINDS, defaultLight, type Lang, type LightKind, type LightRig } from '../core/settings'
import { menuIcon, translate } from '../core/i18n'
import { LightBulb } from './Flags'
import { lightKindKey } from '../core/labels'

/** Small palette preview: background, panel, accent and text of a theme. */
export function ThemeSwatch({ theme, size = 16 }: { theme: Theme; size?: number }) {
  return (
    <span className="swatch" style={{ width: size, height: size, borderColor: theme.colors.line }} aria-hidden="true">
      <i style={{ background: theme.colors.bg }} />
      <i style={{ background: theme.colors.panel }} />
      <i style={{ background: theme.colors.accent }} />
      <i style={{ background: theme.colors.text }} />
    </span>
  )
}

function useDismiss(open: boolean, close: () => void) {
  const host = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!host.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return host
}

/**
 * Theme control: the button shows the palette of the active theme and cycles
 * to the next one, the caret opens the gallery, including the user's own theme.
 */
export function ThemePicker({
  themeId,
  customTheme,
  language,
  label,
  onPick
}: {
  themeId: string
  customTheme: Theme
  language: Lang
  label: string
  onPick: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const host = useDismiss(open, () => setOpen(false))
  const current = resolveTheme(themeId, customTheme)
  const everyTheme = allThemes(customTheme)

  const cycle = () => {
    const index = everyTheme.findIndex((theme) => theme.id === current.id)
    onPick(everyTheme[(index + 1) % everyTheme.length].id)
  }

  return (
    <span className="theme-picker" ref={host}>
      <button
        type="button"
        className="tool theme-cycle"
        data-testid="tb-theme"
        data-theme-id={current.id}
        title={`${label}: ${current.name[language]}`}
        onClick={cycle}
      >
        <ThemeSwatch theme={current} />
      </button>
      <button
        type="button"
        className="tool theme-caret"
        data-testid="tb-theme-menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >▾</button>
      {open ? (
        <div className="theme-menu" role="menu" data-testid="theme-menu">
          {(['dark', 'light'] as ThemeMode[]).map((mode) => (
            <div key={mode} className="theme-menu-group">
              <p className="theme-menu-title">{mode === 'dark' ? 'Dark' : 'Light'} · {themesByMode(mode).length}</p>
              <div className="theme-menu-grid">
                {themesByMode(mode).map((theme) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={theme.id}
                    data-testid={`theme-menu-${theme.id}`}
                    className={theme.id === current.id ? 'theme-swatch on' : 'theme-swatch'}
                    title={theme.name[language]}
                    onClick={() => {
                      onPick(theme.id)
                      setOpen(false)
                    }}
                  >
                    <ThemeSwatch theme={theme} size={14} />
                    <span className="ellipsis">{theme.name[language]}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="theme-menu-group">
            <p className="theme-menu-title">Custom</p>
            <div className="theme-menu-grid">
              <button
                type="button"
                role="menuitem"
                data-testid="theme-menu-custom"
                className={current.id === 'custom' ? 'theme-swatch on' : 'theme-swatch'}
                title={customTheme.name[language]}
                onClick={() => {
                  onPick('custom')
                  setOpen(false)
                }}
              >
                <ThemeSwatch theme={customTheme} size={14} />
                <span className="ellipsis">{customTheme.name[language]}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  )
}

/** Zoom stepper: minus, the current percentage (click resets) and plus. */
export function ZoomControl({
  zoom,
  label,
  onZoom
}: {
  zoom: number
  label: string
  onZoom: (value: number) => void
}) {
  return (
    <span className="zoom-control">
      <button type="button" className="tool" data-testid="tb-zoom-out" title={`${label} −`} onClick={() => onZoom(zoom - 10)}>−</button>
      <button
        type="button"
        className="tool zoom-value"
        data-testid="tb-zoom-value"
        title={`${label} 100%`}
        onClick={() => onZoom(100)}
      >{Math.round(zoom)}%</button>
      <button type="button" className="tool" data-testid="tb-zoom-in" title={`${label} +`} onClick={() => onZoom(zoom + 10)}>+</button>
    </span>
  )
}

/** Text size stepper: minus, the current size in points (click resets) and plus. */
export function FontControl({
  size,
  label,
  onSize
}: {
  size: number
  label: string
  onSize: (value: number) => void
}) {
  const clamp = (value: number) => Math.max(8, Math.min(28, Math.round(value)))
  return (
    <span className="zoom-control font-control">
      <button type="button" className="tool" data-testid="tb-font-dec" title={`${label} −`} onClick={() => onSize(clamp(size - 1))}>−</button>
      <button
        type="button"
        className="tool zoom-value"
        data-testid="tb-font-value"
        title={`${label} 13px`}
        onClick={() => onSize(13)}
      >{`A ${Math.round(size)}`}</button>
      <button type="button" className="tool" data-testid="tb-font-inc" title={`${label} +`} onClick={() => onSize(clamp(size + 1))}>+</button>
    </span>
  )
}

const LIGHT_PRESETS: Array<{ id: string; ko: string; en: string; rig: Partial<LightRig> }> = [
  { id: 'studio', ko: '스튜디오', en: 'Studio', rig: { kind: 'directional', azimuth: 135, elevation: 50, intensity: 1.1, ambient: 0.65, color: '#ffffff' } },
  { id: 'top', ko: '정수리', en: 'Top', rig: { kind: 'directional', azimuth: 90, elevation: 85, intensity: 1.0, ambient: 0.7, color: '#ffffff' } },
  { id: 'side', ko: '측광', en: 'Side', rig: { kind: 'directional', azimuth: 200, elevation: 15, intensity: 1.35, ambient: 0.45, color: '#ffffff' } },
  { id: 'soft', ko: '부드럽게', en: 'Soft', rig: { kind: 'hemisphere', azimuth: 60, elevation: 35, intensity: 0.7, ambient: 0.95, color: '#eef4ff' } },
  { id: 'threePoint', ko: '3점 조명', en: 'Three point', rig: { kind: 'threePoint', azimuth: 140, elevation: 45, intensity: 1.15, ambient: 0.4, color: '#ffffff' } },
  { id: 'spotlight', ko: '스포트', en: 'Spotlight', rig: { kind: 'spot', azimuth: 120, elevation: 65, intensity: 1.2, ambient: 0.3, color: '#fff3df' } },
  { id: 'outdoor', ko: '야외', en: 'Outdoor', rig: { kind: 'hemisphere', azimuth: 150, elevation: 70, intensity: 1.05, ambient: 0.8, color: '#dcecff' } },
  { id: 'lamp', ko: '작업등', en: 'Lamp', rig: { kind: 'point', azimuth: -60, elevation: 30, intensity: 1.3, ambient: 0.35, color: '#ffe0b0' } },
  { id: 'flat', ko: '평면광', en: 'Flat', rig: { kind: 'ambientOnly', azimuth: 135, elevation: 50, intensity: 0.9, ambient: 0.9, color: '#ffffff' } }
]

/** Colours offered for the key light, from tungsten through to open shade. */
const LIGHT_COLORS = ['#ffffff', '#fff3df', '#ffe0b0', '#eef4ff', '#dcecff', '#ffd7d7']

export function lightKindName(language: Lang, kind: LightKind): string {
  return translate(language, lightKindKey(kind))
}

/**
 * Light control: the button toggles the key light, the caret opens sliders that
 * move it around the model.
 */
export function LightPicker({
  light,
  language,
  label,
  onChange
}: {
  light: LightRig
  language: Lang
  label: string
  onChange: (patch: Partial<LightRig>) => void
}) {
  const [open, setOpen] = useState(false)
  const host = useDismiss(open, () => setOpen(false))
  return (
    <span className="light-picker" ref={host}>
      <button
        type="button"
        className={light.enabled ? 'tool on' : 'tool'}
        data-testid="tb-light"
        title={`${label}: ${light.enabled ? 'on' : 'off'} · ${lightKindName(language, light.kind)} · ${Math.round(light.azimuth)}° / ${Math.round(light.elevation)}°`}
        onClick={() => onChange({ enabled: !light.enabled })}
      >
        <span className="menu-icon light-mark">{light.enabled ? <LightBulb on /> : '☾'}</span>
      </button>
      <button
        type="button"
        className="tool light-caret"
        data-testid="tb-light-menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >▾</button>
      {open ? (
        <div className="light-menu" data-testid="light-menu">
          <div className="row light-kinds">
            <span>{translate(language, 'lightKind')}</span>
            <div className="chip-row" data-testid="light-kinds">
              {LIGHT_KINDS.map((kind) => (
                <button
                  type="button"
                  key={kind}
                  className={light.kind === kind ? 'on' : ''}
                  aria-pressed={light.kind === kind}
                  data-testid={`light-kind-${kind}`}
                  title={lightKindName(language, kind)}
                  onClick={() => onChange({ kind, enabled: true })}
                >
                  <span className="menu-icon">{menuIcon(lightKindKey(kind))}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="row light-kinds">
            <span>{translate(language, 'lightColor')}</span>
            <div className="chip-row" data-testid="light-colors">
              {LIGHT_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={light.color === color ? 'on swatch-chip' : 'swatch-chip'}
                  aria-pressed={light.color === color}
                  data-testid={`light-color-${color.slice(1)}`}
                  title={color}
                  style={{ background: color }}
                  onClick={() => onChange({ color })}
                />
              ))}
            </div>
          </div>
          <label className="row">
            <span>{language === 'ko' ? '방향' : 'Azimuth'}</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={light.azimuth}
              data-testid="light-azimuth"
              aria-label={language === 'ko' ? '방향' : 'Azimuth'}
              onChange={(event) => onChange({ azimuth: Number(event.target.value) })}
            />
            <b>{Math.round(light.azimuth)}°</b>
          </label>
          <label className="row">
            <span>{language === 'ko' ? '높이' : 'Elevation'}</span>
            <input
              type="range"
              min={-20}
              max={90}
              step={1}
              value={light.elevation}
              data-testid="light-elevation"
              aria-label={language === 'ko' ? '높이' : 'Elevation'}
              onChange={(event) => onChange({ elevation: Number(event.target.value) })}
            />
            <b>{Math.round(light.elevation)}°</b>
          </label>
          <label className="row">
            <span>{language === 'ko' ? '세기' : 'Intensity'}</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={light.intensity}
              data-testid="light-intensity"
              aria-label={language === 'ko' ? '세기' : 'Intensity'}
              onChange={(event) => onChange({ intensity: Number(event.target.value) })}
            />
            <b>{light.intensity.toFixed(2)}</b>
          </label>
          <label className="row">
            <span>{language === 'ko' ? '환경광' : 'Ambient'}</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={light.ambient}
              data-testid="light-ambient"
              aria-label={language === 'ko' ? '환경광' : 'Ambient'}
              onChange={(event) => onChange({ ambient: Number(event.target.value) })}
            />
            <b>{light.ambient.toFixed(2)}</b>
          </label>
          <div className="row light-reset-row">
            <span>{translate(language, 'lightReset')}</span>
            <button
              type="button"
              className="light-reset"
              data-testid="light-reset"
              title={translate(language, 'lightReset')}
              onClick={() => {
                const home = defaultLight()
                onChange({ azimuth: home.azimuth, elevation: home.elevation })
              }}
            >
              <span className="menu-icon">{menuIcon('lightReset')}</span>
              <span>{language === 'ko' ? '기본 위치' : 'Home'}</span>
            </button>
          </div>
          <div className="row light-presets">
            {LIGHT_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                data-testid={`light-preset-${preset.id}`}
                title={language === 'ko' ? preset.ko : preset.en}
                onClick={() => onChange({ ...preset.rig, enabled: true })}
              >{language === 'ko' ? preset.ko : preset.en}</button>
            ))}
          </div>
        </div>
      ) : null}
    </span>
  )
}

export { THEMES }
