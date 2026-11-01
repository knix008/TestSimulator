// Hand panning: press the left button on a spot that is neither text nor a
// picture and drag the zoomed page around, the way a hand tool would.
//
// Only offered while the content is bigger than the pane. At a fitted zoom a
// press on empty page space keeps doing what it always did (clear the text
// selection, drop the picked picture), and a continuous document that merely
// has more pages below does not count as "bigger" — the scrollbar and the
// wheel already cover that.

// Pointer travel below which a pan press is still treated as a click.
export const PAN_CLICK_SLOP = 3;

// How close (CSS px) a press has to be to a run of text to count as "on the
// text". A little slack keeps a press just left of the first glyph a selection.
export const TEXT_HIT_PAD = 3;

// True when the pane can actually be panned: the sheet is wider than the pane,
// or one of its pages is taller than it.
export function canPanView({ scrollWidth = 0, clientWidth = 0, clientHeight = 0 } = {}, pageHeights = []) {
  if (scrollWidth > clientWidth + 1) return true;
  for (const h of pageHeights) if (h > clientHeight + 1) return true;
  return false;
}

// Where the pane scrolls to for a pointer that has moved from the press point.
// Dragging right reveals what is on the left, so the offset is subtracted.
export function panScrollTo(start, clientX, clientY) {
  return {
    left: start.scrollLeft - (clientX - start.x),
    top: start.scrollTop - (clientY - start.y),
  };
}

export function panMoved(start, clientX, clientY, slop = PAN_CLICK_SLOP) {
  return Math.abs(clientX - start.x) > slop || Math.abs(clientY - start.y) > slop;
}

// Is there a run of text under (x, y)? The text layer covers the whole page,
// so hit-testing the layer itself says nothing; its spans have to be checked.
export function textAtPoint(layer, x, y, pad = TEXT_HIT_PAD) {
  if (!layer) return false;
  for (const span of layer.querySelectorAll('span')) {
    if (span.classList.contains('markedContent') || !span.textContent) continue;
    const r = span.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return true;
  }
  return false;
}

// Things a press must keep reaching even when the pane can pan.
const INTERACTIVE = 'a, button, input, select, textarea, .page-nav, .comment-card';

// A press outside every page (the grey around and between the sheets) pans.
// Presses inside a page are decided by the page itself, which knows where its
// text and pictures are.
export function isBackgroundPanTarget(target) {
  if (!target?.closest) return false;
  if (target.closest(INTERACTIVE)) return false;
  return !target.closest('.page');
}

// The pane's own scrollbars report the pane as the target; a press there must
// keep driving the scrollbar.
export function onScrollbar(el, clientX, clientY) {
  const box = el.getBoundingClientRect();
  const gutterX = Math.max(0, (el.offsetWidth - el.clientWidth) / 2);
  const x = clientX - box.left;
  const y = clientY - box.top;
  return x < gutterX || x > gutterX + el.clientWidth || y > el.clientHeight;
}
