import { useEffect, useId, useRef, type ReactNode } from 'react'

export type DialogButtonDef = {
  id: string
  label: string
  icon?: ReactNode
  primary?: boolean
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

type DialogProps = {
  open: boolean
  title: string
  children: ReactNode
  buttons: DialogButtonDef[]
  onClose: () => void
  wide?: boolean
}

export function Dialog({ open, title, children, buttons, onClose, wide }: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={wide ? 'dialog-panel wide' : 'dialog-panel'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
        </header>
        <div className="dialog-body">{children}</div>
        <footer className="dialog-footer">
          {buttons.map((btn) => (
            <DialogButton key={btn.id} {...btn} />
          ))}
        </footer>
      </div>
    </div>
  )
}

export function DialogButton({
  label,
  icon,
  primary,
  danger,
  disabled,
  onClick,
}: DialogButtonDef) {
  return (
    <button
      type="button"
      className={['dialog-btn', primary ? 'primary' : '', danger ? 'danger' : '']
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? (
        <span className="dialog-btn-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="dialog-btn-label">{label}</span>
    </button>
  )
}
