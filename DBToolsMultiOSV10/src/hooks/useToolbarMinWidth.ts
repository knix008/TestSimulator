// Keep the window from ever being narrow enough to clip a toolbar button.
//
// The toolbar is a single non-wrapping row, so the app has a hard minimum width:
// the sum of its controls. That total is not a constant — it changes with the
// UI language, the selected theme name and the platform's font metrics — so it
// is measured from the live DOM rather than hard-coded.
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { getHost } from '../platform';

/** Never demand a window wider than this, whatever the measurement says. */
const MAX_MIN_WIDTH = 1600;
const FLOOR_MIN_WIDTH = 640;

function measureRequiredWidth(toolbar: HTMLElement): number {
  const style = getComputedStyle(toolbar);
  const padding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
  const gap = parseFloat(style.columnGap || style.gap || '0') || 0;

  let content = 0;
  let counted = 0;
  for (const child of Array.from(toolbar.children) as HTMLElement[]) {
    // The spacer is elastic — it is allowed to collapse to nothing.
    if (child.classList.contains('tb-spacer')) continue;
    content += child.getBoundingClientRect().width;
    counted++;
  }

  const gaps = gap * Math.max(0, toolbar.children.length - 1);
  // A few pixels of slack so a sub-pixel rounding never clips the last button.
  return Math.ceil(content + padding + gaps + 8);
}

export function useToolbarMinWidth(toolbarRef: RefObject<HTMLElement | null>, deps: unknown[]): void {
  const lastApplied = useRef(0);

  const apply = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const required = Math.min(
      MAX_MIN_WIDTH,
      Math.max(FLOOR_MIN_WIDTH, measureRequiredWidth(toolbar)),
    );
    if (Math.abs(required - lastApplied.current) < 2) return;
    lastApplied.current = required;

    // Browsers cannot resize their own window, but a min-width on the document
    // turns "clipped buttons" into an honest horizontal scrollbar.
    document.body.style.minWidth = `${required}px`;

    const host = getHost() as { setMinimumWidth?: (width: number) => void };
    host.setMinimumWidth?.(required);
  }, [toolbarRef]);

  useEffect(() => {
    // Fonts can land after first paint and change every label's width.
    const raf = requestAnimationFrame(() => requestAnimationFrame(apply));
    const timer = window.setTimeout(apply, 250);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready?.then(apply).catch(() => {});

    const observer = new ResizeObserver(apply);
    if (toolbarRef.current) observer.observe(toolbarRef.current);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      observer.disconnect();
    };
    // `deps` re-measures on language/theme changes, which resize the labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, ...deps]);
}
