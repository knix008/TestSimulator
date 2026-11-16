import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons.jsx';
import { api } from '../lib/platform.js';
import { openPopout, measure, fitPopoutTo } from '../lib/popout.js';

// Shared modal shell: dimmed backdrop, Escape to close, focus trapped inside,
// and an optional footer. Every dialog in the app is built on it so they all
// behave identically.
//
// With `windowName` the dialog opens in a window of its own (the print dialog):
// no backdrop, moved by its header, free to leave the program's window. On the
// desktop the main window is disabled while it is open, as the backdrop did;
// on the web it is a browser pop-up. Where no window can be opened (tests, a
// blocked pop-up) it stays an in-page dialog.
//
// With `fixedSize` ({ width, height }) the dialog always has exactly that size,
// whatever its content does; the window never follows the content.
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

function WindowedModal({ windowName, width = 560, fixedSize = null, title, onClose, ...rest }) {
  const [host, setHost] = useState(undefined);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const size = fixedSize || { width: typeof width === 'number' ? width : 560, height: 600 };
    const pop = openPopout(`dialog-${windowName}`, {
      ...size,
      rootClass: 'popout-dialog',
      title: typeof title === 'string' ? `${title} — MyPDFViewer` : 'MyPDFViewer',
    });
    if (!pop) { setHost(null); return undefined; }
    setHost(pop);
    let gone = false;
    // The window was closed some other way (Alt+F4, the browser's own ×): drop the dialog state.
    const off = pop.web ? null : api?.win?.onPopoutClosed?.((label) => {
      if (label === pop.label) { gone = true; closeRef.current?.(); }
    });
    const onGone = () => { if (!gone) { gone = true; closeRef.current?.(); } };
    if (pop.web) pop.win.addEventListener('pagehide', onGone);
    // A pop-up must not outlive the page that drives it.
    const onPageGone = () => pop.close();
    window.addEventListener('pagehide', onPageGone);
    return () => {
      off?.();
      window.removeEventListener('pagehide', onPageGone);
      if (pop.web) pop.win.removeEventListener('pagehide', onGone);
      pop.stop();
      if (!gone) { gone = true; pop.close(); }
    };
    // The window lives as long as the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowName]);

  if (host === undefined) return null;
  if (host === null) return <InPageModal width={width} fixedSize={fixedSize} title={title} onClose={onClose} {...rest} />;
  return createPortal(
    <ModalPanel width={width} fixedSize={fixedSize} title={title} onClose={onClose} host={host} {...rest} />,
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
  fixedSize = null,
  className = '',
  closeLabel = 'Close',
  host = null,
}) {
  const panelRef = useRef(null);
  const shown = useRef(false);

  // A dialog window is sized to the dialog once it has laid out, then shown.
  useLayoutEffect(() => {
    if (!host || shown.current) return undefined;
    let cancelled = false;
    let last = '';
    const size = () => (fixedSize ? { ...fixedSize } : measure(panelRef.current));
    const fit = () => {
      if (cancelled || !panelRef.current) return;
      shown.current = true;
      const want = size();
      last = `${want.width}x${want.height}`;
      fitPopoutTo(host, want, { modal: true, activate: true }).catch(() => {});
    };
    // Give the copied stylesheets and fonts a moment before measuring.
    const doc = host.win.document;
    const t = setTimeout(() => { (doc.fonts?.ready || Promise.resolve()).then(fit, fit); }, 60);
    // A dialog without a fixed size follows its content (fonts, lists filled in).
    let follow = null;
    if (!fixedSize) {
      const Observer = host.win.ResizeObserver || ResizeObserver;
      follow = new Observer(() => {
        if (!shown.current || !panelRef.current) return;
        const want = measure(panelRef.current);
        const key = `${want.width}x${want.height}`;
        if (key === last) return;
        last = key;
        fitPopoutTo(host, want, { resizeOnly: true }).catch(() => {});
      });
      if (panelRef.current) follow.observe(panelRef.current);
    }
    return () => { cancelled = true; clearTimeout(t); follow?.disconnect(); };
  }, [host, fixedSize]);

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

  const style = { '--modal-width': typeof width === 'number' ? `${width}px` : width };
  if (fixedSize) {
    style['--modal-width'] = `${fixedSize.width}px`;
    style.height = `${fixedSize.height}px`;
  }

  return (
    <div
      className={`modal${fixedSize ? ' fixed-size' : ''}${host ? ' in-window' : ''}${className ? ` ${className}` : ''}`}
      style={style}
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
