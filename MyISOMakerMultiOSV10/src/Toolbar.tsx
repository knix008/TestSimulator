import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

export type ToolbarAction = {
  id: string
  label: string
  tooltip: string
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  primary?: boolean
  /** Buttons show only their icon (the label is the tooltip); false shows the label too. */
  iconOnly?: boolean
  onClick: () => void
}

/** In the last group: where `endLead` (the theme button) goes. Ids starting with "sep" are separators. */
export const END_LEAD = '__endLead__'

type ToolbarProps = {
  groups: ToolbarAction[][]
}

/**
 * Two rows. The title row (the window has no system title bar): `lead` (icon, name,
 * version), a drag area, the `titleActions` (panel buttons) and `trail`
 * (minimize / maximize / close). The tool row under it: every group but the last on
 * the left (Start first), the last group right-aligned with `endLead` where END_LEAD
 * sits (theme, language, settings, help, about). Each row is one line.
 */
export function Toolbar({
  groups,
  ariaLabel = 'MyISOMaker toolbar',
  endLead,
  lead,
  trail,
  titleActions = [],
}: ToolbarProps & {
  ariaLabel?: string
  endLead?: ReactNode
  lead?: ReactNode
  trail?: ReactNode
  titleActions?: ToolbarAction[]
}) {
  const last = groups.length - 1
  return (
    <>
      <div className="titlebar" data-tauri-drag-region>
        {lead}
        <span className="titlebar-drag" data-tauri-drag-region />
        {titleActions.length ? (
          <div className="toolbar-group titlebar-actions">
            {titleActions.map((action) => (
              <ToolbarButton key={action.id} action={action} />
            ))}
          </div>
        ) : null}
        {trail}
      </div>
      <div className="toolbar" role="toolbar" aria-label={ariaLabel}>
        <div className="toolbar-main">
          {groups.map((group, gi) =>
            gi === last ? null : (
              <div key={gi} className="toolbar-group">
                {gi > 0 && <span className="toolbar-sep" aria-hidden="true" />}
                {group.map((action) => (
                  <ToolbarButton key={action.id} action={action} />
                ))}
              </div>
            ),
          )}
        </div>
        {last >= 0 && (
          <div className="toolbar-group toolbar-end">
            {groups[last]!.map((action) =>
              action.id === END_LEAD ? (
                <span key={action.id} className="toolbar-endlead">
                  {endLead}
                </span>
              ) : action.id.startsWith('sep') ? (
                <span key={action.id} className="toolbar-sep" aria-hidden="true" />
              ) : (
                <ToolbarButton key={action.id} action={action} />
              ),
            )}
          </div>
        )}
      </div>
    </>
  )
}

function ToolbarButton({ action }: { action: ToolbarAction }) {
  return (
    <button
      type="button"
      className={[
        'toolbar-btn',
        action.active ? 'active' : '',
        action.primary ? 'primary' : '',
        action.iconOnly === false ? '' : 'icon-only',
      ]
        .filter(Boolean)
        .join(' ')}
      data-tool={action.id}
      disabled={action.disabled}
      onClick={action.onClick}
      title={action.tooltip}
      aria-label={action.tooltip}
      data-tooltip={action.tooltip}
    >
      <span className="toolbar-icon" aria-hidden="true">
        {action.icon}
      </span>
      {action.iconOnly === false ? <span className="toolbar-label">{action.label}</span> : null}
    </button>
  )
}

