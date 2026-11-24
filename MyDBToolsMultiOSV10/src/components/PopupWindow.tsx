// Renders children into a real, separate OS window.
//
// Desktop (Tauri): window.open("about:blank#dialog-<n>") or "#print-<n>" asks the
// shell (src-tauri/src/popout.rs) for a frameless window owned by the main one.
// Its document belongs to this page — same origin, same JavaScript context — so
// React renders into it with a portal and every handler and piece of state stays
// where it was. The window starts hidden; once the content is measured the shell
// sizes it, centres it over the main window and shows it.
//
// Browser: window.open gives an ordinary popup, which sizes itself with resizeTo.
//
// Either way the document starts empty, so the opener's stylesheets are copied in
// and kept in sync — including the theme variables, which live on <html>.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getHost } from '../platform';

export type PopupKind = 'dialog' | 'print';

export interface PopupWindowProps {
  title: string;
  width: number;
  height: number;
  children: ReactNode;
  /** The user closed the window. */
  onClose: () => void;
  /** The host refused to open a window (popup blocker); render in-page instead. */
  onBlocked: () => void;
  /**
   * `dialog` (default): sized to its content, modal, not resizable.
   * `print`: opens at width x height, resizable, the main window stays usable.
   */
  kind?: PopupKind;
}

let popupCounter = 0;

/** Copy every <style> and <link rel=stylesheet> into `doc` and keep them in step. */
function mirrorStyles(doc: Document): () => void {
  const base = doc.createElement('base');
  base.href = document.baseURI;
  doc.head.appendChild(base);
  const copy = () => {
    for (const node of Array.from(doc.head.querySelectorAll('[data-mirror]'))) node.remove();
    for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
      const clone = node.cloneNode(true) as HTMLElement;
      if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
      clone.setAttribute('data-mirror', '');
      doc.head.appendChild(clone);
    }
  };
  copy();
  // Vite's hot style updates replace <style> elements in the opener.
  const observer = new MutationObserver(copy);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
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

/** The dialog's natural size: what it needs without scrolling. */
function measureDialog(doc: Document, width: number): { width: number; height: number } | null {
  const bodyEl = doc.querySelector<HTMLElement>('.dialog-body');
  if (!bodyEl) return null;
  // The body is a flex child stretched to fill the window, so its scrollHeight
  // would let the window grow but never shrink. Drop the stretch to read the
  // content's natural height, then put it straight back.
  const previousFlex = bodyEl.style.flex;
  bodyEl.style.flex = '0 0 auto';
  const naturalBodyH = bodyEl.scrollHeight;
  bodyEl.style.flex = previousFlex;
  const titleH = doc.querySelector<HTMLElement>('.dialog-title')?.offsetHeight ?? 0;
  const footerH = doc.querySelector<HTMLElement>('.dialog-footer')?.offsetHeight ?? 0;
  return { width, height: Math.ceil(titleH + naturalBodyH + footerH + 2) };
}

async function setPopupTitle(label: string, title: string): Promise<void> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = await WebviewWindow.getByLabel(label);
    await win?.setTitle(title);
  } catch {
    /* the taskbar keeps the app's name */
  }
}

