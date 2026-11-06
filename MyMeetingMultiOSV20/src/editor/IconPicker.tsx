// The editor's icon picker: a grid of colourful icons by group, with a size and a name filter.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/Icons'
import { DOC_ICON_GROUPS, DOC_ICON_SIZES, DOC_ICONS } from './docIcons'

const SIZE_KEY = 'mymeeting-icon-size'

export function IconPicker({ onPick, onClose }: { onPick: (name: string, size: number) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [group, setGroup] = useState('all')
  const [filter, setFilter] = useState('')
  const [size, setSize] = useState(() => {
    const stored = Number(localStorage.getItem(SIZE_KEY))
    return (DOC_ICON_SIZES as readonly number[]).includes(stored) ? stored : 20
  })
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node) && !(event.target as Element).closest?.('[data-tool="icon"]')) onClose()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const words = filter.trim().toLowerCase()
  const shown = (group === 'all' ? DOC_ICONS : DOC_ICON_GROUPS.find((item) => item.id === group)?.icons ?? []).filter((name) => !words || name.toLowerCase().includes(words))
  const chooseSize = (value: number) => {
    setSize(value)
    localStorage.setItem(SIZE_KEY, String(value))
  }

  return (
    <div className="format-icons" ref={box} role="dialog" aria-label={t('editor.icon')} data-icon-picker="">
      <div className="format-icons-head">
        <input className="text-input" autoFocus placeholder={t('editor.iconSearch')} aria-label={t('editor.iconSearch')} value={filter} onChange={(event) => setFilter(event.target.value)} />
        <span className="format-icons-sizes" role="radiogroup" aria-label={t('editor.iconSize')}>
          {DOC_ICON_SIZES.map((value) => (
            <button type="button" key={value} role="radio" aria-checked={size === value} className={size === value ? 'on' : undefined} data-icon-size={value} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSize(value)}>
              {value}
            </button>
          ))}
        </span>
      </div>
      <div className="format-icons-groups" role="tablist">
        {['all', ...DOC_ICON_GROUPS.map((item) => item.id)].map((id) => (
          <button type="button" key={id} role="tab" aria-selected={group === id} className={group === id ? 'on' : undefined} data-icon-group={id} onMouseDown={(event) => event.preventDefault()} onClick={() => setGroup(id)}>
            {t(`editor.iconGroup.${id}`)}
          </button>
        ))}
        <span className="format-icons-count">{t('editor.iconCount', { count: shown.length })}</span>
      </div>
      <div className="format-icons-grid">
        {shown.map((name) => (
          <button type="button" key={name} data-doc-icon={name} title={name} aria-label={name} onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(name, size)}>
            <Icon name={name} size={22} />
          </button>
        ))}
      </div>
    </div>
  )
}
