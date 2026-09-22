import React, { useEffect, useRef } from 'react';
import { IconClose } from './Icons.jsx';

// Shared modal shell: dimmed backdrop, Escape to close, focus trapped inside,
// and an optional footer. Every dialog in the app is built on it so they all
// behave identically.
export default function Modal({
  open,
  title,
  icon: Icon,
  onClose,
  children,
  footer,
  width = 560,
  className = '',
  closeOnBackdrop = true,
  closeLabel = 'Close',
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    // Move focus into the dialog so Escape and Tab work immediately.
    const t = setTimeout(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]')
        || panelRef.current?.querySelector('button, input, select, textarea');
      target?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className={`modal${className ? ` ${className}` : ''}`}
        style={{ '--modal-width': typeof width === 'number' ? `${width}px` : width }}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="modal-head">
          {Icon ? <span className="modal-head-icon"><Icon size={17} /></span> : null}
          <h2 className="modal-title">{title}</h2>
          <button className="icon-btn modal-x" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
            <IconClose size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
