import type { ReactNode } from 'react'

export type ToolbarAction = {
  id: string
  label: string
  tooltip: string
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  primary?: boolean
  onClick: () => void
}

type ToolbarProps = {
  groups: ToolbarAction[][]
}

export function Toolbar({ groups, ariaLabel = 'ISO Maker toolbar' }: ToolbarProps & { ariaLabel?: string }) {
  const last = groups.length - 1
  return (
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
          <span className="toolbar-sep" aria-hidden="true" />
          {groups[last]!.map((action) => (
            <ToolbarButton key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
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
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={action.disabled}
      onClick={action.onClick}
      title={action.tooltip}
      aria-label={action.tooltip}
      data-tooltip={action.tooltip}
    >
      <span className="toolbar-icon" aria-hidden="true">
        {action.icon}
      </span>
      <span className="toolbar-label">{action.label}</span>
    </button>
  )
}

/** Inline SVG icons (no external icon font). */
export const Icons = {
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
}
