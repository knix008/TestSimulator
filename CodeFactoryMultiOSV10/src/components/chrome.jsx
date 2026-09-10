// Window chrome: the app's own minimize/maximize/close controls, dialogs that
// behave like real windows (icon + label in the title bar, draggable,
// optionally resizable), and the right-click context menu.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconMinimize, IconMaximize, IconRestore, IconClose } from './icons.jsx';

/* --------------------------------------------------- window control strip */

/**
 * Minimize / maximize / close. Rendered only where the app owns its frame —
 * in a browser tab the OS chrome is not ours to control, so nothing is drawn.
 */
export function WindowControls({ controls }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!controls || !controls.available) return undefined;
    let alive = true;
    controls.isMaximized().then((value) => {
      if (alive) setMaximized(!!value);
    });
    const unsubscribe = controls.onMaximizedChange ? controls.onMaximizedChange((value) => setMaximized(!!value)) : null;
    return () => {
      alive = false;
      if (unsubscribe) unsubscribe();
    };
  }, [controls]);

  if (!controls || !controls.available) return null;

  return (
    <div className="window-controls">
      <button type="button" className="win-btn" title={t('window.minimize')} aria-label={t('window.minimize')} onClick={() => controls.minimize()}>
        <IconMinimize size={12} />
      </button>
      <button
        type="button"
        className="win-btn"
        title={maximized ? t('window.restore') : t('window.maximize')}
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
        onClick={async () => setMaximized(!!(await controls.toggleMaximize()))}
      >
        {maximized ? <IconRestore size={12} /> : <IconMaximize size={12} />}
      </button>
      <button type="button" className="win-btn close" title={t('window.close')} aria-label={t('window.close')} onClick={() => controls.close()}>
        <IconClose size={12} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ AppDialog */

/**
 * A dialog that behaves like a separate window: its title bar carries the same
 * icon and label the menu entry used, it can be dragged anywhere on screen, and
 * (with `resizable`) dragged bigger — which is how a settings panel avoids ever
 * needing an inner scrollbar.
 */
export function AppDialog({
  title,
  icon: TitleIcon,
  onClose,
  children,
  footer,
  width = 880,
  height = null,
  minWidth = 420,
  minHeight = 260,
  resizable = false,
  autoFit = false,
  bodyClassName,
  // True when this dialog already *is* an OS window: no backdrop, no floating
  // box, and the title bar becomes the window's drag region instead of moving a
  // div around inside the page.
  standalone = false,
}) {
  const { t } = useTranslation();
  const [box, setBox] = useState(null);
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const drag = useRef(null);
  const userSized = useRef(false);

  // Centre on first paint, clamped to the viewport so a large dialog opened on
  // a small screen still shows its title bar and buttons.
  useLayoutEffect(() => {
    if (standalone) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 32);
    const h = Math.min(height || Math.round(vh * 0.82), vh - 32);
    setBox({ x: Math.max(16, (vw - w) / 2), y: Math.max(16, (vh - h) / 2), width: w, height: h });
  }, [width, height, standalone]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startDrag = (e, mode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, box: { ...box } };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    const start = drag.current.box;

    if (drag.current.mode === 'move') {
      setBox({
        ...start,
        x: Math.min(window.innerWidth - 80, Math.max(-start.width + 120, start.x + dx)),
        y: Math.min(window.innerHeight - 40, Math.max(0, start.y + dy)),
      });
      return;
    }

    setBox({
      ...start,
      width: Math.max(minWidth, Math.min(window.innerWidth - start.x - 8, start.width + dx)),
      height: Math.max(minHeight, Math.min(window.innerHeight - start.y - 8, start.height + dy)),
    });
  };

  const endDrag = (e) => {
    if (drag.current && drag.current.mode === 'resize') userSized.current = true;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* already released */ }
  };

  // Grow the window until its content fits, so a settings panel shows every
  // option at once instead of hiding half of them behind a scrollbar. Runs on
  // every content change, and stops as soon as the user resizes by hand.
  useLayoutEffect(() => {
    if (standalone || !autoFit || !box || userSized.current) return;
    const body = bodyRef.current;
    if (!body) return;

    const overflow = body.scrollHeight - body.clientHeight;
    if (overflow <= 1) return;

    const maxHeight = window.innerHeight - 32;
    const nextHeight = Math.min(maxHeight, box.height + overflow + 2);
    if (nextHeight <= box.height + 1) return;

    setBox((prev) => ({
      ...prev,
      height: nextHeight,
      y: Math.max(16, Math.min(prev.y, window.innerHeight - nextHeight - 16)),
    }));
  });

  if (standalone) {
    return (
      <div className="app-window standalone" role="dialog" aria-label={title}>
        <div className="app-window-title drag-region">
          {TitleIcon ? (
            <span className="title-icon">
              <TitleIcon size={16} />
            </span>
          ) : null}
          <span className="title-label">{title}</span>
          <span className="title-spacer" />
          <button type="button" className="win-btn close" title={t('common.close')} aria-label={t('common.close')} onClick={onClose}>
            <IconClose size={12} />
          </button>
        </div>
        <div className={'app-window-body' + (bodyClassName ? ' ' + bodyClassName : '')} ref={bodyRef}>
          {children}
        </div>
        {footer ? <div className="app-window-footer">{footer}</div> : null}
      </div>
    );
  }

  if (!box) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="app-window"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      >
        <div
          className="app-window-title"
          onPointerDown={(e) => startDrag(e, 'move')}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setBox({ x: 16, y: 16, width: window.innerWidth - 32, height: window.innerHeight - 32 })}
        >
          {TitleIcon ? (
            <span className="title-icon">
              <TitleIcon size={16} />
            </span>
          ) : null}
          <span className="title-label">{title}</span>
          <span className="title-spacer" />
          <button type="button" className="win-btn close" title={t('common.close')} aria-label={t('common.close')} onClick={onClose}>
            <IconClose size={12} />
          </button>
        </div>

        <div className={'app-window-body' + (bodyClassName ? ' ' + bodyClassName : '')} ref={bodyRef}>
          {children}
        </div>

        {footer ? <div className="app-window-footer">{footer}</div> : null}

        {resizable ? (
          <div
            className="resize-grip"
            title={t('window.resize')}
            onPointerDown={(e) => startDrag(e, 'resize')}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M13 5L5 13M13 9l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- ContextMenu */

/**
 * Right-click menu. `items` is the same shape the menu bar uses —
 * `{label, icon, action, disabled, checked}` or the string `'-'` for a rule.
 */
export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ x, y });

  // Flip the menu back inside the viewport if it would overflow.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      x: x + rect.width > window.innerWidth ? Math.max(4, window.innerWidth - rect.width - 6) : x,
      y: y + rect.height > window.innerHeight ? Math.max(4, window.innerHeight - rect.height - 6) : y,
    });
  }, [x, y, items]);

  useEffect(() => {
    const dismiss = () => onClose();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', dismiss);
    window.addEventListener('contextmenu', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('contextmenu', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="menu-popup context-menu"
      ref={ref}
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {items.map((item, index) =>
        item === '-' ? (
          <div className="menu-separator" key={'sep' + index} />
        ) : (
          <button
            key={item.label + index}
            type="button"
            className="menu-item"
            role="menuitem"
            disabled={item.disabled}
            title={item.hint || item.label}
            onClick={() => {
              onClose();
              item.action();
            }}
          >
            <span className="menu-item-icon">{item.icon ? <item.icon size={14} /> : null}</span>
            <span className="menu-item-label">{item.label}</span>
            {item.hint ? <span className="hint">{item.hint}</span> : null}
            {item.checked ? <span className="hint">✓</span> : null}
          </button>
        ),
      )}
    </div>
  );
}

/** Hook that wires a right-click handler to a `<ContextMenu>`. */
export function useContextMenu() {
  const [menu, setMenu] = useState(null);

  const open = useCallback((event, items) => {
    if (!items || items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  return { menu, open, close };
}
