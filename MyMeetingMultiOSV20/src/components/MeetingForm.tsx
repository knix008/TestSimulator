// The minutes as one page of section cards, in the order the user arranged them. Lists grow with
// their "+" button (or Enter in the last field); every row can move up or down and be deleted. A
// card moves by dragging the grip on its title (or ↑/↓ on the grip); its icon and name can change.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { RichEditor } from '../editor/RichEditor'
import {
  ATTENDANCE, isBuiltin, moveSection, moveSectionTo, newAction, newAttendee, newEntry, removeSection, SECTION_ICON, sectionIcon, TIME_PATTERN, todayText, updateSection,
  type ActionItem, type Attendee, type Entry, type Meeting, type Section,
} from '../meeting'
import { Icon } from './Icons'
import { IconPopover, sectionLabel } from './SectionParts'

export type MeetingUpdate = Meeting | ((current: Meeting) => Meeting)

type Props = {
  meeting: Meeting
  onChange: (update: MeetingUpdate) => void
  docKey: number
  onUndo: () => void
  onRedo: () => void
  onError: (message: string) => void
  /** Opens the "add section" window; `after` is the card it goes below. */
  onAddSection: (after: string | null) => void
}

const DRAG_TYPE = 'application/x-mymeeting-section'

type Row = { id: string }
type Rows<T extends Row> = {
  items: T[]
  add: (after?: string) => void
  update: (id: string, patch: Partial<T>) => void
  move: (id: string) => (by: -1 | 1) => void
  remove: (id: string, index: number) => () => void
  /** Enter adds the next row, Backspace in an empty row removes it. */
  keys: (id: string, index: number, empty: boolean) => (event: React.KeyboardEvent<HTMLInputElement>) => void
}

/** Up, down and delete at the end of a row. */
function RowTools({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (by: -1 | 1) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  return (
    <span className="row-tools">
      <button type="button" className="icon-button" data-tip={t('row.up')} aria-label={t('row.up')} disabled={index === 0} onClick={() => onMove(-1)}><Icon name="up" /></button>
      <button type="button" className="icon-button" data-tip={t('row.down')} aria-label={t('row.down')} disabled={index === length - 1} onClick={() => onMove(1)}><Icon name="down" /></button>
      <button type="button" className="icon-button is-danger" data-tip={t('row.delete')} aria-label={t('row.delete')} onClick={onRemove}><Icon name="delete" /></button>
    </span>
  )
}

function AddButton({ list, label, onClick }: { list: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className="add-row" data-add={list} onClick={onClick}>
      <span className="add-row-plus" aria-hidden="true">+</span>
      {label}
    </button>
  )
}

/** A text field with a calendar button: dates stay free text, the picker only fills it. */
function DateField({ value, onChange, field, placeholder }: { value: string; onChange: (value: string) => void; field: string; placeholder?: string }) {
  const { t } = useTranslation()
  const picker = useRef<HTMLInputElement>(null)
  return (
    <span className="date-field">
      <input data-field={field} value={value} placeholder={placeholder ?? 'YYYY-MM-DD'} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="icon-button" data-tip={t('info.pickDate')} aria-label={t('info.pickDate')} onClick={() => {
        const input = picker.current
        if (!input) return
        input.value = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayText()
        try {
          input.showPicker()
        } catch {
          onChange(todayText())
        }
      }}><Icon name="calendar" /></button>
      <input ref={picker} type="date" className="date-picker" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.value && onChange(e.target.value)} />
    </span>
  )
}

