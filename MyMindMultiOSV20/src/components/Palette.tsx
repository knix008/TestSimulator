// The properties panel's choices: small pictures, all in view, one press away. Each says what it
// is in a tooltip. A group folds away under its heading.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icons'

export type PaletteOption<T extends string> = { value: T; label: string; icon: ReactNode }

export function IconPalette<T extends string>({ id, label, value, options, columns, inline = false, onChange }: { id: string; label: string; value: T | undefined; options: PaletteOption<T>[]; columns: number; inline?: boolean; onChange: (value: T) => void }) {
  return (
    <div className={inline ? 'palette palette-inline' : 'palette'} data-palette={id}>
      <span className="palette-label">{label}</span>
      <div className="palette-grid" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button type="button" role="radio" key={option.value} data-value={option.value} aria-checked={option.value === value} aria-label={option.label} title={option.label} className={option.value === value ? 'palette-item on' : 'palette-item'} onClick={() => onChange(option.value)}>
            {option.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Colours in view, and at their end any other colour. */
export function ColorPalette({ id, label, value, colors, onChange }: { id: string; label: string; value: string; colors: readonly string[]; onChange: (color: string) => void }) {
  const { t } = useTranslation()
  const lower = value.toLowerCase()
  const known = colors.some((color) => color.toLowerCase() === lower)
  return (
    <div className="palette" data-palette={id}>
      <span className="palette-label">{label}</span>
      <div className="palette-colors">
        {colors.map((color) => (
          <button type="button" key={color} data-color={color} className={color.toLowerCase() === lower ? 'color-chip selected' : 'color-chip'} style={{ background: color }} title={color} aria-label={color} aria-pressed={color.toLowerCase() === lower} onClick={() => onChange(color)} />
        ))}
        <label className={known ? 'color-other' : 'color-other selected'} title={t('panel.otherColor')}>
          <i style={known ? undefined : { background: value }} />
          <span>{t('panel.otherColor')}</span>
          <input type="color" aria-label={t('panel.otherColor')} value={value.startsWith('#') && value.length === 7 ? value : '#3b82f6'} onChange={(event) => onChange(event.target.value)} />
        </label>
      </div>
    </div>
  )
}

/** A heading with its icon, and what belongs under it; pressing the heading folds it. */
export function PanelGroup({ id, icon, title, children }: { id: string; icon: string; title: string; children: ReactNode }) {
  return (
    <details className="panel-group" data-group={id} open>
      <summary title={title}>
        <Icon name={icon} size={14} />
        <span>{title}</span>
        <Icon name="caret" size={12} />
      </summary>
      <div className="panel-group-body">{children}</div>
    </details>
  )
}

/** A box with the face a line ends on marked; no face marked means the program chooses. */
export function SideIcon({ side }: { side: 'auto' | 'top' | 'bottom' | 'left' | 'right' }) {
  const faces = { top: 'M5 4H19', bottom: 'M5 16H19', left: 'M5 4V16', right: 'M19 4V16' }
  return (
    <svg width="24" height="20" viewBox="0 0 24 20" aria-hidden="true">
      <rect x="5" y="4" width="14" height="12" rx="1.5" fill="var(--accent-soft)" stroke="currentColor" strokeWidth="1.2" />
      {side === 'auto'
        ? ([[12, 4], [12, 16], [5, 10], [19, 10]] as const).map(([cx, cy]) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="2" fill="var(--accent)" />)
        : <path d={faces[side]} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  )
}
