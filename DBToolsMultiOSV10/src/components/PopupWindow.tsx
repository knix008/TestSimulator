// Renders children into a real, separate OS window.
//
// `window.open` gives a genuine top-level window in both hosts: Electron turns
// it into a BrowserWindow with its own title bar and taskbar entry, and the
// browser opens a popup. The document starts empty, so the opener's stylesheets
// are cloned in and kept in sync — that includes the runtime theme variables,
// which live on the opener's <html> element.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface PopupWindowProps {
  title: string;
  width: number;
  height: number;
  children: ReactNode;
  /** The user closed the window. */
  onClose: () => void;
  /** The host refused to open a window (popup blocker); render in-page instead. */
  onBlocked: () => void;
}

/** Copy every <style> and <link rel=stylesheet> from the opener into `doc`. */
function cloneStyles(doc: Document): void {
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    doc.head.appendChild(node.cloneNode(true));
  }
}

/** Mirror the theme custom properties, which are set inline on <html>. */
function syncThemeVariables(doc: Document): void {
  const source = document.documentElement;
  const target = doc.documentElement;
  target.setAttribute('style', source.getAttribute('style') ?? '');
  if (source.dataset.theme) target.dataset.theme = source.dataset.theme;
  if (source.dataset.themeKind) target.dataset.themeKind = source.dataset.themeKind;
  target.lang = source.lang;
}

export function PopupWindow({
  title,
  width,
  height,
  children,
  onClose,
  onBlocked,
}: PopupWindowProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const popupRef = useRef<Window | null>(null);
  const closedByUs = useRef(false);

  // Centre on the opener so the window does not land in a corner.
  const features = useMemo(() => {
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    return [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'resizable=yes',
      'scrollbars=yes',
    ].join(',');
  }, [width, height]);

  useEffect(() => {
    const popup = window.open('', '', features);
    if (!popup) {
      // Popup blocked (browser). The caller falls back to an in-page dialog.
      onBlocked();
      return;
    }
    popupRef.current = popup;

    const doc = popup.document;
    doc.title = title;
    cloneStyles(doc);
    syncThemeVariables(doc);

    const mount = doc.createElement('div');
    mount.className = 'popup-root';
    doc.body.appendChild(mount);
    setContainer(mount);

    const handleUnload = () => {
      if (closedByUs.current) return;
      // The window is being torn down right now. Telling React about it here
      // would have it unmount the portal into a document that is halfway gone,
      // and the exception that throws takes the whole app down with it — the
      // main window goes blank. Let the unload finish, then react to it.
      closedByUs.current = true;
      setTimeout(onClose, 0);
    };
    popup.addEventListener('beforeunload', handleUnload);

    // Escape closes, matching the in-page dialog behaviour.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    doc.addEventListener('keydown', handleKeyDown);

    // Closing the main window must not orphan the dialog.
    const closeOnOpenerUnload = () => {
      closedByUs.current = true;
      popup.close();
    };
    window.addEventListener('beforeunload', closeOnOpenerUnload);

    return () => {
      closedByUs.current = true;
      window.removeEventListener('beforeunload', closeOnOpenerUnload);
      // Everything below reaches into a window that may already be gone —
      // which is exactly the case this cleanup runs in most often.
      try {
        popup.removeEventListener('beforeunload', handleUnload);
        doc.removeEventListener('keydown', handleKeyDown);
        if (!popup.closed) popup.close();
      } catch {
        // Already torn down by the OS; nothing left to clean up.
      }
    };
    // Opened once per dialog instance; `title` updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (popupRef.current && !popupRef.current.closed) popupRef.current.document.title = title;
  }, [title]);

  // Grow the window to whatever the content needs, so dialogs never scroll.
  // Measuring beats hard-coded heights: the same dialog is taller in Korean than
  // in English, and platform font metrics differ.
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup || popup.closed || !container) return;

    const fit = () => {
      if (popup.closed) return;
      const doc = popup.document;
      const bodyEl = doc.querySelector<HTMLElement>('.dialog-body');
      if (!bodyEl) return;

      // The body is a flex child, so it is stretched to fill the window and its
      // scrollHeight reports that stretched size — which would let the window
      // grow but never shrink. Drop the stretch for the measurement to read the
      // content's natural height, then put it straight back.
      const previousFlex = bodyEl.style.flex;
      bodyEl.style.flex = '0 0 auto';
      const naturalBodyH = bodyEl.scrollHeight;
      bodyEl.style.flex = previousFlex;

      const titleH = doc.querySelector<HTMLElement>('.dialog-title')?.offsetHeight ?? 0;
      const footerH = doc.querySelector<HTMLElement>('.dialog-footer')?.offsetHeight ?? 0;
      const needed = titleH + naturalBodyH + footerH + 2;

      // Chrome = OS title bar + borders; innerHeight excludes it.
      const chromeH = Math.max(0, popup.outerHeight - popup.innerHeight);
      const chromeW = Math.max(0, popup.outerWidth - popup.innerWidth);
      const targetH = Math.min(needed + chromeH, (popup.screen.availHeight || 1080) - 60);
      const targetW = Math.min(width + chromeW, (popup.screen.availWidth || 1920) - 60);

      if (Math.abs(popup.outerHeight - targetH) > 2 || Math.abs(popup.outerWidth - targetW) > 2) {
        popup.resizeTo(Math.round(targetW), Math.round(targetH));
      }
    };

    // Let layout settle (fonts, cloned stylesheets) before measuring.
    const raf = popup.requestAnimationFrame(() => popup.requestAnimationFrame(fit));
    const settle = popup.setTimeout(fit, 150);
    // Re-fit when the content changes — a validation message, a longer label
    // after switching language, a type-dependent field appearing.
    const observer = new MutationObserver(() => fit());
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      popup.cancelAnimationFrame(raf);
      popup.clearTimeout(settle);
      observer.disconnect();
    };
  }, [container, width]);

  // Keep the popup on the opener's theme while it is open.
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup || popup.closed) return;
    const observer = new MutationObserver(() => {
      if (!popup.closed) syncThemeVariables(popup.document);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme', 'data-theme-kind', 'lang'],
    });
    return () => observer.disconnect();
  }, [container]);

  return container ? createPortal(children, container) : null;
}

/** True when a separate window can realistically be opened. */
export function canOpenPopupWindow(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.open === 'function';
  } catch {
    return false;
  }
}
