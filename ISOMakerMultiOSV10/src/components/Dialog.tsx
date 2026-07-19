import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

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
  children?: ReactNode
  buttons: DialogButtonDef[]
  onClose: () => void
  wide?: boolean
  /** Optional class on the panel (e.g. dialog-panel--prompt). */
  panelClassName?: string
}

export function Dialog({
  open,
  title,
  children,
  buttons,
  onClose,
  wide,
  panelClassName,
}: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    // Focus panel so Escape works; inputs inside will steal focus when present.
    const t = window.setTimeout(() => {
      const input = panelRef.current?.querySelector<HTMLInputElement>('input:not([disabled])')
      if (input) {
        input.focus()
        input.select()
      } else {
        panelRef.current?.focus()
      }
    }, 0)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={['dialog-panel', wide ? 'wide' : '', panelClassName]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
        </header>
        {children ? <div className="dialog-body">{children}</div> : null}
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

export type PromptDialogProps = {
  open: boolean
  title: string
  message?: string
  label?: string
  defaultValue?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

/** Themed text prompt (replaces window.prompt). */
export function PromptDialog({
  open,
  title,
  message,
  label,
  defaultValue = '',
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputId = useId()

  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      panelClassName="dialog-panel--prompt"
      buttons={[
        {
          id: 'cancel',
          label: cancelLabel,
          onClick: onCancel,
        },
        {
          id: 'ok',
          label: confirmLabel,
          primary: true,
          disabled: !value.trim(),
          onClick: () => submit(),
        },
      ]}
    >
      <form className="dialog-form" onSubmit={submit}>
        {message ? <p className="dialog-message">{message}</p> : null}
        {label ? (
          <label className="dialog-field" htmlFor={inputId}>
            <span>{label}</span>
            <input
              id={inputId}
              className="dialog-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        ) : (
          <input
            id={inputId}
            className="dialog-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </form>
    </Dialog>
  )
}

export type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  detail?: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Themed yes/no confirm (replaces window.confirm). */
export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      panelClassName="dialog-panel--confirm"
      buttons={[
        {
          id: 'cancel',
          label: cancelLabel,
          onClick: onCancel,
        },
        {
          id: 'ok',
          label: confirmLabel,
          primary: !danger,
          danger: Boolean(danger),
          onClick: onConfirm,
        },
      ]}
    >
      <p className="dialog-message">{message}</p>
      {detail ? <p className="dialog-detail hint">{detail}</p> : null}
    </Dialog>
  )
}