/** Inline SVG icons (no external icon font); drawn in currentColor, coloured below. */
const MonoIcons = {
  openIso: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 4v2.5M4 12h2.5M12 17.5V20M17.5 12H20" />
      <path d="M15 3h5v5" />
      <path d="M14 10l6-6" />
    </svg>
  ),
  save: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 4v6h8V4M8 18h8v-5H8v5z" />
    </svg>
  ),
  extract: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h10l2 3h4v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <path d="M12 11v7M9 15l3 3 3-3" />
    </svg>
  ),
  create: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  ),
  bootable: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 6h14v10H5z" />
      <path d="M9 20h6M12 16v4" />
      <path d="M10 10l4 2-4 2v-4z" fill="currentColor" stroke="none" />
    </svg>
  ),
  mount: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
    </svg>
  ),
  run: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7h6l2 2h10v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </svg>
  ),
  clear: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  ),
  unmount: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
    </svg>
  ),
  lang: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 3 4 6 4 9s-1.5 6-4 9M12 3c-2.5 3-4 6-4 9s1.5 6 4 9" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7h.01" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v5M12 18h.01" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12l5 5L19 7" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  ),
  rename: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  ),
  mkdir: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7h6l2 2h10v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" />
      <path d="M12 12v5M9.5 14.5h5" />
    </svg>
  ),
  exportFile: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4v10M8 10l4 4 4-4" />
      <path d="M5 18h14" />
    </svg>
  ),
  addFile: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 4h6l4 4v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M14 4v4h4M10 14h6M13 11v6" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </svg>
  ),
  bulb: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  ),
  recent: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  ),
  disc: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 6.5a5.5 5.5 0 0 0-5.5 5.5" />
    </svg>
  ),
  engine: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M21 16l-5-5-8 8" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" />
      <path d="M12 17h.01" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  ),
  eject: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5l7 8H5z" />
      <path d="M5 18h14" />
    </svg>
  ),
  panelLeft: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="M4.5 8h3M4.5 11h3" />
    </svg>
  ),
  panelRight: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
      <path d="M16.5 8h3M16.5 11h3" />
    </svg>
  ),
  panelBottom: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 14h18" />
      <path d="M6 17h6" />
    </svg>
  ),
  print: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </svg>
  ),
}

/** Each icon's own colour (all icons are shown in colour). */
const ICON_COLORS: Record<keyof typeof MonoIcons, string> = {
  openIso: '#14b8a6',
  save: '#3b82f6',
  extract: '#f59e0b',
  create: '#22c55e',
  bootable: '#e0457b',
  mount: '#8b5cf6',
  run: '#16a34a',
  stop: '#ef4444',
  folder: '#eab308',
  refresh: '#06b6d4',
  clear: '#f97316',
  unmount: '#a855f7',
  sun: '#f59e0b',
  moon: '#818cf8',
  lang: '#0ea5e9',
  info: '#3b82f6',
  warning: '#f59e0b',
  copy: '#64748b',
  close: '#ef4444',
  check: '#22c55e',
  search: '#0ea5e9',
  trash: '#ef4444',
  rename: '#8b5cf6',
  mkdir: '#eab308',
  exportFile: '#14b8a6',
  addFile: '#22c55e',
  home: '#f97316',
  grid: '#6366f1',
  bulb: '#facc15',
  recent: '#0ea5e9',
  disc: '#14b8a6',
  engine: '#64748b',
  image: '#ec4899',
  settings: '#64748b',
  help: '#3b82f6',
  download: '#22c55e',
  print: '#475569',
  eject: '#f43f5e',
  panelLeft: '#f59e0b',
  panelRight: '#8b5cf6',
  panelBottom: '#14b8a6',
}

function colorize(el: ReactNode, color: string): ReactNode {
  if (!isValidElement(el)) return el
  const props = (el as ReactElement<Record<string, unknown>>).props
  const next: Record<string, unknown> = { 'data-icon-color': color, className: 'icon-color' }
  if (props.stroke === 'currentColor') next.stroke = color
  if (props.fill === 'currentColor') next.fill = color
  return cloneElement(el as ReactElement<Record<string, unknown>>, next)
}

export const Icons = Object.fromEntries(
  Object.entries(MonoIcons).map(([k, el]) => [k, colorize(el, ICON_COLORS[k as keyof typeof MonoIcons])]),
) as Record<keyof typeof MonoIcons, ReactNode>
