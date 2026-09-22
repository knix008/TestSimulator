import { Fragment, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { menuEntries, submenuHasActive, type AppCommand, type MenuEntry } from './commands'

/**
 * One dropdown: a single column of rows, and a submenu that slides open
 * beside any row that stands for a section (Open recent, Theme, Input
 * format…). A submenu may fold once more — the sixty output formats sit
 * under their groups (Markdown, Wiki, Office…) so no column runs off the
 * screen. The same tree serves the popup window under Electron and the
 * in-page dropdown of the browser build, so it knows nothing about either.
 *
 * Every row shows an icon and a label, and a column never wraps: a long
 * menu grows downward and the window that holds it grows with it.
 */
type Shared = {
  label: (command: AppCommand) => string
  sectionLabel: (section: string) => string
  isActive: (id: string) => boolean
  isDisabled?: (id: string) => boolean
  onChoose: (id: string) => void
  onForget?: (id: string) => void
  forgetLabel?: string
}

export function MenuTree(props: Shared & { rows: AppCommand[] }) {
  return (
    <div className="menu-tree">
      <Column rows={props.rows} depth={0} top={0} shared={props} />
    </div>
  )
}

/** Rough height of a column, so a submenu can be raised to stay on screen. */
function estimateHeight(entries: MenuEntry[], rowHeight: number): number {
  const separators = entries.filter((entry, index) => index > 0 && entry.separatorBefore).length
  return entries.length * (rowHeight + 2) + separators * 9 + 12
}

function Column({ rows, depth, top, shared }: { rows: AppCommand[]; depth: number; top: number; shared: Shared }) {
  const { label, sectionLabel, isActive, isDisabled, onChoose, onForget, forgetLabel } = shared
  const entries = menuEntries(rows)
  const [open, setOpen] = useState<{ section: string; top: number } | null>(null)
  const openEntry = open ? entries.find((entry) => entry.kind === 'submenu' && entry.section === open.section) : undefined
  const submenu = openEntry && openEntry.kind === 'submenu' ? openEntry : null

  // Where the child column starts: level with its parent row, unless that would push it past the bottom of this column.
  const placeAt = (row: HTMLElement, commands: AppCommand[]) => {
    const tree = row.closest('.menu-tree') as HTMLElement | null
    const treeHeight = tree?.offsetHeight ?? Infinity
    const estimate = estimateHeight(menuEntries(commands), row.offsetHeight)
    return Math.max(0, Math.min(top + row.offsetTop, treeHeight - estimate))
  }

  const rowOf = (command: AppCommand) => {
    const Icon = command.icon
    const forgettable = Boolean(onForget && command.forgettable)
    const button = (
      <button
        className={isActive(command.id) ? 'active' : ''}
        disabled={isDisabled?.(command.id) ?? false}
        onPointerEnter={() => setOpen(null)}
        onClick={() => onChoose(command.id)}
        title={forgettable ? command.id.replace(/^recent:/, '') : undefined}
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
          onClick={(event) => { event.stopPropagation(); onForget?.(command.id) }}
        >
          <X size={13} />
        </button>
      </span>
    )
  }

  return (
    <>
      <div className={depth === 0 ? 'menu-column' : 'menu-column menu-sub'} role={depth === 0 ? undefined : 'menu'} style={depth === 0 ? undefined : { marginTop: top }} data-depth={depth}>
        {entries.map((entry) => {
          if (entry.kind === 'command') {
            return (
              <Fragment key={entry.command.id}>
                {entry.separatorBefore && <div className="menu-separator" />}
                {rowOf(entry.command)}
              </Fragment>
            )
          }
          const Icon = entry.commands[0].icon
          const isOpen = open?.section === entry.section
          const holdsActive = submenuHasActive(entry.commands, isActive)
          return (
            <Fragment key={entry.section}>
              {entry.separatorBefore && <div className="menu-separator" />}
              <button
                className={`menu-parent${isOpen ? ' open' : ''}${holdsActive ? ' holds-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onPointerEnter={(event) => setOpen({ section: entry.section, top: placeAt(event.currentTarget, entry.commands) })}
                onClick={(event) => {
                  const next = placeAt(event.currentTarget, entry.commands)
                  setOpen((current) => (current?.section === entry.section ? null : { section: entry.section, top: next }))
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
      {submenu && open && <Column key={submenu.section} rows={submenu.commands} depth={depth + 1} top={open.top} shared={shared} />}
    </>
  )
}
