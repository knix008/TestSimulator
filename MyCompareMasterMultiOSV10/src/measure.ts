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
  return rowMinimumWidth(toolbar, ["toolbar-spacer"]);
}

/**
 * The natural width of a one-line row of groups (the toolbar, the menu bar): the sum
 * of what each child needs, plus gaps and padding. A child is measured by its content
 * (`scrollWidth`) as well as its box, because a group that is already squeezed
 * reports the squeezed width — which is exactly the case being prevented.
 */
export function rowMinimumWidth(row: Element, stretchy: string[]): number {
  const style = getComputedStyle(row);
  const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
  const children = ([...row.children] as HTMLElement[]).filter((child) => getComputedStyle(child).display !== "none");

  let width = (Number.parseFloat(style.paddingLeft) || 0)
    + (Number.parseFloat(style.paddingRight) || 0)
    + gap * Math.max(0, children.length - 1);

  for (const child of children) {
    // A spacer is the one element that stretches; it only needs breathing room.
    if (stretchy.some((name) => child.classList.contains(name))) {
      width += 8;
      continue;
    }
    const childStyle = getComputedStyle(child);
    const margins = (Number.parseFloat(childStyle.marginLeft) || 0) + (Number.parseFloat(childStyle.marginRight) || 0);
    width += Math.max(child.getBoundingClientRect().width, child.scrollWidth) + margins;
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
  menubar: Element | null = null,
): number {
  const forToolbar = toolbar ? toolbarMinimumWidth(toolbar) : 0;
  const forMenubar = menubar ? rowMinimumWidth(menubar, ["menubar-drag"]) : 0;
  const forPanels = panels.left + panels.right + MIN_WORKSPACE;
  return Math.max(forToolbar, forMenubar, forPanels);
}
