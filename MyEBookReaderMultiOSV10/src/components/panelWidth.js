import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PANEL_WIDTH_MAX, PANEL_WIDTH_MIN } from '../lib/settings.js';

// How narrow a side panel is allowed to get.
//
// A constant cannot answer that: the tab strip says 목차 · 서재 · 책갈피 · 찾기 in
// Korean and Contents · Library · Bookmarks · Find in English, in whatever UI
// font and size the reader chose, so the width those buttons need changes with
// the settings. The same problem as the toolbar's minimum window width, and the
// same answer: measure what is there and let the measurement decide.
//
// The panel therefore never clips its own controls, whether the width came from
// the settings file, from dragging the divider, or from a change of language.

/** The minimum for a panel whose controls measure `contentWidth` pixels. */
export function panelMinWidth(contentWidth, floor = PANEL_WIDTH_MIN) {
  const measured = Number(contentWidth);
  if (!Number.isFinite(measured) || measured <= 0) return floor;
  return Math.min(PANEL_WIDTH_MAX, Math.max(floor, Math.ceil(measured)));
}

/** Keeps a width inside [min, PANEL_WIDTH_MAX]. */
export function clampToPanelMin(width, min) {
  const value = Number(width);
  const low = panelMinWidth(min);
  if (!Number.isFinite(value)) return low;
  return Math.min(PANEL_WIDTH_MAX, Math.max(low, Math.round(value)));
}

/**
 * Measures a row of equal-width controls and reports the width below which one
 * of them would be cut off.
 *
 * The tabs are `flex: 1` items, which means they share the row equally however
 * long their labels are: the row needs as much as the *widest* tab, times the
 * number of tabs — not the sum of their contents. Summing was the first thing
 * tried here and it read 239px for a strip that clips 책갈피 at 242px.
 *
 * Measuring means undoing the squeeze for the length of one frame: each item is
 * allowed to size to its content, the row is read, and everything is put back
 * before the browser paints.
 */
export function usePanelMinWidth(headRef, deps = []) {
  const [min, setMin] = useState(PANEL_WIDTH_MIN);
  const frame = useRef(0);

  const measure = useCallback(() => {
    const head = headRef.current;
    if (!head) return;
    const items = [...head.children];
    if (!items.length) return;

    const style = getComputedStyle(head);
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const gap = (parseFloat(style.columnGap) || 0) * (items.length - 1);

    const wasWidth = head.style.width;
    const wasFlex = items.map((item) => item.style.flex);
    head.style.width = 'max-content';
    items.forEach((item) => { item.style.flex = '0 0 auto'; });

    let widest = 0;
    let total = 0;
    for (const item of items) {
      const width = item.getBoundingClientRect().width;
      widest = Math.max(widest, width);
      total += width;
    }

    head.style.width = wasWidth;
    items.forEach((item, n) => { item.style.flex = wasFlex[n]; });

    // Equal shares: every tab gets as much as the widest one needs.
    const natural = Math.max(widest * items.length, total) + padding + gap;
    setMin(panelMinWidth(Math.ceil(natural) + 2));
  }, [headRef]);

  useLayoutEffect(() => {
    measure();
    // Fonts arrive after the first paint and change every label's width.
    frame.current = requestAnimationFrame(measure);
    const settle = setTimeout(measure, 120);
    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  useEffect(() => {
    if (typeof ResizeObserver !== 'function') return undefined;
    const head = headRef.current;
    if (!head) return undefined;
    const observer = new ResizeObserver(() => measure());
    // The document element, because a change of UI font size resizes every
    // label at once without the panel itself changing.
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [headRef, measure]);

  return min;
}
