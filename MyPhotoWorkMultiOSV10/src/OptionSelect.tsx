import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { optionListPlace } from './lib/optionList'

export type SelectChoice = { value: string; label: string }

/**
 * A drop-down drawn by the app. A native list takes its highlight from the system and its
 * background from the control, which in several themes left the chosen row and the
 * background the same colour; this one uses the theme's colours everywhere.
 */
export function OptionSelect({ value, choices, onChange, label }: { value: string; choices: SelectChoice[]; onChange: (next: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [place, setPlace] = useState({ left: 0, top: 0, width: 0, maxHeight: 0 })
  const trigger = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const chosen = Math.max(0, choices.findIndex((choice) => choice.value === value))

  useLayoutEffect(() => {
    if (!open || !trigger.current || !list.current) return
    setPlace(optionListPlace(trigger.current.getBoundingClientRect(), list.current.scrollHeight, { width: window.innerWidth, height: window.innerHeight }))
  }, [open, choices.length])

  useEffect(() => {
    if (!open) return undefined
    const away = (event: PointerEvent) => {
      const target = event.target as Node
      if (!list.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])

  const pick = (index: number) => {
    setOpen(false)
    if (choices[index] && choices[index].value !== value) onChange(choices[index].value)
    trigger.current?.focus()
  }
  const onKey = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setCursor(chosen)
        setOpen(true)
      }
      return
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((at) => Math.min(choices.length - 1, at + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((at) => Math.max(0, at - 1)) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(cursor) }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="option-select"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={(event) => { event.preventDefault(); setCursor(chosen); setOpen((now) => !now) }}
        onKeyDown={onKey}
      >
        <span>{choices[chosen]?.label ?? ''}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div ref={list} className="option-list" role="listbox" aria-label={label} style={place}>
          {choices.map((choice, index) => (
            <button
              key={choice.value}
              type="button"
              role="option"
              aria-selected={index === chosen}
              className={`${index === chosen ? 'chosen' : ''}${index === cursor ? ' cursor' : ''}`}
              onPointerEnter={() => setCursor(index)}
              onClick={() => pick(index)}
            >
              <Check size={13} aria-hidden="true" className="option-tick" />
              <span>{choice.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