/** A name typed freely, or picked from the meeting's attendees with the button beside it. */
function PersonField({ value, onChange, field, people }: { value: string; onChange: (value: string) => void; field: string; people: Attendee[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])
  const options = () => [...(box.current?.querySelectorAll<HTMLButtonElement>('.person-pop button') ?? [])]
  const listKeys = (event: React.KeyboardEvent) => {
    const list = options()
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      list[(index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      box.current?.querySelector('input')?.focus()
    }
  }
  const pick = (name: string) => {
    onChange(name)
    setOpen(false)
    box.current?.querySelector('input')?.focus()
  }
  return (
    <span className="date-field person-field" ref={box}>
      <input
        data-field={field}
        value={value}
        placeholder={people.length ? t('info.pickOrType') : t('info.typeName')}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && people.length) {
            e.preventDefault()
            setOpen(true)
            requestAnimationFrame(() => (options().find((b) => b.getAttribute('aria-selected') === 'true') ?? options()[0])?.focus())
          } else if (e.key === 'Escape' && open) setOpen(false)
        }}
      />
      <button type="button" className="icon-button" data-command={`pick-${field}`} data-tip={people.length ? t('info.pickPerson') : t('info.noAttendees')} aria-label={t('info.pickPerson')} aria-haspopup="listbox" aria-expanded={open} disabled={!people.length} onClick={() => setOpen(!open)}>
        <Icon name="users" />
      </button>
      {open && (
        <div className="person-pop" role="listbox" aria-label={t('info.pickPerson')} onKeyDown={listKeys}>
          {people.map((person) => (
            <button type="button" role="option" key={person.id} aria-selected={person.name.trim() === value.trim()} className={person.attendance === 'absent' ? 'is-absent' : undefined} onClick={() => pick(person.name.trim())}>
              <Icon name="person" size={14} />
              <span className="person-pop-name">{person.name.trim()}</span>
              {person.role.trim() && <small>{person.role.trim()}</small>}
              {person.attendance !== 'present' && <em>{t(`attendance.${person.attendance}`)}</em>}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

function PeopleRows({ rows, empty }: { rows: Rows<Attendee>; empty: string }) {
  const { t } = useTranslation()
  if (!rows.items.length) return <p className="section-empty">{empty}</p>
  return (
    <div className="rows rows-attendees">
      <div className="rows-head" aria-hidden="true">
        <span>#</span><span>{t('attendee.name')}</span><span>{t('attendee.role')}</span><span>{t('attendee.attendance')}</span><span />
      </div>
      {rows.items.map((person, index) => (
        <div className="row" key={person.id} data-row={person.id}>
          <span className="row-no">{index + 1}</span>
          <input value={person.name} placeholder={t('attendee.name')} aria-label={t('attendee.name')} onChange={(e) => rows.update(person.id, { name: e.target.value })} onKeyDown={rows.keys(person.id, index, !person.name && !person.role)} />
          <input value={person.role} placeholder={t('attendee.role')} aria-label={t('attendee.role')} onChange={(e) => rows.update(person.id, { role: e.target.value })} onKeyDown={rows.keys(person.id, index, false)} />
          <span className="segmented" role="radiogroup" aria-label={t('attendee.attendance')}>
            {ATTENDANCE.map((state) => (
              <button key={state} type="button" role="radio" aria-checked={person.attendance === state} className={`segment is-${state}${person.attendance === state ? ' is-on' : ''}`} onClick={() => rows.update(person.id, { attendance: state })}>
                {t(`attendance.${state}`)}
              </button>
            ))}
          </span>
          <RowTools index={index} length={rows.items.length} onMove={rows.move(person.id)} onRemove={rows.remove(person.id, index)} />
        </div>
      ))}
    </div>
  )
}

function EntryRows({ rows, marker, placeholder, label, empty }: { rows: Rows<Entry>; marker: 'number' | 'check' | 'bullet'; placeholder: string; label: string; empty: string }) {
  if (!rows.items.length) return <p className="section-empty">{empty}</p>
  return (
    <div className="rows rows-entries">
      {rows.items.map((item, index) => (
        <div className="row" key={item.id} data-row={item.id}>
          <span className="row-no">{marker === 'number' ? `${index + 1}.` : marker === 'check' ? <Icon name="check" /> : '•'}</span>
          <input value={item.text} placeholder={placeholder} aria-label={label} onChange={(e) => rows.update(item.id, { text: e.target.value })} onKeyDown={rows.keys(item.id, index, !item.text)} />
          <RowTools index={index} length={rows.items.length} onMove={rows.move(item.id)} onRemove={rows.remove(item.id, index)} />
        </div>
      ))}
    </div>
  )
}

function TaskRows({ rows, empty }: { rows: Rows<ActionItem>; empty: string }) {
  const { t } = useTranslation()
  if (!rows.items.length) return <p className="section-empty">{empty}</p>
  return (
    <div className="rows rows-actions">
      <div className="rows-head" aria-hidden="true">
        <span /><span>{t('action.task')}</span><span>{t('action.owner')}</span><span>{t('action.due')}</span><span />
      </div>
      {rows.items.map((item, index) => (
        <div className={`row${item.done ? ' is-done' : ''}`} key={item.id} data-row={item.id}>
          <input type="checkbox" className="row-check" checked={item.done} data-tip={t('action.done')} aria-label={t('action.done')} onChange={(e) => rows.update(item.id, { done: e.target.checked })} />
          <input value={item.task} placeholder={t('action.task')} aria-label={t('action.task')} onChange={(e) => rows.update(item.id, { task: e.target.value })} onKeyDown={rows.keys(item.id, index, !item.task && !item.owner)} />
          <input value={item.owner} list="mtg-people" placeholder={t('action.owner')} aria-label={t('action.owner')} onChange={(e) => rows.update(item.id, { owner: e.target.value })} onKeyDown={rows.keys(item.id, index, false)} />
          <DateField field={`due-${item.id}`} value={item.due} placeholder={t('action.duePlaceholder')} onChange={(due) => rows.update(item.id, { due })} />
          <RowTools index={index} length={rows.items.length} onMove={rows.move(item.id)} onRemove={rows.remove(item.id, index)} />
        </div>
      ))}
    </div>
  )
}

type MenuItem = { id: string; icon: string; label: string; run: () => void; disabled?: boolean; danger?: boolean } | 'sep'

/** A menu at a point (right-click) or under a button; it stays inside the window. */
function PopMenu({ x, y, items, onClose, label }: { x: number; y: number; items: MenuItem[]; onClose: () => void; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ x, y })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAt({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) })
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [x, y])
  useEffect(() => {
    const away = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  const keys = (event: React.KeyboardEvent) => {
    const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
    } else return
    event.stopPropagation()
  }
  return (
    <div className="section-menu" role="menu" aria-label={label} ref={box} style={{ left: at.x, top: at.y }} onKeyDown={keys} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, index) => item === 'sep'
        ? <div key={`sep${index}`} className="section-menu-sep" role="separator" />
        : (
          <button type="button" role="menuitem" key={item.id} data-command={`section-${item.id}`} className={item.danger ? 'is-danger' : undefined} disabled={item.disabled} onClick={() => {
            onClose()
            item.run()
          }}>
            <Icon name={item.icon} size={15} />
            <span>{item.label}</span>
          </button>
        ))}
    </div>
  )
}

