// Every dialog opens as a separate OS window (its own title bar, taskbar entry
// and icon). If the host refuses to open one — a browser popup blocker, mainly —
// it degrades to the in-page modal it used to be.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { canOpenPopupWindow, PopupWindow } from './PopupWindow';

interface Props {
  title: string;
  /** Shown at the left of the title bar, like a native window icon. */
  icon?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  onOk?: () => void;
  okLabel?: string;
  cancelLabel?: string;
  /** Hide the footer entirely (dialogs that supply their own actions). */
  hideFooter?: boolean;
  width?: number;
  /**
   * Content height for the separate window. Set it large enough that the body
   * does not scroll; the window is resizable either way.
   */
  height?: number;
  extraActions?: ReactNode;
}

export function Dialog({
  title,
  icon,
  children,
  onClose,
  onOk,
  okLabel,
  cancelLabel,
  hideFooter,
  width = 480,
  height = 520,
  extraActions,
}: Props) {
  const t = useT();
  const [popupFailed, setPopupFailed] = useState(false);
  const useWindow = canOpenPopupWindow() && !popupFailed;

  const body = (
    <div className="dialog-window">
      <div className="dialog-title">
        {icon && <span className="dialog-title-icon">{icon}</span>}
        <span className="dialog-title-text">{title}</span>
      </div>
      <div className="dialog-body">{children}</div>
      {!hideFooter && (
        <div className="dialog-footer">
          {extraActions}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {cancelLabel ?? t('BtnCancel')}
          </button>
          {onOk && (
            <button className="btn btn-primary" onClick={onOk}>
              {okLabel ?? t('BtnOk')}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (useWindow) {
    return (
      <PopupWindow
        title={title}
        width={width}
        height={height}
        onClose={onClose}
        onBlocked={() => setPopupFailed(true)}
      >
        <DialogFocus>{body}</DialogFocus>
      </PopupWindow>
    );
  }

  return <InPageDialog width={width} onClose={onClose}>{body}</InPageDialog>;
}

/** Move focus to the first control so the keyboard works immediately. */
function DialogFocus({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focusable = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    focusable?.focus();
  }, []);
  return <div ref={ref} className="dialog-focus">{children}</div>;
}

function InPageDialog({
  width,
  onClose,
  children,
}: {
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button',
    );
    focusable?.focus();
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width }} ref={panelRef} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
