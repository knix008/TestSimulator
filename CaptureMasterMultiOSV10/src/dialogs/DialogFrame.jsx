import React, { useCallback, useEffect, useLayoutEffect } from 'react';
import { Icon } from '../components/Icons.jsx';
import { platform } from '../lib/platform.js';

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
        <div className="dlg-titlebar" data-tauri-drag-region>
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

/** Sizes a fixed-size dialog: its own window when standalone, else the in-page modal. */
export function applyDialogSize(dlg, width, height, standalone) {
  if (standalone) {
    platform.dialogs.setSize(width, height);
    return;
  }
  const modal = dlg.closest('.modal');
  if (!modal) return;
  const bw = modal.offsetWidth - modal.clientWidth;
  const bh = modal.offsetHeight - modal.clientHeight;
  modal.style.setProperty('--modal-w', `${width + bw}px`);
  modal.style.setProperty('--modal-h', `${height + bh}px`);
}

/**
 * Fits the dialog to `contentRef` (a direct child of the body): natural width
 * capped at `maxWidth`, then the height that width needs.
 */
export function useFitToContent(contentRef, standalone, maxWidth, deps) {
  const fit = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const dlg = el.closest('.dlg');
    const body = el.closest('.dlg-body');
    const prev = el.style.width;
    el.style.width = 'max-content';
    const w = Math.ceil(Math.min(maxWidth, el.offsetWidth));
    el.style.width = `${w}px`;
    const h = Math.ceil(el.offsetHeight);
    el.style.width = prev;
    const cs = getComputedStyle(body);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    applyDialogSize(dlg, w + padX + (dlg.offsetWidth - body.clientWidth), h + padY + (dlg.offsetHeight - body.clientHeight), standalone);
  }, [contentRef, standalone, maxWidth]);

  useLayoutEffect(fit, [fit, ...deps]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  }, [fit]);
}
