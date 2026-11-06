// What the section cards share with the outline and the "add section" window: their names, and the
// grid of icons a title can wear.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CUSTOM_KINDS, isBuiltin, missingBuiltins, newSection, SECTION_ICON, type Meeting, type Section, type SectionKind } from '../meeting'
import { Dialog } from './dialogs'
import { ICON_NAMES, Icon } from './Icons'

/** The name on a section's card and in the outline. */
export const sectionLabel = (s: Section, t: TFunction) => s.title.trim() || t(isBuiltin(s.kind) ? `section.${s.kind}` : `sectionKind.${s.kind}`)

const CHOICES = ICON_NAMES.filter((name) => !name.startsWith('bg_'))

/** Every program icon, with a filter by name. */
export function IconGrid({ value, onPick }: { value: string; onPick: (name: string) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? CHOICES.filter((name) => name.toLowerCase().includes(q)) : CHOICES
  }, [query])
  return (
    <div className="icon-grid-box">
      <input className="text-input icon-grid-search" value={query} placeholder={t('editor.iconSearch')} aria-label={t('editor.iconSearch')} onChange={(e) => setQuery(e.target.value)} />
      <div className="icon-grid" role="listbox" aria-label={t('sectionMenu.icon')}>
        {shown.map((name) => (
          <button type="button" role="option" key={name} aria-selected={value === name} className={value === name ? 'on' : undefined} title={name} data-icon-choice={name} onClick={() => onPick(name)}>
            <Icon name={name} size={18} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** A small window under a title's icon: pick one, or go back to the section's own. */
export function IconPopover({ value, fallback, onPick, onClose }: { value: string; fallback: string; onPick: (name: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="section-icon-pop" data-section-icon-pop="" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="section-icon-pop-head">
        <strong>{t('sectionMenu.icon')}</strong>
        <span className="grow" />
        <button type="button" data-command="section-icon-default" onClick={() => onPick('')}><Icon name={fallback} size={14} /> {t('sectionMenu.iconDefault')}</button>
        <button type="button" className="mini dialog-close" aria-label={t('common.close')} onClick={onClose}><Icon name="close" size={14} /></button>
      </div>
      <IconGrid value={value || fallback} onPick={onPick} />
    </div>
  )
}

type AddProps = { meeting: Meeting; hasAfter: boolean; onAdd: (section: Section, atEnd: boolean) => void; onClose: () => void }

/** Which kind of section, its name and icon, and where it goes. */
export function AddSectionDialog({ meeting, hasAfter, onAdd, onClose }: AddProps) {
  const { t } = useTranslation()
  const missing = missingBuiltins(meeting)
  const [kind, setKind] = useState<SectionKind>('text')
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('')
  const [atEnd, setAtEnd] = useState(!hasAfter)
  const defaultName = t(isBuiltin(kind) ? `section.${kind}` : `sectionKind.${kind}`)
  // A built-in keeps no title of its own so it follows the language; an added one is named for good.
  const make = (item: SectionKind, name: string) => {
    const fallback = t(isBuiltin(item) ? `section.${item}` : `sectionKind.${item}`)
    return newSection(item, isBuiltin(item) ? (name === fallback ? '' : name) : name || fallback, icon)
  }
  const add = () => onAdd(make(kind, title.trim()), atEnd)
  const kindButton = (item: SectionKind, note: string) => (
    <button type="button" role="radio" key={item} aria-checked={kind === item} className={kind === item ? 'export-choice on' : 'export-choice'} data-section-kind={item} onClick={() => setKind(item)} onDoubleClick={() => onAdd(make(item, ''), atEnd)}>
      <Icon name={SECTION_ICON[item]} size={24} />
      <b>{t(isBuiltin(item) ? `section.${item}` : `sectionKind.${item}`)}</b>
      <span>{note}</span>
    </button>
  )
  return (
    <Dialog
      id="add-section"
      title={t('sectionMenu.addTitle')}
      icon="add"
      width={720}
      onClose={onClose}
      footer={(
        <>
          <button type="button" data-command="add-section-cancel" onClick={onClose}><Icon name="close" size={14} /> {t('common.cancel')}</button>
          <button type="button" className="primary" data-command="add-section-run" onClick={add}><Icon name="add" size={14} /> {t('sectionMenu.add')}</button>
        </>
      )}
    >
      <div className="add-section">
        <h4>{t('sectionMenu.kinds')}</h4>
        <div className="export-choices section-kinds" role="radiogroup" aria-label={t('sectionMenu.kinds')}>
          {CUSTOM_KINDS.map((item) => kindButton(item, t(`sectionKindNote.${item}`)))}
        </div>
        {missing.length > 0 && (
          <>
            <h4>{t('sectionMenu.builtins')}</h4>
            <div className="export-choices section-kinds" role="radiogroup" aria-label={t('sectionMenu.builtins')}>
              {missing.map((item) => kindButton(item, t('sectionMenu.builtinNote')))}
            </div>
          </>
        )}
        <div className="form-grid add-section-form">
          <span>{t('sectionMenu.name')}</span>
          <input className="text-input" data-field="sectionName" value={title} placeholder={defaultName} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <span>{t('sectionMenu.where')}</span>
          <span className="radio-line">
            <label><input type="radio" name="section-where" checked={!atEnd} disabled={!hasAfter} onChange={() => setAtEnd(false)} /> {t('sectionMenu.afterCurrent')}</label>
            <label><input type="radio" name="section-where" checked={atEnd} onChange={() => setAtEnd(true)} /> {t('sectionMenu.atEnd')}</label>
          </span>
          <span>{t('sectionMenu.icon')}</span>
          <span className="add-section-icon"><Icon name={icon || SECTION_ICON[kind]} size={22} /> {icon ? <button type="button" onClick={() => setIcon('')}>{t('sectionMenu.iconDefault')}</button> : <small>{t('sectionMenu.iconHint')}</small>}</span>
        </div>
        <IconGrid value={icon || SECTION_ICON[kind]} onPick={setIcon} />
      </div>
    </Dialog>
  )
}
