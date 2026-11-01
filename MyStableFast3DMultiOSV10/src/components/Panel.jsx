import React, { useCallback, useRef } from 'react';
import { IconPanelLeftClose, IconPanelLeftOpen, IconPanelRightClose, IconPanelRightOpen } from './Icons.jsx';
import { clampPanelWidth } from '../lib/settings.js';

// A resizable side panel (the left input panel, the right settings panel),
// after V20's info panel: a header, a scrolling body, a splitter on the inner
// edge, and — closed — a narrow strip with its icon and title that opens it
// again on a click.
export default function Panel({
  side = 'right', open, width, onResize, onOpen, onClose, icon: Icon, title, actions = null,
  expandLabel, collapseLabel, children, className = '',
}) {
  const drag = useRef(null);
  const sign = side === 'right' ? -1 : 1;

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-sidebar');
  }, [width]);

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return;
    onResize?.(clampPanelWidth(drag.current.w + sign * (e.clientX - drag.current.x), width));
  }, [onResize, sign, width]);

  const endDrag = useCallback((e) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
    document.body.classList.remove('resizing-sidebar');
  }, []);

  const OpenIcon = side === 'right' ? IconPanelRightOpen : IconPanelLeftOpen;
  const CloseIcon = side === 'right' ? IconPanelRightClose : IconPanelLeftClose;

  if (!open) {
    return (
      <aside className={`info-panel side-${side} collapsed ${className}`} aria-label={title}>
        <button type="button" className="info-strip" onClick={onOpen} title={expandLabel} aria-label={expandLabel} aria-expanded="false">
          <OpenIcon size={17} />
          {Icon ? <Icon size={17} /> : null}
          <span className="info-strip-title">{title}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={`info-panel side-${side} ${className}`} style={{ '--info-width': `${width}px` }} aria-label={title}>
      <div
        className="info-splitter"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onResize?.(clampPanelWidth(width - sign * 16, width));
          if (e.key === 'ArrowRight') onResize?.(clampPanelWidth(width + sign * 16, width));
        }}
      />
      <div className="info-main">
        <div className="side-head">
          {Icon ? <span className="side-head-icon"><Icon size={16} /></span> : null}
          <span className="side-head-title">{title}</span>
          <span className="side-head-actions">
            {actions}
            <button className="icon-btn side-head-action" onClick={onClose} title={collapseLabel} aria-label={collapseLabel}>
              <CloseIcon size={16} />
            </button>
          </span>
        </div>
        {children}
      </div>
    </aside>
  );
}
