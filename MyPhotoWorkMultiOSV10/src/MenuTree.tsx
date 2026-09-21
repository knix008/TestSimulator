import { Fragment, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { menuColumns, menuEntries, type AppCommand } from './commands'

/**
 * One dropdown laid out the way Photoshop lays its menus out: a short top
 * level, and a submenu that slides open beside any row that stands for a
 * section. The same tree serves the popup window under Electron and the
 * in-page dropdown of the browser build, so it knows nothing about either.
 *
 * A submenu opens when its row is hovered (or clicked, for a touch screen) and
 * closes when the pointer reaches any other top-level row, which is how a
 * native menu behaves; moving into the submenu itself keeps it open.
 */
export function MenuTree({ rows, label, sectionLabel, isActive, isDisabled, onChoose, onForget, forgetLabel }: {
  rows: AppCommand[]
  label: (command: AppCommand) => string
  sectionLabel: (section: string) => string
  isActive: (id: string) => boolean
  /** A row that cannot do anything now is shown, but not offered. */
  isDisabled?: (id: string) => boolean
  onChoose: (id: string) => void
  /**
   * Rows that can be taken off the menu — the recent files — get a small ✕ of
   * their own. Without it the only way to drop one file from the list is to
   * drop all of them.
   */
  onForget?: (id: string) => void
  forgetLabel?: string
}) {
  const entries = menuEntries(rows)
  const layout = menuColumns(entries)
  const [open, setOpen] = useState<{ section: string; top: number } | null>(null)
  const openEntry = open ? entries.find((entry) => entry.kind === 'submenu' && entry.section === open.section) : undefined
  const submenu = openEntry && openEntry.kind === 'submenu' ? openEntry : null

  // Where the submenu sits: level with its row, unless that would push it
  // below the top level's bottom edge, in which case it is raised to fit.
  const placeAt = (row: HTMLElement, commands: AppCommand[]) => {
    const column = row.parentElement
    const columnHeight = column?.offsetHeight ?? Infinity
    const estimate = commands.length * (row.offsetHeight + 2) + commands.filter((command, index) => index > 0 && command.separatorBefore).length * 9 + 12
    return Math.max(0, Math.min(row.offsetTop, columnHeight - estimate))
  }

  const rowOf = (command: AppCommand, inSubmenu = false) => {
    const Icon = command.icon
    const forgettable = Boolean(onForget && command.forgettable)
    const button = (
      <button
        className={isActive(command.id) ? 'active' : ''}
        disabled={isDisabled?.(command.id) ?? false}
        onPointerEnter={inSubmenu ? undefined : () => setOpen(null)}
        onClick={() => onChoose(command.id)}
      >
        <Icon size={16} />
        <span>{label(command)}</span>
        {command.accel && <kbd>{command.accel}</kbd>}
      </button>
    )
    if (!forgettable) return button
    return (
      <span className="menu-row-forgettable">
        {button}
        <button
          className="menu-forget"
          data-tooltip={forgetLabel}
          aria-label={forgetLabel}
          onPointerEnter={inSubmenu ? undefined : () => setOpen(null)}
          onClick={(event) => { event.stopPropagation(); onForget?.(command.id) }}
        >
          <X size={13} />
        </button>
      </span>
    )
  }

  return (
    <div className="menu-tree">
      <div
        className={layout.columns > 1 ? 'menu-column menu-columns' : 'menu-column'}
        style={layout.columns > 1 ? ({ '--menu-rows': layout.rowCount } as React.CSSProperties) : undefined}
      >
        {entries.map((entry) => {
          if (entry.kind === 'command') {
            return (
              // A fragment, not a wrapper: in column layout the separators and
              // the buttons are the grid's own cells, so the rows line up.
              <Fragment key={entry.command.id}>
                {entry.separatorBefore && <div className="menu-separator" />}
                {rowOf(entry.command)}
              </Fragment>
            )
          }
          const Icon = entry.commands[0].icon
          const isOpen = open?.section === entry.section
          return (
            <Fragment key={entry.section}>
              {entry.separatorBefore && <div className="menu-separator" />}
              <button
                className={isOpen ? 'menu-parent open' : 'menu-parent'}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onPointerEnter={(event) => setOpen({ section: entry.section, top: placeAt(event.currentTarget, entry.commands) })}
                onClick={(event) => {
                  const top = placeAt(event.currentTarget, entry.commands)
                  setOpen((current) => (current?.section === entry.section ? null : { section: entry.section, top }))
                }}
              >
                <Icon size={16} />
                <span>{sectionLabel(entry.section)}</span>
                <ChevronRight size={14} className="menu-chevron" />
              </button>
            </Fragment>
          )
        })}
      </div>
      {submenu && open && (
        <div className="menu-column menu-sub" role="menu" style={{ marginTop: open.top }}>
          {submenu.commands.map((command, index) => (
            <Fragment key={command.id}>
              {index > 0 && command.separatorBefore && <div className="menu-separator" />}
              {rowOf(command, true)}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
