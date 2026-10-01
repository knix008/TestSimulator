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
 * Measures a strip of controls and reports the width below which one of them
 * would be cut off.
 *
 * `stacked` says the strip runs down the panel rather than across it, which
 * changes the answer completely: stacked, each control has the whole width, so
 * the panel needs only as much as the widest one.
 *
 * `beside` is for a strip that stands *next to* the rest of the panel rather
 * than above it — a rail of tools down the left edge with the tool it opens on
 * its right. The strip's own width is then only half the question; the other
 * half is how little the thing beside it may be squeezed into.
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
export function usePanelMinWidth(headRef, deps = [], { stacked = false, beside = 0 } = {}) {
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

    // Side by side the tabs share the row equally, so it needs as much as the
    // widest one times how many there are. Stacked one above another they each
    // have the whole width to themselves, so it needs only the widest.
    const natural = stacked
      ? widest + padding
      : Math.max(widest * items.length, total) + padding + gap;
    setMin(panelMinWidth(Math.ceil(natural) + 2 + (Number(beside) || 0)));
  }, [headRef, stacked, beside]);

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

/**
 * How little room the tool beside the rail may be squeezed into.
 *
 * This used to be a constant, and a constant cannot answer it any better here
 * than it could for the rail: the tools carry rows of buttons — 폴더 열기,
 * 형광펜 표시, 목록 지우기 — whose labels are one length in Korean, another in
 * English, and longer again at a larger UI size. A row with less room than its
 * buttons need does not clip; it wraps, and the label comes out on two lines.
 * So the widest row of buttons on screen is measured, the same way the rail is,
 * and that is the floor.
 *
 * Only the tool that is open can be measured, so the widest seen so far is
 * kept: moving between tools raises the floor and never lowers it, which stops
 * the divider jumping about as the reader looks through them. It starts again
 * when `deps` change — a new language is a new set of labels.
 */
export function usePanelBodyMin(bodyRef, deps = [], floor = 150) {
  const [min, setMin] = useState(floor);
  const widest = useRef(floor);
  const frame = useRef(0);

  const measure = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const rows = [...body.querySelectorAll('.panel-actions')];
    if (!rows.length) return;
    const bodyStyle = getComputedStyle(body);
    const padding = (parseFloat(bodyStyle.paddingLeft) || 0) + (parseFloat(bodyStyle.paddingRight) || 0);

    let needed = 0;
    for (const row of rows) {
      const kids = [...row.children];
      if (!kids.length) continue;
      const rowStyle = getComputedStyle(row);
      const gap = (parseFloat(rowStyle.columnGap) || 0) * (kids.length - 1);
      const rowPad = (parseFloat(rowStyle.paddingLeft) || 0) + (parseFloat(rowStyle.paddingRight) || 0);

      // Undo the squeeze for the length of one frame: let the row and its
      // buttons size to their own content, read them, and put it all back
      // before the browser paints.
      const wasWidth = row.style.width;
      const wasWrap = row.style.flexWrap;
      const wasFlex = kids.map((kid) => kid.style.flex);
      const wasWhite = kids.map((kid) => kid.style.whiteSpace);
      row.style.width = 'max-content';
      row.style.flexWrap = 'nowrap';
      for (const kid of kids) { kid.style.flex = '0 0 auto'; kid.style.whiteSpace = 'nowrap'; }

      let total = 0;
      for (const kid of kids) total += kid.getBoundingClientRect().width;

      row.style.width = wasWidth;
      row.style.flexWrap = wasWrap;
      kids.forEach((kid, n) => { kid.style.flex = wasFlex[n]; kid.style.whiteSpace = wasWhite[n]; });

      needed = Math.max(needed, total + gap + rowPad);
    }
    if (needed <= 0) return;
    const want = Math.ceil(needed + padding) + 2;
    if (want <= widest.current) return;
    widest.current = want;
    setMin(want);
  }, [bodyRef]);

  useLayoutEffect(() => {
    widest.current = floor;
    setMin(floor);
    measure();
    // Fonts arrive after the first paint and change every label's width.
    frame.current = requestAnimationFrame(measure);
    const settle = setTimeout(measure, 120);
    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, floor, ...deps]);

  return min;
}
