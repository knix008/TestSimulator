export const TAB_WIDTH = 148;

export function layoutTabScroller(start, count, viewportWidth, tabWidth = TAB_WIDTH) {
  const width = Math.max(tabWidth, Number(viewportWidth) || tabWidth);
  const visible = Math.max(1, Math.floor(width / tabWidth));
  const maxStart = Math.max(0, count - visible);
  const next = Math.min(Math.max(0, start), maxStart);
  return {
    start: next,
    visible,
    maxStart,
    showPrev: next > 0,
    showNext: next < maxStart,
    overflow: "hidden",
    scrollbar: false,
  };
}
