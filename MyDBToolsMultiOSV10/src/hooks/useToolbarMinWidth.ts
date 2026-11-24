// Keep the window from ever being narrow enough to clip a toolbar button.
//
// The toolbar is a single non-wrapping row, so the app has a hard minimum width:
// the sum of its controls. That total is not a constant — it changes with the
// UI language, the selected theme name and the platform's font metrics — so it
// is measured from the live DOM rather than hard-coded.
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { getHost } from '../platform';

/** Never demand a window wider than this, whatever the measurement says. */
const MAX_MIN_WIDTH = 2200;
const FLOOR_MIN_WIDTH = 640;

/**
 * The width the toolbar would like to have, which is not the width it currently
 * has.
 *
 * Adding up the children as they stand measures them *after* flexbox has
 * squeezed them, so once the window is a little too narrow the measurement
 * comes back short, the minimum is set too low, and the toolbar can never get
 * its space back — the last buttons stay clipped. Laying the row out at
 * `max-content` with the elastic spacer collapsed asks for the natural width
 * instead, which is the number the window minimum actually needs.
 */
function measureRequiredWidth(row: HTMLElement): number {
  const spacers = Array.from(row.querySelectorAll<HTMLElement>(':scope > .tb-spacer, :scope > .menu-spacer'));
  const previousWidth = row.style.width;
  const previousFlex = spacers.map((s) => s.style.flex);

  for (const spacer of spacers) spacer.style.flex = '0 0 0px';
  row.style.width = 'max-content';
  // Reading scrollWidth here forces the layout, so the value is the settled one.
  const natural = row.scrollWidth;
  row.style.width = previousWidth;
  spacers.forEach((spacer, i) => (spacer.style.flex = previousFlex[i]));

  // Room between the left and right groups, and a few pixels of slack so
  // sub-pixel rounding never clips the last button.
  return Math.ceil(natural + 24);
}

/**
 * The rows that must never be cut: the toolbar, and the menu bar above it, which
 * now also carries the app's name and the window buttons.
 */
function rowsToKeepWhole(toolbar: HTMLElement): HTMLElement[] {
  const menubar = toolbar.ownerDocument.querySelector<HTMLElement>('.app > .menubar');
  return menubar ? [toolbar, menubar] : [toolbar];
}

export function useToolbarMinWidth(toolbarRef: RefObject<HTMLElement | null>, deps: unknown[]): void {
  const lastApplied = useRef(0);

  const apply = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const required = Math.min(
      MAX_MIN_WIDTH,
      Math.max(FLOOR_MIN_WIDTH, ...rowsToKeepWhole(toolbar).map(measureRequiredWidth)),
    );
    // Only a real change counts: labels that change by a few pixels (the zoom
    // percentage, a theme name) must never reach the window.
    if (Math.abs(required - lastApplied.current) < 12) return;
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
    if (toolbarRef.current) for (const row of rowsToKeepWhole(toolbarRef.current)) observer.observe(row);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      observer.disconnect();
    };
    // `deps` re-measures on language/theme changes, which resize the labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, ...deps]);
}
