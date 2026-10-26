// Dockable panels: left (navigation), right (세부 정보 inspector) and bottom
// (tabs). Each can be turned off from the toolbar, folded to a strip (icon +
// vertical title, or a header bar for the bottom one) and resized with a
// splitter. The right panel is a portal target: views render their detail
// content with <Inspector> and it lands there; with the right panel off the
// content stays inline next to the list as before.
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { t, useLanguage } from '../lib/i18n';
import { Icon, CloseButton } from './Chrome';
import { TabActiveCtx } from './DocTabs';

export const DEFAULT_PANELS = {
  left: { on: true, folded: false, w: 212 },
  right: { on: true, folded: false, w: 340 },
  bottom: { on: false, folded: false, h: 200, tab: 'problems' },
};
export const PANEL_LIMITS = { left: [150, 380], right: [260, 620], bottom: [110, 600] };

export function panelsOf(settings) {
  const p = (settings && settings.panels) || {};
  return {
    left: { ...DEFAULT_PANELS.left, ...(p.left || {}) },
    right: { ...DEFAULT_PANELS.right, ...(p.right || {}) },
    bottom: { ...DEFAULT_PANELS.bottom, ...(p.bottom || {}) },
  };
}

export const PanelCtx = createContext({ rightEl: null, rightOn: false, rightActive: false });

/** True when list views should take the full width (details go to the right panel). */
export function useRightActive() {
  return !!useContext(PanelCtx).rightOn;
}

/**
 * Detail content of the current view. Right panel open: rendered there.
 * Right panel off: rendered inline as the old drawer (inline=false: not at all).
 */
export function Inspector({ children, revealKey }) {
  const ctx = useContext(PanelCtx);
  const tabActive = useContext(TabActiveCtx);
  // A new selection opens the right panel (turned on and unfolded).
  useEffect(() => { if (tabActive && revealKey != null && revealKey !== '' && ctx.reveal) ctx.reveal(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [revealKey]);
  if (!tabActive) return null;
  if (ctx.rightOn) {
    if (!ctx.rightActive || !ctx.rightEl) return null;
    return createPortal(<div className="drawer inspector">{children}</div>, ctx.rightEl);
  }
  return null;
}

/** Drag handle between panels. axis 'x' (width) or 'y' (height); dir +1/-1 is the growing direction. */
export function Splitter({ axis, dir = 1, value, min, max, onChange, onCommit, label }) {
  const start = useRef(null);
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start.current = { p: axis === 'x' ? e.clientX : e.clientY, v: value };
    let last = value;
    const move = (ev) => {
      const d = ((axis === 'x' ? ev.clientX : ev.clientY) - start.current.p) * dir;
      last = Math.max(min, Math.min(max, Math.round(start.current.v + d)));
      onChange(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing-x', 'resizing-y');
      onCommit(last);
    };
    document.body.classList.add(axis === 'x' ? 'resizing-x' : 'resizing-y');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const key = (e) => {
    const step = e.shiftKey ? 40 : 10;
    const grow = axis === 'x' ? (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) : (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
    if (!grow) return;
    e.preventDefault();
    const v = Math.max(min, Math.min(max, value + grow * dir * step));
    onChange(v);
    onCommit(v);
  };
  return <div className={`splitter splitter-${axis}`} role="separator" tabIndex={0} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-label={label} title={label} onPointerDown={down} onKeyDown={key} />;
}

/** A left or right panel: header with fold / close, or the folded strip. */
export function DockPanel({ side, title, icon, folded, width, onFold, onClose, strip, actions, children, bodyRef }) {
  useLanguage();
  if (folded) {
    return (
      <div className={`dock-strip dock-${side}`} data-tour={side === 'left' ? 'nav-strip' : 'right-panel-strip'}>
        <button type="button" className="strip-open" title={`${title} — ${t('pn_unfold')}`} aria-label={`${title} — ${t('pn_unfold')}`} onClick={() => onFold(false)}>
          <Icon name={side === 'left' ? 'chevronRight' : 'chevronLeft'} size={13} />
          <Icon name={icon} size={16} />
          <span className="strip-title">{title}</span>
        </button>
        {strip}
      </div>
    );
  }
  return (
    <div className={`dock dock-${side}`} data-tour={side === 'left' ? 'nav' : 'right-panel'} style={{ width }}>
      <div className="dock-head">
        <Icon name={icon} size={14} /><strong>{title}</strong>
        <span className="spacer" />
        {actions}
        <button type="button" className="icon-btn" title={t('pn_fold')} aria-label={t('pn_fold')} onClick={() => onFold(true)}><Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={14} /></button>
        <CloseButton title={t('pn_close')} aria-label={t('pn_close')} onClick={onClose} size={13} />
      </div>
      <div className="dock-body" ref={bodyRef}>{children}</div>
    </div>
  );
}