export function MeetingForm({ meeting, onChange, docKey, onUndo, onRedo, onError, onAddSection }: Props) {
  const { t } = useTranslation()
  const [focusId, setFocusId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [iconFor, setIconFor] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; section: string | null } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusId) return
    const field = root.current?.querySelector<HTMLInputElement>(`[data-row="${focusId}"] input:not([type=checkbox])`)
    field?.focus()
    field?.scrollIntoView({ block: 'nearest' })
    setFocusId(null)
  }, [focusId])

  const set = (patch: Partial<Meeting>) => onChange((current) => ({ ...current, ...patch }))

  const rows = <T extends Row>(items: T[], write: (edit: (list: T[]) => T[]) => void, make: () => T): Rows<T> => {
    const api: Rows<T> = {
      items,
      add: (after) => {
        const item = make()
        write((list) => {
          const at = after ? list.findIndex((entry) => entry.id === after) + 1 : 0
          const index = at > 0 ? at : list.length
          return [...list.slice(0, index), item, ...list.slice(index)]
        })
        setFocusId(item.id)
      },
      update: (id, patch) => write((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item))),
      move: (id) => (by) => write((list) => {
        const from = list.findIndex((item) => item.id === id)
        const to = from + by
        if (from < 0 || to < 0 || to >= list.length) return list
        const next = [...list]
        ;[next[from], next[to]] = [next[to], next[from]]
        return next
      }),
      remove: (id, index) => () => {
        const neighbour = items[index + 1] ?? items[index - 1]
        write((list) => list.filter((item) => item.id !== id))
        if (neighbour) setFocusId(neighbour.id)
      },
      keys: (id, index, empty) => (event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          api.add(id)
        } else if (event.key === 'Backspace' && empty && event.currentTarget.value === '') {
          event.preventDefault()
          api.remove(id, index)()
        }
      },
    }
    return api
  }
  const own = <K extends 'attendees' | 'agenda' | 'decisions' | 'actionItems'>(key: K, make: () => Meeting[K][number]) =>
    rows(meeting[key] as Meeting[K][number][], (edit) => onChange((current) => ({ ...current, [key]: edit(current[key] as Meeting[K][number][]) })), make)
  const inSection = <K extends 'entries' | 'tasks' | 'people'>(s: Section, key: K, make: () => Section[K][number]) =>
    rows(s[key] as Section[K][number][], (edit) => onChange((current) => updateSection(current, s.id, (now) => ({ [key]: edit(now[key] as Section[K][number][]) }))), make)

  // Everyone named on the page, attendees first, each name once.
  const roster = [...meeting.attendees, ...meeting.sections.flatMap((s) => s.people)]
    .filter((person, index, all) => person.name.trim() && all.findIndex((other) => other.name.trim() === person.name.trim()) === index)
  const people = roster.map((person) => person.name.trim())
  const badTime = (text: string) => !!text.trim() && !TIME_PATTERN.test(text.trim())
  const total = meeting.sections.length

  /** The card's contents, its row count for the badge, and its "+" button. */
  const parts = (s: Section): { body: ReactNode; count?: number; add?: ReactNode } => {
    switch (s.kind) {
      case 'info':
        return {
          body: (
            <div className="info-grid">
              <label className="info-label"><Icon name="calendar" />{t('info.date')}</label>
              <DateField field="date" value={meeting.date} onChange={(date) => set({ date })} />
              <label className="info-label"><Icon name="clock" />{t('info.time')}</label>
              <span className="time-range">
                <input data-field="startTime" className={badTime(meeting.startTime) ? 'is-invalid' : ''} value={meeting.startTime} placeholder="10:00" aria-label={t('info.start')} onChange={(e) => set({ startTime: e.target.value })} />
                <span aria-hidden="true">–</span>
                <input data-field="endTime" className={badTime(meeting.endTime) ? 'is-invalid' : ''} value={meeting.endTime} placeholder="11:00" aria-label={t('info.end')} onChange={(e) => set({ endTime: e.target.value })} />
              </span>
              <label className="info-label"><Icon name="place" />{t('info.location')}</label>
              <input data-field="location" value={meeting.location} placeholder={t('info.locationPlaceholder')} onChange={(e) => set({ location: e.target.value })} />
              <label className="info-label"><Icon name="person" />{t('info.organizer')}</label>
              <PersonField field="organizer" people={roster} value={meeting.organizer} onChange={(organizer) => set({ organizer })} />
              <label className="info-label"><Icon name="pen" />{t('info.recorder')}</label>
              <PersonField field="recorder" people={roster} value={meeting.recorder} onChange={(recorder) => set({ recorder })} />
            </div>
          ),
        }
      case 'attendees': {
        const r = own('attendees', () => newAttendee())
        return { body: <PeopleRows rows={r} empty={t('empty.attendees')} />, count: r.items.length, add: <AddButton list="attendees" label={t('add.attendee')} onClick={() => r.add()} /> }
      }
      case 'agenda': {
        const r = own('agenda', () => newEntry())
        return { body: <EntryRows rows={r} marker="number" placeholder={t('add.agendaPlaceholder')} label={t('section.agenda')} empty={t('empty.agenda')} />, count: r.items.length, add: <AddButton list="agenda" label={t('add.agenda')} onClick={() => r.add()} /> }
      }
      case 'discussion':
        return { body: <RichEditor value={meeting.body} docKey={docKey} onChange={(body) => set({ body })} onUndo={onUndo} onRedo={onRedo} placeholder={t('editor.placeholder')} onError={onError} /> }
      case 'decisions': {
        const r = own('decisions', () => newEntry())
        return { body: <EntryRows rows={r} marker="number" placeholder={t('add.decisionPlaceholder')} label={t('section.decisions')} empty={t('empty.decisions')} />, count: r.items.length, add: <AddButton list="decisions" label={t('add.decision')} onClick={() => r.add()} /> }
      }
      case 'actionItems': {
        const r = own('actionItems', () => newAction())
        return { body: <TaskRows rows={r} empty={t('empty.actionItems')} />, count: r.items.length, add: <AddButton list="actionItems" label={t('add.action')} onClick={() => r.add()} /> }
      }
      case 'text':
        return { body: <RichEditor value={s.body} docKey={docKey} onChange={(body) => onChange((current) => updateSection(current, s.id, { body }))} onUndo={onUndo} onRedo={onRedo} placeholder={t('editor.placeholder')} onError={onError} /> }
      case 'list':
      case 'numbered': {
        const r = inSection(s, 'entries', () => newEntry())
        return { body: <EntryRows rows={r} marker={s.kind === 'numbered' ? 'number' : 'bullet'} placeholder={t('add.itemPlaceholder')} label={sectionLabel(s, t)} empty={t('empty.items')} />, count: r.items.length, add: <AddButton list={s.id} label={t('add.item')} onClick={() => r.add()} /> }
      }
      case 'tasks': {
        const r = inSection(s, 'tasks', () => newAction())
        return { body: <TaskRows rows={r} empty={t('empty.actionItems')} />, count: r.items.length, add: <AddButton list={s.id} label={t('add.action')} onClick={() => r.add()} /> }
      }
      case 'people': {
        const r = inSection(s, 'people', () => newAttendee())
        return { body: <PeopleRows rows={r} empty={t('empty.people')} />, count: r.items.length, add: <AddButton list={s.id} label={t('add.person')} onClick={() => r.add()} /> }
      }
    }
  }

  const moveBy = (id: string, by: -1 | 1) => {
    onChange((current) => moveSection(current, id, by))
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-section="${id}"] .section-grip`)?.focus())
  }
  const moveTo = (id: string, to: number) => onChange((current) => moveSectionTo(current, id, to))
  const remove = (id: string) => onChange((current) => removeSection(current, id))
  const rename = (id: string, title: string) => onChange((current) => updateSection(current, id, { title: title.trim().slice(0, 200) }))

  const menuItems = (id: string | null): MenuItem[] => {
    const index = meeting.sections.findIndex((s) => s.id === id)
    const add: MenuItem = { id: 'add', icon: 'add', label: t('sectionMenu.addMore'), run: () => onAddSection(index >= 0 ? id : null) }
    if (index < 0) return [add]
    const s = meeting.sections[index]
    return [
      add,
      'sep',
      { id: 'rename', icon: 'pen', label: t('sectionMenu.rename'), run: () => setRenaming(s.id) },
      { id: 'icon', icon: sectionIcon(s), label: t('sectionMenu.changeIcon'), run: () => setIconFor(s.id) },
      'sep',
      { id: 'up', icon: 'up', label: t('sectionMenu.up'), disabled: index === 0, run: () => moveBy(s.id, -1) },
      { id: 'down', icon: 'down', label: t('sectionMenu.down'), disabled: index === total - 1, run: () => moveBy(s.id, 1) },
      { id: 'top', icon: 'up', label: t('sectionMenu.top'), disabled: index === 0, run: () => moveTo(s.id, 0) },
      { id: 'bottom', icon: 'down', label: t('sectionMenu.bottom'), disabled: index === total - 1, run: () => moveTo(s.id, total) },
      'sep',
      { id: 'delete', icon: 'delete', label: t(isBuiltin(s.kind) ? 'sectionMenu.hide' : 'sectionMenu.delete'), danger: true, run: () => remove(s.id) },
    ]
  }

  // Right-click on a card (outside its text fields, which keep the system menu) or between cards.
  const contextMenu = (event: React.MouseEvent) => {
    const target = event.target as Element
    if (target.closest('input, textarea, [contenteditable], .section-icon-pop')) return
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, section: target.closest<HTMLElement>('[data-section]')?.dataset.section ?? null })
  }

  /** Where a dragged card would land: before the card under the pointer, or after it past its middle. */
  const dropIndex = (event: React.DragEvent) => {
    const cards = [...(root.current?.querySelectorAll<HTMLElement>(':scope > [data-section]') ?? [])]
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect()
      if (event.clientY < r.top + r.height / 2) return i
    }
    return cards.length
  }
  const dragOver = (event: React.DragEvent) => {
    if (!dragging || !event.dataTransfer.types.includes(DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropAt(dropIndex(event))
  }
  const drop = (event: React.DragEvent) => {
    if (!dragging || !event.dataTransfer.types.includes(DRAG_TYPE)) return
    event.preventDefault()
    event.stopPropagation()
    const at = dropIndex(event)
    const from = meeting.sections.findIndex((s) => s.id === dragging)
    moveTo(dragging, at > from ? at - 1 : at)
    setDragging(null)
    setDropAt(null)
  }

  return (
    <div className="sheet" ref={root} onContextMenu={contextMenu} onDragOver={dragOver} onDropCapture={drop} onDragLeave={(e) => !root.current?.contains(e.relatedTarget as Node) && setDropAt(null)}>
      <input className="sheet-title" data-field="title" value={meeting.title} placeholder={t('info.titlePlaceholder')} aria-label={t('info.title')} onChange={(e) => set({ title: e.target.value })} />

      {meeting.sections.map((s, index) => {
        const { body, count, add } = parts(s)
        const label = sectionLabel(s, t)
        const fallback = SECTION_ICON[s.kind]
        const classes = ['sheet-section', dragging === s.id && 'is-dragging', dropAt === index && dragging && 'drop-before', dropAt === total && index === total - 1 && dragging && 'drop-after'].filter(Boolean).join(' ')
        return (
          <section className={classes} key={s.id} id={`sec-${s.id}`} data-section={s.id} data-kind={s.kind}>
            <header className="sheet-section-head">
              <button
                type="button"
                className="section-grip"
                draggable
                data-tip={t('sectionMenu.grip')}
                aria-label={t('sectionMenu.gripLabel', { name: label })}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, s.id)
                  e.dataTransfer.effectAllowed = 'move'
                  const card = e.currentTarget.closest('section')
                  if (card) e.dataTransfer.setDragImage(card, 24, 20)
                  setDragging(s.id)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setDropAt(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    moveBy(s.id, e.key === 'ArrowUp' ? -1 : 1)
                  }
                }}
              >
                <Icon name="grip" size={16} />
              </button>
              <span className="section-icon-wrap">
                <button type="button" className="section-icon" data-tip={t('sectionMenu.changeIcon')} aria-label={t('sectionMenu.changeIcon')} aria-expanded={iconFor === s.id} onClick={() => setIconFor(iconFor === s.id ? null : s.id)}>
                  <Icon name={sectionIcon(s)} />
                </button>
                {iconFor === s.id && (
                  <IconPopover
                    value={s.icon}
                    fallback={fallback}
                    onClose={() => setIconFor(null)}
                    onPick={(icon) => {
                      onChange((current) => updateSection(current, s.id, { icon: icon === fallback ? '' : icon }))
                      setIconFor(null)
                    }}
                  />
                )}
              </span>
              {renaming === s.id
                ? (
                  <input
                    className="section-rename"
                    autoFocus
                    defaultValue={label}
                    aria-label={t('sectionMenu.rename')}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      const value = e.currentTarget.value.trim()
                      if (isBuiltin(s.kind)) rename(s.id, value === t(`section.${s.kind}`) ? '' : value)
                      else if (value) rename(s.id, value)
                      setRenaming(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return
                      if (e.key === 'Enter') e.currentTarget.blur()
                      else if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                )
                : <h2 onDoubleClick={() => setRenaming(s.id)} data-tip={t('sectionMenu.renameTip')}>{label}</h2>}
              {count !== undefined && count > 0 && <span className="count-badge">{count}</span>}
              <span className="grow" />
              <button
                type="button"
                className="icon-button section-more"
                data-tip={t('sectionMenu.more')}
                aria-label={t('sectionMenu.more')}
                aria-haspopup="menu"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenu({ x: r.right - 220, y: r.bottom + 2, section: s.id })
                }}
              >
                <Icon name="more" />
              </button>
            </header>
            <div className="sheet-section-body">{body}</div>
            {add}
          </section>
        )
      })}

      <button type="button" className="add-section-row" data-command="add-section-end" onClick={() => onAddSection(null)}>
        <Icon name="add" size={16} /> {t('sectionMenu.addMore')}
      </button>

      {menu && <PopMenu x={menu.x} y={menu.y} items={menuItems(menu.section)} label={t('sectionMenu.more')} onClose={() => setMenu(null)} />}

      <datalist id="mtg-people">
        {people.map((name) => <option key={name} value={name} />)}
      </datalist>
    </div>
  )
}
