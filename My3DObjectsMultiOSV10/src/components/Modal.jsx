import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons.jsx';
import { api } from '../lib/platform.js';
import { openPopout, measure, fitPopout } from '../lib/popout.js';

// Shared modal shell: dimmed backdrop, Escape to close, focus trapped inside,
// and an optional footer. Every dialog in the app is built on it so they all
// behave identically.
//
// With `windowName` the dialog opens on the desktop in a window of its own
// (Settings, About): no backdrop, moved by its header, free to leave the
// program's window. The main window is disabled while it is open, as the
// backdrop did. In the browser it stays an in-page dialog.
export default function Modal(props) {
  const { open, windowName } = props;
  if (!open) return null;
  if (windowName) return <WindowedModal {...props} />;
  return <InPageModal {...props} />;
}

function InPageModal({ onClose, closeOnBackdrop = true, ...rest }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose?.(); }}
    >
      <ModalPanel onClose={onClose} {...rest} />
    </div>
  );
}

// The dialog in its own window. Falls back to the in-page dialog when no
// window can be opened (the web build, tests).
function WindowedModal({ windowName, width = 560, onClose, ...rest }) {
  const [host, setHost] = useState(undefined);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const pop = openPopout(`dialog-${windowName}`, {
      width: typeof width === 'number' ? width : 560,
      height: 600,
      rootClass: 'popout-dialog',
    });
    if (!pop) { setHost(null); return undefined; }
    setHost(pop);
    // Alt+F4 (or anything else) closed the window: drop the dialog state.
    const off = api?.win?.onPopoutClosed?.((label) => {
      if (label === pop.label) closeRef.current?.();
    });
    return () => {
      off?.();
      pop.stop();
      api.win.popoutClose(pop.label).catch(() => {});
    };
    // The window lives as long as the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowName]);

  if (host === undefined) return null;
  if (host === null) return <InPageModal width={width} onClose={onClose} {...rest} />;
  return createPortal(
    <ModalPanel width={width} onClose={onClose} host={host} {...rest} />,
    host.root,
  );
}

function ModalPanel({
  title,
  icon: Icon,
  onClose,
  children,
  footer,
  width = 560,
  className = '',
  closeLabel = 'Close',
  host = null,
}) {
  const panelRef = useRef(null);
  const shown = useRef(false);

  // A pop-out window is sized to the dialog once it has laid out, then shown.
  useLayoutEffect(() => {
    if (!host || shown.current) return undefined;
    let cancelled = false;
    let last = '';
    const fit = () => {
      if (cancelled || !panelRef.current) return;
      shown.current = true;
      const { width: w, height: h } = measure(panelRef.current);
      last = `${w}x${h}`;
      fitPopout(host, panelRef.current, { modal: true, activate: true }).catch(() => {});
    };
    // Give the copied stylesheets and fonts a moment before measuring.
    const doc = host.win.document;
    const t = setTimeout(() => { (doc.fonts?.ready || Promise.resolve()).then(fit, fit); }, 60);
    // Content that settles later (fonts, lists filled in) resizes the window
    // with it, where it is; the first measurement was too tall otherwise.
    const Observer = host.win.ResizeObserver || ResizeObserver;
    const follow = new Observer(() => {
      if (!shown.current || !panelRef.current) return;
      const { width: w, height: h } = measure(panelRef.current);
      const key = `${w}x${h}`;
      if (key === last) return;
      last = key;
      fitPopout(host, panelRef.current, { resizeOnly: true }).catch(() => {});
    });
    if (panelRef.current) follow.observe(panelRef.current);
    return () => { cancelled = true; clearTimeout(t); follow.disconnect(); };
  }, [host]);

  useEffect(() => {
    const doc = host ? host.win.document : document;
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
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    doc.addEventListener('keydown', onKey, true);
    // Move focus into the dialog so Escape and Tab work immediately.
    const t = setTimeout(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]')
        || panelRef.current?.querySelector('button, input, select, textarea');
      target?.focus();
    }, host ? 160 : 30);
    return () => {
      doc.removeEventListener('keydown', onKey, true);
      clearTimeout(t);
    };
  }, [onClose, host]);

  return (
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
  );
}
