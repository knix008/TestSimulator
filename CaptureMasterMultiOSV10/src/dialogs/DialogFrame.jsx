import React, { useEffect } from 'react';
import { Icon } from '../components/Icons.jsx';

/**
 * Chrome shared by every dialog: a draggable title bar (only when the dialog
 * is its own frameless window), a scrolling body and a footer. Escape closes.
 */
export function DialogFrame({ title, standalone, onClose, children, footer, className = '', noEscape }) {
  useEffect(() => {
    if (noEscape) return undefined;
    const key = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, noEscape]);

  return (
    <div className={`dlg${standalone ? ' standalone' : ''} ${className}`}>
      {standalone || title ? (
        <div className="dlg-titlebar">
          <img src="./icon.svg" alt="" draggable={false} />
          <span className="t">{title}</span>
          <button onClick={onClose} aria-label="close"><Icon name="close" /></button>
        </div>
      ) : null}
      <div className="dlg-body">{children}</div>
      {footer ? <div className="dlg-footer">{footer}</div> : null}
    </div>
  );
}
