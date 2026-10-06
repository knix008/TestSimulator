import { MIN_WORKSPACE } from "../core/settings.js";

/**
 * The toolbar's natural width — the width below which one of its buttons would be
 * clipped.
 *
 * It is computed by adding up the groups rather than read from `scrollWidth`, because
 * the toolbar contains a flexible spacer: its scroll width is simply however wide the
 * window happens to be, and feeding that back in as a minimum width makes the window
 * grow a little every time it is measured.
 *
 * Shared with the GUI test, which asserts that the minimum the main process applied
 * really does cover this.
 */
export function toolbarMinimumWidth(toolbar: Element): number {
  const style = getComputedStyle(toolbar);
  const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
  const children = [...toolbar.children] as HTMLElement[];

  let width = (Number.parseFloat(style.paddingLeft) || 0)
    + (Number.parseFloat(style.paddingRight) || 0)
    + gap * Math.max(0, children.length - 1);

  for (const child of children) {
    // The spacer is the one element that stretches; it only needs breathing room.
    width += child.classList.contains("toolbar-spacer") ? 8 : child.getBoundingClientRect().width;
  }

  return Math.ceil(width) + 8;
}

/**
 * The window's minimum width: wide enough for the whole toolbar, and wide enough for
 * the side panels plus a usable comparison between them.
 *
 * The panels only appear on a merge tab, but the floor is computed as though they
 * were always there. Otherwise opening a merge would widen the window under the
 * user's hands, and closing it would strand them at a width they never chose.
 */
export function windowMinimumWidth(
  toolbar: Element | null,
  panels: { left: number; right: number },
): number {
  const forToolbar = toolbar ? toolbarMinimumWidth(toolbar) : 0;
  const forPanels = panels.left + panels.right + MIN_WORKSPACE;
  return Math.max(forToolbar, forPanels);
}