export function PopupWindow({
  title,
  width,
  height,
  children,
  onClose,
  onBlocked,
  kind = 'dialog',
}: PopupWindowProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const popupRef = useRef<Window | null>(null);
  const labelRef = useRef<string>('');
  const closedByUs = useRef(false);
  const desktop = getHost().kind === 'desktop';
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Centre on the opener so a browser popup does not land in a corner.
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
    const label = `${kind}-${++popupCounter}`;
    labelRef.current = label;
    let popup: Window | null = null;
    try {
      popup = window.open(desktop ? `about:blank#${label}` : '', '', features);
    } catch {
      popup = null;
    }
    if (!popup || !popup.document) {
      // Popup blocked (browser). The caller falls back to an in-page dialog.
      onBlocked();
      return;
    }
    popupRef.current = popup;

    const doc = popup.document;
    if (desktop) {
      doc.open();
      doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
      doc.close();
    }
    doc.title = title;
    const stopStyles = mirrorStyles(doc);
    syncThemeVariables(doc);
    doc.documentElement.classList.add('popup-document', `popup-${kind}`);
    if (desktop) {
      doc.documentElement.classList.add('desktop');
      void setPopupTitle(label, title);
    }

    const mount = doc.createElement('div');
    mount.className = 'popup-root';
    doc.body.appendChild(mount);
    setContainer(mount);

    const closeFromWindow = () => {
      if (closedByUs.current) return;
      // The window is being torn down right now. Telling React about it here
      // would unmount the portal into a document that is halfway gone, and the
      // exception that throws takes the whole app down with it. Let the unload
      // finish, then react to it.
      closedByUs.current = true;
      setTimeout(() => onCloseRef.current(), 0);
    };
    popup.addEventListener('beforeunload', closeFromWindow);
    const stopClosed = getHost().onPopoutClosed?.((closed) => {
      if (closed === label) closeFromWindow();
    });

    // Escape closes, matching the in-page dialog behaviour.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    doc.addEventListener('keydown', handleKeyDown);

    // Closing the main window must not orphan the dialog.
    const closeOnOpenerUnload = () => {
      closedByUs.current = true;
      popup?.close();
    };
    window.addEventListener('beforeunload', closeOnOpenerUnload);

    return () => {
      closedByUs.current = true;
      window.removeEventListener('beforeunload', closeOnOpenerUnload);
      stopClosed?.();
      stopStyles();
      // Everything below reaches into a window that may already be gone —
      // which is exactly the case this cleanup runs in most often.
      try {
        popup?.removeEventListener('beforeunload', closeFromWindow);
        doc.removeEventListener('keydown', handleKeyDown);
      } catch {
        /* already torn down */
      }
      if (desktop) {
        void import('@tauri-apps/api/core').then(({ invoke }) => invoke('popout_close', { label }));
      } else {
        try {
          if (popup && !popup.closed) popup.close();
        } catch {
          /* already closed by the OS */
        }
      }
    };
    // Opened once per dialog instance; `title` updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup || popup.closed) return;
    popup.document.title = title;
    if (desktop && labelRef.current) void setPopupTitle(labelRef.current, title);
  }, [title, desktop]);

  // Size the window to the content, so a dialog never scrolls. Measuring beats
  // hard-coded heights: the same dialog is taller in Korean than in English, and
  // platform font metrics differ.
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup || popup.closed || !container) return;
    const doc = popup.document;
    let shown = false;
    let pad = { w: 0, h: 0 };
    let busy = false;
    let again = false;

    const showDesktop = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      const { invoke } = await import('@tauri-apps/api/core');
      const label = labelRef.current;
      const want = kind === 'print' ? { width, height } : measureDialog(doc, width);
      if (want) {
        const ask = (resizeOnly: boolean) =>
          invoke('popout_show', {
            opts: { label, width: want.width + pad.w, height: want.height + pad.h, resizeOnly, modal: kind === 'dialog' },
          });
        await ask(shown);
        shown = true;
        // Frameless windows can come out a caption's height off what was asked;
        // compare the viewport with the content and ask again with the difference.
        for (let i = 0; i < 2; i++) {
          await new Promise((r) => setTimeout(r, 60));
          if (popup.closed) break;
          const dw = want.width - popup.innerWidth;
          const dh = want.height - popup.innerHeight;
          if (Math.abs(dw) < 1 && Math.abs(dh) < 1) break;
          pad = { w: pad.w + dw, h: pad.h + dh };
          await ask(true);
        }
      }
      busy = false;
      if (again) {
        again = false;
        void showDesktop();
      }
    };

    const fitBrowser = () => {
      if (popup.closed) return;
      const want = measureDialog(doc, width);
      if (!want) return;
      const chromeH = Math.max(0, popup.outerHeight - popup.innerHeight);
      const chromeW = Math.max(0, popup.outerWidth - popup.innerWidth);
      const targetH = Math.min(want.height + chromeH, (popup.screen.availHeight || 1080) - 60);
      const targetW = Math.min(width + chromeW, (popup.screen.availWidth || 1920) - 60);
      if (Math.abs(popup.outerHeight - targetH) > 2 || Math.abs(popup.outerWidth - targetW) > 2) {
        popup.resizeTo(Math.round(targetW), Math.round(targetH));
      }
    };

    const fit = () => {
      if (desktop) {
        // The print window keeps the size the user gives it after it opens.
        if (kind === 'print' && shown) return;
        void showDesktop();
      } else if (kind === 'dialog') {
        fitBrowser();
      }
    };

    // Let layout settle (fonts, copied stylesheets) before measuring.
    const raf = popup.requestAnimationFrame(() => popup.requestAnimationFrame(fit));
    const settle = popup.setTimeout(fit, 150);
    // Re-fit when the content changes — a validation message, a longer label
    // after switching language, a field that depends on the type.
    const observer = new MutationObserver(() => fit());
    if (kind === 'dialog') observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      try {
        popup.cancelAnimationFrame(raf);
        popup.clearTimeout(settle);
      } catch {
        /* window gone */
      }
      observer.disconnect();
    };
  }, [container, width, height, kind, desktop]);

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

/** The window this element lives in (a pop-out's own, or the main one). */
export function ownerWindow(node: Node | null | undefined): Window {
  return node?.ownerDocument?.defaultView ?? window;
}

/** True when a separate window can realistically be opened. */
export function canOpenPopupWindow(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.open === 'function';
  } catch {
    return false;
  }
}
